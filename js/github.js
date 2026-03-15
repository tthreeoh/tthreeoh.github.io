// ═══════════════════════════════════════════════════════════════════════════
// github.js — GitHub API sync + conflict diff viewer
//
// Uses the GitHub Contents API to read/write a single JSON file in a
// private repo as cloud storage. No server needed.
//
// Sync strategy: auto-push on every save (debounced), auto-pull on load.
// Conflicts (local and remote both changed since last sync) show a
// side-by-side field-level diff viewer.
// ═══════════════════════════════════════════════════════════════════════════

import { StorageManager } from './storage.js';

const GITHUB_API = 'https://api.github.com';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let _token     = '';
let _repo      = '';   // "owner/repo"
let _file      = 'freeflow-data.json';
let _sha       = null; // current file SHA (required for updates)
let _lastSync  = null; // ISO string
let _status    = 'disconnected'; // 'disconnected'|'synced'|'syncing'|'conflict'|'error'
let _onChange  = () => {};
let _saveTimer = null;

// ─────────────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────────────

export function configure(token, repo, file = 'freeflow-data.json') {
  _token = token;
  _repo  = repo;
  _file  = file;
}

export function isConfigured() {
  return !!(  _token && _repo);
}

function _headers() {
  return {
    'Authorization': `Bearer ${_token}`,
    'Accept':        'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':  'application/json',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE API CALLS
// ─────────────────────────────────────────────────────────────────────────────

async function _getFile() {
  const r = await fetch(`${GITHUB_API}/repos/${_repo}/contents/${_file}`, {
    headers: _headers(),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET failed: ${r.status} ${r.statusText}`);
  const data = await r.json();
  return {
    sha:     data.sha,
    content: atob(data.content.replace(/\n/g, '')),
  };
}

async function _putFile(content, sha, message) {
  const body = {
    message: message || `FreeFlow sync ${new Date().toISOString()}`,
    content: btoa(unescape(encodeURIComponent(content))), // UTF-8 safe base64
  };
  if (sha) body.sha = sha;

  const r = await fetch(`${GITHUB_API}/repos/${_repo}/contents/${_file}`, {
    method:  'PUT',
    headers: _headers(),
    body:    JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub PUT failed: ${r.status} ${r.statusText}`);
  const data = await r.json();
  return data.content.sha;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function pull() {
  if (!isConfigured()) return { ok: false, reason: 'not configured' };
  _setStatus('syncing');
  try {
    const remote = await _getFile();
    if (!remote) {
      // File doesn't exist yet — push local state
      return push();
    }
    _sha = remote.sha;

    const remoteData = JSON.parse(remote.content);
    if (remoteData._schema !== 'freeflow-backup') {
      throw new Error('Remote file is not a valid FreeFlow backup');
    }

    // Check for conflict: compare _exportedAt timestamps
    const localExport  = JSON.parse(StorageManager.exportAll());
    const remoteTime   = new Date(remoteData._exportedAt).getTime();
    const localTime    = _lastSync ? new Date(_lastSync).getTime() : 0;

    // If remote is newer than our last sync → pull (no conflict)
    // If both changed since last sync → conflict
    const remoteNewer  = remoteTime > localTime;
    const localChanged = localTime > 0 && new Date(localExport._exportedAt).getTime() > localTime;

    if (remoteNewer && localChanged) {
      // CONFLICT
      _setStatus('conflict');
      return { ok: false, reason: 'conflict', local: localExport, remote: remoteData };
    }

    if (remoteNewer) {
      const results = StorageManager.importAll(remote.content);
      _lastSync = remoteData._exportedAt;
      _setStatus('synced');
      return { ok: true, action: 'pulled', results };
    }

    // Local is up to date or newer — push
    return push();
  } catch (err) {
    _setStatus('error');
    return { ok: false, reason: err.message };
  }
}

export async function push() {
  if (!isConfigured()) return { ok: false, reason: 'not configured' };
  _setStatus('syncing');
  try {
    const content = StorageManager.exportAll();
    _sha = await _putFile(content, _sha);
    _lastSync = JSON.parse(content)._exportedAt;
    _setStatus('synced');
    return { ok: true, action: 'pushed' };
  } catch (err) {
    _setStatus('error');
    return { ok: false, reason: err.message };
  }
}

// Auto-push debounced — called after every StorageManager.save
let _debounceTimer = null;
export function schedulePush(delayMs = 3000) {
  if (!isConfigured()) return;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => push(), delayMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

// Returns a structured diff between local and remote backup objects
// Result: { key: { field: { local, remote, chosen } } }
export function buildDiff(local, remote) {
  const diff = {};
  const allKeys = new Set([...Object.keys(local.keys || {}), ...Object.keys(remote.keys || {})]);

  for (const key of allKeys) {
    const localData  = local.keys?.[key]?.data;
    const remoteData = remote.keys?.[key]?.data;
    if (JSON.stringify(localData) === JSON.stringify(remoteData)) continue;

    diff[key] = {
      local:  localData,
      remote: remoteData,
      chosen: 'remote', // default: take remote
    };
  }
  return diff;
}

// Commit a resolved diff — applies chosen values to storage
export async function commitResolution(diff) {
  for (const [key, entry] of Object.entries(diff)) {
    const data = entry.chosen === 'local' ? entry.local : entry.remote;
    if (data !== undefined) StorageManager.save(key, data);
  }
  return push();
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────

function _setStatus(s) { _status = s; _onChange(); }

export function getStatus()        { return _status; }
export function getLastSync()      { return _lastSync; }
export function onStatusChange(fn) { _onChange = fn; }

export function statusSummary() {
  return {
    configured: isConfigured(),
    repo:       _repo,
    file:       _file,
    status:     _status,
    lastSync:   _lastSync,
    sha:        _sha,
  };
}
