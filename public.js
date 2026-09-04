// =====================================================================
// PUBLIC.JS — Logic for the public-facing pages (home, gallery, finances
// overview, events/RSVP, membership join form, contact form, notices, etc).
// Requires common.js to be loaded first.
// =====================================================================

import { GITHUB_IMAGES_PATH, GITHUB_OWNER, GITHUB_REPO, compressImageFile, escapeHtml, fetchAndRenderFinances, generateCaptchaCode, parseStoredEventDate, renderCaptchaCanvas, showPage, supabaseClient } from './common.js';

  let IMAGE_DATA = [];
  let slideIndex = 1;
  let slideTimer;

  // Startup work that used to live in common.js's shared init block, but only
  // this portal needs it.
  document.addEventListener('app:init', function() {
    fetchAndRenderFinances();
    fetchCountdownEvents().then(() => {
      setInterval(updateHomepageCountdown, 1000);
    });
    refreshContactCaptcha();
    wireContactForm();
    loadPublicMembers();
    loadImages();
  });

  // Fires after common.js's showPage() switches to a page this portal owns.
  document.addEventListener('page:shown', function(e) {
    const name = e.detail.name;
    if (name === 'finances') fetchAndRenderFinances();
    if (name === 'magazine') loadMagazine();
    if (name === 'members') { loadPublicMembers(); loadCommitteeCards(); }
    if (name === 'emergency') loadEmergencyContacts();
    if (name === 'events') loadRsvpEventOptions();
  });

  // Fires after an application is approved/rejected/deleted anywhere.
  document.addEventListener('membership:changed', function() {
    loadPublicMembers();
  });


  // --- INDIVIDUAL MEMBER LOOKUP & AUTOMATED 12-MONTH CALENDAR REFLECTION ---

  export async function loadLookupMembersDropdown() {
    const select = document.getElementById('lookupMemberSelect');
    if (!select) return;
    try {
      const { data, error } = await supabaseClient.from('members_directory').select('name').order('name', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        select.innerHTML = '<option value="">No members found</option>';
        return;
      }
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
      select.innerHTML = '<option value="">Select your name from directory</option>' + sorted.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    } catch (err) {
      select.innerHTML = '<option value="">Error loading directory</option>';
    }
  }


  async function checkIndividualMemberStatus() {
    const memberName = document.getElementById('lookupMemberSelect').value;
    const card = document.getElementById('individualMemberResultCard');
    const nameEl = document.getElementById('lookupResultName');
    const detailsEl = document.getElementById('lookupResultDetails');

    if (!memberName) {
      card.style.display = 'none';
      return;
    }

    nameEl.textContent = memberName;
    detailsEl.innerHTML = 'Checking payment records...';
    card.style.display = 'block';

    const monthsList = ["April", "May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March"];
    const fyYear = "2026-2027";
    const defaultAmount = 25;

    try {
      const { data, error } = await supabaseClient
        .from('member_donations')
        .select('*')
        .eq('member_name', memberName);

      if (error) throw error;

      let paidMonthsMap = {};
      if (data) {
        data.forEach(d => {
          if (d.status && d.status.includes('Paid')) {
            paidMonthsMap[d.month] = d;
          }
        });
      }

      let html = '<table class="gb-table"><thead><tr><th>FY Year</th><th>Month</th><th>Amount</th><th>Status</th><th>Action / Payment Option</th></tr></thead><tbody>';
      
      monthsList.forEach(m => {
        let record = paidMonthsMap[m];
        let isPaid = !!record;
        let amount = record ? record.amount : defaultAmount;
        let statusText = isPaid ? record.status : 'Due';

        html += `<tr>
          <td><strong>${fyYear}</strong></td>
          <td>${m}</td>
          <td>₹${amount}</td>
          <td><span style="color:${isPaid ? 'var(--leaf)' : 'var(--sindoor)'}; font-weight:bold;">${statusText} ${isPaid ? '✓' : '⚠️'}</span></td>
          <td>
            ${isPaid 
              ? `<button onclick="downloadSinglePdfReceipt('${fyYear}', '${m}', '${escapeHtml(memberName)}', '${amount}')" style="padding:4px 10px; background:var(--marigold); color:var(--indigo); border:none; border-radius:4px; font-size:11px; cursor:pointer;"><i class="fas fa-file-pdf"></i> Download Receipt</button>`
              : `<div style="display:flex; gap:4px; flex-wrap:wrap;">
                   <a href="upi://pay?pa=8972217940m@pnb&pn=Dihibaliharpur%20Tarun%20Sangha&cu=INR&am=${amount}&tn=Club%20Dues%20${m}" target="_blank" style="padding:4px 8px; background:#27ae60; color:#fff; border-radius:4px; font-size:10.5px; text-decoration:none;"><i class="fas fa-qrcode"></i> Pay Online</a>
                   <button onclick="promptCashPayment('${escapeHtml(memberName)}', '${m}', '${amount}')" style="padding:4px 8px; background:var(--clay); color:#fff; border:none; border-radius:4px; font-size:10.5px; cursor:pointer;"><i class="fas fa-hand-holding-usd"></i> Pay Cash</button>
                 </div>`
            }
          </td>
        </tr>`;
      });
      html += '</tbody></table>';
      detailsEl.innerHTML = html;

    } catch (err) {
      detailsEl.innerHTML = `<span style="color:var(--sindoor);">Error fetching status: ${err.message}</span>`;
    }
  }


  function promptCashPayment(member, month, amount) {
    alert(`Cash Payment Notice:\n\nDear ${member},\nPlease deposit the cash amount of ₹${amount} for ${month} directly to the Treasurer (Mr. Sandip Roy / Club Office).\n\nYour payment status will be updated to 'Paid' by the Treasurer in the admin panel shortly.`);
  }


  // --- PUBLIC EVENT RSVP SUBMISSION ---

  function previewApplicantPhoto(input) {
    const slot = document.getElementById('applicantPhotoSlot');
    const placeholder = document.getElementById('applicantPhotoPlaceholder');
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = e => { slot.src = e.target.result; slot.style.display = 'block'; placeholder.style.display = 'none'; };
      reader.readAsDataURL(input.files[0]);
    }
  }


  async function submitMembershipApplication(event) {
    event.preventDefault();
    const btn = document.getElementById('appSubmitBtn');
    const status = document.getElementById('appSubmitStatus');
    const fileInput = document.getElementById('applicantPhotoInput');

    const originalText = btn.textContent;
    btn.textContent = 'SUBMITTING...';
    btn.disabled = true;
    status.style.display = 'none';

    const contactNumber = document.getElementById('appContact').value.trim();

    try {
      const { data: existing, error: checkError } = await supabaseClient
        .from('membership_applications')
        .select('id, status')
        .eq('contact_number', contactNumber)
        .in('status', ['pending', 'approved']);
      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        status.style.display = 'block';
        status.style.background = 'rgba(224,162,51,0.15)';
        status.style.color = 'var(--clay)';
        status.textContent = existing[0].status === 'approved'
          ? "This phone number is already registered as a member. If this is a mistake, please contact the club office."
          : "An application from this phone number is already pending review. No need to submit again — the club will get back to you.";
        return;
      }

      let photo_url = null;
      if (fileInput.files && fileInput.files[0]) {
        const file = await compressImageFile(fileInput.files[0]);
        const fileExt = file.name.split('.').pop();
        const safeName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
        const filePath = `membership-photos/${Date.now()}_${safeName}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage.from('club_files').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabaseClient.storage.from('club_files').getPublicUrl(filePath);
        photo_url = publicUrlData.publicUrl;
      }

      const payload = {
        full_name: document.getElementById('appFullName').value.trim(),
        dob: document.getElementById('appDob').value || null,
        contact_number: document.getElementById('appContact').value.trim(),
        aadhaar_number: document.getElementById('appAadhaar').value.trim() || null,
        blood_group: document.getElementById('appBloodGroup').value || null,
        occupation: document.getElementById('appOccupation').value.trim() || null,
        country: document.getElementById('appCountry').value.trim() || null,
        state: document.getElementById('appState').value.trim() || null,
        district: document.getElementById('appDistrict').value.trim() || null,
        block_municipality: document.getElementById('appBlock').value.trim() || null,
        village_ward: document.getElementById('appVillage').value.trim(),
        pin_code: document.getElementById('appPin').value.trim(),
        photo_url: photo_url,
        status: 'pending'
      };

      const { error } = await supabaseClient.from('membership_applications').insert([payload]);
      if (error) throw error;

      status.style.display = 'block';
      status.style.background = 'rgba(51,85,63,0.12)';
      status.style.color = 'var(--leaf)';
      status.textContent = "Thank you! Your application has been submitted for review. You can still Save & Print a copy below to bring in person with your signed ID card.";
    } catch (err) {
      status.style.display = 'block';
      status.style.background = 'rgba(181,41,46,0.12)';
      status.style.color = 'var(--sindoor)';
      status.textContent = "Error submitting application: " + err.message;
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }


  export async function loadRsvpEventOptions() {
    const select = document.getElementById('rsvpEventTitle');
    if (!select) return;
    try {
      const { data, error } = await supabaseClient.from('club_events').select('title, event_date').order('event_date', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        select.innerHTML = '<option value="">No upcoming events scheduled</option>';
        return;
      }
      select.innerHTML = '<option value="">Select an event</option>' + data.map(ev => `<option value="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</option>`).join('');
    } catch (err) {
      select.innerHTML = '<option value="">Error loading events</option>';
    }
  }


  async function loadRsvpHeadcount() {
    const title = document.getElementById('rsvpEventTitle').value;
    const note = document.getElementById('rsvpHeadcountNote');
    if (!title) { note.style.display = 'none'; return; }
    try {
      const { data, error } = await supabaseClient.from('event_rsvps').select('guests').eq('event_title', title);
      if (error) throw error;
      const total = (data || []).reduce((sum, r) => sum + (r.guests || 0), 0);
      if (total > 0) {
        note.textContent = `🎉 ${total} ${total === 1 ? 'person has' : 'people have'} already RSVP'd for this event`;
        note.style.display = 'block';
      } else {
        note.style.display = 'none';
      }
    } catch (err) {
      note.style.display = 'none';
    }
  }


  async function handlePublicRsvp(event) {
    event.preventDefault();
    const title = document.getElementById('rsvpEventTitle').value.trim();
    const name = document.getElementById('rsvpName').value.trim();
    const phone = document.getElementById('rsvpPhone').value.trim();
    const guests = parseInt(document.getElementById('rsvpGuests').value);
    const status = document.getElementById('rsvpStatus');
    const btn = document.getElementById('rsvpBtn');

    btn.textContent = "SUBMITTING...";
    btn.disabled = true;
    status.style.display = 'none';

    try {
      const { data: existing, error: checkError } = await supabaseClient
        .from('event_rsvps')
        .select('id')
        .eq('event_title', title)
        .eq('phone', phone);
      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        status.style.display = 'block';
        status.style.background = 'rgba(224,162,51,0.15)';
        status.style.color = 'var(--clay)';
        status.textContent = "This phone number has already RSVP'd for this event. If you need to change your attendee count, please contact the club office directly.";
        return;
      }

      const { error } = await supabaseClient.from('event_rsvps').insert([
        { event_title: title, attendee_name: name, phone: phone, guests: guests }
      ]);
      if (error) throw error;

      status.style.display = 'block';
      status.style.background = 'rgba(51,85,63,0.12)';
      status.style.color = 'var(--leaf)';
      status.textContent = "Thank you! Your RSVP has been recorded successfully.";
      event.target.reset();
      loadRsvpHeadcount();
    } catch (err) {
      status.style.display = 'block';
      status.style.background = 'rgba(181,41,46,0.12)';
      status.style.color = 'var(--sindoor)';
      status.textContent = "Error saving RSVP: " + err.message;
    } finally {
      btn.textContent = "SUBMIT RSVP";
      btn.disabled = false;
    }
  }


  let contactCaptchaCode = '';

  export function refreshContactCaptcha() {
    contactCaptchaCode = generateCaptchaCode();
    renderCaptchaCanvas('contactCaptchaBox', contactCaptchaCode);
    const input = document.getElementById('contactCaptchaInput');
    if (input) input.value = '';
  }


  export function wireContactForm() {
    const form = document.getElementById('queryForm');
    if (!form) return;
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      const btn = document.getElementById('queryBtn');
      const status = document.getElementById('queryStatus');
      const name = document.getElementById('queryName').value.trim();
      const contact = document.getElementById('queryContact').value.trim();
      const message = document.getElementById('queryMessage').value.trim();
      const captchaInput = document.getElementById('contactCaptchaInput').value.trim();

      status.style.display = 'none';

      if (captchaInput !== contactCaptchaCode) {
        status.style.display = 'block';
        status.style.background = 'rgba(181,41,46,0.12)';
        status.style.color = 'var(--sindoor)';
        status.textContent = 'Incorrect security code. Please try again.';
        refreshContactCaptcha();
        return;
      }

      const originalBtnText = btn.textContent;
      btn.textContent = 'SENDING...';
      btn.disabled = true;

      try {
        const { error: dbError } = await supabaseClient
          .from('contact_queries')
          .insert([{ name: name, contact_info: contact, message: message }]);
        
        if (dbError) throw dbError;

        await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'Accept': 'application/json' }
        });

        status.style.display = 'block';
        status.style.background = 'rgba(51,85,63,0.12)';
        status.style.color = 'var(--leaf)';
        status.textContent = "Thank you — your query has been sent and saved successfully. We'll get back to you soon.";
        form.reset();
        refreshContactCaptcha();
      } catch (err) {
        status.style.display = 'block';
        status.style.background = 'rgba(181,41,46,0.12)';
        status.style.color = 'var(--sindoor)';
        status.textContent = "Error sending message: " + err.message;
      } finally {
        btn.textContent = originalBtnText;
        btn.disabled = false;
      }
    });
  }


  let dynamicEventsList = [];
  let lastCountdownImageKey = null;


  export async function fetchCountdownEvents() {
    try {
      const { data, error } = await supabaseClient
        .from('club_events')
        .select('*')
        .order('id', { ascending: true });
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        dynamicEventsList = data;
      } else {
        dynamicEventsList = [{ title: "No events scheduled", event_date: new Date().toISOString() }];
      }
    } catch (err) {
      console.error("Could not fetch events:", err);
      dynamicEventsList = [{ title: "Loading Error", event_date: new Date().toISOString() }];
    }
  }


  export function updateHomepageCountdown() {
    if (dynamicEventsList.length === 0) return; 

    const now = new Date().getTime();
    
    let nextEvent = dynamicEventsList.find(ev => {
        const d = parseStoredEventDate(ev.event_date);
        return d && d.getTime() > now;
    });

    const titleEl = document.getElementById('countdownEventTitle');
    const dateBadge = document.getElementById('countdownDateBadge');
    const daysEl = document.getElementById('cdDays');
    const hoursEl = document.getElementById('cdHours');
    const minsEl = document.getElementById('cdMins');
    const secsEl = document.getElementById('cdSecs');
    const cardEl = document.getElementById('homeCountdownCard');

    if (!titleEl) return;

    if (!nextEvent) {
      titleEl.textContent = "All upcoming events completed!";
      if (dateBadge) dateBadge.textContent = "Stay Tuned";
      if (cardEl) cardEl.style.display = 'none';
      return;
    }

    titleEl.textContent = nextEvent.title;

    if (cardEl) {
      const imgKey = nextEvent.id + '::' + (nextEvent.image_url || '');
      if (imgKey !== lastCountdownImageKey) {
        lastCountdownImageKey = imgKey;
        if (nextEvent.image_url) {
          cardEl.style.backgroundImage = `linear-gradient(180deg, rgba(20,10,5,0.5) 0%, rgba(20,10,5,0.18) 45%, rgba(20,10,5,0.55) 100%), url('${nextEvent.image_url}')`;
          cardEl.style.backgroundSize = 'cover';
          cardEl.style.backgroundPosition = 'center';
          cardEl.classList.add('has-bg-image');
        } else {
          cardEl.style.backgroundImage = '';
          cardEl.classList.remove('has-bg-image');
        }
      }
    }
    
    const targetDateObj = parseStoredEventDate(nextEvent.event_date);
    const targetTime = targetDateObj ? targetDateObj.getTime() : 0;

    if (dateBadge) dateBadge.textContent = targetDateObj ? targetDateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    const diff = targetTime - now;
    if (diff <= 0) return;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
    if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
  }

  // --- SITE-WIDE SEARCH ---

  function openSiteSearch() {
    document.getElementById('siteSearchOverlay').classList.add('open');
    document.body.classList.add('nav-open-lock');
    setTimeout(() => document.getElementById('siteSearchInput').focus(), 50);
  }

  function closeSiteSearch() {
    document.getElementById('siteSearchOverlay').classList.remove('open');
    document.body.classList.remove('nav-open-lock');
  }


  let siteSearchDebounce = null;

  function handleSiteSearchInput() {
    clearTimeout(siteSearchDebounce);
    const query = document.getElementById('siteSearchInput').value.trim();
    const results = document.getElementById('siteSearchResults');
    if (query.length < 2) {
      results.innerHTML = '<p style="font-size:12.5px; color:#9a927c; padding:16px;">Keep typing (at least 2 characters)…</p>';
      return;
    }
    siteSearchDebounce = setTimeout(() => performSiteSearch(query), 300);
  }


  async function performSiteSearch(query) {
    const results = document.getElementById('siteSearchResults');
    results.innerHTML = '<p style="font-size:12.5px; color:#9a927c; padding:16px;">Searching…</p>';
    try {
      const like = `%${query}%`;
      const [membersRes, magazineRes, noticesRes] = await Promise.all([
        supabaseClient.from('members_directory_public').select('name, designation').or(`name.ilike.${like},designation.ilike.${like}`).limit(6),
        supabaseClient.from('magazine_posts').select('title, author, category').or(`title.ilike.${like},author.ilike.${like}`).limit(6),
        supabaseClient.from('notices').select('text, date').ilike('text', like).limit(6)
      ]);

      let html = '';

      if (membersRes.data && membersRes.data.length > 0) {
        html += '<div class="search-result-group-label">Members</div>';
        html += membersRes.data.map(m => `
          <a class="search-result-item" onclick="closeSiteSearch(); showPage('members');">
            <div class="search-result-title">${escapeHtml(m.name)}</div>
            <div class="search-result-sub">${escapeHtml(m.designation)}</div>
          </a>
        `).join('');
      }

      if (magazineRes.data && magazineRes.data.length > 0) {
        html += '<div class="search-result-group-label">Bibhas Magazine</div>';
        html += magazineRes.data.map(p => `
          <a class="search-result-item" onclick="closeSiteSearch(); showPage('magazine');">
            <div class="search-result-title">${escapeHtml(p.title)}</div>
            <div class="search-result-sub">By ${escapeHtml(p.author)} · ${escapeHtml(p.category || '')}</div>
          </a>
        `).join('');
      }

      if (noticesRes.data && noticesRes.data.length > 0) {
        html += '<div class="search-result-group-label">Notices</div>';
        html += noticesRes.data.map(n => `
          <a class="search-result-item" onclick="closeSiteSearch(); showPage('home');">
            <div class="search-result-title">${escapeHtml(n.text)}</div>
            <div class="search-result-sub">${escapeHtml(n.date || '')}</div>
          </a>
        `).join('');
      }

      if (!html) {
        html = '<p style="font-size:12.5px; color:#9a927c; padding:16px;">No results found.</p>';
      }
      results.innerHTML = html;
    } catch (err) {
      results.innerHTML = '<p style="font-size:12.5px; color:var(--sindoor); padding:16px;">Search error — please try again.</p>';
    }
  }


  // --- EXIT APP (only meaningful when installed as a PWA / Add to Home Screen) ---
  // Note: there's no universal, guaranteed "close the app" API on Android/iOS —
  // window.close() only works in specific browser contexts. This is a best-effort
  // attempt with a graceful fallback message.

  function printFinanceReport() {
    document.body.classList.add('print-finance-mode');
    window.print();
  }


  const IMAGE_CAPTIONS = {
    'krishna.jpg':     { title: 'Krishna, Flute in Hand', quote: 'Dancing beneath a peacock feather sky.' },
    'chandrayaan.jpg': { title: 'Chandrayaan-3', quote: 'A rocket bound for the moon, drawn for National Moon Day.' },
    'trishul.jpg':     { title: "The Trishul of Maa Durga", quote: 'Finished in a hand-drawn mandala.' },
    'village.jpg':     { title: 'Our Village', quote: 'Home — the huts, the trees, and the path that leads back to them.' },
    'durgaface.jpg':   { title: 'Maa Durga', quote: 'The fierce, watchful gaze of the goddess.' },
    'portrait.jpg':    { title: 'A Quiet Study', quote: 'A graphite portrait, drawn with a steady hand.', by: 'Anya Sudha Bora' }
  };


  export function formatImageTitle(filename){
    let name = filename.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '').replace(/[-_]+/g, ' ');
    return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }


  function openLightbox(idx){
    if (!IMAGE_DATA[idx]) return;
    document.getElementById('lightboxImg').src = IMAGE_DATA[idx].url;
    document.getElementById('lightbox').classList.add('active');
  }

  function closeLightbox(){ document.getElementById('lightbox').classList.remove('active'); }


  function renderSlideshow(images) {
    const container = document.getElementById('homeSlideshow');
    const dotsContainer = document.getElementById('homeSlideshowDots');
    
    if (!container) return;
    if (!images || images.length === 0) {
      container.innerHTML = '<p style="padding:20px; color:rgba(255,255,255,0.5); text-align:center;">No photos uploaded yet.</p>';
      return;
    }

    let slidesHTML = '';
    let dotsHTML = '';
    const slideImages = images.slice(0, 15);
    
    slideImages.forEach((img, idx) => {
      slidesHTML += `
        <div class="slide fade-anim" onclick="openLightbox(${idx})">
          <img src="${img.url}" alt="${img.title}" loading="lazy">
          <div class="slide-cap">${img.title}</div>
        </div>
      `;
      dotsHTML += `<span class="dot" onclick="currentSlide(${idx + 1})"></span>`;
    });

    slidesHTML += `
      <a class="slide-arrow prev" onclick="changeSlide(-1, event)">&#10094;</a>
      <a class="slide-arrow next" onclick="changeSlide(1, event)">&#10095;</a>
    `;

    container.innerHTML = slidesHTML;
    dotsContainer.innerHTML = dotsHTML;

    showSlides(slideIndex);
    startSlideTimer();
  }


  function changeSlide(n, event) {
    if(event) event.stopPropagation();
    showSlides(slideIndex += n);
    resetSlideTimer();
  }


  function currentSlide(n) {
    showSlides(slideIndex = n);
    resetSlideTimer();
  }


  function showSlides(n) {
    let slides = document.getElementsByClassName("slide");
    let dots = document.getElementsByClassName("dot");
    if (!slides.length) return;
    if (n > slides.length) {slideIndex = 1}
    if (n < 1) {slideIndex = slides.length}
    for (let i = 0; i < slides.length; i++) { slides[i].style.display = "none"; }
    for (let i = 0; i < dots.length; i++) { dots[i].className = dots[i].className.replace(" active", ""); }
    slides[slideIndex-1].style.display = "block";
    if(dots[slideIndex-1]) dots[slideIndex-1].className += " active";
  }


  function startSlideTimer() {
    slideTimer = setInterval(function(){ changeSlide(1) }, 4000);
  }

  function resetSlideTimer() {
    clearInterval(slideTimer);
    startSlideTimer();
  }


  export async function loadImages(){
    const galleryGrid = document.getElementById('galleryArtGrid');
    try {
      let allImages = [];

      try {
        const { data: sbFiles, error } = await supabaseClient
          .storage
          .from('club_files')
          .list('internal-photos', { limit: 100, sortBy: { column: 'name', order: 'desc' } });
        if (!error && sbFiles) {
          const sbImages = sbFiles.filter(file => file.name.match(/\.(jpeg|jpg|gif|png|webp)$/i));
          const formattedSb = sbImages.map(img => {
            const { data: publicUrlData } = supabaseClient.storage.from('club_files').getPublicUrl('internal-photos/' + img.name);
            return {
              url: publicUrlData.publicUrl,
              title: formatImageTitle(img.name),
              by: 'Member Upload',
              created_at: img.created_at || img.name
            };
          });
          allImages = [...allImages, ...formattedSb];
        }
      } catch (e) {}

      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_IMAGES_PATH}`);
        if (res.ok) {
          const files = await res.json();
          const imgFiles = Array.isArray(files) ? files.filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f.name)) : [];
          const ghImages = imgFiles.map(f => {
            const known = IMAGE_CAPTIONS[f.name.toLowerCase()];
            return {
              url: f.download_url,
              title: known ? known.title : formatImageTitle(f.name),
              quote: known ? known.quote : null,
              by: known ? known.by : null,
              created_at: f.name
            };
          });
          allImages = [...allImages, ...ghImages];
        }
      } catch (e) {}

      if (allImages.length === 0) {
        if (galleryGrid) galleryGrid.innerHTML = '<p style="font-size:13px; color:#9a927c;">No photos uploaded yet.</p>';
        if (document.getElementById('homeSlideshow')) document.getElementById('homeSlideshow').innerHTML = '<p style="padding:20px; color:rgba(255,255,255,0.5); text-align:center;">No photos uploaded yet.</p>';
        return;
      }

      IMAGE_DATA = allImages;
      renderSlideshow(IMAGE_DATA);

      galleryRenderedCount = 0;
      renderGalleryBatch();
    } catch (err) {
      if (document.getElementById('homeSlideshow')) document.getElementById('homeSlideshow').innerHTML = '<p style="padding:20px; color:rgba(255,255,255,0.5); text-align:center;">Couldn\'t load photos right now — please refresh.</p>';
      if (galleryGrid) galleryGrid.innerHTML = '<p style="font-size:13px; color:#9a927c;">Couldn\'t load gallery right now — please refresh.</p>';
    }
  }


  let galleryRenderedCount = 0;
  const GALLERY_BATCH_SIZE = 15;


  function renderGalleryBatch() {
    const galleryGrid = document.getElementById('galleryArtGrid');
    const loadMoreBtn = document.getElementById('galleryLoadMoreBtn');
    if (!galleryGrid) return;

    const nextBatch = IMAGE_DATA.slice(galleryRenderedCount, galleryRenderedCount + GALLERY_BATCH_SIZE);
    const html = nextBatch.map((img, localIdx) => {
      const globalIdx = galleryRenderedCount + localIdx;
      return `
        <div class="art-frame" onclick="openLightbox(${globalIdx})">
          <div class="ph-wrap"><img src="${img.url}" alt="${img.title}" loading="lazy"></div>
          <div class="art-cap">
            <h4>${img.title}</h4>
            ${img.quote ? `<p>"${img.quote}"</p>` : ''}
            ${img.by ? `<span class="by">By ${img.by}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    if (galleryRenderedCount === 0) {
      galleryGrid.innerHTML = html || '<p style="font-size:13px; color:#9a927c;">No photos uploaded yet.</p>';
    } else {
      galleryGrid.insertAdjacentHTML('beforeend', html);
    }
    galleryRenderedCount += nextBatch.length;

    if (loadMoreBtn) {
      loadMoreBtn.style.display = galleryRenderedCount < IMAGE_DATA.length ? 'inline-block' : 'none';
    }
  }


  function loadMoreGalleryImages() {
    renderGalleryBatch();
  }


  export async function loadPublicMembers() {
    const tbody = document.getElementById('publicMembersTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('members_directory_public').select('*').order('name', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#9a927c;">No members listed yet.</td></tr>';
        return;
      }
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
      tbody.innerHTML = sorted.map((m, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(m.name)}</strong></td>
          <td class="role">${escapeHtml(m.designation)}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--sindoor);">Could not load members directory.</td></tr>';
    }
  }


  export async function loadEmergencyContacts() {
    const grid = document.getElementById('emergencyContactsGrid');
    if (!grid) return;
    try {
      const { data, error } = await supabaseClient.from('emergency_contacts').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        grid.innerHTML = '<p style="font-size:13px; color:#9a927c;">No emergency contacts added yet.</p>';
        return;
      }
      const categories = {};
      data.forEach(c => {
        if (!categories[c.category]) categories[c.category] = [];
        categories[c.category].push(c);
      });
      grid.innerHTML = Object.keys(categories).map(cat => `
        <div class="emergency-category">
          <h4>${escapeHtml(cat)}</h4>
          <div class="emergency-cards">
            ${categories[cat].map(c => `
              <a href="tel:${escapeHtml(c.phone)}" class="emergency-card">
                <div class="emergency-card-name">${escapeHtml(c.name)}</div>
                <div class="emergency-card-phone"><i class="fas fa-phone"></i> ${escapeHtml(c.phone)}</div>
              </a>
            `).join('')}
          </div>
        </div>
      `).join('');
    } catch (err) {
      grid.innerHTML = '<p style="font-size:13px; color:#9a927c;">Couldn\'t load emergency contacts right now.</p>';
    }
  }


  export async function loadCommitteeCards() {
    const grid = document.getElementById('committeeCardsGrid');
    if (!grid) return;
    try {
      const { data, error } = await supabaseClient.from('members_directory_public').select('*').eq('show_on_committee', true).order('name', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        grid.innerHTML = '<p style="font-size:13px; color:#9a927c;">No committee profiles added yet.</p>';
        return;
      }
      grid.innerHTML = data.map(m => `
        <div class="committee-card">
          <img src="${m.photo_url || 'logo.png'}" alt="${escapeHtml(m.name)}" class="committee-card-photo" onerror="this.src='logo.png'">
          <h4>${escapeHtml(m.name)}</h4>
          <div class="committee-card-role">${escapeHtml(m.designation)}</div>
          ${m.bio ? `<p class="committee-card-bio">${escapeHtml(m.bio)}</p>` : ''}
        </div>
      `).join('');
    } catch (err) {
      grid.innerHTML = '<p style="font-size:13px; color:#9a927c;">Couldn\'t load committee profiles right now.</p>';
    }
  }

  export async function loadMagazine(){
    const container = document.getElementById('magazineList');
    if (!container) return;
    try {
      let allPosts = [];
      try {
        const { data: sbPosts, error } = await supabaseClient
          .from('magazine_posts')
          .select('*')
          .order('id', { ascending: false });
        if (!error && sbPosts) allPosts = [...allPosts, ...sbPosts];
      } catch (sbErr) {}

      try {
        const res = await fetch('magazine.json');
        if (res.ok) {
          const ghPosts = await res.json();
          if (Array.isArray(ghPosts)) allPosts = [...allPosts, ...ghPosts];
        }
      } catch (ghErr) {}

      if (allPosts.length === 0) {
        container.innerHTML = '<p style="font-size:13px; color:#9a927c;">No posts published yet — check back soon.</p>';
        return;
      }
      
      container.innerHTML = allPosts.map(p => {
        let authorText = escapeHtml(p.author || 'Anonymous');
        if (p.designation && p.designation.trim() !== '') {
          authorText += `, ${escapeHtml(p.designation)}`;
        }
        return `
          <div class="magazine-post">
            <div class="mp-meta">
              <span class="mp-cat">${escapeHtml(p.category || 'Writing')}</span>
              <span class="mp-date">${escapeHtml(p.date || '')}</span>
            </div>
            <h3>${escapeHtml(p.title || 'Untitled')}</h3>
            <div class="mp-author">By ${authorText}</div>
            <div class="mp-body" style="font-family:'Work Sans',sans-serif;">${p.content || ''}</div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = '<p style="font-size:13px; color:#9a927c;">Couldn\'t load posts right now — please refresh.</p>';
    }
  }

     
  document.querySelectorAll('.yr-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.yr-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.fy-panel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.fy).classList.add('active');
    });
  });
     



  // --- Expose functions called directly from inline HTML event handlers ---
  // (ES modules don't add top-level declarations to `window` automatically,
  //  so anything referenced via onclick=/onchange=/onsubmit= in the HTML,
  //  including HTML generated dynamically as template strings, needs this.)
  window.changeSlide = changeSlide;
  window.checkIndividualMemberStatus = checkIndividualMemberStatus;
  window.closeLightbox = closeLightbox;
  window.closeSiteSearch = closeSiteSearch;
  window.currentSlide = currentSlide;
  window.handlePublicRsvp = handlePublicRsvp;
  window.handleSiteSearchInput = handleSiteSearchInput;
  window.loadMoreGalleryImages = loadMoreGalleryImages;
  window.loadRsvpHeadcount = loadRsvpHeadcount;
  window.openLightbox = openLightbox;
  window.openSiteSearch = openSiteSearch;
  window.previewApplicantPhoto = previewApplicantPhoto;
  window.printFinanceReport = printFinanceReport;
  window.promptCashPayment = promptCashPayment;
  window.refreshContactCaptcha = refreshContactCaptcha;
  window.submitMembershipApplication = submitMembershipApplication;
