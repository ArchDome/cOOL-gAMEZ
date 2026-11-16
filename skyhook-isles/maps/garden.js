// Rock Garden: one small island in a lagoon, under a cloud of little floating rocks. Every rock is a hook point,
// so fights spill into the air: swing out, yank someone off a rock, and swing back before you hit the water.
import { fbm, smooth, lerp } from "../js/lib.js";
import { arenaExtras, edgeColor } from "./arena-common.js";
const ISL=10, TOP=5;
const SPAWN={x:4,z:0}, PEAK={x:-4,z:0};
function height(x,z){ const r=Math.hypot(x,z)+fbm(x*.15,z*.15)*1.2, band=1-smooth(ISL-1.2,ISL+1.2,r); return lerp(-7,TOP+fbm(x*.09+3,z*.09)*.8-Math.max(0,r-ISL+3)*.25,band); }
function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p) colorAt.p={grass:new THREE.Color("#6ac25a"),moss:new THREE.Color("#4a9a48"),sand:new THREE.Color("#e8d6a0"),red:new THREE.Color("#d8342a"),white:new THREE.Color("#f2efe8"),wall:new THREE.Color("#7a6a58")};
  const P=colorAt.p; if (y<TOP-2.2){ c.copy(P.wall); return; }
  const r=Math.hypot(x,z); c.copy(P.grass).lerp(P.moss,Math.max(0,Math.min(1,fbm(x*.3,z*.3)+.3)));
  if (r>ISL-3) c.lerp(P.sand,Math.min(1,(r-ISL+3)/2));
  edgeColor(c,P,ISL-.4-r,x,z);
}
function build(api){
  const {THREE,CANNON,scene,world,R,groundMat,grappleables,rocks}=api;
  arenaExtras(api,{posts:6,postR:36,rockR:0,rockY:0,rockN:0,hornAt:{x:0,z:-4},gustDir:[1,0],tint:"#7a6a58"});
  // the cloud of little rocks: three loose rings plus strays, low to high, so there is always one in reach
  const mats=["#8a8070","#9a9080","#7a7468"].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.85,flatShading:true}));
  const moss=new THREE.MeshStandardMaterial({color:"#5aa850",roughness:.9,flatShading:true});
  const geos=[0,1,2].map(()=>new THREE.DodecahedronGeometry(1,0));
  const place=(x,y,z,r)=>{
    const m=new THREE.Mesh(geos[(R()*3)|0],mats[(R()*3)|0]); m.scale.set(r*(.85+R()*.3),r*(.7+R()*.3),r*(.85+R()*.3)); m.rotation.set(R()*3,R()*3,R()*3);
    m.position.set(x,y,z); m.castShadow=true; scene.add(m); grappleables.push(m);   // (not a camera blocker: too small, the camera would twitch)
    const top=new THREE.Mesh(new THREE.SphereGeometry(r*.75,7,4,0,Math.PI*2,0,Math.PI/2),moss); top.position.set(x,y+r*.35,z); scene.add(top); grappleables.push(top);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Sphere(r*.85)); b.position.set(x,y,z); world.addBody(b);
    rocks.push({x,y,z,r,top:y+r*.8});
  };
  const rings=[[14,10,12,4],[22,14,16,6],[30,18,14,8]];   // radius, base height, count, height spread
  for (const [rad,base,n,spread] of rings) for (let i=0;i<n;i++){
    const a=(i+R()*.6)/n*Math.PI*2, rr=rad+(R()-.5)*5;
    place(Math.cos(a)*rr,base+R()*spread,Math.sin(a)*rr,.6+R()*.55);
  }
  for (let i=0;i<8;i++){ const a=R()*Math.PI*2, rr=4+R()*7; place(Math.cos(a)*rr,15+R()*10,Math.sin(a)*rr,.6+R()*.4); }   // a few right over the island
}
function placeName(p){ const r=Math.hypot(p.x,p.z); return r<ISL ? "The island" : p.y>6 ? "In the rocks" : "In the lagoon"; }
export default {
  key:"garden", name:"Rock Garden", seed:3131, sumoOnly:true, destructibles:{count:0,color:"#7a6a58"},
  grid:{N:81,ES:1}, spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#bfe8ea",100,340], sky:["#2a8ac8","#8ad8e8","#f0fff8"], hemi:["#ffffff","#3a8a7a",1.05], sun:["#fff4dc",2.3], sunDir:[.4,.8,.35], water:"#1aa8b8" },
  height, colorAt, build, placeName,
};
