// ═══════════════════════════════════════════════════════════════════════════
// freeflow.js — window.FreeFlow public API
// ═══════════════════════════════════════════════════════════════════════════

import { StorageManager } from './storage.js';
import * as GH from './github.js';

let _deps = {};

export function initFreeFlowAPI(deps) {
  _deps = deps;

  window.FreeFlow = {

    // ── Library ─────────────────────────────────────────────────────────────
    addCategory(tab, name, ids) {
      const lib = _deps.stores.library;
      if (!lib[tab] || tab === 'trending') { _log('addCategory: invalid tab "' + tab + '"', 'err'); return false; }
      if (!Array.isArray(ids)) { _log('addCategory: ids must be array', 'err'); return false; }
      const valid = ids.map(id => String(id).trim()).filter(id => /^tt\d+$/.test(id));
      lib[tab][name] = [...new Set(valid)];
      _deps.saveLibraryStore(); _log('addCategory: "' + name + '" \u2192 ' + tab + ' (' + lib[tab][name].length + ')', 'ok'); return true;
    },

    addIds(tab, cat, ids) {
      const lib = _deps.stores.library;
      if (!lib[tab] || tab === 'trending') { _log('addIds: invalid tab "' + tab + '"', 'err'); return false; }
      if (!Array.isArray(ids)) { _log('addIds: ids must be array', 'err'); return false; }
      const valid = ids.map(id => String(id).trim()).filter(id => /^tt\d+$/.test(id));
      if (!lib[tab][cat]) lib[tab][cat] = [];
      const before = lib[tab][cat].length;
      lib[tab][cat] = [...new Set([...lib[tab][cat], ...valid])];
      _deps.saveLibraryStore(); _log('addIds: +' + (lib[tab][cat].length - before) + ' to "' + cat + '" in ' + tab, 'ok'); return true;
    },

    addTrending(ids) {
      const lib = _deps.stores.library;
      if (!Array.isArray(ids)) { _log('addTrending: ids must be array', 'err'); return false; }
      const valid = ids.map(id => String(id).trim()).filter(id => /^tt\d+$/.test(id));
      const before = lib.trending.length;
      lib.trending = [...new Set([...lib.trending, ...valid])];
      _deps.saveLibraryStore(); _log('addTrending: +' + (lib.trending.length - before), 'ok'); return true;
    },

    removeCategory(tab, name) {
      const lib = _deps.stores.library;
      if (!lib[tab]?.[name]) { _log('removeCategory: "' + name + '" not found in ' + tab, 'warn'); return false; }
      delete lib[tab][name]; _deps.saveLibraryStore(); _log('removeCategory: "' + name + '" from ' + tab, 'ok'); return true;
    },

    setLibrary(lib) {
      if (!lib || typeof lib !== 'object') { _log('setLibrary: invalid object', 'err'); return false; }
      const store = _deps.stores.library;
      if (Array.isArray(lib.trending)) store.trending = lib.trending;
      if (lib.movies && typeof lib.movies === 'object') Object.assign(store.movies, lib.movies);
      if (lib.tv    && typeof lib.tv    === 'object') Object.assign(store.tv,     lib.tv);
      _deps.saveLibraryStore(); _log('setLibrary: merged', 'ok'); return true;
    },

    getLibrary() { return JSON.parse(JSON.stringify(_deps.stores.library)); },

    getIds(tab, cat) {
      const lib = _deps.stores.library;
      if (tab === 'trending') return [...lib.trending];
      if (!lib[tab]) return [];
      if (cat) return [...(lib[tab][cat] || [])];
      return [...new Set(Object.values(lib[tab]).flat())];
    },

    // ── UI ───────────────────────────────────────────────────────────────────
    async refresh() {
      _log('\u21ba refresh', 'info');
      const { loadBrowse } = await import('./library.js');
      const { loadPlayer } = await import('./player.js');
      loadBrowse(_deps.currentTabGetter(), _deps.EL_browseContent, { onCardClick: loadPlayer });
    },

    async goTo(tab) {
      if (!['trending', 'movies', 'tv', 'my'].includes(tab)) { _log('goTo: unknown tab "' + tab + '"', 'err'); return; }
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      document.querySelector('.tab[data-tab="' + tab + '"]')?.click();
      _log('goTo: ' + tab, 'ok');
    },

    async play(imdbId, type = 'movie') {
      const { loadPlayer } = await import('./player.js');
      loadPlayer(imdbId, type); _log('\u25b6 playing ' + imdbId, 'ok');
    },

    // ── Favorites ────────────────────────────────────────────────────────────
    favorites: {
      add(id)    { const ud = _deps.stores.userdata; if (!ud.favorites.includes(id)) { ud.favorites.push(id); _deps.saveUserdata(); } },
      remove(id) { const ud = _deps.stores.userdata; ud.favorites = ud.favorites.filter(f => f !== id); _deps.saveUserdata(); },
      toggle(id) { import('./userdata.js').then(m => m.toggleFav(id)); },
      has(id)    { return _deps.stores.userdata.favorites.includes(id); },
      all()      { return [..._deps.stores.userdata.favorites]; },
    },

    // ── Queue ────────────────────────────────────────────────────────────────
    queue: {
      async add(id, meta)  { const m = await import('./userdata.js'); m.addToQueue(id, meta); },
      async remove(id)     { const m = await import('./userdata.js'); m.removeFromQueue(id); },
      async watched(id)    { const m = await import('./userdata.js'); m.markQueueWatched(id); },
      has(id)              { return _deps.stores.userdata.queue.some(q => q.imdbId === id); },
      all()                { return [..._deps.stores.userdata.queue]; },
      clear()              { _deps.stores.userdata.queue = []; _deps.saveUserdata(); },
      autoRemove(val)      { _deps.stores.userdata.queueAutoRemove = !!val; _deps.saveUserdata(); },
    },

    // ── History ──────────────────────────────────────────────────────────────
    history: {
      async add(id, meta)  { const m = await import('./userdata.js'); m.addToHistory(id, meta); },
      all()                { return [..._deps.stores.userdata.history]; },
      clear()              { _deps.stores.userdata.history = []; _deps.saveUserdata(); },
    },

    // ── Continue watching ────────────────────────────────────────────────────
    continue: {
      async set(id, s, e)  { const m = await import('./userdata.js'); m.setContinueWatching(id, s, e); },
      async get(id)        { const m = await import('./userdata.js'); return m.getContinueWatching(id); },
      all()                { return { ..._deps.stores.userdata.continueWatching }; },
      clear(id)            { delete _deps.stores.userdata.continueWatching[id]; _deps.saveUserdata(); },
    },

    // ── Groups ───────────────────────────────────────────────────────────────
    groups: {
      async create(name, opts)       { const m = await import('./userdata.js'); return m.createGroup(name, opts); },
      async delete(id, recursive)    { const m = await import('./userdata.js'); m.deleteGroup(id, recursive); },
      async add(id, items)           { const m = await import('./userdata.js'); return m.addToGroup(id, items); },
      async remove(id, item)         { const m = await import('./userdata.js'); m.removeFromGroup(id, item); },
      get(id)                        { const g = _deps.stores.userdata.groups[id]; return g ? { ...g } : null; },
      all()                          { return Object.values(_deps.stores.userdata.groups).map(g => ({ ...g })); },
      roots()                        { return Object.values(_deps.stores.userdata.groups).filter(g => !g.parentId).map(g => ({ ...g })); },
      async members(id, recursive)   { const m = await import('./userdata.js'); return m.getGroupMembers(id, recursive); },
      async refresh()                { const m = await import('./userdata.js'); m.renderMyTab(); },
    },

    // ── Logging ──────────────────────────────────────────────────────────────
    log(msg, type) { _log(String(msg), type); },

    // ── Merge mode ───────────────────────────────────────────────────────────
    getMergeMode()  { return _deps.stores.prefs.mergeMode; },
    setMergeMode(m) {
      if (!['auto', 'ask', 'per-entry'].includes(m)) { _log('setMergeMode: invalid "' + m + '"', 'err'); return; }
      _deps.stores.prefs.mergeMode = m; _deps.savePrefs();
      document.querySelectorAll('.radio-opt').forEach(o => o.classList.toggle('sel', o.dataset.val === m));
      _log('merge mode \u2192 ' + m, 'ok');
    },

    // ── Storage ──────────────────────────────────────────────────────────────
    storage: {
      exportAll()    { return StorageManager.exportAll(); },
      statusReport() { return StorageManager.statusReport(); },
      migrationLog() { return StorageManager.migrationLog(); },
      errors()       { return StorageManager.errors(); },
    },

    // ── GitHub ───────────────────────────────────────────────────────────────
    github: {
      push()   { return GH.push(); },
      pull()   { return GH.pull(); },
      status() { return GH.statusSummary(); },
      configure(token, repo, file) { GH.configure(token, repo, file); },
    },

    // ── Metadata cache ───────────────────────────────────────────────────────
    getMetaCache()    { return JSON.parse(JSON.stringify(_deps.stores.meta)); },
    getCached(id)     { return _deps.stores.meta[id] ? { ..._deps.stores.meta[id] } : null; },
    clearMetaCache()  {
      if (!confirm('Clear metadata cache? FreeFlow will re-fetch from APIs as you browse.')) return;
      _deps.stores.meta = {}; _deps.saveMeta?.();
      import('./settings.js').then(m => m.updateLibStats());
      _log('Metadata cache cleared', 'ok');
    },
  };
}

function _log(msg, type = '') {
  import('./settings.js').then(m => m.pluginLog(msg, type)).catch(() => console.log('[FreeFlow]', msg));
}
