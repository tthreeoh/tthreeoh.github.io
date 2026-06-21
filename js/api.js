// ═══════════════════════════════════════════════════════════════════════════
// api.js — TMDB (primary) + OMDB (fallback), metadata cache, Web Worker bridge
//
// Unified metaCache entry shape (stored in ff_meta):
// {
//   imdbID, Title, Year, Type, Rated, Runtime, Genre, Director, Actors,
//   Plot, Poster, imdbRating, Metascore, totalSeasons,  ← OMDB fields
//   tmdbId, backdropPath, trailerKey, cast, recommendations,
//   streamingProviders, tmdbRating, tagline,             ← TMDB fields
//   cachedAt, tmdbCachedAt
// }
// ═══════════════════════════════════════════════════════════════════════════

import { StorageManager } from './storage.js';

// Runtime references — set by main.js after boot
export let metaCache = {};
export function setMetaCache(c) { metaCache = c; }
export function saveMetaCache()  { StorageManager.save('ff_meta', metaCache); }

let _omdbKey = 'trilogy';
let _tmdbKey = '';
export function setApiKeys(omdb, tmdb) { _omdbKey = omdb; _tmdbKey = tmdb; }

// ─────────────────────────────────────────────────────────────────────────────
// OMDB
// ─────────────────────────────────────────────────────────────────────────────

async function _omdbFetch(params) {
  const u = new URL('https://www.omdbapi.com/');
  u.searchParams.set('apikey', _omdbKey);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return fetch(u).then(r => r.json());
}

function _absorbOmdb(entry, d) {
  // Write OMDB fields into a cache entry, never overwriting non-empty TMDB data
  const na = v => (!v || v === 'N/A') ? '' : v;
  entry.imdbID       = d.imdbID       || entry.imdbID;
  entry.Title        = d.Title        || entry.Title        || '';
  entry.Year         = na(d.Year)     || entry.Year         || '';
  entry.Type         = na(d.Type)     || entry.Type         || '';
  entry.Rated        = na(d.Rated)    || entry.Rated        || '';
  entry.Runtime      = na(d.Runtime)  || entry.Runtime      || '';
  entry.Genre        = na(d.Genre)    || entry.Genre        || '';
  entry.Director     = na(d.Director) || entry.Director     || '';
  entry.Actors       = na(d.Actors)   || entry.Actors       || '';
  entry.Plot         = na(d.Plot)     || entry.Plot         || '';
  entry.Poster       = na(d.Poster)   || entry.Poster       || '';
  entry.imdbRating   = na(d.imdbRating)|| entry.imdbRating  || '';
  entry.Metascore    = na(d.Metascore) || entry.Metascore   || '';
  entry.totalSeasons = na(d.totalSeasons)|| entry.totalSeasons|| '';
  entry.cachedAt     = new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB
// ─────────────────────────────────────────────────────────────────────────────

const TMDB_BASE   = 'https://api.themoviedb.org/3';
const TMDB_IMG    = 'https://image.tmdb.org/t/p';

export function tmdbPoster(path, size = 'w342')   { return path ? `${TMDB_IMG}/${size}${path}` : ''; }
export function tmdbBackdrop(path, size = 'w1280') { return path ? `${TMDB_IMG}/${size}${path}` : ''; }
export function tmdbProfile(path, size = 'w185')   { return path ? `${TMDB_IMG}/${size}${path}` : ''; }

async function _tmdbFetch(path, params = {}) {
  if (!_tmdbKey) return null;
  const u = new URL(TMDB_BASE + path);
  u.searchParams.set('api_key', _tmdbKey);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  try {
    const r = await fetch(u);
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function _tmdbFindByImdb(imdbId) {
  // /find/{imdb_id}?external_source=imdb_id returns movie_results + tv_results
  return _tmdbFetch(`/find/${imdbId}`, { external_source: 'imdb_id' });
}

async function _tmdbEnrich(imdbId, entry) {
  if (!_tmdbKey) return;

  const find = await _tmdbFindByImdb(imdbId);
  if (!find) return;

  const isTV    = (entry.Type === 'series') || (entry.totalSeasons);
  const results = isTV ? find.tv_results : find.movie_results;
  if (!results?.length) return;

  const result  = results[0];
  const tmdbId  = result.id;
  entry.tmdbId  = tmdbId;
  entry.tagline = result.tagline || '';

  // Override poster with higher quality TMDB version if OMDB poster is missing
  if (!entry.Poster && result.poster_path) {
    entry.Poster = tmdbPoster(result.poster_path, 'w342');
  }

  // Backdrop
  entry.backdropPath = result.backdrop_path || '';

  // TMDB rating
  entry.tmdbRating = result.vote_average ? result.vote_average.toFixed(1) : '';

  // Fetch full details for videos + credits + recommendations in one batch
  const detailPath = isTV ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const [details, videos, credits, recs, providers] = await Promise.all([
    _tmdbFetch(detailPath),
    _tmdbFetch(detailPath + '/videos'),
    _tmdbFetch(detailPath + '/credits'),
    _tmdbFetch(detailPath + '/recommendations', { page: 1 }),
    _tmdbFetch(detailPath + '/watch/providers'),
  ]);

  // Trailer (first YouTube trailer or teaser)
  if (videos?.results) {
    const trailer = videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer')
                 || videos.results.find(v => v.site === 'YouTube');
    entry.trailerKey = trailer?.key || '';
  }

  // Cast (top 10)
  if (credits?.cast) {
    entry.cast = credits.cast.slice(0, 10).map(p => ({
      name:        p.name,
      character:   p.character,
      profilePath: p.profile_path || '',
    }));
  }

  // Recommendations (IMDb IDs via /find — too expensive to resolve all,
  // so store TMDB IDs and resolve lazily)
  if (recs?.results) {
    entry.recommendations = recs.results.slice(0, 10).map(r => ({
      tmdbId: r.id,
      title:  r.title || r.name || '',
      poster: r.poster_path ? tmdbPoster(r.poster_path) : '',
    }));
  }

  // Streaming providers (US by default)
  if (providers?.results?.US) {
    const us = providers.results.US;
    const flat = [...(us.flatrate || []), ...(us.free || []), ...(us.ads || [])];
    entry.streamingProviders = flat.slice(0, 6).map(p => ({
      name: p.provider_name,
      logo: p.logo_path ? tmdbPoster(p.logo_path, 'w92') : '',
    }));
  }

  if (details) {
    entry.tagline = details.tagline || entry.tagline || '';
    if (!entry.Plot && details.overview) entry.Plot = details.overview;
    if (!entry.Runtime && details.runtime) entry.Runtime = details.runtime + ' min';
    if (!entry.Genre  && details.genres)   entry.Genre   = details.genres.map(g => g.name).join(', ');
  }

  entry.tmdbCachedAt = new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED CACHE ENTRY BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function _blankEntry(imdbId) {
  return {
    imdbID: imdbId, Title: '', Year: '', Type: '', Rated: '', Runtime: '',
    Genre: '', Director: '', Actors: '', Plot: '', Poster: '',
    imdbRating: '', Metascore: '', totalSeasons: '',
    tmdbId: null, backdropPath: '', trailerKey: '', cast: [],
    recommendations: [], streamingProviders: [], tmdbRating: '', tagline: '',
    cachedAt: new Date().toISOString(), tmdbCachedAt: null,
  };
}

export function cacheFromOmdb(d) {
  if (!d || d.Response !== 'True' || !d.imdbID) return;
  const entry = metaCache[d.imdbID] || _blankEntry(d.imdbID);
  _absorbOmdb(entry, d);
  metaCache[d.imdbID] = entry;
  saveMetaCache();
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC FETCH API
// ─────────────────────────────────────────────────────────────────────────────

// Browse grid: cache-first, no plot needed
export async function omdb(params) {
  if (params.i && !params.plot && metaCache[params.i]) {
    const c = metaCache[params.i];
    return { ...c, Response: 'True', Poster: c.Poster || 'N/A' };
  }
  const d = await _omdbFetch(params);
  if (d.Response === 'True') cacheFromOmdb(d);
  return d;
}

// Full fetch for player: includes plot + TMDB enrichment
export async function fetchFull(imdbId) {
  const cached = metaCache[imdbId];
  const needsOmdb = !cached || !cached.Plot;
  const needsTmdb = _tmdbKey && (!cached?.tmdbCachedAt);

  const entry = cached || _blankEntry(imdbId);

  if (needsOmdb) {
    const d = await _omdbFetch({ i: imdbId, plot: 'short' });
    if (d.Response === 'True') {
      _absorbOmdb(entry, d);
      metaCache[imdbId] = entry;
    }
  }

  if (needsTmdb) {
    await _tmdbEnrich(imdbId, entry);
    metaCache[imdbId] = entry;
    saveMetaCache();
  }

  if (!metaCache[imdbId]?.Title) return { Response: 'False' };
  return { ...metaCache[imdbId], Response: 'True', Poster: entry.Poster || 'N/A' };
}

// Batch fetch for grid (used by browse)
export async function fetchMany(ids) {
  const unique = [...new Set(ids)];
  const results = await Promise.all(unique.map(id => omdb({ i: id })));
  return results.filter(r => r.Response === 'True');
}

// OMDB search (no cache — search results are transient)
export async function omdbSearch(query, type) {
  const params = { s: query };
  if (type) params.type = type;
  return _omdbFetch(params);
}

const _seasonCache = new Map();

export async function fetchSeasonEpisodes(imdbId, season) {
  const s = Number(season);
  if (!imdbId || !Number.isInteger(s) || s < 1) return null;

  const key = imdbId + ':' + s;
  if (_seasonCache.has(key)) return _seasonCache.get(key);

  const data = await _omdbFetch({ i: imdbId, Season: s });
  if (data?.Response !== 'True' || !Array.isArray(data.Episodes)) return null;

  const episodes = data.Episodes
    .map(ep => ({
      number: Number(ep.Episode),
      title: ep.Title || '',
      released: ep.Released || '',
      imdbRating: ep.imdbRating || '',
    }))
    .filter(ep => Number.isInteger(ep.number) && ep.number > 0)
    .sort((a, b) => a.number - b.number);

  _seasonCache.set(key, episodes);
  return episodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEB WORKER BRIDGE — background prefetch for visible categories
// ─────────────────────────────────────────────────────────────────────────────

let _worker = null;
const _pendingCallbacks = new Map();
let _cbId = 0;

export function initWorker() {
  if (_worker || typeof Worker === 'undefined') return;
  try {
    _worker = new Worker('./js/worker.js', { type: 'module' });
    _worker.addEventListener('message', e => {
      const { id, results, error } = e.data;
      const cb = _pendingCallbacks.get(id);
      if (cb) { _pendingCallbacks.delete(id); cb(error ? null : results); }
    });
    _worker.addEventListener('error', e => console.warn('[Worker] error:', e));
  } catch (e) {
    console.warn('[Worker] failed to init:', e);
    _worker = null;
  }
}

// Prefetch a list of IMDb IDs in the worker (OMDB only — TMDB enrichment
// happens lazily when the user opens the player)
export function prefetchIds(ids) {
  if (!_worker) return;
  // Only fetch IDs not already in cache
  const missing = ids.filter(id => !metaCache[id]);
  if (!missing.length) return;
  const id = ++_cbId;
  _pendingCallbacks.set(id, results => {
    if (!results) return;
    results.forEach(d => {
      if (d.Response === 'True') cacheFromOmdb(d);
    });
  });
  _worker.postMessage({ id, type: 'prefetch', ids: missing, omdbKey: _omdbKey });
}

// Called by IntersectionObserver in library.js when a section becomes visible
export function prefetchCategory(ids) {
  prefetchIds(ids);
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB COLLECTIONS
// ─────────────────────────────────────────────────────────────────────────────

// Fetch a TMDB collection and resolve IMDb IDs for all parts
export async function fetchCollection(tmdbCollectionId) {
  if (!_tmdbKey) return null;
  const data = await _tmdbFetch(`/collection/${tmdbCollectionId}`);
  if (!data || !data.parts) return null;

  const parts = data.parts
    .filter(p => p.media_type !== 'tv')
    .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));

  // Resolve IMDb IDs via /movie/{id}/external_ids
  const resolved = await Promise.all(
    parts.map(async p => {
      const ext = await _tmdbFetch(`/movie/${p.id}/external_ids`);
      return ext?.imdb_id ? { imdbId: ext.imdb_id, tmdbId: p.id, title: p.title, poster: p.poster_path ? tmdbPoster(p.poster_path) : '' } : null;
    })
  );

  return {
    id:       data.id,
    name:     data.name,
    overview: data.overview || '',
    poster:   data.poster_path ? tmdbPoster(data.poster_path) : '',
    backdrop: data.backdrop_path ? tmdbBackdrop(data.backdrop_path) : '',
    parts:    resolved.filter(Boolean),
  };
}

// Search TMDB collections by name
export async function searchCollections(query) {
  if (!_tmdbKey) return [];
  const data = await _tmdbFetch('/search/collection', { query });
  if (!data?.results) return [];
  return data.results.slice(0, 8).map(c => ({
    id:     c.id,
    name:   c.name,
    poster: c.poster_path ? tmdbPoster(c.poster_path) : '',
  }));
}
