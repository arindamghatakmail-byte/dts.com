// =====================================================================
// MY-ACCOUNT.JS — Personal member dashboard: self-registration, phone +
// password login, own dues status, magazine submission under verified
// name, and editable profile. Requires common.js to be loaded first,
// and the member-account-migration.sql functions to exist in Supabase.
// =====================================================================

import { escapeHtml, logActivity, supabaseClient } from './common.js';
// Note: Ensure DOMPurify is loaded globally via HTML script tag, 
// or uncomment the import below if managing via bundling/modules:
// import DOMPurify from 'dompurify';

let myAccountToken = null;
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
    restoreMyAccountSession();
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
  document.getElementById('maLoginPanel').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('maRegisterPanel').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('maTabLoginBtn').style.opacity = tab === 'login' ? '1' : '0.6';
  document.getElementById('maTabRegisterBtn').style.opacity = tab === 'register' ? '1' : '0.6';
}


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
  if (!phone) { errorEl.textContent = 'Please enter your phone number.'; errorEl.style.display = 'block'; return; }
  if (pw.length < 6) { errorEl.textContent = 'Password must be at least 6 characters.'; errorEl.style.display = 'block'; return; }
  if (pw !== pwConfirm) { errorEl.textContent = 'Passwords do not match.'; errorEl.style.display = 'block'; return; }

  const btn = document.querySelector('#maRegisterPanel button');
  const originalText = btn.textContent;
  btn.textContent = 'CREATING...';
  btn.disabled = true;

  try {
    const { data: memberRow, error: lookupErr } = await supabaseClient
      .from('members_directory_public').select('id').eq('name', memberName).single();
    if (lookupErr || !memberRow) throw new Error('Could not find that member in the directory.');

    const { data, error } = await supabaseClient.rpc('register_member_account', {
      p_member_id: memberRow.id, p_phone: phone, p_password: pw
    });
    if (error) throw error;

    // Structured conditionally to stop early returns bypassing script cleanup or success redirects
    if (data === 'phone_mismatch') {
      errorEl.textContent = "That phone number doesn't match our record for this member. Please contact the Admin if you think this is wrong.";
      errorEl.style.display = 'block';
    } else if (data === 'already_registered') {
      errorEl.textContent = 'An account already exists for this member. Try logging in instead, or ask Admin to reset it.';
      errorEl.style.display = 'block';
    } else if (data === 'password_too_short') {
      errorEl.textContent = 'Password must be at least 6 characters.';
      errorEl.style.display = 'block';
    } else {
      successEl.textContent = 'Account created! You can now log in with your phone number and password.';
      successEl.style.display = 'block';
      document.getElementById('maRegPassword').value = '';
      document.getElementById('maRegPasswordConfirm').value = '';
      setTimeout(() => switchMyAccountGateTab('login'), 1500);
    }
  } catch (err) {
    errorEl.textContent = 'Error: ' + err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.textContent = originalText;
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

  const btn = document.querySelector('#maLoginPanel button');
  const originalText = btn.textContent;
  btn.textContent = 'LOGGING IN...';
  btn.disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc('member_login', { p_phone: phone, p_password: pw });
    if (error) throw error;
    if (!data || data.length === 0) {
      errorEl.textContent = 'Incorrect phone number or password.';
      errorEl.style.display = 'block';
      return;
    }
    const session = data;
    myAccountToken = session.token;
    localStorage.setItem('dts_my_account_token', myAccountToken);
    logActivity('Logged in', 'My Account — ' + session.name);
    await enterMyAccountDashboard();
  } catch (err) {
    errorEl.textContent = 'Error: ' + err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}


async function restoreMyAccountSession() {
  const saved = localStorage.getItem('dts_my_account_token');
  if (!saved) return;
  myAccountToken = saved;
  const ok = await enterMyAccountDashboard();
  if (!ok) {
    localStorage.removeItem('dts_my_account_token');
    myAccountToken = null;
  }
}


async function enterMyAccountDashboard() {
  try {
    const { data, error } = await supabaseClient.rpc('member_session_lookup', { p_token: myAccountToken });
    if (error) throw error;
    if (!data || data.length === 0) return false;
    const m = data;

    document.getElementById('myAccountGate').style.display = 'none';
    document.getElementById('myAccountContent').style.display = 'block';
    document.getElementById('myAccountLogoutBtn').style.display = 'inline-flex';

    document.getElementById('maDuesName').textContent = 'My Dues — ' + m.name;
    document.getElementById('maProfileName').value = m.name || '';
    document.getElementById('maProfileAddress').value = m.address || '';
    document.getElementById('maProfileOccupation').value = m.occupation || '';
    document.getElementById('maProfilePhone').value = m.phone || '';
    document.getElementById('maProfileBio').value = m.bio || '';

    loadMyAccountDues(m.name);
    return true;
  } catch (err) {
    return false;
  }
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
    const { data, error } = await supabaseClient.from('member_donations').select('*').eq('member_name', memberName);
    if (error) throw error;

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
}


async function myAccountLogout() {
  if (myAccountToken) {
    try { await supabaseClient.rpc('member_logout', { p_token: myAccountToken }); } catch (e) { /* ignore */ }
  }
  localStorage.removeItem('dts_my_account_token');
  myAccountToken = null;

  document.getElementById('myAccountGate').style.display = 'block';
  document.getElementById('myAccountContent').style.display = 'none';
  document.getElementById('myAccountLogoutBtn').style.display = 'none';
  document.getElementById('maLoginPhone').value = '';
  document.getElementById('maLoginPassword').value = '';
  switchMyAccountGateTab('login');
}


// --- Expose functions called directly from inline HTML event handlers ---
window.switchMyAccountGateTab = switchMyAccountGateTab;
window.myAccountRegister = myAccountRegister;
window.myAccountLogin = myAccountLogin;
window.submitMyAccountMagazinePost = submitMyAccountMagazinePost;
window.saveMyAccountProfile = saveMyAccountProfile;
window.switchMyAccountTab = switchMyAccountTab;
window.myAccountLogout = myAccountLogout;