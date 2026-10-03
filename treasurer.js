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

  
  // =====================================================================
  // PAYMENT CLAIMS — members self-report a UTR after paying via UPI;
  // Treasurer verifies against the bank/UPI statement here, which then
  // auto-creates the member_donations row from the claim's own stored
  // data (name, month, fy_year) — never hand-typed, so it can't drift
  // from what the member actually sees on My Account.
  // =====================================================================

  export async function loadPaymentClaims() {
    const container = document.getElementById('treasurerPaymentClaimsContainer');
    if (!container) return;
    try {
      const { data, error } = await supabaseClient
        .from('payment_claims')
        .select('*')
        .eq('status', 'Pending Verification')
        .order('created_at', { ascending: true });
      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = '<p style="font-size:13px; color:#9a927c;">No payment claims awaiting verification.</p>';
        return;
      }

      container.innerHTML = `<table class="gb-table"><thead><tr><th>Submitted</th><th>Member</th><th>Month</th><th>FY Year</th><th>Amount</th><th>UTR</th><th>Action</th></tr></thead><tbody>${
        data.map(c => `
          <tr>
            <td>${escapeHtml(new Date(c.created_at).toLocaleDateString())}</td>
            <td><strong>${escapeHtml(c.member_name)}</strong></td>
            <td>${escapeHtml(c.month)}</td>
            <td>${escapeHtml(c.fy_year)}</td>
            <td>₹${escapeHtml(String(c.amount))}</td>
            <td style="font-family:'JetBrains Mono',monospace; font-size:11.5px;">${escapeHtml(c.utr)}</td>
            <td style="white-space:nowrap;">
              <button onclick="confirmPaymentClaim(${c.id})" style="padding:4px 10px; background:var(--leaf); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">Confirm</button>
              <button onclick="rejectPaymentClaim(${c.id})" style="padding:4px 10px; background:var(--sindoor); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Reject</button>
            </td>
          </tr>
        `).join('')
      }</tbody></table>`;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--sindoor); font-size:13px;">Error loading payment claims: ${err.message}</p>`;
    }
  }

  async function confirmPaymentClaim(claimId) {
    if (!confirm('Confirm this payment? This will mark it Paid in member_donations using the details exactly as the member submitted them.')) return;
    try {
      const { data: claim, error: fetchErr } = await supabaseClient.from('payment_claims').select('*').eq('id', claimId).single();
      if (fetchErr) throw fetchErr;
      if (!claim) throw new Error('Claim not found — it may have already been handled.');

      const { data: { user } } = await supabaseClient.auth.getUser();

      const { error: insertErr } = await supabaseClient.from('member_donations').insert([{
        member_name: claim.member_name,
        month: claim.month,
        fy_year: claim.fy_year,
        amount: claim.amount,
        status: 'Paid (UPI, verified)'
      }]);
      if (insertErr) throw insertErr;

      const { error: updateErr } = await supabaseClient.from('payment_claims').update({
        status: 'Verified',
        verified_at: new Date().toISOString(),
        verified_by: user ? user.email : null
      }).eq('id', claimId);
      if (updateErr) throw updateErr;

      logActivity('Verified payment claim', `${claim.member_name} — ${claim.month} ${claim.fy_year}`);
      loadPaymentClaims();
      loadTreasurerDonations();
    } catch (err) {
      alert('Error confirming claim: ' + err.message);
    }
  }

  async function rejectPaymentClaim(claimId) {
    const reason = prompt("Reject this claim? Optionally note why (e.g. UTR not found in statement) — this is just for your own record:");
    if (reason === null) return; // cancelled
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      const { error } = await supabaseClient.from('payment_claims').update({
        status: 'Rejected' + (reason ? ': ' + reason : ''),
        verified_at: new Date().toISOString(),
        verified_by: user ? user.email : null
      }).eq('id', claimId);
      if (error) throw error;
      loadPaymentClaims();
    } catch (err) {
      alert('Error rejecting claim: ' + err.message);
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
        loadPaymentClaims();
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
  window.confirmPaymentClaim = confirmPaymentClaim;
  window.rejectPaymentClaim = rejectPaymentClaim;
