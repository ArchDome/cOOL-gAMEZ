// Every gameplay number in one place, so the feel can be tuned without digging through the engine, and so a port
// to another engine (Godot, Unity...) can reuse the exact tuning. Units: metres, seconds, metres per second.
// Map layouts live in maps/*.js, trained bot swing settings in js/bot-params.js, characters in main.js (CHARACTERS).
export const TUNE = {
  world:   { gravity: 26 },                            // m/s² (stronger than Earth's 9.8: snappier arcs)
  player: {
    ride: .62, probe: .55,                             // hover controller: ride height above the ground, extra probe reach
    walk: 8.5, sprint: 13,                             // ground speed
    grip: 14, iceGrip: 2.6,                            // how fast ground speed snaps to input (ice maps keep momentum)
    airAccel: 11, ropeAccel: 18,                       // steering in the air / while hanging on a rope
    jump: 11, airJump: 9.5,                            // jump speed; one double jump per air time
    ropeJumpUp: 8, ropeJumpBoost: 1.12,                // jumping off a rope: upward kick, horizontal speed multiplier
    maxHorizontal: 45,                                 // speed cap (also a cap on velocity pile-ups)
  },
  hook:    { range: 75, speed: 150, reel: 24 },         // grapple reach, hook flight speed, reel-in speed
  glider:  { time: 30, respawn: 15 },
  bat:     { time: 30, respawn: 20, sumoRespawn: 8, knock: 40, up: 16, stun: 1.3 },
  shove:   { knock: 10, up: 5, stun: .45 },
  blast:   { knock: 38, up: 15, upMin: 5, stun: 1.6 },   // explosions: per unit of power, scaled by closeness
  sniper:  { charge: 3.2, range: 160 },
  mega:    { every: 150, first: 60 },                    // cruise missile drops
  race:    { roundTime: 240, points: [10, 8, 6, 5, 4, 3, 2, 1], finalBonus: 5 },
  sumo:    { roundTime: 150, kos: 10, maxDeathCam: 3 },
  deathCam:{ secs: 10 },
  slowmo:  { secs: 3 },
  boost:   { hold: 1.4, grip: 1.2 },                     // speed strips: low ground grip for `hold` s, so you keep the launch speed
  camera:  { fov: 65, fovMax: 80, fovFrom: 14, fovTo: 44 },  // field of view widens from 14 to 44 m/s: the feeling of speed                                   // match-end slow motion (time drops to 20%)
  // bot skill levels: multipliers on running speed, time between swings, dodge chance, knockback; hesitate = chance to dither
  botSkill: {
    easy:   { speed: .78, cd: 1.9, dodge: .3, power: .8,  hesitate: .4 },
    normal: { speed: 1,   cd: 1,   dodge: 1,  power: 1,   hesitate: 0 },
    hard:   { speed: 1.1, cd: .7,  dodge: 1.4, power: 1.1, hesitate: 0 },
    brutal: { speed: 1.22, cd: .5, dodge: 1.8, power: 1.25, hesitate: 0 },
  },
};
