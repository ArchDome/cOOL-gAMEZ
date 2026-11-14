// Swing-technique parameters for bots, per character key (falls back to "default").
// From tools/train-bots.js on 2026-11-14 (default: fitness 4.44 after a second reproducible run: sparks minus half the falls, per episode; seeded, 3 starts x yuki/lars/dylan).
// valentina and dylan were then trained on their own (5 generations x 8, 40 s episodes): valentina 7.00 -> 8.67, dylan 3.67 -> 4.67.
export const BOT_PARAMS = {
  default: {fireDist: 61.26, aimDrop: 3, lenFactor: 0.72, reel: 8, releaseDist: 6.54, boostUp: 14, boostFwd: 14, cooldown: 0.2, heightCost: 1.08, stepMin: 8, stepMax: 70.86},
  // personality on top of the trained technique (only the listed numbers differ from "default")
  yuki: { heightCost: .25, stepMax: 75, releaseDist: 4.5 },     // goes for the high sparks, long risky swings
  lars: { heightCost: 2.3, fireDist: 56 },                      // dislikes climbing: prefers the low sparks
  // per-character training runs
  dylan: {fireDist: 71.34, aimDrop: 3, lenFactor: 0.65, reel: 8, releaseDist: 6.04, boostUp: 9.82, boostFwd: 14, cooldown: 0.2, heightCost: 1.28, stepMin: 8, stepMax: 75},          // surfs long swings between far anchors
  valentina: {fireDist: 51.54, aimDrop: 2.77, lenFactor: 0.72, reel: 13.69, releaseDist: 7.2, boostUp: 13.35, boostFwd: 13.25, cooldown: 0.2, heightCost: 0, stepMin: 8, stepMax: 68.13},  // hard reels, ignores height
};
