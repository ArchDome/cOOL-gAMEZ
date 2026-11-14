// Swing-technique parameters for bots, per character key (falls back to "default").
// From tools/train-bots.js on 2026-11-14 (fitness 4.44 after a second reproducible run: sparks minus half the falls, per episode; seeded, 3 starts x yuki/lars/dylan).
export const BOT_PARAMS = {
  default: {fireDist: 61.26, aimDrop: 3, lenFactor: 0.72, reel: 8, releaseDist: 6.54, boostUp: 14, boostFwd: 14, cooldown: 0.2, heightCost: 1.08, stepMin: 8, stepMax: 70.86},
  // personality on top of the trained technique (only the listed numbers differ from "default")
  yuki: { heightCost: .25, stepMax: 75, releaseDist: 4.5 },     // goes for the high sparks, long risky swings
  lars: { heightCost: 2.3, fireDist: 56 },                      // dislikes climbing: prefers the low sparks
  dylan: { stepMax: 75, stepMin: 12 },                          // surfs long swings between far anchors
};
