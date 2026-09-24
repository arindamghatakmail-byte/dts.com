// =====================================================================
// DURGA-PUJO.JS — Public "Durga Pujo 2026" hub: calendar, timings, RSVP,
// committee contacts, and cultural program (view + apply to perform).
// Everything on this page is open to the public, no login needed.
// Requires common.js to be loaded first.
// =====================================================================

import { escapeHtml, supabaseClient } from './common.js';

// Puja calendar dates, used for the hero countdown. Keep in sync with
// the date cards in durga-pujo.html if the schedule ever changes.
const PUJA_DAYS = [
  { label: 'Mahalaya', date: '2026-10-10' },
  { label: 'Panchami', date: '2026-10-15' },
  { label: 'Shashthi', date: '2026-10-16' },
  { label: 'Saptami (1st Day)', date: '2026-10-17' },
  { label: 'Saptami (2nd Day)', date: '2026-10-18' },
  { label: 'Ashtami', date: '2026-10-19' },
  { label: 'Nabami', date: '2026-10-20' },
  { label: 'Dashami', date: '2026-10-21' },
];

document.addEventListener('app:init', function() {
  renderPujaCountdown();
  loadCommitteeContacts();
  loadCulturalSchedule();
});

// Ambient falling petals — purely decorative, so it runs independently
// of app:init (doesn't need Supabase) and skips entirely if the visitor
// has requested reduced motion.
createPujaPetals();

function createPujaPetals() {
  const container = document.getElementById('dpPetals');
  if (!container) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const colors = ['var(--marigold)', 'var(--sindoor)', 'var(--gold-deep)'];
  const PETAL_COUNT = 16;

  for (let i = 0; i < PETAL_COUNT; i++) {
    const petal = document.createElement('span');
    petal.className = 'dp-petal';
    const left = Math.random() * 100;
    const duration = 9 + Math.random() * 7;      // 9s–16s fall
    const delay = Math.random() * -16;             // stagger so they don't all start together
    const drift = (Math.random() * 60 - 30).toFixed(0) + 'px';
    const size = 8 + Math.round(Math.random() * 8); // 8px–16px
    const color = colors[i % colors.length];

    petal.style.left = left + 'vw';
    petal.style.width = size + 'px';
    petal.style.height = size + 'px';
    petal.style.background = color;
    petal.style.animationDuration = duration + 's';
    petal.style.animationDelay = delay + 's';
    petal.style.setProperty('--dp-drift', drift);

    container.appendChild(petal);
  }
}


function renderPujaCountdown() {
  const el = document.getElementById('dpCountdown');
  if (!el) return;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayEntry = PUJA_DAYS.find(d => d.date === todayStr);

  if (todayEntry) {
    el.textContent = `Today is ${todayEntry.label} — শুভ ${todayEntry.label}!`;
    return;
  }

  const celebrationStart = new Date(PUJA_DAYS[1].date + 'T00:00:00'); // Panchami
  const celebrationEnd = new Date(PUJA_DAYS[PUJA_DAYS.length - 1].date + 'T23:59:59');

  if (now < celebrationStart) {
    const diffDays = Math.ceil((celebrationStart - now) / 86400000);
    el.textContent = `${diffDays} day${diffDays === 1 ? '' : 's'} to go until Panchami`;
  } else if (now > celebrationEnd) {
    el.textContent = 'See you at next year\'s Durga Pujo!';
  } else {
    el.textContent = 'The celebration is underway!';
  }
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
  const days = Array.from(form.querySelectorAll('input[name="days"]:checked')).map(c => c.value);

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


window.submitPujaRsvp = submitPujaRsvp;
window.submitPerformanceApplication = submitPerformanceApplication;
