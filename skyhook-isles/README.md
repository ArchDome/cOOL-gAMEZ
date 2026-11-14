# Skyhook Isles

A third-person 3D exploration game with a physics grapple. Swing between stone pillars and floating rocks on a generated island and collect all 15 sparks.

Built with [Three.js](https://threejs.org) 0.160 for rendering and [cannon-es](https://github.com/pmndrs/cannon-es) 0.20 for physics, both loaded from jsDelivr. Open `index.html` in a browser to play.

## Controls

| Desktop | Touch | Action |
| --- | --- | --- |
| WASD, Shift | Left thumb | Move, sprint |
| Mouse | Right thumb | Look |
| Hold mouse button or E | Hold Hook | Grapple where the crosshair points |
| Shift while hooked | Hold Reel | Reel in. Hook a crate to yank it toward you |
| Space | Jump | Jump and double jump. While hooked, let go with a boost |
| Wheel, R | | Zoom the camera, respawn |
| T | Restart run | Restart the speedrun (resets sparks, crates and the boulder) |
| Esc | | Pause. Click the game to capture the mouse again |

## What's in the world

- A heightfield island with a snowy peak, beaches and the sea all around (fall in and you respawn).
- 13 stone pillars, floating rocks and a chain of stepping stones up to the peak.
- Updrafts that launch you into the sky.
- Dynamic crates (including a stack at spawn) and a boulder you can knock or yank around.
- 15 sparks. Each one shines a beam into the sky until you collect it. Your best time is saved.

## Speedrun timer

LiveSplit-style splits in the top right. The timer starts on your first move, jump or hook after a restart, and pauses while the game is paused.

- Each spark is a split. Sparks can be collected in any order, so split *n* is your *n*th spark.
- Completed splits show your time and the difference from your personal best: green if ahead, red if behind, gold if it was your fastest-ever segment.
- On the current split, a red live delta appears once you fall behind your PB pace.
- **Sum of best** adds up your best segments: the theoretical best run.
- Your PB and best segments are saved in the browser (`localStorage`), per device.

## How the grapple works

The rope is a one-sided distance constraint applied every physics step. When the rope is taut, the part of your velocity pulling away from the anchor is removed, so you swing. Reeling shortens the rope. If you hook a dynamic body, the impulse is shared by mass, so light crates come flying and the boulder barely budges.
