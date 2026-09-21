// =====================================================================
// PUJO-MOMENTS.JS — Public live photo feed for Durga Pujo: share a
// moment (compressed photo + caption), Facebook-style per-emoji
// reactions (one per browser per photo), and guest comments.
// No login required. Requires common.js to be loaded first.
// =====================================================================

import { escapeHtml, supabaseClient } from './common.js';

const REACTION_EMOJI = { like: '👍', love: '❤️', haha: '😆', wow: '😮', sad: '😢', angry: '😡' };

document.addEventListener('app:init', function() {
  loadPujoFeed();
});


// Reuses the same compress-to-blob approach as My Account's photo
// upload, but returns a Blob (for Storage upload) instead of a data URL.
function compressImageToBlob(file, maxDimension = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) { reject(new Error('Please choose an image file.')); return; }
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
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}


async function submitPujoMoment(event) {
  event.preventDefault();
  const form = event.target;
  const fileInput = document.getElementById('momentPhotoInput');
  const caption = form.caption.value.trim();
  const statusEl = document.getElementById('momentUploadStatus');
  const btn = document.getElementById('momentUploadBtn');
  statusEl.style.display = 'none';

  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    statusEl.className = 'dp-msg error';
    statusEl.textContent = 'Please choose a photo.';
    statusEl.style.display = 'block';
    return;
  }

  const originalHtml = btn.innerHTML;
  btn.innerHTML = 'UPLOADING...';
  btn.disabled = true;

  try {
    const blob = await compressImageToBlob(file);
    const fileName = `moment-${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`;

    const { error: uploadError } = await supabaseClient.storage.from('pujo-snaps').upload(fileName, blob);
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseClient.storage.from('pujo-snaps').getPublicUrl(fileName);

    const { error: dbError } = await supabaseClient.from('pujo_moments').insert([{
      image_url: urlData.publicUrl, caption
    }]);
    if (dbError) throw dbError;

    statusEl.className = 'dp-msg success';
    statusEl.textContent = 'Moment shared! Scroll down to see it in the feed.';
    statusEl.style.display = 'block';
    form.reset();
    loadPujoFeed();
  } catch (err) {
    statusEl.className = 'dp-msg error';
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.style.display = 'block';
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}


async function loadPujoFeed() {
  const container = document.getElementById('pujoFeedContainer');
  if (!container) return;
  try {
    const { data, error } = await supabaseClient
      .from('pujo_moments')
      .select('*, pujo_comments(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) {
      container.innerHTML = '<p style="text-align:center; font-size:13px; color:#9a927c;">No moments shared yet. Be the first!</p>';
      return;
    }

    container.innerHTML = data.map(moment => {
      const rx = moment.reactions || { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
      const alreadyReacted = localStorage.getItem('dp_reacted_' + moment.id);
      const rxSummary = Object.entries(rx).filter(([, count]) => count > 0)
        .map(([type, count]) => `${REACTION_EMOJI[type]} ${count}`).join('  ');

      const commentsHtml = (moment.pujo_comments || [])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(c => `<div style="margin-bottom:6px;"><strong>${escapeHtml(c.commenter_name || 'Guest')}:</strong> ${escapeHtml(c.comment_text)}</div>`)
        .join('');

      return `
        <div class="dp-feed-card">
          <img src="${escapeHtml(moment.image_url)}" alt="Pujo Moment" loading="lazy" class="dp-feed-img">
          ${moment.caption ? `<p class="dp-feed-caption">${escapeHtml(moment.caption)}</p>` : ''}
          <div class="dp-feed-rx-summary">${rxSummary || 'No reactions yet'}</div>
          <div class="dp-reaction-tray">
            ${Object.keys(REACTION_EMOJI).map(type => `
              <button type="button" class="dp-reaction-btn${alreadyReacted === type ? ' dp-reacted' : ''}" onclick="reactToPujoMoment(${moment.id}, '${type}', this)" ${alreadyReacted ? 'disabled' : ''} title="${type}">${REACTION_EMOJI[type]}</button>
            `).join('')}
          </div>
          <div class="dp-comments-list">${commentsHtml}</div>
          <div class="dp-comment-box">
            <input type="text" id="commentName-${moment.id}" placeholder="Your name (optional)" class="dp-comment-name-input">
            <div style="display:flex; gap:6px;">
              <input type="text" id="commentInput-${moment.id}" placeholder="Add a comment..." maxlength="300">
              <button type="button" class="split-login-btn" style="width:auto; padding:8px 16px;" onclick="submitPujoComment(${moment.id})">Post</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:var(--sindoor); text-align:center;">Error loading feed.</p>';
  }
}


async function reactToPujoMoment(momentId, type, btnEl) {
  if (localStorage.getItem('dp_reacted_' + momentId)) return; // already reacted, one per browser

  try {
    const { error } = await supabaseClient.rpc('increment_reaction', {
      p_moment_id: momentId, p_reaction_type: type
    });
    if (error) throw error;

    localStorage.setItem('dp_reacted_' + momentId, type);
    loadPujoFeed(); // refresh to show the new count
  } catch (err) {
    console.error('Reaction failed:', err);
  }
}


async function submitPujoComment(momentId) {
  const nameInput = document.getElementById('commentName-' + momentId);
  const inputEl = document.getElementById('commentInput-' + momentId);
  const text = inputEl.value.trim();
  if (!text) return;

  const commenterName = nameInput.value.trim() || 'Guest';

  try {
    const { error } = await supabaseClient.from('pujo_comments').insert([{
      moment_id: momentId, commenter_name: commenterName, comment_text: text
    }]);
    if (error) throw error;

    inputEl.value = '';
    loadPujoFeed();
  } catch (err) {
    console.error('Comment failed:', err);
  }
}


window.submitPujoMoment = submitPujoMoment;
window.reactToPujoMoment = reactToPujoMoment;
window.submitPujoComment = submitPujoComment;
