// ---- Site status gate (Live / Maintenance) ----
// Controlled from Admin Dashboard -> Site Control. Reads a single row from
// the `site_settings` table. Falls back to "maintenance" if anything fails,
// so a broken network call never accidentally exposes an unfinished site.
(function () {
  const SUPABASE_URL = 'https://gnxptgaaoxljygnidjwg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdueHB0Z2Fhb3hsanlnbmlkandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5ODE2MzUsImV4cCI6MjEwMDU1NzYzNX0.FzxWzLiah4gexcvSL43PnN3LLIPWL3E-Fmtwqkb6le8';
  const gateClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const LOCAL_UNLOCK_KEY = 'dts_preview_pass_v1';

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

  // Default state while we check: maintenance screen (with its spinner) —
  // safest fallback, never flashes the live site before we're sure.
  showMaintenance();

  gateClient.from('site_settings').select('*').eq('id', 1).single()
    .then(({ data, error }) => {
      if (error || !data) { showMaintenance(); return; }

      window.__siteSettings = data;
      window.dispatchEvent(new CustomEvent('site-settings-ready', { detail: data }));

      const urlParams = new URLSearchParams(window.location.search);
      const urlAccess = urlParams.get('access');
      const storedPass = localStorage.getItem(LOCAL_UNLOCK_KEY);

      let unlocked = storedPass && data.access_password && storedPass === data.access_password;

      if (!unlocked && urlAccess && data.access_password && urlAccess === data.access_password) {
        localStorage.setItem(LOCAL_UNLOCK_KEY, urlAccess);
        unlocked = true;
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }

      if (!data.maintenance_mode || unlocked) {
        showLive();
      } else {
        showMaintenance();
      }
    })
    .catch(() => { showMaintenance(); });
})();
