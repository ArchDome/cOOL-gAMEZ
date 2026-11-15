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

### Owner's batch 3, 2026-11-14
- [x] Bot difficulty: 4 levels (Easy, Normal, Hard, Brutal) in settings, synced for whoever runs the bots.
- [x] Spin sniper kills on hit: instant knock-out, credited to the shooter.
- [x] Mobile: a pause button, and the face HUD at the bottom middle.
- [x] Neon Harbour: tower cranes to swing on.

### Owner's batch 4, 2026-11-14
- [x] Mobile swinging: tap to hook, up to two hooks at once, swipe down to pull yourself in, swipe up to let go; the camera stays behind you. Default touch scheme.
- [x] Leaderboard you can open mid-game (key and touch button).
- [x] Medals (gold, silver, bronze) above the top 3 players' heads.
- [x] Mega power-up: a cruise missile that spawns every few minutes and makes a fuss (beam, siren, announcer).
- [x] Bigger explosions: a real blast effect, and ragdoll tumbling that launches you farther.

### Owner's batch 5, 2026-11-15
- [x] Touch: taps on the left half fire hooks (the joystick only starts when you drag), plus a Joystick on/off setting.
- [x] Data pass: every gameplay number in one data file (`js/tuning.js`) so a future port (e.g. Godot) can reuse the tuning.

### Owner's batch 6, 2026-11-15
- [x] Racing map: long and narrow, built for speed (downhill track, speed strips, swing arches, gaps), sparks in course order; camera FOV widens with speed.

### Owner's batch 7, 2026-11-15
- [x] Glider dive (Arkham-style): hold to dive steeply and build speed, release to pull up and convert speed into height; dive into someone to slam them.
- [x] Character select screen: portraits; picking one plays their catchphrase with an animation.
- [x] Tightrope: with two hooks attached and both reeled in, the ropes merge into a tight rope between the anchors. Walk on it, others can jump on and shove you off, and you can hook and pull someone up. It vanishes after 10 s with nobody on it. Synced to friends.
- [x] Master volume slider.

### Owner's batch 8, 2026-11-15
- [x] Pinch to zoom the camera on touch.
- [x] Scrap the Sky Speedway map (too narrow).
- [x] Physics: much less speed from grapple releases (rope correction energy, reel speed, jump-off boost), air drag at high speed, lower cap. Tunable.
- [x] A race map with many floating grapple points spread well apart.
- [x] Race mode: big gates to fly through instead of small sparks.

### Owner's batch 9, 2026-11-15
- [x] Tightrope: grapple straight onto it and climb on.
- [x] Pulling doesn't lock you: while pulling someone or something, your footing stays on (stay on the tightrope, keep walking).

### Owner's batch 10, 2026-11-15
- [x] Look further up and down (wider camera pitch).
- [x] Dive: straight down by default, movement input tilts the dive angle; a proper dive pose and trail; a dive-bomb impact effect.

### Owner's batch 11, 2026-11-15
- [x] PC: two hooks at once actually works with both mouse buttons held (chorded button presses).
- [x] Bombs: grapple them, pull, throw or bat them back; longer fuse; colour countdown (green, yellow, red, blinking faster).

- [x] Glider lasts 60 s.

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
