/**
 * TMDB API layer with freshness scoring
 */
const Api = {
    async fetch(path, params = {}) {
        // Build URL relative to the Netlify proxy. The function injects the API key.
        const url = new URL(`${CONFIG.TMDB_PROXY}${path}`, window.location.origin);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null) url.searchParams.set(k, v);
        });

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`TMDB ${res.status}: ${res.statusText}`);
        return res.json();
    },

    // Trending: day or week
    getTrending(timeWindow = 'day', page = 1) {
        return this.fetch(`/trending/all/${timeWindow}`, { page });
    },

    getTrendingMovies(timeWindow = 'day', page = 1) {
        return this.fetch(`/trending/movie/${timeWindow}`, { page });
    },

    getTrendingTV(timeWindow = 'day', page = 1) {
        return this.fetch(`/trending/tv/${timeWindow}`, { page });
    },

    // Now playing / fresh releases
    getNowPlaying(page = 1) {
        return this.fetch('/movie/now_playing', { page, region: 'US' });
    },

    getUpcoming(page = 1) {
        return this.fetch('/movie/upcoming', { page, region: 'US' });
    },

    getAiringToday(page = 1) {
        return this.fetch('/tv/airing_today', { page });
    },

    getOnTheAir(page = 1) {
        return this.fetch('/tv/on_the_air', { page });
    },

    // Top rated
    getTopRatedMovies(page = 1) {
        return this.fetch('/movie/top_rated', { page });
    },

    getTopRatedTV(page = 1) {
        return this.fetch('/tv/top_rated', { page });
    },

    // Genre filtered
    discoverMoviesByGenre(genreId, page = 1) {
        return this.fetch('/discover/movie', {
            with_genres: genreId,
            sort_by: 'popularity.desc',
            page
        });
    },

    discoverTVByGenre(genreId, page = 1) {
        return this.fetch('/discover/tv', {
            with_genres: genreId,
            sort_by: 'popularity.desc',
            page
        });
    },

    // Search
    searchMulti(query, page = 1) {
        return this.fetch('/search/multi', { query, page, include_adult: false });
    },

    // Details
    getMovieDetails(id) {
        return this.fetch(`/movie/${id}`, { append_to_response: 'credits,videos' });
    },

    // TV Seasons & Episodes
    getTVDetails(id) {
        return this.fetch(`/tv/${id}`, { append_to_response: 'credits,videos,content_ratings' });
    },

    getTVSeason(tvId, seasonNumber) {
        return this.fetch(`/tv/${tvId}/season/${seasonNumber}`, { append_to_response: 'credits' });
    },

    getTVEpisode(tvId, seasonNumber, episodeNumber) {
        return this.fetch(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`);
    },

    // Freshness score: higher = newer
    // Uses days since release; today = 1000, older = lower
    freshnessScore(item) {
        const dateStr = item.release_date || item.first_air_date;
        if (!dateStr) return 500;
        const released = new Date(dateStr);
        const now = new Date();
        const daysDiff = (now - released) / (1000 * 60 * 60 * 24);
        // Future releases get a boost; very old get decayed
        if (daysDiff < 0) return 1000 + Math.abs(daysDiff); // upcoming
        return Math.max(0, 1000 - daysDiff);
    },

    // Sort items by freshness (newer first) then by popularity
    sortByFreshness(items) {
        return [...items].sort((a, b) => {
            const fa = this.freshnessScore(a);
            const fb = this.freshnessScore(b);
            if (fb !== fa) return fb - fa;
            return (b.popularity || 0) - (a.popularity || 0);
        });
    },

    // Move watched items to the end of an array while preserving internal order
    deprioritizeWatched(items) {
        const watched = [];
        const unwatched = [];
        items.forEach(item => {
            if (Storage.isWatched(item.id)) watched.push(item);
            else unwatched.push(item);
        });
        return [...unwatched, ...watched];
    }
};

