// Sky Speedway: a long, narrow ribbon of track winding downhill over the sea, built for speed.
// Start high in the west and drop ~55 m to the finish. Speed strips launch you, arches overhead let you swing
// without slowing, and three gaps must be swung or jumped. The 15 sparks run in course order, like checkpoints.
import { fbm, smooth, lerp } from "../js/lib.js";

const X0=-178, X1=178, HALFW=7;
const pathZ=x=>38*Math.sin(x*.017)+10*Math.sin(x*.043+1);
const deckY=x=>62-(x-X0)/(X1-X0)*54;                       // 62 m at the start down to 8 m
const GAPS=[-70,25,110];                                   // centres of the gaps (12 m wide)
const SPAWN={x:X0+8,z:pathZ(X0+8)}, PEAK={x:X1-6,z:pathZ(X1-6)};

function onTrack(x,z){
  if (x<X0-2 || x>X1+2) return 0;
  const along=(1-smooth(X0-2,X0+1,x)*0)*(smooth(X0-3,X0,x))*(1-smooth(X1,X1+3,x));
  const side=1-smooth(HALFW-1,HALFW+1.5,Math.abs(z-pathZ(x)));
  let gap=1; for (const g of GAPS) gap=Math.min(gap,smooth(5,6.5,Math.abs(x-g)));
  return along*side*gap;
}
function height(x,z){
  const k=onTrack(x,z);
  // gentle rollers along the deck make it feel fast
  const roll=1.4*Math.sin(x*.11)+fbm(x*.05,z*.05)*.3;
  return lerp(-7,deckY(x)+roll,k);
}
function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p) colorAt.p={deck:new THREE.Color("#7a8494"),lane:new THREE.Color("#e8eef8"),edge:new THREE.Color("#ff4a3a"),wall:new THREE.Color("#8a7a6a"),glow:new THREE.Color("#49e8ff")};
  const P=colorAt.p; if (ny<.6 || y<1){ c.copy(P.wall); return; }
  const d=Math.abs(z-pathZ(x));
  if (d>HALFW-2) c.copy(((Math.floor(x*.3)%2)+2)%2 ? P.edge : P.lane);       // kerbs
  else if (d<.35 && ((Math.floor(x*.25)%2)+2)%2) c.copy(P.lane);                 // dashed centre line
  else c.copy(P.deck).lerp(P.glow,.08*Math.max(0,Math.sin(x*.3)));
}
function build(api){
  const {THREE,CANNON,scene,world,H,groundMat,grappleables,camBlockers,pillars,rocks,updrafts,traps,trapTrigger,boosts}=api;
  const steel=new THREE.MeshStandardMaterial({color:"#c9d3df",metalness:.7,roughness:.3});
  const neon=new THREE.MeshStandardMaterial({color:"#49e8ff",emissive:"#49e8ff",emissiveIntensity:1.4});
  const solid=(w,h,d,x,y,z,mat,ry=0)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.rotation.y=ry; m.castShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2))); b.position.set(x,y,z); b.quaternion.setFromEuler(0,ry,0); world.addBody(b); return m; };
  // arches every 30 m: two posts and a crossbar 16 m up, square to the track
  for (let x=X0+24; x<X1-8; x+=30){
    if (GAPS.some(g=>Math.abs(x-g)<10)) continue;
    const z=pathZ(x), dz=(pathZ(x+1)-pathZ(x-1))/2, ry=-Math.atan(dz), y=deckY(x), nx=Math.sin(ry), nz=Math.cos(ry);
    for (const s of [-1,1]){ const px=x+nx*s*(HALFW+1.5), pz=z+nz*s*(HALFW+1.5); solid(1,18,1,px,y+8,pz,steel); }
    solid(1.2,1,HALFW*2+4,x,y+17,z,neon,ry);
    pillars.push({x,z,top:y+17.5,w:1.2});
  }
  // floating rings over each gap: grab one to swing across
  for (const g of GAPS){ for (const off of [-9,0,9]){ const x=g+off, y=deckY(x)+14, z=pathZ(x);
    const m=new THREE.Mesh(new THREE.TorusGeometry(1.4,.35,8,20),neon); m.position.set(x,y,z); m.rotation.y=Math.PI/2; scene.add(m); grappleables.push(m);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Sphere(1.2)); b.position.set(x,y,z); world.addBody(b);
    rocks.push({x,y,z,r:1.4,top:y+1.4}); } }
  // speed strips: glowing chevrons that launch you down the track
  const stripMat=new THREE.MeshBasicMaterial({color:"#ffe23a",transparent:true,opacity:.85,toneMapped:false,side:THREE.DoubleSide});
  for (let x=X0+40; x<X1-10; x+=36){
    if (GAPS.some(g=>Math.abs(x-g)<16)) continue;
    const z=pathZ(x), dz=(pathZ(x+1)-pathZ(x-1))/2, dl=Math.hypot(1,dz), dir=[1/dl,dz/dl], y=H(x,z)+.08;
    const grp=new THREE.Group(); grp.position.set(x,y,z); grp.rotation.y=-Math.atan2(dir[1],dir[0]); scene.add(grp);
    for (let k=0;k<3;k++){ const ch=new THREE.Mesh(new THREE.PlaneGeometry(1.4,4),stripMat); ch.rotation.x=-Math.PI/2; ch.position.set(-1.6+k*1.6,0,0); grp.add(ch);
      const ch2=ch.clone(); ch2.rotation.z=.6; ch2.position.z=1.1; grp.add(ch2); const ch3=ch.clone(); ch3.rotation.z=-.6; ch3.position.z=-1.1; grp.add(ch3); ch.visible=false; }
    if (boosts) boosts.push({x,y,z,dir,speed:34,r:3.5});
  }
  // glowing light strips along both edges (decoration only): hide the rim and stream past at speed
  { const stripA=new THREE.MeshBasicMaterial({color:"#49e8ff",toneMapped:false}), stripB=new THREE.MeshBasicMaterial({color:"#ff4fd8",toneMapped:false});
    for (const side of [-1,1]){ let pts=[];
      const flush=()=>{ if (pts.length>3){ const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),pts.length*2,.22,6,false),side<0?stripA:stripB); scene.add(tube); } pts=[]; };
      for (let x=X0+1; x<=X1-1; x+=2){ if (GAPS.some(g=>Math.abs(x-g)<7)){ flush(); continue; }
        const z=pathZ(x), dz=(pathZ(x+1)-pathZ(x-1))/2, l=Math.hypot(1,dz), ox=-dz/l*side*(HALFW-1.7), oz=1/l*side*(HALFW-1.7);
        pts.push(new THREE.Vector3(x+ox,H(x+ox,z+oz)+.45,z+oz)); }
      flush(); } }
  // an updraft before the big middle gap, for a high line
  { const x=GAPS[1]-16, z=pathZ(x), g=deckY(x); const grp=new THREE.Group(); grp.position.set(x,g,z); scene.add(grp);
    const rings=[]; for (let i=0;i<6;i++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(2.4,.09,4,22),new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.45,depthWrite:false})); ring.rotation.x=Math.PI/2; grp.add(ring); rings.push(ring); }
    updrafts.push({x,z,g,top:g+30,rings}); }
  // trap: a tailwind horn at the start line blows everyone down the course
  if (traps && trapTrigger) traps.push({kind:"gust",triggers:[trapTrigger(SPAWN.x+4,SPAWN.z+5,"#7cd8ff",2.4)],dir:[1,0],dur:6,cool:25,name:"Tailwind horn"});
}
// sparks in course order: spread along the track (over each gap, a little higher)
function sparkSpots(){
  const out=[]; for (let i=0;i<15;i++){ const x=X0+28+i*(X1-X0-36)/14, z=pathZ(x), gap=GAPS.some(g=>Math.abs(x-g)<7); out.push([x,deckY(x)+(gap?6:2.2),z]); }
  return out;
}
function placeName(p){ const t=(p.x-X0)/(X1-X0); if (onTrack(p.x,p.z)<.5) return "Off the track"; return t<.15?"The start":t>.9?"The finish":"Lap "+Math.min(9,Math.max(1,Math.ceil(t*9))); }
export default {
  key:"speedway", name:"Sky Speedway", seed:8888, narrow:true, destructibles:{count:0,color:"#5a6070"},
  grid:{N:241,ES:1.5}, spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#ffc8a0",120,420], sky:["#3a5ab0","#ff9a6a","#ffd8a0"], hemi:["#fff0e0","#4a5a7a",1.05], sun:["#ffe0b8",2.3], sunDir:[-.6,.4,.3], water:"#2a5a8a" },
  height, colorAt, build, placeName, sparkSpots,
};
