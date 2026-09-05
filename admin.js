// =====================================================================
// ADMIN.JS — Logic specific to the Admin Dashboard (site control, members,
// donations, finances ledger, events, RSVPs, notices, magazine moderation,
// file/media manager, activity log, storage usage, membership applications
// review controls).
// Requires common.js to be loaded first.
// NOTE: three duplicate legacy function definitions that existed in the
// original script.js (old loadAdminFiles/loadAdminPdfList/loadAdminPhotoList/
// deleteStorageFile/handleAdminUpload stubs) were dropped here — only the
// final, working versions were kept.
// =====================================================================

import { compressImageFile, deleteDonationRecord, downloadCSV, escapeHtml, fetchAndRenderFinances, financialDataCache, loadMembershipApplications, loadNotices, localDateTimeToUtcIso, logActivity, parseStoredEventDate, supabaseClient } from './common.js';
import { generateMemberIdCard, loadDocuments, loadInternalPhotos, loadMemberMagazineManager } from './member.js';
import { fetchCountdownEvents, loadCommitteeCards, loadMagazine, loadPublicMembers } from './public.js';

  // Startup work this portal needs when the page first loads.
  document.addEventListener('app:init', function() {
    if (document.getElementById('adminQuillEditor')) {
      window.adminQuill = new Quill('#adminQuillEditor', {
        theme: 'snow',
        placeholder: 'Write the story, poem, or essay here...',
        modules: { toolbar: [ [{ 'size': ['small', false, 'large', 'huge'] }], ['bold', 'italic', 'underline', 'strike'], [{ 'color': [] }, { 'background': [] }], [{ 'align': [] }], ['clean'] ] }
      });
    }
  });

  // Fires after common.js's showPage() switches to the admin dashboard.
  document.addEventListener('page:shown', function(e) {
    if (e.detail.name === 'admin') {
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
  });

  // Fires after an application is approved/rejected/deleted anywhere.
  document.addEventListener('membership:changed', function() {
    loadAdminSummaryBar();
    loadAdminMembers();
    loadAdminDonationMembersDropdown();
  });

  // Fires after common.js's fetchAndRenderFinances() loads fresh data.
  document.addEventListener('finances:updated', function(e) {
    renderFinancialLedger(e.detail);
  });

  // Fires after a donation is saved/deleted for the admin role.
  document.addEventListener('donations:changed', function(e) {
    if (e.detail.role === 'admin') loadAdminDonations();
  });


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


  // --- ADMIN RSVP VIEWER ---

  export async function loadAdminRsvps() {
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


  export async function loadAdminQueries() {
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


  export function renderFinancialLedger(data) {
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


  export async function loadAdminFinances(data = financialDataCache) {
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


  // Date object -> "YYYY-MM-DDTHH:MM" using LOCAL getters, for repopulating the datetime-local input

  function dateToLocalInputValue(d) {
    if (!d) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }


  export async function loadAdminEvents() {
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
          ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(ev.title || 'Event image')}" style="width:44px; height:44px; object-fit:cover; border-radius:6px; border:1px solid var(--line);">`
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


  export async function loadAdminSummaryBar() {
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


  export let adminMembersCache = [];


  // Resolves the admin table row index against admin's own member cache, then
  // hands the actual member record to member.js's card generator — keeps the
  // dependency one-directional (admin -> member) instead of member needing to
  // read admin's cache back.
  function openMemberIdCard(index) {
    generateMemberIdCard(adminMembersCache[index]);
  }

  export async function loadAdminMembers() {
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
            <button onclick="openMemberIdCard(${i})" style="padding:4px 8px; background:var(--indigo); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; margin-right:4px;">ID Card</button>
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


  export async function loadAdminDonationMembersDropdown() {
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


  export async function loadAdminDonations() {
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


  export function loadAdminFiles() {
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

  export async function loadAdminNoticesTable() {
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

  export async function loadAdminMagazineTable() {
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
    if (window.adminQuill) { window.adminQuill.clipboard.dangerouslyPasteHTML(DOMPurify.sanitize(p.content || '')); }
    document.getElementById('adminMagSaveBtn').textContent = "UPDATE POST"; document.getElementById('adminMagCancelBtn').style.display = "inline-block"; window.scrollTo({ top: 0, behavior: 'smooth' });
  }


  function resetAdminMagazineForm() {
    document.getElementById('editAdminMagazineId').value = ''; document.getElementById('adminMagAuthor').value = ''; document.getElementById('adminMagTitle').value = ''; document.getElementById('adminMagCategory').value = ''; document.getElementById('adminMagDesignation').value = '';
    if (window.adminQuill) window.adminQuill.setContents([]);
    document.getElementById('adminMagSaveBtn').textContent = "PUBLISH POST"; document.getElementById('adminMagCancelBtn').style.display = "none";
  }


  async function handleAdminMagazineSave(event) {
    event.preventDefault();
    const id = document.getElementById('editAdminMagazineId').value; const author = document.getElementById('adminMagAuthor').value.trim(); const title = document.getElementById('adminMagTitle').value.trim(); const category = document.getElementById('adminMagCategory').value; const designation = document.getElementById('adminMagDesignation').value; const content = window.adminQuill ? DOMPurify.sanitize(window.adminQuill.root.innerHTML) : '';
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



  // --- Expose functions called directly from inline HTML event handlers ---
  // (ES modules don't add top-level declarations to `window` automatically,
  //  so anything referenced via onclick=/onchange=/onsubmit= in the HTML,
  //  including HTML generated dynamically as template strings, needs this.)
  window.broadcastWhatsApp = broadcastWhatsApp;
  window.checkAdminPassword = checkAdminPassword;
  window.openMemberIdCard = openMemberIdCard;
  window.clearEventImage = clearEventImage;
  window.clearMemberPhoto = clearMemberPhoto;
  window.clearOldActivityLog = clearOldActivityLog;
  window.clearPastEvents = clearPastEvents;
  window.deleteAdminMagazine = deleteAdminMagazine;
  window.deleteEmergencyContact = deleteEmergencyContact;
  window.deleteEvent = deleteEvent;
  window.deleteFinanceRecord = deleteFinanceRecord;
  window.deleteMember = deleteMember;
  window.deleteNotice = deleteNotice;
  window.deleteQuery = deleteQuery;
  window.deleteRsvp = deleteRsvp;
  window.deleteStorageFile = deleteStorageFile;
  window.editAdminMagazine = editAdminMagazine;
  window.editEmergencyContact = editEmergencyContact;
  window.editEvent = editEvent;
  window.editFinanceRecord = editFinanceRecord;
  window.editMember = editMember;
  window.editNotice = editNotice;
  window.exportDonationsCSV = exportDonationsCSV;
  window.exportMembersCSV = exportMembersCSV;
  window.handleAdminMagazineSave = handleAdminMagazineSave;
  window.handleAdminUpload = handleAdminUpload;
  window.handleEmergencySave = handleEmergencySave;
  window.handleEventSave = handleEventSave;
  window.handleFinanceSave = handleFinanceSave;
  window.handleMemberSave = handleMemberSave;
  window.handleNoticeSave = handleNoticeSave;
  window.previewEventImage = previewEventImage;
  window.previewMemberPhoto = previewMemberPhoto;
  window.resetAdminMagazineForm = resetAdminMagazineForm;
  window.resetEmergencyForm = resetEmergencyForm;
  window.resetEventForm = resetEventForm;
  window.resetFinanceForm = resetFinanceForm;
  window.resetMemberForm = resetMemberForm;
  window.resetNoticeForm = resetNoticeForm;
  window.saveSiteControl = saveSiteControl;
  window.switchAdminTab = switchAdminTab;
