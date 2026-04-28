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

        // Capture-phase keydown so we beat any inner handler.
        document.addEventListener('keydown', (e) => this._onKey(e), true);

        // Mouse handling: on detected TVs, neutralise hover-induced focus
        // changes so the system pointer overlay can't steal focus from the
        // keyboard-driven element.
        if (this.detected) {
            this._installMouseSuppression();
        } else {
            // Desktop: arrow-key auto-enable, mouse auto-disable.
            let lastMouse = { x: 0, y: 0, t: 0 };
            document.addEventListener('mousemove', (e) => {
                const dx = Math.abs(e.clientX - lastMouse.x);
                const dy = Math.abs(e.clientY - lastMouse.y);
                const dt = Date.now() - lastMouse.t;
                lastMouse = { x: e.clientX, y: e.clientY, t: Date.now() };
                if (dx + dy > 4 && dt < 1500) this.disable();
            });
        }

        this._registerVidaaKeys();
        this._maybeShowPointerHint();
    },

    forceTV() {
        this.detected = true;
        this.enable();
        this._installMouseSuppression();
    },

    _installMouseSuppression() {
        if (this._mouseSuppressed) return;
        this._mouseSuppressed = true;

        // Ignore hover-induced focus on cards/episodes/buttons. We let click-to-play
        // still work (VIDAA pointer can click), but `mouseenter` will not refocus.
        const stop = (e) => {
            // Allow within the player iframe & search input
            if (e.target.closest && e.target.closest('input, iframe, .modal-player')) return;
            // Don't preventDefault on mouseup — that would break clicks. Just
            // make sure mouseover doesn't move focus.
            if (e.type === 'mouseover' || e.type === 'mouseenter') {
                // No-op; native mouseover doesn't move focus by default, but
                // some focus-on-hover patterns might. We leave click behaviour intact.
                return;
            }
        };
        document.addEventListener('mouseover', stop, true);
        document.addEventListener('mouseenter', stop, true);

        // Block focus() being called from a mousemove handler by recording
        // the time of the last keyboard event and ignoring focus changes
        // initiated within 200ms of mouse motion if no key was pressed.
        document.addEventListener('keydown', () => { this._lastKeyT = Date.now(); }, true);
    },

    forceTV() {
        this.detected = true;
        this.enable();
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
        if (document.activeElement && document.activeElement !== document.body) {
            this._kbAnchor = document.activeElement;
            return;
        }
        const first = document.querySelector('.btn, .card, [data-focusable]');
        if (first) {
            first.focus();
            this._kbAnchor = first;
        }
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
        // Anchor: prefer our last keyboard-driven focus over whatever the pointer
        // hovered onto. If the anchor is gone from the DOM, fall back to
        // document.activeElement.
        let current = this._kbAnchor && document.body.contains(this._kbAnchor)
            ? this._kbAnchor
            : document.activeElement;
        if (!current || current === document.body) current = document.activeElement;
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
            this._kbAnchor = best;
            this._scrollIntoView(best);
        }
    },

    _scrollIntoView(el) {
        // Horizontal scroll inside a row carousel — keep focused card centred-ish.
        const scrollParent = el.closest('.row-scroll');
        if (scrollParent) {
            const r = el.getBoundingClientRect();
            const pr = scrollParent.getBoundingClientRect();
            const margin = 80;
            if (r.left < pr.left + margin) {
                scrollParent.scrollBy({ left: r.left - pr.left - margin, behavior: 'smooth' });
            } else if (r.right > pr.right - margin) {
                scrollParent.scrollBy({ left: r.right - pr.right + margin, behavior: 'smooth' });
            }
        }

        // Vertical scroll — keep focus comfortably in viewport
        const r = el.getBoundingClientRect();
        const topMargin = 120;
        const bottomMargin = 140;
        if (r.top < topMargin) {
            window.scrollBy({ top: r.top - topMargin, behavior: 'smooth' });
        } else if (r.bottom > window.innerHeight - bottomMargin) {
            window.scrollBy({ top: r.bottom - window.innerHeight + bottomMargin, behavior: 'smooth' });
        }

        // Vertical scroll inside the detail page (it's its own scroll container)
        const detailPage = document.getElementById('detailPage');
        if (detailPage && detailPage.contains(el) && !detailPage.classList.contains('hidden')) {
            const dr = detailPage.getBoundingClientRect();
            if (r.top < dr.top + topMargin) {
                detailPage.scrollBy({ top: r.top - dr.top - topMargin, behavior: 'smooth' });
            } else if (r.bottom > dr.bottom - bottomMargin) {
                detailPage.scrollBy({ top: r.bottom - dr.bottom + bottomMargin, behavior: 'smooth' });
            }
        }
    },

    _maybeShowPointerHint() {
        if (!this.detected) return;
        try {
            if (localStorage.getItem('strem_tv_hint_seen')) return;
        } catch (_) {}

        const hint = document.createElement('div');
        hint.className = 'tv-hint';
        hint.innerHTML = `
            <div class="tv-hint-card">
                <div class="tv-hint-title">Welcome &mdash; using a remote?</div>
                <p>If a pointer is showing on screen, press <strong>OK</strong> on your remote (the centre button) to switch out of pointer mode. Then use the arrow keys and OK to navigate.</p>
                <button class="btn btn-primary" id="tvHintDismiss">Got it</button>
            </div>
        `;
        document.body.appendChild(hint);
        const dismiss = () => {
            try { localStorage.setItem('strem_tv_hint_seen', '1'); } catch (_) {}
            hint.remove();
            document.removeEventListener('keydown', onKey, true);
        };
        const onKey = (e) => {
            if ([13, 27, 8, 10009, 461, 166].indexOf(e.keyCode) !== -1) {
                dismiss();
                e.preventDefault();
                e.stopPropagation();
            }
        };
        hint.querySelector('#tvHintDismiss').addEventListener('click', dismiss);
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => {
            const btn = hint.querySelector('#tvHintDismiss');
            if (btn) btn.focus();
        }, 50);
    }
};

window.addEventListener('DOMContentLoaded', () => Remote.init());
