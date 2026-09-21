// =====================================================================
// MY-ACCOUNT.JS — Personal member dashboard: self-registration, phone +
// password login, own dues status, magazine submission under verified
// name, and editable profile. Requires common.js to be loaded first,
// and the member-account-migration.sql functions to exist in Supabase.
// =====================================================================

import { escapeHtml, GITHUB_DOCS_PATH, loadNotices, loadPdfFolder, logActivity, supabaseClient } from './common.js';
import { generateMemberIdCard, loadInternalPhotos } from './member.js';

let myAccountToken = null;
let currentMyAccountMember = null;
let maQuill;

// --- Startup work this portal needs when the page first loads ---
document.addEventListener('app:init', function() {
  if (document.getElementById('myAccountQuillEditor')) {
    maQuill = new Quill('#myAccountQuillEditor', {
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

// Fires after common.js's showPage() switches to this page.
document.addEventListener('page:shown', function(e) {
  if (e.detail.name === 'my-account') {
    loadMyAccountRegisterDropdown();
  }
});


async function loadMyAccountRegisterDropdown() {
  const selects = [document.getElementById('maRegName'), document.getElementById('maForgotName')].filter(Boolean);
  if (selects.length === 0) return;
  try {
    const { data, error } = await supabaseClient
      .from('members_directory_public')
      .select('name')
      .order('name', { ascending: true });
    if (error) throw error;
    const optionsHtml = '<option value="">Select your name from directory</option>' +
      (data || []).map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    selects.forEach(sel => { sel.innerHTML = optionsHtml; });
  } catch (err) {
    selects.forEach(sel => { sel.innerHTML = '<option value="">Error loading directory</option>'; });
  }
}


function switchMyAccountGateTab(tab) {
  const track = document.getElementById('maTabTrack');
  if (track) track.dataset.active = tab;
  document.getElementById('maLoginPanel').classList.toggle('is-active', tab === 'login');
  document.getElementById('maRegisterPanel').classList.toggle('is-active', tab === 'register');
  document.getElementById('maForgotPanel').classList.remove('is-active');
  if (track) track.style.display = 'flex';
}

function toggleForgotPasswordPanel(show) {
  document.getElementById('maForgotPanel').classList.toggle('is-active', show);
  document.getElementById('maLoginPanel').classList.toggle('is-active', !show);
  const track = document.getElementById('maTabTrack');
  if (track) track.style.display = show ? 'none' : 'flex';
}

// Keep phone fields to exactly 10 digits — no +91, no spaces, no dashes.
function sanitizePhoneInput(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener('input', () => {
    inputEl.value = inputEl.value.replace(/\D/g, '').slice(0, 10);
  });
}
document.addEventListener('app:init', function() {
  ['maRegPhone', 'maLoginPhone', 'maForgotPhone', 'maProfilePhone'].forEach(id => {
    sanitizePhoneInput(document.getElementById(id));
  });
});


async function myAccountRegister() {
  const memberName = document.getElementById('maRegName').value;
  const phone = document.getElementById('maRegPhone').value.trim();
  const pw = document.getElementById('maRegPassword').value;
  const pwConfirm = document.getElementById('maRegPasswordConfirm').value;
  const errorEl = document.getElementById('maRegError');
  const successEl = document.getElementById('maRegSuccess');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!memberName) { errorEl.textContent = 'Please select your name.'; errorEl.style.display = 'block'; return; }
  if (!/^\d{10}$/.test(phone)) { errorEl.textContent = 'Enter exactly 10 digits, with no +91, spaces, or dashes.'; errorEl.style.display = 'block'; return; }
  if (pw.length < 6) { errorEl.textContent = 'Password must be at least 6 characters.'; errorEl.style.display = 'block'; return; }
  if (pw !== pwConfirm) { errorEl.textContent = 'Passwords do not match.'; errorEl.style.display = 'block'; return; }

  const btn = document.getElementById('maRegBtn');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<span class="ma-btn-spinner"></span>CREATING...';
  btn.disabled = true;

  try {
    const { data: memberRow, error: lookupErr } = await supabaseClient
      .from('members_directory_public').select('id').eq('name', memberName).single();
    if (lookupErr || !memberRow) throw new Error('Could not find that member in the directory.');

    const { data, error } = await supabaseClient.rpc('register_member_account', {
      p_member_id: memberRow.id, p_phone: phone, p_password: pw
    });
    if (error) throw error;

    if (data === 'phone_mismatch') {
      errorEl.textContent = "That phone number doesn't match our record for this member. Please contact the Admin if you think this is wrong.";
      errorEl.style.display = 'block';
      return;
    }
    if (data === 'already_registered') {
      errorEl.textContent = 'An account already exists for this member. Try logging in instead, or ask Admin to reset it.';
      errorEl.style.display = 'block';
      return;
    }
    if (data === 'password_too_short') {
      errorEl.textContent = 'Password must be at least 6 characters.';
      errorEl.style.display = 'block';
      return;
    }

    successEl.textContent = 'Account created! You can now log in with your phone number and password.';
    successEl.style.display = 'block';
    document.getElementById('maRegPassword').value = '';
    document.getElementById('maRegPasswordConfirm').value = '';
    setTimeout(() => switchMyAccountGateTab('login'), 1500);
  } catch (err) {
    errorEl.textContent = 'Error: ' + err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}


async function requestPasswordReset() {
  const memberName = document.getElementById('maForgotName').value;
  const phone = document.getElementById('maForgotPhone').value.trim();
  const statusEl = document.getElementById('maForgotStatus');
  statusEl.style.display = 'none';

  if (!memberName) {
    statusEl.className = 'ma-msg error';
    statusEl.textContent = 'Please select your name.';
    statusEl.style.display = 'block';
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    statusEl.className = 'ma-msg error';
    statusEl.textContent = 'Enter exactly 10 digits, with no +91, spaces, or dashes.';
    statusEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('maForgotBtn');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<span class="ma-btn-spinner"></span>SENDING...';
  btn.disabled = true;

  try {
    const { data: memberRow, error: lookupErr } = await supabaseClient
      .from('members_directory_public').select('id').eq('name', memberName).single();
    if (lookupErr || !memberRow) throw new Error('Could not find that member in the directory.');

    const { data, error } = await supabaseClient.rpc('request_password_reset', {
      p_member_id: memberRow.id, p_phone: phone
    });
    if (error) throw error;

    statusEl.style.display = 'block';
    if (data === 'ok') {
      statusEl.className = 'ma-msg success';
      statusEl.textContent = 'Request sent. An admin will approve it, then you can register a new password.';
      document.getElementById('maForgotPhone').value = '';
    } else if (data === 'phone_mismatch') {
      statusEl.className = 'ma-msg error';
      statusEl.textContent = "That phone number doesn't match our record for this member.";
    } else if (data === 'already_pending') {
      statusEl.className = 'ma-msg warn';
      statusEl.textContent = 'A reset request for this member is already waiting on admin approval.';
    }
  } catch (err) {
    statusEl.className = 'ma-msg error';
    statusEl.style.display = 'block';
    statusEl.textContent = 'Error: ' + err.message;
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}


async function myAccountLogin() {
  const phone = document.getElementById('maLoginPhone').value.trim();
  const pw = document.getElementById('maLoginPassword').value;
  const errorEl = document.getElementById('maLoginError');
  errorEl.style.display = 'none';

  if (!phone || !pw) {
    errorEl.textContent = 'Please enter your phone number and password.';
    errorEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('maLoginBtn');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<span class="ma-btn-spinner"></span>LOGGING IN...';
  btn.disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc('member_login', { p_phone: phone, p_password: pw });
    if (error) throw error;
    if (!data || data.length === 0) {
      errorEl.textContent = 'Incorrect phone number or password.';
      errorEl.style.display = 'block';
      return;
    }
    const session = data[0];
    myAccountToken = session.token;
    logActivity('Logged in', 'My Account — ' + session.name);
    await enterMyAccountDashboard();
  } catch (err) {
    errorEl.textContent = 'Error: ' + err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}


async function enterMyAccountDashboard() {
  try {
    const { data, error } = await supabaseClient.rpc('member_session_lookup', { p_token: myAccountToken });
    if (error) throw error;
    if (!data || data.length === 0) return false;
    const m = data[0];
    currentMyAccountMember = m;

    document.getElementById('myAccountGate').style.display = 'none';
    document.getElementById('myAccountContent').style.display = 'block';
    document.getElementById('myAccountLogoutBtn').style.display = 'inline-flex';

    document.getElementById('maDuesName').textContent = 'My Dues — ' + m.name;
    document.getElementById('maProfileName').value = m.name || '';
    document.getElementById('maProfileAddress').value = m.address || '';
    document.getElementById('maProfileOccupation').value = m.occupation || '';
    document.getElementById('maProfilePhone').value = m.phone || '';
    document.getElementById('maProfileBio').value = m.bio || '';
    updateMyAccountAvatarDisplays(m.photo_url);

    loadMyAccountDues(m.name);
    return true;
  } catch (err) {
    return false;
  }
}


// Shows the member's photo (or a placeholder icon) in the dashboard
// header and on the Profile tab, wherever those elements exist.
function updateMyAccountAvatarDisplays(photoUrl) {
  document.querySelectorAll('.ma-avatar-img').forEach(img => {
    if (photoUrl) { img.src = photoUrl; img.style.display = 'block'; }
    else { img.style.display = 'none'; }
  });
  document.querySelectorAll('.ma-avatar-placeholder').forEach(el => {
    el.style.display = photoUrl ? 'none' : 'flex';
  });
}


// Compress + shrink an image client-side and hand back a small base64
// JPEG data URL — stored directly in members_directory.photo_url via
// the RPC below, so no Supabase Storage bucket/permissions are needed
// (My Account never gets a real authenticated Supabase session).
function compressImageToDataUrl(file, maxDimension = 400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) { reject(new Error('Please choose an image file.')); return; }
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
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}


async function uploadMyProfilePhoto(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  const statusEl = document.getElementById('maPhotoStatus');
  statusEl.style.display = 'block';
  statusEl.className = 'ma-msg';
  statusEl.textContent = 'Uploading...';

  try {
    if (!/^image\/(jpeg|jpg)$/i.test(file.type)) {
      throw new Error('Please choose a JPG image.');
    }
    const dataUrl = await compressImageToDataUrl(file);
    const { data, error } = await supabaseClient.rpc('update_member_photo', {
      p_token: myAccountToken, p_photo_data: dataUrl
    });
    if (error) throw error;

    if (data === 'ok') {
      statusEl.className = 'ma-msg success';
      statusEl.textContent = 'Profile photo updated.';
      currentMyAccountMember.photo_url = dataUrl;
      updateMyAccountAvatarDisplays(dataUrl);
    } else {
      statusEl.className = 'ma-msg error';
      statusEl.textContent = 'Your session expired — please log in again.';
      myAccountLogout();
    }
  } catch (err) {
    statusEl.className = 'ma-msg error';
    statusEl.textContent = 'Error: ' + err.message;
  } finally {
    inputEl.value = '';
  }
}


// --- Documents, Minutes, Internal Photos & Notice Board (read-only, same
// GitHub-backed content as the shared Members Login — just its own IDs
// so both pages can exist without colliding) ---
function loadMyAccountDocsPanel() {
  loadPdfFolder(GITHUB_DOCS_PATH, 'maDocList', 'No documents uploaded yet.'); // was colliding with the shared portal's #docList
  loadPdfFolder('minutes', 'maMinutesList', 'No minutes have been added yet.');
  loadInternalPhotos('maInternalPhotosGrid');
  loadNotices(); // also fills #maNoticeList once that id exists in the page
}


// --- Members Directory (full details) — only members with a valid
// session can see this; goes through a security-definer RPC so the
// anon browser key never queries members_directory directly. ---
async function loadMyAccountDirectory() {
  const tbody = document.getElementById('maDirectoryTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#9a927c;">Loading members...</td></tr>';
  try {
    const { data, error } = await supabaseClient.rpc('member_directory_full', { p_token: myAccountToken });
    if (error) throw error;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#9a927c;">No members found.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map((m, i) => `
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
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--sindoor);">Error loading members.</td></tr>`;
  }
}


// --- Member ID Card — reuses the exact same PDF generator the Admin
// dashboard already uses, just always pointed at your own record. ---
function waitForJsPdf(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (window.jspdf) { resolve(true); return; }
    const start = Date.now();
    const check = setInterval(() => {
      if (window.jspdf) {
        clearInterval(check);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(check);
        resolve(false);
      }
    }, 200);
  });
}

async function downloadMyIdCard() {
  if (!currentMyAccountMember) {
    alert('Your session data isn\'t loaded yet — please log out and log back in, then try again.');
    return;
  }
  const ready = await waitForJsPdf();
  if (!ready) {
    alert('The PDF library failed to load from the CDN. Check your internet connection, or that an ad-blocker isn\'t blocking cdnjs.cloudflare.com, then reload the page and try again.');
    return;
  }
  generateMemberIdCard({ ...currentMyAccountMember, id: currentMyAccountMember.member_id });
}


// Dues table mirrors the public "Individual Member Status" lookup, but is
// always scoped to the logged-in member's own name — never anyone else's.
async function loadMyAccountDues(memberName) {
  const container = document.getElementById('maDuesContainer');
  if (!container) return;
  const monthsList = ["April","May","June","July","August","September","October","November","December","January","February","March"];
  const fyYear = "2026-2027";
  const defaultAmount = 25;

  try {
    const { data, error } = await supabaseClient.from('member_donations').select('*').eq('member_name', memberName).eq('fy_year', fyYear).order('id', { ascending: true });
    if (error) throw error;

    // Ordered oldest -> newest, so if a member has more than one row for the
    // same month (a correction, a duplicate entry), the LAST one processed
    // here is always the most recent — no more random paid/due flips.
    let paidMonthsMap = {};
    (data || []).forEach(d => { if (d.status && d.status.includes('Paid')) paidMonthsMap[d.month] = d; });

    let html = '<table class="gb-table"><thead><tr><th>FY Year</th><th>Month</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>';
    monthsList.forEach(m => {
      const record = paidMonthsMap[m];
      const isPaid = !!record;
      const amount = record ? record.amount : defaultAmount;
      const statusText = isPaid ? record.status : 'Due';
      html += `<tr>
        <td><strong>${fyYear}</strong></td>
        <td>${m}</td>
        <td>₹${amount}</td>
        <td><span style="color:${isPaid ? 'var(--leaf)' : 'var(--sindoor)'}; font-weight:bold;">${statusText} ${isPaid ? '✓' : '⚠️'}</span></td>
        <td>${isPaid
          ? `<button onclick="downloadSinglePdfReceipt('${fyYear}', '${m}', '${escapeHtml(memberName)}', '${amount}')" style="padding:4px 10px; background:var(--marigold); color:var(--indigo); border:none; border-radius:4px; font-size:11px; cursor:pointer;"><i class="fas fa-file-pdf"></i> Receipt</button>`
          : `<a href="upi://pay?pa=8972217940m@pnb&pn=Dihibaliharpur%20Tarun%20Sangha&cu=INR&am=${amount}&tn=Club%20Dues%20${m}" target="_blank" style="padding:4px 8px; background:#27ae60; color:#fff; border-radius:4px; font-size:10.5px; text-decoration:none;"><i class="fas fa-qrcode"></i> Pay Online</a>`
        }</td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--sindoor); font-size:13px;">Error loading dues: ${err.message}</p>`;
  }
}


async function submitMyAccountMagazinePost(event) {
  event.preventDefault();
  const form = event.target;
  const btn = document.getElementById('myAccountMagazineBtn');
  const status = document.getElementById('myAccountMagazineStatus');
  const richTextContent = DOMPurify.sanitize(maQuill ? maQuill.root.innerHTML : '');

  if (maQuill && maQuill.getText().trim().length === 0) {
    alert('Please write something in the editor before publishing.');
    return;
  }

  const memberName = document.getElementById('maProfileName').value;
  const originalBtnText = btn.textContent;
  btn.textContent = 'PUBLISHING...';
  btn.disabled = true;
  status.style.display = 'none';

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  try {
    const { error } = await supabaseClient.from('magazine_posts').insert([{
      author: memberName,
      title: form.title.value,
      category: form.category.value,
      designation: 'Member',
      content: richTextContent,
      date: today
    }]);
    if (error) throw error;

    status.style.display = 'block';
    status.style.background = 'rgba(51,85,63,0.12)';
    status.style.color = 'var(--leaf)';
    status.textContent = 'Successfully published! Check the Bibhas tab.';
    form.reset();
    if (maQuill) maQuill.setContents([]);
  } catch (err) {
    status.style.display = 'block';
    status.style.background = 'rgba(181,41,46,0.12)';
    status.style.color = 'var(--sindoor)';
    status.textContent = 'Error publishing: ' + err.message;
  } finally {
    btn.textContent = originalBtnText;
    btn.disabled = false;
  }
}


async function saveMyAccountProfile(event) {
  event.preventDefault();
  const statusEl = document.getElementById('maProfileStatus');
  statusEl.style.display = 'none';

  const address = document.getElementById('maProfileAddress').value.trim();
  const occupation = document.getElementById('maProfileOccupation').value.trim();
  const phone = document.getElementById('maProfilePhone').value.trim();
  const bio = document.getElementById('maProfileBio').value.trim();

  try {
    const { data, error } = await supabaseClient.rpc('update_member_profile', {
      p_token: myAccountToken,
      p_address: address || null,
      p_occupation: occupation || null,
      p_phone: phone || null,
      p_bio: bio || null
    });
    if (error) throw error;

    statusEl.style.display = 'block';
    if (data === 'ok') {
      statusEl.style.background = 'rgba(51,85,63,0.12)';
      statusEl.style.color = 'var(--leaf)';
      statusEl.textContent = 'Profile updated successfully.';
    } else {
      statusEl.style.background = 'rgba(181,41,46,0.12)';
      statusEl.style.color = 'var(--sindoor)';
      statusEl.textContent = 'Your session expired — please log in again.';
      myAccountLogout();
    }
  } catch (err) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(181,41,46,0.12)';
    statusEl.style.color = 'var(--sindoor)';
    statusEl.textContent = 'Error: ' + err.message;
  }
}


function switchMyAccountTab(tabId) {
  document.querySelectorAll('#myAccountContent .member-portal-panel').forEach(p => p.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';

  if (tabId === 'ma-tab-docs') loadMyAccountDocsPanel();
  if (tabId === 'ma-tab-directory') loadMyAccountDirectory();
}


async function myAccountLogout() {
  if (myAccountToken) {
    try { await supabaseClient.rpc('member_logout', { p_token: myAccountToken }); } catch (e) { /* ignore */ }
  }
  myAccountToken = null;
  currentMyAccountMember = null;
  document.getElementById('myAccountGate').style.display = 'block';
  document.getElementById('myAccountContent').style.display = 'none';
  document.getElementById('myAccountLogoutBtn').style.display = 'none';
  document.getElementById('maLoginPhone').value = '';
  document.getElementById('maLoginPassword').value = '';
  updateMyAccountAvatarDisplays(null);
  switchMyAccountGateTab('login');
}


// --- Expose functions called directly from inline HTML event handlers ---
// (ES modules don't add top-level declarations to `window` automatically.)
window.switchMyAccountGateTab = switchMyAccountGateTab;
window.toggleForgotPasswordPanel = toggleForgotPasswordPanel;
window.requestPasswordReset = requestPasswordReset;
window.myAccountRegister = myAccountRegister;
window.myAccountLogin = myAccountLogin;
window.submitMyAccountMagazinePost = submitMyAccountMagazinePost;
window.saveMyAccountProfile = saveMyAccountProfile;
window.switchMyAccountTab = switchMyAccountTab;
window.myAccountLogout = myAccountLogout;
window.downloadMyIdCard = downloadMyIdCard;
window.uploadMyProfilePhoto = uploadMyProfilePhoto;
