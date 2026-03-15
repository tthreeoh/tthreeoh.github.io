// ═══════════════════════════════════════════════════════════════════════════
// library.js — Content library, browse, search, renderGrid
// ═══════════════════════════════════════════════════════════════════════════

import { StorageManager } from './storage.js';
import { fetchMany, omdbSearch, prefetchCategory } from './api.js';

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT LIBRARY
// ─────────────────────────────────────────────────────────────────────────────

export function DEFAULT_LIBRARY() {
  return {
    trending: [
      'tt9362722','tt1375666','tt0816692','tt0468569','tt0111161','tt0137523','tt0120737','tt0110912',
      'tt0944947','tt5491994','tt0903747','tt2861424','tt4574334','tt0386676','tt1520211','tt6751668',
      'tt1853728','tt4154796','tt2395427','tt3501632','tt4154756','tt3480822','tt6045800','tt7286456',
      'tt1856101','tt0499549','tt1270797','tt0993846',
    ],
    movies: {
      'All-Time Greatest':  ['tt0111161','tt0068646','tt0071562','tt0468569','tt0050083','tt0108052','tt0167260','tt0110912','tt0120737','tt0060196','tt0137523','tt1375666','tt0109830','tt0816692','tt0133093','tt0099685','tt0073486','tt0076759','tt0080684','tt0082971'],
      'Action & Adventure': ['tt4154796','tt2395427','tt3501632','tt4154756','tt0499549','tt1745960','tt3896198','tt0468569','tt0082971','tt0119217','tt2527336','tt0258463','tt0172495','tt0816692','tt0209144','tt2380307','tt3315342','tt0103064','tt0317248','tt1570827'],
      'Sci-Fi & Fantasy':   ['tt0076759','tt0080684','tt0086190','tt0133093','tt0816692','tt1375666','tt0109830','tt0083658','tt0910970','tt0407304','tt0395169','tt0470752','tt1483013','tt2543164','tt2250912','tt1856101','tt3748528','tt0414993','tt0120382','tt1160419'],
      'Drama & Awards':     ['tt0111161','tt0068646','tt0108052','tt0050083','tt0073486','tt0099685','tt0167260','tt1853728','tt0405094','tt0361748','tt1305806','tt0993846','tt0477347','tt0119488','tt0266543','tt0887912','tt0120689','tt4116284','tt1832382','tt2278388'],
      'Comedy':             ['tt0137523','tt0109830','tt2527338','tt1099212','tt0118715','tt0107048','tt0107290','tt0910936','tt1631867','tt0368226','tt0361862','tt2674426','tt0944835','tt1270798','tt0116282','tt1386703','tt0822832','tt4481514','tt3748528','tt0482571'],
      'Horror & Thriller':  ['tt0081505','tt0073195','tt0114369','tt1179891','tt6751668','tt7286456','tt0167404','tt1745960','tt0910936','tt2380307','tt0387564','tt1877832','tt0093058','tt0043631','tt0119488','tt0181875','tt0120586','tt2802850','tt2119532','tt5073620'],
      'Romance':            ['tt0109830','tt0758758','tt0268978','tt0295297','tt0245429','tt0338013','tt0112462','tt0120338','tt0381681','tt0266543','tt0120905','tt0435761','tt1951265','tt0454921','tt1727776','tt0120689','tt1020536','tt2562232','tt4425200','tt0094675'],
      'Animation':          ['tt0910970','tt0266543','tt0245429','tt0435761','tt0317219','tt0120363','tt0119217','tt1790809','tt0892769','tt2096673','tt2294629','tt0382932','tt5013056','tt4048272','tt2709768','tt4649466','tt0325980','tt3606756','tt6105098','tt2948356'],
      'Crime & Heist':      ['tt0068646','tt0071562','tt0110912','tt0099685','tt0209144','tt0482571','tt0172495','tt0986264','tt0467406','tt0361862','tt2267998','tt0395169','tt0317705','tt0163025','tt0780504','tt1305806','tt1800241','tt1227926','tt0361748','tt0758758'],
      'War & History':      ['tt0108052','tt0060196','tt0266697','tt0364569','tt0361748','tt1853728','tt0119643','tt0338013','tt0116231','tt1418815','tt0405094','tt0318462','tt2179136','tt2802850','tt1535109','tt0172495','tt2024544','tt3011894','tt2737304','tt0758573'],
      'Classic Cinema':     ['tt0050083','tt0073486','tt0041959','tt0033467','tt0047396','tt0043014','tt0056592','tt0047478','tt0051201','tt0042876','tt0052077','tt0054215','tt0034583','tt0031381','tt0027977','tt0053125','tt0064116','tt0056172','tt0058946','tt0066206'],
      'Documentary':        ['tt1950186','tt1528133','tt1907360','tt2433392','tt0094964','tt4179452','tt2872718','tt2543472','tt0097523','tt1598642','tt3521810','tt0405159','tt6769208','tt4901364','tt2402927','tt0283877','tt3110958','tt1016247','tt7125860','tt5222768'],
    },
    tv: {
      'Essential TV':        ['tt0944947','tt0903747','tt5491994','tt2861424','tt4574334','tt0386676','tt1520211','tt0804484','tt3032476','tt2306299','tt6468322','tt7366338','tt1877514','tt0460649','tt0108778'],
      'Drama':               ['tt0944947','tt0903747','tt2861424','tt6468322','tt7366338','tt1877514','tt0804484','tt0475784','tt1266020','tt2356777','tt0455275','tt1520211','tt4574334','tt2788316','tt7767422','tt4016454','tt5753856','tt0285403','tt0141842','tt3107288'],
      'Comedy':              ['tt0386676','tt0460649','tt0108778','tt3032476','tt0098904','tt1733785','tt2306299','tt0367279','tt0077975','tt0096697','tt2575988','tt0072562','tt2442560','tt5753856','tt0115167','tt0052048','tt0185906','tt0290978','tt4574334','tt3107288'],
      'Crime & Mystery':     ['tt2802850','tt3032476','tt2261391','tt3006802','tt2193021','tt1475582','tt2707408','tt3086114','tt5753856','tt0118421','tt0773262','tt0412142','tt1119644','tt2661044','tt4532368','tt0407362','tt1632701','tt4158110','tt5788792','tt3510070'],
      'Sci-Fi & Fantasy':    ['tt5491994','tt0141842','tt4574334','tt6468322','tt0436992','tt4158110','tt7767422','tt1196946','tt0898266','tt1520211','tt5421602','tt3322314','tt0773262','tt1831804','tt4786824','tt1266020','tt2357547','tt2707408','tt0475784','tt0115226'],
      'Thriller & Suspense': ['tt7366338','tt1877514','tt0804484','tt2356777','tt4016454','tt0475784','tt2788316','tt2661044','tt1454029','tt7587890','tt6048596','tt2210044','tt5925154','tt5155780','tt0285403','tt5040012','tt2193021','tt3343028','tt3717490','tt1219024'],
      'Anime':               ['tt0988824','tt0409591','tt2560140','tt1266020','tt2394629','tt0434409','tt1515189','tt0417299','tt0354058','tt0161952','tt0388629','tt0291358','tt1407836','tt1618448','tt0214341','tt2560752','tt3006802','tt0078588','tt2098220','tt1355642'],
      'Reality & Documentary':['tt1831801','tt4955642','tt1798819','tt2741602','tt8819118','tt3659388','tt4786824','tt1586680','tt4768902','tt5788792','tt1477834','tt5714970','tt7816918','tt0423238','tt3749900','tt1723816','tt5779842','tt0115168','tt3006802','tt6800218'],
      'Kids & Family':       ['tt0096697','tt0052048','tt0074028','tt0078987','tt0367279','tt0898266','tt0112230','tt0472027','tt1262464','tt0285463','tt4477976','tt0148713','tt3398228','tt0121955','tt1316669','tt0381798','tt0083443','tt0362270','tt0115267','tt2543312'],
      'Limited Series':      ['tt0141842','tt1475582','tt7587890','tt2356777','tt1219024','tt7016936','tt4574334','tt6468322','tt2788316','tt4016454','tt6048596','tt7766378','tt5925154','tt8177370','tt3343028','tt7532826','tt8282930','tt1831801','tt4786824','tt7442562'],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY STATE
// ─────────────────────────────────────────────────────────────────────────────

export let LIBRARY = DEFAULT_LIBRARY();
export function setLibrary(lib) { LIBRARY = lib; }
export function saveLibrary()   { StorageManager.save('ff_library', LIBRARY); }

// ─────────────────────────────────────────────────────────────────────────────
// RENDER GRID
// ─────────────────────────────────────────────────────────────────────────────

// Callbacks injected by userdata.js so library.js stays decoupled
let _isFav      = () => false;
let _isQueued   = () => false;
let _toggleFav  = () => {};
let _addToQueue = () => {};
let _rmQueue    = () => {};
let _getWL      = () => [];

export function registerGridCallbacks(cbs) {
  _isFav      = cbs.isFav      || _isFav;
  _isQueued   = cbs.isQueued   || _isQueued;
  _toggleFav  = cbs.toggleFav  || _toggleFav;
  _addToQueue = cbs.addToQueue || _addToQueue;
  _rmQueue    = cbs.removeFromQueue || _rmQueue;
  _getWL      = cbs.getWatchlist    || _getWL;
}

export function renderGrid(items, container, { onCardClick } = {}) {
  if (!items.length) {
    container.innerHTML = '<div class="loading">No results found.</div>';
    return;
  }

  const watchlist = _getWL();

  container.innerHTML = items.map(m => {
    const poster   = m.Poster && m.Poster !== 'N/A'
      ? `<img src="${m.Poster}" alt="${m.Title}" loading="lazy">`
      : `<div class="no-poster">No Image</div>`;
    const isTV     = m.Type === 'series';
    const inList   = watchlist.some(w => w.imdbId === m.imdbID);
    const isWatched= watchlist.find(w => w.imdbId === m.imdbID)?.watchedAt;
    const fav      = _isFav(m.imdbID);
    const queued   = _isQueued(m.imdbID);

    return `
      <div class="card${isWatched ? ' is-watched' : ''}"
           data-imdb="${m.imdbID}"
           data-type="${m.Type || 'movie'}"
           data-title="${(m.Title || '').replace(/"/g, '&quot;')}"
           data-year="${m.Year || ''}"
           data-poster="${m.Poster !== 'N/A' ? m.Poster : ''}"
           data-rating="${m.imdbRating || ''}">
        ${isTV ? '<span class="card-type-badge tv">TV</span>' : ''}
        ${poster}
        <button class="card-fav${fav ? ' active' : ''}" data-imdb="${m.imdbID}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">★</button>
        <span class="card-watched-badge">✓ watched</span>
        <div class="card-overlay">
          <button class="card-action${inList ? ' in-list' : ''} ca-list">${inList ? '✓ listed' : '+ list'}</button>
          <button class="card-action${isWatched ? ' watched' : ''} ca-watched">${isWatched ? '✓ watched' : '👁 watched'}</button>
          <button class="card-action${queued ? ' in-list' : ''} ca-queue">${queued ? '✓ queued' : '+ queue'}</button>
        </div>
        <div class="card-info">
          <div class="card-title">${m.Title}</div>
          <div class="card-meta">${m.Year || ''}</div>
        </div>
      </div>`;
  }).join('');

  // Wire events
  container.querySelectorAll('.card').forEach(c => {
    const imdbId = c.dataset.imdb;
    const type   = c.dataset.type;

    c.addEventListener('click', e => {
      if (e.target.closest('.card-action') || e.target.closest('.card-fav')) return;
      if (onCardClick) onCardClick(imdbId, type);
    });

    c.querySelector('.card-fav').addEventListener('click', e => {
      e.stopPropagation();
      _toggleFav(imdbId);
      c.querySelector('.card-fav').classList.toggle('active', _isFav(imdbId));
    });

    c.querySelector('.ca-list').addEventListener('click', e => {
      e.stopPropagation();
      const btn = c.querySelector('.ca-list');
      const wl  = _getWL();
      if (wl.some(w => w.imdbId === imdbId)) {
        // Remove — signal via custom event
        c.dispatchEvent(new CustomEvent('wl:remove', { bubbles: true, detail: { imdbId } }));
        btn.textContent = '+ list'; btn.classList.remove('in-list');
      } else {
        c.dispatchEvent(new CustomEvent('wl:add', { bubbles: true, detail: {
          imdbId, title: c.dataset.title, year: c.dataset.year,
          type: c.dataset.type, poster: c.dataset.poster, rating: c.dataset.rating,
        }}));
        btn.textContent = '✓ listed'; btn.classList.add('in-list');
      }
    });

    c.querySelector('.ca-watched').addEventListener('click', e => {
      e.stopPropagation();
      c.dispatchEvent(new CustomEvent('wl:toggle-watched', { bubbles: true, detail: {
        imdbId, title: c.dataset.title, year: c.dataset.year,
        type: c.dataset.type, poster: c.dataset.poster, rating: c.dataset.rating,
      }}));
    });

    c.querySelector('.ca-queue').addEventListener('click', e => {
      e.stopPropagation();
      const btn = c.querySelector('.ca-queue');
      if (_isQueued(imdbId)) {
        _rmQueue(imdbId);
        btn.textContent = '+ queue'; btn.classList.remove('in-list');
      } else {
        _addToQueue(imdbId, null);
        btn.textContent = '✓ queued'; btn.classList.add('in-list');
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSE
// ─────────────────────────────────────────────────────────────────────────────

const _sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const ids = JSON.parse(entry.target.dataset.prefetchIds || '[]');
    if (ids.length) prefetchCategory(ids);
    _sectionObserver.unobserve(entry.target);
  });
}, { rootMargin: '200px' });

export async function loadBrowse(tab, browseContent, { onCardClick } = {}) {
  if (tab === 'trending') {
    browseContent.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
    const items = await fetchMany(LIBRARY.trending);
    browseContent.innerHTML = `
      <div class="section-title">Trending Now <span class="section-count">${items.length} titles</span></div>
      <div class="grid" id="trendGrid"></div>`;
    renderGrid(items, document.getElementById('trendGrid'), { onCardClick });
    return;
  }

  const lib  = tab === 'movies' ? LIBRARY.movies : LIBRARY.tv;
  const cats = Object.keys(lib);

  browseContent.innerHTML = `
    <div class="cat-bar" id="catBar">
      <button class="cat-btn active" data-cat="all">All</button>
      ${cats.map(c => `<button class="cat-btn" data-cat="${c}">${c}</button>`).join('')}
    </div>
    <div id="sw"></div>`;

  const sw = document.getElementById('sw');

  document.querySelectorAll('.cat-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.cat-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const cat = b.dataset.cat;
    document.querySelectorAll('.section-block').forEach(s => {
      s.style.display = (cat === 'all' || s.dataset.cat === cat) ? '' : 'none';
    });
  }));

  for (const cat of cats) {
    const ids = lib[cat] || [];
    const sid = 'g' + cat.replace(/\W/g, '_');
    const block = document.createElement('div');
    block.className      = 'section-block';
    block.dataset.cat    = cat;
    block.dataset.prefetchIds = JSON.stringify(ids); // picked up by IntersectionObserver
    block.innerHTML = `
      <div class="section-title">${cat} <span class="section-count" id="c${sid}"></span></div>
      <div class="grid" id="${sid}">
        <div class="loading" style="padding:20px;grid-column:1/-1"><div class="spinner"></div>Loading...</div>
      </div>`;
    sw.appendChild(block);

    // Observe for prefetch trigger
    _sectionObserver.observe(block);

    // Load grid (async, parallel)
    (async () => {
      const items = await fetchMany(ids);
      const g = document.getElementById(sid);
      const c = document.getElementById('c' + sid);
      if (!g) return;
      if (c) c.textContent = items.length + ' titles';
      renderGrid(items, g, { onCardClick });
    })();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────────────────

export async function execSearch(query, currentTab, browseContent, { onCardClick } = {}) {
  browseContent.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';
  const type = currentTab === 'tv' ? 'series' : currentTab === 'movies' ? 'movie' : '';
  const data = await omdbSearch(query, type);
  if (data.Response === 'True') {
    browseContent.innerHTML = `
      <div class="section-title">Results for "${query}" <span class="section-count">${data.Search.length} found</span></div>
      <div class="grid" id="srchGrid"></div>`;
    renderGrid(data.Search, document.getElementById('srchGrid'), { onCardClick });
  } else {
    browseContent.innerHTML = `<div class="loading">No results for "${query}"</div>`;
  }
}
