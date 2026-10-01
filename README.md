# Impossible Harbour

An Escher-style isometric waterway loop built in Three.js, used as a personal site for [Lucy Lu](https://www.lulucy.org). Live at [lucylu.org](https://lucylu.org).

The homepage (`index.html`) sets the loop on a harbour pier over open water: a planar-reflection sea with boat wakes and rain rings, weathered concrete and rusted steel, and Sunrise / Dusk / Rain / Night lighting. The original version is kept at `waterway.html`. The canal climbs all the way round and still ends up back where it started. The illusion only closes at the true isometric angle (35.26° up, 45° round). When you drag the view, the arms re-proportion so the loop keeps closing.

A boat rides the loop, tips over a sluice gate at the top of the waterfall, and comes back around. Each section of the site glides the camera to its own angle or close-up.

## Sections

1. **Hello:** 3D animation work on Beat Bugs (Netflix) and Little Charmers (Nick Jr., Treehouse TV)
2. **Games & Apps:** Lunescape, Starbreaker, Math Gym, 3D Periodic Table, Neuralens
3. **Writing:** recent posts from lulucy.org
4. **Math:** *On the Prime Pairs*, with Suqin Ao
5. **Contact:** email, GitHub, YouTube, X, Instagram

## Controls

| Input | Action |
| --- | --- |
| Drag | Turn the view (the loop keeps closing) |
| Scroll | Zoom |
| `←` / `→`, `1`–`5` | Move between sections |
| `F` or `Space` | Toggle first-person ride |
| Sunrise / Dusk / Rain / Night | Time of day |
| Still / Ride / First person | Camera mode |
| ⌖ True angle | Snap back to the isometric angle |

## Running locally

Each page is a single HTML file that loads Three.js from a CDN via an import map. It needs to be served over HTTP, not opened as a file:

```sh
python -m http.server 8765
# then open http://localhost:8765/
```

On Windows, `launch-waterway.bat` starts that server if it isn't already running and opens the page in a normal Chrome window, so DevTools are available. `setup-desktop-shortcut.ps1` builds `waterway.ico` from `waterway-icon.png` and puts an **Impossible Waterway** shortcut on the Desktop that runs the launcher.

## Sound

The **Sound** button (off by default, remembered per device) loads the recordings in `audio/` and plays:

- **Beds**, each looped with a crossfade: the sea's waves, the waterfall (louder in close-ups and near it in first person), and a time-of-day layer: morning birds at Sunrise, an afternoon bed at Dusk, a night bed at Night. Rain is synthesized.
- **Interface sounds:** a tick on the time and camera buttons, water drops on taps and links, a swoosh between sections, bubbles when sound turns on.
- **Events:** a splash when the paper boat lands, occasional synthesized gulls (not at night), and everything muffled while the rider is underwater.

`audio/` holds trimmed, loudness-matched web copies of the originals in `Ambient_and_SFX/`, which is kept out of git.

## Hosting

The site is served by GitHub Pages from the root of `main`. `CNAME` holds the custom domain and `.nojekyll` turns off Jekyll processing.

## Making it yours

All of the site's text lives in the `SITE` block near the top of the script in `index.html`: your name, a role line, and a list of chapters. Each chapter has a `title`, a `body`, some `links`, and a camera `view`:

- `yaw` / `pitch`: offset from the true angle in radians. The loop stays closed within about ±0.5 yaw and −0.3 to 0.7 pitch.
- `zoom`: `1` shows the whole loop.
- `focus`: `'loop'`, `'lookout'`, `'fisher'` or `'rider'`.
