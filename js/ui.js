/**
 * UI rendering utilities
 */
const UI = {
    // Image helpers
    posterUrl(path, size = CONFIG.POSTER_SIZE) {
        if (!path) return '';
        return `${CONFIG.TMDB_IMAGE_BASE}/${size}${path}`;
    },
    backdropUrl(path) {
        if (!path) return '';
        return `${CONFIG.TMDB_IMAGE_BASE}/${CONFIG.BACKDROP_SIZE}${path}`;
    },

    // Create a card element for a movie/tv item
    createCard(item, opts = {}) {
        const el = document.createElement('div');
        el.className = 'card';
        if (Storage.isWatched(item.id)) el.classList.add('is-watched');
        el.dataset.id = item.id;
        el.dataset.type = item.media_type || opts.type || (item.first_air_date ? 'tv' : 'movie');

        const poster = item.poster_path
            ? this.posterUrl(item.poster_path)
            : '';

        const year = (item.release_date || item.first_air_date || '').slice(0, 4);
        const rating = item.vote_average ? item.vote_average.toFixed(1) : '';

        el.innerHTML = `
            <div class="card-poster">
                ${poster ? `<img src="${poster}" alt="${item.title || item.name}" loading="lazy">` : ''}
                ${rating ? `<span class="card-badge">${rating}</span>` : ''}
                ${Storage.isWatched(item.id) ? `<span class="card-watched">Watched</span>` : ''}
            </div>
            <div class="card-info">
                <div class="card-title">${item.title || item.name || 'Untitled'}</div>
                <div class="card-meta">${year} &bull; ${item.media_type === 'tv' || item.first_air_date ? 'TV' : 'Movie'}</div>
            </div>
        `;
        el.tabIndex = 0;
        el.dataset.focusable = 'card';

        el.addEventListener('click', () => {
            App.openItem(item.id, el.dataset.type, item.title || item.name);
        });

        return el;
    },

    // Skeleton card
    createSkeletonCard() {
        const el = document.createElement('div');
        el.className = 'card skeleton-card';
        el.innerHTML = `
            <div class="card-poster skeleton"></div>
            <div class="card-info">
                <div class="card-title skeleton" style="height:14px;width:80%;margin-bottom:6px;"></div>
                <div class="card-meta skeleton" style="height:10px;width:50%;"></div>
            </div>
        `;
        return el;
    },

    // Render a horizontal row
    renderRow(title, items, container) {
        const existing = container.querySelector(`[data-row-title="${title}"]`);
        if (existing) existing.remove();

        const rowEl = document.createElement('div');
        rowEl.className = 'row';
        rowEl.dataset.rowTitle = title;

        const unwatchedCount = items.filter(i => !Storage.isWatched(i.id)).length;
        const watchedCount = items.length - unwatchedCount;

        rowEl.innerHTML = `
            <div class="row-header">
                <span class="section-title">${title}</span>
                <span class="row-count">${unwatchedCount} new${watchedCount ? `, ${watchedCount} watched` : ''}</span>
            </div>
            <button class="row-nav prev" aria-label="Previous">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="row-scroll"></div>
            <button class="row-nav next" aria-label="Next">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        `;

        const scroll = rowEl.querySelector('.row-scroll');
        items.forEach(item => scroll.appendChild(this.createCard(item)));

        // Row navigation
        const prevBtn = rowEl.querySelector('.row-nav.prev');
        const nextBtn = rowEl.querySelector('.row-nav.next');
        const scrollAmount = () => scroll.clientWidth * 0.8;

        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            scroll.scrollBy({ left: -scrollAmount(), behavior: 'smooth' });
        });
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            scroll.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
        });

        container.appendChild(rowEl);
        return rowEl;
    },

    // Render skeleton row
    renderSkeletonRow(title, count = 8, container) {
        const rowEl = document.createElement('div');
        rowEl.className = 'row skeleton-row';
        rowEl.dataset.rowTitle = title;
        rowEl.innerHTML = `
            <div class="row-header">
                <span class="section-title skeleton" style="height:18px;width:160px;display:inline-block;"></span>
            </div>
            <div class="row-scroll"></div>
        `;
        const scroll = rowEl.querySelector('.row-scroll');
        for (let i = 0; i < count; i++) scroll.appendChild(this.createSkeletonCard());
        container.appendChild(rowEl);
        return rowEl;
    },

    // Remove all skeleton rows
    clearSkeletons(container) {
        container.querySelectorAll('.skeleton-row').forEach(el => el.remove());
    },

    // Render hero banner
    renderHero(item) {
        const heroBg = document.getElementById('heroBg');
        const heroMeta = document.getElementById('heroMeta');
        const heroTitle = document.getElementById('heroTitle');
        const heroDesc = document.getElementById('heroDesc');
        const heroPlay = document.getElementById('heroPlay');
        const heroInfo = document.getElementById('heroInfo');

        const type = item.first_air_date ? 'tv' : 'movie';
        const year = (item.release_date || item.first_air_date || '').slice(0, 4);
        const rating = item.vote_average ? item.vote_average.toFixed(1) : '';

        heroBg.style.backgroundImage = item.backdrop_path
            ? `url(${this.backdropUrl(item.backdrop_path)})`
            : item.poster_path
                ? `url(${this.posterUrl(item.poster_path)})`
                : '';

        heroMeta.innerHTML = `
            <span class="badge">${type === 'tv' ? 'Series' : 'Movie'}</span>
            ${year ? `<span>${year}</span>` : ''}
            ${rating ? `<span class="rating">&#9733; ${rating}</span>` : ''}
            ${item.adult ? '<span class="badge">18+</span>' : ''}
        `;
        heroTitle.textContent = item.title || item.name || '';
        heroDesc.textContent = item.overview || '';

        heroPlay.onclick = () => App.openItem(item.id, type, item.title || item.name);
        heroInfo.onclick = () => App.openItem(item.id, type, item.title || item.name);
    },

    // Render search results grid
    renderSearchResults(items, container) {
        container.innerHTML = '';
        if (!items.length) {
            container.innerHTML = '<p style="color:var(--text-muted);padding:2rem 0;">No results found.</p>';
            return;
        }
        items.forEach(item => {
            if (item.media_type === 'person') return;
            container.appendChild(this.createCard(item, { type: item.media_type }));
        });
    },

    // TV Detail Page
    renderTVDetailPage(tvData) {
        const detailContent = document.getElementById('detailContent');
        this._currentShowName = tvData.name || '';
        this._currentTvData = tvData;

        const poster = tvData.poster_path ? this.posterUrl(tvData.poster_path, 'w500') : '';
        const backdrop = tvData.backdrop_path ? this.backdropUrl(tvData.backdrop_path) : '';
        const year = (tvData.first_air_date || '').slice(0, 4);
        const rating = tvData.vote_average ? tvData.vote_average.toFixed(1) : '';
        const genres = (tvData.genres || []).map(g => g.name).join(', ');
        const seasons = tvData.seasons || [];
        const realSeasons = seasons.filter(s => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);

        detailContent.innerHTML = `
            <div class="detail-backdrop" style="${backdrop ? `background-image:url(${backdrop})` : ''}">
                <div class="detail-backdrop-vignette"></div>
            </div>
            <div class="detail-body">
                <div class="detail-main">
                    ${poster ? `<img class="detail-poster" src="${poster}" alt="${tvData.name}">` : ''}
                    <div class="detail-info">
                        <h1 class="detail-title">${tvData.name || 'Untitled'}</h1>
                        <div class="detail-meta">
                            ${year ? `<span>${year}</span>` : ''}
                            ${tvData.number_of_seasons ? `<span>${tvData.number_of_seasons} Season${tvData.number_of_seasons !== 1 ? 's' : ''}</span>` : ''}
                            ${tvData.status ? `<span>${tvData.status}</span>` : ''}
                            ${rating ? `<span class="detail-rating">&#9733; ${rating}</span>` : ''}
                        </div>
                        ${genres ? `<div class="detail-genres">${genres}</div>` : ''}
                        <p class="detail-overview">${tvData.overview || ''}</p>
                        <div class="detail-actions">
                            <button class="btn btn-primary" id="detailPlayBtn">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                ${realSeasons.length > 0 ? `Play S${realSeasons[0].season_number}E1` : 'Play'}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="detail-seasons" id="detailSeasons">
                    ${realSeasons.length === 0 ? '<p style="color:var(--text-muted);padding:2rem 0;">No seasons available.</p>' : ''}
                </div>
            </div>
        `;

        // Setup close button
        const closeBtn = document.getElementById('detailClose');
        if (closeBtn) {
            closeBtn.onclick = () => this.hideDetailPage();
        }

        // Render seasons with episodes
        const seasonsContainer = document.getElementById('detailSeasons');
        if (realSeasons.length > 0 && seasonsContainer) {
            realSeasons.forEach(season => {
                const seasonEl = document.createElement('div');
                seasonEl.className = 'season-block';
                seasonEl.innerHTML = `
                    <div class="season-header" data-season="${season.season_number}" tabindex="0" data-focusable="season">
                        <img class="season-poster" src="${season.poster_path ? this.posterUrl(season.poster_path, 'w185') : poster || ''}" alt="${season.name}">
                        <div class="season-info">
                            <h3>${season.name}</h3>
                            <span class="season-meta">${season.episode_count} Episodes &bull; ${(season.air_date || '').slice(0, 4) || 'TBA'}</span>
                        </div>
                        <svg class="season-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <div class="season-episodes" id="episodes-${season.season_number}" style="display:none;">
                        <div class="episodes-loading">Loading episodes...</div>
                    </div>
                `;

                const header = seasonEl.querySelector('.season-header');
                const episodesContainer = seasonEl.querySelector('.season-episodes');

                header.addEventListener('click', async () => {
                    const isOpen = episodesContainer.style.display !== 'none';
                    if (isOpen) {
                        episodesContainer.style.display = 'none';
                        header.classList.remove('open');
                    } else {
                        header.classList.add('open');
                        episodesContainer.style.display = 'block';
                        if (!episodesContainer.dataset.loaded) {
                            try {
                                const seasonData = await Api.getTVSeason(tvData.id, season.season_number);
                                this.renderEpisodes(seasonData.episodes || [], tvData.id, season.season_number, episodesContainer);
                                episodesContainer.dataset.loaded = 'true';
                            } catch (err) {
                                episodesContainer.innerHTML = '<p style="color:var(--text-muted);padding:1rem;">Failed to load episodes.</p>';
                            }
                        }
                    }
                });

                seasonsContainer.appendChild(seasonEl);
            });

            // Auto-open first season
            const firstSeasonHeader = seasonsContainer.querySelector('.season-header');
            if (firstSeasonHeader) firstSeasonHeader.click();

            // Set up Play button
            const playBtn = document.getElementById('detailPlayBtn');
            if (playBtn) {
                playBtn.addEventListener('click', () => {
                    const firstSeason = realSeasons[0];
                    if (firstSeason) {
                        Player.playEpisode(tvData.id, firstSeason.season_number, 1, `${tvData.name} S${firstSeason.season_number}E1`, {
                            showName: tvData.name
                        });
                    }
                });
            }
        }
    },

    renderEpisodes(episodes, tvId, seasonNumber, container) {
        container.innerHTML = '';
        if (!episodes.length) {
            container.innerHTML = '<p style="color:var(--text-muted);padding:1rem;">No episodes found.</p>';
            return;
        }

        episodes.forEach((ep) => {
            const epEl = document.createElement('div');
            epEl.className = 'episode-item';
            epEl.tabIndex = 0;
            epEl.dataset.focusable = 'episode';
            epEl.dataset.show = tvId;
            epEl.dataset.season = seasonNumber;
            epEl.dataset.episode = ep.episode_number;
            const isWatched = Storage.isWatched(`${tvId}_s${seasonNumber}e${ep.episode_number}`);
            if (isWatched) epEl.classList.add('is-watched');

            epEl.innerHTML = `
                <div class="episode-number">${ep.episode_number}</div>
                <div class="episode-thumb">
                    ${ep.still_path ? `<img src="${this.posterUrl(ep.still_path, 'w300')}" alt="${ep.name}" loading="lazy">` : ''}
                </div>
                <div class="episode-info">
                    <div class="episode-title-row">
                        <span class="episode-title">${ep.name || `Episode ${ep.episode_number}`}</span>
                        ${ep.runtime ? `<span class="episode-runtime">${ep.runtime} min</span>` : ''}
                    </div>
                    <p class="episode-desc">${ep.overview || ''}</p>
                </div>
                <button class="episode-play" aria-label="Play episode">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
            `;

            epEl.addEventListener('click', () => {
                Player.playEpisode(tvId, seasonNumber, ep.episode_number, ep.name, {
                    runtimeMin: ep.runtime,
                    showName: this._currentShowName || ''
                });
            });

            container.appendChild(epEl);
        });
    },

    hideDetailPage() {
        const detailPage = document.getElementById('detailPage');
        if (detailPage) {
            detailPage.classList.add('hidden');
            document.getElementById('detailContent').innerHTML = '';
            document.body.style.overflow = '';
        }
    },

    // Toast notification
    showToast(message, duration = 2200) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    },

    // Show/hide search results section
    setSearchVisible(visible) {
        const results = document.getElementById('searchResults');
        const rows = document.getElementById('contentRows');
        const hero = document.getElementById('hero');
        if (visible) {
            results.classList.remove('hidden');
            rows.style.display = 'none';
            if (hero) hero.style.display = 'none';
        } else {
            results.classList.add('hidden');
            rows.style.display = '';
            if (hero) hero.style.display = '';
        }
    },

    // Header scroll state
    initHeaderScroll() {
        const header = document.getElementById('header');
        window.addEventListener('scroll', () => {
            header.classList.toggle('scrolled', window.scrollY > 40);
        });
    }
};
