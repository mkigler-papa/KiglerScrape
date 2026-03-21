/* KiglerScrape – frontend */

// Tag color palette (cycles)
const TAG_COLORS = [
  { bg: '#FDF2F8', dot: '#EC4899', text: '#9D174D' },
  { bg: '#EFF6FF', dot: '#3B82F6', text: '#1D4ED8' },
  { bg: '#FFF7ED', dot: '#F97316', text: '#C2410C' },
  { bg: '#F0FDF4', dot: '#22C55E', text: '#15803D' },
  { bg: '#FAF5FF', dot: '#A855F7', text: '#7E22CE' },
  { bg: '#FEFCE8', dot: '#EAB308', text: '#A16207' },
];
const tagColorMap = {};
let tagColorIndex = 0;
function getTagColor(tag) {
  if (!tagColorMap[tag]) {
    tagColorMap[tag] = TAG_COLORS[tagColorIndex % TAG_COLORS.length];
    tagColorIndex++;
  }
  return tagColorMap[tag];
}

// State
let allLinks    = [];
let currentSort = 'new';
let activeTag   = null;

// DOM
const postsList      = document.getElementById('postsList');
const emptyState     = document.getElementById('emptyState');
const statLinks      = document.getElementById('statLinks');
const statTags       = document.getElementById('statTags');
const searchInput    = document.getElementById('searchInput');
const urlInput       = document.getElementById('urlInput');
const btnAdd         = document.getElementById('btnAdd');
const pasteLoader    = document.getElementById('pasteLoader');
const pasteError     = document.getElementById('pasteError');
const tagFilterBar   = document.getElementById('tagFilterBar');
const activeTagPill  = document.getElementById('activeTagPill');
const sidebarTagCloud= document.getElementById('sidebarTagCloud');

// Helpers
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// Render
function renderLinks(links) {
  const query = searchInput.value.trim().toLowerCase();
  let filtered = [...links];
  if (activeTag) filtered = filtered.filter(l => l.tags && l.tags.includes(activeTag));
  if (query)     filtered = filtered.filter(l =>
    (l.title   || '').toLowerCase().includes(query) ||
    (l.summary || '').toLowerCase().includes(query) ||
    (l.url     || '').toLowerCase().includes(query) ||
    (l.tags    || []).some(t => t.toLowerCase().includes(query))
  );
  emptyState.style.display = filtered.length === 0 ? 'flex' : 'none';
  postsList.innerHTML = filtered.map(renderCard).join('');
  attachCardEvents();
}

function renderCard(link) {
  const tagsHtml = (link.tags || []).map(t => {
    const c = getTagColor(t);
    return `<button class="tag-pill" data-tag="${t}" style="background:${c.bg};color:${c.text}">
      <span class="tag-dot" style="background:${c.dot}"></span>${t}
    </button>`;
  }).join('');

  const thumbHtml = link.thumbnail
    ? `<img class="card-thumbnail" src="${link.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'" />`
    : '';

  return `
    <div class="card" data-id="${link.id}">
      <div class="card-top">
        <div class="card-tags">${tagsHtml}</div>
        <div class="card-actions">
          <button class="card-action-btn delete" data-delete="${link.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>

      <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="card-title">${link.title || link.url}</a>
      ${link.summary ? `<p class="card-summary">${link.summary}</p>` : ''}
      ${thumbHtml}

      <div class="card-footer">
        <span class="card-footer-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${timeAgo(link.created_at)}
        </span>
        <span class="card-footer-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          ${link.domain || ''}
        </span>
        <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="card-view-link">
          View Details
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
      </div>
    </div>`;
}

function attachCardEvents() {
  document.querySelectorAll('.tag-pill').forEach(pill =>
    pill.addEventListener('click', () => setTagFilter(pill.dataset.tag))
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

// Sidebar tag cloud
function updateSidebar() {
  statLinks.textContent = allLinks.length;
  const allTags = [...new Set(allLinks.flatMap(l => l.tags || []))];
  statTags.textContent = allTags.length;

  sidebarTagCloud.innerHTML = allTags.map(t => {
    const c = getTagColor(t);
    return `<button class="sidebar-tag-item${activeTag===t?' active':''}" data-tag="${t}">
      <span class="sidebar-tag-dot" style="background:${c.dot}"></span>${t}
    </button>`;
  }).join('');
  sidebarTagCloud.querySelectorAll('.sidebar-tag-item').forEach(b =>
    b.addEventListener('click', () => setTagFilter(b.dataset.tag))
  );
}

function setTagFilter(tag) {
  activeTag = activeTag === tag ? null : tag;
  if (activeTag) {
    activeTagPill.textContent = tag;
    tagFilterBar.style.display = 'flex';
  } else {
    tagFilterBar.style.display = 'none';
  }
  updateSidebar();
  renderLinks(allLinks);
}

document.getElementById('clearTagFilter').addEventListener('click', () => setTagFilter(activeTag));

// Sort
document.querySelectorAll('.sort-tab').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.sort-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    await loadLinks();
  });
});

// Nav items
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    if (item.dataset.sort) {
      currentSort = item.dataset.sort;
      loadLinks();
    }
  });
});

// New Link button scrolls to paste bar
document.getElementById('btnNewLink').addEventListener('click', () => {
  urlInput.focus();
  urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// Search
searchInput.addEventListener('input', () => renderLinks(allLinks));

// Add link
async function addLink(url) {
  if (!url) return;
  pasteError.classList.remove('visible');
  pasteLoader.classList.add('visible');
  btnAdd.disabled = true;
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
    urlInput.value = '';
  } catch (e) {
    pasteError.textContent = 'Error: ' + e.message;
    pasteError.classList.add('visible');
  } finally {
    pasteLoader.classList.remove('visible');
    btnAdd.disabled = false;
  }
}

btnAdd.addEventListener('click', () => addLink(urlInput.value.trim()));
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addLink(urlInput.value.trim()); });

// Load
async function loadLinks() {
  try {
    const res = await fetch(`/api/links?sort=${currentSort}`);
    allLinks = await res.json();
    renderLinks(allLinks);
    updateSidebar();
  } catch (e) { console.error(e); }
}

loadLinks();
