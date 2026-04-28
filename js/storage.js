/**
 * Watched tracking via localStorage
 */
const STORAGE_KEY = 'strem_watched';

const Storage = {
    getAll() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    },

    save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    add(id, meta = {}) {
        const data = this.getAll();
        data[String(id)] = {
            watchedAt: Date.now(),
            ...meta
        };
        this.save(data);
    },

    remove(id) {
        const data = this.getAll();
        delete data[String(id)];
        this.save(data);
    },

    isWatched(id) {
        return String(id) in this.getAll();
    },

    toggle(id, meta = {}) {
        if (this.isWatched(id)) {
            this.remove(id);
            return false;
        } else {
            this.add(id, meta);
            return true;
        }
    },

    getWatchedIds() {
        return Object.keys(this.getAll()).map(Number);
    },

    clear() {
        localStorage.removeItem(STORAGE_KEY);
    }
};

