# cOOL-gAMEZ

Browser games, one folder per game. Each game is a single self-contained `index.html` that is also published as a claude.ai artifact so friends can play from a link.

## Games

| Folder | Artifact (play link) | Notes |
| --- | --- | --- |
| `roquet-royale/` | https://claude.ai/artifact/STGnGiFPmcQWjn5R3fE2v2 | 2D canvas, real-time multiplayer via the artifact `room` capability |
| `skyhook-isles/` | https://claude.ai/artifact/UyJ73agkVdwAh8vXyqM3wp | 3D, Three.js 0.160 + cannon-es 0.20 from jsDelivr |

When you change a game, republish to its existing artifact URL (pass the URL, or publish the same file path in the same session). Never create a second artifact for an existing game. Republishing reloads every open view, which drops players out of a live match, so say so when you ship an update.

## Workflow for a new game

1. Create `<game-name>/index.html` and `<game-name>/README.md` (pitch, controls, modes, how it works).
2. Add the game to the list in the root `README.md` and to the table above.
3. Publish it as an artifact and record the URL in both READMEs and here.
4. Log the game and any new mechanics in the Zettelkasten vault (see below).

## Conventions

- **One file per game.** Inline all CSS and JS. External scripts only from the artifact CDN allowlist (cdnjs, cdn.jsdelivr.net/npm, unpkg), pinned to exact versions. Fonts only from Google Fonts.
- **Artifact page rules.** No `<html>`, `<head>` or `<body>` tags: the page starts with `<title>`, then `<style>`. Include `[hidden]{display:none!important}` yourself, because local test runs don't get the artifact skeleton's reset.
- **Phones and tablets.** The owner plays on an iPad, so every game needs touch controls (on-screen buttons, thumb drag) alongside keyboard and mouse.
- **Physics timing.** Run physics at a fixed step. Render from interpolated poses (`body.interpolatedPosition` in cannon-es), not the raw ones, or motion jitters on high-refresh screens.
- **Multiplayer** (see `roquet-royale/`): the host's browser runs the simulation and shares a snapshot via room `presence` about 20 times a second. Clients send numbered inputs in their own presence and the host applies each number once. Presence works for every viewer, while event topics are admin-only by default, which is why presence is used. Keep each presence object under 4 KiB.
- **UI that updates often.** Don't rebuild DOM with buttons on every network update, because rebuilds swallow clicks. Re-render only when what's shown changes.
- **Bots.** Tune bot difficulty against an idle human, so rounds don't end before a person can act.

## Testing

- Check scripts parse: extract the `<script>` body and run `node --check`, or for module scripts write it to a `.mjs` file first.
- Run gameplay in headless Chromium with Playwright. Use `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL. It renders slowly, so don't judge frame rate from it.
- **The cloud sandbox blocks cdn.jsdelivr.net**, but npm is reachable. Run `npm pack three@0.160.0 cannon-es@0.20.0` in a scratch folder, unpack, and use Playwright `page.route()` to serve the CDN URLs from those local files. The published page still loads from the CDN.
- `skyhook-isles` exposes `window.__skyDebug` (player body, pillars, aim and hook state, view setter) for automated tests.
- The artifact `room` capability doesn't exist in local test runs, so multiplayer can't be tested here. Say so when reporting results.

## Zettelkasten

Game ideas and mechanics live in the separate `Zettelkasten` repo, an Obsidian vault:

- `20 Maps/Game Design MOC.md` is the hub. Every game and mechanic is linked from it.
- `30 Projects/<Game>.md` has one note per game: play link, code folder, mechanics used, lessons.
- `10 Notes/<Mechanic>.md` has one mechanic or idea per note, with frontmatter `type`, `status` (`idea`, `prototype`, `shipped`, `tabled`), `tags`, `created`.
- Use `[[wikilinks]]` with exact note titles, and keep every link resolving to a real note.

When a game ships a new mechanic or the owner shares an idea, add or update the note and link it into the MOC.
