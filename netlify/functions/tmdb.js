/**
 * TMDB proxy — keeps the API key out of the client bundle.
 * Client calls /api/tmdb/<path>?<params>; we forward to api.themoviedb.org
 * with the key injected from the TMDB_API_KEY env var.
 */
exports.handler = async (event) => {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        return json(500, { error: 'TMDB_API_KEY env var not configured on Netlify' });
    }

    // Strip the function/redirect prefix to get the TMDB path.
    // Path arrives as e.g. "/api/tmdb/trending/all/day" or "/.netlify/functions/tmdb/trending/all/day".
    const raw = event.path || '';
    let tmdbPath = raw
        .replace(/^\/\.netlify\/functions\/tmdb/, '')
        .replace(/^\/api\/tmdb/, '');
    if (!tmdbPath.startsWith('/')) tmdbPath = '/' + tmdbPath;
    if (tmdbPath === '/') {
        return json(400, { error: 'Missing TMDB path' });
    }

    // Whitelist: only allow GET to TMDB read endpoints.
    if (event.httpMethod !== 'GET') {
        return json(405, { error: 'Method not allowed' });
    }
    if (!/^\/(trending|movie|tv|discover|search|genre|configuration)(\/|$)/.test(tmdbPath)) {
        return json(403, { error: 'Path not allowed' });
    }

    const url = new URL('https://api.themoviedb.org/3' + tmdbPath);
    const params = event.queryStringParameters || {};
    Object.entries(params).forEach(([k, v]) => {
        if (k === 'api_key') return; // never trust client-supplied keys
        if (v != null) url.searchParams.set(k, v);
    });
    url.searchParams.set('api_key', apiKey);

    try {
        const res = await fetch(url.toString());
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
        return json(502, { error: 'Upstream fetch failed', detail: String(err) });
    }
};

function json(statusCode, obj) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obj)
    };
}
