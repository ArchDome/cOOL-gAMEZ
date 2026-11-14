// Every playable map. Add a new map file and list it here (order = order in the map picker).
import isles from "./isles.js";
import neon from "./neon.js";
import volcano from "./volcano.js";
import glacier from "./glacier.js";
import junkyard from "./junkyard.js";
export const MAPS = { [isles.key]: isles, [neon.key]: neon, [volcano.key]: volcano, [glacier.key]: glacier, [junkyard.key]: junkyard };
// Cups are map packs: play every map in order, points per race, best total wins.
export const CUPS = [
  { key: "pack1", name: "Map Pack 1: Sky Cup", maps: ["isles", "neon", "volcano"] },
  { key: "pack2", name: "Map Pack 2: Frontier Cup", maps: ["glacier", "junkyard", "neon"] },
];
