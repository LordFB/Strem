/**
 * Video player modal using vidsrc-embed.ru
 */
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

    init() {
        this.modalClose.addEventListener('click', () => this.close());
        this.modalBackdrop.addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
    },

    open(id, type = 'movie', title = '', season = null, episode = null) {
        this.currentId = id;
        this.currentType = type;
        this.currentSeason = season;
        this.currentEpisode = episode;
        this.currentTitle = title;

        const embedUrl = buildEmbedUrl(id, type, season, episode);

        this.modalPlayer.innerHTML = `
            <iframe
                src="${embedUrl}"
                allowfullscreen
                allow="autoplay; encrypted-media; fullscreen"
                title="${title.replace(/"/g, '"')}"
            ></iframe>
        `;

        const epInfo = (type === 'tv' && season !== null && episode !== null)
            ? `S${season}E${episode}`
            : '';

        this.modalInfo.innerHTML = `
            <h2>${escapeHtml(title)} ${epInfo ? `<span style="color:var(--text-muted)">${epInfo}</span>` : ''}</h2>
            <div class="meta">
                <span>${type === 'tv' ? 'TV Series' : 'Movie'}</span>
                ${epInfo ? `<span style="color:var(--text-muted)">&bull;</span><span>${epInfo}</span>` : ''}
                <span style="color:var(--text-muted)">&bull;</span>
                <span>vidsrc-embed</span>
            </div>
            <p>Playback is provided by a third-party embed service. If the video does not load, the content may not be available.</p>
        `;

        this.modal.classList.add('open');
        document.body.style.overflow = 'hidden';

        this._watchTimer = setTimeout(() => {
            if (this.currentId) {
                const watchKey = this._getWatchKey();
                Storage.add(watchKey, { type, season, episode, showId: this.currentId });
                UI.showToast(`Marked "${title}" as watched`);
                
                // Update show card if it's a TV show
                document.querySelectorAll(`.card[data-id="${this.currentId}"]`).forEach(card => {
                    card.classList.add('is-watched');
                    const badge = card.querySelector('.card-watched');
                    if (!badge) {
                        const b = document.createElement('span');
                        b.className = 'card-watched';
                        b.textContent = 'Watched';
                        card.querySelector('.card-poster').appendChild(b);
                    }
                });
                
                // Update episode row in detail page
                if (type === 'tv' && season !== null && episode !== null) {
                    const epKey = `${this.currentId}_s${season}e${episode}`;
                    document.querySelectorAll('.episode-item').forEach(epEl => {
                        // episodes don't have data attrs, but we can refresh the detail page
                        // The simpler approach: mark the clicked episode visually
                    });
                }
            }
        }, 30000);
    },

    playEpisode(tvId, season, episode, title) {
        this.open(tvId, 'tv', title, season, episode);
    },

    _getWatchKey() {
        if (this.currentType === 'tv' && this.currentSeason !== null && this.currentEpisode !== null) {
            return `${this.currentId}_s${this.currentSeason}e${this.currentEpisode}`;
        }
        return String(this.currentId);
    },

    close() {
        if (this._watchTimer) clearTimeout(this._watchTimer);
        this.modalPlayer.innerHTML = '';
        this.modal.classList.remove('open');
        document.body.style.overflow = '';
        this.currentId = null;
        this.currentType = null;
        this.currentSeason = null;
        this.currentEpisode = null;
        this.currentTitle = '';
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
