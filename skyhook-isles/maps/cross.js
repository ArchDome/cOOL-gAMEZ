// Plank Cross: four narrow planks meeting at a small hub, high over the sea. One good shove and you're swimming.
import { fbm, smooth, lerp } from "../js/lib.js";
import { arenaExtras, edgeColor } from "./arena-common.js";
const W=3.5, ARM=40, HUB=8, TOP=6;
const SPAWN={x:20,z:0}, PEAK={x:0,z:0};
function solid(x,z){
  const ax=(1-smooth(W-.4,W+1,Math.abs(z)))*(1-smooth(ARM-1,ARM+1,Math.abs(x)));
  const az=(1-smooth(W-.4,W+1,Math.abs(x)))*(1-smooth(ARM-1,ARM+1,Math.abs(z)));
  const hub=1-smooth(HUB-.4,HUB+1,Math.hypot(x,z));
  return Math.max(ax,az,hub);
}
function height(x,z){ return lerp(-7,TOP+fbm(x*.1,z*.1)*.3,solid(x,z)); }
function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p) colorAt.p={wood:new THREE.Color("#a87a4a"),dark:new THREE.Color("#7a5430"),red:new THREE.Color("#d8342a"),white:new THREE.Color("#f2efe8"),wall:new THREE.Color("#5a4030")};
  const P=colorAt.p; if (y<TOP-1.5){ c.copy(P.wall); return; }
  const along=Math.abs(x)>Math.abs(z) ? x : z; c.copy(P.wood).lerp(P.dark,((Math.floor(along*.9)%2)+2)%2*.3);
  const hubD=HUB-Math.hypot(x,z), edge=Math.max(hubD, Math.min(Math.abs(x)<=W+1?W-Math.abs(x):-9, 99), Math.abs(z)<=W+1?W-Math.abs(z):-9);
  edgeColor(c,P,edge,x,z);
}
function build(api){ arenaExtras(api,{posts:8,postR:24,rockR:20,rockY:18,hornAt:{x:0,z:HUB-2.5},gustDir:[1,1],tint:"#6a5a4a"}); }
function placeName(p){ const r=Math.hypot(p.x,p.z); if (r<HUB) return "The hub"; if (solid(p.x,p.z)<.5) return "Off the planks"; return Math.abs(p.x)>Math.abs(p.z) ? (p.x>0?"East plank":"West plank") : (p.z>0?"South plank":"North plank"); }
export default {
  key:"cross", name:"Plank Cross", seed:9090, sumoOnly:true, destructibles:{count:0,color:"#7a5430"},
  grid:{N:101,ES:1}, spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#8aa8c8",90,320], sky:["#3a6ab0","#9ac0e0","#e8f0ff"], hemi:["#ffffff","#4a6a5a",1.05], sun:["#fff2d8",2.3], sunDir:[.5,.7,.3], water:"#2a6a9a" },
  height, colorAt, build, placeName,
};
