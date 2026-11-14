// Jungle Ruins: a lush island with a river, a stepped stone temple, giant canopy trees and ruined columns.
import { fbm, vnoise, smooth, lerp } from "../js/lib.js";

const SPAWN={x:-60,z:58}, PEAK={x:8,z:-6}, ISLAND=116;

function height(x,z){
  const r=Math.hypot(x,z*.95)/ISLAND, fall=1-smooth(.6,.96,r);
  const n=fbm(x*.013+21,z*.013-8);
  // a river winds east-west across the island
  const rz=z-18*Math.sin(x*.025), river=1-smooth(5,13,Math.abs(rz));
  let h=2.5+n*14+6*Math.pow(fbm(x*.04,z*.04),2);
  h=lerp(h,-2.5,river*smooth(30,60,Math.hypot(x-PEAK.x,z-PEAK.z)));   // the temple plateau stays dry
  h=lerp(4,h,smooth(10,26,Math.hypot(x-SPAWN.x,z-SPAWN.z)));
  h=lerp(5,h,smooth(26,40,Math.hypot(x-PEAK.x,z-PEAK.z)));            // flat ground under the temple
  return lerp(-7,h,fall);
}

function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p){ colorAt.p={mud:new THREE.Color("#4a3a24"),moss:new THREE.Color("#2f6a2a"),leaf:new THREE.Color("#3f8a30"),rock:new THREE.Color("#6a6a58"),sand:new THREE.Color("#b8a070")}; }
  const P=colorAt.p;
  if (y<0) { c.copy(P.mud); return; }
  if (y<1.2) { c.copy(P.sand).lerp(P.mud,.4); return; }
  if (ny<.75) { c.copy(P.rock).lerp(P.moss,.3); return; }
  c.copy(P.moss).lerp(P.leaf,vnoise(x*.09,z*.09));
}

function build(api){
  const {THREE,CANNON,scene,world,R,H,slopeAt,groundMat,grappleables,camBlockers,pillars,rocks,trees,updrafts,traps,trapTrigger}=api;
  const stone=new THREE.MeshStandardMaterial({color:"#8a8670",roughness:.9,flatShading:true});
  const stone2=new THREE.MeshStandardMaterial({color:"#76735e",roughness:.9,flatShading:true});
  const mossy=new THREE.MeshStandardMaterial({color:"#4f7a3a",roughness:.95,flatShading:true});
  const gold=new THREE.MeshStandardMaterial({color:"#d8b040",metalness:.6,roughness:.35,emissive:"#5a3a00",emissiveIntensity:.4});
  function box(w,h,d,x,y,z,mat,rot=0,grab=true){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.rotation.y=rot; m.castShadow=m.receiveShadow=true; scene.add(m);
    if (grab){ grappleables.push(m); camBlockers.push(m); }
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2))); b.position.set(x,y,z); b.quaternion.setFromEuler(0,rot,0); world.addBody(b);
    return m;
  }
  // the temple: five stepped tiers, a shrine on top
  { const g=H(PEAK.x,PEAK.z); let y=g, w=34;
    for (let t=0;t<5;t++){ const h=4.2; box(w,h,w,PEAK.x,y+h/2,PEAK.z,t%2?stone2:stone); y+=h;
      for (const [cx,cz] of [[1,1],[1,-1],[-1,1],[-1,-1]]) pillars.push({x:PEAK.x+cx*(w/2-1.5),z:PEAK.z+cz*(w/2-1.5),top:y,w:2});
      w-=6; }
    box(6,5,6,PEAK.x,y+2.5,PEAK.z,mossy); box(7.5,.8,7.5,PEAK.x,y+5.4,PEAK.z,gold);
    pillars.push({x:PEAK.x,z:PEAK.z,top:y+5.8,w:6}); }
  // ruined columns, some toppled
  for (let tries=0,n=0; n<12 && tries<400; tries++){
    const a=R()*Math.PI*2, rr=40+R()*ISLAND*.4, x=PEAK.x+Math.cos(a)*rr, z=PEAK.z+Math.sin(a)*rr, g=H(x,z);
    if (g<1.5 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<20 || pillars.some(p=>Math.hypot(p.x-x,p.z-z)<14)) continue;
    const ht=10+R()*18;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.6,ht+2,10),R()<.5?stone:stone2); m.position.set(x,g+ht/2-1,z); m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const cap=box(3.6,1,3.6,x,g+ht+.5,z,mossy);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(1.3,(ht+2)/2,1.3))); b.position.set(x,g+ht/2-1,z); world.addBody(b);
    pillars.push({x,z,top:g+ht+1,w:3}); n++;
    if (R()<.4){ const lx=x+3+R()*3, lz=z+(R()-.5)*4; box(2.6,2.6,ht*.6,lx,H(lx,lz)+1.3,lz,stone2,R()*Math.PI,true); }
  }
  // giant canopy trees: tall trunks topped by a wide leafy platform you can stand on
  const bark=new THREE.MeshStandardMaterial({color:"#5a3e24",roughness:.9,flatShading:true});
  const canopy=[new THREE.MeshStandardMaterial({color:"#2f7a2a",roughness:.9,flatShading:true}),new THREE.MeshStandardMaterial({color:"#3f8f34",roughness:.9,flatShading:true})];
  const vine=new THREE.MeshStandardMaterial({color:"#2a5a20",roughness:.9});
  for (let tries=0,n=0; n<14 && tries<600; tries++){
    const x=(R()-.5)*ISLAND*1.5, z=(R()-.5)*ISLAND*1.5, g=H(x,z);
    if (g<1.5 || slopeAt(x,z)>.5 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<14 || Math.hypot(x-PEAK.x,z-PEAK.z)<30 || pillars.some(p=>Math.hypot(p.x-x,p.z-z)<16)) continue;
    const th=20+R()*14, cr=5+R()*3;
    const t=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.6,th,8),bark); t.position.set(x,g+th/2,z); t.castShadow=true; scene.add(t); grappleables.push(t); camBlockers.push(t);
    const tb=new CANNON.Body({mass:0,material:groundMat}); tb.addShape(new CANNON.Box(new CANNON.Vec3(1,th/2,1))); tb.position.set(x,g+th/2,z); world.addBody(tb);
    const c=new THREE.Mesh(new THREE.CylinderGeometry(cr,cr*.8,2.2,9),canopy[(R()*2)|0]); c.position.set(x,g+th+1,z); c.castShadow=c.receiveShadow=true; scene.add(c); grappleables.push(c); camBlockers.push(c);
    const cb=new CANNON.Body({mass:0,material:groundMat}); cb.addShape(new CANNON.Cylinder(cr,cr*.8,2.2,9)); cb.position.set(x,g+th+1,z); world.addBody(cb);
    const puff=new THREE.Mesh(new THREE.IcosahedronGeometry(cr*.75,0),canopy[(R()*2)|0]); puff.position.set(x,g+th+3,z); puff.scale.set(1,.5,1); puff.castShadow=true; scene.add(puff);
    for (let k=0;k<4;k++){ const a=R()*Math.PI*2, vr=cr*.8, vl=6+R()*8; const v=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,vl,4),vine); v.position.set(x+Math.cos(a)*vr,g+th-vl/2,z+Math.sin(a)*vr); scene.add(v); }
    pillars.push({x,z,top:g+th+2.1,w:cr*1.6}); trees.push({x,z,top:g+th+3});
    n++;
  }
  // small jungle trees for cover and grapple points
  const leaf=new THREE.MeshStandardMaterial({color:"#357a2c",flatShading:true,roughness:.9});
  for (let tries=0,n=0; n<50 && tries<800; tries++){
    const x=(R()-.5)*ISLAND*1.6, z=(R()-.5)*ISLAND*1.6, g=H(x,z);
    if (g<1.5 || slopeAt(x,z)>.55 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<9 || Math.hypot(x-PEAK.x,z-PEAK.z)<24) continue;
    const th=3+R()*3; const t=new THREE.Mesh(new THREE.CylinderGeometry(.2,.3,th,5),bark); t.position.set(x,g+th/2,z); scene.add(t); grappleables.push(t);
    const l=new THREE.Mesh(new THREE.IcosahedronGeometry(1.8+R(),0),leaf); l.position.set(x,g+th+.8,z); l.castShadow=true; scene.add(l); grappleables.push(l);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(.3,th/2,.3))); b.position.set(x,g+th/2,z); world.addBody(b);
    n++;
  }
  // floating moss stones over the river and around the coast, to catch falls
  function addRock(x,y,z,r){
    const m=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),stone2); m.position.set(x,y,z); m.scale.set(1,.6,1); m.rotation.set(R(),R()*3,R()); m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(r*.8,r*.65,.4,7),mossy); top.position.set(x,y+r*.5,z); scene.add(top); grappleables.push(top);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Sphere(r*.8)); b.position.set(x,y,z); world.addBody(b);
    const b2=new CANNON.Body({mass:0,material:groundMat}); b2.addShape(new CANNON.Cylinder(r*.8,r*.65,.4,7)); b2.position.set(x,y+r*.5,z); world.addBody(b2);
    rocks.push({x,y,z,r,top:y+r*.75});
  }
  for (let k=0;k<12;k++){ const x=-ISLAND+20+k*((ISLAND*2-40)/11), z=18*Math.sin(x*.025)+(R()-.5)*6; addRock(x,10+R()*10,z,2.4+R()*1.2); }
  for (let k=0;k<14;k++){ const a=k/14*Math.PI*2+R()*.2, rr=98+R()*16; addRock(Math.cos(a)*rr,9+R()*12,Math.sin(a)*rr,2.4+R()*1.2); }
  // mist geysers: updrafts
  for (let tries=0; updrafts.length<4 && tries<400; tries++){
    const x=(R()-.5)*ISLAND*1.3, z=(R()-.5)*ISLAND*1.3, g=H(x,z);
    if (g<1.5 || slopeAt(x,z)>.4 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<16 || Math.hypot(x-PEAK.x,z-PEAK.z)<26 || updrafts.some(u=>Math.hypot(u.x-x,u.z-z)<35)) continue;
    const top=g+38, grp=new THREE.Group(); grp.position.set(x,g,z); scene.add(grp);
    const col=new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.2,38,16,1,true),new THREE.MeshBasicMaterial({color:"#e8fff0",transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false})); col.position.y=19; grp.add(col);
    const ring0=new THREE.Mesh(new THREE.TorusGeometry(2.6,.4,6,18),stone); ring0.rotation.x=Math.PI/2; ring0.position.y=.2; grp.add(ring0);
    const rings=[]; for (let i=0;i<6;i++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(2.2,.07,4,22),new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.5,depthWrite:false})); ring.rotation.x=Math.PI/2; grp.add(ring); rings.push(ring); }
    updrafts.push({x,z,g,top,rings});
  }
  // trap: a lever on the temple summit. Pull it and the stone ball rolls down the steps toward the camp.
  if (traps && trapTrigger){ const lx=PEAK.x+5, lz=PEAK.z+5; traps.push({kind:"boulder",triggers:[trapTrigger(lx,lz,"#9aff5a",2.2)],from:{x:PEAK.x,y:H(PEAK.x,PEAK.z)+6,z:PEAK.z},to:SPAWN,r:2.4,color:"#8a7a5e",label:"ROLLING STONE!",dur:12,cool:30,name:"Temple lever"}); }
}

function placeName(p,H){
  const g=H(p.x,p.z);
  if (g<0) return "The river";
  if (Math.hypot(p.x-PEAK.x,p.z-PEAK.z)<22) return p.y>g+14 ? "The temple summit" : "The temple steps";
  if (Math.hypot(p.x-SPAWN.x,p.z-SPAWN.z)<26) return "Explorers' camp";
  return p.y-g>16 ? "In the canopy" : "The undergrowth";
}

export default {
  key:"jungle", name:"Jungle Ruins", seed:6060, destructibles:{count:5,color:"#9a8a60"},
  grid:{N:121,ES:2.5},
  spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#b8d4b0",120,400], sky:["#4a8ab8","#b8d8c0","#f0e0a8"], hemi:["#e8ffd8","#3a5a2a",1], sun:["#fff0c0",2.1], sunDir:[.4,.75,.35], water:"#3a6a5a", embers:true, emberColor:"#d8ff7a" },
  height, colorAt, build, placeName,
};
