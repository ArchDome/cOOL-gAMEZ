# Roadmap and agent routine

This file is the work queue for Claude sessions, including unattended and scheduled ones. Read `CLAUDE.md` first for conventions. Work top to bottom. Check items off as they ship, and log each one in `docs/DESIGN-LOG.md`.

## Owner's objectives

- Fun, chaotic multiplayer party games to play with friends from a link, on PC and iPad.
- Characters with personality: nationalities, entrances, attitudes that show in how they play (inspired by *Sports Champions* and *Rockstar Table Tennis*).
- Physics-driven movement that feels great: grapple, swing, glide.
- Mario Kart energy: map packs, cups, items that mess with the leader, destruction.
- An AI-optimized workflow: scriptable, testable, loopable tooling, open source where possible, and a design log with screenshots.

## How an unattended session works

1. `git pull` on the working branch. Read `CLAUDE.md`, this file, and the latest `docs/DESIGN-LOG.md` entry.
2. Take the first unchecked item. Break it into small steps that can be tested.
3. After each step, run `npm test`. Never publish or push with failing tests.
4. When an item ships:
   - republish the artifact (same URL, with all `files`)
   - run `node tools/screenshots.js` and add an entry to `docs/DESIGN-LOG.md` with screenshots
   - update the Zettelkasten notes
   - commit and push, then check the item off here
5. If something is ambiguous or needs a product decision, take the conservative choice, note it under **Questions for the owner** below, and keep going.
6. Don't create new artifacts for existing games. Don't push to other branches.

## Queue

### Smart bots
- [x] (Done as an anchor list with stepping-anchor choice, not a full graph; revisit with A* if bots plateau.) Navigation graph of grapple anchors (pillar tops, rocks, trees, islets) built at map load. Each edge is "can swing from A to B", verified by simulated swings.
- [x] Swing executor: fire at the next anchor, reel to a target length, release at the right phase for momentum, then chain to the next.
- [x] Bots race for sparks. Each bot has its own spark set, plans a route with A*, and shows its spark count in the players panel.
- [x] Personality on top of skill (partly done: fighting, fleeing and grudges already override racing): Yuki takes risky high routes, Lars takes slow ground routes, Matteo abandons the race to fight, Pip avoids players.
- [x] Training loop: `npm run train-bots` runs headless episodes through `__skyDebug.tick`, evolves the swing parameters per character (fitness: sparks per minute, minus falls), and writes `skyhook-isles/js/bot-params.js`. Re-runnable.

### Maps and cups
- [x] Map select on the start screen, with maps loaded by key and the world rebuilt when switching.
- [x] Map 2: rainy neon city inspired by Hong Kong. Dense towers, signs, wet streets, rooftops to grapple, rain particles.
- [x] Map 3: volcanic island. Lava sea, basalt columns, ash updrafts.
- [x] Map 4: frozen glacier. Ice spires, slippery ground, aurora sky.
- [x] Map 5: junkyard canyon. Cranes, stacked cars, magnet anchors.
- [x] Cups: a map pack of 3 maps, points per map by finishing order, best total wins. Podium screen.
- [x] Leaderboards with arcade-style initials per map and per cup, using the artifact `db` capability so friends see the same board.

### Next ideas (unattended sessions may pick these up)
- [x] Synced multiplayer cups: the player who starts a cup broadcasts it, friends follow map switches, and the host's points table is authoritative.
- [ ] Per-character training runs for the weakest racers (`npm run train-bots -- 10 8 40 kofi`, then pip), on a repo copy.
- [x] Bots that use the glider (they can grab pickups but never glide).
- [x] A sixth map so Map Pack 2 doesn't reuse Neon Harbour. (Jungle Ruins)

### Later
- [x] Character select (the player picks a cast member; bots fill the rest) plus a Doom-style reacting face in the HUD.
- [x] Mario Kart items: a leader hunter (blue-shell equivalent), bombs, and destructible buildings.
- [x] Bots use items too (grab boxes, throw bombs at nearby players, fire comets when behind).
- [x] Graphics push: bloom, better water, rain, and a quality setting tuned for iPad.
- [ ] More graphics: volumetric-looking light shafts, soft clouds, screen-space ambient occlusion at High, better character models.
- [ ] Owner's recorded announcer clips (`npm run voice`), when the owner sends them.

## Questions for the owner

(Unattended sessions add questions here instead of stopping.)

- Leaderboard posting needs friends to be **Contributors** in the Share menu (viewers can read but not post). OK as is?
- Cups are now synced: whoever starts a cup hosts it and friends follow. If you'd rather keep cups solo, it's a one-line change.
- ~~Map Pack 2 reuses Neon Harbour~~: added a sixth map, Jungle Ruins, instead.
