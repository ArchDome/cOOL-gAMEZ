// Glacier Spires: a frozen island of ice spires under the northern lights. The ground is slippery.
import { fbm, vnoise, smooth, lerp } from "../js/lib.js";

const SPAWN={x:50,z:60}, PEAK={x:-30,z:-35}, ISLAND=115;

function height(x,z){
  const r=Math.hypot(x*1.05,z)/ISLAND, fall=1-smooth(.58,.96,r);
  const n=fbm(x*.012-2,z*.012+9);
  const ridge=14*Math.pow(1-Math.abs(fbm(x*.016+3,z*.016-6)*2-1),2.5);
  const mount=30*Math.exp(-((x-PEAK.x)**2+(z-PEAK.z)**2)/1800);
  let h=2+n*10+ridge+mount;
  h=lerp(5,h,smooth(10,26,Math.hypot(x-SPAWN.x,z-SPAWN.z)));
  return lerp(-7,h,fall);
}

function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p){ colorAt.p={snow:new THREE.Color("#eef4fb"),blue:new THREE.Color("#bcd6ee"),ice:new THREE.Color("#7fb3dd"),rock:new THREE.Color("#5c6470"),shore:new THREE.Color("#9fb8c9")}; }
  const P=colorAt.p;
  if (y<1.2) { c.copy(P.shore); return; }
  if (ny<.72) { c.copy(P.rock).lerp(P.ice,.35); return; }
  c.copy(P.snow).lerp(P.blue,vnoise(x*.05,z*.05)*.6);
}

function build(api){
  const {THREE,CANNON,scene,world,R,H,slopeAt,groundMat,grappleables,camBlockers,pillars,rocks,updrafts}=api;
  const iceMat=new THREE.MeshStandardMaterial({color:"#a8d8ff",emissive:"#3a8ad0",emissiveIntensity:.35,roughness:.15,metalness:.1,transparent:true,opacity:.92,flatShading:true});
  const iceDark=new THREE.MeshStandardMaterial({color:"#6fa6d6",emissive:"#1a4a80",emissiveIntensity:.3,roughness:.2,flatShading:true});
  // ice spires: tall tapered prisms, a box collider each
  function spire(x,z,ht,r){
    const g=H(x,z), base=g-2, top=g+ht;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r*.45,r,top-base,5),R()<.5?iceMat:iceDark); m.position.set(x,(top+base)/2,z); m.rotation.y=R()*3;
    m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const ledge=new THREE.Mesh(new THREE.CylinderGeometry(r*.75,r*.6,.5,5),iceDark); ledge.position.set(x,top-.25,z); scene.add(ledge); grappleables.push(ledge);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(r*.6,(top-base)/2,r*.6))); b.position.set(x,(top+base)/2,z); world.addBody(b);
    const lb=new CANNON.Body({mass:0,material:groundMat}); lb.addShape(new CANNON.Cylinder(r*.75,r*.6,.5,5)); lb.position.set(x,top-.25,z); world.addBody(lb);
    pillars.push({x,z,top,w:r*1.4});
  }
  for (let tries=0; pillars.length<16 && tries<600; tries++){
    const a=R()*Math.PI*2, rr=Math.sqrt(R())*ISLAND*.62, x=Math.cos(a)*rr, z=Math.sin(a)*rr, g=H(x,z);
    if (g<2 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<22 || pillars.some(p=>Math.hypot(p.x-x,p.z-z)<17)) continue;
    spire(x,z,18+R()*24,2.6+R()*1.6);
  }
  // floating ice floes over the sea and between spires
  const floe=new THREE.MeshStandardMaterial({color:"#dff0ff",roughness:.3,flatShading:true});
  function addRock(x,y,z,r){
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(r,0),floe); m.position.set(x,y,z); m.scale.set(1.2,.5,1.2); m.rotation.y=R()*3;
    m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Cylinder(r*1.05,r*.8,r*.8,7)); b.position.set(x,y,z); world.addBody(b);
    rocks.push({x,y,z,r,top:y+r*.4});
  }
  for (let k=0;k<16;k++){ const a=k/16*Math.PI*2+R()*.25, rr=95+R()*20; addRock(Math.cos(a)*rr,9+R()*12,Math.sin(a)*rr,2.6+R()*1.4); }
  for (const p of pillars.filter((_,i)=>i%2===0)){ const a=R()*Math.PI*2, d=10+R()*8; addRock(p.x+Math.cos(a)*d,p.top+5+R()*10,p.z+Math.sin(a)*d,2.4+R()*1.4); }
  // frost vents: updrafts
  for (let tries=0; updrafts.length<4 && tries<400; tries++){
    const x=(R()-.5)*ISLAND*1.1, z=(R()-.5)*ISLAND*1.1, g=H(x,z);
    if (g<2 || slopeAt(x,z)>.4 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<16 || updrafts.some(u=>Math.hypot(u.x-x,u.z-z)<35)) continue;
    const top=g+36, grp=new THREE.Group(); grp.position.set(x,g,z); scene.add(grp);
    const col=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,36,16,1,true),new THREE.MeshBasicMaterial({color:"#e8f6ff",transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false})); col.position.y=18; grp.add(col);
    const rings=[]; for (let i=0;i<6;i++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(2.2,.07,4,22),new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.55,depthWrite:false})); ring.rotation.x=Math.PI/2; grp.add(ring); rings.push(ring); }
    updrafts.push({x,z,g,top,rings});
  }
  // northern lights: a few huge additive ribbons high in the sky
  const auroraMat=new THREE.MeshBasicMaterial({color:"#3dffa8",transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  for (let k=0;k<4;k++){
    const g=new THREE.PlaneGeometry(420,60,40,1), pos=g.attributes.position;
    for (let i=0;i<pos.count;i++){ const x=pos.getX(i); pos.setZ(i,Math.sin(x*.02+k)*40); }
    const m=new THREE.Mesh(g,auroraMat.clone()); m.material.color.set(k%2?"#5ad8ff":"#3dffa8"); m.position.set((k-1.5)*60,190+k*14,-120+k*50); m.rotation.x=-.25; scene.add(m);
  }
}

function placeName(p,H){
  const g=H(p.x,p.z);
  if (g<1.2) return "The frozen shore";
  if (Math.hypot(p.x-PEAK.x,p.z-PEAK.z)<35 && g>18) return "The ice crown";
  if (Math.hypot(p.x-SPAWN.x,p.z-SPAWN.z)<26) return "Base camp";
  return p.y-g>12 ? "Among the spires" : "The glacier";
}

export default {
  key:"glacier", name:"Glacier Spires", seed:4242, destructibles:{count:5,color:"#b8dcf4"},
  grid:{N:121,ES:2.5},
  spawn:SPAWN, peak:PEAK,
  theme:{ fog:["#b8cce0",90,360], sky:["#0b1638","#3a5a8c","#cfe2f2"], hemi:["#e4f0ff","#7a8aa0",1.05], sun:["#f2f6ff",1.8], sunDir:[-.3,.55,-.5], water:"#1f4a66", snow:true, ice:true },
  height, colorAt, build, placeName,
};
