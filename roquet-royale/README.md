# Roquet Royale

A real-time multiplayer croquet battle royale. Whack balls with a mallet and knock everyone into the pond as the lawn shrinks.

**Play:** https://claude.ai/artifact/STGnGiFPmcQWjn5R3fE2v2

Multiplayer uses the claude.ai artifact `room` capability, so it only works from the artifact link. Opening `index.html` directly gives you practice mode against bots.

## Modes

- **Free-for-all**: last ball on the grass wins the round. The lawn starts shrinking after 12 seconds.
- **Co-op vs bots**: you and your friends (solid cyan rings) against the Groundskeepers (dashed orange rings).
- **Deathmatch**: respawn after 3 seconds. First to 15 kills, or most kills in 3 minutes. Tracks K/D per match and per session.
- **Death Run**: race to stop your ball on the chequered finish while one player fires traps (sprinkler, two mole holes, mower, gale). The trapper role rotates each round.

## Controls

- Drag back anywhere and release to strike.
- Hitting an opponent's ball (a roquet) recharges your mallet instantly.
- Rolling through a hoop gives you a power swing on your next shot.
- As trapper: tap a trap on the lawn, use the trap buttons, or press keys 1–5.

## How multiplayer works

The host's browser runs the physics and shares the game state about 20 times a second. Other players send their shots and trap presses back to the host. Ping is shown in the HUD.
