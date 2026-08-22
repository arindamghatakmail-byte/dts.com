  const GITHUB_OWNER = 'arindamghatakmail-byte';
  const GITHUB_REPO = 'dts.com';
  const GITHUB_IMAGES_PATH = 'images';

  const SUPABASE_URL = 'https://gnxptgaaoxljygnidjwg.supabase.co'; 
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdueHB0Z2Fhb3hsanlnbmlkandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5ODE2MzUsImV4cCI6MjEwMDU1NzYzNX0.FzxWzLiah4gexcvSL43PnN3LLIPWL3E-Fmtwqkb6le8';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var quill;
  let IMAGE_DATA = [];
  let INTERNAL_PHOTO_DATA = [];
  let slideIndex = 1;
  let slideTimer;
  let memberCaptchaCode = 'ABC12';

  // --- "WIND BLOWING" WAVE TEXT EFFECT ---
  // Uses Intl.Segmenter (grapheme-aware) so Bengali conjuncts / matras never
  // get split apart mid-character; falls back to Array.from for older browsers.
  function waveifyText(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    const text = el.textContent;
    let graphemes;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter('bn', { granularity: 'grapheme' });
      graphemes = Array.from(seg.segment(text), s => s.segment);
    } else {
      graphemes = Array.from(text);
    }
    el.innerHTML = graphemes.map((ch, i) => {
      if (ch === ' ') return ' ';
      return `<span class="wave-ch" style="animation-delay:${(i * 0.08).toFixed(2)}s">${escapeHtml(ch)}</span>`;
    }).join('');

    // Re-apply the original white -> marigold gradient across the *whole*
    // title, even though it's now split into per-letter spans: each span
    // gets the same gradient sized to the title's full width, offset to
    // that letter's own position, so it reads as one continuous gradient.
    requestAnimationFrame(() => {
      const totalWidth = el.offsetWidth;
      el.querySelectorAll('.wave-ch').forEach(span => {
        span.style.backgroundImage = 'linear-gradient(120deg, #ffffff 10%, var(--marigold) 85%)';
        span.style.backgroundSize = totalWidth + 'px 100%';
        span.style.backgroundPosition = (-span.offsetLeft) + 'px 0';
        span.style.webkitBackgroundClip = 'text';
        span.style.backgroundClip = 'text';
        span.style.webkitTextFillColor = 'transparent';
        span.style.color = 'transparent';
      });
    });
  }
  waveifyText('.title-modern');

  // --- CSV EXPORT HELPER ---
  function downloadCSV(filename, headers, rows) {
    const escapeCell = (val) => {
      const s = (val === null || val === undefined) ? '' : String(val);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [headers.map(escapeCell).join(',')];
    rows.forEach(row => lines.push(row.map(escapeCell).join(',')));
    const csvContent = lines.join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportMembersCSV() {
    try {
      const { data, error } = await supabaseClient.from('members_directory').select('*').order('name', { ascending: true });
      if (error) throw error;
      const sorted = [...(data || [])].sort((a, b) => a.name.localeCompare(b.name));
      const rows = sorted.map((m, i) => [i + 1, m.name, m.designation, m.address || '', m.occupation || '', m.dob || '', m.phone || '']);
      downloadCSV('members_directory.csv', ['Sl. No.', 'Name', 'Designation', 'Address', 'Occupation', 'DOB', 'Contact'], rows);
    } catch (err) {
      alert('Error exporting members: ' + err.message);
    }
  }

  async function exportDonationsCSV() {
    try {
      const { data, error } = await supabaseClient.from('member_donations').select('*').order('id', { ascending: false });
      if (error) throw error;
      const rows = (data || []).map(d => [d.fy_year || '', d.month, d.member_name, d.amount, d.status]);
      downloadCSV('donation_records.csv', ['FY Year', 'Month', 'Member', 'Amount', 'Status'], rows);
    } catch (err) {
      alert('Error exporting donations: ' + err.message);
    }
  }

  // --- HTML ESCAPE HELPER ---
  function escapeHtml(str) {
    if(!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- BILINGUAL LANGUAGE SWITCHER LOGIC ---
  function setLanguage(lang) {
    document.querySelectorAll('[data-en]').forEach(el => {
      const text = el.getAttribute('data-' + lang);
      if (text) el.textContent = text;
    });
    if (lang === 'en') {
      document.getElementById('langBtnEn').style.background = 'var(--marigold)';
      document.getElementById('langBtnEn').style.color = 'var(--indigo)';
      document.getElementById('langBtnBn').style.background = 'rgba(255,255,255,0.1)';
      document.getElementById('langBtnBn').style.color = '#fff';
    } else {
      document.getElementById('langBtnBn').style.background = 'var(--marigold)';
      document.getElementById('langBtnBn').style.color = 'var(--indigo)';
      document.getElementById('langBtnEn').style.background = 'rgba(255,255,255,0.1)';
      document.getElementById('langBtnEn').style.color = '#fff';
    }
  }

  // --- INDIVIDUAL MEMBER LOOKUP & AUTOMATED 12-MONTH CALENDAR REFLECTION ---
  async function loadLookupMembersDropdown() {
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

  // --- WHATSAPP NOTICE BROADCAST ---
  function broadcastWhatsApp() {
    const noticeItems = document.querySelectorAll('.notice-text');
    if (noticeItems.length === 0) {
      alert("No notices found to broadcast.");
      return;
    }
    const latestNotice = noticeItems[0].textContent.trim();
    const message = `📢 *Dihibaliharpur Tarun Sangha Alert*\n\n${latestNotice}\n\n_Visit official website for more details._`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }

  // --- FAIL-SAFE PDF RECEIPT GENERATOR ---
  // --- IMAGE COMPRESSION HELPER ---
  // Resizes to a max dimension and re-encodes as JPEG before upload, so a
  // 5-10MB phone photo doesn't get stored (and served to every visitor) at
  // full size. Falls back to the original file if anything goes wrong.
  function compressImageFile(file, maxDimension = 1600, quality = 0.82) {
    return new Promise((resolve) => {
      if (!file || !file.type || !file.type.startsWith('image/')) { resolve(file); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) { height = Math.round(height * (maxDimension / width)); width = maxDimension; }
            else { width = Math.round(width * (maxDimension / height)); height = maxDimension; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return; }
            const newName = file.name.replace(/\.(png|jpe?g|webp)$/i, '') + '.jpg';
            resolve(new File([blob], newName, { type: 'image/jpeg' }));
          }, 'image/jpeg', quality);
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  // --- ACTIVITY LOG ---
  // Best-effort: a logging failure should never block the actual action.
  async function logActivity(action, details) {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      const actor = (user && user.email) ? user.email : 'Unknown';
      await supabaseClient.from('activity_log').insert([{ actor, action, details: details || null }]);
    } catch (e) { /* ignore */ }
  }

  function getBase64ImageFromUrl(imageUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = function() { resolve(null); }; 
      img.src = imageUrl;
    });
  }

  async function generateMemberIdCard(index) {
    const m = adminMembersCache[index];
    if (!m) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [95, 55] });

    // Professional background: subtle vertical gradient (indigo -> deep navy)
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = Math.round(27 + (16 - 27) * t);
      const g = Math.round(42 + (26 - 42) * t);
      const b = Math.round(74 + (51 - 74) * t);
      doc.setFillColor(r, g, b);
      doc.rect(0, (55 / steps) * i, 95, 55 / steps + 0.5, 'F');
    }

    // Faded watermark logo, bottom-right, behind the text
    try {
      const wmData = await getBase64ImageFromUrl("logo.png");
      if (wmData) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.addImage(wmData, 'PNG', 55, 8, 42, 42);
        doc.restoreGraphicsState();
      }
    } catch (e) {}

    // Outer gold border
    doc.setDrawColor(224, 162, 51);
    doc.setLineWidth(0.8);
    doc.rect(1.5, 1.5, 92, 52);
    // thin accent line under header
    doc.setLineWidth(0.3);
    doc.line(4, 15.5, 91, 15.5);

    // Club logo, top-left
    try {
      const logoData = await getBase64ImageFromUrl("logo.png");
      if (logoData) doc.addImage(logoData, 'PNG', 4, 3, 11, 11);
    } catch (e) {}

    // Club name header (shifted right of the logo)
    doc.setTextColor(224, 162, 51);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("DIHIBALIHARPUR TARUN SANGHA", 52, 7, { align: "center" });
    doc.setFontSize(6.5);
    doc.setTextColor(230, 230, 230);
    doc.text("MEMBERSHIP ID CARD", 52, 11.5, { align: "center" });

    // Unique ID number — derived from the member's database id, so it's
    // automatically unique and needs no extra column or manual entry
    const idNo = "DTS-" + String(m.member_no || m.id).padStart(5, '0');

    // Profile photo (or placeholder circle)
    try {
      if (m.photo_url) {
        const photoData = await getBase64ImageFromUrl(m.photo_url);
        if (photoData) doc.addImage(photoData, 'PNG', 6, 19, 24, 24);
      }
    } catch (e) {}
    doc.setDrawColor(224, 162, 51);
    doc.setLineWidth(0.5);
    doc.rect(6, 19, 24, 24);

    // Member details
    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.text(String(m.name || ''), 34, 24);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(224, 162, 51);
    doc.text(String(m.designation || 'Member'), 34, 29);
    doc.setTextColor(210, 210, 210);
    doc.setFontSize(6.5);
    if (m.member_since) doc.text("Member since: " + m.member_since, 34, 34);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(224, 162, 51);
    doc.text("ID No: " + idNo, 34, 39);
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(210, 210, 210);
    doc.text("Reg. No. S0034236", 34, 43.5);

    // QR code linking to the Members Login portal
    try {
      const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" + encodeURIComponent("https://arindamghatakmail-byte.github.io/dts.com/#members-only");
      const qrData = await getBase64ImageFromUrl(qrUrl);
      if (qrData) doc.addImage(qrData, 'PNG', 73, 30, 16, 16);
    } catch (e) {}

    doc.setFontSize(5.5);
    doc.setTextColor(180, 180, 180);
    doc.text("Scan to check status", 81, 48, { align: "center" });

    doc.save(`ID_Card_${idNo}_${String(m.name || 'member').replace(/\s+/g, '_')}.pdf`);
  }

  async function downloadSinglePdfReceipt(fy, month, member, amount) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

    try {
      const imgData = await getBase64ImageFromUrl("logo.png");
      if (imgData) {
        doc.addImage(imgData, 'PNG', 18, 16, 20, 20);
      }
    } catch(e) {}

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("DIHIBALIHARPUR TARUN SANGHA", 105, 22, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("Helvetica", "normal");
    doc.text("Reg. No. S0034236 | Daspur, Paschim Medinipur, West Bengal", 105, 29, { align: "center" });
    doc.text("OFFICIAL MEMBER DUES & DONATION RECEIPT", 105, 36, { align: "center" });

    doc.setLineWidth(0.3);
    doc.line(10, 42, 200, 42);

    doc.setFontSize(11);
    doc.setFont("Helvetica", "bold");
    doc.text("Date: " + new Date().toLocaleDateString('en-GB'), 18, 52);
    doc.text("Receipt ID: DTS-REC-" + Math.floor(100000 + Math.random() * 900000), 120, 52);

    let startY = 62;
    doc.setFillColor(240, 240, 240);
    doc.rect(18, startY, 174, 10, "FD");

    doc.setFont("Helvetica", "bold");
    doc.text("FY Year", 22, startY + 7);
    doc.text("Month", 65, startY + 7);
    doc.text("Member Name", 110, startY + 7);
    doc.text("Amount (Rs.)", 155, startY + 7);

    doc.setFont("Helvetica", "normal");
    let currentY = startY + 18;
    
    let cleanAmount = String(amount).replace(/[^\d.,]/g, '');
    doc.text(String(fy), 22, currentY);
    doc.text(String(month), 65, currentY);
    doc.text(String(member), 110, currentY);
    doc.text("Rs. " + cleanAmount, 155, currentY);
    
    doc.setLineWidth(0.2);
    doc.line(18, currentY + 5, 192, currentY + 5);

    doc.setFont("Helvetica", "bold");
    doc.text("Status: Verified & Acknowledged by Treasurer (Mr. Sandip Roy)", 18, currentY + 25);

    doc.text("Authorized Signatory", 130, currentY + 45);
    doc.setFont("Helvetica", "normal");
    doc.text("Dihibaliharpur Tarun Sangha", 130, currentY + 51);

    doc.save(`Tarun_Sangha_Receipt_${member}_${month}.pdf`);
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

  let membershipAppsCache = [];

  async function loadMembershipApplications(containerId) {
    const tbody = document.getElementById(containerId);
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('membership_applications').select('*').order('submitted_at', { ascending: false });
      if (error) throw error;
      membershipAppsCache = data || [];
      if (membershipAppsCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#9a927c;">No applications yet.</td></tr>';
        return;
      }
      const statusColors = { pending: 'var(--clay)', approved: 'var(--leaf)', rejected: 'var(--sindoor)' };
      tbody.innerHTML = membershipAppsCache.map((a, i) => {
        const dateStr = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return `
          <tr>
            <td>${a.photo_url ? `<img src="${escapeHtml(a.photo_url)}" style="width:34px; height:42px; object-fit:cover; border-radius:3px;">` : '—'}</td>
            <td><strong>${escapeHtml(a.full_name)}</strong></td>
            <td>${escapeHtml(a.contact_number)}</td>
            <td style="font-size:11px;">${dateStr}</td>
            <td><span style="color:${statusColors[a.status] || '#888'}; font-weight:600; text-transform:capitalize;">${escapeHtml(a.status)}</span></td>
            <td style="white-space:nowrap;">
              ${a.status === 'pending' ? `
                <button onclick="approveApplication('${a.id}')" style="padding:3px 7px; background:var(--leaf); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10.5px; margin-right:3px;">Approve &amp; Add</button>
                <button onclick="rejectApplication('${a.id}')" style="padding:3px 7px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10.5px; margin-right:3px;">Reject</button>
              ` : ''}
              <button onclick="viewApplicationPdf(${i})" style="padding:3px 7px; background:var(--indigo); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10.5px; margin-right:3px;">PDF</button>
              <button onclick="deleteApplication('${a.id}')" style="padding:3px 7px; background:#7a7260; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10.5px;">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--sindoor);">Error loading applications.</td></tr>';
    }
  }

  function refreshAllMembershipTabs() {
    ['adminMembershipAppsTableBody', 'memberMembershipAppsTableBody', 'treasurerMembershipAppsTableBody'].forEach(id => {
      if (document.getElementById(id)) loadMembershipApplications(id);
    });
  }

  async function updateApplicationStatus(id, status) {
    try {
      const app = membershipAppsCache.find(a => String(a.id) === String(id));
      const { error } = await supabaseClient.from('membership_applications').update({ status }).eq('id', id);
      if (error) throw error;
      logActivity(`Application ${status}`, app ? app.full_name : ('id ' + id));
      refreshAllMembershipTabs();
      loadAdminSummaryBar();
    } catch (err) {
      alert('Error updating application: ' + err.message);
    }
  }

  async function approveApplication(id) {
    const app = membershipAppsCache.find(a => String(a.id) === String(id));
    try {
      if (app) {
        const addressParts = [app.village_ward, app.block_municipality, app.district, app.state].filter(Boolean);
        const memberPayload = {
          name: app.full_name,
          designation: 'Member',
          address: addressParts.join(', ') || 'NA',
          occupation: app.occupation || null,
          dob: app.dob || null,
          phone: app.contact_number || null,
          photo_url: app.photo_url || null
        };
        const { error: insertError } = await supabaseClient.from('members_directory').insert([memberPayload]);
        if (insertError) throw insertError;
      }
      const { error } = await supabaseClient.from('membership_applications').update({ status: 'approved' }).eq('id', id);
      if (error) throw error;

      logActivity('Approved application & added member', app ? app.full_name : ('id ' + id));
      refreshAllMembershipTabs();
      loadAdminSummaryBar();
      if (typeof loadAdminMembers === 'function') loadAdminMembers();
      if (typeof loadPublicMembers === 'function') loadPublicMembers();
      if (typeof loadAdminDonationMembersDropdown === 'function') loadAdminDonationMembersDropdown();

      if (app) alert(app.full_name + ' has been approved and added to the Members Directory.');
    } catch (err) {
      alert('Error approving application: ' + err.message);
    }
  }

  function rejectApplication(id) { updateApplicationStatus(id, 'rejected'); }

  async function deleteApplication(id) {
    if (!confirm('Delete this application permanently?')) return;
    const app = membershipAppsCache.find(a => String(a.id) === String(id));
    try {
      const { error } = await supabaseClient.from('membership_applications').delete().eq('id', id);
      if (error) throw error;
      logActivity('Deleted application', app ? app.full_name : ('id ' + id));
      refreshAllMembershipTabs();
      loadAdminSummaryBar();
    } catch (err) {
      alert('Error deleting application: ' + err.message);
    }
  }

  async function viewApplicationPdf(index) {
    const a = membershipAppsCache[index];
    if (!a) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(15);
    doc.text("DIHIBALIHARPUR TARUN SANGHA", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("Helvetica", "normal");
    doc.text("Membership Application — Status: " + String(a.status || '').toUpperCase(), 105, 27, { align: "center" });
    doc.setLineWidth(0.3);
    doc.line(15, 32, 195, 32);

    try {
      if (a.photo_url) {
        const photoData = await getBase64ImageFromUrl(a.photo_url);
        if (photoData) doc.addImage(photoData, 'PNG', 160, 38, 30, 36);
      }
    } catch (e) {}

    let y = 42;
    const field = (label, val) => {
      doc.setFont("Helvetica", "bold");
      doc.text(label + ":", 15, y);
      doc.setFont("Helvetica", "normal");
      doc.text(String(val || '-'), 60, y);
      y += 8;
    };
    field("Full Name", a.full_name);
    field("Date of Birth", a.dob);
    field("Contact Number", a.contact_number);
    field("Aadhaar Number", a.aadhaar_number);
    field("Blood Group", a.blood_group);
    field("Occupation", a.occupation);
    field("Village/Ward", a.village_ward);
    field("Block/Municipality", a.block_municipality);
    field("District, State", `${a.district || ''}, ${a.state || ''} - ${a.pin_code || ''}`);
    field("Submitted On", a.submitted_at ? new Date(a.submitted_at).toLocaleString('en-GB') : '-');
    field("Status", a.status);

    doc.save(`Membership_Application_${String(a.full_name || 'applicant').replace(/\s+/g, '_')}.pdf`);
  }

  async function loadRsvpEventOptions() {
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

  // --- ADMIN RSVP VIEWER ---
  async function loadAdminRsvps() {
    const tbody = document.getElementById('adminRsvpsTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('event_rsvps').select('*').order('id', { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#9a927c;">No RSVPs found.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(r => {
        let formattedDate = r.created_at ? new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recent';
        return `
          <tr>
            <td style="font-size:11px; font-family:'JetBrains Mono',monospace;">${escapeHtml(formattedDate)}</td>
            <td><strong>${escapeHtml(r.event_title)}</strong></td>
            <td>${escapeHtml(r.attendee_name)}</td>
            <td><a href="tel:${escapeHtml(r.phone)}">${escapeHtml(r.phone)}</a></td>
            <td>${r.guests}</td>
            <td><button onclick="deleteRsvp('${r.id}')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button></td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--sindoor);">Error loading RSVPs.</td></tr>';
    }
  }

  async function deleteRsvp(id) {
    if (!confirm("Are you sure you want to delete this RSVP?")) return;
    try {
      const { error } = await supabaseClient.from('event_rsvps').delete().eq('id', id);
      if (error) throw error;
      loadAdminRsvps();
      loadAdminSummaryBar();
    } catch (err) {
      alert("Error deleting RSVP: " + err.message);
    }
  }

  // --- CAPTCHA: rendered to <canvas> as a distorted image, not plain DOM text ---
  function renderCaptchaCanvas(canvasId, code) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;

    ctx.fillStyle = '#1B2A4A';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(224,162,51,${(Math.random() * 0.35 + 0.1).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, Math.random() * h);
      ctx.lineTo(Math.random() * w, Math.random() * h);
      ctx.stroke();
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(247,241,227,${(Math.random() * 0.25).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    const charWidth = w / code.length;
    ctx.font = `bold ${Math.floor(h * 0.6)}px 'JetBrains Mono', monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (let i = 0; i < code.length; i++) {
      ctx.save();
      const x = charWidth * i + charWidth / 2;
      const y = h / 2 + (Math.random() * 6 - 3);
      ctx.translate(x, y);
      ctx.rotate((Math.random() * 0.5 - 0.25));
      ctx.fillStyle = '#E0A233';
      ctx.fillText(code[i], 0, 0);
      ctx.restore();
    }
  }

  function generateCaptchaCode() {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }

  function refreshMemberCaptcha() {
    memberCaptchaCode = generateCaptchaCode();
    renderCaptchaCanvas('memberCaptchaBox', memberCaptchaCode);
    const input = document.getElementById('memberCaptchaInput');
    if (input) input.value = '';
  }

  let contactCaptchaCode = '';
  function refreshContactCaptcha() {
    contactCaptchaCode = generateCaptchaCode();
    renderCaptchaCanvas('contactCaptchaBox', contactCaptchaCode);
    const input = document.getElementById('contactCaptchaInput');
    if (input) input.value = '';
  }

  async function loadAdminQueries() {
    const tbody = document.getElementById('adminQueriesTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('contact_queries').select('*').order('id', { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#9a927c;">No queries in inbox.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(q => {
        let formattedDate = q.created_at ? new Date(q.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recent';
        return `
          <tr>
            <td style="font-size:11px; font-family:'JetBrains Mono',monospace;">${escapeHtml(formattedDate)}</td>
            <td><strong>${escapeHtml(q.name)}</strong></td>
            <td><a href="mailto:${escapeHtml(q.contact_info)}">${escapeHtml(q.contact_info)}</a></td>
            <td style="max-width:280px; word-break:break-word;">${escapeHtml(q.message)}</td>
            <td><button onclick="deleteQuery('${q.id}')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button></td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--sindoor);">Error loading queries.</td></tr>';
    }
  }

  async function deleteQuery(id) {
    if (!confirm("Are you sure you want to delete this query?")) return;
    try {
      const { error } = await supabaseClient.from('contact_queries').delete().eq('id', id);
      if (error) throw error;
      loadAdminQueries();
      loadAdminSummaryBar();
    } catch (err) {
      alert("Error deleting query: " + err.message);
    }
  }

  function wireContactForm() {
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

  let financialDataCache = [];
  let chartsInstances = {};

  async function fetchAndRenderFinances() {
    try {
      const { data, error } = await supabaseClient.from('financial_records').select('*').order('id', { ascending: true });
      if (error) throw error;
      
      financialDataCache = data || [];
      renderPublicFinancialTable(financialDataCache);
      renderFinancialCharts(financialDataCache);
      renderFinancialLedger(financialDataCache);
    } catch(err) {
      console.error("Error fetching financial data: ", err);
    }
  }

  function renderPublicFinancialTable(data) {
    const container = document.getElementById('publicFinancialTableContainer');
    if (!container) return;
    if (data.length === 0) {
      container.innerHTML = '<p style="padding:10px;">No financial data available yet.</p>';
      return;
    }
    
    let thead = '<tr><th style="text-align:left;">Metric</th>' + data.map(d => `<th>${escapeHtml(d.fy_year)}</th>`).join('') + '</tr>';
    let receiptsRow = '<tr><td>Total Receipts</td>' + data.map(d => `<td>${d.receipts.toLocaleString()}</td>`).join('') + '</tr>';
    let paymentsRow = '<tr><td>Total Payments</td>' + data.map(d => `<td>${d.payments.toLocaleString()}</td>`).join('') + '</tr>';
    let surplusRow = '<tr><td>Net Surplus</td>' + data.map(d => `<td>${d.surplus.toLocaleString()}</td>`).join('') + '</tr>';
    let cashInHandRow = '<tr><td>Closing Cash-in-hand</td>' + data.map(d => `<td>${d.cash_in_hand.toLocaleString()}</td>`).join('') + '</tr>';
    let cashAtBankRow = '<tr><td>Closing Cash-at-bank</td>' + data.map(d => `<td>${d.cash_at_bank.toLocaleString()}</td>`).join('') + '</tr>';
    
    let totalFundRow = '<tr class="total"><td>Total Liquid Assets (Cash + Bank)</td>' + data.map(d => `<td>${(d.cash_in_hand + d.cash_at_bank).toLocaleString()}</td>`).join('') + '</tr>'; 
    
    container.innerHTML = `<table class="fin" style="display: table; width: 100%;"><thead>${thead}</thead><tbody>${receiptsRow}${paymentsRow}${surplusRow}${cashInHandRow}${cashAtBankRow}${totalFundRow}</tbody></table>`;
  }

  function renderFinancialCharts(data) {
    if(data.length === 0) return;
    const years = data.map(d => d.fy_year);
    const receipts = data.map(d => d.receipts);
    const payments = data.map(d => d.payments);
    const surplus = data.map(d => d.surplus);
    const cashInHand = data.map(d => d.cash_in_hand);
    const cashAtBank = data.map(d => d.cash_at_bank);

    const sindoor='#B5292E', marigold='#E0A233', leaf='#33553F', clay='#9C4E2C', indigo='#1B2A4A';
    Chart.defaults.font.family = "'Work Sans', sans-serif";
    Chart.defaults.color = '#6b6350';
    Chart.defaults.font.size = 12;

    if(chartsInstances.receipts) chartsInstances.receipts.destroy();
    chartsInstances.receipts = new Chart(document.getElementById('chartReceipts'), {
      type:'bar',
      data:{ labels:years, datasets:[
        { label:'Receipts', data:receipts, backgroundColor:marigold, borderRadius:2 },
        { label:'Payments', data:payments, backgroundColor:indigo, borderRadius:2 }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top', align:'end', labels:{ boxWidth:10, usePointStyle:true, pointStyle:'circle' } } }, scales:{ y:{ grid:{ color:'rgba(32,38,59,0.08)' }, ticks:{ callback:(v)=>'₹'+(v/1000)+'k' } }, x:{ grid:{ display:false } } } }
    });

    if(chartsInstances.surplus) chartsInstances.surplus.destroy();
    chartsInstances.surplus = new Chart(document.getElementById('chartSurplus'), {
      type:'line',
      data:{ labels:years, datasets:[{ label:'Net Surplus (₹)', data:surplus, borderColor:sindoor, backgroundColor:'rgba(181,41,46,0.12)', borderWidth:2.5, fill:true, tension:0.35, pointBackgroundColor:sindoor, pointRadius:5 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ grid:{ color:'rgba(32,38,59,0.08)' }, ticks:{ callback:(v)=>'₹'+v } }, x:{ grid:{ display:false } } } }
    });

    if(chartsInstances.cash) chartsInstances.cash.destroy();
    chartsInstances.cash = new Chart(document.getElementById('chartCash'), {
      type:'bar',
      data:{ labels:years, datasets:[
        { label:'Cash-in-hand', data:cashInHand, backgroundColor:clay, borderRadius:2, stack:'s' },
        { label:'Cash-at-bank', data:cashAtBank, backgroundColor:leaf, borderRadius:2, stack:'s' }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'top', align:'end', labels:{ boxWidth:10, usePointStyle:true, pointStyle:'circle' } } }, scales:{ y:{ grid:{ color:'rgba(32,38,59,0.08)' }, ticks:{ callback:(v)=>'₹'+(v/1000)+'k' }, stacked:true }, x:{ grid:{ display:false }, stacked:true } } }
    });
    
    if(!chartsInstances.expense) {
        chartsInstances.expense = new Chart(document.getElementById('chartExpense'), {
          type:'doughnut',
          data:{ labels:['Building construction','Puja expenses','Periodicals & education','Misc./ travel/ utilities','Audit fees'],
            datasets:[{ data:[67119,18550,1852,5398,1500], backgroundColor:[indigo, sindoor, marigold, clay, leaf], borderColor:'#F7F1E3', borderWidth:2 }] },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, usePointStyle:true, pointStyle:'circle', font:{size:11} } } } }
        });
    }
  }

  function renderFinancialLedger(data) {
    const container = document.getElementById('financialLedgerContainer');
    if (!container) return;
    if (data.length === 0) {
      container.innerHTML = '<p style="padding:10px;">No financial data available yet.</p>';
      return;
    }

    const historyMeta = {
      'FY23': { sub: '1 month of operation', title: 'Registration & foundation', desc: 'Society registered 1 March 2023. First acts: a clothing drive for the poor and purchase of basic office furniture.', tag: 'Governing body elected — Mr. Chandan Roy, President', hLabel: 'Fixed Assets', hVal: '₹17,383' },
      'FY24': { sub: 'first full year', title: 'Traditions take root', desc: 'First full-scale Durga Puja, Saraswati Puja and Basanta Utsav. Began investing in reusable puja decoration assets.', tag: null, hLabel: 'Fixed Assets', hVal: '₹19,046' },
      'FY25': { sub: 'the turning point', title: 'Building fund launched', desc: 'Patrons contributed ₹82,500 toward a dedicated clubhouse construction fund — the largest single inflow in the club\'s history.', tag: null, hLabel: 'Building Fund', hVal: '₹82,500' },
      'FY26': { sub: 'new leadership, first bricks', title: 'Election & construction', desc: '₹67,119 of the building fund spent on materials and labour — the clubhouse becomes a physical reality.', tag: 'New governing body elected — Mr. Ranjit Bag, President', hLabel: 'Fund Spent', hVal: '₹67,119' }
    };

    container.innerHTML = data.map(d => {
      const meta = historyMeta[d.fy_year] || {
          sub: 'Annual Financial Record',
          title: 'Operations & Community Work',
          desc: 'Continued club operations, cultural events, and community welfare activities for the financial year.',
          tag: null,
          hLabel: 'Total Payments',
          hVal: '₹' + d.payments.toLocaleString()
      };

      let tagHtml = meta.tag ? `<span class="election-tag">${escapeHtml(meta.tag)}</span>` : '';

      return `
        <div class="l-item">
          <div class="yr">${escapeHtml(d.fy_year)} &middot; ${escapeHtml(meta.sub)}</div>
          <h4>${escapeHtml(meta.title)}</h4>
          <div class="figs">
            <div>Receipts<b>₹${d.receipts.toLocaleString()}</b></div>
            <div>Surplus<b>₹${d.surplus.toLocaleString()}</b></div>
            <div>${escapeHtml(meta.hLabel)}<b>${escapeHtml(meta.hVal)}</b></div>
          </div>
          <p>${escapeHtml(meta.desc)}</p>
          ${tagHtml}
        </div>
      `;
    }).join('');
  }

  async function loadAdminFinances(data = financialDataCache) {
      const tbody = document.getElementById('adminFinancesTableBody');
      if (!tbody) return;
      if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>';
          return;
      }
      tbody.innerHTML = data.map(d => `
          <tr>
              <td><strong>${escapeHtml(d.fy_year)}</strong></td>
              <td>₹${d.receipts.toLocaleString()}</td>
              <td>₹${d.payments.toLocaleString()}</td>
              <td>₹${d.surplus.toLocaleString()}</td>
              <td>
                <button onclick="editFinanceRecord('${d.id}', '${escapeHtml(d.fy_year)}', ${d.receipts}, ${d.payments}, ${d.surplus}, ${d.cash_in_hand}, ${d.cash_at_bank})" style="padding:4px 8px; background:var(--marigold); color:var(--indigo); border:none; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">Edit</button>
                <button onclick="deleteFinanceRecord('${d.id}')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button>
              </td>
          </tr>
      `).join('');
  }

  function editFinanceRecord(id, fyYear, receipts, payments, surplus, cashInHand, cashAtBank) {
      document.getElementById('editFinanceId').value = id;
      document.getElementById('adminFinanceFy').value = fyYear;
      document.getElementById('adminFinanceReceipts').value = receipts;
      document.getElementById('adminFinancePayments').value = payments;
      document.getElementById('adminFinanceSurplus').value = surplus;
      document.getElementById('adminFinanceCashInHand').value = cashInHand;
      document.getElementById('adminFinanceCashAtBank').value = cashAtBank;
      
      document.getElementById('financeSaveBtn').textContent = "UPDATE FINANCIAL RECORD";
      document.getElementById('financeCancelBtn').style.display = "inline-block";
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetFinanceForm() {
      document.getElementById('editFinanceId').value = '';
      document.getElementById('adminFinanceFy').value = '';
      document.getElementById('adminFinanceReceipts').value = '';
      document.getElementById('adminFinancePayments').value = '';
      document.getElementById('adminFinanceSurplus').value = '';
      document.getElementById('adminFinanceCashInHand').value = '';
      document.getElementById('adminFinanceCashAtBank').value = '';
      
      document.getElementById('financeSaveBtn').textContent = "SAVE FINANCIAL RECORD";
      document.getElementById('financeCancelBtn').style.display = "none";
  }

  async function handleFinanceSave(event) {
      event.preventDefault();
      const id = document.getElementById('editFinanceId').value;
      const fy_year = document.getElementById('adminFinanceFy').value.trim();
      const receipts = parseInt(document.getElementById('adminFinanceReceipts').value);
      const payments = parseInt(document.getElementById('adminFinancePayments').value);
      const surplus = parseInt(document.getElementById('adminFinanceSurplus').value);
      const cash_in_hand = parseInt(document.getElementById('adminFinanceCashInHand').value);
      const cash_at_bank = parseInt(document.getElementById('adminFinanceCashAtBank').value);

      const btn = document.getElementById('financeSaveBtn');
      const originalBtnText = btn.textContent;
      btn.textContent = 'SAVING...';
      btn.disabled = true;

      try {
          if (id) {
              const { error } = await supabaseClient.from('financial_records').update({ fy_year, receipts, payments, surplus, cash_in_hand, cash_at_bank }).eq('id', id);
              if (error) throw error;
              alert("Financial record updated successfully!");
          } else {
              const { error } = await supabaseClient.from('financial_records').insert([{ fy_year, receipts, payments, surplus, cash_in_hand, cash_at_bank }]);
              if (error) throw error;
              alert("Financial record saved! Your charts have been updated.");
          }
          resetFinanceForm();
          fetchAndRenderFinances(); 
      } catch (err) {
          alert("Error saving record: " + err.message);
      } finally {
          btn.textContent = originalBtnText;
          btn.disabled = false;
      }
  }

  async function deleteFinanceRecord(id) {
      if (!confirm("Are you sure you want to delete this financial record?")) return;
      try {
          const { error } = await supabaseClient.from('financial_records').delete().eq('id', id);
          if (error) throw error;
          logActivity('Deleted financial record', 'id ' + id);
          fetchAndRenderFinances();
      } catch (err) {
          alert("Error deleting record: " + err.message);
      }
  }

  // --- EVENT DATE HELPERS (fixes the countdown time-offset bug) ---
  // The datetime-local input's raw value has NO timezone info attached, so
  // sending it straight to Supabase let Postgres guess the timezone (usually
  // UTC) instead of the admin's actual local time — that mismatch was the
  // root cause of times shifting when saved. These helpers make both the
  // save and the read-back explicit and symmetric.

  // Input value ("2026-08-19T00:00", browser-local wall clock) -> correct UTC ISO string for storage
  function localDateTimeToUtcIso(localValue) {
    if (!localValue) return null;
    const d = new Date(localValue); // no offset suffix => JS treats it as browser-local time, correctly
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Whatever Supabase returns (with or without an explicit offset) -> a correctly-parsed Date object
  function parseStoredEventDate(raw) {
    if (!raw) return null;
    let s = String(raw).replace(' ', 'T');
    if (!/[Zz]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z'; // no offset present => treat as UTC (Postgres/Supabase default)
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Date object -> "YYYY-MM-DDTHH:MM" using LOCAL getters, for repopulating the datetime-local input
  function dateToLocalInputValue(d) {
    if (!d) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let dynamicEventsList = [];
  let lastCountdownImageKey = null;

  async function fetchCountdownEvents() {
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

  function updateHomepageCountdown() {
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

  async function loadAdminEvents() {
    const tbody = document.getElementById('adminEventsTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('club_events').select('*').order('id', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#9a927c;">No events scheduled.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(ev => {
        const parsedDate = parseStoredEventDate(ev.event_date);
        let formattedDate = parsedDate ? parsedDate.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Invalid date';
        let isoVal = dateToLocalInputValue(parsedDate);
        let imgUrl = ev.image_url || '';
        let thumbHtml = imgUrl
          ? `<img src="${escapeHtml(imgUrl)}" style="width:44px; height:44px; object-fit:cover; border-radius:6px; border:1px solid var(--line);">`
          : `<span style="font-size:10.5px; color:#9a927c;">None</span>`;
        return `
        <tr>
          <td>${thumbHtml}</td>
          <td><strong>${escapeHtml(ev.title)}</strong></td>
          <td>${escapeHtml(formattedDate)}</td>
          <td>
            <button onclick="editEvent('${ev.id}', '${escapeHtml(ev.title)}', '${isoVal}', '${escapeHtml(imgUrl)}')" style="padding:4px 8px; background:var(--marigold); color:var(--indigo); border:none; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">Edit</button>
            <button onclick="deleteEvent('${ev.id}')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button>
          </td>
        </tr>
      `}).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--sindoor);">Error loading events.</td></tr>';
    }
  }

  function previewEventImage(input) {
    const wrap = document.getElementById('eventImagePreviewWrap');
    const img = document.getElementById('eventImagePreview');
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = e => { img.src = e.target.result; wrap.style.display = 'block'; };
      reader.readAsDataURL(input.files[0]);
    }
  }

  function clearEventImage() {
    document.getElementById('adminEventImage').value = '';
    document.getElementById('editEventImageUrl').value = '';
    document.getElementById('eventImagePreviewWrap').style.display = 'none';
    document.getElementById('eventImagePreview').src = '';
  }

  function editEvent(id, title, eventDate, imageUrl) {
      document.getElementById('editEventId').value = id;
      document.getElementById('adminEventTitle').value = title;
      document.getElementById('adminEventDate').value = eventDate;
      document.getElementById('editEventImageUrl').value = imageUrl || '';
      document.getElementById('adminEventImage').value = '';

      const wrap = document.getElementById('eventImagePreviewWrap');
      const img = document.getElementById('eventImagePreview');
      if (imageUrl) { img.src = imageUrl; wrap.style.display = 'block'; }
      else { wrap.style.display = 'none'; img.src = ''; }

      document.getElementById('eventSaveBtn').textContent = "UPDATE EVENT";
      document.getElementById('eventCancelBtn').style.display = "inline-block";
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetEventForm() {
      document.getElementById('editEventId').value = '';
      document.getElementById('adminEventTitle').value = '';
      document.getElementById('adminEventDate').value = '';
      clearEventImage();

      document.getElementById('eventSaveBtn').textContent = "SAVE EVENT TO COUNTDOWN";
      document.getElementById('eventCancelBtn').style.display = "none";
  }

  async function handleEventSave(event) {
    event.preventDefault();
    const id = document.getElementById('editEventId').value;
    const title = document.getElementById('adminEventTitle').value.trim();
    const eventDate = document.getElementById('adminEventDate').value; 
    const fileInput = document.getElementById('adminEventImage');
    const existingImageUrl = document.getElementById('editEventImageUrl').value.trim();

    const btn = document.getElementById('eventSaveBtn');
    const originalBtnText = btn.textContent;
    btn.textContent = 'SAVING...';
    btn.disabled = true;

    try {
      let imageUrl = existingImageUrl || null;

      if (fileInput.files && fileInput.files[0]) {
        const file = await compressImageFile(fileInput.files[0]);
        const fileExt = file.name.split('.').pop();
        const safeName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
        const filePath = `event-backgrounds/${Date.now()}_${safeName}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage.from('club_files').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabaseClient.storage.from('club_files').getPublicUrl(filePath);
        imageUrl = publicUrlData.publicUrl;
      }

      const eventDateUtc = localDateTimeToUtcIso(eventDate);

      if (id) {
          const { error } = await supabaseClient.from('club_events').update({ title: title, event_date: eventDateUtc, image_url: imageUrl }).eq('id', id);
          if (error) throw error;
          alert("Event updated successfully!");
      } else {
          const { error } = await supabaseClient.from('club_events').insert([{ title: title, event_date: eventDateUtc, image_url: imageUrl }]);
          if (error) throw error;
          alert("Event saved! The homepage countdown will update instantly.");
      }
      resetEventForm();
      loadAdminEvents();
      fetchCountdownEvents(); 
    } catch (err) {
      alert("Error saving event: " + err.message);
    } finally {
      btn.textContent = originalBtnText;
      btn.disabled = false;
    }
  }

  async function deleteEvent(id) {
    if (!confirm("Are you sure you want to delete this event from the countdown?")) return;
    try {
      const { error } = await supabaseClient.from('club_events').delete().eq('id', id);
      if (error) throw error;
      logActivity('Deleted event', 'id ' + id);
      loadAdminEvents();
      fetchCountdownEvents();
    } catch (err) {
      alert("Error deleting event: " + err.message);
    }
  }

  async function clearPastEvents() {
    try {
      const { data, error } = await supabaseClient.from('club_events').select('id, event_date');
      if (error) throw error;
      const now = Date.now();
      const pastIds = (data || []).filter(ev => {
        const d = parseStoredEventDate(ev.event_date);
        return d && d.getTime() < now;
      }).map(ev => ev.id);

      if (pastIds.length === 0) {
        alert('No past events to clear — everything currently listed is upcoming.');
        return;
      }
      if (!confirm(`Delete ${pastIds.length} past event(s)? This can't be undone.`)) return;

      const { error: delError } = await supabaseClient.from('club_events').delete().in('id', pastIds);
      if (delError) throw delError;
      logActivity('Cleared past events', `${pastIds.length} event(s)`);
      loadAdminEvents();
      fetchCountdownEvents();
      alert(`Cleared ${pastIds.length} past event(s).`);
    } catch (err) {
      alert('Error clearing past events: ' + err.message);
    }
  }

  function applyVersionBadge(settings) {
    const verBadge = document.getElementById('siteVersionBadge');
    if (verBadge && settings && settings.site_version) {
      verBadge.textContent = 'V' + settings.site_version;
    }
  }
  window.addEventListener('site-settings-ready', (e) => applyVersionBadge(e.detail));

  // --- HIDDEN UNLOCK-BOX TRIGGER (tap the logo 5x within 3s) ---
  // Only ever reveals the code box when maintenance_mode is genuinely true,
  // as set from Admin -> Site Control — never during the brief "checking..."
  // state, and irrelevant on the live site since this box doesn't exist there.
  let maintLogoTapCount = 0;
  let maintLogoTapTimer = null;

  function handleMaintLogoTap() {
    if (!window.__siteSettings || !window.__siteSettings.maintenance_mode) return;

    maintLogoTapCount++;
    clearTimeout(maintLogoTapTimer);
    maintLogoTapTimer = setTimeout(() => { maintLogoTapCount = 0; }, 3000);

    if (maintLogoTapCount >= 5) {
      maintLogoTapCount = 0;
      const box = document.getElementById('maintUnlockBox');
      if (box) {
        box.style.display = 'flex';
        const input = document.getElementById('previewCodeInput');
        if (input) input.focus();
      }
    }
  }

  function tryPreviewUnlock() {
    const val = document.getElementById('previewCodeInput').value.trim();
    const errorEl = document.getElementById('previewUnlockError');
    const btn = document.querySelector('.maint-unlock button');

    function attempt(settings) {
      if (!settings) {
        errorEl.textContent = "Couldn't reach the site's settings. In Supabase, confirm the site_settings table was created (see setup step) and that its row with id = 1 exists, then refresh this page and try again.";
        errorEl.style.display = 'block';
        return;
      }
      if (val && val === settings.access_password) {
        localStorage.setItem('dts_preview_pass_v1', val);
        window.location.reload();
      } else {
        errorEl.textContent = 'Incorrect code.';
        errorEl.style.display = 'block';
      }
    }

    if (window.__siteSettings) { attempt(window.__siteSettings); return; }

    errorEl.textContent = 'Checking site status…';
    errorEl.style.display = 'block';
    if (btn) btn.disabled = true;

    let settled = false;
    const onReady = (e) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('site-settings-ready', onReady);
      if (btn) btn.disabled = false;
      attempt(e.detail);
    };
    window.addEventListener('site-settings-ready', onReady);

    setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('site-settings-ready', onReady);
      if (btn) btn.disabled = false;
      attempt(null);
    }, 6000);
  }

  document.addEventListener("DOMContentLoaded", function() {
    if (window.__siteSettings) applyVersionBadge(window.__siteSettings);

    fetchAndRenderFinances();
    fetchCountdownEvents().then(() => {
        setInterval(updateHomepageCountdown, 1000);
    });

    refreshMemberCaptcha();
    refreshContactCaptcha();
    wireContactForm();

    if (document.getElementById('quillEditor')) {
      quill = new Quill('#quillEditor', {
        theme: 'snow',
        placeholder: 'Write your story, poem, or essay here...',
        modules: {
          toolbar: [
            [{ 'size': ['small', false, 'large', 'huge'] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'align': [] }],
            ['clean']
          ]
        }
      });
    }
    //<--Admin Step 3 -->   
    if (document.getElementById('adminQuillEditor')) {
      window.adminQuill = new Quill('#adminQuillEditor', {
        theme: 'snow',
        placeholder: 'Write the story, poem, or essay here...',
        modules: { toolbar: [ [{ 'size': ['small', false, 'large', 'huge'] }], ['bold', 'italic', 'underline', 'strike'], [{ 'color': [] }, { 'background': [] }], [{ 'align': [] }], ['clean'] ] }
      });
    }
    const hash = window.location.hash.replace('#', '');
    const validPages = ['home', 'aim', 'members', 'finances', 'events', 'activities', 'gallery', 'magazine', 'members-only', 'treasurer', 'admin', 'join', 'contact', 'emergency'];
    
    if (hash && validPages.includes(hash)) {
      showPage(hash, false); 
      window.history.replaceState({ page: hash }, "", "#" + hash);
    } else {
      window.history.replaceState({ page: 'home' }, "", window.location.pathname + window.location.search);
    }

    loadPublicMembers();
    loadNotices();
    loadImages();

    supabaseClient.rpc('increment_visit_count')
      .then(({ data, error }) => {
        if (error) throw error;
        document.getElementById('visitorCount').innerText = data;
      })
      .catch(err => {
        document.getElementById('visitorCount').innerText = "—";
      });
  });

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
  window.addEventListener('afterprint', () => document.body.classList.remove('print-finance-mode'));

  function exitApp() {
    try { window.close(); } catch (e) {}
    setTimeout(() => {
      alert('You can now close this app from your device\'s recent apps screen or home button.');
    }, 250);
  }

  document.addEventListener('DOMContentLoaded', function() {
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    const exitLink = document.getElementById('exitAppLink');
    if (exitLink) exitLink.style.display = isStandalone ? '' : 'none';
  });

  function toggleMobileNav(){
    document.getElementById('navTabs').classList.toggle('open');
    document.getElementById('navHamburger').classList.toggle('open');
    document.getElementById('navOverlay').classList.toggle('open');
    document.body.classList.toggle('nav-open-lock');
  }
  function closeMobileNav(){
    document.getElementById('navTabs').classList.remove('open');
    document.getElementById('navHamburger').classList.remove('open');
    document.getElementById('navOverlay').classList.remove('open');
    document.body.classList.remove('nav-open-lock');
  }

  function showPage(name, pushToHistory = true){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    const target = document.getElementById('page-'+name);
    if (target) target.classList.add('active');

    document.querySelectorAll('.tab-link').forEach(t=>t.classList.remove('active'));
    document.querySelector('.tab-link[data-page="'+name+'"]')?.classList.add('active');
    
    window.scrollTo({top:0, behavior:'smooth'});
    closeMobileNav();

    if(name==='finances'){ 
        fetchAndRenderFinances(); 
    }
    if(name==='magazine'){ loadMagazine(); }
    if(name==='members'){ loadPublicMembers(); loadCommitteeCards(); }
    if(name==='emergency'){ loadEmergencyContacts(); }
    if(name==='events'){ loadRsvpEventOptions(); }
    if(name==='members-only'){
      document.getElementById('loginGate').style.display = 'block';
      document.getElementById('membersContent').style.display = 'none';
      document.getElementById('memberLogoutBtn').style.display = 'none';
      document.getElementById('memberPassword').value = '';
      document.getElementById('loginError').style.display = 'none';
      refreshMemberCaptcha();
    }
    if(name==='treasurer'){
      document.getElementById('treasurerLoginGate').style.display = 'block';
      document.getElementById('treasurerContent').style.display = 'none';
      document.getElementById('treasurerLogoutBtn').style.display = 'none';
      document.getElementById('treasurerPassword').value = '';
      document.getElementById('treasurerLoginError').style.display = 'none';
    }
    if(name==='admin'){
      document.getElementById('adminLoginGate').style.display = 'block';
      document.getElementById('adminContent').style.display = 'none';
      document.getElementById('adminLogoutBtn').style.display = 'none';
      document.getElementById('adminPassword').value = '';
      document.getElementById('adminLoginError').style.display = 'none';
      loadAdminQueries();
      loadAdminRsvps();
      loadAdminMembers();
      loadAdminDonations();
      loadAdminDonationMembersDropdown();
      loadAdminEvents(); 
      loadAdminFinances();
      loadAdminFiles();
      loadAdminNoticesTable();
      loadAdminMagazineTable();
    }

    if (pushToHistory) {
      window.history.pushState({ page: name }, "", "#" + name);
    }
  }

  window.addEventListener('popstate', function(event) {
    if (event.state && event.state.page) {
      showPage(event.state.page, false); 
    } else {
      showPage('home', false); 
    }
  });

  function switchAdminTab(panelId) {
    document.querySelectorAll('.admin-portal-panel').forEach(p => p.style.display = 'none'); const target = document.getElementById(panelId); if (target) target.style.display = 'block';
    const selectEl = document.getElementById('adminNavSelect'); if (selectEl) selectEl.value = panelId;
    if (panelId === 'admin-tab-queries') loadAdminQueries();
    if (panelId === 'admin-tab-rsvps') loadAdminRsvps();
    if (panelId === 'admin-tab-members') { loadAdminMembers(); loadAdminBirthdays(); }
    if (panelId === 'admin-tab-finances') loadAdminFinances();
    if (panelId === 'admin-tab-donations') { loadAdminDonations(); loadAdminDonationMembersDropdown(); }
    if (panelId === 'admin-tab-events') loadAdminEvents();
    if (panelId === 'admin-tab-notices') { loadNotices(); loadAdminNoticesTable(); }
    if (panelId === 'admin-tab-magazine') loadAdminMagazineTable();
    if (panelId === 'admin-tab-media') loadAdminFiles();
    if (panelId === 'admin-tab-sitecontrol') loadSiteControl();
    if (panelId === 'admin-tab-emergency') loadAdminEmergencyContacts();
    if (panelId === 'admin-tab-newmembers') loadMembershipApplications('adminMembershipAppsTableBody');
    if (panelId === 'admin-tab-storage') loadStorageUsage();
    if (panelId === 'admin-tab-activity') loadActivityLog();
  }

  async function loadSiteControl() {
    const pill = document.getElementById('siteControlStatusPill');
    try {
      const { data, error } = await supabaseClient.from('site_settings').select('*').eq('id', 1).single();
      if (error) throw error;

      document.getElementById('siteMaintenanceToggle').checked = !!data.maintenance_mode;
      document.getElementById('siteVersionInput').value = data.site_version || '';
      document.getElementById('sitePasswordInput').value = data.access_password || '';
      document.getElementById('siteScheduledLiveInput').value = data.scheduled_live_at ? String(data.scheduled_live_at).replace(' ', 'T').substring(0, 16) : '';

      const scheduledFuture = data.scheduled_live_at && new Date(data.scheduled_live_at) > new Date();

      if (!data.maintenance_mode) {
        pill.textContent = '✅ Live';
        pill.style.background = 'rgba(51,85,63,0.12)';
        pill.style.color = 'var(--leaf)';
      } else if (scheduledFuture) {
        pill.textContent = '⏳ Maintenance — scheduled to go live ' + new Date(data.scheduled_live_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
        pill.style.background = 'rgba(224,162,51,0.15)';
        pill.style.color = 'var(--clay)';
      } else {
        pill.textContent = '🔧 Maintenance Mode';
        pill.style.background = 'rgba(181,41,46,0.12)';
        pill.style.color = 'var(--sindoor)';
      }
    } catch (err) {
      pill.textContent = 'Error loading status';
      pill.style.background = 'rgba(181,41,46,0.12)';
      pill.style.color = 'var(--sindoor)';
    }
  }

  async function saveSiteControl() {
    const btn = document.getElementById('siteControlSaveBtn');
    const status = document.getElementById('siteControlStatus');
    const maintenance_mode = document.getElementById('siteMaintenanceToggle').checked;
    const site_version = document.getElementById('siteVersionInput').value.trim();
    const access_password = document.getElementById('sitePasswordInput').value.trim();
    const scheduledVal = document.getElementById('siteScheduledLiveInput').value;
    const scheduled_live_at = scheduledVal ? scheduledVal : null;

    if (!site_version || !access_password) {
      alert('Version and preview code cannot be empty.');
      return;
    }

    const originalText = btn.textContent;
    btn.textContent = 'SAVING...';
    btn.disabled = true;
    status.style.display = 'none';

    try {
      const { error } = await supabaseClient.from('site_settings').update({ maintenance_mode, site_version, access_password, scheduled_live_at }).eq('id', 1);
      if (error) throw error;

      status.style.display = 'block';
      status.style.background = 'rgba(51,85,63,0.12)';
      status.style.color = 'var(--leaf)';
      status.textContent = 'Saved! This takes effect for every visitor on their next page load.';
      loadSiteControl();
    } catch (err) {
      status.style.display = 'block';
      status.style.background = 'rgba(181,41,46,0.12)';
      status.style.color = 'var(--sindoor)';
      status.textContent = 'Error saving: ' + err.message;
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }
    btn.textContent = originalText;
    btn.disabled = false;
  }

  let adminEmergencyCache = [];

  async function loadAdminEmergencyContacts() {
    const tbody = document.getElementById('adminEmergencyTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('emergency_contacts').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      adminEmergencyCache = data || [];
      if (adminEmergencyCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#9a927c;">No contacts added yet.</td></tr>';
        return;
      }
      tbody.innerHTML = adminEmergencyCache.map((c, i) => `
        <tr>
          <td>${escapeHtml(c.category)}</td>
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td>${escapeHtml(c.phone)}</td>
          <td>
            <button onclick="editEmergencyContact(${i})" style="padding:4px 8px; background:var(--marigold); color:var(--indigo); border:none; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">Edit</button>
            <button onclick="deleteEmergencyContact('${c.id}')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--sindoor);">Error loading contacts.</td></tr>';
    }
  }

  function editEmergencyContact(index) {
    const c = adminEmergencyCache[index];
    if (!c) return;
    document.getElementById('editEmergencyId').value = c.id;
    document.getElementById('emergencyCategory').value = c.category;
    document.getElementById('emergencyName').value = c.name;
    document.getElementById('emergencyPhone').value = c.phone;
    document.getElementById('emergencySortOrder').value = c.sort_order || 10;
    document.getElementById('emergencySaveBtn').textContent = "UPDATE CONTACT";
    document.getElementById('emergencyCancelBtn').style.display = "inline-block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetEmergencyForm() {
    document.getElementById('editEmergencyId').value = '';
    document.getElementById('emergencyCategory').value = '';
    document.getElementById('emergencyName').value = '';
    document.getElementById('emergencyPhone').value = '';
    document.getElementById('emergencySortOrder').value = '10';
    document.getElementById('emergencySaveBtn').textContent = "SAVE CONTACT";
    document.getElementById('emergencyCancelBtn').style.display = "none";
  }

  async function handleEmergencySave(event) {
    event.preventDefault();
    const id = document.getElementById('editEmergencyId').value;
    const category = document.getElementById('emergencyCategory').value.trim();
    const name = document.getElementById('emergencyName').value.trim();
    const phone = document.getElementById('emergencyPhone').value.trim();
    const sort_order = parseInt(document.getElementById('emergencySortOrder').value) || 10;

    const btn = document.getElementById('emergencySaveBtn');
    const origText = btn.textContent;
    btn.textContent = 'SAVING...';
    btn.disabled = true;

    try {
      if (id) {
        const { error } = await supabaseClient.from('emergency_contacts').update({ category, name, phone, sort_order }).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from('emergency_contacts').insert([{ category, name, phone, sort_order }]);
        if (error) throw error;
      }
      resetEmergencyForm();
      loadAdminEmergencyContacts();
    } catch (err) {
      alert('Error saving contact: ' + err.message);
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  }

  async function deleteEmergencyContact(id) {
    if (!confirm('Delete this emergency contact?')) return;
    try {
      const { error } = await supabaseClient.from('emergency_contacts').delete().eq('id', id);
      if (error) throw error;
      logActivity('Deleted emergency contact', 'id ' + id);
      loadAdminEmergencyContacts();
    } catch (err) {
      alert('Error deleting contact: ' + err.message);
    }
  }


  function switchMemberTab(panelId) {
    document.querySelectorAll('.member-portal-panel').forEach(p => p.style.display = 'none');
    const target = document.getElementById(panelId);
    if (target) target.style.display = 'block';

    const selectEl = document.getElementById('memberNavSelect');
    if (selectEl) selectEl.value = panelId;

    if (panelId === 'portal-magazine') loadMemberMagazineManager();
    if (panelId === 'portal-members-dir') loadMemberLoginMembers();
    if (panelId === 'portal-member-lookup') loadLookupMembersDropdown();
    if (panelId === 'portal-newmembers') loadMembershipApplications('memberMembershipAppsTableBody');
  }

  const IMAGE_CAPTIONS = {
    'krishna.jpg':     { title: 'Krishna, Flute in Hand', quote: 'Dancing beneath a peacock feather sky.' },
    'chandrayaan.jpg': { title: 'Chandrayaan-3', quote: 'A rocket bound for the moon, drawn for National Moon Day.' },
    'trishul.jpg':     { title: "The Trishul of Maa Durga", quote: 'Finished in a hand-drawn mandala.' },
    'village.jpg':     { title: 'Our Village', quote: 'Home — the huts, the trees, and the path that leads back to them.' },
    'durgaface.jpg':   { title: 'Maa Durga', quote: 'The fierce, watchful gaze of the goddess.' },
    'portrait.jpg':    { title: 'A Quiet Study', quote: 'A graphite portrait, drawn with a steady hand.', by: 'Anya Sudha Bora' }
  };

  function formatImageTitle(filename){
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

  async function loadImages(){
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

  async function loadPublicMembers() {
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

  async function loadEmergencyContacts() {
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

  async function loadCommitteeCards() {
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

  async function loadMemberLoginMembers() {
    const tbody = document.getElementById('memberLoginTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('members_directory').select('*').order('name', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#9a927c;">No members found.</td></tr>';
        return;
      }
      const sorted = [...data].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      tbody.innerHTML = sorted.map((m, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(m.name || '')}</strong></td>
          <td>${escapeHtml(m.designation || '')}</td>
          <td>${escapeHtml(m.address || '')}</td>
          <td>${escapeHtml(m.occupation || '')}</td>
          <td>${escapeHtml(m.dob || '')}</td>
          <td><a href="tel:${escapeHtml(m.phone || '')}" style="color:var(--indigo); text-decoration:none;">${escapeHtml(m.phone || '')}</a></td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--sindoor);">Error loading members.</td></tr>';
    }
  }

  async function loadAdminSummaryBar() {
    const bar = document.getElementById('adminSummaryBar');
    if (!bar) return;
    try {
      const [apps, queries, rsvps] = await Promise.all([
        supabaseClient.from('membership_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabaseClient.from('contact_queries').select('id', { count: 'exact', head: true }),
        supabaseClient.from('event_rsvps').select('id', { count: 'exact', head: true })
      ]);
      const pill = (label, count, panelId, color) => `
        <button onclick="switchAdminTab('${panelId}')" style="background:${color}; color:#fff; border:none; padding:8px 14px; border-radius:20px; font-family:'JetBrains Mono',monospace; font-size:11.5px; cursor:pointer; font-weight:600;">${label}: ${count || 0}</button>
      `;
      bar.innerHTML =
        pill('🆕 Pending Applications', apps.count, 'admin-tab-newmembers', 'var(--sindoor)') +
        pill('📥 Queries', queries.count, 'admin-tab-queries', 'var(--indigo)') +
        pill('📋 RSVPs', rsvps.count, 'admin-tab-rsvps', 'var(--leaf)');
    } catch (err) {
      bar.innerHTML = '';
    }
  }

  async function loadAdminBirthdays() {
    const container = document.getElementById('adminBirthdaysList');
    if (!container) return;
    try {
      const { data, error } = await supabaseClient.from('members_directory').select('name, dob, phone').not('dob', 'is', null);
      if (error) throw error;

      const thisMonth = new Date().getMonth();
      const birthdays = (data || [])
        .filter(m => m.dob && m.dob !== 'NA')
        .map(m => ({ ...m, dobDate: new Date(m.dob) }))
        .filter(m => !isNaN(m.dobDate) && m.dobDate.getMonth() === thisMonth)
        .sort((a, b) => a.dobDate.getDate() - b.dobDate.getDate());

      if (birthdays.length === 0) {
        container.innerHTML = '<p style="font-size:12.5px; color:#9a927c;">No birthdays recorded for this month.</p>';
        return;
      }

      container.innerHTML = birthdays.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line);">
          <span style="font-size:13.5px;"><strong>${escapeHtml(m.name)}</strong> — ${m.dobDate.getDate()}${['th','st','nd','rd'][(m.dobDate.getDate() % 10 > 3 || Math.floor(m.dobDate.getDate() % 100 / 10) === 1) ? 0 : m.dobDate.getDate() % 10]}</span>
          ${m.phone ? `<a href="https://wa.me/91${escapeHtml(String(m.phone).replace(/\D/g,''))}" target="_blank" style="font-size:11px; background:#25D366; color:#fff; padding:4px 10px; border-radius:12px; text-decoration:none;"><i class="fab fa-whatsapp"></i> Wish</a>` : ''}
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<p style="font-size:12.5px; color:var(--sindoor);">Error loading birthdays.</p>';
    }
  }

  let adminMembersCache = [];

  async function loadAdminMembers() {
    const tbody = document.getElementById('adminMembersTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('members_directory').select('*').order('name', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#9a927c;">No members found.</td></tr>';
        adminMembersCache = [];
        return;
      }
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
      adminMembersCache = sorted;
      tbody.innerHTML = sorted.map((m, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(m.name)}</strong></td>
          <td>${escapeHtml(m.designation)}</td>
          <td>
            <button onclick="editMember(${i})" style="padding:4px 8px; background:var(--marigold); color:var(--indigo); border:none; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">Edit</button>
            <button onclick="generateMemberIdCard(${i})" style="padding:4px 8px; background:var(--indigo); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">ID Card</button>
            <button onclick="deleteMember('${m.id}')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--sindoor);">Error loading members.</td></tr>';
    }
  }

  function previewMemberPhoto(input) {
    const wrap = document.getElementById('memberPhotoPreviewWrap');
    const img = document.getElementById('memberPhotoPreview');
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = e => { img.src = e.target.result; wrap.style.display = 'block'; };
      reader.readAsDataURL(input.files[0]);
    }
  }

  function clearMemberPhoto() {
    document.getElementById('memberPhoto').value = '';
    document.getElementById('editMemberPhotoUrl').value = '';
    document.getElementById('memberPhotoPreviewWrap').style.display = 'none';
    document.getElementById('memberPhotoPreview').src = '';
  }

  function editMember(index) {
    const m = adminMembersCache[index];
    if (!m) return;
    document.getElementById('editMemberId').value = m.id;
    document.getElementById('memberName').value = m.name;
    document.getElementById('memberAddress').value = (m.address && m.address !== 'NA') ? m.address : '';
    document.getElementById('memberDesignation').value = m.designation;
    document.getElementById('memberOccupation').value = (m.occupation && m.occupation !== 'NA') ? m.occupation : '';
    document.getElementById('memberDob').value = (m.dob && m.dob !== 'NA' && m.dob !== 'null') ? m.dob : '';
    document.getElementById('memberPhone').value = (m.phone && m.phone !== 'NA') ? m.phone : '';
    document.getElementById('memberSince').value = m.member_since || '';
    document.getElementById('memberBio').value = m.bio || '';
    document.getElementById('memberShowOnCommittee').checked = !!m.show_on_committee;
    document.getElementById('editMemberPhotoUrl').value = m.photo_url || '';
    document.getElementById('memberPhoto').value = '';

    const wrap = document.getElementById('memberPhotoPreviewWrap');
    const img = document.getElementById('memberPhotoPreview');
    if (m.photo_url) { img.src = m.photo_url; wrap.style.display = 'block'; }
    else { wrap.style.display = 'none'; img.src = ''; }

    document.getElementById('memberSaveBtn').textContent = "UPDATE MEMBER";
    document.getElementById('memberCancelBtn').style.display = "inline-block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetMemberForm() {
    document.getElementById('editMemberId').value = '';
    document.getElementById('memberName').value = '';
    document.getElementById('memberAddress').value = '';
    document.getElementById('memberDesignation').value = '';
    document.getElementById('memberOccupation').value = '';
    document.getElementById('memberDob').value = '';
    document.getElementById('memberPhone').value = '';
    document.getElementById('memberSince').value = '';
    document.getElementById('memberBio').value = '';
    document.getElementById('memberShowOnCommittee').checked = false;
    clearMemberPhoto();
    document.getElementById('memberSaveBtn').textContent = "SAVE MEMBER";
    document.getElementById('memberCancelBtn').style.display = "none";
  }

  async function handleMemberSave(event) {
    event.preventDefault();
    const id = document.getElementById('editMemberId').value;
    const name = document.getElementById('memberName').value.trim();
    const address = document.getElementById('memberAddress').value.trim();
    const designation = document.getElementById('memberDesignation').value.trim();

    let occupation = document.getElementById('memberOccupation').value.trim();
    let dob = document.getElementById('memberDob').value.trim();
    let phone = document.getElementById('memberPhone').value.trim();
    let member_since = document.getElementById('memberSince').value.trim();
    let bio = document.getElementById('memberBio').value.trim();
    const show_on_committee = document.getElementById('memberShowOnCommittee').checked;
    const fileInput = document.getElementById('memberPhoto');
    const existingPhotoUrl = document.getElementById('editMemberPhotoUrl').value.trim();

    occupation = occupation !== '' ? occupation : null;
    dob = dob !== '' ? dob : null;
    phone = phone !== '' ? phone : null;
    member_since = member_since !== '' ? member_since : null;
    bio = bio !== '' ? bio : null;

    const btn = document.getElementById('memberSaveBtn');
    const origText = btn.textContent;
    btn.textContent = "SAVING...";
    btn.disabled = true;

    try {
      let photo_url = existingPhotoUrl || null;

      if (fileInput.files && fileInput.files[0]) {
        const file = await compressImageFile(fileInput.files[0]);
        const fileExt = file.name.split('.').pop();
        const safeName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
        const filePath = `member-photos/${Date.now()}_${safeName}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage.from('club_files').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabaseClient.storage.from('club_files').getPublicUrl(filePath);
        photo_url = publicUrlData.publicUrl;
      }

      const payload = { name, designation, address, occupation, dob, phone, member_since, bio, show_on_committee, photo_url };

      if (id) {
        const { error } = await supabaseClient.from('members_directory').update(payload).eq('id', id);
        if (error) throw error;
        logActivity('Updated member', name);
        alert("Member updated successfully!");
      } else {
        const { error } = await supabaseClient.from('members_directory').insert([payload]);
        if (error) throw error;
        logActivity('Added member', name);
        alert("Member added successfully!");
      }
      resetMemberForm();
      loadAdminMembers();
      loadPublicMembers();
      loadCommitteeCards();
      loadAdminDonationMembersDropdown();
    } catch (err) {
      alert("Error saving member: " + err.message);
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  }

  async function deleteMember(id) {
    if (!confirm("Are you sure you want to delete this member?")) return;
    const m = adminMembersCache.find(x => String(x.id) === String(id));
    try {
      const { error } = await supabaseClient.from('members_directory').delete().eq('id', id);
      if (error) throw error;
      logActivity('Deleted member', m ? m.name : ('id ' + id));
      alert("Member deleted successfully!");
      loadAdminMembers();
      loadPublicMembers();
      loadAdminDonationMembersDropdown();
    } catch (err) {
      alert("Error deleting member: " + err.message);
    }
  }

  async function loadAdminDonationMembersDropdown() {
    const select = document.getElementById('adminDonationMemberSelect');
    if (!select) return;
    try {
      const { data, error } = await supabaseClient.from('members_directory').select('name').order('name', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        select.innerHTML = '<option value="">No members found in directory</option>';
        return;
      }
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
      select.innerHTML = '<option value="">Select Member from Directory</option>' + sorted.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    } catch (err) {
      select.innerHTML = '<option value="">Error loading members</option>';
    }
  }

  async function loadTreasurerDonationMembersDropdown() {
    const select = document.getElementById('treasurerDonationMemberSelect');
    if (!select) return;
    try {
      const { data, error } = await supabaseClient.from('members_directory').select('name').order('name', { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        select.innerHTML = '<option value="">No members found in directory</option>';
        return;
      }
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
      select.innerHTML = '<option value="">Select Member from Directory</option>' + sorted.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    } catch (err) {
      select.innerHTML = '<option value="">Error loading members</option>';
    }
  }

  async function handleDonationSave(event, role = 'admin') {
    event.preventDefault();
    const prefix = role === 'admin' ? 'admin' : 'treasurer';
    const fyYear = document.getElementById(prefix + 'FyYear').value;
    const month = document.getElementById(prefix + 'DonationMonth').value;
    const memberName = document.getElementById(prefix + 'DonationMemberSelect').value;
    const amount = parseFloat(document.getElementById(prefix + 'DonationAmount').value);
    const status = document.getElementById(prefix + 'DonationStatus').value;

    if (!memberName) {
      alert("Please select a member from the directory.");
      return;
    }

    try {
      const { error } = await supabaseClient.from('member_donations').insert([{ fy_year: fyYear, month: month, member_name: memberName, amount: amount, status: status }]);
      if (error) throw error;
      logActivity('Recorded dues', `${memberName} — ${month} ${fyYear} — ${status}`);
      alert("Donation/Due record saved successfully!");
      if (role === 'admin') loadAdminDonations();
      if (role === 'treasurer') loadTreasurerDonations();
    } catch (err) {
      alert("Error saving record: " + err.message);
    }
  }

  async function copyDuesForCurrentMonth(role) {
    const prefix = role === 'admin' ? 'admin' : 'treasurer';
    const fyYear = document.getElementById(prefix + 'FyYear').value;
    const month = document.getElementById(prefix + 'DonationMonth').value;
    const defaultAmount = 25;

    if (!confirm(`Add a "Due" entry for every member who doesn't yet have a record for ${month}, ${fyYear}?`)) return;

    try {
      const [membersRes, existingRes] = await Promise.all([
        supabaseClient.from('members_directory').select('name'),
        supabaseClient.from('member_donations').select('member_name').eq('fy_year', fyYear).eq('month', month)
      ]);
      if (membersRes.error) throw membersRes.error;
      if (existingRes.error) throw existingRes.error;

      const existingNames = new Set((existingRes.data || []).map(r => r.member_name));
      const toAdd = (membersRes.data || []).filter(m => !existingNames.has(m.name));

      if (toAdd.length === 0) {
        alert('Every member already has a record for this FY/Month — nothing to add.');
        return;
      }

      const rows = toAdd.map(m => ({ fy_year: fyYear, month: month, member_name: m.name, amount: defaultAmount, status: 'Due' }));
      const { error: insertError } = await supabaseClient.from('member_donations').insert(rows);
      if (insertError) throw insertError;

      alert(`Added "Due" records for ${toAdd.length} member(s).`);
      if (role === 'admin') loadAdminDonations();
      if (role === 'treasurer') loadTreasurerDonations();
    } catch (err) {
      alert('Error adding due records: ' + err.message);
    }
  }

  async function loadAdminDonations() {
    const tbody = document.getElementById('adminDonationsTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('member_donations').select('*').order('id', { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#9a927c;">No donation records found.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(d => `
        <tr>
          <td><strong>${escapeHtml(d.fy_year || '2026-2027')}</strong></td>
          <td>${escapeHtml(d.month)}</td>
          <td>${escapeHtml(d.member_name)}</td>
          <td>₹${escapeHtml(String(d.amount))}</td>
          <td><span style="color:${d.status.includes('Paid')?'var(--leaf)':'var(--sindoor)'}; font-weight:600;">${escapeHtml(d.status)}</span></td>
          <td><button onclick="deleteDonationRecord('${d.id}', 'admin')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button></td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--sindoor);">Error loading donations.</td></tr>';
    }
  }

  async function loadTreasurerDonations() {
    const tbody = document.getElementById('treasurerDonationsTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('member_donations').select('*').order('id', { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#9a927c;">No donation records found.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(d => `
        <tr>
          <td><strong>${escapeHtml(d.fy_year || '2026-2027')}</strong></td>
          <td>${escapeHtml(d.month)}</td>
          <td>${escapeHtml(d.member_name)}</td>
          <td>₹${escapeHtml(String(d.amount))}</td>
          <td><span style="color:${d.status.includes('Paid')?'var(--leaf)':'var(--sindoor)'}; font-weight:600;">${escapeHtml(d.status)}</span></td>
          <td><button onclick="deleteDonationRecord('${d.id}', 'treasurer')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button></td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--sindoor);">Error loading donations.</td></tr>';
    }
  }

  async function deleteDonationRecord(id, role = 'admin') {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      const { error } = await supabaseClient.from('member_donations').delete().eq('id', id);
      if (error) throw error;
      alert("Record deleted successfully!");
      if (role === 'admin') loadAdminDonations();
      if (role === 'treasurer') loadTreasurerDonations();
    } catch (err) {
      alert("Error deleting record: " + err.message);
    }
  }

  async function loadNotices(){
    const containers = [document.getElementById('noticeList'), document.getElementById('adminNoticeList')];
    const oldNotices = [
      { date: "04.07.2026", text: "New Elected Executive Committee, w.e.f. 04.07.2026" },
      { date: "FY 2025–26", text: "Clubhouse wants to raise a Library Building Fund" },
      { date: "2026", text: "Kobi Pronam – 2026 celebrated with a cultural programme" },
      { date: "2026", text: "Basanta Utsav 2026 celebrated with colour and music" },
      { date: "2025", text: "Organisation successfully celebrated Durga Pujo 2025" },
      { date: "2025", text: "Blood Donation Camp organised successfully" }
    ];

    let dbNotices = [];
    try {
      const { data, error } = await supabaseClient
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        dbNotices = data;
      }
    } catch (err) {
      console.warn("Supabase notice fetch skipped, using fallback list.");
    }

    const allNotices = [...dbNotices, ...oldNotices];

    containers.forEach(container => {
      if (!container) return;
      if (allNotices.length === 0) {
        container.innerHTML = '<div class="notice-item"><div class="notice-text">No notices yet.</div></div>';
        return;
      }
      
      const itemsHtml = allNotices.map((n, i) => `
        <div class="notice-item">
          ${i === 0 ? '<span class="notice-pill">NEW</span>' : ''}
          <div class="notice-date">${escapeHtml(n.date || '')}</div>
          <div class="notice-text">${escapeHtml(n.text || '')}</div>
        </div>`).join('');
        
      container.innerHTML = itemsHtml + itemsHtml;
    });
  }
  // --- ADMIN FILE MANAGER REFRESH STUB ---
  function loadAdminFiles() {
    // This runs after a successful upload to refresh media lists
    if (typeof loadDocuments === 'function') loadDocuments();
    if (typeof loadInternalPhotos === 'function') loadInternalPhotos();
  }   
  async function loadMagazine(){
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

  async function loadMemberMagazineManager() {
    const container = document.getElementById('memberMagazineManagerList');
    if (!container) return;
    try {
      const { data, error } = await supabaseClient
        .from('magazine_posts')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        container.innerHTML = '<p style="font-size:13px; color:#9a927c;">No magazine posts found.</p>';
        return;
      }

      container.innerHTML = data.map(p => `
        <div style="background:var(--paper-dim); padding:12px 16px; border-radius:8px;">
          <strong style="font-size:14px; color:var(--indigo);">${escapeHtml(p.title)}</strong>
          <div style="font-size:12px; color:#7a7260;">By ${escapeHtml(p.author)} &middot; ${escapeHtml(p.date || '')}</div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<p style="font-size:13px; color:var(--sindoor);">Error loading posts.</p>';
    }
  }

  async function submitMagazinePost(event) {
    event.preventDefault();
    const form = event.target;
    const btn = document.getElementById('magazineBtn');
    const status = document.getElementById('magazineStatus');
    const richTextContent = quill ? quill.root.innerHTML : form.content.value;
    
    if (quill && quill.getText().trim().length === 0) {
      alert("Please write something in the editor before publishing.");
      return;
    }

    const originalBtnText = btn.textContent;
    btn.textContent = 'PUBLISHING...';
    btn.disabled = true;
    status.style.display = 'none';

    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    try {
      const { error } = await supabaseClient
        .from('magazine_posts')
        .insert([{ 
          author: form.author.value, 
          title: form.title.value, 
          category: form.category.value,
          designation: form.designation.value,
          content: richTextContent,
          date: today
        }]);

      if (error) throw error;

      status.style.display = 'block';
      status.style.background = 'rgba(51,85,63,0.12)';
      status.style.color = 'var(--leaf)';
      status.textContent = "Successfully published! Check the Bibhas tab.";
      
      form.reset();
      if (quill) quill.setContents([]); 
      loadMagazine(); 
      loadMemberMagazineManager();
    } catch (err) {
      status.style.display = 'block';
      status.style.background = 'rgba(181,41,46,0.12)';
      status.style.color = 'var(--sindoor)';
      status.textContent = "Error publishing post. Please check your database permissions.";
    } finally {
      btn.textContent = originalBtnText;
      btn.disabled = false;
    }
  }

  async function logoutPortal(type) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}

    if (type === 'member') {
      document.getElementById('membersContent').style.display = 'none';
      document.getElementById('memberLogoutBtn').style.display = 'none';
      document.getElementById('loginGate').style.display = 'block';
      document.getElementById('memberPassword').value = '';
      refreshMemberCaptcha();
    } else if (type === 'treasurer') {
      document.getElementById('treasurerContent').style.display = 'none';
      document.getElementById('treasurerLogoutBtn').style.display = 'none';
      document.getElementById('treasurerLoginGate').style.display = 'block';
      document.getElementById('treasurerPassword').value = '';
    } else if (type === 'admin') {
      document.getElementById('adminContent').style.display = 'none';
      document.getElementById('adminLogoutBtn').style.display = 'none';
      document.getElementById('adminLoginGate').style.display = 'block';
      document.getElementById('adminPassword').value = '';
    }
  }

  async function checkMemberPassword() {
    const email = document.getElementById('memberEmail').value.trim();
    const password = document.getElementById('memberPassword').value;
    const captchaInput = document.getElementById('memberCaptchaInput').value.trim();
    const errorDiv = document.getElementById('loginError');
    const btn = document.querySelector('#loginGate button');
    
    errorDiv.style.display = 'none';

    if (captchaInput !== memberCaptchaCode) {
      errorDiv.textContent = 'Incorrect security code. Please try again.';
      errorDiv.style.display = 'block';
      refreshMemberCaptcha();
      return;
    }

    if (!password) {
      errorDiv.textContent = 'Please enter the password.';
      errorDiv.style.display = 'block';
      return;
    }

    const originalBtnText = btn.textContent;
    btn.textContent = 'VERIFYING...';
    btn.disabled = true;
    
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      document.getElementById('loginGate').style.display = 'none';
      document.getElementById('membersContent').style.display = 'block';
      document.getElementById('memberLogoutBtn').style.display = 'inline-flex';
      logActivity('Logged in', 'Member portal');
      loadDocuments();
      loadNotices();
      loadMinutes();
      loadInternalPhotos();
      loadMemberLoginMembers();
      loadLookupMembersDropdown();
    } catch (err) {
      errorDiv.textContent = "Error: " + err.message;
      errorDiv.style.display = 'block';
      refreshMemberCaptcha();
    } finally {
      btn.textContent = originalBtnText;
      btn.disabled = false;
    }
  }
  
  async function checkTreasurerPassword() {
    const email = document.getElementById('treasurerEmail').value.trim();
    const password = document.getElementById('treasurerPassword').value;
    const errorDiv = document.getElementById('treasurerLoginError');
    const btn = document.querySelector('#treasurerLoginGate button');
    
    errorDiv.style.display = 'none';
    if (!password) {
      errorDiv.textContent = 'Please enter your password.';
      errorDiv.style.display = 'block';
      return;
    }

    const originalBtnText = btn.textContent;
    btn.textContent = 'VERIFYING...';
    btn.disabled = true;

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        errorDiv.textContent = "Error: " + error.message;
        errorDiv.style.display = 'block';
      } else {
        document.getElementById('treasurerLoginGate').style.display = 'none';
        document.getElementById('treasurerContent').style.display = 'block';
        document.getElementById('treasurerLogoutBtn').style.display = 'inline-flex';
        logActivity('Logged in', 'Treasurer portal');
        loadTreasurerDonations();
        loadTreasurerDonationMembersDropdown();
        loadMembershipApplications('treasurerMembershipAppsTableBody');
      }
    } catch (err) {
      errorDiv.textContent = "Code Error: " + err.message;
      errorDiv.style.display = 'block';
    } finally {
      btn.textContent = originalBtnText;
      btn.disabled = false;
    }
  }

  async function checkAdminPassword() {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('adminLoginError');
    const btn = document.querySelector('#adminLoginGate button');
    
    errorDiv.style.display = 'none';
    if (!password) {
      errorDiv.textContent = 'Please enter the admin password.';
      errorDiv.style.display = 'block';
      return;
    }

    const originalBtnText = btn.textContent;
    btn.textContent = 'VERIFYING...';
    btn.disabled = true;

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        errorDiv.textContent = "Error: " + error.message;
        errorDiv.style.display = 'block';
      } else {
        document.getElementById('adminLoginGate').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        document.getElementById('adminLogoutBtn').style.display = 'inline-flex';
        logActivity('Logged in', 'Admin portal');
        loadAdminQueries();
        loadAdminRsvps();
        loadAdminMembers();
        loadAdminBirthdays();
        loadAdminDonationMembersDropdown();
        loadNotices();
        loadAdminEvents();
        loadAdminFinances();
        loadAdminSummaryBar();
      }
    } catch (err) {
      errorDiv.textContent = "Code Error: " + err.message;
      errorDiv.style.display = 'block';
    } finally {
      btn.textContent = originalBtnText;
      btn.disabled = false;
    }
  }

  async function handleAdminUpload(event, type) {
    event.preventDefault();
    const btn = event.target.querySelector('button');
    const originalBtnText = btn.textContent;
    btn.textContent = 'UPLOADING...';
    btn.disabled = true;

    try {
      if (type === 'notice') {
        const text = document.getElementById('noticeText').value;
        const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const { error } = await supabaseClient
          .from('notices')
          .insert([{ text: text, date: today }]);
        if (error) throw error;
        alert('Notice posted successfully to the member board!');
        loadNotices();
      } 
      else if (type === 'document' || type === 'image') {
        const fileInput = type === 'document' ? document.getElementById('adminDoc') : document.getElementById('adminImg');
        let file = fileInput.files[0];
        if (!file) throw new Error("No file selected.");
        if (type === 'image') file = await compressImageFile(file);

        const fileExt = file.name.split('.').pop();
        const safeName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${Date.now()}_${safeName}.${fileExt}`;
        const folderPath = type === 'document' ? 'documents/' : 'internal-photos/';
        const filePath = `${folderPath}${fileName}`;

        const { error } = await supabaseClient
          .storage
          .from('club_files')
          .upload(filePath, file);

        if (error) throw error;
        alert(`${type === 'document' ? 'PDF' : 'Image'} uploaded successfully!`);
        loadAdminFiles();
      }
      event.target.reset(); 
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      btn.textContent = originalBtnText;
      btn.disabled = false;
    }
  }

  const GITHUB_DOCS_PATH = 'documents';

  function formatDocTitle(filename){
    let name = filename.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    name = name.replace(/\b([a-zA-Z]+)(\d{2,4})?\b/g, (match, word, num) => {
      if (/^fy$/i.test(word) && num) return 'FY ' + num;
      if (/^fy\d{2,4}$/i.test(word)) return 'FY ' + word.slice(2);
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() + (num || '');
    });
    return name;
  }

  async function loadPdfFolder(folderPath, containerId, emptyMsg){
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${folderPath}`);
      if (!res.ok) throw new Error('GitHub API request failed');
      const files = await res.json();
      const pdfs = Array.isArray(files) ? files.filter(f => f.name.toLowerCase().endsWith('.pdf')) : [];
      if (pdfs.length === 0) {
        container.innerHTML = `<p style="font-size:12.5px; color:#9a927c;">${emptyMsg}</p>`;
        return;
      }
      pdfs.sort((a, b) => a.name.localeCompare(b.name)).reverse();
      container.innerHTML = pdfs.map(f => `
        <a class="doc-item" href="${f.download_url}" target="_blank">
          <span class="doc-icon">📄</span>
          <span class="doc-info"><span class="doc-title">${formatDocTitle(f.name)}</span><span class="doc-sub">${(f.size/1024).toFixed(0)} KB &middot; PDF</span></span>
          <span class="doc-dl">↓</span>
        </a>`).join('');
    } catch (err) {
      container.innerHTML = '<p style="font-size:12.5px; color:#9a927c;">Couldn\'t load right now — please refresh the page.</p>';
    }
  }
  function loadDocuments(){ return loadPdfFolder(GITHUB_DOCS_PATH, 'docList', 'No documents uploaded yet.'); }
  function loadMinutes(){ return loadPdfFolder('minutes', 'minutesList', 'No minutes have been added yet.'); }

  function openInternalLightbox(idx){
    if (!INTERNAL_PHOTO_DATA[idx]) return;
    document.getElementById('lightboxImg').src = INTERNAL_PHOTO_DATA[idx].url;
    document.getElementById('lightbox').classList.add('active');
  }
  // ==========================================
  // RESTORED ADMIN FILE MANAGEMENT FUNCTIONS
  // ==========================================
  
  async function loadActivityLog() {
    const tbody = document.getElementById('adminActivityLogTableBody');
    if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#9a927c;">No activity recorded yet.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(entry => `
        <tr>
          <td style="font-size:11px; white-space:nowrap;">${entry.created_at ? new Date(entry.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</td>
          <td style="font-size:12px;">${escapeHtml(entry.actor)}</td>
          <td style="font-size:12.5px; font-weight:600; color:var(--indigo);">${escapeHtml(entry.action)}</td>
          <td style="font-size:12px; color:#5c563f;">${escapeHtml(entry.details || '')}</td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--sindoor);">Error loading activity log.</td></tr>';
    }
  }

  async function clearOldActivityLog() {
    if (!confirm('Delete all activity log entries older than 90 days? This cannot be undone.')) return;
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseClient.from('activity_log').delete().lt('created_at', cutoff);
      if (error) throw error;
      loadActivityLog();
      alert('Old activity log entries cleared.');
    } catch (err) {
      alert('Error clearing activity log: ' + err.message);
    }
  }

  async function loadStorageUsage() {
    const container = document.getElementById('storageUsageSummary');
    if (!container) return;
    container.innerHTML = '<p style="font-size:12.5px; color:#9a927c;">Scanning storage folders…</p>';

    const folders = [
      { path: 'member-photos', label: 'Member Photos' },
      { path: 'membership-photos', label: 'Membership Application Photos' },
      { path: 'event-backgrounds', label: 'Event Backgrounds' },
      { path: 'internal-photos', label: 'Gallery / Internal Photos' },
      { path: 'documents', label: 'Documents (PDFs)' }
    ];

    function formatBytes(bytes) {
      if (!bytes) return '0 KB';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    try {
      const results = await Promise.all(folders.map(f =>
        supabaseClient.storage.from('club_files').list(f.path, { limit: 1000 })
      ));

      let grandTotalBytes = 0;
      let grandTotalFiles = 0;
      let rows = '';

      results.forEach((res, i) => {
        const files = (res.data || []).filter(f => f.name && f.name !== '.emptyFolderPlaceholder');
        const totalBytes = files.reduce((sum, f) => sum + (f.metadata && f.metadata.size ? f.metadata.size : 0), 0);
        grandTotalBytes += totalBytes;
        grandTotalFiles += files.length;
        rows += `
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);">
            <span style="font-size:13px;">${folders[i].label}</span>
            <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:#5c563f;">${files.length} file(s) &middot; ${formatBytes(totalBytes)}</span>
          </div>
        `;
      });

      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; padding:10px 0 14px; border-bottom:2px solid var(--indigo); margin-bottom:6px;">
          <strong style="font-size:14px; color:var(--indigo);">Total</strong>
          <strong style="font-family:'JetBrains Mono',monospace; font-size:14px; color:var(--indigo);">${grandTotalFiles} file(s) &middot; ${formatBytes(grandTotalBytes)}</strong>
        </div>
        ${rows}
      `;
    } catch (err) {
      container.innerHTML = '<p style="font-size:12.5px; color:var(--sindoor);">Error scanning storage: ' + err.message + '</p>';
    }
  }

  async function loadAdminFiles() {
    loadAdminPdfList();
    loadAdminPhotoList();
  }

  async function loadAdminPdfList() {
    const container = document.getElementById('adminDocList');
    if (!container) return;
    
    container.innerHTML = '<p style="font-size:12px; color:#9a927c;">Loading documents...</p>';
    
    try {
      const { data, error } = await supabaseClient.storage.from('club_files').list('documents/', { limit: 100 });
      if (error) throw error;
      
      const validFiles = data ? data.filter(f => f.name && f.name !== '.emptyFolderPlaceholder') : [];
      
      if (validFiles.length === 0) {
        container.innerHTML = '<p style="font-size:12px; color:#9a927c;">No documents uploaded yet.</p>';
        return;
      }
      
      container.innerHTML = validFiles.map(file => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line);">
          <span style="font-size:13px; font-family:'JetBrains Mono',monospace;">${escapeHtml(file.name)}</span>
          <button onclick="deleteStorageFile('documents/${file.name}')" style="padding:3px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer;">Delete</button>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<p style="font-size:12px; color:var(--sindoor);">Error loading documents.</p>';
    }
  }

  async function loadAdminPhotoList() {
    const container = document.getElementById('adminPhotoList');
    if (!container) return;
    
    container.innerHTML = '<p style="font-size:12px; color:#9a927c;">Loading photos...</p>';
    
    try {
      const { data, error } = await supabaseClient.storage.from('club_files').list('internal-photos/', { limit: 100 });
      if (error) throw error;
      
      const validFiles = data ? data.filter(f => f.name && f.name !== '.emptyFolderPlaceholder') : [];
      
      if (validFiles.length === 0) {
        container.innerHTML = '<p style="font-size:12px; color:#9a927c;">No internal photos uploaded yet.</p>';
        return;
      }
      
      container.innerHTML = validFiles.map(file => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line);">
          <span style="font-size:13px; font-family:'JetBrains Mono',monospace;">${escapeHtml(file.name)}</span>
          <button onclick="deleteStorageFile('internal-photos/${file.name}')" style="padding:3px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer;">Delete</button>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<p style="font-size:12px; color:var(--sindoor);">Error loading photos.</p>';
    }
  }

  async function deleteStorageFile(filePath) {
    if (!confirm("Are you sure you want to delete this file permanently?")) return;
    try {
      const { error } = await supabaseClient.storage.from('club_files').remove([filePath]);
      if (error) throw error;
      
      alert("File deleted successfully!");
      
      // Refresh the lists to make the deleted file disappear instantly
      loadAdminFiles();
      if(typeof loadDocuments === 'function') loadDocuments();
      if(typeof loadInternalPhotos === 'function') loadInternalPhotos();
    } catch (err) {
      alert("Error deleting file: " + err.message);
    }
  }
  async function loadInternalPhotos(){
    const container = document.getElementById('internalPhotosGrid');
    if (!container) return;
    try {
      let allPhotos = [];
      try {
        const { data: sbFiles, error } = await supabaseClient
          .storage
          .from('club_files')
          .list('internal-photos', { limit: 100, offset: 0, sortBy: { column: 'name', order: 'desc' } });
        if (!error && sbFiles) {
          const sbImages = sbFiles.filter(file => file.name.match(/\.(jpeg|jpg|gif|png|webp)$/i));
          const formattedSb = sbImages.map(img => {
            const { data: publicUrlData } = supabaseClient.storage.from('club_files').getPublicUrl('internal-photos/' + img.name);
            return { url: publicUrlData.publicUrl, title: "Member Upload" };
          });
          allPhotos = [...allPhotos, ...formattedSb];
        }
      } catch (sbErr) {}

      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/internal-photos`);
        if (res.ok) {
          const files = await res.json();
          const ghImages = Array.isArray(files) ? files.filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f.name)) : [];
          const formattedGh = ghImages.map(f => ({ url: f.download_url, title: formatImageTitle(f.name) }));
          allPhotos = [...allPhotos, ...formattedGh];
        }
      } catch (ghErr) {}

      if (allPhotos.length === 0) {
        container.innerHTML = '<p style="font-size:12.5px; color:#9a927c;">No internal photos uploaded yet.</p>';
        return;
      }

      INTERNAL_PHOTO_DATA = allPhotos;
      container.innerHTML = allPhotos.map((img, i) => `
        <div class="ph ph-auto" data-cap="${img.title}" onclick="openInternalLightbox(${i})" style="cursor:pointer; overflow:hidden; border-radius:6px;">
          <img src="${img.url}" alt="${img.title}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<p style="font-size:12.5px; color:#9a927c;">Couldn\'t load photos right now — please refresh.</p>';
    }
  }
  // ==========================================
  // COMPLETE ADMIN UPLOAD & MEDIA MANAGER
  // ==========================================
  async function handleAdminUpload(event, type) {
    event.preventDefault(); 
    const btn = event.target.querySelector('button'); 
    const originalBtnText = btn.textContent; 
    btn.textContent = 'UPLOADING...'; 
    btn.disabled = true;

    try {
      if (type === 'document' || type === 'image') {
        const fileInput = type === 'document' ? document.getElementById('adminDoc') : document.getElementById('adminImg'); 
        let file = fileInput.files[0]; 
        if (!file) throw new Error("No file selected.");
        if (type === 'image') file = await compressImageFile(file);

        const fileExt = file.name.split('.').pop(); 
        const safeName = file.name.replace(/[^a-zA-Z0-9]/g, '_'); 
        const fileName = `${Date.now()}_${safeName}.${fileExt}`; 
        const filePath = `${type === 'document' ? 'documents/' : 'internal-photos/'}${fileName}`;

        const { error } = await supabaseClient.storage.from('club_files').upload(filePath, file); 
        if (error) throw error; 
        alert(`${type === 'document' ? 'PDF' : 'Image'} uploaded successfully!`); 
        loadAdminFiles();
      }
      event.target.reset(); 
    } catch (err) { 
      alert(`Upload failed: ${err.message}`); 
    } finally { 
      btn.textContent = originalBtnText; 
      btn.disabled = false; 
    }
  }

  function loadAdminFiles() {
    loadAdminPdfList();
    loadAdminPhotoList();
  }

  async function loadAdminPdfList() {
    const container = document.getElementById('adminDocList'); 
    if (!container) return;
    container.innerHTML = '<p style="font-size:12px; color:#9a927c;">Loading documents...</p>';
    try {
      const { data, error } = await supabaseClient.storage.from('club_files').list('documents/', { limit: 100 }); 
      if (error) throw error;
      const validFiles = data ? data.filter(f => f.name && f.name !== '.emptyFolderPlaceholder') : [];
      if (validFiles.length === 0) { container.innerHTML = '<p style="font-size:12px; color:#9a927c;">No documents uploaded yet.</p>'; return; }
      container.innerHTML = validFiles.map(file => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line);">
          <span style="font-size:13px; font-family:'JetBrains Mono',monospace;">${escapeHtml(file.name)}</span>
          <button onclick="deleteStorageFile('documents/${file.name}')" style="padding:3px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer;">Delete</button>
        </div>
      `).join('');
    } catch (err) { container.innerHTML = '<p style="font-size:12px; color:var(--sindoor);">Error loading documents.</p>'; }
  }

  async function loadAdminPhotoList() {
    const container = document.getElementById('adminPhotoList'); 
    if (!container) return;
    container.innerHTML = '<p style="font-size:12px; color:#9a927c;">Loading photos...</p>';
    try {
      const { data, error } = await supabaseClient.storage.from('club_files').list('internal-photos/', { limit: 100 }); 
      if (error) throw error;
      const validFiles = data ? data.filter(f => f.name && f.name !== '.emptyFolderPlaceholder') : [];
      if (validFiles.length === 0) { container.innerHTML = '<p style="font-size:12px; color:#9a927c;">No internal photos uploaded yet.</p>'; return; }
      container.innerHTML = validFiles.map(file => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line);">
          <span style="font-size:13px; font-family:'JetBrains Mono',monospace;">${escapeHtml(file.name)}</span>
          <button onclick="deleteStorageFile('internal-photos/${file.name}')" style="padding:3px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; font-size:11px; cursor:pointer;">Delete</button>
        </div>
      `).join('');
    } catch (err) { container.innerHTML = '<p style="font-size:12px; color:var(--sindoor);">Error loading photos.</p>'; }
  }

  async function deleteStorageFile(filePath) {
    if (!confirm("Are you sure you want to delete this file permanently?")) return;
    try {
      const { error } = await supabaseClient.storage.from('club_files').remove([filePath]); 
      if (error) throw error;
      logActivity('Deleted storage file', filePath);
      alert("File deleted successfully!");
      loadAdminFiles();
      if(typeof loadDocuments === 'function') loadDocuments();
      if(typeof loadInternalPhotos === 'function') loadInternalPhotos();
    } catch (err) { alert("Error deleting file: " + err.message); }
  }

  // --- NOTICES ADMIN MANAGER ---
  let adminNoticesCache = [];
  async function loadAdminNoticesTable() {
    const tbody = document.getElementById('adminNoticesTableBody'); if (!tbody) return;
    try {
      const { data, error } = await supabaseClient.from('notices').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      adminNoticesCache = data || [];
      if (adminNoticesCache.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No notices found.</td></tr>'; return; }
      tbody.innerHTML = adminNoticesCache.map((n, i) => `<tr><td style="font-size:11px;">${escapeHtml(n.date)}</td><td>${escapeHtml(n.text)}</td><td style="white-space:nowrap;"><button onclick="editNotice(${i})" style="padding:4px 8px; background:var(--marigold); color:var(--indigo); border:none; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">Edit</button><button onclick="deleteNotice('${n.id}')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button></td></tr>`).join('');
    } catch (err) { tbody.innerHTML = '<tr><td colspan="3" style="color:var(--sindoor);">Error loading notices.</td></tr>'; }
  }

  function editNotice(idx) {
    const n = adminNoticesCache[idx];
    if (!n) return;
    
    // Fallback to index if id doesn't exist yet in Supabase row
    document.getElementById('editNoticeId').value = n.id || ''; 
    document.getElementById('noticeText').value = n.text || '';
    
    document.getElementById('noticeSaveBtn').textContent = "UPDATE NOTICE"; 
    document.getElementById('noticeCancelBtn').style.display = "inline-block"; 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetNoticeForm() {
    document.getElementById('editNoticeId').value = ''; document.getElementById('noticeText').value = '';
    document.getElementById('noticeSaveBtn').textContent = "POST NOTICE"; document.getElementById('noticeCancelBtn').style.display = "none";
  }

  async function handleNoticeSave(event) {
    event.preventDefault(); const id = document.getElementById('editNoticeId').value; const text = document.getElementById('noticeText').value.trim(); const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const btn = document.getElementById('noticeSaveBtn'); const originalText = btn.textContent; btn.textContent = 'SAVING...'; btn.disabled = true;
    try {
      if (id) { const { error } = await supabaseClient.from('notices').update({ text: text }).eq('id', id); if (error) throw error; alert('Notice updated successfully!'); } 
      else { const { error } = await supabaseClient.from('notices').insert([{ text: text, date: today }]); if (error) throw error; alert('Notice posted successfully!'); }
      resetNoticeForm(); loadAdminNoticesTable(); loadNotices();
    } catch (err) { alert("Error saving notice: " + err.message); } finally { btn.textContent = originalText; btn.disabled = false; }
  }

  async function deleteNotice(id) {
    if (!confirm("Are you sure you want to delete this notice?")) return;
    try { const { error } = await supabaseClient.from('notices').delete().eq('id', id); if (error) throw error; logActivity('Deleted notice', 'id ' + id); loadAdminNoticesTable(); loadNotices(); } catch (err) { alert("Error deleting notice: " + err.message); }
  }

  // --- MAGAZINE ADMIN MANAGER ---
  let adminMagazineCache = [];
  async function loadAdminMagazineTable() {
    const container = document.getElementById('adminMagazineTableBody'); if (!container) return;
    try {
      const { data, error } = await supabaseClient.from('magazine_posts').select('*').order('id', { ascending: false });
      if (error) throw error;
      adminMagazineCache = data || [];
      if (adminMagazineCache.length === 0) { container.innerHTML = '<p style="padding:16px; font-size:12px;">No posts found.</p>'; return; }
      container.innerHTML = adminMagazineCache.map((p, i) => `<div style="padding:12px 16px; border-bottom:1px solid var(--line);"><strong style="color:var(--indigo); font-size:14px; display:block; margin-bottom:4px;">${escapeHtml(p.title)}</strong><span style="font-size:11px; color:#7a7260;">By ${escapeHtml(p.author)} &middot; ${escapeHtml(p.date)}</span><div style="margin-top:8px;"><button onclick="editAdminMagazine(${i})" style="padding:4px 8px; background:var(--marigold); color:var(--indigo); border:none; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">Edit</button><button onclick="deleteAdminMagazine('${p.id}')" style="padding:4px 8px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Delete</button></div></div>`).join('');
    } catch (err) { container.innerHTML = '<p style="padding:16px; color:var(--sindoor);">Error loading posts.</p>'; }
  }

  function editAdminMagazine(idx) {
    const p = adminMagazineCache[idx];
    document.getElementById('editAdminMagazineId').value = p.id; document.getElementById('adminMagAuthor').value = p.author; document.getElementById('adminMagTitle').value = p.title; document.getElementById('adminMagCategory').value = p.category; document.getElementById('adminMagDesignation').value = p.designation;
    if (window.adminQuill) { window.adminQuill.clipboard.dangerouslyPasteHTML(p.content || ''); }
    document.getElementById('adminMagSaveBtn').textContent = "UPDATE POST"; document.getElementById('adminMagCancelBtn').style.display = "inline-block"; window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetAdminMagazineForm() {
    document.getElementById('editAdminMagazineId').value = ''; document.getElementById('adminMagAuthor').value = ''; document.getElementById('adminMagTitle').value = ''; document.getElementById('adminMagCategory').value = ''; document.getElementById('adminMagDesignation').value = '';
    if (window.adminQuill) window.adminQuill.setContents([]);
    document.getElementById('adminMagSaveBtn').textContent = "PUBLISH POST"; document.getElementById('adminMagCancelBtn').style.display = "none";
  }

  async function handleAdminMagazineSave(event) {
    event.preventDefault();
    const id = document.getElementById('editAdminMagazineId').value; const author = document.getElementById('adminMagAuthor').value.trim(); const title = document.getElementById('adminMagTitle').value.trim(); const category = document.getElementById('adminMagCategory').value; const designation = document.getElementById('adminMagDesignation').value; const content = window.adminQuill ? window.adminQuill.root.innerHTML : '';
    if (window.adminQuill && window.adminQuill.getText().trim().length === 0) { alert("Please write something in the editor before saving."); return; }
    const btn = document.getElementById('adminMagSaveBtn'); const origText = btn.textContent; btn.textContent = 'SAVING...'; btn.disabled = true;
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    try {
      if (id) { const { error } = await supabaseClient.from('magazine_posts').update({ author, title, category, designation, content }).eq('id', id); if (error) throw error; logActivity('Updated magazine post', title); alert("Post updated successfully!"); } 
      else { const { error } = await supabaseClient.from('magazine_posts').insert([{ author, title, category, designation, content, date: today }]); if (error) throw error; logActivity('Published magazine post', title); alert("Post published successfully!"); }
      resetAdminMagazineForm(); loadAdminMagazineTable(); loadMagazine(); loadMemberMagazineManager();
    } catch (err) { alert("Error saving post: " + err.message); } finally { btn.textContent = origText; btn.disabled = false; }
  }

  async function deleteAdminMagazine(id) {
    if (!confirm("Are you sure you want to delete this magazine post?")) return;
    const p = adminMagazineCache.find(x => String(x.id) === String(id));
    try { const { error } = await supabaseClient.from('magazine_posts').delete().eq('id', id); if (error) throw error; logActivity('Deleted magazine post', p ? p.title : ('id ' + id)); loadAdminMagazineTable(); loadMagazine(); loadMemberMagazineManager(); } catch (err) { alert("Error deleting post: " + err.message); }
  }
     
  document.querySelectorAll('.yr-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.yr-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.fy-panel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.fy).classList.add('active');
    });
  });
     
