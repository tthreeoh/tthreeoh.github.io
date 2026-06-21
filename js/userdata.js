// ═══════════════════════════════════════════════════════════════════════════
// userdata.js — Favorites, Watch Queue, History, Groups, MY tab
// ═══════════════════════════════════════════════════════════════════════════

let _deps = {};
export function initUserdata(deps) { _deps = { ..._deps, ...deps }; _wireMyTab(); _wireGroupModal(); _wireCollectionsTab(); }

const ud   = () => _deps.stores.userdata;
const save = () => _deps.saveUserdata();

// Favorites
export const isFav = id => ud().favorites.includes(id);
export function toggleFav(id) {
  if (isFav(id)) ud().favorites = ud().favorites.filter(f => f !== id);
  else ud().favorites.push(id);
  save();
  document.querySelectorAll(`.card-fav[data-imdb="${id}"]`).forEach(b => b.classList.toggle('active', isFav(id)));
  if (document.getElementById('mysec-favorites')?.classList.contains('active')) renderFavorites();
}

async function renderFavorites() {
  const grid = document.getElementById('favGrid');
  const empty = document.getElementById('favEmpty');
  const count = document.getElementById('favCount');
  const ids = ud().favorites;
  count.textContent = ids.length + ' title' + (ids.length !== 1 ? 's' : '');
  if (!ids.length) { grid.innerHTML = ''; empty.classList.add('visible'); return; }
  empty.classList.remove('visible');
  grid.innerHTML = '<div class="loading" style="grid-column:1/-1"><div class="spinner"></div>Loading...</div>';
  const { fetchMany } = await import('./api.js');
  const { renderGrid } = await import('./library.js');
  const { loadPlayer } = await import('./player.js');
  renderGrid(await fetchMany(ids), grid, { onCardClick: loadPlayer });
}

// Queue
export const isQueued = id => ud().queue.some(q => q.imdbId === id);
export function addToQueue(imdbId, meta) {
  if (isQueued(imdbId)) return;
  const c = (_deps.stores.meta || {})[imdbId] || {};
  ud().queue.push({ imdbId,
    title: meta?.Title || c.Title || imdbId, year: meta?.Year || c.Year || '',
    type: meta?.Type || c.Type || 'movie',
    poster: (meta?.Poster && meta.Poster !== 'N/A' ? meta.Poster : '') || c.Poster || '',
    addedAt: new Date().toISOString(), watchedAt: null });
  save(); renderQueue();
}
export function removeFromQueue(imdbId) { ud().queue = ud().queue.filter(q => q.imdbId !== imdbId); save(); renderQueue(); }
export function markQueueWatched(imdbId) {
  const e = ud().queue.find(q => q.imdbId === imdbId); if (!e) return;
  e.watchedAt = new Date().toISOString();
  const cont = ud().continueWatching[imdbId];
  if (e.type === 'series' && cont) markEpisodeWatched(imdbId, cont.s, cont.e, e, true);
  else markMovieWatched(imdbId, e, true);
  if (ud().queueAutoRemove) removeFromQueue(imdbId); else { save(); renderQueue(); }
}

function renderQueue() {
  const list = document.getElementById('queueList');
  const empty = document.getElementById('queueEmpty');
  const count = document.getElementById('queueCount');
  const autoBtn = document.getElementById('queueAutoRemoveToggle');
  if (!list) return;
  autoBtn.textContent = 'AUTO-REMOVE: ' + (ud().queueAutoRemove ? 'ON' : 'OFF');
  autoBtn.style.color = ud().queueAutoRemove ? 'var(--green)' : '';
  autoBtn.style.borderColor = ud().queueAutoRemove ? 'var(--green-dim)' : '';
  count.textContent = ud().queue.length + ' titles';
  if (!ud().queue.length) { list.innerHTML = ''; empty.classList.add('visible'); return; }
  empty.classList.remove('visible'); list.innerHTML = '';
  ud().queue.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'queue-item'; div.draggable = true; div.dataset.idx = idx;
    const cont = ud().continueWatching[item.imdbId];
    const cLabel = cont ? 'S'+cont.s+'E'+cont.e : null;
    const watched = !!item.watchedAt;
    div.innerHTML = '<span class="queue-drag-handle" title="Drag to reorder">\u283f</span>' +
      '<img class="queue-poster" src="' + (item.poster||'') + '" alt="" onerror="this.style.opacity=0.2">' +
      '<div class="queue-info"><div class="queue-title' + (watched?' queue-watched':'') + '">' + (watched?'\u2713 ':'') + item.title + '</div>' +
      '<div class="queue-meta">' + (item.year||'') + ' \u00b7 ' + (item.type==='series'?'TV':'Movie') + '</div></div>' +
      (cLabel ? '<span class="queue-continue">\u25b6 ' + cLabel + '</span>' : '') +
      '<div class="queue-actions">' +
      '<button class="queue-btn" data-action="play" data-imdb="' + item.imdbId + '" data-type="' + item.type + '">\u25b6 PLAY</button>' +
      (!watched ? '<button class="queue-btn green" data-action="watched" data-imdb="' + item.imdbId + '">\u2713 WATCHED</button>' : '') +
      '<button class="queue-btn" data-action="remove" data-imdb="' + item.imdbId + '">\u2715</button></div>';
    div.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', idx); div.classList.add('dragging'); });
    div.addEventListener('dragend',   () => div.classList.remove('dragging'));
    div.addEventListener('dragover',  e => { e.preventDefault(); div.classList.add('drag-over'); });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
    div.addEventListener('drop', e => {
      e.preventDefault(); div.classList.remove('drag-over');
      const from = +e.dataTransfer.getData('text/plain'); if (from === idx) return;
      const [moved] = ud().queue.splice(from, 1); ud().queue.splice(idx, 0, moved); save(); renderQueue();
    });
    div.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (btn.dataset.action === 'play')    { const m = await import('./player.js'); m.loadPlayer(btn.dataset.imdb, btn.dataset.type); }
      if (btn.dataset.action === 'watched') markQueueWatched(btn.dataset.imdb);
      if (btn.dataset.action === 'remove')  removeFromQueue(btn.dataset.imdb);
    }));
    list.appendChild(div);
  });
}

// Watched state + history
function _ensureWatchedStores() {
  ud().watchedMovies ||= {};
  ud().watchedEpisodes ||= {};
}

function _metaFor(imdbId, meta = {}) {
  const c = (_deps.stores.meta||{})[imdbId] || {};
  return {
    title: meta?.title || meta?.Title || c.Title || imdbId,
    year: meta?.year || meta?.Year || c.Year || '',
    type: meta?.type || meta?.Type || c.Type || 'movie',
    poster: meta?.poster || (meta?.Poster && meta.Poster !== 'N/A' ? meta.Poster : '') || c.Poster || '',
  };
}

export function isMovieWatched(imdbId) {
  _ensureWatchedStores();
  return !!ud().watchedMovies[imdbId];
}

export function isEpisodeWatched(imdbId, s, e) {
  _ensureWatchedStores();
  return !!ud().watchedEpisodes[imdbId]?.[String(s)]?.[String(e)];
}

export function getWatchedEpisodeCount(imdbId) {
  _ensureWatchedStores();
  const show = ud().watchedEpisodes[imdbId] || {};
  return Object.values(show).reduce((sum, season) => sum + Object.keys(season || {}).length, 0);
}

export function isWatched(imdbId, type = 'movie') {
  return type === 'series' ? getWatchedEpisodeCount(imdbId) > 0 : isMovieWatched(imdbId);
}

export function markMovieWatched(imdbId, meta = {}, watched = true) {
  _ensureWatchedStores();
  const watchedAt = ud().watchedMovies[imdbId]?.watchedAt || new Date().toISOString();
  if (watched) {
    const wasWatched = isMovieWatched(imdbId);
    ud().watchedMovies[imdbId] = { watchedAt };
    if (!wasWatched) addToHistory(imdbId, { ...meta, type: 'movie' }, { episode: null, saveAfter: false });
  } else {
    delete ud().watchedMovies[imdbId];
    _removeHistory(imdbId, null);
  }
  const wlEntry = _deps.stores.watchlist?.find(w => w.imdbId === imdbId);
  if (wlEntry) {
    wlEntry.watchedAt = watched ? watchedAt : null;
    _deps.saveWL?.();
  }
  save(); _refreshWatchedUI(imdbId, 'movie');
}

export function toggleMovieWatched(imdbId, meta = {}) {
  markMovieWatched(imdbId, meta, !isMovieWatched(imdbId));
}

export function markEpisodeWatched(imdbId, s, e, meta = {}, watched = true) {
  _ensureWatchedStores();
  const season = String(+s || 1);
  const episode = String(+e || 1);
  ud().watchedEpisodes[imdbId] ||= {};
  ud().watchedEpisodes[imdbId][season] ||= {};
  const wasWatched = !!ud().watchedEpisodes[imdbId][season][episode];

  if (watched) {
    ud().watchedEpisodes[imdbId][season][episode] = {
      watchedAt: ud().watchedEpisodes[imdbId][season][episode]?.watchedAt || new Date().toISOString(),
    };
    if (!wasWatched) addToHistory(imdbId, { ...meta, type: 'series' }, { episode: { s: +season, e: +episode }, saveAfter: false });
  } else {
    delete ud().watchedEpisodes[imdbId][season][episode];
    if (!Object.keys(ud().watchedEpisodes[imdbId][season]).length) delete ud().watchedEpisodes[imdbId][season];
    if (!Object.keys(ud().watchedEpisodes[imdbId]).length) delete ud().watchedEpisodes[imdbId];
    _removeHistory(imdbId, { s: +season, e: +episode });
  }
  save(); _refreshWatchedUI(imdbId, 'series');
}

export function toggleEpisodeWatched(imdbId, s, e, meta = {}) {
  markEpisodeWatched(imdbId, s, e, meta, !isEpisodeWatched(imdbId, s, e));
}

export function addToHistory(imdbId, meta = {}, opts = {}) {
  const m = _metaFor(imdbId, meta);
  const cont = ud().continueWatching[imdbId];
  const episode = opts.episode !== undefined ? opts.episode : (m.type === 'series' && cont ? { s: cont.s, e: cont.e } : null);
  ud().history.unshift({ imdbId,
    title: m.title, year: m.year, type: m.type, poster: m.poster,
    watchedAt: new Date().toISOString(), episode });
  if (ud().history.length > 500) ud().history = ud().history.slice(0, 500);
  if (opts.saveAfter !== false) save();
}

function _removeHistory(imdbId, episode) {
  ud().history = ud().history.filter(item => {
    if (item.imdbId !== imdbId) return true;
    if (!episode) return !!item.episode;
    return !(item.episode && +item.episode.s === +episode.s && +item.episode.e === +episode.e);
  });
}

function _refreshWatchedUI(imdbId, type) {
  document.querySelectorAll(`.card[data-imdb="${imdbId}"]`).forEach(card => {
    const watched = isWatched(imdbId, type || card.dataset.type);
    card.classList.toggle('is-watched', watched);
    const btn = card.querySelector('.ca-watched');
    if (btn) {
      btn.classList.toggle('watched', watched);
      btn.textContent = card.dataset.type === 'series'
        ? (watched ? '✓ episodes' : 'episodes')
        : (watched ? '✓ watched' : '👁 watched');
    }
  });
  if (document.getElementById('mysec-history')?.classList.contains('active')) renderHistory();
  if (document.getElementById('mysec-collections')?.classList.contains('active')) renderCollections();
}

function renderHistory() {
  const list = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');
  const count = document.getElementById('historyCount');
  if (!list) return;
  count.textContent = ud().history.length + ' entries';
  if (!ud().history.length) { list.innerHTML = ''; empty.classList.add('visible'); return; }
  empty.classList.remove('visible'); list.innerHTML = '';
  ud().history.forEach(item => {
    const div = document.createElement('div'); div.className = 'history-item';
    const when = new Date(item.watchedAt);
    const ds = when.toLocaleDateString() + ' ' + when.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    div.innerHTML = '<img class="history-poster" src="' + (item.poster||'') + '" alt="" onerror="this.style.opacity=0.2">' +
      '<div class="history-info"><div class="history-title">' + item.title + '</div>' +
      '<div class="history-meta">' + (item.year||'') + ' \u00b7 ' + (item.type==='series'?'TV':'Movie') + (item.episode?' \u00b7 S'+item.episode.s+'E'+item.episode.e:'') + '</div></div>' +
      '<span class="history-date">' + ds + '</span>';
    div.addEventListener('click', async () => { const m = await import('./player.js'); m.loadPlayer(item.imdbId, item.type); });
    list.appendChild(div);
  });
}

// Continue watching
export function setContinueWatching(imdbId, s, e) { ud().continueWatching[imdbId] = { s, e, updatedAt: new Date().toISOString() }; save(); }
export function getContinueWatching(imdbId) { return ud().continueWatching[imdbId] || null; }

// Groups
function genId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
export function createGroup(name, opts = {}) {
  const id = opts.id || genId();
  ud().groups[id] = { id, name: name||'Unnamed', desc: opts.desc||'', color: opts.color||'#e63946',
    parentId: opts.parentId||opts.parent||null, members: opts.members||[],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const pid = opts.parentId||opts.parent;
  if (pid && ud().groups[pid] && !ud().groups[pid].members.includes(id)) ud().groups[pid].members.push(id);
  save(); return id;
}
export function deleteGroup(id, recursive = true) {
  const g = ud().groups[id]; if (!g) return;
  if (recursive) g.members.filter(m => ud().groups[m]).forEach(cid => deleteGroup(cid, true));
  if (g.parentId && ud().groups[g.parentId]) ud().groups[g.parentId].members = ud().groups[g.parentId].members.filter(m => m !== id);
  delete ud().groups[id]; save();
}
export function addToGroup(gid, items) {
  const g = ud().groups[gid]; if (!g) return false;
  (Array.isArray(items)?items:[items]).forEach(item => { if (!g.members.includes(item)) g.members.push(item); });
  g.updatedAt = new Date().toISOString(); save(); return true;
}
export function removeFromGroup(gid, item) {
  const g = ud().groups[gid]; if (!g) return;
  g.members = g.members.filter(m => m !== item); g.updatedAt = new Date().toISOString(); save();
}
export function getGroupMembers(gid, recursive = false) {
  const g = ud().groups[gid]; if (!g) return [];
  if (!recursive) return [...g.members];
  const ids = new Set();
  const collect = id => { const gr = ud().groups[id]; if (!gr) return; gr.members.forEach(m => ud().groups[m] ? collect(m) : ids.add(m)); };
  collect(gid); return [...ids];
}

function renderGroups() {
  const tree = document.getElementById('groupTree');
  const empty = document.getElementById('groupsEmpty');
  const count = document.getElementById('groupCount');
  if (!tree) return;
  const roots = Object.values(ud().groups).filter(g => !g.parentId);
  count.textContent = Object.keys(ud().groups).length + ' group' + (Object.keys(ud().groups).length !== 1 ? 's' : '');
  if (!roots.length) { tree.innerHTML = ''; empty.classList.add('visible'); return; }
  empty.classList.remove('visible'); tree.innerHTML = '';
  roots.forEach(g => tree.appendChild(_buildGroupNode(g.id)));
}

function _buildGroupNode(gid) {
  const g = ud().groups[gid]; if (!g) return document.createTextNode('');
  const childIds = g.members.filter(m => ud().groups[m]);
  const titleIds = g.members.filter(m => !ud().groups[m]);
  const node = document.createElement('div'); node.className = 'group-node';
  const hdr = document.createElement('div'); hdr.className = 'group-header';
  hdr.innerHTML = '<span class="group-color-dot" style="background:' + g.color + '"></span>' +
    '<span class="group-name">' + g.name + '</span>' +
    '<span class="group-meta">' + titleIds.length + ' titles \u00b7 ' + childIds.length + ' subgroups</span>' +
    ((childIds.length||titleIds.length) ? '<span class="group-chevron">\u203a</span>' : '') +
    '<div class="group-actions">' +
    '<button class="group-btn" data-action="add" data-gid="' + gid + '">+</button>' +
    '<button class="group-btn" data-action="edit" data-gid="' + gid + '">\u270e</button>' +
    '<button class="group-btn" data-action="del"  data-gid="' + gid + '">\u2715</button></div>';
  const children = document.createElement('div'); children.className = 'group-children';
  childIds.forEach(cid => children.appendChild(_buildGroupNode(cid)));
  titleIds.forEach(imdbId => {
    const c = (_deps.stores.meta||{})[imdbId] || {};
    const item = document.createElement('div'); item.className = 'group-item';
    item.innerHTML = '<img class="group-item-poster" src="' + (c.Poster||'') + '" alt="" onerror="this.style.opacity=0.2">' +
      '<span class="group-item-title">' + (c.Title||imdbId) + (c.Year?' ('+c.Year+')':'') + '</span>' +
      '<button class="group-item-remove" data-gid="' + gid + '" data-imdb="' + imdbId + '">\u2715</button>';
    item.querySelector('.group-item-title').addEventListener('click', async () => { const m = await import('./player.js'); m.loadPlayer(imdbId, c.Type||'movie'); });
    item.querySelector('.group-item-remove').addEventListener('click', e => { e.stopPropagation(); removeFromGroup(gid, imdbId); renderGroups(); });
    children.appendChild(item);
  });
  hdr.addEventListener('click', e => {
    if (e.target.closest('.group-actions')) return;
    children.classList.toggle('open'); hdr.querySelector('.group-chevron')?.classList.toggle('open');
  });
  hdr.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    const {action, gid: id} = btn.dataset;
    if (action === 'edit') openGroupModal(id);
    if (action === 'del')  { if (confirm('Delete "' + g.name + '"?')) { deleteGroup(id); renderGroups(); } }
    if (action === 'add')  {
      const raw = prompt('Enter IMDb IDs (comma-separated):'); if (!raw) return;
      const ids = raw.split(',').map(s => s.trim()).filter(s => /^tt\d+$/.test(s));
      if (ids.length) { addToGroup(id, ids); renderGroups(); }
    }
  }));
  node.appendChild(hdr);
  if (childIds.length || titleIds.length) node.appendChild(children);
  return node;
}

let _editingId = null, _selectedColor = '#e63946';
function openGroupModal(editId = null) {
  _editingId = editId;
  const nameI = document.getElementById('groupModalName');
  const descI = document.getElementById('groupModalDesc');
  const delBtn = document.getElementById('groupModalDelete');
  const parentSel = document.getElementById('groupModalParent');
  parentSel.innerHTML = '<option value="">— none (top level) —</option>';
  Object.values(ud().groups).forEach(g => {
    if (g.id === editId) return;
    const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.name; parentSel.appendChild(opt);
  });
  if (editId) {
    const g = ud().groups[editId];
    document.getElementById('groupModalTitle').textContent = 'EDIT GROUP';
    nameI.value = g.name; descI.value = g.desc||''; parentSel.value = g.parentId||'';
    _selectedColor = g.color||'#e63946'; delBtn.style.display = '';
  } else {
    document.getElementById('groupModalTitle').textContent = 'NEW GROUP';
    nameI.value = ''; descI.value = ''; parentSel.value = '';
    _selectedColor = '#e63946'; delBtn.style.display = 'none';
  }
  document.querySelectorAll('.group-color-opt').forEach(b => b.classList.toggle('active', b.dataset.color === _selectedColor));
  document.getElementById('groupModalOverlay').classList.add('open'); nameI.focus();
}

function _wireGroupModal() {
  document.querySelectorAll('.group-color-opt').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.group-color-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); _selectedColor = btn.dataset.color;
  }));
  document.getElementById('groupModalSave')?.addEventListener('click', () => {
    const name = document.getElementById('groupModalName').value.trim(); if (!name) return;
    const desc = document.getElementById('groupModalDesc').value.trim();
    const pid  = document.getElementById('groupModalParent').value || null;
    if (_editingId) {
      const g = ud().groups[_editingId];
      if (g.parentId !== pid) {
        if (g.parentId && ud().groups[g.parentId]) ud().groups[g.parentId].members = ud().groups[g.parentId].members.filter(m => m !== _editingId);
        g.parentId = pid;
        if (pid && ud().groups[pid] && !ud().groups[pid].members.includes(_editingId)) ud().groups[pid].members.push(_editingId);
      }
      Object.assign(g, { name, desc, color: _selectedColor, updatedAt: new Date().toISOString() }); save();
    } else { createGroup(name, { desc, color: _selectedColor, parentId: pid }); }
    document.getElementById('groupModalOverlay').classList.remove('open'); renderGroups();
  });
  document.getElementById('groupModalDelete')?.addEventListener('click', () => {
    if (!_editingId) return;
    if (confirm('Delete "' + ud().groups[_editingId]?.name + '"?')) { deleteGroup(_editingId); document.getElementById('groupModalOverlay').classList.remove('open'); renderGroups(); }
  });
  document.getElementById('groupModalCancel')?.addEventListener('click', () => document.getElementById('groupModalOverlay').classList.remove('open'));
  document.getElementById('groupModalOverlay')?.addEventListener('click', e => { if (e.target.id === 'groupModalOverlay') e.target.classList.remove('open'); });
  document.getElementById('newGroupBtn')?.addEventListener('click', () => openGroupModal(null));
}

function _wireMyTab() {
  document.querySelectorAll('.my-tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.my-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.my-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active'); document.getElementById('mysec-' + btn.dataset.mytab)?.classList.add('active');
    renderMyTab();
  }));
  document.getElementById('queueAutoRemoveToggle')?.addEventListener('click', () => { ud().queueAutoRemove = !ud().queueAutoRemove; save(); renderQueue(); });
  document.getElementById('queueClearWatched')?.addEventListener('click',     () => { ud().queue = ud().queue.filter(q => !q.watchedAt); save(); renderQueue(); });
  document.getElementById('historyClearBtn')?.addEventListener('click',        () => { if (!ud().history.length) return; if (confirm('Clear watch history?')) { ud().history = []; save(); renderHistory(); } });
}

export function renderMyTab() {
  const active = document.querySelector('.my-tab.active')?.dataset.mytab;
  if (active === 'favorites')   renderFavorites();
  if (active === 'queue')       renderQueue();
  if (active === 'history')     renderHistory();
  if (active === 'groups')      renderGroups();
  if (active === 'collections') renderCollections();
}

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTIONS — follow TMDB collections, auto-track new entries
// ═══════════════════════════════════════════════════════════════════════════

export async function followCollection(tmdbCollectionId) {
  const { fetchCollection } = await import('./api.js');
  const data = await fetchCollection(tmdbCollectionId);
  if (!data) return null;
  const col = {
    id:         String(data.id),
    name:       data.name,
    tmdbId:     data.id,
    poster:     data.poster,
    backdrop:   data.backdrop,
    overview:   data.overview,
    members:    data.parts.map(p => p.imdbId),
    parts:      data.parts, // [{imdbId, tmdbId, title, poster}]
    followedAt: new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
    complete:   false,
  };
  ud().collections[String(data.id)] = col;
  save();
  renderCollections();
  return col;
}

export function unfollowCollection(colId) {
  delete ud().collections[String(colId)];
  save();
  renderCollections();
}

export function getCollections() {
  return Object.values(ud().collections || {});
}

export function isFollowingCollection(tmdbColId) {
  return !!(ud().collections || {})[String(tmdbColId)];
}

// Refresh a followed collection — fetch latest from TMDB and add any new entries
export async function refreshCollection(colId) {
  const col = (ud().collections || {})[String(colId)];
  if (!col) return;
  const { fetchCollection } = await import('./api.js');
  const fresh = await fetchCollection(col.tmdbId);
  if (!fresh) return;
  const newIds = fresh.parts.map(p => p.imdbId);
  col.members  = newIds;
  col.parts    = fresh.parts;
  col.updatedAt = new Date().toISOString();
  save();
  renderCollections();
}

// Mark watched status — complete if all members are in history
export function updateCollectionComplete(colId) {
  const col = (ud().collections || {})[String(colId)];
  if (!col) return;
  col.complete = col.members.every(id => isMovieWatched(id));
  save();
}

function renderCollections() {
  const container = document.getElementById('collectionsList');
  const empty     = document.getElementById('collectionsEmpty');
  const count     = document.getElementById('collectionsCount');
  if (!container) return;

  const cols = getCollections();
  count.textContent = cols.length + ' collection' + (cols.length !== 1 ? 's' : '');

  if (!cols.length) {
    container.innerHTML = '';
    empty.classList.add('visible');
    return;
  }
  empty.classList.remove('visible');
  container.innerHTML = '';

  cols.forEach(col => {
    const div = document.createElement('div');
    div.className = 'collection-card';
    const watched = col.members.filter(id => isMovieWatched(id)).length;
    const pct = col.members.length ? Math.round((watched / col.members.length) * 100) : 0;

    div.innerHTML = `
      <div class="collection-poster-wrap">
        ${col.poster ? `<img class="collection-poster" src="${col.poster}" alt="">` : '<div class="collection-poster no-poster"></div>'}
        ${col.complete ? '<span class="collection-complete-badge">✓ COMPLETE</span>' : ''}
      </div>
      <div class="collection-info">
        <div class="collection-name">${col.name}</div>
        <div class="collection-meta">${col.members.length} titles · ${watched} watched · ${pct}%</div>
        <div class="collection-progress"><div class="collection-progress-fill" style="width:${pct}%"></div></div>
        <div class="collection-parts" id="colparts-${col.id}"></div>
      </div>
      <div class="collection-actions">
        <button class="btn-ghost btn-sm col-refresh" data-id="${col.id}" title="Refresh from TMDB">↺</button>
        <button class="btn-ghost btn-sm col-unfollow" data-id="${col.id}" style="color:var(--red);border-color:var(--red-dim)">UNFOLLOW</button>
      </div>`;

    // Render parts inline
    const partsEl = div.querySelector(`#colparts-${col.id}`);
    col.parts.forEach(p => {
      const isWatched = isMovieWatched(p.imdbId);
      const part = document.createElement('div');
      part.className = 'collection-part' + (isWatched ? ' watched' : '');
      part.innerHTML = `
        ${p.poster ? `<img src="${p.poster}" class="collection-part-poster" alt="">` : '<div class="collection-part-poster no-poster"></div>'}
        <span class="collection-part-title">${p.title}</span>
        ${isWatched ? '<span style="color:var(--green);font-size:9px;flex-shrink:0">✓</span>' : ''}`;
      part.addEventListener('click', async () => {
        const m = await import('./player.js');
        m.loadPlayer(p.imdbId, 'movie');
      });
      partsEl.appendChild(part);
    });

    div.querySelector('.col-refresh').addEventListener('click', async e => {
      e.stopPropagation();
      const btn = e.target; btn.textContent = '…';
      await refreshCollection(col.id);
      btn.textContent = '↺';
    });
    div.querySelector('.col-unfollow').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Unfollow "${col.name}"?`)) unfollowCollection(col.id);
    });

    container.appendChild(div);
  });
}

// ── Collection offer banner (shown in player when TMDB reports a collection) ──
export async function offerCollection(tmdbCollectionId, collectionName) {
  if (!tmdbCollectionId) return;
  const existing = document.getElementById('collectionOfferBanner');
  if (existing) existing.remove();

  const alreadyFollowing = isFollowingCollection(tmdbCollectionId);
  const banner = document.createElement('div');
  banner.id = 'collectionOfferBanner';
  banner.className = 'collection-offer-banner';
  banner.innerHTML = `
    <span class="collection-offer-label">Part of <strong>${collectionName}</strong></span>
    ${alreadyFollowing
      ? '<span class="collection-offer-status">✓ Following</span>'
      : `<button class="btn btn-sm collection-offer-follow" data-col="${tmdbCollectionId}" data-name="${collectionName}">+ FOLLOW COLLECTION</button>`
    }
    <button class="collection-offer-close">✕</button>`;

  banner.querySelector('.collection-offer-close').addEventListener('click', () => banner.remove());

  if (!alreadyFollowing) {
    banner.querySelector('.collection-offer-follow').addEventListener('click', async e => {
      const btn = e.target;
      btn.textContent = 'Following…'; btn.disabled = true;
      const col = await followCollection(tmdbCollectionId);
      if (col) {
        btn.textContent = '✓ Following';
        btn.style.background = 'var(--green)';
      } else {
        btn.textContent = '✗ Failed'; btn.disabled = false;
      }
    });
  }

  // Insert into player meta area
  const playerMeta = document.querySelector('.player-meta');
  if (playerMeta) playerMeta.insertAdjacentElement('afterend', banner);
}

// Wire collections sub-tab on init (called after _wireMyTab in initUserdata)
export function _wireCollectionsTab() {
  // Search form
  document.getElementById('colSearchBtn')?.addEventListener('click', async () => {
    const q = document.getElementById('colSearchInput').value.trim();
    if (!q) return;
    const btn = document.getElementById('colSearchBtn');
    btn.textContent = '…'; btn.disabled = true;
    const { searchCollections } = await import('./api.js');
    const results = await searchCollections(q);
    btn.textContent = 'SEARCH'; btn.disabled = false;
    const res = document.getElementById('colSearchResults');
    if (!results.length) { res.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:8px 0">No results</div>'; return; }
    res.innerHTML = '';
    results.forEach(c => {
      const row = document.createElement('div');
      row.className = 'col-search-result';
      row.innerHTML = `
        ${c.poster ? `<img src="${c.poster}" style="width:28px;height:42px;object-fit:cover;border:1px solid var(--border);flex-shrink:0">` : '<div style="width:28px;height:42px;background:var(--surface2);border:1px solid var(--border);flex-shrink:0"></div>'}
        <span style="flex:1;font-size:11px;color:var(--text)">${c.name}</span>
        <button class="btn btn-sm col-follow-result" data-id="${c.id}" data-name="${c.name}">${isFollowingCollection(c.id) ? '✓ Following' : '+ FOLLOW'}</button>`;
      row.querySelector('.col-follow-result').addEventListener('click', async e => {
        const btn = e.target; if (btn.textContent === '✓ Following') return;
        btn.textContent = '…'; btn.disabled = true;
        const col = await followCollection(c.id);
        btn.textContent = col ? '✓ Following' : '✗ Failed';
        if (col) btn.style.background = 'var(--green)';
      });
      res.appendChild(row);
    });
  });
  document.getElementById('colSearchInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('colSearchBtn')?.click();
  });
}
