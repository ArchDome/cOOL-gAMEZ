// Swing-technique parameters for bots, per character key (falls back to "default").
// From tools/train-bots.js on 2026-11-14 (fitness 3.61: sparks minus half the falls, per episode; seeded, 3 starts x yuki/lars/dylan).
export const BOT_PARAMS = {
  default: {fireDist:  59.25,  aimDrop:  2.94,  lenFactor:  0.81,  reel:  8,  releaseDist:  6.18,  boostUp:  14,  boostFwd:  11.93,  cooldown:  0.2,  heightCost:  1.74,  stepMin:  11.33,  stepMax:  69.55},
  // personality on top of the trained technique (only the listed numbers differ from "default")
  yuki: { heightCost: .25, stepMax: 75, releaseDist: 4.5 },     // goes for the high sparks, long risky swings
  lars: { heightCost: 2.3, fireDist: 56 },                      // dislikes climbing: prefers the low sparks
  dylan: { lenFactor: .86, reel: 7 },                           // rides longer, looser ropes
};
