/**
 * Video player modal — fullscreen iframe with heuristic auto-next for TV.
 *
 * Cross-origin embeds don't expose play state, so end-of-episode is estimated
 * from TMDB's runtime metadata: we mark watched halfway through and prompt
 * "Up next" with a 15s cancellable countdown 30s before the projected end.
 */
const DEFAULT_EPISODE_RUNTIME_MIN = 42;
const NEXT_PROMPT_LEAD_SEC = 30;
const NEXT_COUNTDOWN_SEC = 15;
const WATCH_THRESHOLD_FRAC = 0.45;

const Player = {
    modal: document.getElementById('videoModal'),
    modalPlayer: document.getElementById('modalPlayer'),
    modalInfo: document.getElementById('modalInfo'),
    modalClose: document.getElementById('modalClose'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    currentId: null,
    currentType: null,
    currentSeason: null,
    currentEpisode: null,
    currentTitle: '',
    currentShowName: '',
    currentRuntimeMs: 0,
    sessionStart: 0,
    accumulatedMs: 0,
    pausedAt: 0,
    _watchTimer: null,
    _nextPromptTimer: null,
    _countdownTimer: null,
    _visHandler: null,

    init() {
        this.modalClose.addEventListener('click', () => this.close());
        this.modalBackdrop.addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('open')) this.close();
        });
    },

    open(id, type = 'movie', title = '', season = null, episode = null, opts = {}) {
        // If we're already open (auto-next chaining), tear down timers but keep modal up.
        this._clearTimers();
        this._dismissNextPrompt();

        this.currentId = id;
        this.currentType = type;
        this.currentSeason = season;
        this.currentEpisode = episode;
        this.currentTitle = title;
        this.currentShowName = opts.showName || title;
        this.currentRuntimeMs = (opts.runtimeMin || DEFAULT_EPISODE_RUNTIME_MIN) * 60 * 1000;
        this.sessionStart = Date.now();
        this.accumulatedMs = 0;
        this.pausedAt = 0;

        const embedUrl = buildEmbedUrl(id, type, season, episode);

        this.modalPlayer.innerHTML = `
            <iframe
                src="${embedUrl}"
                allowfullscreen
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                referrerpolicy="origin"
                title="${escapeHtml(title)}"
            ></iframe>
        `;

        this.modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        document.body.classList.add('player-open');

        // Watched-mark timer: half the runtime
        const watchAfter = Math.max(20000, this.currentRuntimeMs * WATCH_THRESHOLD_FRAC);
        this._watchTimer = setTimeout(() => this._markWatched(), watchAfter);

        // Auto-next: only for TV, and only if a follow-up exists.
        if (type === 'tv' && season !== null && episode !== null) {
            const promptAfter = Math.max(45000, this.currentRuntimeMs - NEXT_PROMPT_LEAD_SEC * 1000);
            this._nextPromptTimer = setTimeout(() => this._showUpNext(), promptAfter);
        }

        // Pause timers when the tab/app is hidden, resume on return.
        this._visHandler = () => this._onVisibilityChange();
        document.addEventListener('visibilitychange', this._visHandler);

        // Make sure focus is on the close button so remote Back/Enter works.
        if (document.body.classList.contains('tv-mode')) {
            setTimeout(() => this.modalClose.focus(), 50);
        }
    },

    playEpisode(tvId, season, episode, title, opts = {}) {
        this.open(tvId, 'tv', title, season, episode, opts);
    },

    _onVisibilityChange() {
        if (document.hidden) {
            // Pause: bank elapsed time, suspend pending timers
            if (this.sessionStart) {
                this.accumulatedMs += Date.now() - this.sessionStart;
                this.sessionStart = 0;
            }
            this._suspendTimers();
        } else {
            this.sessionStart = Date.now();
            this._resumeTimers();
        }
    },

    _elapsed() {
        return this.accumulatedMs + (this.sessionStart ? Date.now() - this.sessionStart : 0);
    },

    _suspendTimers() {
        // Re-arm with remaining time on resume.
        if (this._watchTimer) { clearTimeout(this._watchTimer); this._watchTimer = '_w'; }
        if (this._nextPromptTimer) { clearTimeout(this._nextPromptTimer); this._nextPromptTimer = '_n'; }
    },

    _resumeTimers() {
        const elapsed = this._elapsed();
        if (this._watchTimer === '_w') {
            const remain = Math.max(0, this.currentRuntimeMs * WATCH_THRESHOLD_FRAC - elapsed);
            this._watchTimer = setTimeout(() => this._markWatched(), remain);
        }
        if (this._nextPromptTimer === '_n') {
            const remain = Math.max(0, this.currentRuntimeMs - NEXT_PROMPT_LEAD_SEC * 1000 - elapsed);
            this._nextPromptTimer = setTimeout(() => this._showUpNext(), remain);
        }
    },

    _markWatched() {
        const watchKey = this._getWatchKey();
        if (!Storage.isWatched(watchKey)) {
            Storage.add(watchKey, {
                type: this.currentType,
                season: this.currentSeason,
                episode: this.currentEpisode,
                showId: this.currentId
            });
            UI.showToast(`Marked "${this.currentTitle}" as watched`);
        }
        this._refreshWatchedUI();
    },

    _refreshWatchedUI() {
        // Cards on the home/search grid
        document.querySelectorAll(`.card[data-id="${this.currentId}"]`).forEach(card => {
            card.classList.add('is-watched');
            if (!card.querySelector('.card-watched')) {
                const poster = card.querySelector('.card-poster');
                if (poster) {
                    const b = document.createElement('span');
                    b.className = 'card-watched';
                    b.textContent = 'Watched';
                    poster.appendChild(b);
                }
            }
        });

        // Episode row in detail page
        if (this.currentType === 'tv' && this.currentSeason !== null && this.currentEpisode !== null) {
            const sel = `.episode-item[data-show="${this.currentId}"][data-season="${this.currentSeason}"][data-episode="${this.currentEpisode}"]`;
            document.querySelectorAll(sel).forEach(el => el.classList.add('is-watched'));
        }
    },

    async _showUpNext() {
        if (this.currentType !== 'tv' || this.currentSeason === null || this.currentEpisode === null) return;

        let next;
        try {
            next = await this._findNextEpisode(this.currentId, this.currentSeason, this.currentEpisode);
        } catch (err) {
            console.warn('Up next lookup failed', err);
            return;
        }
        if (!next) return; // end of series

        this._renderNextPrompt(next);
    },

    async _findNextEpisode(tvId, season, episode) {
        // Try same season first
        try {
            const seasonData = await Api.getTVSeason(tvId, season);
            const eps = seasonData.episodes || [];
            const next = eps.find(e => e.episode_number === episode + 1);
            if (next) {
                return {
                    tvId,
                    season,
                    episode: next.episode_number,
                    name: next.name || `Episode ${next.episode_number}`,
                    runtime: next.runtime,
                    still: next.still_path
                };
            }
        } catch (_) {}

        // Roll over to next season's episode 1
        try {
            const tv = await Api.getTVDetails(tvId);
            const seasons = (tv.seasons || []).filter(s => s.season_number > season && s.season_number > 0);
            seasons.sort((a, b) => a.season_number - b.season_number);
            const nextSeason = seasons[0];
            if (!nextSeason) return null;
            const seasonData = await Api.getTVSeason(tvId, nextSeason.season_number);
            const first = (seasonData.episodes || [])[0];
            if (!first) return null;
            return {
                tvId,
                season: nextSeason.season_number,
                episode: first.episode_number,
                name: first.name || `Episode ${first.episode_number}`,
                runtime: first.runtime,
                still: first.still_path
            };
        } catch (_) {
            return null;
        }
    },

    _renderNextPrompt(next) {
        this._dismissNextPrompt();

        const overlay = document.createElement('div');
        overlay.className = 'up-next';
        overlay.id = 'upNext';
        overlay.innerHTML = `
            <div class="up-next-thumb">
                ${next.still ? `<img src="${UI.posterUrl(next.still, 'w300')}" alt="">` : ''}
            </div>
            <div class="up-next-body">
                <div class="up-next-label">Up next</div>
                <div class="up-next-title">S${next.season}E${next.episode} &middot; ${escapeHtml(next.name)}</div>
                <div class="up-next-count">Playing in <span id="upNextSec">${NEXT_COUNTDOWN_SEC}</span>s</div>
                <div class="up-next-actions">
                    <button class="btn btn-primary" id="upNextPlay" tabindex="0" data-focusable="upnext">Play now</button>
                    <button class="btn btn-secondary" id="upNextCancel" tabindex="0" data-focusable="upnext">Cancel</button>
                </div>
            </div>
        `;
        this.modal.appendChild(overlay);

        const playNow = () => {
            this._dismissNextPrompt();
            this._chainTo(next);
        };
        const cancel = () => this._dismissNextPrompt();

        overlay.querySelector('#upNextPlay').addEventListener('click', playNow);
        overlay.querySelector('#upNextCancel').addEventListener('click', cancel);

        if (document.body.classList.contains('tv-mode')) {
            setTimeout(() => overlay.querySelector('#upNextPlay').focus(), 50);
        }

        let remaining = NEXT_COUNTDOWN_SEC;
        const secEl = overlay.querySelector('#upNextSec');
        this._countdownTimer = setInterval(() => {
            remaining -= 1;
            if (secEl) secEl.textContent = remaining;
            if (remaining <= 0) playNow();
        }, 1000);
    },

    _dismissNextPrompt() {
        if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
        const existing = document.getElementById('upNext');
        if (existing) existing.remove();
    },

    _chainTo(next) {
        // Refresh the detail page episode list so the just-finished episode shows as watched.
        this._refreshDetailEpisodes(this.currentId, this.currentSeason);

        this.playEpisode(next.tvId, next.season, next.episode, next.name, {
            runtimeMin: next.runtime || DEFAULT_EPISODE_RUNTIME_MIN,
            showName: this.currentShowName
        });
        // If we rolled to a new season, also refresh that season's list when the user
        // navigates back to the detail page.
    },

    async _refreshDetailEpisodes(tvId, season) {
        const detailPage = document.getElementById('detailPage');
        if (!detailPage || detailPage.classList.contains('hidden')) return;
        const container = document.getElementById(`episodes-${season}`);
        if (!container || !container.dataset.loaded) return;
        try {
            const data = await Api.getTVSeason(tvId, season);
            UI.renderEpisodes(data.episodes || [], tvId, season, container);
            container.dataset.loaded = 'true';
        } catch (_) {}
    },

    _getWatchKey() {
        if (this.currentType === 'tv' && this.currentSeason !== null && this.currentEpisode !== null) {
            return `${this.currentId}_s${this.currentSeason}e${this.currentEpisode}`;
        }
        return String(this.currentId);
    },

    _clearTimers() {
        if (this._watchTimer && this._watchTimer !== '_w') clearTimeout(this._watchTimer);
        if (this._nextPromptTimer && this._nextPromptTimer !== '_n') clearTimeout(this._nextPromptTimer);
        this._watchTimer = null;
        this._nextPromptTimer = null;
        if (this._visHandler) {
            document.removeEventListener('visibilitychange', this._visHandler);
            this._visHandler = null;
        }
    },

    close() {
        this._clearTimers();
        this._dismissNextPrompt();
        // One last attempt to mark watched if user got far enough
        if (this.currentId && this._elapsed() > this.currentRuntimeMs * WATCH_THRESHOLD_FRAC) {
            this._markWatched();
        }
        // Refresh the current season list if the detail page is open.
        if (this.currentType === 'tv' && this.currentSeason !== null) {
            this._refreshDetailEpisodes(this.currentId, this.currentSeason);
        }
        this.modalPlayer.innerHTML = '';
        this.modal.classList.remove('open');
        document.body.style.overflow = '';
        document.body.classList.remove('player-open');
        this.currentId = null;
        this.currentType = null;
        this.currentSeason = null;
        this.currentEpisode = null;
        this.currentTitle = '';
        this.currentShowName = '';
        this.currentRuntimeMs = 0;
        this.sessionStart = 0;
        this.accumulatedMs = 0;
    }
};

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
