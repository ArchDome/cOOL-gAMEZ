# Roadmap and agent routine

This file is the work queue for Claude sessions, including unattended and scheduled ones. Read `CLAUDE.md` first for conventions. Work top to bottom. Check items off as they ship, and log each one in `docs/DESIGN-LOG.md`.

## Owner's objectives

- Fun, chaotic multiplayer party games to play with friends from a link, on PC and iPad.
- Characters with personality: nationalities, entrances, attitudes that show in how they play (inspired by *Sports Champions* and *Rockstar Table Tennis*).
- Physics-driven movement that feels great: grapple, swing, glide.
- Mario Kart energy: map packs, cups, items that mess with the leader, destruction.
- An AI-optimized workflow: scriptable, testable, loopable tooling, open source where possible, and a design log with screenshots.

## How an unattended session works

1. `git pull` on the working branch. Read `CLAUDE.md`, `docs/DESIGN-PRINCIPLES.md`, this file, and the latest `docs/DESIGN-LOG.md` entry.
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
- [x] Per-character training runs for the weakest racers (`npm run train-bots -- 10 8 40 kofi`, then pip), on a repo copy.
- [x] Bots that use the glider (they can grab pickups but never glide).
- [x] A sixth map so Map Pack 2 doesn't reuse Neon Harbour. (Jungle Ruins)

### Owner's batch, 2026-11-14 (see docs/DESIGN-PRINCIPLES.md)
- [x] Water splash on falling in, then a 10 s death cam to admire it (Space or tap to respawn now).
- [x] Ground punch: swing the bat or shove at the ground while falling to bounce back up. The bat bounces higher.
- [x] A scarier bat: much bigger knockback.
- [x] Breakable walls: let players smash through walls and buildings (bat at speed, bombs).
- [x] HUD standings: clear live ranking (who leads, who's close behind, gap in sparks).
- [x] Stats per player: sparks, kills, deaths, falls, bat hits, air time, top speed. Show them in results.
- [x] Custom awards at the end of a cup (Speed Demon, Menace, Survivor, Troll, Most Dramatic Death...).
- [x] Final spark: when someone has all normal sparks, a big spark spawns with dramatic music and a light beam. Bonus points. It spawns closer to whoever finished first.
- [x] Map traps players can trigger (all six maps): junkyard magnet (sticks players for a while), volcano idol (grapple it, throw it in the crater, the volcano erupts), plus one per map, inspired by death-run traps.
- [x] Throwable props: grapple an item, pull it close, throw it at people.
- [x] Sumo deathmatch mode: knock players into the void. Points for knockoffs, item throws.
- [x] Sniper rifle item: charge it by spinning 360°, the gun glows while charged (limited time), and the shot has huge knockback.
- [x] Mobile: detect the input method and switch the UI (hide keyboard hints like "T to restart", a compact HUD on small screens).
- [x] Mobile aiming: sensitivity setting, gyroscope aim (toggle), aim assist that snaps the crosshair to nearby hook points (strength setting).
- [x] Simplified touch controls option: the camera follows behind the player, tap where to grapple and it reels automatically.
- [x] Settings panel: every option above is configurable and saved per device.

### Owner's batch 2, 2026-11-14
- [x] Custom game: pick which maps go in (any order), and adjust the rules: number of maps, mode per game (race or sumo), round time, sumo KO target, bots, items on/off, death cam. Saved, and synced to friends like cups.
- [x] Sumo arenas: unique maps for sumo. Narrow platforms where everyone is a few hits from the edge.
- [x] Bot tactics: no endless shoving matches. Switch targets when a fight isn't working, bait near the edge then sidestep and push.
- [x] Hook reel-in: an option to pull players and objects toward you with the hook.

### Later
- [x] Character select (the player picks a cast member; bots fill the rest) plus a Doom-style reacting face in the HUD.
- [x] Mario Kart items: a leader hunter (blue-shell equivalent), bombs, and destructible buildings.
- [x] Bots use items too (grab boxes, throw bombs at nearby players, fire comets when behind).
- [x] Graphics push: bloom, better water, rain, and a quality setting tuned for iPad.
- [x] Screen-space ambient occlusion at High (GTAO).
- [x] Light shafts and softer clouds (High).
- [x] Better character models (more detailed bodies, faces and outfits per cast member).
- [ ] Owner's recorded announcer clips (`npm run voice`), when the owner sends them.

## Questions for the owner

(Unattended sessions add questions here instead of stopping.)

- Leaderboard posting needs friends to be **Contributors** in the Share menu (viewers can read but not post). OK as is?
- Cups are now synced: whoever starts a cup hosts it and friends follow. If you'd rather keep cups solo, it's a one-line change.
- ~~Map Pack 2 reuses Neon Harbour~~: added a sixth map, Jungle Ruins, instead.
