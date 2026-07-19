# Genshin Wish Calculator

A browser-based planning tool for Genshin Impact's wish system — plan your pulls across upcoming patches and see how your saved-up primogems/starglitter/wishes hold up under best, worst, and mixed-luck scenarios.

No build step, no backend — static HTML/CSS/JS.

## Running locally

```bash
python -m http.server 8000
# or
npx http-server -p 8000
```

Then open `http://localhost:8000`.

## Features

- Priority-ordered pull planning (Hard Lock / One Shot / Optional targets)
- Patch-by-patch income modeling (average or custom per-patch income, Welkin/Battle Pass)
- Best / Worst / mixed-outcome scenario breakdowns with pity, guarantee, and Capture Radiance handling
- Save/export/import your plan as JSON
- PNG export of the scenario summary
- Mobile-friendly layout

## Credits

* [Ambr.top](https://ambr.top/) — character, weapon, and banner data
* [Ennead.cc](https://ennead.cc/) — event calendar data
* [Hashblen](https://hashblen.com/) — redeem code data
* [Genshin Impact Wiki (Fandom) — Wish](https://genshin-impact.fandom.com/wiki/Wish) for wish system mechanics reference

This is an unofficial, fan-made tool. Genshin Impact is a trademark of HoYoverse/miHoYo.

## Notes

- State persists in `localStorage`; use Export/Import to back up or move a plan between devices.
- PNG export uses `html2canvas`, loaded on demand, with an iOS-friendly share-sheet fallback.
