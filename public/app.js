/* KiglerScrape – frontend */

let allLinks    = [];
let currentSort = 'new';
let activeTag   = null;
let votes       = JSON.parse(localStorage.getItem('ks_votes') || '{}');

const postsList     = document.getElementById('postsList');
const emptyState    = document.getElementById('emptyState');
const tagCloud      = document.getElementById('tagCloud');
const statLinks     = document.getElementById('statLinks');
const statTags      = document.getElementById('statTags');
const tagFilterBar  = document.getElementById('tagFilterBar');
const activeTagChip = document.getElementById('activeTagChip');
const searchInput   = document.getElementById('searchInput');
const overlay       = document.getElementById('modalOverlay');
const urlInput      = document.getElementById('urlInput');
const btnSubmit     = document.getElementById('btnSubmit');
const loader        = document.getElementById('modalLoader');
const errBox        = document.getElementById('modalError');

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function score(link) { return (link.upvotes || 0) - (link.downvotes || 0); }

function renderLinks(links) {
  const query = searchInput.value.trim().toLowerCase();
  let filtered = links;
  if (activeTag) filtered = filtered.filter(l => l.tags && l.tags.includes(activeTag));
  if (query) filtered = filtered.filter(l =>
    (l.title || '').toLowerCase().includes(query) ||
    (l.summary || '').toLowerCase().includes(query) ||
    (l.url || '').toLowerCase().includes(query) ||
    (l.tags || []).some(t => t.toLowerCase().includes(query))
  );
  emptyState.style.display = filtered.length === 0 ? 'flex' : 'none';
  postsList.innerHTML = filtered.map(renderCard).join('');
  attachCardEvents();
}

function renderCard(link) {
  const s         = score(link);
  const myVote    = votes[link.id] || null;
  const upClass   = myVote === 'up'   ? 'voted-up'   : '';
  const downClass = myVote === 'down' ? 'voted-down' : '';
  const tagsHtml  = (link.tags || []).map(t => `<button class="tag-chip" data-tag="${t}">${t}</button>`).join('');
  const thumbHtml = link.thumbnail
    ? `<img class="post-thumbnail" src="${link.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'" />`
    : '';
  return `
    <div class="post-card" data-id="${link.id}">
      <div class="vote-col">
        <button class="vote-btn ${upClass}" data-vote="up" data-id="${link.id}" title="Upvote">
          <svg viewBox="0 0 24 24" fill="${myVote==='up'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M12 4l8 8H4z"/></svg>
        </button>
        <span class="vote-score">${s}</span>
        <button class="vote-btn ${downClass}" data-vote="down" data-id="${link.id}" title="Downvote">
          <svg viewBox="0 0 24 24" fill="${myVote==='down'?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M12 20l8-8H4z"/></svg>
        </button>
      </div>
      <div class="post-content">
        <div class="post-meta">
          <span class="post-domain">${link.domain || ''}</span>
          <span class="time-ago">${timeAgo(link.created_at)}</span>
        </div>
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="post-title">${link.title || link.url}</a>
        ${thumbHtml}
        ${link.summary ? `<p class="post-summary">${link.summary}</p>` : ''}
        ${tagsHtml ? `<div class="post-tags">${tagsHtml}</div>` : ''}
        <div class="post-actions">
          <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="action-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open link
          </a>
          <button class="action-btn delete-btn" data-delete="${link.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Delete
          </button>
        </div>
      </div>
    </div>`;
}

function attachCardEvents() {
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const type = btn.dataset.vote;
      if (votes[id] === type) return;
      votes[id] = type;
      localStorage.setItem('ks_votes', JSON.stringify(votes));
      try {
        const res = await fetch(`/api/links/${id}/vote`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        });
        const updated = await res.json();
        const idx = allLinks.findIndex(l => l.id == id);
        if (idx !== -1) allLinks[idx] = updated;
        renderLinks(allLinks);
        updateSidebar();
      } catch (e) { console.error(e); }
    });
  });

  document.querySelectorAll('.tag-chip').forEach(chip =>
    chip.addEventListener('click', () => setTagFilter(chip.dataset.tag))
  );

  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this link?')) return;
      const id = btn.dataset.delete;
      await fetch(`/api/links/${id}`, { method: 'DELETE' });
      allLinks = allLinks.filter(l => l.id != id);
      renderLinks(allLinks);
      updateSidebar();
    });
  });
}

function updateSidebar() {
  statLinks.textContent = allLinks.length;
  const allTags = [...new Set(allLinks.flatMap(l => l.tags || []))];
  statTags.textContent = allTags.length;
  if (allTags.length === 0) {
    tagCloud.innerHTML = '<em style="color:#878a8c;font-size:13px">No tags yet</em>';
  } else {
    tagCloud.innerHTML = allTags.map(t =>
      `<button class="sidebar-tag${activeTag===t?' active':''}" data-tag="${t}">${t}</button>`
    ).join('');
    tagCloud.querySelectorAll('.sidebar-tag').forEach(b =>
      b.addEventListener('click', () => setTagFilter(b.dataset.tag))
    );
  }
}

function setTagFilter(tag) {
  activeTag = activeTag === tag ? null : tag;
  if (activeTag) { activeTagChip.textContent = tag; tagFilterBar.style.display = 'flex'; }
  else tagFilterBar.style.display = 'none';
  updateSidebar();
  renderLinks(allLinks);
}

document.getElementById('clearTagFilter').addEventListener('click', () => setTagFilter(activeTag));

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    await loadLinks();
  });
});

searchInput.addEventListener('input', () => renderLinks(allLinks));

async function loadLinks() {
  try {
    const res = await fetch(`/api/links?sort=${currentSort}`);
    allLinks = await res.json();
    renderLinks(allLinks);
    updateSidebar();
  } catch (e) { console.error('Failed to load links', e); }
}

function openModal() {
  overlay.classList.add('open');
  urlInput.value = '';
  errBox.classList.remove('visible');
  loader.classList.remove('visible');
  btnSubmit.disabled = false;
  setTimeout(() => urlInput.focus(), 50);
}
function closeModal() { overlay.classList.remove('open'); }

document.getElementById('btnOpenModal').addEventListener('click',  openModal);
document.getElementById('btnOpenModal2').addEventListener('click', openModal);
document.getElementById('modalClose').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

btnSubmit.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) { showError('Please enter a URL.'); return; }
  errBox.classList.remove('visible');
  loader.classList.add('visible');
  btnSubmit.disabled = true;
  try {
    const res  = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    allLinks.unshift(data);
    renderLinks(allLinks);
    updateSidebar();
    closeModal();
  } catch (e) {
    showError(e.message);
  } finally {
    loader.classList.remove('visible');
    btnSubmit.disabled = false;
  }
});

urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnSubmit.click(); });

function showError(msg) {
  errBox.textContent = 'Error: ' + msg;
  errBox.classList.add('visible');
}

loadLinks();
