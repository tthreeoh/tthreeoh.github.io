// ═══════════════════════════════════════════════════════════════════════════
// worker.js — Web Worker: background OMDB prefetch
// Runs in a separate thread. Receives { id, type, ids, omdbKey } messages.
// Posts back { id, results } or { id, error }.
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('message', async e => {
  const { id, type, ids, omdbKey } = e.data;

  if (type === 'prefetch') {
    try {
      const BATCH = 10; // parallel requests per batch
      const results = [];

      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const fetched = await Promise.all(
          batch.map(imdbId =>
            fetch(`https://www.omdbapi.com/?apikey=${omdbKey}&i=${imdbId}`)
              .then(r => r.json())
              .catch(() => ({ Response: 'False' }))
          )
        );
        results.push(...fetched.filter(r => r.Response === 'True'));
      }

      self.postMessage({ id, results });
    } catch (err) {
      self.postMessage({ id, error: err.message });
    }
  }
});
