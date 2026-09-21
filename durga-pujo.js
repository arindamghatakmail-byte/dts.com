// =====================================================================
// DURGA-PUJO.JS — Public "Durga Pujo 2026" hub: calendar, RSVP,
// committee contacts, and cultural program (view + apply to perform).
// Everything on this page is open to the public, no login needed.
// Requires common.js to be loaded first.
// =====================================================================

import { escapeHtml, supabaseClient } from './common.js';

document.addEventListener('app:init', function() {
  loadCommitteeContacts();
  loadCulturalSchedule();
});


function toggleRsvpDay(chip) {
  chip.classList.toggle('dp-day-selected');
}


async function submitPujaRsvp(event) {
  event.preventDefault();
  const form = event.target;
  const statusEl = document.getElementById('dpRsvpStatus');
  const btn = document.getElementById('dpRsvpBtn');
  statusEl.style.display = 'none';

  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const numPeople = parseInt(form.num_people.value, 10);
  const days = Array.from(document.querySelectorAll('.dp-day-chip.dp-day-selected')).map(c => c.dataset.day);

  if (!name || !/^\d{10}$/.test(phone) || !numPeople || numPeople < 1) {
    statusEl.className = 'dp-msg error';
    statusEl.textContent = 'Please fill in your name, a valid 10-digit phone number, and number of people.';
    statusEl.style.display = 'block';
    return;
  }
  if (days.length === 0) {
    statusEl.className = 'dp-msg error';
    statusEl.textContent = 'Please select at least one day you plan to visit.';
    statusEl.style.display = 'block';
    return;
  }

  const originalHtml = btn.innerHTML;
  btn.innerHTML = 'SUBMITTING...';
  btn.disabled = true;

  try {
    const { error } = await supabaseClient.from('puja_rsvp').insert([{
      name, phone, num_people: numPeople, days
    }]);
    if (error) throw error;

    statusEl.className = 'dp-msg success';
    statusEl.textContent = 'Thank you! Your RSVP has been recorded.';
    statusEl.style.display = 'block';
    form.reset();
    document.querySelectorAll('.dp-day-chip.dp-day-selected').forEach(c => c.classList.remove('dp-day-selected'));
  } catch (err) {
    statusEl.className = 'dp-msg error';
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.style.display = 'block';
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}


async function submitPerformanceApplication(event) {
  event.preventDefault();
  const form = event.target;
  const statusEl = document.getElementById('dpPerformStatus');
  const btn = document.getElementById('dpPerformBtn');
  statusEl.style.display = 'none';

  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const performanceType = form.performance_type.value;
  const preferredDay = form.preferred_day.value;
  const description = form.description.value.trim();

  if (!name || !/^\d{10}$/.test(phone) || !performanceType) {
    statusEl.className = 'dp-msg error';
    statusEl.textContent = 'Please fill in your name, a valid 10-digit phone number, and performance type.';
    statusEl.style.display = 'block';
    return;
  }

  const originalHtml = btn.innerHTML;
  btn.innerHTML = 'SUBMITTING...';
  btn.disabled = true;

  try {
    const { error } = await supabaseClient.from('performance_applications').insert([{
      name, phone, performance_type: performanceType, preferred_day: preferredDay, description
    }]);
    if (error) throw error;

    statusEl.className = 'dp-msg success';
    statusEl.textContent = 'Application submitted! The committee will review it and publish the final schedule soon.';
    statusEl.style.display = 'block';
    form.reset();
  } catch (err) {
    statusEl.className = 'dp-msg error';
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.style.display = 'block';
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}


async function loadCommitteeContacts() {
  const container = document.getElementById('dpContactsList');
  if (!container) return;
  try {
    const { data, error } = await supabaseClient.from('puja_committee_contacts').select('*').order('display_order', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) {
      container.innerHTML = '<p style="font-size:13px; color:#9a927c;">Contact list will be published soon.</p>';
      return;
    }
    container.innerHTML = data.map(c => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--line);">
        <div>
          <div style="font-weight:600; color:var(--indigo); font-size:13.5px;">${escapeHtml(c.name)}</div>
          <div style="font-size:11.5px; color:#7a7260;">${escapeHtml(c.role)}</div>
        </div>
        <a href="tel:${escapeHtml(c.phone)}" style="padding:6px 12px; background:var(--marigold); color:var(--indigo); border-radius:6px; font-size:12px; font-weight:700; text-decoration:none;"><i class="fas fa-phone"></i> ${escapeHtml(c.phone)}</a>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p style="font-size:13px; color:var(--sindoor);">Error loading contacts.</p>';
  }
}


async function loadCulturalSchedule() {
  const container = document.getElementById('dpScheduleList');
  if (!container) return;
  try {
    const { data, error } = await supabaseClient.from('cultural_program_schedule').select('*').order('display_order', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) {
      container.innerHTML = '<p style="font-size:13px; color:#9a927c;">The final lineup hasn\'t been published yet — check back soon, or apply to perform below.</p>';
      return;
    }
    container.innerHTML = data.map(s => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--line);">
        <div>
          <div style="font-weight:600; color:var(--indigo); font-size:13.5px;">${escapeHtml(s.performer_name)}</div>
          <div style="font-size:11.5px; color:#7a7260;">${escapeHtml(s.performance_type || '')}</div>
        </div>
        <div style="text-align:right; font-size:12px; color:var(--marigold); font-weight:700;">${escapeHtml(s.day)}${s.time ? ' &middot; ' + escapeHtml(s.time) : ''}</div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p style="font-size:13px; color:var(--sindoor);">Error loading schedule.</p>';
  }
}


window.toggleRsvpDay = toggleRsvpDay;
window.submitPujaRsvp = submitPujaRsvp;
window.submitPerformanceApplication = submitPerformanceApplication;
