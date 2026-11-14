// Sumo Ring: a narrow stone donut over the sea. Fall off the outside or into the hole in the middle.
import { fbm, smooth, lerp } from "../js/lib.js";
import { arenaExtras, edgeColor } from "./arena-common.js";
const IN=7, OUT=20, TOP=6;
const SPAWN={x:(IN+OUT)/2,z:0}, PEAK={x:0,z:(IN+OUT)/2};
function height(x,z){ const r=Math.hypot(x,z), band=smooth(IN-1,IN+.6,r)*(1-smooth(OUT-.6,OUT+1,r)); return lerp(-7,TOP+fbm(x*.08,z*.08)*.4,band); }
function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p) colorAt.p={stone:new THREE.Color("#b9b2a4"),dark:new THREE.Color("#8a8276"),red:new THREE.Color("#d8342a"),white:new THREE.Color("#f2efe8"),wall:new THREE.Color("#6a645a")};
  const P=colorAt.p; if (y<TOP-1.5){ c.copy(P.wall); return; }
  const r=Math.hypot(x,z); c.copy(P.stone).lerp(P.dark,((Math.floor(Math.atan2(z,x)*6/Math.PI)%2)+2)%2*.35);
  edgeColor(c,P,Math.min(r-IN,OUT-r),x,z);
}
function build(api){ arenaExtras(api,{posts:8,postR:30,rockR:13.5,rockY:20,hornAt:{x:-(IN+OUT)/2,z:0},gustDir:[0,1],tint:"#7a7f8a"}); }
function placeName(p){ const r=Math.hypot(p.x,p.z); return r<IN ? "The hole" : r>OUT ? "Off the edge" : "The ring"; }
export default {
  key:"ring", name:"Sumo Ring", seed:4242, sumoOnly:true, destructibles:{count:0,color:"#8a8276"},
  grid:{N:81,ES:1}, spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#f0b890",90,320], sky:["#4a6aa8","#f0a878","#ffd0a0"], hemi:["#ffe0c0","#4a5a7a",1], sun:["#ffd8b0",2.1], sunDir:[.7,.35,-.4], water:"#2a5a8a" },
  height, colorAt, build, placeName,
};
