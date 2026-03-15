import { DEFAULT_LIBRARY } from './defaults.js';
// ═══════════════════════════════════════════════════════════════════════════
// library.js — Content library, browse, search, renderGrid
// ═══════════════════════════════════════════════════════════════════════════

import { StorageManager } from './storage.js';
import { fetchMany, omdbSearch, prefetchCategory } from './api.js';

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT LIBRARY
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY STATE
// ─────────────────────────────────────────────────────────────────────────────

export let LIBRARY = DEFAULT_LIBRARY();
export function setLibrary(lib) { LIBRARY = lib; }
export function saveLibrary()   { StorageManager.save('ff_library', LIBRARY); }

// ─────────────────────────────────────────────────────────────────────────────
// RENDER GRID
// ─────────────────────────────────────────────────────────────────────────────

// Callbacks injected by userdata.js so library.js stays decoupled
let _isFav      = () => false;
let _isQueued   = () => false;
let _toggleFav  = () => {};
let _addToQueue = () => {};
let _rmQueue    = () => {};
let _getWL      = () => [];

export function registerGridCallbacks(cbs) {
  _isFav      = cbs.isFav      || _isFav;
  _isQueued   = cbs.isQueued   || _isQueued;
  _toggleFav  = cbs.toggleFav  || _toggleFav;
  _addToQueue = cbs.addToQueue || _addToQueue;
  _rmQueue    = cbs.removeFromQueue || _rmQueue;
  _getWL      = cbs.getWatchlist    || _getWL;
}

export function renderGrid(items, container, { onCardClick } = {}) {
  if (!items.length) {
    container.innerHTML = '<div class="loading">No results found.</div>';
    return;
  }

  const watchlist = _getWL();

  container.innerHTML = items.map(m => {
    const poster   = m.Poster && m.Poster !== 'N/A'
      ? `<img src="${m.Poster}" alt="${m.Title}" loading="lazy">`
      : `<div class="no-poster">No Image</div>`;
    const isTV     = m.Type === 'series';
    const inList   = watchlist.some(w => w.imdbId === m.imdbID);
    const isWatched= watchlist.find(w => w.imdbId === m.imdbID)?.watchedAt;
    const fav      = _isFav(m.imdbID);
    const queued   = _isQueued(m.imdbID);

    return `
      <div class="card${isWatched ? ' is-watched' : ''}"
           data-imdb="${m.imdbID}"
           data-type="${m.Type || 'movie'}"
           data-title="${(m.Title || '').replace(/"/g, '&quot;')}"
           data-year="${m.Year || ''}"
           data-poster="${m.Poster !== 'N/A' ? m.Poster : ''}"
           data-rating="${m.imdbRating || ''}">
        ${isTV ? '<span class="card-type-badge tv">TV</span>' : ''}
        ${poster}
        <button class="card-fav${fav ? ' active' : ''}" data-imdb="${m.imdbID}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">★</button>
        <span class="card-watched-badge">✓ watched</span>
        <div class="card-overlay">
          <button class="card-action${inList ? ' in-list' : ''} ca-list">${inList ? '✓ listed' : '+ list'}</button>
          <button class="card-action${isWatched ? ' watched' : ''} ca-watched">${isWatched ? '✓ watched' : '👁 watched'}</button>
          <button class="card-action${queued ? ' in-list' : ''} ca-queue">${queued ? '✓ queued' : '+ queue'}</button>
        </div>
        <div class="card-info">
          <div class="card-title">${m.Title}</div>
          <div class="card-meta">${m.Year || ''}</div>
        </div>
      </div>`;
  }).join('');

  // Wire events
  container.querySelectorAll('.card').forEach(c => {
    const imdbId = c.dataset.imdb;
    const type   = c.dataset.type;

    c.addEventListener('click', e => {
      if (e.target.closest('.card-action') || e.target.closest('.card-fav')) return;
      if (onCardClick) onCardClick(imdbId, type);
    });

    c.querySelector('.card-fav').addEventListener('click', e => {
      e.stopPropagation();
      _toggleFav(imdbId);
      c.querySelector('.card-fav').classList.toggle('active', _isFav(imdbId));
    });

    c.querySelector('.ca-list').addEventListener('click', e => {
      e.stopPropagation();
      const btn = c.querySelector('.ca-list');
      const wl  = _getWL();
      if (wl.some(w => w.imdbId === imdbId)) {
        // Remove — signal via custom event
        c.dispatchEvent(new CustomEvent('wl:remove', { bubbles: true, detail: { imdbId } }));
        btn.textContent = '+ list'; btn.classList.remove('in-list');
      } else {
        c.dispatchEvent(new CustomEvent('wl:add', { bubbles: true, detail: {
          imdbId, title: c.dataset.title, year: c.dataset.year,
          type: c.dataset.type, poster: c.dataset.poster, rating: c.dataset.rating,
        }}));
        btn.textContent = '✓ listed'; btn.classList.add('in-list');
      }
    });

    c.querySelector('.ca-watched').addEventListener('click', e => {
      e.stopPropagation();
      c.dispatchEvent(new CustomEvent('wl:toggle-watched', { bubbles: true, detail: {
        imdbId, title: c.dataset.title, year: c.dataset.year,
        type: c.dataset.type, poster: c.dataset.poster, rating: c.dataset.rating,
      }}));
    });

    c.querySelector('.ca-queue').addEventListener('click', e => {
      e.stopPropagation();
      const btn = c.querySelector('.ca-queue');
      if (_isQueued(imdbId)) {
        _rmQueue(imdbId);
        btn.textContent = '+ queue'; btn.classList.remove('in-list');
      } else {
        _addToQueue(imdbId, null);
        btn.textContent = '✓ queued'; btn.classList.add('in-list');
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSE
// ─────────────────────────────────────────────────────────────────────────────

const _sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const ids = JSON.parse(entry.target.dataset.prefetchIds || '[]');
    if (ids.length) prefetchCategory(ids);
    _sectionObserver.unobserve(entry.target);
  });
}, { rootMargin: '200px' });

export async function loadBrowse(tab, browseContent, { onCardClick } = {}) {
  if (tab === 'trending') {
    browseContent.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
    const items = await fetchMany(LIBRARY.trending);
    browseContent.innerHTML = `
      <div class="section-title">Trending Now <span class="section-count">${items.length} titles</span></div>
      <div class="grid" id="trendGrid"></div>`;
    renderGrid(items, document.getElementById('trendGrid'), { onCardClick });
    return;
  }

  const lib  = tab === 'movies' ? LIBRARY.movies : LIBRARY.tv;
  const cats = Object.keys(lib);

  browseContent.innerHTML = `
    <div class="cat-bar" id="catBar">
      <button class="cat-btn active" data-cat="all">All</button>
      ${cats.map(c => `<button class="cat-btn" data-cat="${c}">${c}</button>`).join('')}
    </div>
    <div id="sw"></div>`;

  const sw = document.getElementById('sw');

  document.querySelectorAll('.cat-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.cat-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const cat = b.dataset.cat;
    document.querySelectorAll('.section-block').forEach(s => {
      s.style.display = (cat === 'all' || s.dataset.cat === cat) ? '' : 'none';
    });
  }));

  for (const cat of cats) {
    const ids = lib[cat] || [];
    const sid = 'g' + cat.replace(/\W/g, '_');
    const block = document.createElement('div');
    block.className      = 'section-block';
    block.dataset.cat    = cat;
    block.dataset.prefetchIds = JSON.stringify(ids); // picked up by IntersectionObserver
    block.innerHTML = `
      <div class="section-title">${cat} <span class="section-count" id="c${sid}"></span></div>
      <div class="grid" id="${sid}">
        <div class="loading" style="padding:20px;grid-column:1/-1"><div class="spinner"></div>Loading...</div>
      </div>`;
    sw.appendChild(block);

    // Observe for prefetch trigger
    _sectionObserver.observe(block);

    // Load grid (async, parallel)
    (async () => {
      const items = await fetchMany(ids);
      const g = document.getElementById(sid);
      const c = document.getElementById('c' + sid);
      if (!g) return;
      if (c) c.textContent = items.length + ' titles';
      renderGrid(items, g, { onCardClick });
    })();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────────────────

export async function execSearch(query, currentTab, browseContent, { onCardClick } = {}) {
  browseContent.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';
  const type = currentTab === 'tv' ? 'series' : currentTab === 'movies' ? 'movie' : '';
  const data = await omdbSearch(query, type);
  if (data.Response === 'True') {
    browseContent.innerHTML = `
      <div class="section-title">Results for "${query}" <span class="section-count">${data.Search.length} found</span></div>
      <div class="grid" id="srchGrid"></div>`;
    renderGrid(data.Search, document.getElementById('srchGrid'), { onCardClick });
  } else {
    browseContent.innerHTML = `<div class="loading">No results for "${query}"</div>`;
  }
}
