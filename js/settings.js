// ═══════════════════════════════════════════════════════════════════════════
// settings.js — Settings drawer, all panels, GitHub sync UI, conflict diff
// ═══════════════════════════════════════════════════════════════════════════

import { StorageManager, FileStorageAdapter } from './storage.js';
import * as GH from './github.js';

let _deps = {};
export function initSettings(deps) { _deps = deps; _wireAll(); }

function _wireAll() {
  // Settings open/close
  document.getElementById('settingsBtn')?.addEventListener('click', openSettings);
  document.getElementById('settingsClose')?.addEventListener('click', closeSettings);
  document.getElementById('settingsDim')?.addEventListener('click', closeSettings);
  // Sub-tabs
  document.querySelectorAll('.stab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.spanel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('spanel-' + btn.dataset.stab)?.classList.add('active');
    if (btn.dataset.stab === 'library') updateLibStats();
  }));
  // OMDB key
  document.getElementById('keyBtn')?.addEventListener('click', async () => {
    const v = document.getElementById('keyInput').value.trim(); if (!v) return;
    _deps.setKeyStatus('Testing…');
    const t = await fetch('https://www.omdbapi.com/?apikey=' + v + '&i=tt0052077').then(r=>r.json()).catch(()=>({}));
    if (t.Response === 'True') {
      _deps.stores.prefs.omdbKey = v; _deps.savePrefs(); _deps.setKeyDot('ok'); _deps.setKeyStatus('✓ Key active', 'var(--green)');
      const { setApiKeys } = await import('./api.js'); setApiKeys(v, _deps.stores.prefs.tmdbKey||'');
      const ct = _deps.currentTabGetter(); const { loadPlayer } = await import('./player.js');
      _deps.loadBrowse(ct, _deps.EL_browseContent, { onCardClick: loadPlayer });
    } else { _deps.setKeyDot('err'); _deps.setKeyStatus('✗ Invalid key', 'var(--red)'); }
  });
  document.getElementById('keyInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('keyBtn')?.click(); });
  // TMDB key
  document.getElementById('tmdbKeyBtn')?.addEventListener('click', async () => {
    const v = document.getElementById('tmdbKeyInput')?.value.trim(); if (!v) return;
    const t = await fetch('https://api.themoviedb.org/3/authentication?api_key=' + v).then(r=>r.json()).catch(()=>({}));
    const el = document.getElementById('tmdbKeyStatus');
    if (t.success) {
      _deps.stores.prefs.tmdbKey = v; _deps.savePrefs(); if (el) { el.textContent = '✓ TMDB active'; el.style.color = 'var(--green)'; }
      const { setApiKeys } = await import('./api.js'); setApiKeys(_deps.stores.prefs.omdbKey||'trilogy', v);
    } else { if (el) { el.textContent = '✗ Invalid TMDB key'; el.style.color = 'var(--red)'; } }
  });
  // Merge radios
  document.querySelectorAll('.radio-opt').forEach(o => o.addEventListener('click', () => {
    _deps.stores.prefs.mergeMode = o.dataset.val; _deps.savePrefs();
    document.querySelectorAll('.radio-opt').forEach(x => x.classList.toggle('sel', x.dataset.val === o.dataset.val));
  }));
  // Backup
  document.getElementById('exportAllBtn')?.addEventListener('click', () => _dl(StorageManager.exportAll(), 'freeflow-backup-' + new Date().toISOString().slice(0,10) + '.json', 'application/json'));
  document.getElementById('importAllBtn')?.addEventListener('click', () => document.getElementById('backupFilePicker')?.click());
  document.getElementById('backupFilePicker')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = ev => { try { const res = StorageManager.importAll(ev.target.result); window.__FF_reloadStores?.(); pluginLog('✓ Restored:\n' + res.join('\n'), 'ok'); } catch(err) { pluginLog('✗ ' + err.message, 'err'); } }; r.readAsText(file); e.target.value = '';
  });
  // Library exports/imports
  document.getElementById('exportJsBtn')?.addEventListener('click', async () => {
    const { LIBRARY } = await import('./library.js');
    const mc = Object.entries(LIBRARY.movies).map(([cat,ids]) => '  FreeFlow.addCategory(\'movies\', ' + JSON.stringify(cat) + ', [\n    ' + ids.map(id => "'" + id + "'").join(', ') + '\n  ]);').join('\n');
    const tc = Object.entries(LIBRARY.tv).map(([cat,ids]) => '  FreeFlow.addCategory(\'tv\', ' + JSON.stringify(cat) + ', [\n    ' + ids.map(id => "'" + id + "'").join(', ') + '\n  ]);').join('\n');
    _dl('// FreeFlow Library Plugin\n(function() {\n  FreeFlow.addTrending([' + LIBRARY.trending.map(id => "'" + id + "'").join(', ') + ']);\n' + mc + '\n' + tc + '\n  FreeFlow.refresh();\n})();', 'freeflow-library.js', 'text/javascript');
  });
  document.getElementById('exportJsonBtn')?.addEventListener('click', async () => { const { LIBRARY } = await import('./library.js'); _dl(JSON.stringify(LIBRARY, null, 2), 'freeflow-library.json', 'application/json'); });
  document.getElementById('exportMetaBtn')?.addEventListener('click', () => {
    const mc = _deps.stores.meta; const n = Object.keys(mc).length; if (!n) { pluginLog('Cache empty', 'warn'); return; }
    _dl(JSON.stringify({ _info: { exportedAt: new Date().toISOString(), count: n }, cache: mc }, null, 2), 'freeflow-metadata.json', 'application/json'); updateLibStats();
  });
  document.getElementById('importMetaFileBtn')?.addEventListener('click', () => document.getElementById('metaFilePicker')?.click());
  document.getElementById('metaFilePicker')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = ev => {
      try {
        const p = JSON.parse(ev.target.result); const inc = p.cache || p; let added = 0, skipped = 0;
        Object.entries(inc).forEach(([id, entry]) => { if (!id.startsWith('tt') || typeof entry !== 'object') return; if (!_deps.stores.meta[id]) { _deps.stores.meta[id] = entry; added++; } else { Object.entries(entry).forEach(([k,v]) => { if (v && !_deps.stores.meta[id][k]) _deps.stores.meta[id][k] = v; }); skipped++; } });
        _deps.saveMeta(); updateLibStats();
        const el = document.getElementById('metaStatus'); if (el) { el.textContent = '✓ +' + added + ' new, ' + skipped + ' merged'; el.style.color = 'var(--green)'; }
      } catch (err) { const el = document.getElementById('metaStatus'); if (el) { el.textContent = '✗ ' + err.message; el.style.color = 'var(--red)'; } }
    }; r.readAsText(file); e.target.value = '';
  });
  document.getElementById('importJsFileBtn')?.addEventListener('click', () => document.getElementById('jsFilePicker')?.click());
  document.getElementById('jsFilePicker')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = ev => {
      document.getElementById('pluginCode').value = ev.target.result;
      document.querySelectorAll('.stab').forEach(b => b.classList.toggle('active', b.dataset.stab === 'plugin'));
      document.querySelectorAll('.spanel').forEach(p => p.classList.toggle('active', p.id === 'spanel-plugin'));
      pluginLog('Loaded "' + file.name + '" → Plugin editor. Press ▶ RUN to execute.', 'warn');
    }; r.readAsText(file); e.target.value = '';
  });
  document.getElementById('importJsonFileBtn')?.addEventListener('click', () => document.getElementById('jsonFilePicker')?.click());
  document.getElementById('jsonFilePicker')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader(); r.onload = async ev => { try { await _doImport(JSON.parse(ev.target.result), 'file: ' + file.name); const el = document.getElementById('fileStatus'); if (el) el.textContent = '✓ ' + file.name; } catch(err) { const el = document.getElementById('fileStatus'); if (el) { el.textContent = '✗ ' + err.message; el.style.color = 'var(--red)'; } } }; r.readAsText(file); e.target.value = '';
  });
  document.getElementById('jsonPasteBtn')?.addEventListener('click', async () => {
    const raw = document.getElementById('jsonPaste').value.trim(); if (!raw) return;
    const st = document.getElementById('pasteStatus');
    try { await _doImport(JSON.parse(raw), 'paste'); if (st) { st.textContent = '✓ Imported'; st.style.color = 'var(--green)'; } } catch(err) { if (st) { st.textContent = '✗ ' + err.message; st.style.color = 'var(--red)'; } }
  });
  document.getElementById('jsonPasteClear')?.addEventListener('click', () => { document.getElementById('jsonPaste').value = ''; const el = document.getElementById('pasteStatus'); if (el) el.textContent = ''; });
  document.getElementById('resetLibBtn')?.addEventListener('click', async () => {
    if (!confirm('Reset library to defaults?')) return;
    const { DEFAULT_LIBRARY, setLibrary } = await import('./library.js'); setLibrary(DEFAULT_LIBRARY()); _deps.saveLibraryStore(); updateLibStats();
    const { loadPlayer } = await import('./player.js'); _deps.loadBrowse(_deps.currentTabGetter(), _deps.EL_browseContent, { onCardClick: loadPlayer }); pluginLog('✓ Library reset', 'ok');
  });
  // File storage
  document.getElementById('fsAttachBtn')?.addEventListener('click', async () => {
    if (!FileStorageAdapter.supported) { _fsStatus('✗ Not available. Use Chrome or Edge.', 'var(--red)'); return; }
    try { _fsStatus('Opening…'); const name = await FileStorageAdapter.openPicker(); _fsStatus('✓ Attached: ' + name, 'var(--green)'); updateFileSyncUI(); window.__FF_reloadStores?.(); } catch(e) { if (e.name !== 'AbortError') _fsStatus('✗ ' + e.message, 'var(--red)'); else _fsStatus('Cancelled.'); }
  });
  document.getElementById('fsNewBtn')?.addEventListener('click', async () => {
    if (!FileStorageAdapter.supported) { _fsStatus('✗ Not available.', 'var(--red)'); return; }
    try { _fsStatus('Choose location…'); const name = await FileStorageAdapter.createNew(); _fsStatus('✓ Created: ' + name, 'var(--green)'); updateFileSyncUI(); } catch(e) { if (e.name !== 'AbortError') _fsStatus('✗ ' + e.message, 'var(--red)'); else _fsStatus('Cancelled.'); }
  });
  document.getElementById('fsDetachBtn')?.addEventListener('click', async () => { await FileStorageAdapter.detach(); _fsStatus('Detached.'); updateFileSyncUI(); });
  // Plugin
  document.getElementById('pluginRun')?.addEventListener('click', () => {
    const code = document.getElementById('pluginCode').value.trim(); if (!code) return;
    document.getElementById('pluginLog').innerHTML = ''; pluginLog('Running…', 'warn');
    try { new Function('FreeFlow', code)(window.FreeFlow); updateLibStats(); } catch(e) { pluginLog('Error: ' + e.message, 'err'); }
  });
  document.getElementById('pluginClear')?.addEventListener('click', () => { document.getElementById('pluginCode').value = ''; });
  document.getElementById('clearLog')?.addEventListener('click', () => { document.getElementById('pluginLog').innerHTML = '<span class="ll ac">// cleared</span>'; });
  document.getElementById('pluginTemplate')?.addEventListener('click', () => {
    document.getElementById('pluginCode').value = "// FreeFlow Plugin Template\n(function() {\n  FreeFlow.addCategory('movies', 'A24 Films', [\n    'tt1981115', // Hereditary\n    'tt5027774', // Three Billboards\n    'tt6751668', // Parasite\n  ]);\n  FreeFlow.log('Template executed!', 'ok');\n  FreeFlow.refresh();\n})();";
    pluginLog('Template loaded', 'info');
  });
  document.getElementById('pluginSave')?.addEventListener('click', () => {
    const code = document.getElementById('pluginCode').value.trim(); if (!code) return;
    const name = prompt('Snippet name:', 'Snippet ' + (_deps.stores.snippets.length + 1)); if (!name) return;
    _deps.stores.snippets.push({ name, code, savedAt: new Date().toISOString() }); _deps.saveSnippets(); renderSnippets(); pluginLog('✓ Snippet saved', 'ok');
  });
  // Recovery
  document.getElementById('recoveryExport')?.addEventListener('click', () => _dl(StorageManager.exportAll(), 'freeflow-backup-recovery.json', 'application/json'));
  document.getElementById('recoveryReset')?.addEventListener('click', () => { StorageManager.errors().forEach(e => { const s = StorageManager.schema(e.key); if (s) StorageManager.save(e.key, s.defaults()); }); document.getElementById('recoveryOverlay').classList.remove('open'); window.__FF_reloadStores?.(); pluginLog('✓ Keys reset', 'ok'); });
  document.getElementById('recoveryDismiss')?.addEventListener('click', () => document.getElementById('recoveryOverlay').classList.remove('open'));
  // File sync bar
  document.getElementById('fileSyncSaveNow')?.addEventListener('click', async () => { const ok = await FileStorageAdapter.save(); pluginLog(ok ? '✓ File saved' : '✗ Save failed', ok ? 'ok' : 'err'); });
  document.getElementById('fileSyncReload')?.addEventListener('click', async () => { const r = await FileStorageAdapter.reloadFromFile(); if (r) { pluginLog('✓ Reloaded', 'ok'); window.__FF_reloadStores?.(); } else pluginLog('✗ Reload failed', 'err'); });
  document.getElementById('fileSyncDetach')?.addEventListener('click', async () => { await FileStorageAdapter.detach(); updateFileSyncUI(); pluginLog('Detached', 'warn'); });
  document.getElementById('fileSyncMsg')?.addEventListener('click', async () => { if (FileStorageAdapter.status === 'permission-needed') { const ok = await FileStorageAdapter.requestPermission(); if (ok) { window.__FF_reloadStores?.(); pluginLog('✓ Permission re-granted', 'ok'); } } });
  // GitHub
  document.getElementById('ghSaveBtn')?.addEventListener('click', async () => {
    const token = document.getElementById('ghToken').value.trim(); const repo = document.getElementById('ghRepo').value.trim(); const file = document.getElementById('ghFile').value.trim() || 'freeflow-data.json'; const auto = document.getElementById('ghAutoSync')?.checked || false;
    if (!token || !repo) { _ghStatus('✗ Token and repo required', 'var(--red)'); return; }
    Object.assign(_deps.stores.prefs, { githubToken: token, githubRepo: repo, githubFile: file, githubAutoSync: auto }); _deps.savePrefs();
    GH.configure(token, repo, file); _ghStatus('Saved. Testing…');
    const r = await GH.push(); _ghStatus(r.ok ? '✓ Connected and synced!' : '✗ ' + r.reason, r.ok ? 'var(--green)' : 'var(--red)'); updateGitHubUI();
  });
  document.getElementById('ghPushBtn')?.addEventListener('click', async () => { _ghStatus('Pushing…'); const r = await GH.push(); _ghStatus(r.ok ? '✓ Pushed!' : '✗ ' + r.reason, r.ok ? 'var(--green)' : 'var(--red)'); updateGitHubUI(); });
  document.getElementById('ghPullBtn')?.addEventListener('click', async () => {
    _ghStatus('Pulling…'); const r = await GH.pull();
    if (r.ok) { window.__FF_reloadStores?.(); _ghStatus('✓ Pulled!', 'var(--green)'); }
    else if (r.reason === 'conflict') { _ghStatus('⚠ Conflict — opening diff viewer', 'var(--yellow)'); _openConflictDiff(r.local, r.remote); }
    else _ghStatus('✗ ' + r.reason, 'var(--red)'); updateGitHubUI();
  });
}

export function openSettings()  { syncSettingsUI(); document.getElementById('settingsDrawer').classList.add('open');  document.getElementById('settingsDim').classList.add('open'); }
export function closeSettings() { document.getElementById('settingsDrawer').classList.remove('open'); document.getElementById('settingsDim').classList.remove('open'); }

export function syncSettingsUI() {
  document.querySelectorAll('.radio-opt').forEach(o => o.classList.toggle('sel', o.dataset.val === _deps.stores.prefs.mergeMode));
  updateLibStats(); renderSnippets(); renderSchemaBanner(); updateGitHubUI();
  const p = _deps.stores.prefs;
  const ghToken = document.getElementById('ghToken'); if (ghToken && p.githubToken) ghToken.value = p.githubToken;
  const ghRepo = document.getElementById('ghRepo'); if (ghRepo && p.githubRepo) ghRepo.value = p.githubRepo;
  const ghFile = document.getElementById('ghFile'); if (ghFile && p.githubFile) ghFile.value = p.githubFile;
  const ghAuto = document.getElementById('ghAutoSync'); if (ghAuto) ghAuto.checked = !!p.githubAutoSync;
  const tmdbInp = document.getElementById('tmdbKeyInput'); if (tmdbInp && p.tmdbKey) tmdbInp.value = p.tmdbKey;
}

export function renderSchemaBanner() {
  const el = document.getElementById('schemaBanner'); if (!el) return;
  const report = StorageManager.statusReport(); const migLog = StorageManager.migrationLog();
  el.innerHTML = report.map(r => { const m = migLog.find(x => x.key === r.key); const cls = r.status === 'ok' ? 'schema-ok' : 'schema-migrated'; return '<div class="schema-row"><span class="schema-key">' + r.key + '</span><span class="' + cls + '">v' + r.currentVersion + '</span><span style="color:#444;margin:0 4px">·</span><span style="color:var(--muted)">' + r.status + '</span>' + (m ? ' <span class="schema-migrated">↑ migrated from ' + m.from + '</span>' : '') + '</div>'; }).join('');
}

export function updateLibStats() {
  const el = document.getElementById('libStats'); if (!el) return;
  const lib = _deps.stores.library || {}; const mc = Object.values(lib.movies||{}).flat().length; const tc = Object.values(lib.tv||{}).flat().length; const cached = Object.keys(_deps.stores.meta||{}).length;
  el.innerHTML = '<div class="stat-box"><div class="stat-num">' + (lib.trending||[]).length + '</div><div class="stat-lbl">Trending</div></div><div class="stat-box"><div class="stat-num">' + mc + '</div><div class="stat-lbl">Movies · ' + Object.keys(lib.movies||{}).length + ' cats</div></div><div class="stat-box"><div class="stat-num">' + tc + '</div><div class="stat-lbl">TV · ' + Object.keys(lib.tv||{}).length + ' cats</div></div>';
  const cs = document.getElementById('cacheStats'); if (cs) cs.innerHTML = '<span style="font-size:10px;color:var(--muted)">Metadata cache: <strong style="color:var(--text)">' + cached + '</strong> titles · <strong style="color:var(--text)">' + (JSON.stringify(_deps.stores.meta).length/1024).toFixed(1) + ' KB</strong></span>';
}

export function updateFileSyncUI() {
  const bar = document.getElementById('fileSyncBar'); const dot = document.getElementById('fileSyncDot'); const msg = document.getElementById('fileSyncMsg'); const path = document.getElementById('fileSyncPath');
  if (!bar) return;
  const status = FileStorageAdapter.status;
  bar.className = 'filesync-bar'; dot.className = 'filesync-dot';
  const fssMode = document.getElementById('fssMode'); const fssFile = document.getElementById('fssFile'); const fssLW = document.getElementById('fssLastWrite'); const fssSup = document.getElementById('fssSupport'); const detachBtn = document.getElementById('fsDetachBtn');
  if (fssSup) { fssSup.textContent = FileStorageAdapter.supported ? '✓ available (Chrome/Edge)' : '✗ not available'; fssSup.style.color = FileStorageAdapter.supported ? 'var(--green)' : 'var(--red)'; }
  if (status === 'attached') { bar.classList.add('visible'); msg.textContent = '● FILE SYNC ACTIVE'; if (path) path.textContent = FileStorageAdapter.fileName||''; if (fssMode) fssMode.textContent = 'file-backed'; if (fssFile) { fssFile.textContent = FileStorageAdapter.fileName||'—'; fssFile.style.color = 'var(--green)'; } if (fssLW) fssLW.textContent = FileStorageAdapter.lastWrite ? new Date(FileStorageAdapter.lastWrite).toLocaleTimeString() : '—'; if (detachBtn) detachBtn.disabled = false; }
  else if (status === 'permission-needed') { bar.classList.add('visible', 'warn'); dot.classList.add('pulse'); msg.textContent = '⚠ CLICK TO RE-GRANT FILE PERMISSION'; if (path) path.textContent = FileStorageAdapter.fileName||''; if (detachBtn) detachBtn.disabled = false; }
  else if (status === 'error') { bar.classList.add('visible', 'err'); dot.classList.add('pulse'); msg.textContent = '✗ FILE SYNC ERROR'; if (detachBtn) detachBtn.disabled = false; }
  else { bar.classList.remove('visible'); if (fssMode) fssMode.textContent = 'localStorage only'; if (fssFile) { fssFile.textContent = 'none'; fssFile.style.color = 'var(--muted)'; } if (fssLW) fssLW.textContent = '—'; if (detachBtn) detachBtn.disabled = true; }
}

export function updateGitHubUI() {
  const s = GH.statusSummary(); const el = document.getElementById('ghStatus');
  if (el) { el.textContent = s.configured ? s.status + ' · ' + s.repo + ' · last sync: ' + (s.lastSync ? new Date(s.lastSync).toLocaleTimeString() : 'never') : 'not configured'; el.style.color = s.status === 'synced' ? 'var(--green)' : s.status === 'conflict' ? 'var(--yellow)' : 'var(--muted)'; }
}

export function renderSnippets() {
  const list = document.getElementById('snippetList'); const empty = document.getElementById('snippetEmpty'); if (!list) return;
  list.querySelectorAll('.snippet-item').forEach(el => el.remove()); empty.style.display = _deps.stores.snippets.length ? 'none' : 'block';
  _deps.stores.snippets.forEach((sn, idx) => {
    const div = document.createElement('div'); div.className = 'snippet-item'; div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);background:var(--bg)';
    div.innerHTML = '<div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + sn.name + '</div><div style="font-size:9px;color:var(--muted);margin-top:1px">' + new Date(sn.savedAt).toLocaleDateString() + ' · ' + sn.code.split('\n').length + ' lines</div></div><button class="btn-ghost btn-sm sn-load">LOAD</button><button class="btn-ghost btn-sm sn-run" style="color:var(--green);border-color:var(--green-dim)">RUN</button><button class="btn-remove sn-del" style="font-size:13px">✕</button>';
    div.querySelector('.sn-load').addEventListener('click', () => { document.getElementById('pluginCode').value = sn.code; pluginLog('Loaded "' + sn.name + '"', 'info'); });
    div.querySelector('.sn-run').addEventListener('click', () => { document.getElementById('pluginLog').innerHTML = ''; pluginLog('Running "' + sn.name + '"…', 'warn'); try { new Function('FreeFlow', sn.code)(window.FreeFlow); updateLibStats(); } catch(e) { pluginLog('Error: ' + e.message, 'err'); } });
    div.querySelector('.sn-del').addEventListener('click', () => { if (confirm('Delete "' + sn.name + '"?')) { _deps.stores.snippets.splice(idx, 1); _deps.saveSnippets(); renderSnippets(); } });
    list.insertBefore(div, empty);
  });
}

export function pluginLog(msg, type = '') {
  const log = document.getElementById('pluginLog'); if (!log) { console.log('[FF]', msg); return; }
  const cls = { ok: 'l-ok', err: 'l-err', warn: 'l-warn', info: 'l-info' }[type] || '';
  const line = document.createElement('div'); line.className = 'll' + (cls ? ' ' + cls : ''); line.textContent = '> ' + msg;
  log.appendChild(line); log.scrollTop = log.scrollHeight;
}

async function _doImport(incoming, source) {
  const mergeMode = _deps.stores.prefs.mergeMode;
  const { importAll } = StorageManager;
  if (mergeMode === 'auto') {
    const envelope = { _schema: 'freeflow-backup', _version: 1, _exportedAt: new Date().toISOString(), keys: {} };
    ['trending','movies','tv'].forEach(k => { if (incoming[k]) envelope.keys['ff_library'] = { _v: 1, data: incoming }; });
    StorageManager.importAll(JSON.stringify(envelope));
    window.__FF_reloadStores?.(); pluginLog('✓ Merged from ' + source, 'ok');
  } else {
    pluginLog('Staging not yet wired in modular build — use auto-merge or import via FreeFlow.storage', 'warn');
  }
}

function _openConflictDiff(local, remote) {
  const overlay = document.getElementById('conflictOverlay'); const body = document.getElementById('conflictBody');
  if (!overlay || !body) { pluginLog('Conflict detected. Use FreeFlow.github.pull() to resolve programmatically.', 'warn'); return; }
  const diff = GH.buildDiff(local, remote); body.innerHTML = '';
  Object.entries(diff).forEach(([key, entry]) => {
    const row = document.createElement('div'); row.style.cssText = 'border-bottom:1px solid var(--border);padding:12px 0';
    row.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:#7ec8e3;margin-bottom:8px">' + key + '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:10px"><div><div style="color:var(--muted);margin-bottom:4px">LOCAL</div><pre style="background:var(--bg);border:1px solid var(--border);padding:6px;overflow:auto;max-height:100px;font-size:9px">' + JSON.stringify(entry.local, null, 2).slice(0, 400) + '</pre></div><div><div style="color:var(--muted);margin-bottom:4px">REMOTE</div><pre style="background:var(--bg);border:1px solid var(--border);padding:6px;overflow:auto;max-height:100px;font-size:9px">' + JSON.stringify(entry.remote, null, 2).slice(0, 400) + '</pre></div></div><div style="display:flex;gap:6px;margin-top:8px"><button class="btn-ghost btn-sm conf-local" data-key="' + key + '">KEEP LOCAL</button><button class="btn conf-remote" data-key="' + key + '" style="font-size:10px;padding:4px 10px">KEEP REMOTE</button></div>';
    row.querySelectorAll('[data-key]').forEach(btn => btn.addEventListener('click', () => { diff[key].chosen = btn.classList.contains('conf-local') ? 'local' : 'remote'; row.querySelectorAll('button').forEach(b => b.style.opacity = '0.5'); btn.style.opacity = '1'; }));
    body.appendChild(row);
  });
  overlay.classList.add('open');
  document.getElementById('conflictCommit')?.addEventListener('click', async () => { const r = await GH.commitResolution(diff); overlay.classList.remove('open'); window.__FF_reloadStores?.(); pluginLog(r.ok ? '✓ Conflict resolved' : '✗ ' + r.reason, r.ok ? 'ok' : 'err'); }, { once: true });
  document.getElementById('conflictCancel')?.addEventListener('click', () => overlay.classList.remove('open'), { once: true });
}

function _ghStatus(msg, color = 'var(--muted)') { const el = document.getElementById('ghConnectStatus'); if (el) { el.textContent = msg; el.style.color = color; } }
function _fsStatus(msg, color = 'var(--muted)') { const el = document.getElementById('fsStatus'); if (el) { el.textContent = msg; el.style.color = color; } }
function _dl(content, name, type) { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([content], {type})), download: name }); a.click(); URL.revokeObjectURL(a.href); }
