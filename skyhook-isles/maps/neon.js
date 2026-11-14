// Neon Harbour: a rainy night city of towers, neon signs and wet streets, inspired by Hong Kong.
// Grapple between rooftops; steam vents in the streets act as updrafts; the harbour surrounds the city.
import { fbm, vnoise, smooth, lerp } from "../js/lib.js";

const SPAWN={x:-72,z:72}, PLAZA={x:0,z:0}, CITY=118;
const STREET=2, BLOCK=26;   // street level, block pitch (m)

function height(x,z){
  // flat streets inside the seawall, harbour water outside, a small hill park in one corner
  const edge=Math.max(Math.abs(x),Math.abs(z));
  let h = STREET + .15*vnoise(x*.2,z*.2);
  const park=Math.hypot(x-70,z+70); if (park<30) h += 10*(1-smooth(8,30,park));
  return lerp(h,-7,smooth(CITY-4,CITY+6,edge));
}

function colorAt(x,y,z,ny,c,THREE){
  if (!colorAt.p){ colorAt.p={asphalt:new THREE.Color("#2a2d36"),wet:new THREE.Color("#1b2030"),line:new THREE.Color("#c9b25a"),pave:new THREE.Color("#4a4d57"),grass:new THREE.Color("#2f5a3a"),sand:new THREE.Color("#3a3a40")}; }
  const P=colorAt.p;
  if (y<0) { c.copy(P.sand); return; }
  if (y>4) { c.copy(P.grass).lerp(P.pave,.2); return; }
  // streets run along every BLOCK metres; puddles darken the asphalt
  const sx=((x%BLOCK)+BLOCK)%BLOCK, sz=((z%BLOCK)+BLOCK)%BLOCK, onStreet = sx<7 || sz<7;
  if (onStreet){ c.copy(P.asphalt).lerp(P.wet,vnoise(x*.15,z*.15)); if (Math.abs(sx-3.5)<.25 || Math.abs(sz-3.5)<.25) c.lerp(P.line,.6); }
  else c.copy(P.pave);
}

// a lit-windows texture, shared by every tower (each tower gets its own repeat)
function windowsTexture(THREE){
  const cv=document.createElement("canvas"); cv.width=128; cv.height=128; const x=cv.getContext("2d");
  x.fillStyle="#0c0f18"; x.fillRect(0,0,128,128);
  for (let r=0;r<8;r++) for (let k=0;k<8;k++){
    const on=Math.random()<.42, warm=Math.random()<.7;
    x.fillStyle = on ? (warm?`hsl(${38+Math.random()*12},90%,${55+Math.random()*20}%)`:`hsl(${190+Math.random()*30},70%,70%)`) : "#141a26";
    x.fillRect(k*16+3,r*16+4,10,8);
  }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace; return t;
}
// a neon sign: vertical or horizontal panel with a few glyph-like strokes
const NEON=["#ff2e88","#2ef0ff","#ffd02e","#8b5cff","#3bff8a","#ff6a2e"];
function signTexture(THREE,color){
  const cv=document.createElement("canvas"); cv.width=64; cv.height=256; const x=cv.getContext("2d");
  x.fillStyle="#07070c"; x.fillRect(0,0,64,256);
  x.strokeStyle=color; x.lineWidth=7; x.shadowColor=color; x.shadowBlur=14; x.lineCap="round";
  for (let i=0;i<4;i++){ const y=20+i*58; x.beginPath();
    x.moveTo(14,y); x.lineTo(50,y); x.moveTo(32,y); x.lineTo(32,y+40); if (Math.random()<.6){ x.moveTo(16,y+22); x.lineTo(48,y+22); } if (Math.random()<.5){ x.moveTo(14,y+40); x.lineTo(50,y+40); } x.stroke(); }
  x.strokeRect(5,5,54,246);
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}

function build(api){
  const {THREE,CANNON,scene,world,R,H,groundMat,grappleables,camBlockers,pillars,rocks,updrafts,traps,trapTrigger}=api;
  const win=windowsTexture(THREE);
  const bodyMats=["#1d2230","#232838","#2a2633","#1b2a2f"].map(c=>c);
  const roofMat=new THREE.MeshStandardMaterial({color:"#34384a",roughness:.6,metalness:.2});
  const signTex=NEON.map(c=>signTexture(THREE,c));

  function tower(x,z,w,d,ht){
    const g=H(x,z), base=g-2, top=g+ht, rot=0;
    const tex=win.clone(); tex.needsUpdate=true; tex.repeat.set(Math.max(1,w/8),Math.max(1,ht/8));
    const mat=new THREE.MeshStandardMaterial({color:bodyMats[(R()*bodyMats.length)|0],roughness:.45,metalness:.25,emissive:"#ffffff",emissiveMap:tex,emissiveIntensity:.9});
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,top-base,d),[mat,mat,roofMat,roofMat,mat,mat]);
    m.position.set(x,(top+base)/2,z); m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,(top-base)/2,d/2))); b.position.set(x,(top+base)/2,z); world.addBody(b);
    // rooftop clutter: a water tank or antenna to hook onto
    if (R()<.5){ const tank=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,2.4,10),roofMat); tank.position.set(x+(R()-.5)*w*.5,top+1.2,z+(R()-.5)*d*.5); tank.castShadow=true; scene.add(tank); grappleables.push(tank);
      const tb=new CANNON.Body({mass:0,material:groundMat}); tb.addShape(new CANNON.Cylinder(1.2,1.2,2.4,10)); tb.position.copy(tank.position); world.addBody(tb); }
    else { const ant=new THREE.Mesh(new THREE.CylinderGeometry(.08,.12,6,5),new THREE.MeshStandardMaterial({color:"#888fa3",metalness:.7,roughness:.3})); ant.position.set(x,top+3,z); scene.add(ant);
      const tip=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),new THREE.MeshBasicMaterial({color:"#ff3040"})); tip.position.set(x,top+6.1,z); scene.add(tip); }
    // neon signs on one or two faces
    const nSigns = R()<.75 ? 1+(R()<.4?1:0) : 0;
    for (let k=0;k<nSigns;k++){
      const ci=(R()*NEON.length)|0, sh=Math.min(ht*.6,6+R()*12), sw=sh/4, face=(R()*4)|0;
      const sm=new THREE.MeshBasicMaterial({map:signTex[ci],toneMapped:false});
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(sw,sh),sm);
      const off=.06, sy=g+Math.min(ht-sh/2-1,6+R()*ht*.5);
      if (face===0){ sign.position.set(x+(R()-.5)*w*.6,sy,z+d/2+off); }
      else if (face===1){ sign.position.set(x+(R()-.5)*w*.6,sy,z-d/2-off); sign.rotation.y=Math.PI; }
      else if (face===2){ sign.position.set(x+w/2+off,sy,z+(R()-.5)*d*.6); sign.rotation.y=Math.PI/2; }
      else { sign.position.set(x-w/2-off,sy,z+(R()-.5)*d*.6); sign.rotation.y=-Math.PI/2; }
      scene.add(sign);
    }
    pillars.push({x,z,top,w:Math.min(w,d)});
  }

  // blocks on a grid, leaving the plaza and the spawn street open
  for (let bx=-CITY+12; bx<CITY-8; bx+=BLOCK) for (let bz=-CITY+12; bz<CITY-8; bz+=BLOCK){
    const cx=bx+BLOCK/2+3.5, cz=bz+BLOCK/2+3.5;
    if (Math.hypot(cx-PLAZA.x,cz-PLAZA.z)<20 || Math.hypot(cx-SPAWN.x,cz-SPAWN.z)<16 || Math.hypot(cx-70,cz+70)<24) continue;
    const towersHere = R()<.35 ? 2 : 1;
    for (let k=0;k<towersHere;k++){
      const w=towersHere===2?7+R()*3:10+R()*7, d=towersHere===2?14+R()*3:10+R()*7;
      const ox=towersHere===2?(k?5.2:-5.2):0;
      const dist=Math.hypot(cx,cz), ht=14+R()*26+Math.max(0,60-dist)*.45;   // taller toward the middle
      tower(cx+ox,cz,w,d,ht);
    }
  }

  // steam vents in the streets: updrafts
  const steamMat=new THREE.MeshBasicMaterial({color:"#d9e6ff",transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false});
  const grate=new THREE.MeshStandardMaterial({color:"#3c4150",metalness:.6,roughness:.4});
  for (let k=0;k<6;k++){
    const x=-CITY+15+((R()*8)|0)*BLOCK+3.5, z=-CITY+20+R()*(CITY*2-40);
    if (Math.hypot(x-SPAWN.x,z-SPAWN.z)<14) continue;
    const g=H(x,z), top=g+40, grp=new THREE.Group(); grp.position.set(x,g,z); scene.add(grp);
    const col=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.8,40,18,1,true),steamMat); col.position.y=20; grp.add(col);
    const gr=new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.6,.2,16),grate); gr.position.y=.1; grp.add(gr);
    const rings=[]; for (let i=0;i<6;i++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(2.1,.08,4,24),new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.5,depthWrite:false})); ring.rotation.x=Math.PI/2; grp.add(ring); rings.push(ring); }
    updrafts.push({x,z,g,top,rings});
  }

  // harbour seawall lights
  const lampMat=new THREE.MeshBasicMaterial({color:"#ffcf7a",toneMapped:false});
  for (let i=-CITY; i<=CITY; i+=16) for (const [x,z] of [[i,CITY-3],[i,-CITY+3],[CITY-3,i],[-CITY+3,i]]){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.35,8,6),lampMat); m.position.set(x,STREET+4,z); scene.add(m);
  }
  // tower cranes to swing on: two on the plaza, three on the tallest rooftops. The jib is hookable and walkable,
  // and the hook block hanging off the end is a swing anchor (bots use it too).
  const craneY=new THREE.MeshStandardMaterial({color:"#f2b21c",roughness:.5,metalness:.3,emissive:"#7a5200",emissiveIntensity:.9});   // glows a little so it reads against the night sky
  const craneD=new THREE.MeshStandardMaterial({color:"#2a2c33",roughness:.6,metalness:.5});
  const concrete=new THREE.MeshStandardMaterial({color:"#8a8c92",roughness:.9});
  const redLamp=new THREE.MeshBasicMaterial({color:"#ff3030",toneMapped:false});
  function solidBox(w,h,d,x,y,z,mat,rot=0){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.rotation.y=rot; m.castShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2))); b.position.set(x,y,z); b.quaternion.setFromEuler(0,rot,0); world.addBody(b); return m;
  }
  function crane(x,z,base,mastH,rot){
    const top=base+mastH, jib=34, cj=11, ca=Math.cos(rot), sa=Math.sin(rot);
    solidBox(2,mastH,2,x,base+mastH/2,z,craneY);
    for (const [ox,oz] of [[-.95,-.95],[.95,-.95],[-.95,.95],[.95,.95]]){ const post=new THREE.Mesh(new THREE.BoxGeometry(.25,mastH,.25),craneD); post.position.set(x+ox,base+mastH/2,z+oz); scene.add(post); }
    solidBox(3,2.4,3,x,top+1.2,z,craneD,rot);   // slewing cab
    // jib along +rot, counter-jib behind it
    solidBox(jib,1.2,1.4,x+ca*jib/2,top+3,z-sa*jib/2,craneY,rot);
    solidBox(cj,1.2,1.6,x-ca*cj/2,top+3,z+sa*cj/2,craneY,rot);
    solidBox(3.2,2.6,2.4,x-ca*(cj-1.6),top+1.3,z+sa*(cj-1.6),concrete,rot);   // counterweight
    const apex=new THREE.Mesh(new THREE.ConeGeometry(.7,6,4),craneY); apex.position.set(x,top+6.4,z); scene.add(apex);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.4,8,6),redLamp); lamp.position.set(x,top+9.6,z); scene.add(lamp);
    // a hook block hanging from the tip
    const hx=x+ca*(jib-2), hz=z-sa*(jib-2), hy=top-8-R()*10;
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,top+3-hy,4),craneD); cable.position.set(hx,(top+3+hy)/2,hz); scene.add(cable);
    solidBox(1.6,1.8,1.6,hx,hy,hz,craneY,rot);
    rocks.push({x:hx,y:hy,z:hz,r:.9,top:hy+.9});
    pillars.push({x,z,top:top+2.4,w:3});
  }
  { const roofs=[...pillars].sort((a,b)=>b.top-a.top).slice(0,3);
    crane(PLAZA.x-15,PLAZA.z-12,H(PLAZA.x-15,PLAZA.z-12),52,.6);
    crane(PLAZA.x+14,PLAZA.z+15,H(PLAZA.x+14,PLAZA.z+15),46,3.8);
    roofs.forEach((r,i)=>crane(r.x,r.z,r.top,20+i*4,1.2+i*2.1)); }

  // trap: a transformer in Lantern Plaza. Overload it and every rooftop is live for 6 s: anyone standing up high
  // gets zapped into the air every second.
  if (traps && trapTrigger){ traps.push({kind:"zap",triggers:[trapTrigger(PLAZA.x+7,PLAZA.z+7,"#ffe23a",2.4)],minAbove:5,dur:6,cool:22,name:"Transformer"}); }
}

function placeName(p,H){
  const g=H(p.x,p.z);
  if (g<0) return "The harbour";
  if (Math.hypot(p.x-70,p.z+70)<30) return "Hilltop park";
  if (p.y-g>25) return "Over the rooftops";
  if (Math.hypot(p.x,p.z)<22) return "Lantern Plaza";
  return p.x<0 ? (p.z<0 ? "Night market" : "Ferry street") : (p.z<0 ? "Tower row" : "Neon alley");
}

export default {
  key:"neon", name:"Neon Harbour", seed:88442, destructibles:{count:7,color:"#6a7088"},
  grid:{N:121,ES:2.25},
  spawn:SPAWN, peak:PLAZA,
  theme:{
    fog:["#1a1530",60,260], sky:["#07061a","#2a1846","#5a2a5a"], hemi:["#6c6aa8","#1a1626",.65], sun:["#9fb4ff",.55], sunDir:[.3,.9,-.2], water:"#0e2236",
    rain:true, lightning:true, night:true,
  },
  height, colorAt, build, placeName,
};
