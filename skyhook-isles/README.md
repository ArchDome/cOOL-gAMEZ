# Skyhook Isles

A third-person 3D exploration game with a physics grapple. Swing between stone pillars and floating rocks on a generated island and collect all 15 sparks.

**Play:** https://claude.ai/artifact/UyJ73agkVdwAh8vXyqM3wp

Built with [Three.js](https://threejs.org) 0.160 for rendering and [cannon-es](https://github.com/pmndrs/cannon-es) 0.20 for physics, both loaded from jsDelivr. Open `index.html` in a browser to play.

## Controls

| Desktop | Touch | Action |
| --- | --- | --- |
| WASD, Shift | Left thumb | Move, sprint |
| Mouse | Right thumb | Look |
| Left click (no rope out) | | Throw the left grapple, the quick way. Hold to reel |
| Q · E | Hook (tap the screen) | Throw the left · right grapple at its L · R marker (or exactly at the crosshair) |
| Hold left click · right click | Hold Reel | Reel yourself in on the left · right grapple |
| Shift · Left Alt | Swipe up | Let go of the left · right grapple |
| Hold Z · C | Hold Pull | Pull what the left · right grapple caught (crate, bomb, friend) toward you |
| Space | Jump | Jump and double jump. While hooked, let go with a boost |
| Hold Space while falling | Hold Jump while falling | Glide (after grabbing a glider pickup) |
| G | Item | Use your item (from rainbow ? boxes): rocket boost, bomb, homing comet, shield, spark magnet |
| F (or middle mouse) | Hit | Shove whoever is in front of you; with a bat, a home-run swing |
| Wheel, R | | Zoom the camera, respawn |
| T | Restart run | Restart the speedrun (resets sparks, crates and the boulder) |
| Esc | | Pause. Click the game to capture the mouse again |

## What's in the world

- A heightfield island with a snowy peak, beaches and the sea all around (fall in and you respawn).
- 13 stone pillars, floating rocks and a chain of stepping stones up to the peak.
- Updrafts that launch you into the sky.
- 5 glider pickups (cyan beams). Each gives 30 s of glider and respawns 15 s after you take it. While gliding, look down to dive and gain speed, look up to float, and fly through updrafts to climb. Firing the hook folds the wing.
- Dynamic crates (including a stack at spawn) and a boulder you can knock or yank around.
- 15 sparks. Each one shines a beam into the sky until you collect it. Your best time is saved.

## Maps and cups

Pick a map on the start screen:
- **Skyhook Isles:** the original island, with outer islets and catch-rocks.
- **Neon Harbour:** a rainy neon city.
- **Ember Caldera:** a volcano in a lava sea.
- **Glacier Spires:** an ice island where the ground is slippery.
- **Scrapyard Canyon:** a junkyard on two mesas around a gorge.
- **Jungle Ruins:** a stepped temple, giant canopy trees and a river.
- **Sumo Ring**, **Plank Cross** and **Rock Garden:** deathmatch arenas. Rock Garden is a small island in a lagoon under a cloud of about 50 little floating rocks to hook onto.

Each map is one file in `maps/`, listed in `maps/index.js`.

**Cups** chain three maps. Races end when someone collects all 15 sparks, or after 4 minutes. Points go 10, 8, 6, 5, 4, 3, 2, 1, and the best total wins. **Leaderboards** keep the best full-clear time per map, with initials, in the artifact's shared database. Friends need Contributor access to post.

## Deathmatch (sumo)

Knock everyone into the sea. A round runs on a 5-minute clock with no KO limit (custom games can set one), with a one-minute warning and a beep for each of the last ten seconds.

- **Streaks** are called to the whole match: 3, 5, 10, 15, 20 and 25 KOs in a row without dying (On a roll, Heating up, Unsinkable, Tidal wave, Sea monster, Kraken), a **Shutdown** when a streak of 5 or more ends, and losing streaks at 3, 5, 8 and 12 falls without a KO.
- **The nuke:** 30 KOs in a row earns a tactical nuke (your Item button). It falls on the middle of the map with a siren, everyone else is out (the KOs are yours), the camera pulls back for the mushroom cloud, and the round ends with you on top.
- **Daze:** every hit stacks. The stun lasts 1.6 times as long on the second quick hit, 2.2 times on the third, and so on, and from the second hit on you ragdoll: no hooks, jumps or glider until it wears off. One stack wears off every 5 s. A beating gets harder and harder to recover from.
- **Bots** fight each other, bait you at the edge, and follow you onto tightropes: they hook the rope, climb on and walk it to you.

## Multiplayer

Everyone who opens the artifact link lands on the same island. This uses the claude.ai artifact `room` capability, so it only works from the link. Opening `index.html` directly gives you solo play.

- You see each other with name tags, plus each other's ropes and gliders.
- **Grapple your friend:** aim at them and hold the hook. You get pulled toward them, and they feel the tug on their side.
- **Start race** (in the *On the island* panel) gives everyone a 3-2-1 countdown, restarts all runs at once, and lists each player's sparks and time.

**How it works:** each player runs their own physics and shares a small pose (position, velocity, facing, glider, hook) through room presence about 20 times a second. Friends are drawn at their last pose, nudged forward by their velocity and smoothed, so your own movement never waits on the network. The trade-off is that crates and the boulder are local to each player, not shared.

## Messing with each other

- **Shove** (F, or the Hit button) is always available. It's short range with a small knockback and a 0.8 s cooldown, and it also pushes crates around.
- **Baseball bat:** grab a red pickup (5 on the island, 30 s each). Your shove becomes a home-run swing with big knockback that also knocks people off their rope or glider.
- **Dunks:** if someone falls into the sea within 8 s of your hit, you get the dunk. Dunks show in the *On the island* panel.

## Bots: the cast

Pick 0–6 bots on the start screen. In multiplayer, one player's game runs them for everyone (the lowest peer id among players who aren't paused) and shares their poses. If that player pauses or leaves, control hands over. Hits on bots are routed to whoever runs them.

Each bot is an original character with their own country, colors, entrance move, catchphrases, voice and AI personality:

| Character | From | Plays like |
| --- | --- | --- |
| Matteo "Il Fulmine" Ricci | Italy | Hyper-aggressive showboat: always chasing, swings often |
| Yuki Tanabe | Japan | Precise sky-runner: grapples to high ground, avoids fights, dodges sometimes |
| "Big" Lars Brekke | Norway | 1.3× size, slow, 1.5× knockback |
| Priya "Pip" Nair | India | Terrified: runs away, panics when hit, lashes out only when cornered |
| Kofi "Smooth" Mensah | Ghana | Trickster: dodges about 45% of hits and taunts |
| Valentina "La Furia" Cruz | Argentina | Grudges: hunts whoever hit her for 20 s, faster |

Entrance cards (colors, name, style, catchphrase, plus a move and a spoken line) play when a character first appears and at every race start. Their lines also show as speech bubbles.

## Sound

Everything is generated live with Web Audio, with no audio files:
- **Sound effects:** swings, bat cracks, splashes and pickups.
- **Race music:** an original 132 BPM 90s-style techno track with an acid bassline, chord stabs and breakdowns. The start screen sets it to Always, Races only or Off.
- **Announcer:** calls out home runs, dunks, power-ups and race starts, using Claude's voice where available or the browser's speech voice otherwise. Recorded clips replace it line by line (see `tools/README.md`).

## Speedrun timer

LiveSplit-style splits in the top right. The timer starts on your first move, jump or hook after a restart, and pauses while the game is paused.

- Each spark is a split. Sparks can be collected in any order, so split *n* is your *n*th spark.
- Completed splits show your time and the difference from your personal best: green if ahead, red if behind, gold if it was your fastest-ever segment.
- On the current split, a red live delta appears once you fall behind your PB pace.
- **Sum of best** adds up your best segments: the theoretical best run.
- Your PB and best segments are saved in the browser (`localStorage`), per device.

## How the grapple works

The rope is a one-sided distance constraint applied every physics step. When the rope is taut, the part of your velocity pulling away from the anchor is removed, so you swing. Reeling shortens the rope. If you hook a dynamic body, the impulse is shared by mass, so light crates come flying and the boulder barely budges.
