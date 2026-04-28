/**
 * Smart TV remote support — primarily Hisense (VIDAA OS) but also handles
 * Android TV / Tizen / webOS keycodes since the same app should work everywhere.
 *
 * Spatial navigation: arrow keys move focus to the nearest focusable element
 * in the requested direction. Enter activates. Back closes overlays.
 * Media keys (Play/Pause/Stop/FF/Rew) interact with the embedded player.
 */
const Remote = {
    // Hisense (VIDAA) + cross-platform smart TV key codes
    KEYS: {
        LEFT:       [37],
        UP:         [38],
        RIGHT:      [39],
        DOWN:       [40],
        ENTER:      [13, 32],                 // OK / Space
        BACK:       [8, 27, 10009, 461, 166], // Backspace, Esc, Tizen, webOS, Android-back
        HOME:       [36, 10073],
        PLAY:       [415, 10252],
        PAUSE:      [19, 10073],
        PLAY_PAUSE: [179, 463],
        STOP:       [413],
        FAST_FWD:   [417],
        REWIND:     [412],
        CHANNEL_UP: [427, 33],                // PageUp fallback
        CHANNEL_DN: [428, 34],
        // Hisense colour buttons (VIDAA + CEA-2014)
        RED:        [403],
        GREEN:      [404],
        YELLOW:     [405],
        BLUE:       [406],
        // Numbers 0-9 are 48-57 (no remap needed)
    },

    enabled: false,
    detected: false,
    lastInputWasKeyboard: false,

    init() {
        this.detected = this._detectTV();
        if (this.detected) this.enable();

        // Auto-enable when arrow keys / TV keys are used
        document.addEventListener('keydown', (e) => this._onKey(e), true);

        // Disable TV mode when mouse is used
        document.addEventListener('mousemove', () => {
            if (!this.detected) this.disable();
        });

        // Make sure search input doesn't trap focus weirdly
        this._registerVidaaKeys();
    },

    _detectTV() {
        const ua = navigator.userAgent || '';
        return /Hisense|VIDAA|SmartTV|SMART-TV|NetCast|Tizen|Web0S|webOS|HbbTV|GoogleTV|AndroidTV|AFTS|AFTM|AFTB/i.test(ua);
    },

    _registerVidaaKeys() {
        // Hisense VIDAA: tvKey isn't required, but registering RC keys via
        // tizen.tvinputdevice or webOS APIs may be needed on those platforms.
        // We try them defensively; failures are silent.
        try {
            if (window.tizen && tizen.tvinputdevice) {
                ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
                 'MediaFastForward', 'MediaRewind',
                 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
                 'ChannelUp', 'ChannelDown']
                    .forEach(k => { try { tizen.tvinputdevice.registerKey(k); } catch (_) {} });
            }
        } catch (_) {}
    },

    enable() {
        if (this.enabled) return;
        this.enabled = true;
        document.body.classList.add('tv-mode');
        // Ensure something is focused
        this._focusInitial();
    },

    disable() {
        if (!this.enabled) return;
        this.enabled = false;
        document.body.classList.remove('tv-mode');
    },

    _focusInitial() {
        if (document.activeElement && document.activeElement !== document.body) return;
        const first = document.querySelector('.btn, .card, [data-focusable]');
        if (first) first.focus();
    },

    _matches(code, group) {
        return this.KEYS[group].indexOf(code) !== -1;
    },

    _onKey(e) {
        const code = e.keyCode || e.which;
        const isArrow = [37, 38, 39, 40].indexOf(code) !== -1;

        // Auto-enable TV mode on arrow / remote key usage
        if (!this.enabled && (isArrow || this._matches(code, 'BACK') ||
                              this._matches(code, 'PLAY') || this._matches(code, 'PLAY_PAUSE') ||
                              this._matches(code, 'RED') || this._matches(code, 'GREEN') ||
                              this._matches(code, 'YELLOW') || this._matches(code, 'BLUE'))) {
            this.enable();
        }

        // Don't hijack typing in the search box
        const inInput = document.activeElement && document.activeElement.tagName === 'INPUT';

        // BACK
        if (this._matches(code, 'BACK')) {
            if (this._handleBack()) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }

        // Media keys → player
        if (this._matches(code, 'PLAY_PAUSE') || this._matches(code, 'PLAY') || this._matches(code, 'PAUSE')) {
            this._sendToPlayer('playPause');
            e.preventDefault();
            return;
        }
        if (this._matches(code, 'STOP')) {
            if (Player && Player.modal && Player.modal.classList.contains('open')) {
                Player.close();
                e.preventDefault();
            }
            return;
        }

        // Colour buttons — convenient shortcuts
        if (this._matches(code, 'RED'))    { this._navigateSection('home');   e.preventDefault(); return; }
        if (this._matches(code, 'GREEN'))  { this._navigateSection('movies'); e.preventDefault(); return; }
        if (this._matches(code, 'YELLOW')) { this._navigateSection('tv');     e.preventDefault(); return; }
        if (this._matches(code, 'BLUE'))   { this._navigateSection('fresh');  e.preventDefault(); return; }

        // Channel up/down → scroll page
        if (this._matches(code, 'CHANNEL_UP'))  { window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }); e.preventDefault(); return; }
        if (this._matches(code, 'CHANNEL_DN'))  { window.scrollBy({ top:  window.innerHeight * 0.8, behavior: 'smooth' }); e.preventDefault(); return; }

        if (inInput && (code === 13)) {
            // Enter in search input: blur to commit and move into results
            document.activeElement.blur();
            const firstResult = document.querySelector('#searchGrid .card');
            if (firstResult) firstResult.focus();
            e.preventDefault();
            return;
        }

        if (inInput) return; // let the user type

        // Spatial nav
        if (isArrow) {
            const dir = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[code];
            this._move(dir);
            e.preventDefault();
            return;
        }

        // Enter / OK
        if (this._matches(code, 'ENTER')) {
            const el = document.activeElement;
            if (el && el !== document.body) {
                el.click();
                e.preventDefault();
            }
        }
    },

    _handleBack() {
        // Close modal first
        if (Player && Player.modal && Player.modal.classList.contains('open')) {
            Player.close();
            return true;
        }
        // Close TV detail page
        const detailPage = document.getElementById('detailPage');
        if (detailPage && !detailPage.classList.contains('hidden')) {
            UI.hideDetailPage();
            return true;
        }
        // Close mobile nav
        const mobileNav = document.getElementById('mobileNav');
        if (mobileNav && mobileNav.classList.contains('open')) {
            mobileNav.classList.remove('open');
            return true;
        }
        // Clear search
        const search = document.getElementById('searchInput');
        if (search && search.value) {
            search.value = '';
            UI.setSearchVisible(false);
            return true;
        }
        return false;
    },

    _sendToPlayer(action) {
        if (!Player || !Player.modal || !Player.modal.classList.contains('open')) return;
        // We can't postMessage into a cross-origin iframe reliably, but try anyway.
        const iframe = Player.modalPlayer.querySelector('iframe');
        if (!iframe) return;
        try {
            iframe.contentWindow.postMessage({ action }, '*');
        } catch (_) {}
    },

    _navigateSection(section) {
        const link = document.querySelector(`[data-section="${section}"]`);
        if (link) link.click();
    },

    _focusables() {
        return Array.from(document.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), .card, [data-focusable], [tabindex]:not([tabindex="-1"])'
        )).filter(el => {
            if (el.offsetParent === null && el !== document.activeElement) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
    },

    _move(direction) {
        const current = document.activeElement;
        const candidates = this._focusables();
        if (!candidates.length) return;

        if (!current || current === document.body) {
            candidates[0].focus();
            this._scrollIntoView(candidates[0]);
            return;
        }

        const cr = current.getBoundingClientRect();
        const cx = cr.left + cr.width / 2;
        const cy = cr.top + cr.height / 2;

        let best = null;
        let bestScore = Infinity;

        candidates.forEach(el => {
            if (el === current) return;
            const r = el.getBoundingClientRect();
            const ex = r.left + r.width / 2;
            const ey = r.top + r.height / 2;
            const dx = ex - cx;
            const dy = ey - cy;

            // Direction filter: must be primarily in the requested direction
            let valid = false;
            let primary = 0, secondary = 0;
            switch (direction) {
                case 'left':  valid = r.right  <= cr.left + 2; primary = -dx; secondary = Math.abs(dy); break;
                case 'right': valid = r.left   >= cr.right - 2; primary =  dx; secondary = Math.abs(dy); break;
                case 'up':    valid = r.bottom <= cr.top + 2;   primary = -dy; secondary = Math.abs(dx); break;
                case 'down':  valid = r.top    >= cr.bottom - 2; primary =  dy; secondary = Math.abs(dx); break;
            }
            if (!valid || primary <= 0) return;

            // Score: prefer small primary distance, penalise lateral drift heavily
            const score = primary + secondary * 2;
            if (score < bestScore) {
                bestScore = score;
                best = el;
            }
        });

        if (best) {
            best.focus();
            this._scrollIntoView(best);
        }
    },

    _scrollIntoView(el) {
        // Horizontal scroll inside a row
        const scrollParent = el.closest('.row-scroll');
        if (scrollParent) {
            const r = el.getBoundingClientRect();
            const pr = scrollParent.getBoundingClientRect();
            if (r.left < pr.left + 20) {
                scrollParent.scrollBy({ left: r.left - pr.left - 40, behavior: 'smooth' });
            } else if (r.right > pr.right - 20) {
                scrollParent.scrollBy({ left: r.right - pr.right + 40, behavior: 'smooth' });
            }
        }
        // Vertical scroll
        const r = el.getBoundingClientRect();
        const margin = 100;
        if (r.top < margin) {
            window.scrollBy({ top: r.top - margin, behavior: 'smooth' });
        } else if (r.bottom > window.innerHeight - margin) {
            window.scrollBy({ top: r.bottom - window.innerHeight + margin, behavior: 'smooth' });
        }
    }
};

window.addEventListener('DOMContentLoaded', () => Remote.init());
