// =====================================================================
// COMMON.JS — Shared config, globals, utilities, navigation & site-wide
// features used by more than one portal (public / member / treasurer / admin).
// Load this file FIRST, before public.js / member.js / treasurer.js / admin.js.
// =====================================================================


  export const GITHUB_OWNER = 'arindamghatakmail-byte';
  export const GITHUB_REPO = 'dts.com';
  export const GITHUB_IMAGES_PATH = 'images';

  const SUPABASE_URL = 'https://gnxptgaaoxljygnidjwg.supabase.co'; 
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdueHB0Z2Fhb3hsanlnbmlkandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5ODE2MzUsImV4cCI6MjEwMDU1NzYzNX0.FzxWzLiah4gexcvSL43PnN3LLIPWL3E-Fmtwqkb6le8';
  export const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  export function downloadCSV(filename, headers, rows) {
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


  // --- HTML ESCAPE HELPER ---

  export function escapeHtml(str) {
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


  // --- FAIL-SAFE PDF RECEIPT GENERATOR ---
  // --- IMAGE COMPRESSION HELPER ---
  // Resizes to a max dimension and re-encodes as JPEG before upload, so a
  // 5-10MB phone photo doesn't get stored (and served to every visitor) at
  // full size. Falls back to the original file if anything goes wrong.

  export function compressImageFile(file, maxDimension = 1600, quality = 0.82) {
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

  export async function logActivity(action, details) {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      const actor = (user && user.email) ? user.email : 'Unknown';
      await supabaseClient.from('activity_log').insert([{ actor, action, details: details || null }]);
    } catch (e) { /* ignore */ }
  }


  export function getBase64ImageFromUrl(imageUrl) {
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


  let membershipAppsCache = [];


  export async function loadMembershipApplications(containerId) {
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
      document.dispatchEvent(new CustomEvent('membership:changed'));
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
      // admin.js refreshes its member table/summary/dropdown, public.js
      // refreshes the directory — both listen for this instead of common.js
      // calling into them directly.
      document.dispatchEvent(new CustomEvent('membership:changed'));

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
      document.dispatchEvent(new CustomEvent('membership:changed'));
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


  // --- CAPTCHA: rendered to <canvas> as a distorted image, not plain DOM text ---

  export function renderCaptchaCanvas(canvasId, code) {
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


  export function generateCaptchaCode() {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }


  export let financialDataCache = [];
  let chartsInstances = {};


  export async function fetchAndRenderFinances() {
    try {
      const { data, error } = await supabaseClient.from('financial_records').select('*').order('id', { ascending: true });
      if (error) throw error;
      
      financialDataCache = data || [];
      renderPublicFinancialTable(financialDataCache);
      renderFinancialCharts(financialDataCache);
      // admin.js owns the ledger view — let it know new data is in.
      document.dispatchEvent(new CustomEvent('finances:updated', { detail: financialDataCache }));
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


  // --- EVENT DATE HELPERS (fixes the countdown time-offset bug) ---
  // The datetime-local input's raw value has NO timezone info attached, so
  // sending it straight to Supabase let Postgres guess the timezone (usually
  // UTC) instead of the admin's actual local time — that mismatch was the
  // root cause of times shifting when saved. These helpers make both the
  // save and the read-back explicit and symmetric.

  // Input value ("2026-08-19T00:00", browser-local wall clock) -> correct UTC ISO string for storage

  export function localDateTimeToUtcIso(localValue) {
    if (!localValue) return null;
    const d = new Date(localValue); // no offset suffix => JS treats it as browser-local time, correctly
    return isNaN(d.getTime()) ? null : d.toISOString();
  }


  // Whatever Supabase returns (with or without an explicit offset) -> a correctly-parsed Date object

  export function parseStoredEventDate(raw) {
    if (!raw) return null;
    let s = String(raw).replace(' ', 'T');
    if (!/[Zz]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z'; // no offset present => treat as UTC (Postgres/Supabase default)
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
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

    const hash = window.location.hash.replace('#', '');
    const validPages = ['home', 'aim', 'members', 'finances', 'events', 'activities', 'gallery', 'magazine', 'members-only', 'treasurer', 'admin', 'join', 'contact', 'emergency'];

    if (hash && validPages.includes(hash)) {
      showPage(hash, false); 
      window.history.replaceState({ page: hash }, "", "#" + hash);
    } else {
      window.history.replaceState({ page: 'home' }, "", window.location.pathname + window.location.search);
    }

    loadNotices();

    supabaseClient.rpc('increment_visit_count')
      .then(({ data, error }) => {
        if (error) throw error;
        document.getElementById('visitorCount').innerText = data;
      })
      .catch(err => {
        document.getElementById('visitorCount').innerText = "—";
      });

    // Each portal file (public/member/admin) handles its own startup work —
    // loading its content, wiring its captchas/editors — via this event,
    // instead of common.js reaching into them directly.
    document.dispatchEvent(new CustomEvent('app:init'));
  });


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


  export function showPage(name, pushToHistory = true){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    const target = document.getElementById('page-'+name);
    if (target) target.classList.add('active');

    document.querySelectorAll('.tab-link').forEach(t=>t.classList.remove('active'));
    document.querySelector('.tab-link[data-page="'+name+'"]')?.classList.add('active');
    
    window.scrollTo({top:0, behavior:'smooth'});
    closeMobileNav();

    if(name==='members-only'){
      document.getElementById('loginGate').style.display = 'block';
      document.getElementById('membersContent').style.display = 'none';
      document.getElementById('memberLogoutBtn').style.display = 'none';
      document.getElementById('memberPassword').value = '';
      document.getElementById('loginError').style.display = 'none';
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
    }

    if (pushToHistory) {
      window.history.pushState({ page: name }, "", "#" + name);
    }

    // Let whichever portal file owns this page load its own content —
    // common.js no longer needs to know loadAdminMembers/loadPublicMembers/
    // etc. exist.
    document.dispatchEvent(new CustomEvent('page:shown', { detail: { name } }));
  }


  window.addEventListener('popstate', function(event) {
    if (event.state && event.state.page) {
      showPage(event.state.page, false); 
    } else {
      showPage('home', false); 
    }
  });


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
      // admin.js / treasurer.js each refresh their own donation table on this.
      document.dispatchEvent(new CustomEvent('donations:changed', { detail: { role } }));
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
      // admin.js / treasurer.js each refresh their own donation table on this.
      document.dispatchEvent(new CustomEvent('donations:changed', { detail: { role } }));
    } catch (err) {
      alert('Error adding due records: ' + err.message);
    }
  }


  export async function deleteDonationRecord(id, role = 'admin') {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      const { error } = await supabaseClient.from('member_donations').delete().eq('id', id);
      if (error) throw error;
      alert("Record deleted successfully!");
      // admin.js / treasurer.js each refresh their own donation table on this.
      document.dispatchEvent(new CustomEvent('donations:changed', { detail: { role } }));
    } catch (err) {
      alert("Error deleting record: " + err.message);
    }
  }


  export async function loadNotices(){
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


  async function logoutPortal(type) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}

    if (type === 'member') {
      document.getElementById('membersContent').style.display = 'none';
      document.getElementById('memberLogoutBtn').style.display = 'none';
      document.getElementById('loginGate').style.display = 'block';
      document.getElementById('memberPassword').value = '';
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

    // member.js resets its captcha on member logout — it listens for this.
    document.dispatchEvent(new CustomEvent('portal:logout', { detail: { type } }));
  }


  export const GITHUB_DOCS_PATH = 'documents';


  function formatDocTitle(filename){
    let name = filename.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    name = name.replace(/\b([a-zA-Z]+)(\d{2,4})?\b/g, (match, word, num) => {
      if (/^fy$/i.test(word) && num) return 'FY ' + num;
      if (/^fy\d{2,4}$/i.test(word)) return 'FY ' + word.slice(2);
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() + (num || '');
    });
    return name;
  }


  export async function loadPdfFolder(folderPath, containerId, emptyMsg){
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



  // --- Expose functions called directly from inline HTML event handlers ---
  // (ES modules don't add top-level declarations to `window` automatically,
  //  so anything referenced via onclick=/onchange=/onsubmit= in the HTML,
  //  including HTML generated dynamically as template strings, needs this.)
  window.approveApplication = approveApplication;
  window.closeMobileNav = closeMobileNav;
  window.copyDuesForCurrentMonth = copyDuesForCurrentMonth;
  window.deleteApplication = deleteApplication;
  window.deleteDonationRecord = deleteDonationRecord;
  window.exitApp = exitApp;
  window.handleDonationSave = handleDonationSave;
  window.handleMaintLogoTap = handleMaintLogoTap;
  window.logoutPortal = logoutPortal;
  window.rejectApplication = rejectApplication;
  window.setLanguage = setLanguage;
  window.showPage = showPage;
  window.toggleMobileNav = toggleMobileNav;
  window.tryPreviewUnlock = tryPreviewUnlock;
  window.viewApplicationPdf = viewApplicationPdf;
