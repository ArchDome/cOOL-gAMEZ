// Sky Reach: open sky over the sea, a handful of small islands to land on, and lots of floating rocks spread well
// apart. Routes are chains of swings: plan the next anchor before you let go of this one.
import { fbm, vnoise, smooth, lerp, rng } from "../js/lib.js";

const ISLANDS=[ {x:-150,z:120,r:24,h:12}, {x:-40,z:-140,r:18,h:9}, {x:60,z:40,r:22,h:16}, {x:150,z:-110,r:18,h:10}, {x:-130,z:-40,r:15,h:8}, {x:120,z:150,r:16,h:11} ];
const SPAWN={x:-150,z:120}, PEAK={x:60,z:40};
function height(x,z){
  let h=-7;
  for (const I of ISLANDS){ const d=Math.hypot(x-I.x,z-I.z)/I.r; if (d<1.25){ const k=1-smooth(.75,1.2,d); h=Math.max(h,lerp(-7,I.h+fbm(x*.05,z*.05)*3-d*d*2,k)); } }
  return h;
}
function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p) colorAt.p={grass:new THREE.Color("#5aa84a"),dry:new THREE.Color("#a8b05a"),rock:new THREE.Color("#8a8276"),sand:new THREE.Color("#e8d8a8"),wet:new THREE.Color("#6a8a8a")};
  const P=colorAt.p; if (y<0){ c.copy(P.wet); return; } if (y<1.4){ c.copy(P.sand); return; }
  if (ny<.7){ c.copy(P.rock); return; } c.copy(P.grass).lerp(P.dry,vnoise(x*.06,z*.06)*.6);
}
function build(api){
  const {THREE,CANNON,scene,world,H,groundMat,grappleables,camBlockers,pillars,rocks,updrafts,traps,trapTrigger}=api;
  const R=rng(4711);   // our own random stream, so the layout is fixed
  const stone=[new THREE.MeshStandardMaterial({color:"#7a7266",roughness:.9,flatShading:true}),new THREE.MeshStandardMaterial({color:"#8a8072",roughness:.9,flatShading:true})];
  const moss=new THREE.MeshStandardMaterial({color:"#4a9a3a",roughness:.8,flatShading:true});
  // floating rocks on a sparse, jittered grid: about 32 m apart, 26-60 m up
  for (let gx=-176; gx<=176; gx+=32) for (let gz=-176; gz<=176; gz+=32){
    if (R()<.3) continue;
    const x=gx+(R()-.5)*14, z=gz+(R()-.5)*14, y=26+R()*34, r=1.6+R()*1.2;
    if (ISLANDS.some(I=>Math.hypot(x-I.x,z-I.z)<I.r*.7 && y<I.h+30)) continue;
    const m=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),stone[(R()*2)|0]); m.position.set(x,y,z); m.rotation.set(R()*3,R()*3,R()*3); m.castShadow=true; scene.add(m);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(r*.8,r*.95,.35,7),moss); cap.position.set(x,y+r*.75,z); scene.add(cap);
    grappleables.push(m,cap); camBlockers.push(m);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Sphere(r*.9)); b.position.set(x,y,z); world.addBody(b);
    rocks.push({x,y,z,r,top:y+r*.9});
  }
  // sea stacks near the islands: tall anchors and landing spots
  for (let i=0;i<10;i++){ const I=ISLANDS[i%ISLANDS.length], a=R()*Math.PI*2, d=I.r+8+R()*14, x=I.x+Math.cos(a)*d, z=I.z+Math.sin(a)*d, ht=22+R()*18, w=3+R()*2;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(w*.8,w,ht+7,7),stone[i%2]); m.position.set(x,-7+(ht+7)/2,z); m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(w*.85,w*.85,.4,7),moss); cap.position.set(x,ht+.2,z); scene.add(cap);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Cylinder(w*.8,w,ht+7,7)); b.position.set(x,-7+(ht+7)/2,z); world.addBody(b);
    pillars.push({x,z,top:ht+.4,w}); }
  // updrafts over four islands
  for (const I of ISLANDS.slice(0,4)){ const x=I.x+6, z=I.z-6, g=H(x,z); const grp=new THREE.Group(); grp.position.set(x,g,z); scene.add(grp);
    const rings=[]; for (let i=0;i<6;i++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(2.4,.09,4,22),new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.45,depthWrite:false})); ring.rotation.x=Math.PI/2; grp.add(ring); rings.push(ring); }
    updrafts.push({x,z,g,top:g+40,rings}); }
  if (traps && trapTrigger) traps.push({kind:"gust",triggers:[trapTrigger(SPAWN.x+8,SPAWN.z-8,"#7cd8ff",2.4)],dir:[1,-1],dur:6,cool:22,name:"Storm horn"});
}
function placeName(p,H){ const g=H(p.x,p.z); if (g>0){ const i=ISLANDS.findIndex(I=>Math.hypot(p.x-I.x,p.z-I.z)<I.r*1.2); return ["Home island","South rock","High island","East reef","West islet","North cay"][i]||"An island"; } return p.y>20?"In the open sky":"Over the sea"; }
export default {
  key:"reach", name:"Sky Reach", seed:4711, destructibles:{count:0,color:"#8a8276"},
  grid:{N:161,ES:2.5}, spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#b8d8f0",140,460], sky:["#3a78c8","#9ad0f0","#e8f6ff"], hemi:["#ffffff","#5a7a5a",1.05], sun:["#fff4e0",2.3], sunDir:[.5,.75,.2], water:"#2a6aa0" },
  height, colorAt, build, placeName,
};
