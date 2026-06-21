// ═══════════════════════════════════════════════════════════════════════════
// player.js — Player panel, episode bar, continue watching
// ═══════════════════════════════════════════════════════════════════════════

let _deps = {};
export function initPlayer(deps) { _deps = deps; }

const DEFAULT_EPISODE_COUNT = 20;
let _episodeSyncToken = 0;

export async function execLoadPlayer(imdbId, type) {
  const { EL, fetchFull, getContinueWatching, updateAddBtn } = _deps;

  EL.playerIframe.src = type === 'series'
    ? episodeUrl(imdbId, 1, 1)
    : `https://vidsrcme.ru/embed/movie?imdb=${imdbId}`;

  const d = await fetchFull(imdbId);
  if (d.Response !== 'True') return;

  _deps._currentMeta = d;
  if (updateAddBtn) updateAddBtn();

  EL.playerTitle.textContent = d.Title;
  EL.playerPoster.src         = d.Poster !== 'N/A' ? d.Poster : '';
  EL.playerPoster.style.display = d.Poster !== 'N/A' ? '' : 'none';
  EL.playerPlot.textContent   = d.Plot || '';

  const tags = [];
  if (d.Year)        tags.push({ t: d.Year });
  if (d.Rated && d.Rated !== 'N/A') tags.push({ t: d.Rated, r: true });
  if (d.Runtime && d.Runtime !== 'N/A') tags.push({ t: d.Runtime });
  if (d.Genre)       d.Genre.split(', ').forEach(g => tags.push({ t: g }));
  if (d.imdbRating && d.imdbRating !== 'N/A') tags.push({ t: '★ ' + d.imdbRating, r: true });
  if (d.tmdbRating)  tags.push({ t: 'TMDB ' + d.tmdbRating });
  EL.playerTags.innerHTML = tags.map(t => `<span class="ptag${t.r ? ' red' : ''}">${t.t}</span>`).join('');

  // Trailer button
  let trailerBtn = document.getElementById('playerTrailerBtn');
  if (d.trailerKey) {
    if (!trailerBtn) {
      trailerBtn = document.createElement('button');
      trailerBtn.id = 'playerTrailerBtn';
      trailerBtn.className = 'btn-ghost';
      document.querySelector('.player-actions').appendChild(trailerBtn);
    }
    trailerBtn.textContent = '▶ TRAILER';
    trailerBtn.onclick = () => {
      EL.playerIframe.src = `https://www.youtube.com/embed/${d.trailerKey}?autoplay=1`;
    };
    trailerBtn.style.display = '';
  } else if (trailerBtn) {
    trailerBtn.style.display = 'none';
  }

  // Episode bar
  if (type === 'series' && d.totalSeasons && +d.totalSeasons > 0) {
    updateMovieWatchedButton(false);
    const tot = +d.totalSeasons;
    EL.seasonSel.innerHTML  = Array.from({length: tot}, (_, i) => `<option value="${i+1}">Season ${i+1}</option>`).join('');
    renderEpisodeOptions(defaultEpisodes(), 1);
    // Restore continue-watching position
    const cont = getContinueWatching(imdbId);
    const startSeason = clampInt(cont?.s || 1, 1, tot);
    const startEpisode = clampInt(cont?.e || 1, 1, DEFAULT_EPISODE_COUNT);
    EL.seasonSel.value = startSeason;
    renderEpisodeOptions(defaultEpisodes(), startEpisode);
    EL.episodeBar.dataset.totalSeasons = String(tot);
    EL.episodeBar.dataset.imdb = imdbId;
    EL.episodeBar.classList.add('visible');
    playSelectedEpisode({ save: false });
    updateEpisodeWatchedButton();
    syncEpisodeOptions(startEpisode).then(selected => {
      if (selected !== startEpisode) playSelectedEpisode({ save: false });
      updateEpisodeWatchedButton();
    });
  } else {
    EL.episodeBar.classList.remove('visible');
    delete EL.episodeBar.dataset.imdb;
    delete EL.episodeBar.dataset.totalSeasons;
    delete EL.episodeBar.dataset.episodeSeason;
    delete EL.episodeBar.dataset.episodeCount;
    updateMovieWatchedButton(true);
  }

  // Cast strip
  renderCastStrip(d.cast || []);

  // Collection offer (non-blocking)
  checkCollectionOffer(imdbId).catch(() => {});
}

export async function loadPlayer(imdbId, type) {
  const { pushHistory, showPlayer, fetchFull } = _deps;
  // Peek title for breadcrumb
  const d = await fetchFull(imdbId);
  const label = d.Response === 'True' ? d.Title : imdbId;
  pushHistory({ type: 'player', imdbId, mediaType: type || d.Type || 'movie', label });
  showPlayer();
  await execLoadPlayer(imdbId, type || d.Type || 'movie');
}

function renderCastStrip(cast) {
  let strip = document.getElementById('castStrip');
  if (!cast.length) { if (strip) strip.style.display = 'none'; return; }
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'castStrip';
    strip.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding:8px 0;flex-shrink:0';
    document.querySelector('.player-details').appendChild(strip);
  }
  strip.style.display = '';
  strip.innerHTML = cast.map(p => {
    const img = p.profilePath
      ? `<img src="https://image.tmdb.org/t/p/w92${p.profilePath}" style="width:36px;height:54px;object-fit:cover;border-radius:2px;border:1px solid var(--border)" alt="">`
      : `<div style="width:36px;height:54px;background:var(--surface2);border:1px solid var(--border)"></div>`;
    return `<div style="flex-shrink:0;text-align:center;width:52px">
      ${img}
      <div style="font-size:8px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${p.name}">${p.name}</div>
    </div>`;
  }).join('');
}

function episodeUrl(imdb, season, episode) {
  return `https://vidsrc.me/embed/tv?imdb=${imdb}&season=${season}&episode=${episode}`;
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function defaultEpisodes(count = DEFAULT_EPISODE_COUNT) {
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, title: '' }));
}

async function loadSeasonEpisodes(imdb, season) {
  try {
    const { fetchSeasonEpisodes } = await import('./api.js');
    const episodes = await fetchSeasonEpisodes(imdb, season);
    if (episodes?.length) return episodes;
  } catch {}
  return defaultEpisodes();
}

function renderEpisodeOptions(episodes, preferredEpisode) {
  const { EL } = _deps;
  const list = episodes?.length ? episodes : defaultEpisodes();
  const maxEp = list[list.length - 1]?.number || DEFAULT_EPISODE_COUNT;
  const selected = clampInt(preferredEpisode || EL.episodeSel.value || 1, 1, maxEp);

  EL.episodeSel.innerHTML = list.map(ep => {
    const label = 'Episode ' + ep.number + (ep.title ? ' - ' + ep.title : '');
    return `<option value="${ep.number}">${escapeHtml(label)}</option>`;
  }).join('');
  EL.episodeSel.value = String(selected);
  EL.episodeBar.dataset.episodeCount = String(maxEp);
  EL.episodeBar.dataset.episodeSeason = String(EL.seasonSel.value || 1);
  updateEpisodeNavButtons();
  return selected;
}

async function syncEpisodeOptions(preferredEpisode) {
  const { EL } = _deps;
  const imdb = EL.episodeBar.dataset.imdb;
  const season = +EL.seasonSel.value || 1;
  if (!imdb) return +EL.episodeSel.value || 1;

  const token = ++_episodeSyncToken;
  updateEpisodeNavButtons(true);
  const episodes = await loadSeasonEpisodes(imdb, season);
  if (token !== _episodeSyncToken || EL.episodeBar.dataset.imdb !== imdb || +EL.seasonSel.value !== season) {
    return +EL.episodeSel.value || 1;
  }
  return renderEpisodeOptions(episodes, preferredEpisode);
}

function playSelectedEpisode({ save = true } = {}) {
  const { EL, setContinueWatching } = _deps;
  const imdb = EL.episodeBar.dataset.imdb;
  const s = +EL.seasonSel.value || 1;
  const e = +EL.episodeSel.value || 1;
  if (!imdb) return;
  EL.playerIframe.src = episodeUrl(imdb, s, e);
  if (save && setContinueWatching) setContinueWatching(imdb, s, e);
  updateEpisodeNavButtons();
  updateEpisodeWatchedButton();
}

function updateMovieWatchedButton(show = true) {
  const btn = document.getElementById('playerWatchedBtn');
  const meta = _deps._currentMeta;
  if (!btn) return;
  if (!show || !meta || meta.Type === 'series') {
    btn.style.display = 'none';
    return;
  }
  const watched = !!_deps.isMovieWatched?.(meta.imdbID);
  btn.style.display = '';
  btn.classList.toggle('active', watched);
  btn.textContent = watched ? '✓ WATCHED' : 'MARK WATCHED';
}

function updateEpisodeWatchedButton() {
  const { EL } = _deps;
  const btn = document.getElementById('epWatchedBtn');
  const imdb = EL?.episodeBar?.dataset.imdb;
  if (!btn) return;
  if (!imdb || !EL.episodeBar.classList.contains('visible')) {
    btn.style.display = 'none';
    return;
  }
  const s = +EL.seasonSel.value || 1;
  const e = +EL.episodeSel.value || 1;
  const watched = !!_deps.isEpisodeWatched?.(imdb, s, e);
  btn.style.display = '';
  btn.classList.toggle('active', watched);
  btn.textContent = watched ? '✓ EPISODE WATCHED' : 'MARK EPISODE WATCHED';
}

function updateEpisodeNavButtons(loading = false) {
  const { EL } = _deps;
  const prev = document.getElementById('prevEpBtn');
  const next = document.getElementById('nextEpBtn');
  if (!prev || !next || !EL?.episodeBar?.classList.contains('visible')) return;

  const season = +EL.seasonSel.value || 1;
  const episode = +EL.episodeSel.value || 1;
  const totalSeasons = +EL.episodeBar.dataset.totalSeasons || EL.seasonSel.options.length || 1;
  const episodeCount = +EL.episodeBar.dataset.episodeCount || EL.episodeSel.options.length || DEFAULT_EPISODE_COUNT;

  prev.disabled = loading || (season <= 1 && episode <= 1);
  next.disabled = loading || (season >= totalSeasons && episode >= episodeCount);
}

async function moveEpisode(delta) {
  const { EL } = _deps;
  const imdb = EL.episodeBar.dataset.imdb;
  if (!imdb) return;

  const totalSeasons = +EL.episodeBar.dataset.totalSeasons || EL.seasonSel.options.length || 1;
  let season = +EL.seasonSel.value || 1;
  let episode = await syncEpisodeOptions(+EL.episodeSel.value || 1);
  let episodeCount = +EL.episodeBar.dataset.episodeCount || EL.episodeSel.options.length || DEFAULT_EPISODE_COUNT;

  if (delta > 0) {
    if (episode < episodeCount) {
      episode += 1;
    } else if (season < totalSeasons) {
      season += 1;
      episode = 1;
      EL.seasonSel.value = String(season);
      await syncEpisodeOptions(episode);
    } else {
      updateEpisodeNavButtons();
      return;
    }
  } else {
    if (episode > 1) {
      episode -= 1;
    } else if (season > 1) {
      season -= 1;
      EL.seasonSel.value = String(season);
      episode = await syncEpisodeOptions(Number.MAX_SAFE_INTEGER);
    } else {
      updateEpisodeNavButtons();
      return;
    }
  }

  EL.episodeSel.value = String(episode);
  playSelectedEpisode();
}

// Episode play button
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('epPlayBtn')?.addEventListener('click', () => {
    playSelectedEpisode();
  });
  document.getElementById('prevEpBtn')?.addEventListener('click', () => moveEpisode(-1));
  document.getElementById('nextEpBtn')?.addEventListener('click', () => moveEpisode(1));
  document.getElementById('epWatchedBtn')?.addEventListener('click', () => {
    const { EL } = _deps;
    const imdb = EL.episodeBar.dataset.imdb;
    if (!imdb) return;
    _deps.toggleEpisodeWatched?.(imdb, +EL.seasonSel.value || 1, +EL.episodeSel.value || 1, _deps._currentMeta || {});
    updateEpisodeWatchedButton();
  });
  document.getElementById('playerWatchedBtn')?.addEventListener('click', () => {
    const meta = _deps._currentMeta;
    if (!meta?.imdbID) return;
    _deps.toggleMovieWatched?.(meta.imdbID, meta);
    updateMovieWatchedButton(true);
  });
  document.getElementById('seasonSel')?.addEventListener('change', () => syncEpisodeOptions(1).then(updateEpisodeWatchedButton));
  document.getElementById('episodeSel')?.addEventListener('change', () => { updateEpisodeNavButtons(); updateEpisodeWatchedButton(); });

  // Fullscreen
  document.getElementById('fullscreenBtn')?.addEventListener('click', () => {
    const { EL } = _deps;
    const r = EL.playerIframe.requestFullscreen || EL.playerIframe.webkitRequestFullscreen;
    if (r) r.call(EL.playerIframe);
  });

  // Back button
  document.getElementById('backBtn')?.addEventListener('click', () => {
    const { EL, showBrowse, loadBrowse, pushHistory } = _deps;
    const navBack = document.getElementById('navBack');
    if (!navBack?.disabled) { navBack.click(); return; }
    EL.playerIframe.src = '';
    EL.episodeBar.classList.remove('visible');
    const ct = _deps.currentTabGetter ? _deps.currentTabGetter() : 'trending';
    pushHistory({ type: 'browse', tab: ct, label: ct[0].toUpperCase() + ct.slice(1) });
    showBrowse();
    loadBrowse(ct, EL.browseContent, { onCardClick: loadPlayer });
  });
});

// ── Collection offer — called after execLoadPlayer enriches metadata ──
export async function checkCollectionOffer(imdbId) {
  const { metaCache } = await import('./api.js');
  const meta = metaCache[imdbId];
  if (!meta?.tmdbId) return;

  // TMDB enrichment puts belongs_to_collection in the details fetch
  // We need to fetch it directly if not already cached
  let colId   = meta.collectionId   || null;
  let colName = meta.collectionName || null;

  if (!colId) {
    const { _tmdbKey } = await import('./api.js').catch(() => ({}));
    // Try fetching from TMDB movie details
    try {
      const r = await fetch(`https://api.themoviedb.org/3/movie/${meta.tmdbId}?api_key=${_tmdbKey}`);
      if (r.ok) {
        const d = await r.json();
        if (d.belongs_to_collection) {
          colId   = d.belongs_to_collection.id;
          colName = d.belongs_to_collection.name;
          // Cache it
          meta.collectionId   = colId;
          meta.collectionName = colName;
          const { saveMetaCache } = await import('./api.js');
          saveMetaCache();
        }
      }
    } catch {}
  }

  if (colId) {
    const { offerCollection } = await import('./userdata.js');
    offerCollection(colId, colName);
  }
}
