/**
 * Configuration
 *
 * The TMDB API key is NOT stored client-side. Requests go through the Netlify
 * function at /api/tmdb/* which injects the key server-side from the
 * TMDB_API_KEY env var (set in Netlify dashboard → Site settings → Env vars).
 *
 * For local dev without `netlify dev`, set TMDB_LOCAL_KEY in localStorage and
 * the client will fall back to direct calls — convenient but the key would be
 * visible. Don't commit a real key.
 */
const CONFIG = {
    // Proxy endpoint (Netlify redirect → /.netlify/functions/tmdb)
    TMDB_PROXY: '/api/tmdb',
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',
    EMBED_BASE: 'https://vidsrc-embed.ru/embed',
    DEFAULT_LANG: 'en',
    POSTER_SIZE: 'w342',
    BACKDROP_SIZE: 'w1280',
    FEATURED_GENRES: [
        { id: 28,  name: 'Action' },
        { id: 35,  name: 'Comedy' },
        { id: 878, name: 'Sci-Fi' },
        { id: 27,  name: 'Horror' },
        { id: 18,  name: 'Drama' },
        { id: 16,  name: 'Animation' }
    ],
    ROW_LIMIT: 16,
    DEBOUNCE_MS: 300
};

function buildEmbedUrl(tmdbId, type = 'movie', season = null, episode = null, lang = CONFIG.DEFAULT_LANG) {
    if (type === 'tv' && season !== null && episode !== null) {
        return `${CONFIG.EMBED_BASE}/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}&ds_lang=${lang}`;
    }
    return `${CONFIG.EMBED_BASE}/${type}?tmdb=${tmdbId}&ds_lang=${lang}`;
}
