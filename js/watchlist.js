// ═══════════════════════════════════════════════════════════════════════════
// watchlist.js — Watchlist drawer
// ═══════════════════════════════════════════════════════════════════════════

let _deps = {};
export function initWatchlist(deps) {
  _deps = deps;
  _wireEvents();
}

export function renderWatchlist() {
  const { stores } = _deps;
  const wl    = stores.watchlist;
  const count = wl.length;
  document.getElementById('wlCount').textContent = count + ' title' + (count !== 1 ? 's' : '');
  const badge = document.getElementById('wlBadge');
  badge.style.display = count ? '' : 'none';
  if (count) badge.textContent = count;

  const empty = document.getElementById('wlEmpty');
  const list  = document.getElementById('wlList');
  empty.style.display = count ? 'none' : 'flex';
  list.querySelectorAll('.wl-item').forEach(el => el.remove());

  wl.forEach(item => {
    const div = document.createElement('div');
    div.className = 'wl-item';
    const ws = item.watchedAt
      ? `<span class="watched-dot"></span>watched ${new Date(item.watchedAt).toLocaleDateString()}`
      : 'not watched';
    div.innerHTML = `
      <img class="wl-item-poster" src="${item.poster||''}" alt="" onerror="this.style.display='none'">
      <div class="wl-item-info">
        <div class="wl-item-title">${item.title}</div>
        <div class="wl-item-meta">${item.year||''} · ${item.type==='series'?'TV':'Movie'}${item.rating?' · ★ '+item.rating:''}</div>
        <div class="wl-item-meta" style="margin-top:3px;font-size:10px">${ws}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
        <button class="btn-remove" title="Remove">✕</button>
        <button class="wl-btn" style="font-size:9px;padding:3px 6px;${item.watchedAt?'color:#4caf50;border-color:#1a3a1a':''}">${item.watchedAt?'✓ seen':'👁 mark'}</button>
      </div>`;
    div.querySelector('.wl-item-info').addEventListener('click', () => {
      closeWatchlist();
      import('./player.js').then(m => m.loadPlayer(item.imdbId, item.type));
    });
    div.querySelector('.btn-remove').addEventListener('click', e => {
      e.stopPropagation();
      stores.watchlist = stores.watchlist.filter(w => w.imdbId !== item.imdbId);
      _deps.saveWL(); renderWatchlist(); updateAddBtn();
    });
    div.querySelector('.wl-btn').addEventListener('click', e => {
      e.stopPropagation();
      const ent = stores.watchlist.find(w => w.imdbId === item.imdbId);
      if (ent) { ent.watchedAt = ent.watchedAt ? null : new Date().toISOString(); _deps.saveWL(); renderWatchlist(); updateAddBtn(); }
    });
    list.appendChild(div);
  });
}

export function updateAddBtn() {
  const btn  = document.getElementById('wlAddBtn');
  const meta = _deps._currentMeta;
  if (!btn || !meta) return;
  const inList = _deps.stores.watchlist.some(w => w.imdbId === meta.imdbID);
  btn.textContent   = inList ? '✓ IN LIST' : '+ ADD TO LIST';
  btn.style.color       = inList ? '#4caf50' : '';
  btn.style.borderColor = inList ? '#1a3a1a' : '';
}

function openWatchlist()  { document.getElementById('wlDrawer').classList.add('open');  document.getElementById('wlOverlay').classList.add('open'); }
export function closeWatchlist() { document.getElementById('wlDrawer').classList.remove('open'); document.getElementById('wlOverlay').classList.remove('open'); }

function _wireEvents() {
  document.getElementById('wlOpenBtn')?.addEventListener('click', openWatchlist);
  document.getElementById('wlCloseBtn')?.addEventListener('click', closeWatchlist);
  document.getElementById('wlOverlay')?.addEventListener('click', closeWatchlist);

  document.getElementById('wlAddBtn')?.addEventListener('click', () => {
    const { stores, saveWL } = _deps;
    const meta = _deps._currentMeta;
    if (!meta) return;
    const id = meta.imdbID;
    if (stores.watchlist.some(w => w.imdbId === id)) {
      stores.watchlist = stores.watchlist.filter(w => w.imdbId !== id);
    } else {
      stores.watchlist.push({
        imdbId: id, title: meta.Title, year: meta.Year, type: meta.Type,
        poster: meta.Poster !== 'N/A' ? meta.Poster : '',
        rating: meta.imdbRating !== 'N/A' ? meta.imdbRating : '',
        genre: meta.Genre, addedAt: new Date().toISOString(),
      });
    }
    saveWL(); renderWatchlist(); updateAddBtn();
  });

  document.getElementById('wlClearBtn')?.addEventListener('click', () => {
    if (!_deps.stores.watchlist.length) return;
    if (confirm('Clear entire watchlist?')) { _deps.stores.watchlist = []; _deps.saveWL(); renderWatchlist(); updateAddBtn(); }
  });

  document.getElementById('wlExportCSV')?.addEventListener('click', () => {
    const wl = _deps.stores.watchlist;
    if (!wl.length) return;
    _dl('Title,Year,Type,IMDb ID,Rating,Genre,Added,Watched\n' +
      wl.map(w => [w.title,w.year,w.type,w.imdbId,w.rating,w.genre,w.addedAt,w.watchedAt||'']
        .map(v => `"${(v||'').replace(/"/g,'""')}"`).join(',')).join('\n'),
      'watchlist.csv', 'text/csv');
  });

  document.getElementById('wlExportJSON')?.addEventListener('click', () => {
    const wl = _deps.stores.watchlist;
    if (!wl.length) return;
    _dl(JSON.stringify(wl, null, 2), 'watchlist.json', 'application/json');
  });

  // Wire card events from library.js (bubbled via custom events)
  document.addEventListener('wl:add', e => {
    const { stores, saveWL } = _deps;
    const d = e.detail;
    if (!stores.watchlist.some(w => w.imdbId === d.imdbId)) {
      stores.watchlist.push({ ...d, addedAt: new Date().toISOString(), watchedAt: null });
      saveWL(); renderWatchlist();
    }
  });
  document.addEventListener('wl:remove', e => {
    const { stores, saveWL } = _deps;
    stores.watchlist = stores.watchlist.filter(w => w.imdbId !== e.detail.imdbId);
    saveWL(); renderWatchlist();
  });
  document.addEventListener('wl:toggle-watched', e => {
    const { stores, saveWL } = _deps;
    const d   = e.detail;
    let entry = stores.watchlist.find(w => w.imdbId === d.imdbId);
    if (!entry) { entry = { ...d, addedAt: new Date().toISOString(), watchedAt: null }; stores.watchlist.push(entry); }
    entry.watchedAt = entry.watchedAt ? null : new Date().toISOString();
    saveWL(); renderWatchlist();
  });
}

function _dl(content, name, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([content], {type})), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}
