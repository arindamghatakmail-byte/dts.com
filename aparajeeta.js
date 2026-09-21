// =====================================================================
// APARAJEETA.JS — Renders the published Aparajeeta magazine PDF as a
// realistic page-flip book. Requires PDF.js and StPageFlip to be
// loaded via <script> tags in the page's <head> (see durga-pujo.html).
// Requires common.js to be loaded first.
// =====================================================================

import { supabaseClient } from './common.js';

let pageFlipInstance = null;

document.addEventListener('app:init', function() {
  loadAparajeetaMagazine();
});


async function loadAparajeetaMagazine() {
  const container = document.getElementById('aparajeetaViewer');
  const statusEl = document.getElementById('aparajeetaStatus');
  if (!container) return;

  try {
    const { data, error } = await supabaseClient
      .from('aparajeeta_magazine')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      statusEl.textContent = 'No issue has been published yet — check back soon.';
      statusEl.style.display = 'block';
      return;
    }

    statusEl.textContent = 'Loading pages...';
    statusEl.style.display = 'block';

    // pdfjsLib comes from the CDN script tag in durga-pujo.html
    const pdf = await pdfjsLib.getDocument(data.pdf_url).promise;
    const pageImages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      pageImages.push(canvas.toDataURL('image/jpeg', 0.85));
      statusEl.textContent = `Loading pages... (${i}/${pdf.numPages})`;
    }

    statusEl.style.display = 'none';
    container.innerHTML = '';

    // St.PageFlip comes from the CDN script tag in durga-pujo.html
    pageFlipInstance = new St.PageFlip(container, {
      width: 380,
      height: 540,
      size: 'stretch',
      minWidth: 280,
      maxWidth: 700,
      minHeight: 400,
      maxHeight: 900,
      showCover: true,
      usePortrait: true
    });

    pageFlipInstance.loadFromImages(pageImages);
  } catch (err) {
    statusEl.textContent = 'Error loading the magazine: ' + err.message;
    statusEl.style.display = 'block';
  }
}


function flipAparajeetaNext() {
  if (pageFlipInstance) pageFlipInstance.flipNext();
}
function flipAparajeetaPrev() {
  if (pageFlipInstance) pageFlipInstance.flipPrev();
}


window.flipAparajeetaNext = flipAparajeetaNext;
window.flipAparajeetaPrev = flipAparajeetaPrev;
