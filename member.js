// =====================================================================
// MEMBER.JS — Logic for the Members-Only portal (login, ID card, dues
// lookup, internal documents/minutes/photos, magazine submissions).
// Requires common.js to be loaded first.
// =====================================================================

import { GITHUB_DOCS_PATH, GITHUB_OWNER, GITHUB_REPO, escapeHtml, generateCaptchaCode, getBase64ImageFromUrl, loadMembershipApplications, loadNotices, loadPdfFolder, logActivity, renderCaptchaCanvas, supabaseClient } from './common.js';
import { displayLightbox, formatImageTitle, loadLookupMembersDropdown, loadMagazine } from './public.js';

  let INTERNAL_PHOTO_DATA = [];
  let memberCaptchaCode = 'ABC12';
  let quill;

  // Startup work that used to live in common.js's shared init block, but only
  // this portal needs it.
  document.addEventListener('app:init', function() {
    refreshMemberCaptcha();
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
  });

  // Fires after common.js's showPage() switches to a page this portal owns.
  document.addEventListener('page:shown', function(e) {
    if (e.detail.name === 'members-only') refreshMemberCaptcha();
  });

  // Fires after common.js signs a user out of any portal.
  document.addEventListener('portal:logout', function(e) {
    if (e.detail.type === 'member') refreshMemberCaptcha();
  });


  export async function generateMemberIdCard(m) {
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


  export async function downloadSinglePdfReceipt(fy, month, member, amount) {
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


  export function refreshMemberCaptcha() {
    memberCaptchaCode = generateCaptchaCode();
    renderCaptchaCanvas('memberCaptchaBox', memberCaptchaCode);
    const input = document.getElementById('memberCaptchaInput');
    if (input) input.value = '';
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


  export async function loadMemberMagazineManager() {
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
    const richTextContent = DOMPurify.sanitize(quill ? quill.root.innerHTML : form.content.value);
    
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

  export function loadDocuments(){ return loadPdfFolder(GITHUB_DOCS_PATH, 'docList', 'No documents uploaded yet.'); }

  function loadMinutes(){ return loadPdfFolder('minutes', 'minutesList', 'No minutes have been added yet.'); }


  function openInternalLightbox(idx){
    if (!INTERNAL_PHOTO_DATA[idx]) return;
    displayLightbox(INTERNAL_PHOTO_DATA[idx].url, INTERNAL_PHOTO_DATA[idx].title);
  }

  export async function loadInternalPhotos(){
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
        <div class="ph ph-auto" data-cap="${img.title}" tabindex="0" role="button" aria-label="View larger: ${escapeHtml(img.title || 'photo')}" onclick="openInternalLightbox(${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openInternalLightbox(${i});}" style="cursor:pointer; overflow:hidden; border-radius:6px;">
          <img src="${img.url}" alt="${img.title}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = '<p style="font-size:12.5px; color:#9a927c;">Couldn\'t load photos right now — please refresh.</p>';
    }
  }



  // --- Expose functions called directly from inline HTML event handlers ---
  // (ES modules don't add top-level declarations to `window` automatically,
  //  so anything referenced via onclick=/onchange=/onsubmit= in the HTML,
  //  including HTML generated dynamically as template strings, needs this.)
  window.checkMemberPassword = checkMemberPassword;
  window.downloadSinglePdfReceipt = downloadSinglePdfReceipt;
  window.generateMemberIdCard = generateMemberIdCard;
  window.openInternalLightbox = openInternalLightbox;
  window.refreshMemberCaptcha = refreshMemberCaptcha;
  window.submitMagazinePost = submitMagazinePost;
  window.switchMemberTab = switchMemberTab;
