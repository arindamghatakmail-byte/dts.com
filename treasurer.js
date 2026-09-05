// =====================================================================
// TREASURER.JS — Logic specific to the Treasurer portal (login, donation
// records for the treasurer view).
// Requires common.js to be loaded first.
// =====================================================================

import { deleteDonationRecord, escapeHtml, loadMembershipApplications, logActivity, supabaseClient } from './common.js';

  // Fires after a donation is saved/deleted for the treasurer role.
  document.addEventListener('donations:changed', function(e) {
    if (e.detail.role === 'treasurer') loadTreasurerDonations();
  });


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


  export async function loadTreasurerDonations() {
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



  // --- Expose functions called directly from inline HTML event handlers ---
  // (ES modules don't add top-level declarations to `window` automatically,
  //  so anything referenced via onclick=/onchange=/onsubmit= in the HTML,
  //  including HTML generated dynamically as template strings, needs this.)
  window.checkTreasurerPassword = checkTreasurerPassword;
