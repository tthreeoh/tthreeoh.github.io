// ═══════════════════════════════════════════════════════════════════════════
// storage.js — StorageManager + FileStorageAdapter
//
// StorageManager: versioned schemas, chained migrations, recovery-aware.
// FileStorageAdapter: optional File System Access API layer on top.
//
// Envelope format: { _v: <int>, _key: <str>, _savedAt: <iso>, data: <any> }
//
// To add a field in a future update:
//   1. Bump the version number for that key's schema
//   2. Add migrations[newVersion] = (prev) => newShape
//   Never rename or remove existing migration steps.
// ═══════════════════════════════════════════════════════════════════════════

import { DEFAULT_LIBRARY } from './defaults.js';

// ─────────────────────────────────────────────────────────────────────────────
// STORAGEMANAGER
// ─────────────────────────────────────────────────────────────────────────────

export const StorageManager = (() => {

  const SCHEMAS = {};

  // ── ff_prefs ──────────────────────────────────────────────────────────────
  SCHEMAS['ff_prefs'] = {
    version: 2,
    defaults: () => ({
      omdbKey:    'trilogy',
      tmdbKey:    '',
      mergeMode:  'ask',
      githubToken:'',
      githubRepo: '',   // e.g. "username/freeflow-data"
      githubFile: 'freeflow-data.json',
      githubAutoSync: false,
      theme: 'dark',
      accent: 'red',
      cardDensity: 'standard',
      defaultTab: 'trending',
      rememberLastTab: false,
      lastActiveTab: 'trending',
      alwaysShowCardActions: false,
    }),
    migrations: {
      1: d => ({
        omdbKey:       typeof d?.omdbKey    === 'string' ? d.omdbKey    : 'trilogy',
        tmdbKey:       typeof d?.tmdbKey    === 'string' ? d.tmdbKey    : '',
        mergeMode:     typeof d?.mergeMode  === 'string' ? d.mergeMode  : 'ask',
        githubToken:   typeof d?.githubToken=== 'string' ? d.githubToken: '',
        githubRepo:    typeof d?.githubRepo === 'string' ? d.githubRepo : '',
        githubFile:    typeof d?.githubFile === 'string' ? d.githubFile : 'freeflow-data.json',
        githubAutoSync:typeof d?.githubAutoSync==='boolean'? d.githubAutoSync: false,
      }),
      2: d => {
        const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
        return {
          ...d,
          theme: typeof d?.theme === 'string' ? oneOf(d.theme, ['dark','light','contrast'], 'dark') : 'dark',
          accent: typeof d?.accent === 'string' ? oneOf(d.accent, ['red','teal','gold','blue'], 'red') : 'red',
          cardDensity: typeof d?.cardDensity === 'string' ? oneOf(d.cardDensity, ['compact','standard','roomy'], 'standard') : 'standard',
          defaultTab: typeof d?.defaultTab === 'string' ? oneOf(d.defaultTab, ['trending','movies','tv','my'], 'trending') : 'trending',
          rememberLastTab: typeof d?.rememberLastTab === 'boolean' ? d.rememberLastTab : false,
          lastActiveTab: typeof d?.lastActiveTab === 'string' ? oneOf(d.lastActiveTab, ['trending','movies','tv','my'], 'trending') : 'trending',
          alwaysShowCardActions: typeof d?.alwaysShowCardActions === 'boolean' ? d.alwaysShowCardActions : false,
        };
      },
    },
  };

  // ── ff_watchlist ──────────────────────────────────────────────────────────
  SCHEMAS['ff_watchlist'] = {
    version: 1,
    defaults: () => [],
    migrations: {
      1: d => {
        if (!Array.isArray(d)) return [];
        return d.map(item => ({
          imdbId:   item.imdbId   || item.imdbID || '',
          title:    item.title    || '',
          year:     item.year     || '',
          type:     item.type     || 'movie',
          poster:   item.poster   || '',
          rating:   item.rating   || '',
          genre:    item.genre    || '',
          addedAt:  item.addedAt  || new Date().toISOString(),
          watchedAt:item.watchedAt|| null,
        }));
      },
    },
  };

  // ── ff_meta ───────────────────────────────────────────────────────────────
  // Unified cache: best data from TMDB + OMDB merged per title
  SCHEMAS['ff_meta'] = {
    version: 2,
    defaults: () => ({}),
    migrations: {
      1: d => {
        if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
        const entries = d.cache || d;
        const out = {};
        Object.entries(entries).forEach(([id, e]) => {
          if (!id.startsWith('tt') || typeof e !== 'object') return;
          out[id] = {
            // Core (OMDB)
            imdbID:       e.imdbID       || id,
            Title:        e.Title        || '',
            Year:         e.Year         || '',
            Type:         e.Type         || '',
            Rated:        e.Rated        || '',
            Runtime:      e.Runtime      || '',
            Genre:        e.Genre        || '',
            Director:     e.Director     || '',
            Actors:       e.Actors       || '',
            Plot:         e.Plot         || '',
            Poster:       e.Poster       || '',
            imdbRating:   e.imdbRating   || '',
            Metascore:    e.Metascore    || '',
            totalSeasons: e.totalSeasons || '',
            // TMDB enrichment (v2 adds these, default empty)
            tmdbId:       e.tmdbId       || null,
            backdropPath: e.backdropPath || '',
            trailerKey:   e.trailerKey   || '',  // YouTube key
            cast:         e.cast         || [],  // [{name, character, profilePath}]
            recommendations: e.recommendations || [], // [imdbID]
            streamingProviders: e.streamingProviders || [], // [{name, logo}]
            tmdbRating:   e.tmdbRating   || '',
            tagline:      e.tagline      || '',
            cachedAt:     e.cachedAt     || new Date().toISOString(),
            tmdbCachedAt: e.tmdbCachedAt || null,
          };
        });
        return out;
      },
      // v2: adds TMDB fields to existing v1 entries (no-op since v1 migration
      // already writes empty defaults — just bumps version)
      2: d => d,
    },
  };

  // ── ff_snippets ───────────────────────────────────────────────────────────
  SCHEMAS['ff_snippets'] = {
    version: 1,
    defaults: () => [],
    migrations: {
      1: d => {
        if (!Array.isArray(d)) return [];
        return d.map(s => ({
          name:    s.name    || 'Unnamed',
          code:    s.code    || '',
          savedAt: s.savedAt || new Date().toISOString(),
        }));
      },
    },
  };

  // ── ff_library ────────────────────────────────────────────────────────────
  SCHEMAS['ff_library'] = {
    version: 1,
    defaults: () => DEFAULT_LIBRARY(),
    migrations: {
      1: d => {
        const def = DEFAULT_LIBRARY();
        return {
          trending: Array.isArray(d?.trending)                     ? d.trending : def.trending,
          movies:   d?.movies && typeof d.movies === 'object'      ? d.movies   : def.movies,
          tv:       d?.tv     && typeof d.tv     === 'object'      ? d.tv       : def.tv,
        };
      },
    },
  };

  // ── ff_userdata ───────────────────────────────────────────────────────────
  SCHEMAS['ff_userdata'] = {
    version: 2,
    defaults: () => ({
      favorites:       [],
      groups:          {},
      queue:           [],
      queueAutoRemove: false,
      history:         [],
      continueWatching:{},
      collections:     {}, // tmdbCollectionId → { id, name, tmdbId, poster, members:[imdbId], followedAt, complete }
    }),
    migrations: {
      1: d => {
        if (!d || typeof d !== 'object') return SCHEMAS['ff_userdata'].defaults();
        const def = SCHEMAS['ff_userdata'].defaults();
        return {
          favorites:        Array.isArray(d.favorites)              ? d.favorites        : def.favorites,
          groups:           d.groups && typeof d.groups==='object'  ? d.groups           : def.groups,
          queue:            Array.isArray(d.queue)                  ? d.queue            : def.queue,
          queueAutoRemove:  typeof d.queueAutoRemove==='boolean'    ? d.queueAutoRemove  : def.queueAutoRemove,
          history:          Array.isArray(d.history)                ? d.history          : def.history,
          continueWatching: d.continueWatching && typeof d.continueWatching==='object'
                            ? d.continueWatching : def.continueWatching,
          collections:      {}, // new in v2
        };
      },
      2: d => ({
        ...d,
        collections: (d.collections && typeof d.collections === 'object') ? d.collections : {},
      }),
    },
  };

  // ── Internal ──────────────────────────────────────────────────────────────
  const _migrationLog = [];
  const _errors       = [];

  function _wrap(key, data) {
    return JSON.stringify({
      _v:       SCHEMAS[key].version,
      _key:     key,
      _savedAt: new Date().toISOString(),
      data,
    });
  }

  function _runMigrations(key, fromVersion, data) {
    const schema = SCHEMAS[key];
    let current = data;
    for (let v = fromVersion + 1; v <= schema.version; v++) {
      if (schema.migrations[v]) current = schema.migrations[v](current);
    }
    if (fromVersion < schema.version) {
      _migrationLog.push({ key, from: fromVersion, to: schema.version, migratedAt: new Date().toISOString() });
    }
    return current;
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  function load(key) {
    const schema = SCHEMAS[key];
    if (!schema) throw new Error('Unknown storage key: ' + key);

    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed._v === 'number') {
          return _runMigrations(key, parsed._v, parsed.data);
        }
        // Legacy unversioned
        const data = _runMigrations(key, 0, parsed);
        save(key, data);
        return data;
      } catch (err) {
        _errors.push({ key, error: err.message, raw: String(raw).slice(0, 300) });
        return schema.defaults();
      }
    }

    // Legacy key names
    const legacyMap = {
      ff_library:   'freeflow_library',
      ff_watchlist: 'freeflow_watchlist',
      ff_snippets:  'freeflow_snippets',
    };
    const lk = legacyMap[key];
    if (lk) {
      const legacyRaw = localStorage.getItem(lk);
      if (legacyRaw) {
        try {
          const data = _runMigrations(key, 0, JSON.parse(legacyRaw));
          save(key, data);
          localStorage.removeItem(lk);
          return data;
        } catch (err) {
          _errors.push({ key, error: 'Legacy migration failed: ' + err.message, raw: String(legacyRaw).slice(0, 300) });
        }
      }
    }

    // ff_prefs: absorb legacy bare keys
    if (key === 'ff_prefs') {
      const legacyOmdb  = localStorage.getItem('omdb_key');
      const legacyMerge = localStorage.getItem('ff_merge');
      if (legacyOmdb || legacyMerge) {
        const data = schema.migrations[1]({ omdbKey: legacyOmdb, mergeMode: legacyMerge });
        save(key, data);
        if (legacyOmdb)  localStorage.removeItem('omdb_key');
        if (legacyMerge) localStorage.removeItem('ff_merge');
        _migrationLog.push({ key, from: 'legacy keys', to: schema.version, migratedAt: new Date().toISOString() });
        return data;
      }
    }

    return schema.defaults();
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function save(key, data) {
    if (!SCHEMAS[key]) throw new Error('Unknown storage key: ' + key);
    try {
      localStorage.setItem(key, _wrap(key, data));
    } catch (err) {
      console.error('[StorageManager] Write failed:', key, err);
      _errors.push({ key, error: 'Write failed: ' + err.message, raw: '' });
    }
  }

  // ── Backup / Restore ──────────────────────────────────────────────────────
  function exportAll() {
    const out = {
      _schema:    'freeflow-backup',
      _version:    1,
      _exportedAt: new Date().toISOString(),
      keys: {},
    };
    Object.keys(SCHEMAS).forEach(key => {
      try { out.keys[key] = { _v: SCHEMAS[key].version, data: load(key) }; } catch {}
    });
    return JSON.stringify(out, null, 2);
  }

  function importAll(json) {
    const parsed = JSON.parse(json);
    if (parsed._schema !== 'freeflow-backup') throw new Error('Not a valid FreeFlow backup file');
    const results = [];
    Object.entries(parsed.keys || {}).forEach(([key, entry]) => {
      if (!SCHEMAS[key]) { results.push('Skipped unknown key: ' + key); return; }
      try {
        const data = _runMigrations(key, entry._v || 0, entry.data);
        save(key, data);
        results.push('✓ ' + key + ' (v' + (entry._v||0) + ' → v' + SCHEMAS[key].version + ')');
      } catch (err) { results.push('✗ ' + key + ': ' + err.message); }
    });
    return results;
  }

  // ── Status ────────────────────────────────────────────────────────────────
  function statusReport() {
    return Object.keys(SCHEMAS).map(key => {
      const schema = SCHEMAS[key];
      const raw    = localStorage.getItem(key);
      let storedV  = '—', status = 'missing';
      if (raw) {
        try {
          const p  = JSON.parse(raw);
          storedV  = p._v !== undefined ? p._v : 'legacy';
          status   = storedV === schema.version ? 'ok' : 'migrated';
        } catch { status = 'corrupt'; }
      }
      const migrated = _migrationLog.find(m => m.key === key);
      return { key, currentVersion: schema.version, storedVersion: storedV, status, migratedThisSession: !!migrated };
    });
  }

  return {
    load, save, exportAll, importAll, statusReport,
    migrationLog: () => [..._migrationLog],
    errors:       () => [..._errors],
    schema:       k  => SCHEMAS[k],
    keys:         () => Object.keys(SCHEMAS),
  };
})();


// ─────────────────────────────────────────────────────────────────────────────
// FILE STORAGE ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

export const FileStorageAdapter = (() => {
  const IDB_DB    = 'freeflow_fs';
  const IDB_STORE = 'handles';
  const IDB_KEY   = 'primary';

  let _handle    = null;
  let _fileName  = null;
  let _lastWrite = null;
  let _supported = typeof window?.showOpenFilePicker === 'function';
  let _status    = 'detached'; // 'detached'|'attached'|'permission-needed'|'error'
  let _onChange  = () => {};

  function _openIDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess  = e => res(e.target.result);
      req.onerror    = e => rej(e.target.error);
    });
  }

  async function _saveHandle(h) {
    try {
      const db = await _openIDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(h, IDB_KEY);
      await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    } catch {}
  }

  async function _loadHandle() {
    try {
      const db = await _openIDB();
      return await new Promise((res, rej) => {
        const tx  = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => res(req.result || null);
        req.onerror   = () => rej(req.error);
      });
    } catch { return null; }
  }

  async function _clearHandle() {
    try {
      const db = await _openIDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
    } catch {}
  }

  async function _read(h)         { return (await h.getFile()).text(); }
  async function _write(h, text)  {
    const w = await h.createWritable();
    await w.write(text); await w.close();
    _lastWrite = new Date().toISOString();
  }

  function _snapshot() { return StorageManager.exportAll(); }

  async function attach(handle) {
    if (!_supported) throw new Error('File System Access API not supported');
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { _status = 'permission-needed'; _onChange(); throw new Error('Permission denied'); }
    _handle = handle; _fileName = handle.name; _status = 'attached';
    try { const t = await _read(handle); if (t.trim()) { StorageManager.importAll(t); _reloadApp(); } } catch {}
    await _saveHandle(handle); _onChange(); return true;
  }

  async function createNew() {
    if (!_supported) throw new Error('File System Access API not supported');
    const h = await window.showSaveFilePicker({
      suggestedName: 'freeflow-data.json',
      types: [{ description: 'FreeFlow Data', accept: { 'application/json': ['.json'] } }],
    });
    await h.requestPermission({ mode: 'readwrite' });
    await _write(h, _snapshot());
    _handle = h; _fileName = h.name; _status = 'attached';
    await _saveHandle(h); _onChange(); return h.name;
  }

  async function openPicker() {
    if (!_supported) throw new Error('File System Access API not supported');
    const [h] = await window.showOpenFilePicker({
      types: [{ description: 'FreeFlow Data', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    });
    await attach(h); return h.name;
  }

  async function save() {
    if (!_handle) return false;
    try {
      const perm = await _handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const rp = await _handle.requestPermission({ mode: 'readwrite' });
        if (rp !== 'granted') { _status = 'permission-needed'; _onChange(); return false; }
      }
      await _write(_handle, _snapshot());
      _status = 'attached'; _onChange(); return true;
    } catch (e) {
      console.error('[FileStorage] save failed:', e);
      _status = 'error'; _onChange(); return false;
    }
  }

  async function reloadFromFile() {
    if (!_handle) return false;
    try { const t = await _read(_handle); const r = StorageManager.importAll(t); _reloadApp(); _onChange(); return r; }
    catch (e) { console.error('[FileStorage] reload failed:', e); return false; }
  }

  async function detach() {
    _handle = null; _fileName = null; _status = 'detached';
    await _clearHandle(); _onChange();
  }

  async function tryRestoreFromIDB() {
    if (!_supported) return false;
    const h = await _loadHandle();
    if (!h) return false;
    _handle = h; _fileName = h.name;
    try {
      const perm = await h.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _status = 'attached';
        try { const t = await _read(h); if (t.trim()) { StorageManager.importAll(t); _reloadApp(); } } catch {}
      } else { _status = 'permission-needed'; }
    } catch { _status = 'permission-needed'; }
    _onChange(); return true;
  }

  async function requestPermission() {
    if (!_handle) return false;
    try {
      const perm = await _handle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _status = 'attached';
        try { const t = await _read(_handle); if (t.trim()) { StorageManager.importAll(t); _reloadApp(); } } catch {}
        await save(); _onChange(); return true;
      }
    } catch {}
    return false;
  }

  // Intercept StorageManager.save — write file after every localStorage write
  const _origSave = StorageManager.save.bind(StorageManager);
  StorageManager.save = function(key, data) {
    _origSave(key, data);                          // ① localStorage (sync, always works)
    if (_handle && _status === 'attached') save(); // ② file (async, fire-and-forget)
    // If permission-needed: localStorage written, banner visible until re-grant
  };

  function _reloadApp() {
    if (typeof window.__FF_reloadStores === 'function') window.__FF_reloadStores();
  }

  return {
    get supported() { return _supported; },
    get status()    { return _status;    },
    get fileName()  { return _fileName;  },
    get lastWrite() { return _lastWrite; },
    attach, createNew, openPicker, save, reloadFromFile,
    detach, tryRestoreFromIDB, requestPermission,
    onStatusChange: fn => { _onChange = fn; },
  };
})();
