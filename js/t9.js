/**
 * Multi-tap (T9) input for the search field, used when the user is driving
 * the page with a TV remote in pointer-disabled mode. Same scheme as a phone
 * keypad: tap 2 once for "a", twice for "b", three times for "c", four for "2",
 * then it cycles. A short timeout commits the current letter so the next tap
 * starts a new character. 0 inserts a space, 1 cycles through punctuation.
 *
 * Active only when:
 *   - Remote.enabled is true (TV mode)
 *   - The search input is focused
 *   - The pressed digit isn't being used for spatial-nav (which only happens
 *     when an input ISN'T focused, so this is automatically the case here).
 */
const T9 = {
    MAP: {
        49: ['1', '.', ',', '?', '!', "'", '-'],   // top-row 1
        50: ['a', 'b', 'c', '2'],                  // 2
        51: ['d', 'e', 'f', '3'],                  // 3
        52: ['g', 'h', 'i', '4'],                  // 4
        53: ['j', 'k', 'l', '5'],                  // 5
        54: ['m', 'n', 'o', '6'],                  // 6
        55: ['p', 'q', 'r', 's', '7'],             // 7
        56: ['t', 'u', 'v', '8'],                  // 8
        57: ['w', 'x', 'y', 'z', '9'],             // 9
        48: [' ', '0']                             // 0
    },
    // Numpad mirrors
    NUMPAD: { 97:49, 98:50, 99:51, 100:52, 101:53, 102:54, 103:55, 104:56, 105:57, 96:48 },

    COMMIT_MS: 900,

    activeKey: null,
    cycleIndex: 0,
    pendingChar: '',
    commitTimer: null,
    input: null,

    init() {
        this.input = document.getElementById('searchInput');
        if (!this.input) return;

        const searchBox = this.input.parentElement;
        if (searchBox) {
            this.indicator = document.createElement('div');
            this.indicator.className = 't9-indicator';
            this.indicator.style.display = 'none';
            searchBox.appendChild(this.indicator);
        }

        // Capture phase so we beat Remote's input-passthrough handler.
        document.addEventListener('keydown', (e) => this._onKey(e), true);

        // Commit on blur or when other keys arrive
        this.input.addEventListener('blur', () => this._commit());
    },

    _shouldHandle(e) {
        if (!window.Remote || !Remote.enabled) return false;
        if (document.activeElement !== this.input) return false;
        // Modifier keys → fall through (let copy/paste etc work)
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        let code = e.keyCode || e.which;
        if (this.NUMPAD[code]) code = this.NUMPAD[code];
        return code in this.MAP;
    },

    _onKey(e) {
        if (!this._shouldHandle(e)) {
            // Different key while we have a pending char: commit it first
            if (this.pendingChar) this._commit();
            return;
        }
        e.preventDefault();
        e.stopPropagation();

        let code = e.keyCode || e.which;
        if (this.NUMPAD[code]) code = this.NUMPAD[code];
        const cycle = this.MAP[code];

        if (this.activeKey === code && this.pendingChar) {
            // Continuing on the same key: replace the pending char with the next in cycle
            this.cycleIndex = (this.cycleIndex + 1) % cycle.length;
            this._replacePending(cycle[this.cycleIndex]);
        } else {
            // New key: commit prior pending char, start a fresh cycle
            this._commit();
            this.activeKey = code;
            this.cycleIndex = 0;
            this._insertPending(cycle[0]);
        }
        this._showIndicator(cycle, this.cycleIndex);

        // Re-arm commit timer
        if (this.commitTimer) clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => this._commit(), this.COMMIT_MS);
    },

    _insertPending(ch) {
        const v = this.input.value;
        const start = this.input.selectionStart ?? v.length;
        const end = this.input.selectionEnd ?? v.length;
        this.input.value = v.slice(0, start) + ch + v.slice(end);
        const caret = start + ch.length;
        this.input.setSelectionRange(caret, caret);
        this.pendingChar = ch;
        this._fireInput();
    },

    _replacePending(ch) {
        const v = this.input.value;
        const caret = this.input.selectionStart ?? v.length;
        // The pending char sits immediately before the caret.
        const newVal = v.slice(0, caret - this.pendingChar.length) + ch + v.slice(caret);
        this.input.value = newVal;
        const newCaret = caret - this.pendingChar.length + ch.length;
        this.input.setSelectionRange(newCaret, newCaret);
        this.pendingChar = ch;
        this._fireInput();
    },

    _commit() {
        if (this.commitTimer) { clearTimeout(this.commitTimer); this.commitTimer = null; }
        this.activeKey = null;
        this.cycleIndex = 0;
        this.pendingChar = '';
        this._hideIndicator();
    },

    _showIndicator(cycle, idx) {
        if (!this.indicator) return;
        const html = cycle.map((c, i) =>
            i === idx ? `<span class="t9-active">${c === ' ' ? '␣' : c}</span>` : (c === ' ' ? '␣' : c)
        ).join(' ');
        this.indicator.innerHTML = `<strong>T9</strong><span class="t9-cycle">${html}</span>`;
        this.indicator.style.display = 'block';
    },

    _hideIndicator() {
        if (this.indicator) this.indicator.style.display = 'none';
    },

    _fireInput() {
        // Trigger the existing debounced search listener
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
};

window.addEventListener('DOMContentLoaded', () => T9.init());
