// Scrapyard Canyon: two dusty mesas split by a deep gorge. Cranes, stacked wrecks, hanging magnets.
import { fbm, vnoise, smooth, lerp } from "../js/lib.js";

const SPAWN={x:-70,z:0}, PEAK={x:62,z:-40}, ISLAND=115;

function height(x,z){
  const r=Math.max(Math.abs(x)*.95,Math.abs(z))/ISLAND, fall=1-smooth(.78,1,r);
  const n=fbm(x*.02+5,z*.02+1);
  // the gorge winds north-south through the middle; the river at the bottom is "water"
  const gx=x-14*Math.sin(z*.03), gorge=1-smooth(10,24,Math.abs(gx));
  let h=18+n*6;
  h=lerp(h,-6,gorge);
  h+=8*Math.exp(-((x-PEAK.x)**2+(z-PEAK.z)**2)/900);
  h=lerp(16,h,smooth(10,24,Math.hypot(x-SPAWN.x,z-SPAWN.z)));
  return lerp(-7,h,fall);
}

function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p){ colorAt.p={dust:new THREE.Color("#b08a5a"),dirt:new THREE.Color("#8a6a44"),rust:new THREE.Color("#7a3e22"),wall:new THREE.Color("#a0603a"),mud:new THREE.Color("#4a3a2a")}; }
  const P=colorAt.p;
  if (y<0) { c.copy(P.mud); return; }
  if (ny<.7) { c.copy(P.wall).lerp(P.rust,vnoise(y*.3,x*.05)*.5); return; }
  c.copy(P.dust).lerp(P.dirt,vnoise(x*.07,z*.07));
}

function build(api){
  const {THREE,CANNON,scene,world,R,H,slopeAt,groundMat,grappleables,camBlockers,dynamics,pillars,rocks,updrafts}=api;
  const steel=new THREE.MeshStandardMaterial({color:"#c9a020",roughness:.5,metalness:.5,flatShading:true});
  const dark=new THREE.MeshStandardMaterial({color:"#3a3a3e",roughness:.6,metalness:.6});
  const carCols=["#8a2a22","#2a4a7a","#3a6a3a","#8a7a2a","#5a5a62","#6a3a6a"].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.7,metalness:.4,flatShading:true}));
  function staticBox(w,h,d,x,y,z,mat,rot=0,grab=true){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.rotation.y=rot; m.castShadow=m.receiveShadow=true; scene.add(m);
    if (grab){ grappleables.push(m); camBlockers.push(m); }
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2))); b.position.set(x,y,z); b.quaternion.setFromEuler(0,rot,0); world.addBody(b);
    return m;
  }
  // cranes: a lattice mast (one box collider) with a boom and a hanging hook block
  function crane(x,z,ht){
    const g=H(x,z), top=g+ht, rot=R()*Math.PI*2;
    staticBox(2.2,ht+2,2.2,x,g+ht/2-1,z,steel,rot);
    const bl=18+R()*10, bx=x+Math.cos(rot)*bl/2, bz=z-Math.sin(rot)*bl/2;
    const boom=staticBox(bl,1.2,1.2,bx,top+.6,bz,steel,rot);
    const hx=x+Math.cos(rot)*(bl-2), hz=z-Math.sin(rot)*(bl-2), hy=top-6-R()*6;
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,top-hy,4),dark); cable.position.set(hx,(top+hy)/2,hz); scene.add(cable);
    staticBox(2,1.4,2,hx,hy,hz,dark,0);
    pillars.push({x,z,top:top+1.2,w:2.2});
  }
  for (let tries=0; pillars.length<10 && tries<500; tries++){
    const x=(R()-.5)*ISLAND*1.6, z=(R()-.5)*ISLAND*1.6, g=H(x,z);
    if (g<10 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<22 || pillars.some(p=>Math.hypot(p.x-x,p.z-z)<26)) continue;
    crane(x,z,22+R()*18);
  }
  // stacks of wrecked cars to climb, plus loose ones to knock around
  for (let k=0;k<26;k++){
    const x=(R()-.5)*ISLAND*1.7, z=(R()-.5)*ISLAND*1.7, g=H(x,z);
    if (g<10 || slopeAt(x,z)>.3 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<10) continue;
    const n=1+((R()*4)|0), rot=R()*3;
    for (let i=0;i<n;i++) staticBox(4.2,1.5,2,x+(R()-.5)*.6,g+.75+i*1.5,z+(R()-.5)*.6,carCols[(R()*carCols.length)|0],rot+(R()-.5)*.4);
    if (n>=3) pillars.push({x,z,top:g+n*1.5,w:2});
  }
  for (let k=0;k<10;k++){
    const x=SPAWN.x+8+(R()-.5)*30, z=SPAWN.z+(R()-.5)*30, g=H(x,z); if (g<10) continue;
    const m=new THREE.Mesh(new THREE.BoxGeometry(4.2,1.5,2),carCols[(R()*carCols.length)|0]); m.castShadow=m.receiveShadow=true; scene.add(m);
    const b=new CANNON.Body({mass:6,shape:new CANNON.Box(new CANNON.Vec3(2.1,.75,1))}); b.position.set(x,g+1,z); b.quaternion.setFromEuler(0,R()*3,0); b.sleepSpeedLimit=.3; world.addBody(b);
    m.userData.body=b; grappleables.push(m); dynamics.push({mesh:m,body:b,p0:b.position.clone(),q0:b.quaternion.clone()});
  }
  // electromagnets hanging over the gorge: grab points that save a fall
  const magMat=new THREE.MeshStandardMaterial({color:"#2a2a30",metalness:.8,roughness:.3});
  const glow=new THREE.MeshStandardMaterial({color:"#3a6aff",emissive:"#3a6aff",emissiveIntensity:.9});
  for (let k=0;k<14;k++){
    const z=-ISLAND+12+k*(ISLAND*2-24)/13, x=14*Math.sin(z*.03)+(R()-.5)*10, y=10+R()*12, r=2.2;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,1.2,14),magMat); m.position.set(x,y,z); m.castShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r*.8,.12,6,20),glow); ring.rotation.x=Math.PI/2; ring.position.set(x,y-.62,z); scene.add(ring);
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,60,4),magMat); cable.position.set(x,y+30,z); scene.add(cable);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Cylinder(r,r,1.2,14)); b.position.set(x,y,z); world.addBody(b);
    rocks.push({x,y,z,r,top:y+.6});
  }
  // dust devils: updrafts
  for (let tries=0; updrafts.length<4 && tries<400; tries++){
    const x=(R()-.5)*ISLAND*1.5, z=(R()-.5)*ISLAND*1.5, g=H(x,z);
    if (g<10 || slopeAt(x,z)>.35 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<16 || updrafts.some(u=>Math.hypot(u.x-x,u.z-z)<35)) continue;
    const top=g+36, grp=new THREE.Group(); grp.position.set(x,g,z); scene.add(grp);
    const col=new THREE.Mesh(new THREE.CylinderGeometry(3,1.6,36,16,1,true),new THREE.MeshBasicMaterial({color:"#d8b888",transparent:true,opacity:.15,side:THREE.DoubleSide,depthWrite:false})); col.position.y=18; grp.add(col);
    const rings=[]; for (let i=0;i<6;i++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(2.4,.09,4,22),new THREE.MeshBasicMaterial({color:"#fff0d0",transparent:true,opacity:.45,depthWrite:false})); ring.rotation.x=Math.PI/2; grp.add(ring); rings.push(ring); }
    updrafts.push({x,z,g,top,rings});
  }
}

function placeName(p,H){
  const g=H(p.x,p.z);
  if (g<0) return "The gorge";
  if (Math.hypot(p.x-SPAWN.x,p.z-SPAWN.z)<28) return "The gate yard";
  if (Math.hypot(p.x-PEAK.x,p.z-PEAK.z)<30) return "Crusher hill";
  return p.x<14*Math.sin(p.z*.03) ? "West mesa" : "East mesa";
}

export default {
  key:"junkyard", name:"Scrapyard Canyon", seed:777, destructibles:{count:6,color:"#8a6a3a"},
  grid:{N:121,ES:2.25},
  spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#c9a27a",90,330], sky:["#5a7aa8","#d8b48a","#f0c890"], hemi:["#ffe2b8","#6a4a2a",.95], sun:["#ffe0b0",2.2], sunDir:[.6,.6,-.3], water:"#5a4a3a" },
  height, colorAt, build, placeName,
};
