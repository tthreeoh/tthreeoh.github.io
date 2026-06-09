// ═══════════════════════════════════════════════════════════════════════════
// player.js — Player panel, episode bar, continue watching
// ═══════════════════════════════════════════════════════════════════════════

let _deps = {};
export function initPlayer(deps) { _deps = deps; }

export async function execLoadPlayer(imdbId, type) {
  const { EL, stores, fetchFull, setContinueWatching, getContinueWatching, updateAddBtn } = _deps;

  EL.playerIframe.src = type === 'series'
    ? `https://vidsrcme.ru/embed/tv?imdb=${imdbId}&season=1&episode=1`
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
    const tot = +d.totalSeasons;
    EL.seasonSel.innerHTML  = Array.from({length: tot}, (_, i) => `<option value="${i+1}">Season ${i+1}</option>`).join('');
    EL.episodeSel.innerHTML = Array.from({length: 20}, (_, i) => `<option value="${i+1}">Episode ${i+1}</option>`).join('');
    // Restore continue-watching position
    const cont = getContinueWatching(imdbId);
    if (cont) { EL.seasonSel.value = cont.s; EL.episodeSel.value = cont.e; }
    EL.episodeBar.classList.add('visible');
  } else {
    EL.episodeBar.classList.remove('visible');
  }
  EL.episodeBar.dataset.imdb = imdbId;

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

// Episode play button
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('epPlayBtn')?.addEventListener('click', () => {
    const { EL, setContinueWatching } = _deps;
    const imdb = EL.episodeBar.dataset.imdb;
    const s    = EL.seasonSel.value;
    const e    = EL.episodeSel.value;
    EL.playerIframe.src = `https://vidsrc.me/embed/tv?imdb=${imdb}&season=${s}&episode=${e}`;
    if (imdb && setContinueWatching) setContinueWatching(imdb, +s, +e);
  });

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
