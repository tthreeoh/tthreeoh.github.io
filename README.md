# FreeFlow — Module Reference

## File Structure

```
freeflow/
├── index.html          App shell — HTML + CSS only, no inline JS logic
├── manifest.json       PWA manifest (install to desktop/mobile)
├── sw.js               Service Worker (offline shell + image caching)
└── js/
    ├── main.js         Boot sequence, nav history, panel switching, tab wiring
    ├── storage.js      StorageManager (versioned schemas + migrations)
    │                   FileStorageAdapter (File System Access API)
    ├── api.js          TMDB (primary) + OMDB (fallback), metadata cache,
    │                   Web Worker bridge (prefetchCategory)
    ├── worker.js       Web Worker — background OMDB prefetch (separate thread)
    ├── library.js      DEFAULT_LIBRARY, LIBRARY state, renderGrid,
    │                   loadBrowse, execSearch, IntersectionObserver prefetch
    ├── player.js       Player panel, episode bar, continue watching
    ├── userdata.js     Favorites, queue, watch history, groups (MY tab)
    ├── watchlist.js    Legacy watchlist drawer (still functional)
    ├── settings.js     Settings drawer — all panels + GitHub sync UI
    ├── github.js       GitHub Contents API sync + conflict diff viewer
    └── freeflow.js     window.FreeFlow public API
```

## Storage Keys

| Key             | Schema | Contents |
|-----------------|--------|----------|
| `ff_prefs`      | v1     | omdbKey, tmdbKey, mergeMode, github config |
| `ff_library`    | v1     | trending[], movies{}, tv{} |
| `ff_watchlist`  | v1     | Legacy watchlist array |
| `ff_meta`       | v2     | OMDB+TMDB unified metadata cache |
| `ff_snippets`   | v1     | Saved plugin snippets |
| `ff_userdata`   | v1     | Favorites, groups, queue, history, continueWatching |

All keys use envelope format: `{ _v, _key, _savedAt, data }`.
Migrations run automatically on load when stored version < schema version.

## Setup

### 1. Add to your repo

Copy all files maintaining the directory structure. Commit and push.

### 2. Enable GitHub Pages

Repo Settings → Pages → Source: `main` branch, `/ (root)`.

Your app will be live at `https://username.github.io/reponame/`.

### 3. API Keys (in Settings → General)

- **OMDB**: free key at https://omdbapi.com
- **TMDB**: free key at https://www.themoviedb.org/settings/api

### 4. GitHub Sync (optional)

In Settings → General → GitHub Sync:
- **Token**: GitHub Personal Access Token with `repo` scope
  (Settings → Developer settings → Personal access tokens → Fine-grained:
  Contents: read/write on your data repo)
- **Repo**: `username/repo-name`
- **File**: `freeflow-data.json` (default)

Enable "Auto-sync" to push on every change (3s debounce).

### 5. PWA Icons

Add `icons/icon-192.png` and `icons/icon-512.png` to enable full PWA install.
The app works without them but won't show a custom icon.

### 6. Local Development

ES modules require a server (not `file://`):
```bash
cd freeflow
python3 -m http.server 8080
# or
npx serve .
```
Then open http://localhost:8080

## Upgrading Storage Schemas

When you add a field to any store:

1. Bump `version` in `storage.js` for that schema
2. Add `migrations[newVersion] = (prev) => ({ ...prev, newField: defaultValue })`
3. Old data migrates automatically on next load — no manual intervention needed

Example — adding `tmdbKey` to `ff_prefs` (already done in v1):
```js
SCHEMAS['ff_prefs'] = {
  version: 2,  // was 1
  ...
  migrations: {
    1: d => ({ ...existing v1 migration... }),
    2: d => ({ ...d, newField: 'default' }),  // add this
  }
}
```

## FreeFlow Plugin API

Available at `window.FreeFlow` in the browser console or Plugin editor:

```js
// Library
FreeFlow.addCategory('movies', 'A24', ['tt1981115'])
FreeFlow.addIds('tv', 'Drama', ['tt5753856'])
FreeFlow.refresh()

// Favorites
FreeFlow.favorites.toggle('tt0468569')
FreeFlow.favorites.all()

// Queue
FreeFlow.queue.add('tt0111161')
FreeFlow.queue.watched('tt0111161')

// Groups
FreeFlow.groups.create('Horror', { color: '#e63946' })
FreeFlow.groups.add('g123', ['tt0081505', 'tt6751668'])
FreeFlow.groups.members('g123', true)  // recursive

// Continue watching
FreeFlow.continue.set('tt0944947', 3, 7)  // S3E7

// Storage
FreeFlow.storage.statusReport()
FreeFlow.storage.exportAll()

// GitHub
FreeFlow.github.push()
FreeFlow.github.pull()
FreeFlow.github.status()
```
