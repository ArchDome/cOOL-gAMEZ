// Skyhook Isles: the original grassy island, plus outer islets and catch-rocks around the coast.
import { fbm, vnoise, smooth, lerp } from "../js/lib.js";

const SPAWN={x:-55,z:45}, PEAK={x:38,z:-28}, ISLAND=120;
// small islands, mostly on the far side from spawn, so a knock-off or a missed swing can be saved
const ISLETS=[
  {x:128,z:-62,r:20,h:9}, {x:64,z:-128,r:16,h:7}, {x:144,z:26,r:12,h:5},
  {x:-12,z:-144,r:13,h:6}, {x:-140,z:-36,r:11,h:5},
];

function height(x,z){
  const r=Math.hypot(x*.92,z)/ISLAND;
  const fall=1-smooth(.6,.97,r);
  const n=fbm(x*.011+3.1,z*.011-1.7);
  const mount=36*Math.exp(-((x-PEAK.x)**2+(z-PEAK.z)**2)/1300);
  const ridge=9*Math.pow(1-Math.abs(fbm(x*.021+7,z*.021+2)*2-1),3);
  let h=1.5+n*16+mount+ridge;
  h=lerp(5.5,h,smooth(12,30,Math.hypot(x-SPAWN.x,z-SPAWN.z)));
  let best=lerp(-7,h,fall);
  for (const s of ISLETS){
    const d=Math.hypot(x-s.x,z-s.z)/s.r;
    if (d<1.6){ const hh=-7+(s.h+7+fbm(x*.05+s.x,z*.05)*4)*(1-smooth(.35,1.25,d)); if (hh>best) best=hh; }
  }
  return best;
}

function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p){ colorAt.p={sand:new THREE.Color("#e2cf9a"),grass:new THREE.Color("#6fae4c"),grass2:new THREE.Color("#4f8f3c"),rock:new THREE.Color("#8d8478"),snow:new THREE.Color("#f4f6fa")}; }
  const P=colorAt.p;
  if (y<1.3) c.copy(P.sand);
  else if (ny<.8) c.copy(P.rock);
  else if (y>33) c.copy(P.snow);
  else c.copy(P.grass).lerp(P.grass2,vnoise(x*.08,z*.08));
  if (y>28 && y<=33 && ny>=.8) c.lerp(P.snow,(y-28)/5);
}

function build(api){
  const {THREE,CANNON,scene,world,R,H,slopeAt,S,groundMat,grappleables,camBlockers,dynamics,pillars,rocks,trees,updrafts}=api;
  const stoneMat=new THREE.MeshStandardMaterial({color:"#b8ab95",flatShading:true,roughness:.9});
  const stoneMat2=new THREE.MeshStandardMaterial({color:"#a49881",flatShading:true,roughness:.9});
  const mossMat=new THREE.MeshStandardMaterial({color:"#6aa84a",flatShading:true,roughness:.95});

  // pillars: one collider, stacked blocks for looks
  function addPillar(x,z,ht,w=3.4){
    const g=H(x,z), rot=R()*Math.PI, base=g-3, top=g+ht;
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,(top-base)/2,w/2))); b.position.set(x,(top+base)/2,z); b.quaternion.setFromEuler(0,rot,0); world.addBody(b);
    for(let y=base; y<top-.01; y+=2.6){
      const h=Math.min(2.6,top-y), s=w*(.94+R()*.1);
      const m=new THREE.Mesh(new THREE.BoxGeometry(s,h,s),R()<.5?stoneMat:stoneMat2); m.position.set(x,y+h/2,z); m.rotation.y=rot+(R()-.5)*.12;
      m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    }
    const cap=new THREE.Mesh(new THREE.BoxGeometry(w+.5,.5,w+.5),mossMat); cap.position.set(x,top-.2,z); cap.rotation.y=rot; cap.castShadow=cap.receiveShadow=true; scene.add(cap); grappleables.push(cap);
    pillars.push({x,z,top,w});
  }
  for(let tries=0; pillars.length<13 && tries<600; tries++){
    const a=R()*Math.PI*2, rr=Math.sqrt(R())*ISLAND*.55, x=Math.cos(a)*rr, z=Math.sin(a)*rr, g=H(x,z);
    if (g<2.5 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<24 || Math.hypot(x-PEAK.x,z-PEAK.z)<22) continue;
    if (pillars.some(p=>Math.hypot(p.x-x,p.z-z)<20)) continue;
    addPillar(x,z,15+R()*20);
  }
  // one pillar on each islet, as a perch and a grapple target from the main island
  for (const s of ISLETS) addPillar(s.x+(R()-.5)*4,s.z+(R()-.5)*4,12+R()*8,3);

  // floating rocks
  const rockMat=new THREE.MeshStandardMaterial({color:"#8f8474",flatShading:true,roughness:.95});
  function addRock(x,y,z,r){
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(r,0),rockMat); m.position.set(x,y,z); m.scale.set(1,.7,1); m.rotation.set(R(),R()*3,R());
    m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(r*.85,r*.7,.5,7),mossMat); top.position.set(x,y+r*.55,z); top.castShadow=top.receiveShadow=true; scene.add(top); grappleables.push(top);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Sphere(r*.82)); b.position.set(x,y,z); world.addBody(b);
    const b2=new CANNON.Body({mass:0,material:groundMat}); b2.addShape(new CANNON.Cylinder(r*.85,r*.7,.5,7)); b2.position.set(x,y+r*.55,z); world.addBody(b2);
    rocks.push({x,y,z,r,top:y+r*.8});
  }
  for (const p of pillars.slice(0,13)){ if (R()<.75){ const a=R()*Math.PI*2, d=11+R()*9; addRock(p.x+Math.cos(a)*d, p.top+7+R()*12, p.z+Math.sin(a)*d, 2.6+R()*2.2); } }
  for (let k=0;k<4;k++){ const t=(k+1)/5; const x=lerp(SPAWN.x+20,PEAK.x,t), z=lerp(SPAWN.z-10,PEAK.z,t); addRock(x+(R()-.5)*10, H(x,z)+18+k*5, z+(R()-.5)*10, 3+R()*1.5); }
  // catch-rocks: a ring just off the coast, denser on the far side, low enough to grab while falling
  for (let k=0;k<18;k++){
    const a=-Math.PI/4+(k/18-.5)*Math.PI*2*(k%3===0?1:.55), rr=98+R()*22;
    addRock(Math.cos(a)*rr, 9+R()*14, Math.sin(a)*rr, 2.4+R()*1.6);
  }
  // stepping rocks from the coast out to each islet
  for (const s of ISLETS){ const d=Math.hypot(s.x,s.z), ux=s.x/d, uz=s.z/d; for (let k=1;k<=2;k++){ const rr=d-s.r-k*12; addRock(ux*rr+(R()-.5)*6, 10+R()*10, uz*rr+(R()-.5)*6, 2.6+R()*1.2); } }

  // trees
  const trunkMat=new THREE.MeshStandardMaterial({color:"#7a5233",flatShading:true});
  const leafMats=["#3f8a3c","#4f9a3a","#2f7a45"].map(c=>new THREE.MeshStandardMaterial({color:c,flatShading:true,roughness:.9}));
  for(let tries=0; trees.length<85 && tries<1100; tries++){
    const x=(R()-.5)*S*.9, z=(R()-.5)*S*.9, g=H(x,z);
    if (g<2 || g>26 || slopeAt(x,z)>.55 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<9) continue;
    if (pillars.some(p=>Math.hypot(p.x-x,p.z-z)<5)) continue;
    const th=3+R()*2.5, s=1+R()*.6;
    const t=new THREE.Mesh(new THREE.CylinderGeometry(.22*s,.32*s,th,6),trunkMat); t.position.set(x,g+th/2,z); t.castShadow=true; scene.add(t); grappleables.push(t);
    const lm=leafMats[(R()*3)|0];
    for (let k=0;k<2;k++){ const c=new THREE.Mesh(new THREE.ConeGeometry((2.1-k*.6)*s,(3.2-k*.5)*s,7),lm); c.position.set(x,g+th+k*1.6*s+.6,z); c.rotation.y=R()*3; c.castShadow=true; c.receiveShadow=true; scene.add(c); grappleables.push(c); }
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(.3*s,th/2,.3*s))); b.position.set(x,g+th/2,z); world.addBody(b);
    const b2=new CANNON.Body({mass:0,material:groundMat}); b2.addShape(new CANNON.Sphere(1.4*s)); b2.position.set(x,g+th+1.1*s,z); world.addBody(b2);
    trees.push({x,z,top:g+th+3.6*s});
  }

  // crates and the boulder (dynamic)
  const crateMat=new THREE.MeshStandardMaterial({color:"#c48a4a",roughness:.8});
  const crateMat2=new THREE.MeshStandardMaterial({color:"#a8733c",roughness:.8});
  const crateGeo=new THREE.BoxGeometry(1.3,1.3,1.3);
  function addCrate(x,y,z){
    const m=new THREE.Mesh(crateGeo,R()<.5?crateMat:crateMat2); m.castShadow=m.receiveShadow=true; scene.add(m);
    const edge=new THREE.LineSegments(new THREE.EdgesGeometry(crateGeo),new THREE.LineBasicMaterial({color:"#5d3a1c"})); m.add(edge);
    const b=new CANNON.Body({mass:2,shape:new CANNON.Box(new CANNON.Vec3(.65,.65,.65))}); b.position.set(x,y,z); b.sleepSpeedLimit=.3; world.addBody(b);
    m.userData.body=b; grappleables.push(m); dynamics.push({mesh:m,body:b,p0:b.position.clone(),q0:b.quaternion.clone()});
  }
  { const cx=SPAWN.x+11, cz=SPAWN.z-7, gy=H(cx,cz);
    for(let lvl=0;lvl<4;lvl++) for(let i=0;i<4-lvl;i++) addCrate(cx+(i-(3-lvl)/2)*1.35, gy+.66+lvl*1.31, cz);
    for(let k=0;k<12;k++){ const x=(R()-.5)*ISLAND*1.2, z=(R()-.5)*ISLAND*1.2, g=H(x,z); if(g>2&&slopeAt(x,z)<.4) addCrate(x,g+.7,z); } }
  { const bx=PEAK.x-16, bz=PEAK.z+14, r=2.2;
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),new THREE.MeshStandardMaterial({color:"#7d746a",flatShading:true})); m.castShadow=m.receiveShadow=true; scene.add(m);
    const b=new CANNON.Body({mass:40,shape:new CANNON.Sphere(r),angularDamping:.2}); b.position.set(bx,H(bx,bz)+r+.5,bz); world.addBody(b);
    m.userData.body=b; grappleables.push(m); dynamics.push({mesh:m,body:b,p0:b.position.clone(),q0:b.quaternion.clone()}); }

  // updrafts
  for(let tries=0; updrafts.length<4 && tries<400; tries++){
    const x=(R()-.5)*ISLAND*1.1, z=(R()-.5)*ISLAND*1.1, g=H(x,z);
    if (g<2 || slopeAt(x,z)>.35 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<18 || updrafts.some(u=>Math.hypot(u.x-x,u.z-z)<40) || pillars.some(p=>Math.hypot(p.x-x,p.z-z)<8)) continue;
    const top=g+34, grp=new THREE.Group(); grp.position.set(x,g,z); scene.add(grp);
    const col=new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.6,34,20,1,true),new THREE.MeshBasicMaterial({color:"#dff6ff",transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false}));
    col.position.y=17; grp.add(col);
    const vent=new THREE.Mesh(new THREE.TorusGeometry(2.6,.35,6,20),stoneMat); vent.rotation.x=Math.PI/2; vent.position.y=.15; grp.add(vent);
    const rings=[]; for(let k=0;k<6;k++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(2.2,.06,4,24),new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.6,depthWrite:false})); ring.rotation.x=Math.PI/2; grp.add(ring); rings.push(ring); }
    updrafts.push({x,z,g,top,rings});
  }
}

function placeName(p,H){
  if (p.y>40) return "High above the isles";
  const g=H(p.x,p.z);
  if (ISLETS.some(s=>Math.hypot(p.x-s.x,p.z-s.z)<s.r*1.3)) return "The outer islets";
  if (Math.hypot(p.x-PEAK.x,p.z-PEAK.z)<40 && g>22) return "Cinder Peak";
  if (Math.hypot(p.x-SPAWN.x,p.z-SPAWN.z)<30) return "The meadow";
  if (g<1.5) return "The shallows";
  return p.y-g>10 ? "Among the pillars" : "The wildlands";
}

export default {
  key:"isles", name:"Skyhook Isles", seed:20261114,
  grid:{N:129,ES:2.5},
  spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#c9d6e8",130,420], sky:["#4f7fcf","#a9c6ec","#f3d2a6"], hemi:["#d6e6ff","#58663a",.95], sun:["#fff0d4",2.3], sunDir:[-.45,.8,.4], water:"#2b7c9c" },
  height, colorAt, build, placeName,
};
