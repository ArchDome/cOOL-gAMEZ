// Ember Caldera: a volcanic island in a lava sea. Basalt columns, obsidian rocks, ash geysers.
import { fbm, vnoise, smooth, lerp } from "../js/lib.js";

const SPAWN={x:-42,z:-34}, PEAK={x:20,z:25}, ISLAND=115;

function height(x,z){
  const r=Math.hypot(x,z*1.1)/ISLAND, fall=1-smooth(.55,.95,r);
  const n=fbm(x*.014+11,z*.014-4);
  // a volcano cone with a crater at the top
  const dc=Math.hypot(x-PEAK.x,z-PEAK.z), cone=44*Math.exp(-dc*dc/1600), crater=-16*Math.exp(-dc*dc/90);
  let h=1+n*12+cone+crater+5*Math.pow(fbm(x*.03,z*.03),3);
  h=lerp(4,h,smooth(10,26,Math.hypot(x-SPAWN.x,z-SPAWN.z)));
  return lerp(-7,h,fall);
}

function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p){ colorAt.p={ash:new THREE.Color("#3a3533"),rock:new THREE.Color("#25211f"),scorch:new THREE.Color("#5a2c1a"),glow:new THREE.Color("#ff5a1a"),shore:new THREE.Color("#1a1412")}; }
  const P=colorAt.p;
  if (y<1) { c.copy(P.shore).lerp(P.glow,Math.max(0,.6-y*.3)); return; }
  if (ny<.75) c.copy(P.rock); else c.copy(P.ash).lerp(P.scorch,vnoise(x*.06,z*.06)*.6);
  const dc=Math.hypot(x-PEAK.x,z-PEAK.z); if (dc<12 && y>20) c.lerp(P.glow,.55*(1-dc/12));   // glowing crater rim
}

function build(api){
  const {THREE,CANNON,scene,world,R,H,slopeAt,groundMat,grappleables,camBlockers,pillars,rocks,updrafts,traps}=api;
  // trap: a mysterious idol on a stone altar partway up the cone. Hook it, drag it, throw it (Hit while hooked)
  // or bat it into the crater, and the volcano erupts: a big blast at the top and lava bombs raining around.
  if (traps){
    const dx=SPAWN.x-PEAK.x, dz=SPAWN.z-PEAK.z, dl=Math.hypot(dx,dz), ax=PEAK.x+dx/dl*34, az=PEAK.z+dz/dl*34, ag=H(ax,az);
    const stone=new THREE.MeshStandardMaterial({color:"#3a332e",flatShading:true,roughness:.9});
    const slab=new THREE.Mesh(new THREE.BoxGeometry(3.4,1,3.4),stone); slab.position.set(ax,ag+.3,az); slab.castShadow=slab.receiveShadow=true; scene.add(slab);
    for (const [ox,oz] of [[-1.4,-1.4],[1.4,-1.4],[-1.4,1.4],[1.4,1.4]]){ const t=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,1.6,6),stone); t.position.set(ax+ox,ag+1.5,az+oz); scene.add(t);
      const f=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),new THREE.MeshBasicMaterial({color:"#ff8a2a",toneMapped:false})); f.position.set(ax+ox,ag+2.4,az+oz); scene.add(f); }
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(1.7,.5,1.7))); b.position.set(ax,ag+.3,az); world.addBody(b);
    grappleables.push(slab);
    traps.push({kind:"idol",altar:{x:ax,y:ag+.8,z:az},crater:{x:PEAK.x,y:H(PEAK.x,PEAK.z),z:PEAK.z,r:9},dur:12,cool:40,name:"The idol"});
  }
  const basalt=[new THREE.MeshStandardMaterial({color:"#2b2724",flatShading:true,roughness:.85}),new THREE.MeshStandardMaterial({color:"#34302c",flatShading:true,roughness:.85})];
  const hot=new THREE.MeshStandardMaterial({color:"#2a1a14",emissive:"#ff4a10",emissiveIntensity:.8,flatShading:true});
  // clusters of hexagonal basalt columns (collider: one box per column)
  function column(x,z,ht,r){
    const g=H(x,z), base=g-2, top=g+ht;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r*1.05,top-base,6),basalt[(R()*2)|0]); m.position.set(x,(top+base)/2,z); m.rotation.y=R();
    m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const capM=new THREE.Mesh(new THREE.CylinderGeometry(r*.98,r*.98,.3,6),hot); capM.position.set(x,top-.1,z); capM.rotation.y=m.rotation.y; scene.add(capM); grappleables.push(capM);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(r*.87,(top-base)/2,r*.87))); b.position.set(x,(top+base)/2,z); b.quaternion.setFromEuler(0,m.rotation.y,0); world.addBody(b);
    pillars.push({x,z,top,w:r*1.7});
  }
  for (let tries=0, clusters=0; clusters<9 && tries<400; tries++){
    const a=R()*Math.PI*2, rr=25+R()*ISLAND*.5, x=Math.cos(a)*rr, z=Math.sin(a)*rr, g=H(x,z);
    if (g<2 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<22 || Math.hypot(x-PEAK.x,z-PEAK.z)<26 || pillars.some(p=>Math.hypot(p.x-x,p.z-z)<22)) continue;
    clusters++;
    const n=3+((R()*3)|0), baseHt=12+R()*16;
    for (let k=0;k<n;k++){ const ox=(R()-.5)*8, oz=(R()-.5)*8; column(x+ox,z+oz,baseHt+(R()-.5)*8+k*1.5,1.4+R()*.6); }
  }
  // floating obsidian rocks, including a ring over the lava to catch falls
  const obs=new THREE.MeshStandardMaterial({color:"#141018",roughness:.25,metalness:.35,flatShading:true});
  const vein=new THREE.MeshStandardMaterial({color:"#2a1410",emissive:"#ff3a00",emissiveIntensity:.6,flatShading:true});
  function addRock(x,y,z,r){
    const m=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),obs); m.position.set(x,y,z); m.scale.set(1,.65,1); m.rotation.set(R(),R()*3,R());
    m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(r*.8,r*.65,.4,7),vein); top.position.set(x,y+r*.5,z); scene.add(top); grappleables.push(top);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Sphere(r*.8)); b.position.set(x,y,z); world.addBody(b);
    const b2=new CANNON.Body({mass:0,material:groundMat}); b2.addShape(new CANNON.Cylinder(r*.8,r*.65,.4,7)); b2.position.set(x,y+r*.5,z); world.addBody(b2);
    rocks.push({x,y,z,r,top:y+r*.75});
  }
  for (let k=0;k<16;k++){ const a=k/16*Math.PI*2+R()*.2, rr=96+R()*18; addRock(Math.cos(a)*rr,10+R()*12,Math.sin(a)*rr,2.4+R()*1.4); }
  for (const p of pillars.filter((_,i)=>i%3===0)){ const a=R()*Math.PI*2, d=10+R()*8; addRock(p.x+Math.cos(a)*d,p.top+6+R()*10,p.z+Math.sin(a)*d,2.6+R()*1.8); }
  for (let k=0;k<5;k++){ const t=(k+1)/6; addRock(lerp(SPAWN.x,PEAK.x,t)+(R()-.5)*12, H(lerp(SPAWN.x,PEAK.x,t),lerp(SPAWN.z,PEAK.z,t))+16+k*4, lerp(SPAWN.z,PEAK.z,t)+(R()-.5)*12, 3+R()); }
  // ash geysers: updrafts with a dark plume
  const plume=new THREE.MeshBasicMaterial({color:"#6b5a55",transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false});
  for (let tries=0; updrafts.length<5 && tries<400; tries++){
    const x=(R()-.5)*ISLAND*1.2, z=(R()-.5)*ISLAND*1.2, g=H(x,z);
    if (g<2 || slopeAt(x,z)>.4 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<16 || updrafts.some(u=>Math.hypot(u.x-x,u.z-z)<35) || pillars.some(p=>Math.hypot(p.x-x,p.z-z)<8)) continue;
    const top=g+38, grp=new THREE.Group(); grp.position.set(x,g,z); scene.add(grp);
    const col=new THREE.Mesh(new THREE.CylinderGeometry(2.2,3.2,38,16,1,true),plume); col.position.y=19; grp.add(col);
    const vent=new THREE.Mesh(new THREE.TorusGeometry(2.6,.5,6,18),hot); vent.rotation.x=Math.PI/2; vent.position.y=.2; grp.add(vent);
    const rings=[]; for (let i=0;i<6;i++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(2.3,.1,4,22),new THREE.MeshBasicMaterial({color:"#ffb27a",transparent:true,opacity:.5,depthWrite:false})); ring.rotation.x=Math.PI/2; grp.add(ring); rings.push(ring); }
    updrafts.push({x,z,g,top,rings});
  }
}

function placeName(p,H){
  const g=H(p.x,p.z);
  if (g<1) return "The lava shore";
  if (Math.hypot(p.x-PEAK.x,p.z-PEAK.z)<22 && g>18) return "The caldera";
  if (Math.hypot(p.x-SPAWN.x,p.z-SPAWN.z)<26) return "Cinder flats";
  return p.y-g>12 ? "Above the columns" : "Basalt fields";
}

export default {
  key:"volcano", name:"Ember Caldera", seed:31337, destructibles:{count:5,color:"#5a463a"},
  grid:{N:121,ES:2.5},
  spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#4a2a22",80,330], sky:["#2a0f0c","#7a2e1a","#ff8a3a"], hemi:["#ffb08a","#3a1a10",.8], sun:["#ffcf9a",1.6], sunDir:[.5,.6,.3], water:"#ff5a10", waterGlow:true, embers:true },
  height, colorAt, build, placeName,
};
