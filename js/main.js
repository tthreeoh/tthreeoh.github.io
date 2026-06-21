// ═══════════════════════════════════════════════════════════════════════════
// main.js — Boot sequence. Wires all modules together.
// ═══════════════════════════════════════════════════════════════════════════

import { StorageManager, FileStorageAdapter } from './storage.js';
import { setApiKeys, setMetaCache, initWorker, cacheFromOmdb, fetchFull, fetchMany } from './api.js';
import { LIBRARY, setLibrary, saveLibrary, loadBrowse, execSearch, renderGrid, registerGridCallbacks } from './library.js';
import { configure as configureGitHub, pull as githubPull, push as githubPush,
         schedulePush, onStatusChange as onGithubStatusChange, statusSummary as githubStatus } from './github.js';
import { initPlayer, loadPlayer, execLoadPlayer } from './player.js';
import { initUserdata, isFav, isQueued, toggleFav, addToQueue, removeFromQueue,
         markQueueWatched, addToHistory, setContinueWatching, getContinueWatching,
         isWatched, isMovieWatched, isEpisodeWatched, toggleMovieWatched, toggleEpisodeWatched,
         markMovieWatched, getWatchedEpisodeCount,
         createGroup, renderMyTab } from './userdata.js';
import { initWatchlist, renderWatchlist as renderWL, updateAddBtn } from './watchlist.js';
import { initSettings, syncSettingsUI, renderSchemaBanner, updateLibStats, updateFileSyncUI } from './settings.js';
import { initFreeFlowAPI } from './freeflow.js';

// ─────────────────────────────────────────────────────────────────────────────
// ELEMENT REFS  (shared across modules via import)
// ─────────────────────────────────────────────────────────────────────────────

export const EL = {
  browsePanel:   document.getElementById('browsePanel'),
  playerPanel:   document.getElementById('playerPanel'),
  myPanel:       document.getElementById('myPanel'),
  browseContent: document.getElementById('browseContent'),
  playerIframe:  document.getElementById('playerIframe'),
  playerTitle:   document.getElementById('playerTitle'),
  playerTags:    document.getElementById('playerTags'),
  playerPlot:    document.getElementById('playerPlot'),
  playerPoster:  document.getElementById('playerPoster'),
  episodeBar:    document.getElementById('episodeBar'),
  seasonSel:     document.getElementById('seasonSel'),
  episodeSel:    document.getElementById('episodeSel'),
  searchInput:   document.getElementById('searchInput'),
  ttInput:       document.getElementById('ttInput'),
  navBack:       document.getElementById('navBack'),
  navFwd:        document.getElementById('navFwd'),
  breadcrumbs:   document.getElementById('breadcrumbs'),
  keyDot:        document.getElementById('keyDot'),
  fileSyncBar:   document.getElementById('fileSyncBar'),
};

// ─────────────────────────────────────────────────────────────────────────────
// LOAD ALL STORES
// ─────────────────────────────────────────────────────────────────────────────

export const stores = {
  prefs:    StorageManager.load('ff_prefs'),
  watchlist:StorageManager.load('ff_watchlist'),
  snippets: StorageManager.load('ff_snippets'),
  meta:     StorageManager.load('ff_meta'),
  library:  StorageManager.load('ff_library'),
  userdata: StorageManager.load('ff_userdata'),
};

export function savePrefs()    { StorageManager.save('ff_prefs',    stores.prefs); }
export function saveWL()       { StorageManager.save('ff_watchlist',stores.watchlist); }
export function saveSnippets() { StorageManager.save('ff_snippets', stores.snippets); }
export function saveMeta()     { StorageManager.save('ff_meta',     stores.meta); }
export function saveLibraryStore() { StorageManager.save('ff_library', stores.library); }
export function saveUserdata() { StorageManager.save('ff_userdata', stores.userdata); }

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION HISTORY
// ─────────────────────────────────────────────────────────────────────────────

let navHistory = [], historyIdx = -1, navigating = false;

export function pushHistory(entry) {
  if (navigating) return;
  navHistory = navHistory.slice(0, historyIdx + 1);
  navHistory.push(entry);
  historyIdx = navHistory.length - 1;
  updateNavUI();
}

function updateNavUI() {
  EL.navBack.disabled = historyIdx <= 0;
  EL.navFwd.disabled  = historyIdx >= navHistory.length - 1;
  renderBreadcrumbs();
}

function renderBreadcrumbs() {
  if (!navHistory.length) { EL.breadcrumbs.innerHTML = ''; return; }
  const s = Math.max(0, historyIdx - 4);
  EL.breadcrumbs.innerHTML = navHistory.slice(s, historyIdx + 1).map((e, i) => {
    const ri = s + i, cur = ri === historyIdx;
    return `${i > 0 ? '<span class="crumb-sep">›</span>' : ''}<span class="crumb${cur ? ' current' : ''}" data-idx="${ri}">${e.label}</span>`;
  }).join('');
  EL.breadcrumbs.querySelectorAll('.crumb:not(.current)').forEach(el =>
    el.addEventListener('click', () => goTo(+el.dataset.idx))
  );
}

async function goTo(idx) {
  if (idx < 0 || idx >= navHistory.length) return;
  historyIdx = idx; navigating = true;
  await replayEntry(navHistory[idx]);
  navigating = false; updateNavUI();
}

async function replayEntry(e) {
  if (e.type === 'browse') {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === e.tab));
    currentTab = e.tab; EL.searchInput.value = '';
    rememberActiveTab(e.tab);
    showBrowse(); await loadBrowse(e.tab, EL.browseContent, { onCardClick: loadPlayer });
  } else if (e.type === 'search') {
    EL.searchInput.value = e.query; showBrowse();
    await execSearch(e.query, currentTab, EL.browseContent, { onCardClick: loadPlayer });
  } else if (e.type === 'player') {
    showPlayer(); await execLoadPlayer(e.imdbId, e.mediaType);
  } else if (e.type === 'my') {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'my'));
    currentTab = 'my'; showMyTab();
    rememberActiveTab('my');
  }
}

EL.navBack.addEventListener('click', () => goTo(historyIdx - 1));
EL.navFwd.addEventListener('click',  () => goTo(historyIdx + 1));
document.addEventListener('keydown', e => {
  if ((e.altKey || e.metaKey) && e.key === 'ArrowLeft')  { e.preventDefault(); if (!EL.navBack.disabled) EL.navBack.click(); }
  if ((e.altKey || e.metaKey) && e.key === 'ArrowRight') { e.preventDefault(); if (!EL.navFwd.disabled)  EL.navFwd.click(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PANEL SWITCHING
// ─────────────────────────────────────────────────────────────────────────────

export let currentTab = 'trending';
const STARTUP_TABS = ['trending','movies','tv','my'];

function validTab(tab) { return STARTUP_TABS.includes(tab) ? tab : 'trending'; }
function tabLabel(tab) { return tab === 'my' ? 'MY ★' : tab[0].toUpperCase() + tab.slice(1); }
function rememberActiveTab(tab) {
  if (!stores.prefs.rememberLastTab) return;
  stores.prefs.lastActiveTab = validTab(tab);
  savePrefs();
}

export function showBrowse() {
  EL.browsePanel.classList.add('visible');
  EL.playerPanel.classList.remove('visible');
  EL.myPanel.classList.remove('visible');
}
export function showPlayer() {
  EL.browsePanel.classList.remove('visible');
  EL.playerPanel.classList.add('visible');
  EL.myPanel.classList.remove('visible');
}
export function showMyTab() {
  EL.browsePanel.classList.remove('visible');
  EL.playerPanel.classList.remove('visible');
  EL.myPanel.classList.add('visible');
}
export function hideMyTab() { EL.myPanel.classList.remove('visible'); }

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────────────────

let searchTimer = null;

async function doSearch(query) {
  if (!query.trim()) {
    pushHistory({ type: 'browse', tab: currentTab, label: currentTab[0].toUpperCase() + currentTab.slice(1) });
    showBrowse();
    await loadBrowse(currentTab, EL.browseContent, { onCardClick: loadPlayer });
    return;
  }
  pushHistory({ type: 'search', query, label: `🔍 "${query}"` });
  showBrowse();
  await execSearch(query, currentTab, EL.browseContent, { onCardClick: loadPlayer });
}

EL.searchInput.addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(e.target.value), 400);
});

// ─────────────────────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const t = tab.dataset.tab;
    if (t === 'my') {
      currentTab = 'my';
      rememberActiveTab(t);
      EL.searchInput.value = '';
      showMyTab();
      pushHistory({ type: 'my', label: 'MY ★' });
      document.querySelector('.my-tab.active')?.click();
      return;
    }
    currentTab = t;
    rememberActiveTab(t);
    EL.searchInput.value = '';
    hideMyTab();
    pushHistory({ type: 'browse', tab: t, label: t[0].toUpperCase() + t.slice(1) });
    showBrowse();
    loadBrowse(t, EL.browseContent, { onCardClick: loadPlayer });
  });
});

// TT direct play
document.getElementById('ttBtn').addEventListener('click', () => {
  const tt = EL.ttInput.value.trim(); if (!tt) return;
  loadPlayer(tt.startsWith('tt') ? tt : 'tt' + tt, 'movie');
});
EL.ttInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('ttBtn').click(); });

// ─────────────────────────────────────────────────────────────────────────────
// RELOAD STORES (called by file/github sync after import)
// ─────────────────────────────────────────────────────────────────────────────

window.__FF_reloadStores = function() {
  Object.assign(stores, {
    prefs:    StorageManager.load('ff_prefs'),
    watchlist:StorageManager.load('ff_watchlist'),
    snippets: StorageManager.load('ff_snippets'),
    meta:     StorageManager.load('ff_meta'),
    library:  StorageManager.load('ff_library'),
    userdata: StorageManager.load('ff_userdata'),
  });
  setApiKeys(stores.prefs.omdbKey, stores.prefs.tmdbKey);
  setMetaCache(stores.meta);
  setLibrary(stores.library);
  renderWL();
  syncSettingsUI();
  loadBrowse(currentTab, EL.browseContent, { onCardClick: loadPlayer });
  syncKeyUI();
  if (currentTab === 'my') document.querySelector('.my-tab.active')?.click();
};

// ─────────────────────────────────────────────────────────────────────────────
// KEY UI
// ─────────────────────────────────────────────────────────────────────────────

export function syncKeyUI() {
  const k = stores.prefs.omdbKey;
  if (k && k !== 'trilogy') {
    const inp = document.getElementById('keyInput');
    if (inp) inp.value = k;
    setKeyDot('ok');
    setKeyStatus('✓ Key active', 'var(--green)');
  } else {
    setKeyDot('none');
    setKeyStatus('Using default key — get your own free key at omdbapi.com', 'var(--muted)');
  }
}

export function setKeyDot(s) {
  EL.keyDot.style.background = s === 'ok' ? '#4caf50' : s === 'err' ? '#e63946' : '#666';
}
export function setKeyStatus(msg, color = 'var(--muted)') {
  const el = document.getElementById('keyStatus');
  if (el) { el.textContent = msg; el.style.color = color; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GITHUB AUTO-SYNC INTERCEPT
// ─────────────────────────────────────────────────────────────────────────────

// Wrap StorageManager.save to also trigger a debounced GitHub push
const _origSM = StorageManager.save.bind(StorageManager);
StorageManager.save = function(key, data) {
  _origSM(key, data);
  if (stores.prefs.githubAutoSync) schedulePush(3000);
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────

async function boot() {
  // 1. Wire API keys from prefs
  setApiKeys(stores.prefs.omdbKey || 'trilogy', stores.prefs.tmdbKey || '');
  setMetaCache(stores.meta);
  setLibrary(stores.library);

  // 2. Init Web Worker
  initWorker();

  // 3. Wire grid callbacks
  registerGridCallbacks({
    isFav, isQueued, toggleFav, addToQueue, removeFromQueue,
    isWatched, toggleWatched: toggleMovieWatched,
    getWatchlist: () => stores.watchlist,
  });

  // 3. Init modules
  initPlayer({ EL, stores, pushHistory, showPlayer, showBrowse, loadBrowse, loadPlayer: null, fetchFull, setContinueWatching, getContinueWatching, isMovieWatched, isEpisodeWatched, toggleMovieWatched, toggleEpisodeWatched, updateAddBtn, saveWL, saveUserdata });
  initUserdata({ stores, saveUserdata, saveWL, loadPlayer: null });
  initWatchlist({ stores, saveWL, EL, markMovieWatched, isMovieWatched, getWatchedEpisodeCount });
  initSettings({ stores, savePrefs, saveLibraryStore, saveMeta, saveSnippets, saveUserdata, EL, FileStorageAdapter, StorageManager, syncKeyUI, setKeyDot, setKeyStatus, loadBrowse, EL_browseContent: EL.browseContent, currentTabGetter: () => currentTab });

  // Circular: give player/userdata the loadPlayer fn after it's defined
  const { loadPlayer: _lp } = await import('./player.js');
  initUserdata({ stores, saveUserdata, saveWL, loadPlayer: _lp });

  // 4. Init GitHub if configured
  if (stores.prefs.githubToken && stores.prefs.githubRepo) {
    configureGitHub(stores.prefs.githubToken, stores.prefs.githubRepo, stores.prefs.githubFile);
    onGithubStatusChange(() => updateFileSyncUI());
    // Pull on load (non-blocking)
    githubPull().then(result => {
      if (result.ok && result.action === 'pulled') window.__FF_reloadStores();
    });
  }

  // 5. Restore file handle from last session
  FileStorageAdapter.onStatusChange(() => updateFileSyncUI());
  FileStorageAdapter.tryRestoreFromIDB().then(() => updateFileSyncUI());

  // 6. Show recovery modal if any load errors
  if (StorageManager.errors().length > 0) {
    const errs = StorageManager.errors();
    document.getElementById('recoveryBody').textContent =
      errs.length + ' storage key(s) failed to load and were reset to defaults.';
    document.getElementById('recoveryDetail').textContent =
      errs.map(e => `${e.key}: ${e.error}${e.raw ? '\nRaw: ' + e.raw : ''}`).join('\n\n');
    document.getElementById('recoveryOverlay').classList.add('open');
  }

  // 7. Init FreeFlow public API
  initFreeFlowAPI({ stores, saveLibraryStore, saveUserdata, saveWL, StorageManager, loadBrowse, currentTabGetter: () => currentTab, EL_browseContent: EL.browseContent });

  // 8. Sync UI
  syncKeyUI();
  syncSettingsUI();
  renderWL();

  // 9. Register service worker (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('[SW] register failed:', e));
  }

  // 10. Launch
  const startupTab = validTab(stores.prefs.rememberLastTab ? stores.prefs.lastActiveTab : stores.prefs.defaultTab);
  currentTab = startupTab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === startupTab));
  if (startupTab === 'my') {
    pushHistory({ type: 'my', label: tabLabel(startupTab) });
    showMyTab();
    renderMyTab();
  } else {
    pushHistory({ type: 'browse', tab: startupTab, label: tabLabel(startupTab) });
    showBrowse();
    loadBrowse(startupTab, EL.browseContent, { onCardClick: loadPlayer });
  }
}

boot();
