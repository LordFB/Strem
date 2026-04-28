/**
 * TMDB proxy — keeps the API key out of the client bundle.
 * Client calls /api/tmdb/<path>?<params>; we forward to api.themoviedb.org
 * with the key injected from the TMDB_API_KEY env var.
 */
exports.handler = async (event) => {
    try {
        const apiKey = process.env.TMDB_API_KEY;
        if (!apiKey) {
            return json(500, { error: 'TMDB_API_KEY env var not configured on Netlify' });
        }

        if (event.httpMethod !== 'GET') {
            return json(405, { error: 'Method not allowed' });
        }

        // Path arrives as e.g. "/api/tmdb/movie/now_playing" or
        // "/.netlify/functions/tmdb/movie/now_playing".
        const raw = event.path || '';
        let tmdbPath = raw
            .replace(/^\/\.netlify\/functions\/tmdb/, '')
            .replace(/^\/api\/tmdb/, '');
        if (!tmdbPath.startsWith('/')) tmdbPath = '/' + tmdbPath;
        if (tmdbPath === '/') {
            return json(400, { error: 'Missing TMDB path', received: raw });
        }

        if (!/^\/(trending|movie|tv|discover|search|genre|configuration)(\/|$)/.test(tmdbPath)) {
            return json(403, { error: 'Path not allowed', path: tmdbPath });
        }

        const url = new URL('https://api.themoviedb.org/3' + tmdbPath);
        const params = event.queryStringParameters || {};
        Object.entries(params).forEach(([k, v]) => {
            if (k === 'api_key') return;
            if (v != null) url.searchParams.set(k, v);
        });
        url.searchParams.set('api_key', apiKey);

        // Use global fetch (Node 18+); fall back to node-fetch-style if missing.
        const fetchFn = typeof fetch === 'function' ? fetch : null;
        if (!fetchFn) {
            return json(500, {
                error: 'fetch is not available in this Node runtime',
                hint: 'Set NODE_VERSION=18 (or newer) in Netlify env vars'
            });
        }

        const res = await fetchFn(url.toString());
        const body = await res.text();
        return {
            statusCode: res.status,
            headers: {
                'Content-Type': res.headers.get('content-type') || 'application/json',
                'Cache-Control': 'public, max-age=300, s-maxage=600',
                'Access-Control-Allow-Origin': '*'
            },
            body
        };
    } catch (err) {
        console.error('tmdb proxy error', err);
        return json(500, { error: 'Proxy crashed', detail: String(err && err.stack || err) });
    }
};

function json(statusCode, obj) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj)
    };
}
