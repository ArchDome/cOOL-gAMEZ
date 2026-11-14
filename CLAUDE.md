# cOOL-gAMEZ

Browser games, one folder per game. Each game is a single self-contained `index.html` that is also published as a claude.ai artifact so friends can play from a link.

## Games

| Folder | Artifact (play link) | Notes |
| --- | --- | --- |
| `roquet-royale/` | https://claude.ai/artifact/STGnGiFPmcQWjn5R3fE2v2 | 2D canvas, real-time multiplayer via the artifact `room` capability |
| `skyhook-isles/` | https://claude.ai/artifact/UyJ73agkVdwAh8vXyqM3wp | 3D, Three.js 0.160 + cannon-es 0.20 from jsDelivr. Multiplayer via `room`, with client-side physics and shared poses |

When you change a game, republish to its existing artifact URL (pass the URL, or publish the same file path in the same session). Never create a second artifact for an existing game. Republishing reloads every open view, which drops players out of a live match, so say so when you ship an update.

## Workflow for a new game

1. Create `<game-name>/index.html` and `<game-name>/README.md` (pitch, controls, modes, how it works).
2. Add the game to the list in the root `README.md` and to the table above.
3. Publish it as an artifact and record the URL in both READMEs and here.
4. Log the game and any new mechanics in the Zettelkasten vault (see below).

## Conventions

- **File layout.** Small games are one `index.html`. `skyhook-isles` is split: `index.html` (page and HUD), `js/main.js` (engine), `js/lib.js`, and `js/bot-params.js` (trained bot settings), and `maps/*.js` (one per map, listed in `maps/index.js` along with the cups). Publish it with the Artifact tool's `files` option for every `js/` and `maps/` file. Otherwise, inline CSS and JS. External scripts only from the artifact CDN allowlist (cdnjs, cdn.jsdelivr.net/npm, unpkg), pinned to exact versions. Fonts only from Google Fonts.
- **Artifact page rules.** No `<html>`, `<head>` or `<body>` tags: the page starts with `<title>`, then `<style>`. Include `[hidden]{display:none!important}` yourself, because local test runs don't get the artifact skeleton's reset.
- **Phones and tablets.** The owner plays on an iPad, so every game needs touch controls (on-screen buttons, thumb drag) alongside keyboard and mouse.
- **Physics timing.** Run physics at a fixed step. Render from interpolated poses (`body.interpolatedPosition` in cannon-es), not the raw ones, or motion jitters on high-refresh screens.
- **Character on the ground.** Don't let the player's collision sphere roll over terrain triangles; it bounces. `skyhook-isles` uses a hover controller: each step it reads the ground height (`Heightfield.getHeightAt` plus a downward ray against other bodies) and springs the body to a fixed ride height. Face the input direction on the ground, not the velocity.
- **Multiplayer** (see `roquet-royale/`): the host's browser runs the simulation and shares a snapshot via room `presence` about 20 times a second. Clients send numbered inputs in their own presence and the host applies each number once. Presence works for every viewer, while event topics are admin-only by default, which is why presence is used. Keep each presence object under 4 KiB.
- **UI that updates often.** Don't rebuild DOM with buttons on every network update, because rebuilds swallow clicks. Re-render only when what's shown changes.
- **Bots.** Tune bot difficulty against an idle human, so rounds don't end before a person can act.

## Testing

**Run `npm test` after every change to a game, and fix failures before publishing.** It runs `test-skyhook.js` and `test-maps.js` (every map plus the cup flow). For bot AI changes, also run `npm run bench-bots` (reproducible per-character spark counts) and keep or improve the total. `npm run train-bots [gens] [pop] [seconds] [character]` re-tunes `js/bot-params.js`. Run training on a **copy** of the repo (copy `skyhook-isles`, `tools` and `package.json` to a scratch folder and run it there) so you can keep working, then merge the winning set into the real `bot-params.js`, bench, test and publish. Evaluations are exactly reproducible (headless start, seeded randomness, simulation-only timers, full per-bot reset). Keep them that way: anything gameplay-relevant must advance only with simulation steps, never wall-clock time. The harness lives in `tools/` (see `tools/README.md`). New games should get their own `tools/test-<game>.js` built on `tools/harness.js`.


- Check scripts parse: extract the `<script>` body and run `node --check`, or for module scripts write it to a `.mjs` file first.
- Tests run at Low graphics: the harness sets `skyhook.gfx=low` because bloom is too slow in the software renderer. Pass `gfx: 'high'` to `openGame` for a quality check. `index.html` has an import map for `three` and `three/addons/` (post-processing); the harness serves those from the local npm copy.
- Run gameplay in headless Chromium with Playwright. Use `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL. It renders slowly, so don't judge frame rate from it.
- **The cloud sandbox blocks cdn.jsdelivr.net**, but npm is reachable. Run `npm pack three@0.160.0 cannon-es@0.20.0` in a scratch folder, unpack, and use Playwright `page.route()` to serve the CDN URLs from those local files. The published page still loads from the CDN.
- **Tests must wait for outcomes, not fixed delays.** The software renderer can take over a second per frame under load. Use `page.waitForFunction(() => <expected state>)` with a generous timeout rather than `waitForTimeout(…)` before checking.
- `skyhook-isles` exposes `window.__skyDebug` for automated tests: player body, pillars, sparks, glider pickups, hook and ground state, a view setter, a `keys` set, and `tick(n)`, which steps controls and physics exactly n frames of 1/60 s. Use `tick` for physics measurements, because headless rendering is too slow for real-time timing.
- The artifact `room` capability doesn't exist in local test runs. To test multiplayer logic, inject a fake `window.claude.use("room")` with Playwright `addInitScript` (implement `presence`, `peers`, `onPeers`, `onConnection` and `connected`, with a scripted fake friend). That still doesn't prove real two-device play, so say so when reporting results.

## Design log

Keep `docs/DESIGN-LOG.md` up to date: add a dated entry for every meaningful change, newest first, with screenshots in `docs/img/`. `node tools/screenshots.js` regenerates the Skyhook shots. Extend it when you add a map or feature worth showing.

## Audio

- Sound effects and music are synthesized with Web Audio, so there are no audio files to ship. Music must be original. Don't recreate or imitate a specific copyrighted song.
- **Announcer clips:** the owner's recordings go in `tools/voice/raw/<key>.<ext>`. `npm run voice` (ffmpeg) bass-boosts them into `skyhook-isles/voice/`. Publish those files with the artifact via the Artifact tool's `files` option. Line keys are in `tools/voice/LINES.md`.

## Workflow preferences

- The owner wants an AI-optimized workflow. Prefer scriptable, loopable tools (CLI, Node scripts, ffmpeg) with pass/fail exit codes, and tell the owner when something can be run in a loop.
- When the owner needs software, suggest open-source options first.

## Zettelkasten

Game ideas and mechanics live in the separate `Zettelkasten` repo, an Obsidian vault:

- `20 Maps/Game Design MOC.md` is the hub. Every game and mechanic is linked from it.
- `30 Projects/<Game>.md` has one note per game: play link, code folder, mechanics used, lessons.
- `10 Notes/<Mechanic>.md` has one mechanic or idea per note, with frontmatter `type`, `status` (`idea`, `prototype`, `shipped`, `tabled`), `tags`, `created`.
- Use `[[wikilinks]]` with exact note titles, and keep every link resolving to a real note.

When a game ships a new mechanic or the owner shares an idea, add or update the note and link it into the MOC.
