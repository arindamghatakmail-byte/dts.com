// ---- Site status gate (Live / Maintenance) ----
// Controlled from Admin Dashboard -> Site Control. Reads a single row from
// the `site_settings` table. Falls back to "maintenance" if anything fails,
// so a broken network call never accidentally exposes an unfinished site.
(function () {
  const SUPABASE_URL = 'https://gnxptgaaoxljygnidjwg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdueHB0Z2Fhb3hsanlnbmlkandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5ODE2MzUsImV4cCI6MjEwMDU1NzYzNX0.FzxWzLiah4gexcvSL43PnN3LLIPWL3E-Fmtwqkb6le8';
  const gateClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const LOCAL_UNLOCK_KEY = 'dts_preview_pass_v1';
  const LOCAL_STATUS_CACHE_KEY = 'dts_site_status_cache_v1';

  function showLive() {
    document.documentElement.style.setProperty('--live-display', 'block');
    document.documentElement.style.setProperty('--maint-display', 'none');
    document.documentElement.style.setProperty('--body-bg', 'linear-gradient(160deg, #FBF6EA, #F3EAD4)');
  }
  function showMaintenance() {
    document.documentElement.style.setProperty('--live-display', 'none');
    document.documentElement.style.setProperty('--maint-display', 'flex');
    document.documentElement.style.setProperty('--body-bg', 'linear-gradient(155deg, #1B2A4A, #101a33 55%, #0a1226)');
  }

  const storedPass = localStorage.getItem(LOCAL_UNLOCK_KEY);
  let cachedStatus = null;
  try { cachedStatus = JSON.parse(localStorage.getItem(LOCAL_STATUS_CACHE_KEY) || 'null'); } catch (e) {}

  // Optimistic default from last known result, so a returning visitor —
  // especially one already unlocked with a preview code — sees the right
  // screen immediately instead of a maintenance flash before the real
  // page loads. A brand-new visitor with no cache still safely defaults
  // to the maintenance screen (with its spinner) until we've confirmed.
  if (cachedStatus && (!cachedStatus.maintenance_mode || storedPass)) {
    showLive();
  } else {
    showMaintenance();
  }

  function scheduleReached(data) {
    if (!data.scheduled_live_at) return false;
    return new Date() >= new Date(data.scheduled_live_at);
  }

  function decide(data, unlocked) {
    if (!data.maintenance_mode || unlocked || scheduleReached(data)) {
      showLive();
      return true;
    }
    showMaintenance();
    return false;
  }

  gateClient.from('site_settings').select('*').eq('id', 1).single()
    .then(({ data, error }) => {
      if (error || !data) { showMaintenance(); return; }

      window.__siteSettings = data;
      window.dispatchEvent(new CustomEvent('site-settings-ready', { detail: data }));

      const urlParams = new URLSearchParams(window.location.search);
      const urlAccess = urlParams.get('access');

      let unlocked = storedPass && data.access_password && storedPass === data.access_password;

      if (!unlocked && urlAccess && data.access_password && urlAccess === data.access_password) {
        localStorage.setItem(LOCAL_UNLOCK_KEY, urlAccess);
        unlocked = true;
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }

      localStorage.setItem(LOCAL_STATUS_CACHE_KEY, JSON.stringify({ maintenance_mode: data.maintenance_mode }));

      const isLive = decide(data, unlocked);

      // If still on the maintenance screen and a go-live time is scheduled
      // for later, quietly recheck every 20s so it flips over on its own —
      // no manual refresh needed once the scheduled moment arrives.
      if (!isLive && data.scheduled_live_at && !scheduleReached(data)) {
        const poll = setInterval(() => {
          if (scheduleReached(data)) {
            clearInterval(poll);
            window.location.reload();
          }
        }, 20000);
      }
    })
    .catch(() => { showMaintenance(); });
})();
