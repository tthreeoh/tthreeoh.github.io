// ═══════════════════════════════════════════════════════════════════════════
// userdata.js — Favorites, Watch Queue, History, Groups, MY tab
// ═══════════════════════════════════════════════════════════════════════════

let _deps = {};
export function initUserdata(deps) { _deps = { ..._deps, ...deps }; _wireMyTab(); _wireGroupModal(); }

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
  e.watchedAt = new Date().toISOString(); addToHistory(imdbId, e);
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

// History
export function addToHistory(imdbId, meta) {
  const c = (_deps.stores.meta||{})[imdbId] || {};
  const cont = ud().continueWatching[imdbId];
  ud().history.unshift({ imdbId,
    title: meta?.title || c.Title || imdbId, year: meta?.year || c.Year || '',
    type: meta?.type || c.Type || 'movie', poster: meta?.poster || c.Poster || '',
    watchedAt: new Date().toISOString(), episode: cont ? { s: cont.s, e: cont.e } : null });
  if (ud().history.length > 500) ud().history = ud().history.slice(0, 500);
  save();
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
  if (active === 'favorites') renderFavorites();
  if (active === 'queue')     renderQueue();
  if (active === 'history')   renderHistory();
  if (active === 'groups')    renderGroups();
}
