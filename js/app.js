/**
 * Main application orchestration
 */
const App = {
    rowsContainer: document.getElementById('contentRows'),
    searchInput: document.getElementById('searchInput'),
    searchGrid: document.getElementById('searchGrid'),
    menuToggle: document.getElementById('menuToggle'),
    mobileNav: document.getElementById('mobileNav'),
    heroData: null,
    abortCtrl: null,

    init() {
        UI.initHeaderScroll();
        Player.init();
        this.bindEvents();
        this.loadFrontpage();
    },

    bindEvents() {
        // Search with debounce
        let timer;
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(timer);
            const q = e.target.value.trim();
            if (!q) {
                UI.setSearchVisible(false);
                return;
            }
            timer = setTimeout(() => this.performSearch(q), CONFIG.DEBOUNCE_MS);
        });

        // Mobile menu
        this.menuToggle.addEventListener('click', () => {
            this.mobileNav.classList.toggle('open');
        });

        // Nav links
        document.querySelectorAll('[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.searchInput.value = '';
                UI.setSearchVisible(false);
                this.mobileNav.classList.remove('open');
                this.loadSection(section);
            });
        });
    },

    async loadFrontpage() {
        this.rowsContainer.innerHTML = '';

        // Show skeletons while loading
        const skeletons = [
            'Trending Today',
            'Fresh Releases',
            'Top Rated',
            'Action',
            'Comedy',
            'Sci-Fi'
        ];
        skeletons.forEach(title => UI.renderSkeletonRow(title, 8, this.rowsContainer));

        try {
            // Fetch multiple sources in parallel
            const [
                trending,
                nowPlaying,
                upcoming,
                topRatedMovies,
                topRatedTV
            ] = await Promise.all([
                Api.getTrending('day', 1),
                Api.getNowPlaying(1),
                Api.getUpcoming(1),
                Api.getTopRatedMovies(1),
                Api.getTopRatedTV(1)
            ]);

            // Genre fetches
            const genrePromises = CONFIG.FEATURED_GENRES.map(g =>
                Api.discoverMoviesByGenre(g.id, 1).catch(() => ({ results: [] }))
            );
            const genreResults = await Promise.all(genrePromises);

            UI.clearSkeletons(this.rowsContainer);

            // ---- HERO ----
            const heroCandidates = (trending.results || []).filter(i => i.backdrop_path);
            this.heroData = heroCandidates.length
                ? heroCandidates[Math.floor(Math.random() * heroCandidates.length)]
                : trending.results[0];
            if (this.heroData) UI.renderHero(this.heroData);

            // ---- ROWS ----
            this.addRow('Trending Today', trending.results);

            const freshItems = Api.deprioritizeWatched(
                Api.sortByFreshness([
                    ...(nowPlaying.results || []),
                    ...(upcoming.results || [])
                ]).slice(0, CONFIG.ROW_LIMIT)
            );
            this.addRow('Fresh Releases', freshItems);

            const topRatedMixed = Api.deprioritizeWatched(
                Api.sortByFreshness([
                    ...(topRatedMovies.results || []),
                    ...(topRatedTV.results || [])
                ]).slice(0, CONFIG.ROW_LIMIT)
            );
            this.addRow('Top Rated', topRatedMixed);

            CONFIG.FEATURED_GENRES.forEach((genre, idx) => {
                const data = genreResults[idx];
                if (data && data.results && data.results.length) {
                    const items = Api.deprioritizeWatched(
                        Api.sortByFreshness(data.results).slice(0, CONFIG.ROW_LIMIT)
                    );
                    this.addRow(genre.name, items);
                }
            });

        } catch (err) {
            console.error(err);
            UI.clearSkeletons(this.rowsContainer);
            this.rowsContainer.innerHTML = `
                <div style="padding:4rem 4vw;text-align:center;color:var(--text-muted);">
                    <p>Failed to load content. Please check your API key and network connection.</p>
                    <p style="font-size:0.8rem;margin-top:0.5rem;">${escapeHtml(err.message)}</p>
                </div>
            `;
        }
    },

    async loadSection(section) {
        this.rowsContainer.innerHTML = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const titles = {
            home: ['Trending Today', 'Fresh Releases', 'Top Rated'],
            movies: ['Trending Movies', 'Now Playing', 'Upcoming Movies', 'Top Rated Movies'],
            tv: ['Trending TV', 'Airing Today', 'On The Air', 'Top Rated TV'],
            fresh: ['Fresh Releases', 'Upcoming', 'Airing Today']
        };

        const fetchMap = {
            home: () => Promise.all([
                Api.getTrending('day'),
                Api.getNowPlaying(),
                Api.getTopRatedMovies()
            ]),
            movies: () => Promise.all([
                Api.getTrendingMovies('day'),
                Api.getNowPlaying(),
                Api.getUpcoming(),
                Api.getTopRatedMovies()
            ]),
            tv: () => Promise.all([
                Api.getTrendingTV('day'),
                Api.getAiringToday(),
                Api.getOnTheAir(),
                Api.getTopRatedTV()
            ]),
            fresh: () => Promise.all([
                Api.getNowPlaying(),
                Api.getUpcoming(),
                Api.getAiringToday()
            ])
        };

        titles[section].forEach(t => UI.renderSkeletonRow(t, 8, this.rowsContainer));

        try {
            const results = await fetchMap[section]();
            UI.clearSkeletons(this.rowsContainer);

            results.forEach((res, idx) => {
                const items = Api.deprioritizeWatched(
                    Api.sortByFreshness(res.results || []).slice(0, CONFIG.ROW_LIMIT)
                );
                this.addRow(titles[section][idx], items);
            });
        } catch (err) {
            console.error(err);
            UI.clearSkeletons(this.rowsContainer);
        }
    },

    addRow(title, items) {
        if (!items || !items.length) return;
        UI.renderRow(title, items, this.rowsContainer);
    },

    async performSearch(query) {
        if (this.abortCtrl) this.abortCtrl.abort();
        this.abortCtrl = new AbortController();

        UI.setSearchVisible(true);
        this.searchGrid.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0;">Searching...</p>';

        try {
            const data = await Api.searchMulti(query);
            const results = (data.results || []).filter(i => i.media_type !== 'person');
            UI.renderSearchResults(results, this.searchGrid);
        } catch (err) {
            if (err.name !== 'AbortError') {
                this.searchGrid.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0;">Search failed.</p>';
            }
        }
    },

    async openItem(id, type, title) {
        if (type === 'tv') {
            // Show TV detail page with seasons/episodes
            UI.hideDetailPage();
            const detailPage = document.getElementById('detailPage');
            detailPage.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            // Show skeleton while loading
            document.getElementById('detailContent').innerHTML = `
                <div class="detail-backdrop skeleton" style="height:50vh;"></div>
                <div class="detail-body" style="padding:2rem 4vw;">
                    <div class="detail-main">
                        <div class="detail-poster skeleton" style="width:200px;height:300px;"></div>
                        <div style="flex:1;">
                            <div class="skeleton" style="height:32px;width:60%;margin-bottom:1rem;"></div>
                            <div class="skeleton" style="height:16px;width:40%;margin-bottom:2rem;"></div>
                            <div class="skeleton" style="height:80px;width:100%;"></div>
                        </div>
                    </div>
                </div>
            `;

            try {
                const tvData = await Api.getTVDetails(id);
                UI.renderTVDetailPage(tvData);
            } catch (err) {
                document.getElementById('detailContent').innerHTML = `
                    <div style="padding:4rem 4vw;text-align:center;color:var(--text-muted);">
                        <p>Failed to load TV show details.</p>
                    </div>
                `;
            }
        } else {
            // Movies play directly
            Player.open(id, type, title);
        }
    }
};

// Boot
window.addEventListener('DOMContentLoaded', () => App.init());
