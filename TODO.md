# Streaming Service Clone - TODO

## Plan
Build a single-page streaming service clone using TMDB API for metadata and vsembed.ru for playback. Tracks watched content locally and offers a diverse frontpage with fresh content, while watched items remain visible but less prominent.

## Steps
- [x] Create TODO.md
- [x] Create index.html - App shell with header, hero banner, content rows, video modal
- [x] Create css/style.css - Dark theme responsive layout, card grid, watched dimming
- [x] Create js/config.js - TMDB API endpoints, vsembed URL, constants (placeholder API key)
- [x] Create js/storage.js - localStorage wrapper for watched tracking
- [x] Create js/api.js - TMDB fetch layer with freshness scoring
- [x] Create js/ui.js - Renderers for hero, rows, cards, skeleton loaders
- [x] Create js/player.js - vsembed.ru iframe integration
- [x] Create js/app.js - Orchestration, diverse frontpage algorithm, search
- [ ] Test by opening index.html in browser

## Notes
- TMDB API key placeholder left in js/config.js for user to fill in
- No build step required - open index.html directly

