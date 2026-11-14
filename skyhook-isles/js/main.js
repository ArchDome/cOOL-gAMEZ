import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";
import { rng, vnoise, smooth, lerp } from "./lib.js";
import { MAPS, CUPS } from "../maps/index.js";
import { BOT_PARAMS } from "./bot-params.js";
window.__skyhookBooted = true;
const $ = id => document.getElementById(id);

// ---------------- map ----------------
// Terrain, colors and objects come from a map module (maps/*.js); the engine below is shared by all maps.
const MAP_KEY = (location.hash.match(/^#map-([a-z0-9-]+)$/)||[])[1] || "isles";
const MAP = MAPS[MAP_KEY] || MAPS.isles;
const R = rng(MAP.seed);
const N=MAP.grid.N, ES=MAP.grid.ES, S=(N-1)*ES, HALF=S/2;
const SPAWN=MAP.spawn, PEAK=MAP.peak;
const H=(x,z)=>MAP.height(x,z);
// march a ray against the terrain height function; returns hit distance or Infinity
function terrainRay(o,d,maxD){
  let prev=0, step=1.2;
  if (o.y < H(o.x,o.z)) return 0;
  for (let t=step; t<=maxD; t+=step){
    const x=o.x+d.x*t, y=o.y+d.y*t, z=o.z+d.z*t;
    if (y < H(x,z)){ let a=prev, b=t; for (let k=0;k<8;k++){ const m=(a+b)/2; if (o.y+d.y*m < H(o.x+d.x*m,o.z+d.z*m)) b=m; else a=m; } return b; }
    prev=t; if (t>20) step=2;
  }
  return Infinity;
}
const slopeAt=(x,z)=>Math.hypot(H(x+1,z)-H(x-1,z),H(x,z+1)-H(x,z-1))/2;

// ---------------- renderer / scene ----------------
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
// graphics quality: high on desktop, medium on touch devices by default
const TOUCH_DEVICE = matchMedia("(pointer: coarse)").matches;
let GFX="high"; try{ GFX=localStorage.getItem("skyhook.gfx") || (TOUCH_DEVICE?"medium":"high"); }catch(e){ GFX=TOUCH_DEVICE?"medium":"high"; }
const GFX_SET={ high:{pr:1.75,shadow:4096,bloom:1}, medium:{pr:1.25,shadow:2048,bloom:.5}, low:{pr:1,shadow:1024,bloom:0} }[GFX]||{pr:1.25,shadow:2048,bloom:.5};
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,GFX_SET.pr));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
$("app").appendChild(renderer.domElement);
const canvas=renderer.domElement;
const scene=new THREE.Scene();
scene.fog=new THREE.Fog(...MAP.theme.fog);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,1200);

const sky=new THREE.Mesh(new THREE.SphereGeometry(900,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{top:{value:new THREE.Color(MAP.theme.sky[0])},mid:{value:new THREE.Color(MAP.theme.sky[1])},bot:{value:new THREE.Color(MAP.theme.sky[2])}},
  vertexShader:"varying vec3 vP; void main(){ vec4 w=modelMatrix*vec4(position,1.); vP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }",
  fragmentShader:"uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h=normalize(vP-cameraPosition).y; vec3 c = h>0. ? mix(mid,top,smoothstep(0.,.55,h)) : mix(mid,bot,smoothstep(0.,-.25,h)); gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"}));
scene.add(sky);
// the sun (a moon on night maps): a glowing disc that sits at a fixed direction around the camera; bloom picks it up
const sunDisc=(()=>{ const cv=document.createElement("canvas"); cv.width=cv.height=128; const x=cv.getContext("2d"); const g=x.createRadialGradient(64,64,4,64,64,64);
  g.addColorStop(0,"rgba(255,255,255,1)"); g.addColorStop(.18,"rgba(255,250,235,.95)"); g.addColorStop(.35,"rgba(255,230,180,.35)"); g.addColorStop(1,"rgba(255,220,160,0)"); x.fillStyle=g; x.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,color:MAP.theme.night?"#c8d8ff":MAP.theme.sun[0],transparent:true,depthWrite:false,fog:false,toneMapped:false}));
  sp.scale.setScalar(MAP.theme.night?60:110); sp.renderOrder=-1; scene.add(sp); return sp; })();
// clouds on day maps: soft blobs drawn once into a texture, scattered high and drifting slowly
const clouds=[];
if (!MAP.theme.night){
  const texs=[0,1,2].map(()=>{ const cv=document.createElement("canvas"); cv.width=256; cv.height=128; const x=cv.getContext("2d");
    for (let i=0;i<60;i++){ const cx=30+Math.random()*196, cy=46+Math.random()*44-Math.abs(cx-128)*.12, r=10+Math.random()*24, sh=Math.min(1,Math.max(0,(cy-40)/60));
      const g=x.createRadialGradient(cx,cy-r*.25,0,cx,cy,r); const c=Math.round(255-sh*40), cb=Math.round(255-sh*25);
      g.addColorStop(0,`rgba(${c},${c},${cb},.32)`); g.addColorStop(.6,`rgba(${c},${c},${cb},.16)`); g.addColorStop(1,`rgba(${c},${c},${cb},0)`); x.fillStyle=g; x.fillRect(0,0,256,128); }
    const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t; });
  for (let i=0;i<16;i++){ const tex=texs[i%3]; const m=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:MAP.theme.waterGlow?"#7a5a50":"#ffffff",transparent:true,opacity:.55+Math.random()*.3,depthWrite:false,fog:false}));
    const a=Math.random()*Math.PI*2, d=180+Math.random()*320; m.position.set(Math.cos(a)*d,130+Math.random()*60,Math.sin(a)*d); m.scale.set(140+Math.random()*120,50+Math.random()*30,1); scene.add(m); clouds.push(m); }
}
const hemi=new THREE.HemisphereLight(...MAP.theme.hemi); scene.add(hemi);
const sun=new THREE.DirectionalLight(...MAP.theme.sun);
sun.castShadow=true; sun.shadow.mapSize.set(GFX_SET.shadow,GFX_SET.shadow);
Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:300});
sun.shadow.bias=-.0004; sun.shadow.normalBias=.05;
scene.add(sun,sun.target);
const SUN_DIR=new THREE.Vector3(...MAP.theme.sunDir).normalize();
// weather: rain streaks that follow the camera, and lightning flashes
let rain=null, rainPos=null, flashT=0, nextFlash=6+Math.random()*10;
const RAIN_N=3500, RAIN_BOX=70;
if (MAP.theme.rain){
  rainPos=new Float32Array(RAIN_N*6);
  for (let i=0;i<RAIN_N;i++){ const x=(Math.random()-.5)*RAIN_BOX, y=Math.random()*60, z=(Math.random()-.5)*RAIN_BOX; rainPos.set([x,y,z,x+.05,y-1.1,z],i*6); }
  const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.BufferAttribute(rainPos,3));
  rain=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:"#a9c0e8",transparent:true,opacity:.42,depthWrite:false})); rain.frustumCulled=false; scene.add(rain);
}
let embers=null; const EMBER_N=900;
if (MAP.theme.embers || MAP.theme.snow){
  const pos=new Float32Array(EMBER_N*3); for (let i=0;i<EMBER_N;i++) pos.set([(Math.random()-.5)*RAIN_BOX,Math.random()*50,(Math.random()-.5)*RAIN_BOX],i*3);
  const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.BufferAttribute(pos,3));
  embers=new THREE.Points(g,new THREE.PointsMaterial({color:MAP.theme.snow?"#ffffff":(MAP.theme.emberColor||"#ffae5a"),size:MAP.theme.snow?.18:.22,transparent:true,opacity:.85,depthWrite:false,blending:MAP.theme.snow?THREE.NormalBlending:THREE.AdditiveBlending})); embers.frustumCulled=false; scene.add(embers);
}
const hemiBase=MAP.theme.hemi[2];
function updateWeather(dt,camPos){
  if (rain){
    rain.position.set(camPos.x,camPos.y-30,camPos.z);
    const a=rain.geometry.attributes.position.array, fall=42*dt;
    for (let i=0;i<RAIN_N;i++){ const o=i*6; a[o+1]-=fall; a[o+4]-=fall; if (a[o+4]<0){ a[o+1]+=60; a[o+4]+=60; } }
    rain.geometry.attributes.position.needsUpdate=true;
  }
  if (embers){
    embers.position.set(camPos.x,camPos.y-20,camPos.z);
    const a=embers.geometry.attributes.position.array, t=performance.now()/1000;
    const dir=MAP.theme.snow?-1:1; for (let i=0;i<EMBER_N;i++){ const o=i*3; a[o+1]+=dir*(2.2+(i%5)*.4)*dt; a[o]+=Math.sin(t+i)*.4*dt; if (a[o+1]>50) a[o+1]-=50; if (a[o+1]<0) a[o+1]+=50; }
    embers.geometry.attributes.position.needsUpdate=true;
  }
  if (MAP.theme.lightning){
    nextFlash-=dt;
    if (nextFlash<=0){ flashT=.35; nextFlash=8+Math.random()*16; if (ac) setTimeout(()=>{ noise(1.8,{type:"lowpass",f:260,f2:60,vol:.5}); },600+Math.random()*900); }
  }
  // flashes (lightning, or a big moment like the final spark)
  if (flashT>0){ flashT-=dt; hemi.intensity=hemiBase+(Math.sin(flashT*60)>0?3.2:1.2)*Math.max(0,Math.min(1,flashT/.35)); } else if (hemi.intensity!==hemiBase) hemi.intensity=hemiBase;
}

// ---------------- physics world ----------------
const world=new CANNON.World({gravity:new CANNON.Vec3(0,-26,0)});
world.broadphase=new CANNON.SAPBroadphase(world);
world.allowSleep=true;
world.solver.iterations=10;
const groundMat=new CANNON.Material("ground"), playerMat=new CANNON.Material("player");
world.addContactMaterial(new CANNON.ContactMaterial(groundMat,playerMat,{friction:0,restitution:0}));
world.addContactMaterial(new CANNON.ContactMaterial(playerMat,world.defaultMaterial,{friction:0,restitution:0}));
world.defaultContactMaterial.friction=.4;

let terrainMesh=null, terrainHF=null, waterNormals=null;
let simFrozen=false;   // set by headless evaluation: only __skyDebug.tick() advances the simulation
const grappleables=[];   // meshes the hook can bite into
const camBlockers=[];    // meshes the camera won't pass through
const dynamics=[];       // {mesh, body}

// terrain
{
  const g=new THREE.PlaneGeometry(S,S,N-1,N-1); g.rotateX(-Math.PI/2);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++) p.setY(i,H(p.getX(i),p.getZ(i)));
  g.computeVertexNormals();
  const nrm=g.attributes.normal, col=new Float32Array(p.count*3), c=new THREE.Color();
  for(let i=0;i<p.count;i++){ MAP.colorAt(p.getX(i),p.getY(i),p.getZ(i),nrm.getY(i),c,THREE); col.set([c.r,c.g,c.b],i*3); }
  g.setAttribute("color",new THREE.BufferAttribute(col,3));
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.95}));
  m.receiveShadow=true; m.castShadow=true; scene.add(m); terrainMesh=m;
  const data=[]; for(let i=0;i<N;i++){ const row=[]; for(let j=0;j<N;j++) row.push(H(-HALF+i*ES,HALF-j*ES)); data.push(row); }
  const b=new CANNON.Body({mass:0,material:groundMat,collisionFilterGroup:4}); terrainHF=new CANNON.Heightfield(data,{elementSize:ES}); b.addShape(terrainHF);
  b.position.set(-HALF,0,HALF); b.quaternion.setFromEuler(-Math.PI/2,0,0); world.addBody(b);
}
// sea
{
  const m=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),(MAP.theme.waterGlow ? new THREE.MeshStandardMaterial({color:MAP.theme.water,emissive:MAP.theme.water,emissiveIntensity:.85,roughness:.6}) : new THREE.MeshStandardMaterial({color:MAP.theme.water,roughness:.25,metalness:.1,transparent:true,opacity:.88})));
  m.rotation.x=-Math.PI/2; m.position.y=0; m.receiveShadow=true; scene.add(m);
  if (!MAP.theme.waterGlow){
    // a tiling normal map built from a few sine waves, scrolled every frame so the sea ripples and catches the sun
    const N2=128, data=new Uint8Array(N2*N2*4);
    for (let y=0;y<N2;y++) for (let x=0;x<N2;x++){ const u=x/N2*Math.PI*2, v=y/N2*Math.PI*2;
      const dx=Math.cos(u*3+v)*.5+Math.cos(u*5-v*2)*.3+Math.cos(u*2+v*4)*.2, dy=Math.cos(v*3-u)*.5+Math.cos(v*5+u*3)*.3+Math.cos(v*2-u*5)*.2;
      const nx=dx*.35, ny=dy*.35, nz=1, l=Math.hypot(nx,ny,nz), o=(y*N2+x)*4;
      data[o]=(nx/l*.5+.5)*255; data[o+1]=(ny/l*.5+.5)*255; data[o+2]=(nz/l*.5+.5)*255; data[o+3]=255; }
    const nt=new THREE.DataTexture(data,N2,N2); nt.wrapS=nt.wrapT=THREE.RepeatWrapping; nt.repeat.set(140,140); nt.needsUpdate=true;
    m.material.normalMap=nt; m.material.normalScale.set(.6,.6); m.material.roughness=.12; m.material.metalness=.35; m.material.needsUpdate=true;
    waterNormals=nt;
  }
}

// ---------------- map objects ----------------
const pillars=[], rocks=[], trees=[], updrafts=[];
const traps=[];   // things players can set off, declared by the map (see setupTraps)
MAP.build({THREE,CANNON,scene,world,R,H,slopeAt,lerp,S,HALF,SPAWN,PEAK,groundMat,grappleables,camBlockers,dynamics,pillars,rocks,trees,updrafts,traps,trapTrigger});

// ---------------- sparks ----------------
const sparks=[];
const sparkGeo=new THREE.OctahedronGeometry(.6);
const sparkMat=new THREE.MeshStandardMaterial({color:"#ffd25a",emissive:"#ffb02e",emissiveIntensity:1.6,roughness:.3});
const beamMat=new THREE.MeshBasicMaterial({color:"#ffd36a",transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending});
function addSpark(x,y,z){
  const m=new THREE.Mesh(sparkGeo,sparkMat); m.position.set(x,y,z); scene.add(m);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,90,6,1,true),beamMat); beam.position.set(x,y+45,z); scene.add(beam);
  sparks.push({pos:new THREE.Vector3(x,y,z),mesh:m,beam,got:false});
}
{ const spots=[];
  pillars.forEach(p=>spots.push([p.x,p.top+1.7,p.z]));
  rocks.forEach(r=>spots.push([r.x,r.top+1.4,r.z]));
  for (let i=spots.length-1;i>0;i--){ const j=(R()*(i+1))|0; [spots[i],spots[j]]=[spots[j],spots[i]]; }
  addSpark(PEAK.x,H(PEAK.x,PEAK.z)+1.6,PEAK.z);
  const tall=[...trees].sort((a,b)=>b.top-a.top)[0]; if(tall) addSpark(tall.x,tall.top+1.2,tall.z);
  for (const s of spots){ if (sparks.length>=15) break; addSpark(...s); } }
const TOTAL=sparks.length;
// ---- final spark: when anyone has every spark, one big spark spawns (closer to whoever finished first) ----
const FINAL_BONUS=5;
const finale={active:false,got:false,pos:new THREE.Vector3(),by:"",grabbedBy:"",t:0};
let finN=0, lastFin=0, finGotN=0, lastFinGot=0; const lastFinSeen=new Map(), lastFinGotSeen=new Map();
const finaleGrp=new THREE.Group(); finaleGrp.visible=false; scene.add(finaleGrp);
const finaleCore=new THREE.Mesh(new THREE.OctahedronGeometry(1.5),new THREE.MeshStandardMaterial({color:"#fff2b0",emissive:"#ff9a2e",emissiveIntensity:3,roughness:.2})); finaleGrp.add(finaleCore);
const finaleShell=new THREE.Mesh(new THREE.IcosahedronGeometry(2.4,1),new THREE.MeshBasicMaterial({color:"#ffd25a",wireframe:true,transparent:true,opacity:.5,toneMapped:false})); finaleGrp.add(finaleShell);
{ const b=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,260,12,1,true),new THREE.MeshBasicMaterial({color:"#ffe28a",transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide})); b.position.y=130; finaleGrp.add(b); }
const searchlights=["#ff4fd8","#4fe8ff","#ffd25a","#7dff6a"].map((c,i)=>{ const pivot=new THREE.Group(); finaleGrp.add(pivot);
  const cone=new THREE.Mesh(new THREE.CylinderGeometry(9,.3,140,16,1,true),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  cone.position.y=70; const tilt=new THREE.Group(); tilt.rotation.z=.42; tilt.add(cone); pivot.add(tilt); pivot.rotation.y=i*Math.PI/2; return pivot; });
const finaleLight=new THREE.PointLight("#ffb040",0,60,1.6); finaleGrp.add(finaleLight);
// somewhere 25-55 m from whoever finished first: close enough to reward them, far enough to race for
function finaleSpot(near){
  const cands=[...pillars.map(p=>[p.x,p.top+2.2,p.z]),...rocks.map(r=>[r.x,r.top+2,r.z]),...sparks.map(s=>[s.pos.x,s.pos.y+.5,s.pos.z])];
  let best=null, bc=1e9; for (const c of cands){ const d=Math.hypot(c[0]-near.x,c[2]-near.z), cost=Math.abs(d-38)+(d<20?50:0); if (cost<bc){ bc=cost; best=c; } }
  return best ? new THREE.Vector3(...best) : new THREE.Vector3(near.x,near.y+6,near.z);
}
function spawnFinale(pos,by,local){
  if (finale.active || finale.got) return;
  finale.active=true; finale.got=false; finale.pos.copy(pos); finale.by=by; finale.t=0; finale.grabbedBy="";
  finaleGrp.position.copy(pos); finaleGrp.visible=true;
  if (local){ finN++; lastFin={n:finN,p:[r2(pos.x),r2(pos.y),r2(pos.z)],by:String(by).slice(0,16)}; }
  flashT=.7; shakeT=Math.max(shakeT,.3);
  [392,523,659,784,1046].forEach((f,i)=>tone(f,.5,"sawtooth",.05,1,i*.09)); tone(55,2.2,"sine",.25,1.5);
  announce("final","The final spark has appeared!",true);
  toast("FINAL SPARK!", by===myName() ? "It spawned near you. Go get it!" : by+" found every spark. Race for the big one!");
}
function grabFinale(name,local){
  if (!finale.active) return;
  finale.active=false; finale.got=true; finale.grabbedBy=name; finaleGrp.visible=false;
  if (local){ finGotN++; lastFinGot={n:finGotN,by:String(name).slice(0,16)}; }
  flashT=.5;
  [523,659,784,1046,1318,1568].forEach((f,i)=>tone(f,.35,"triangle",.07,1,i*.07));
  const mine=name===myName(); if (mine) faceHappyT=3;
  announce("finalgot", mine ? "Final spark! What a finish!" : name+" takes the final spark!", true);
  toast(mine ? "FINAL SPARK!" : name+" got the final spark", "+"+FINAL_BONUS+" bonus");
}
function resetFinale(){ finale.active=false; finale.got=false; finale.grabbedBy=""; finaleGrp.visible=false; }
function updateFinale(dt,t){
  if (!finale.active) return;
  finale.t+=dt;
  finaleCore.rotation.y+=dt*2.5; finaleCore.rotation.x+=dt*1.1; finaleCore.scale.setScalar(1+.18*Math.sin(t*6));
  finaleShell.rotation.y-=dt*.8; finaleShell.rotation.z+=dt*.5;
  searchlights.forEach((sl,i)=>{ sl.rotation.y+=dt*(.7+i*.15); sl.children[0].rotation.z=.35+.2*Math.sin(t*.9+i); });
  finaleLight.intensity=30+15*Math.sin(t*8);
  finaleGrp.position.y=finale.pos.y+Math.sin(t*1.7)*.4;
}
// glider pickups: one at spawn to learn it, one on the peak, the rest on pillars without a spark
const gliderPickups=[];
{
  const icon=new THREE.BufferGeometry();
  icon.setAttribute("position",new THREE.Float32BufferAttribute([0,0,-.7, -1,0,.45, 0,.12,.25,  0,0,-.7, 0,.12,.25, 1,0,.45],3)); icon.computeVertexNormals();
  const iconMat=new THREE.MeshStandardMaterial({color:"#7ce0ff",emissive:"#2aa7d0",emissiveIntensity:1.2,side:THREE.DoubleSide});
  const ringMat=new THREE.MeshBasicMaterial({color:"#bff1ff",transparent:true,opacity:.7});
  const beamC=new THREE.MeshBasicMaterial({color:"#7ce0ff",transparent:true,opacity:.18,depthWrite:false,blending:THREE.AdditiveBlending});
  const add=(x,y,z)=>{ const grp=new THREE.Group(); grp.position.set(x,y,z); scene.add(grp);
    const m=new THREE.Mesh(icon,iconMat); m.scale.setScalar(1.1); grp.add(m);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.1,.05,4,28),ringMat); ring.rotation.x=Math.PI/2; grp.add(ring);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,70,6,1,true),beamC); beam.position.set(x,y+35,z); scene.add(beam);
    gliderPickups.push({pos:new THREE.Vector3(x,y,z),grp,beam,cd:0}); };
  const sx=SPAWN.x-6, sz=SPAWN.z+6; add(sx,H(sx,sz)+1.4,sz);
  add(PEAK.x+3,H(PEAK.x+3,PEAK.z+3)+2,PEAK.z+3);
  const taken=p=>sparks.some(s=>Math.hypot(s.pos.x-p.x,s.pos.z-p.z)<2);
  for (const p of [...pillars].sort((a,b)=>b.top-a.top)){ if (gliderPickups.length>=5) break; if (!taken(p)) add(p.x,p.top+1.8,p.z); }
}
// baseball bat pickups (red beams)
const batPickups=[];
{
  const wood=new THREE.MeshStandardMaterial({color:"#e0a060",emissive:"#a0401a",emissiveIntensity:.8});
  const ringMat=new THREE.MeshBasicMaterial({color:"#ffb3a6",transparent:true,opacity:.7});
  const beamR=new THREE.MeshBasicMaterial({color:"#ff6b5a",transparent:true,opacity:.18,depthWrite:false,blending:THREE.AdditiveBlending});
  const add=(x,y,z)=>{ const grp=new THREE.Group(); grp.position.set(x,y,z); scene.add(grp);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.11,.05,1.3,10),wood); m.rotation.z=.6; grp.add(m);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.1,.05,4,28),ringMat); ring.rotation.x=Math.PI/2; grp.add(ring);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,70,6,1,true),beamR); beam.position.set(x,y+35,z); scene.add(beam);
    batPickups.push({pos:new THREE.Vector3(x,y,z),grp,beam,cd:0}); };
  const bx=SPAWN.x+7, bz=SPAWN.z+7; add(bx,H(bx,bz)+1.3,bz);
  const busy=(x,z)=>sparks.some(s=>Math.hypot(s.pos.x-x,s.pos.z-z)<3)||gliderPickups.some(g=>Math.hypot(g.pos.x-x,g.pos.z-z)<3);
  for (const r of rocks){ if (batPickups.length>=3) break; if (!busy(r.x,r.z)) add(r.x,r.top+1.6,r.z); }
  for (let k=0;k<60 && batPickups.length<5;k++){ const x=(R()-.5)*S*.5, z=(R()-.5)*S*.5, g=H(x,z); if (g>1 && slopeAt(x,z)<.4 && !busy(x,z)) add(x,g+1.3,z); }
}
$("sparks").textContent="0/"+TOTAL;
// ---------------- item boxes and destructible towers (placed for every map) ----------------
const itemBoxes=[];
{
  const cv=document.createElement("canvas"); cv.width=64; cv.height=64; const x=cv.getContext("2d");
  const gr=x.createLinearGradient(0,0,64,64); ["#ff5a7a","#ffd25a","#5aff9a","#5ad8ff","#c75aff"].forEach((c,i)=>gr.addColorStop(i/4,c)); x.fillStyle=gr; x.fillRect(0,0,64,64);
  x.fillStyle="rgba(255,255,255,.9)"; x.font="900 46px sans-serif"; x.textAlign="center"; x.textBaseline="middle"; x.fillText("?",32,35);
  const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshStandardMaterial({map:tex,emissive:"#ffffff",emissiveMap:tex,emissiveIntensity:.55,transparent:true,opacity:.92});
  const geo=new THREE.BoxGeometry(1.2,1.2,1.2);
  const add=(x,y,z)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); scene.add(m); itemBoxes.push({pos:new THREE.Vector3(x,y,z),mesh:m,cd:0}); };
  for (let k=0;k<4;k++){ const a=k/4*Math.PI*2+.4, x=SPAWN.x+Math.cos(a)*9, z=SPAWN.z+Math.sin(a)*9; add(x,H(x,z)+1.4,z); }
  const tops=[...pillars].sort(()=>R()-.5).slice(0,5); for (const q of tops) add(q.x+1.8,q.top+1.4,q.z+1.8);
  for (let k=0,n=0;k<80 && n<7;k++){ const x=(R()-.5)*S*.55, z=(R()-.5)*S*.55, g=H(x,z); if (g>1 && slopeAt(x,z)<.4 && !itemBoxes.some(b=>b.pos.distanceTo(new THREE.Vector3(x,g+1.4,z))<12)){ add(x,g+1.4,z); n++; } }
}
// towers made of blocks: explosions knock blocks out, and anything left unsupported collapses as debris
const CHUNK=1.6, chunkGeo=new THREE.BoxGeometry(CHUNK*.98,CHUNK*.98,CHUNK*.98);
const towers=[], debris=[];
const chunkMat=new THREE.MeshStandardMaterial({color:(MAP.destructibles&&MAP.destructibles.color)||"#a8743c",roughness:.8,flatShading:true});
const chunkMat2=new THREE.MeshStandardMaterial({color:new THREE.Color((MAP.destructibles&&MAP.destructibles.color)||"#a8743c").multiplyScalar(.82),roughness:.8,flatShading:true});
const towerSpots=[];
for (let k=0;k<400 && towerSpots.length<(MAP.destructibles ? MAP.destructibles.count : 4);k++){
  const x=(R()-.5)*S*.6, z=(R()-.5)*S*.6, g=H(x,z);
  if (g<1 || slopeAt(x,z)>.25 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<16 || pillars.some(q=>Math.hypot(q.x-x,q.z-z)<9) || towerSpots.some(t=>Math.hypot(t.x-x,t.z-z)<24)) continue;
  towerSpots.push({x,z,g,floors:8+((R()*6)|0)});
}
function buildTowers(){
  for (const t of towers) for (const c of t.chunks) if (c.alive) removeChunk(c);
  towers.length=0;
  for (const sp of towerSpots){
    const t={x:sp.x,z:sp.z,chunks:[],grid:{}};
    for (let i=0;i<2;i++) for (let j=0;j<2;j++) for (let k=0;k<sp.floors;k++){
      const x=sp.x+(i-.5)*CHUNK, z=sp.z+(j-.5)*CHUNK, y=sp.g+CHUNK*(k+.5);
      const m=new THREE.Mesh(chunkGeo,(i+j+k)%2?chunkMat:chunkMat2); m.position.set(x,y,z); m.castShadow=m.receiveShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
      const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Box(new CANNON.Vec3(CHUNK/2,CHUNK/2,CHUNK/2))); b.position.set(x,y,z); world.addBody(b);
      const c={mesh:m,body:b,alive:true,i,j,k}; t.chunks.push(c); t.grid[i+","+j+","+k]=c;
    }
    towers.push(t);
  }
}
function removeChunk(c){
  c.alive=false; scene.remove(c.mesh); world.removeBody(c.body);
  for (const arr of [grappleables,camBlockers]){ const ix=arr.indexOf(c.mesh); if (ix>=0) arr.splice(ix,1); }
}
function chunkToDebris(c,cx,cy,cz,power){
  removeChunk(c);
  if (debris.length>80) return;
  const m=new THREE.Mesh(chunkGeo,c.mesh.material); m.position.copy(c.mesh.position); m.castShadow=true; scene.add(m);
  const b=new CANNON.Body({mass:1,shape:new CANNON.Box(new CANNON.Vec3(CHUNK/2,CHUNK/2,CHUNK/2)),collisionFilterGroup:16,collisionFilterMask:1|4|16});
  b.position.set(m.position.x,m.position.y,m.position.z);
  const dx=m.position.x-cx, dy=m.position.y-cy, dz=m.position.z-cz, d=Math.hypot(dx,dy,dz)||1;
  b.velocity.set(dx/d*power*8,Math.max(2,dy/d*power*8)+2,dz/d*power*8); b.angularVelocity.set(Math.random()*6-3,Math.random()*6-3,Math.random()*6-3);
  world.addBody(b); debris.push({mesh:m,body:b,t:6});
}
// knock out blocks near an explosion, then let unsupported blocks above any hole collapse
function blastTowers(x,y,z,r,power){
  let hit=false;
  for (const t of towers){
    if (Math.hypot(t.x-x,t.z-z)>r+4) continue;
    for (const c of t.chunks){ if (!c.alive) continue; const p=c.mesh.position; if (Math.hypot(p.x-x,p.y-y,p.z-z)<r*.75){ chunkToDebris(c,x,y,z,power*1.4); hit=true; } }
    for (let i=0;i<2;i++) for (let j=0;j<2;j++){
      let broken=false;
      for (let k=0;;k++){ const c=t.grid[i+","+j+","+k]; if (!c) break; if (!c.alive){ broken=true; continue; } if (broken) chunkToDebris(c,x,y,z,.3); }
    }
  }
  return hit;
}
buildTowers();

// ---------------- player ----------------
const pBody=new CANNON.Body({mass:5,shape:new CANNON.Sphere(.5),fixedRotation:true,linearDamping:.01,material:playerMat,collisionFilterGroup:2});
pBody.allowSleep=false;
const spawnPos=new CANNON.Vec3(SPAWN.x,H(SPAWN.x,SPAWN.z)+2,SPAWN.z);
pBody.position.copy(spawnPos); world.addBody(pBody);
const hero=new THREE.Group(); scene.add(hero);
const heroBody=new THREE.Group(); hero.add(heroBody);
let heroBat=null, heroGun=null, sniperGlowMat=null;
{
  const suit=new THREE.MeshStandardMaterial({color:"#f26b3a",roughness:.6});
  const dark=new THREE.MeshStandardMaterial({color:"#22314d",roughness:.7});
  const skin=new THREE.MeshStandardMaterial({color:"#ffd9b8",roughness:.8});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.36,.42,4,10),suit); torso.position.y=.05; heroBody.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.3,16,12),skin); head.position.y=.68; heroBody.add(head);
  const hat=new THREE.Mesh(new THREE.SphereGeometry(.32,16,8,0,Math.PI*2,0,Math.PI/2),dark); hat.position.y=.72; heroBody.add(hat);
  const goggles=new THREE.Mesh(new THREE.BoxGeometry(.42,.1,.12),new THREE.MeshStandardMaterial({color:"#7ce0ff",emissive:"#2a7a9a",roughness:.2})); goggles.position.set(0,.7,-.26); heroBody.add(goggles);
  const pack=new THREE.Mesh(new THREE.BoxGeometry(.42,.48,.24),dark); pack.position.set(0,.12,.34); heroBody.add(pack);
  const reel=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.46,12),new THREE.MeshStandardMaterial({color:"#c9d3df",metalness:.7,roughness:.3})); reel.rotation.z=Math.PI/2; reel.position.set(0,.3,.46); heroBody.add(reel);
  { const bat=new THREE.Group(); bat.name="bat"; bat.position.set(.42,.25,-.05);
    const wood=new THREE.MeshStandardMaterial({color:"#c98d4b",roughness:.55});
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.075,.035,1.05,10),wood); barrel.position.y=.5; bat.add(barrel);
    const knob=new THREE.Mesh(new THREE.SphereGeometry(.05,8,6),wood); knob.position.y=-.03; bat.add(knob);
    bat.visible=false; heroBody.add(bat); heroBat=bat; }
  { const gun=new THREE.Group(); gun.position.set(.34,.28,-.2);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,1.3,8),new THREE.MeshStandardMaterial({color:"#2a2f38",metalness:.7,roughness:.35})); barrel.rotation.x=Math.PI/2; barrel.position.z=-.45; gun.add(barrel);
    const stock=new THREE.Mesh(new THREE.BoxGeometry(.12,.2,.5),new THREE.MeshStandardMaterial({color:"#5a3a22",roughness:.7})); stock.position.z=.15; gun.add(stock);
    const scope=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.36,8),new THREE.MeshStandardMaterial({color:"#1a1d22",metalness:.6})); scope.rotation.x=Math.PI/2; scope.position.set(0,.12,-.2); gun.add(scope);
    sniperGlowMat=new THREE.MeshStandardMaterial({color:"#3a3f48",emissive:"#000000",emissiveIntensity:2.5});
    const coil=new THREE.Mesh(new THREE.TorusGeometry(.08,.025,6,14),sniperGlowMat); coil.position.z=-.7; gun.add(coil); const coil2=coil.clone(); coil2.position.z=-.95; gun.add(coil2);
    gun.visible=false; heroBody.add(gun); heroGun=gun; }
  for (const side of [-1,1]){ const arm=new THREE.Group(); arm.name=side<0?"armL":"armR"; arm.position.set(side*.42,.3,0);
    const limb=new THREE.Mesh(new THREE.CapsuleGeometry(.1,.34,3,8),suit); limb.position.y=-.24; limb.name="limb"; arm.add(limb);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),skin); hand.position.y=-.48; arm.add(hand); heroBody.add(arm); }
  heroBody.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
}
const hand=new THREE.Vector3();
const wing=new THREE.Group(); hero.add(wing); wing.position.set(0,1.25,0); wing.visible=false;
{
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute([0,0,-1.2, -1.8,-.05,.75, 0,.18,.45,  0,0,-1.2, 0,.18,.45, 1.8,-.05,.75],3));
  g.setAttribute("color",new THREE.Float32BufferAttribute([1,.55,.25, 1,.55,.25, .49,.88,1,  1,.55,.25, .49,.88,1, 1,.55,.25],3));
  g.computeVertexNormals();
  const sail=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.7})); sail.castShadow=true; wing.add(sail);
  const barMat=new THREE.MeshStandardMaterial({color:"#c9d3df",metalness:.6,roughness:.35});
  const bar=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1.1,6),barMat); bar.rotation.z=Math.PI/2; bar.position.set(0,-.55,-.05); wing.add(bar);
  for (const sx of [-1,1]){ const st=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.62,6),barMat); st.position.set(sx*.28,-.27,.05); st.rotation.z=sx*.5; wing.add(st); }
}
let wingOpen=0, lastYaw=0, bobPhase=0, sitOff=0;

// rope + hook visuals
const rope=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1,6),new THREE.MeshStandardMaterial({color:"#e6eef7",roughness:.6})); rope.visible=false; scene.add(rope);
const hookTip=new THREE.Mesh(new THREE.ConeGeometry(.16,.4,6),new THREE.MeshStandardMaterial({color:"#c9d3df",metalness:.8,roughness:.25})); hookTip.visible=false; scene.add(hookTip);

// ---------------- input ----------------
const keys=new Set();
let yaw=Math.PI*.75, pitch=.28, camDist=7.5;
let gliderTime=0, gliding=false, glideSink=-3, inUpdraft=false, jumpHeldTouch=false;
const GLIDE_TIME=30, GLIDER_RESPAWN=15;
let pullHeld=false;   // Pull: drag what you've hooked (a prop, a friend, a bot) toward you instead of you toward it
let jumpQueued=false, hookHeld=false, reelHeld=false, running=false, locked=false, triedLock=false;
let isTouch = matchMedia("(pointer: coarse)").matches || ("ontouchstart" in window && navigator.maxTouchPoints>0);
const touchMove={x:0,y:0};
// player settings (saved per device) and input-aware UI: the game follows whatever you last touched
const SET_KEY="skyhook.settings.v1";
const settings=Object.assign({units:"imperial",announcer:"french",controls:"classic",assist:isTouch?1:0,sens:1,gyro:false,gyroInv:false,hud:isTouch?"compact":"full"},(()=>{ try{ return JSON.parse(localStorage.getItem(SET_KEY)||"{}")||{}; }catch(e){ return {}; } })());
// game mode: "race" (sparks) or "sumo" (knock everyone off; no sparks)
let MODE="race"; try{ MODE=localStorage.getItem("skyhook.mode")==="sumo"?"sumo":"race"; }catch(e){}
if (MAP.sumoOnly) MODE="sumo";   // arenas are sumo-only (not saved, so the next map goes back to your choice)
let SUMO_TIME=150, SUMO_KOS=10;
const sumo=()=>MODE==="sumo";
// speed units: the game runs in metres; imperial shows feet per second
const speedOut=ms=>settings.units==="metric" ? ms : ms*3.28084;
const speedUnit=()=>settings.units==="metric" ? "m/s" : "ft/s";
const saveSettings=()=>{ try{ localStorage.setItem(SET_KEY,JSON.stringify(settings)); }catch(e){} };
function applyInputUI(){
  const b=document.body; b.classList.toggle("in-touch",isTouch); b.classList.toggle("kbm",!isTouch);
  b.classList.toggle("hud-compact",settings.hud==="compact"); b.classList.toggle("sumo",MODE==="sumo"); b.classList.toggle("simple",settings.controls==="simple");
  $("keysDesk").hidden=isTouch; $("keysTouch").hidden=!isTouch; if (isTouch) $("hint").hidden=true;
  $("touch").hidden=!(isTouch && running); $("chatBtns").hidden=!isTouch;
}
function setInput(touch){ if (touch===isTouch) return; isTouch=touch; applyInputUI(); if (!touch && running) captureMouse(); }
addEventListener("pointerdown",e=>{ if (e.pointerType==="touch"||e.pointerType==="pen") setInput(true); else if (e.pointerType==="mouse" && running) setInput(false); },true);
applyInputUI();
addEventListener("keydown",e=>{
  if (document.activeElement===$("chatIn")) return;
  if (e.key==="Escape"){ pauseGame(); return; }
  if (running && e.key==="Enter"){ e.preventDefault(); openChat(); return; }
  if (running && (e.key==="v"||e.key==="V") && !e.repeat){ startVoice(); return; }
  if (!$("results").hidden && (e.key===" "||e.key==="Enter") && !e.repeat){ e.preventDefault(); resContinue(); return; }
  if (!running) return;
  if (!e.repeat && e.key.length>0) setInput(false);
  const k=e.key.toLowerCase();
  if (deadT>0 && (k===" "||k==="r")){ e.preventDefault(); if (!e.repeat) respawn(null); return; }
  keys.add(k);
  if (k===" "){ if (!e.repeat) jumpQueued=true; e.preventDefault(); }
  if (k==="e" && !e.repeat) hookDown();
  if (k==="c") pullHeld=true;
  if (k==="r") respawn("Respawned");
  if (k==="t" && !e.repeat) restartRun();
  if ((k==="f"||k==="q") && !e.repeat) attack();
  if (k==="g" && !e.repeat) useItem();
});
addEventListener("keyup",e=>{ const k=e.key.toLowerCase(); keys.delete(k); if (k==="c") pullHeld=false; if (k==="v") stopVoice(true); if(k==="e") hookUp(); });
addEventListener("blur",()=>{ keys.clear(); hookUp(); pauseGame(); });
document.addEventListener("visibilitychange",()=>{ if (document.hidden) pauseGame(); });
// mouse capture: Play/Resume asks for it, and clicking the game asks again if it was lost
function captureMouse(){
  if (isTouch || locked) return;
  const tryLock=opts=>{ try{ return canvas.requestPointerLock(opts); }catch(e){ return null; } };
  const r=tryLock({unadjustedMovement:true});
  if (r && r.catch) r.catch(()=>{ const r2=tryLock(); if (r2 && r2.catch) r2.catch(()=>{ if (running) toast("Click the game to capture the mouse"); }); });
}
function pauseGame(){
  if (!running) return;
  running=false; keys.clear(); hookUp(); reelHeld=false; pullHeld=false; dragLook=null;
  if (document.pointerLockElement) document.exitPointerLock();
  showStart(true);
}
canvas.addEventListener("contextmenu",e=>e.preventDefault());
let dragLook=null;
canvas.addEventListener("pointerdown",e=>{
  if (!running) return;
  if (e.pointerType==="touch"){ touchDown(e); return; }
  if (e.button===1){ e.preventDefault(); attack(); return; }
  if (locked || e.button===2){ hookDown(); return; }
  if (e.button===0){ captureMouse(); dragLook={x:e.clientX,y:e.clientY,id:e.pointerId}; try{canvas.setPointerCapture(e.pointerId);}catch(_){} }
});
canvas.addEventListener("pointermove",e=>{
  if (e.pointerType==="touch"){ touchMoveH(e); return; }
  if (locked){ look(e.movementX,e.movementY); return; }
  if (dragLook && e.pointerId===dragLook.id){ look(e.clientX-dragLook.x,e.clientY-dragLook.y); dragLook.x=e.clientX; dragLook.y=e.clientY; }
});
const pUp=e=>{ if (e.pointerType==="touch"){ touchUp(e); return; } if (dragLook && e.pointerId===dragLook.id) dragLook=null; if (locked || e.button===2) hookUp(); };
canvas.addEventListener("pointerup",pUp); canvas.addEventListener("pointercancel",pUp);
canvas.addEventListener("wheel",e=>{ camDist=Math.min(15,Math.max(3.5,camDist+e.deltaY*.01)); e.preventDefault(); },{passive:false});
let lookIdle=0;
function look(dx,dy){ if (Math.abs(dx)>250||Math.abs(dy)>250) return; const k=settings.sens; yaw-=dx*.0026*k; pitch=Math.min(1.25,Math.max(-.55,pitch+dy*.0022*k)); lookIdle=0; }
// gyro aim: turning the tablet turns the camera (rotation rates, mapped for the screen orientation)
let gyroOn=false;
function gyroHandler(e){
  const r=e.rotationRate; if (!running || !settings.gyro || !isTouch || !r) return;
  const iv=e.interval>1 ? e.interval/1000 : (e.interval||1/60), k=Math.PI/180*Math.min(.05,iv)*settings.sens*(settings.gyroInv?-1:1);
  const ang=(((screen.orientation&&screen.orientation.angle)!=null ? screen.orientation.angle : (window.orientation||0))+360)%360;
  let yr, up;   // yaw rate, look-up rate (deg/s)
  if (ang===90){ yr=r.beta; up=-r.gamma; } else if (ang===270){ yr=-r.beta; up=r.gamma; } else if (ang===180){ yr=-r.gamma; up=-r.beta; } else { yr=r.gamma; up=r.beta; }
  yaw+=(yr||0)*k; pitch=Math.min(1.25,Math.max(-.55,pitch-(up||0)*k)); lookIdle=0;
}
async function enableGyro(){
  try{ if (typeof DeviceMotionEvent!=="undefined" && typeof DeviceMotionEvent.requestPermission==="function"){ const r=await DeviceMotionEvent.requestPermission(); if (r!=="granted"){ toast("Gyro blocked","Allow motion access to use it."); return false; } } }catch(e){ return false; }
  if (!gyroOn){ addEventListener("devicemotion",gyroHandler); gyroOn=true; } return true;
}
document.addEventListener("pointerlockchange",()=>{
  locked = document.pointerLockElement===canvas;
  if (!locked && running && !isTouch) pauseGame();
});
// touch: left side moves, right side looks
let joy=null, lookT=null;
function touchDown(e){
  if (e.clientX<innerWidth*.45 && !joy){ joy={id:e.pointerId,x0:e.clientX,y0:e.clientY}; const j=$("joy"); j.hidden=false; j.style.left=e.clientX+"px"; j.style.top=e.clientY+"px"; $("joyKnob").style.transform=""; }
  else if (!lookT) lookT={id:e.pointerId,x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,t0:performance.now()};
}
function touchMoveH(e){
  if (joy && e.pointerId===joy.id){ let dx=e.clientX-joy.x0, dy=e.clientY-joy.y0; const L=Math.hypot(dx,dy), m=55; if(L>m){ dx*=m/L; dy*=m/L; }
    touchMove.x=dx/m; touchMove.y=-dy/m; $("joyKnob").style.transform=`translate(${dx}px,${dy}px)`; }
  else if (lookT && e.pointerId===lookT.id){ look((e.clientX-lookT.x)*2.4,(e.clientY-lookT.y)*2.4); lookT.x=e.clientX; lookT.y=e.clientY; }
}
function touchUp(e){ if (joy && e.pointerId===joy.id){ joy=null; touchMove.x=touchMove.y=0; $("joy").hidden=true; } if (lookT && e.pointerId===lookT.id){ const tap=Math.hypot(e.clientX-lookT.x0,e.clientY-lookT.y0)<14 && performance.now()-lookT.t0<320; lookT=null; if (tap && settings.controls==="simple") tapHook(e.clientX,e.clientY); } }
// simple controls: tap where you want to go; the hook fires there and reels you in. Tap again (or Jump) to let go.
const tapRay=new THREE.Raycaster(), tapNdc=new THREE.Vector2();
function tapHook(x,y){
  if (!running || deadT>0 || raceCount>0) return;
  if (hook){ hookUp(); return; }
  tapNdc.set(x/innerWidth*2-1,-(y/innerHeight)*2+1); tapRay.setFromCamera(tapNdc,camera);
  const d=tapRay.ray.direction.clone();
  aimHit=castAim(d) || assistAim(d,Math.max(1,settings.assist)); hookDown();
}
const holdBtn=(id,down,up)=>{ const b=$(id); b.addEventListener("pointerdown",e=>{ e.preventDefault(); b.classList.add("on"); down(); }); const u=()=>{ b.classList.remove("on"); up&&up(); }; b.addEventListener("pointerup",u); b.addEventListener("pointercancel",u); b.addEventListener("pointerleave",u); };
holdBtn("tHook",()=>hookDown(),()=>hookUp());
holdBtn("tReel",()=>{reelHeld=true;},()=>{reelHeld=false;});
holdBtn("tPull",()=>{pullHeld=true;},()=>{pullHeld=false;});
holdBtn("tHit",()=>attack());
holdBtn("tItem",()=>useItem());
holdBtn("tJump",()=>{ if (deadT>0){ respawn(null); return; } jumpQueued=true; jumpHeldTouch=true;},()=>{jumpHeldTouch=false;});

// ---------------- audio ----------------
// ---------------- audio ----------------
// Everything is synthesized with Web Audio: no sound files to download.
let ac=null, master=null, sfxBus=null, musicBus=null, noiseBuf=null;
const audioOpts={music:"always",sfx:true,voice:true};
try{ Object.assign(audioOpts, JSON.parse(localStorage.getItem("skyhook.audio")||"{}")); }catch(e){}
function audioOn(){
  if (!ac){ try{
    ac=new (window.AudioContext||window.webkitAudioContext)();
    master=ac.createDynamicsCompressor(); master.threshold.value=-12; master.ratio.value=4; master.connect(ac.destination);
    sfxBus=ac.createGain(); sfxBus.gain.value=audioOpts.sfx?1:0; sfxBus.connect(master);
    musicBus=ac.createGain(); musicBus.gain.value=0; musicBus.connect(master);
    noiseBuf=ac.createBuffer(1,ac.sampleRate,ac.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  }catch(e){ ac=null; } }
  if (ac && ac.state==="suspended") ac.resume().catch(()=>{});
  loadClips();
}
function tone(f,d,type="sine",vol=.08,slide=1,delay=0,bus){ if(!ac) return; const t=ac.currentTime+delay, o=ac.createOscillator(), g=ac.createGain(); o.type=type; o.frequency.setValueAtTime(f,t); if(slide!==1) o.frequency.exponentialRampToValueAtTime(Math.max(30,f*slide),t+d); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+d); o.connect(g).connect(bus||sfxBus); o.start(t); o.stop(t+d+.05); }
function noise(d,{type="bandpass",f=1000,f2=0,q=1,vol=.3,delay=0,at=0,bus}={}){
  if(!ac) return; const t=(at||ac.currentTime)+delay, src=ac.createBufferSource(), fl=ac.createBiquadFilter(), g=ac.createGain();
  src.buffer=noiseBuf; src.loop=true; fl.type=type; fl.frequency.setValueAtTime(f,t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2,t+d); fl.Q.value=q;
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+d);
  src.connect(fl).connect(g).connect(bus||sfxBus); src.start(t,Math.random()*.5); src.stop(t+d+.05);
}
const whoosh=bat=>noise(bat?.3:.2,{type:"bandpass",f:bat?500:800,f2:bat?2600:2000,q:1.4,vol:bat?.35:.22});
const crack=()=>{ noise(.07,{type:"highpass",f:2000,vol:.8}); tone(210,.12,"triangle",.3,.45); tone(80,.25,"sine",.35,.6); };
const thud=()=>{ noise(.14,{type:"lowpass",f:450,vol:.7}); tone(120,.16,"sine",.3,.5); };
const splashS=()=>{ noise(.7,{type:"lowpass",f:1800,f2:180,vol:.55}); tone(330,.3,"sine",.08,.35); };


// ---------------- grapple ----------------
const ray=new THREE.Raycaster(); ray.far=80;
const HOOK_RANGE=75, HOOK_SPEED=150;
let hook=null; // {phase, tip, target(local or world), body, len}
let aimHit=null;
const tmpV=new THREE.Vector3(), tmpV2=new THREE.Vector3();
function anchorWorld(h,out){
  if (h.remote){ const a=avatars.get(h.remote)||botAvatars.get(h.remote); if (!a){ if (h.phase!=="retract") h.phase="retract"; return out.copy(h.point); } h.point.copy(a.disp); h.point.y+=.3; return out.copy(h.point); }
  if(h.body){ const w=h.body.pointToWorldFrame(h.local,new CANNON.Vec3()); return out.set(w.x,w.y,w.z); } return out.copy(h.point); }
function hookDown(){
  if (!running || raceCount>0) return; hookHeld=true; audioOn();
  if (hook) return;
  const dir=new THREE.Vector3(); camera.getWorldDirection(dir);
  if (aimHit){
    const body=aimHit.object.userData.body||null;
    const h={phase:"fly",tip:hand.clone(),body,point:aimHit.point.clone(),miss:false,remote:aimHit.object.userData.remote||null,obj:aimHit.object};
    if (body){ h.local=body.pointToLocalFrame(new CANNON.Vec3(aimHit.point.x,aimHit.point.y,aimHit.point.z)); }
    hook=h;
  } else {
    hook={phase:"fly",tip:hand.clone(),body:null,point:camera.position.clone().addScaledVector(dir,HOOK_RANGE),miss:true};
  }
  tone(900,.12,"sawtooth",.04,.4);
}
function hookUp(){ hookHeld=false; if (hook && hook.phase!=="retract") { hook.phase="retract"; } }
// pull something toward a point at up to `speed` m/s (props, bots on the controller's game, or me when a friend pulls)
function pullToward(body,tx,ty,tz,speed,dt){
  const p=body.position, dx=tx-p.x, dy=ty-p.y, dz=tz-p.z, d=Math.hypot(dx,dy,dz)||1, nx=dx/d, ny=dy/d, nz=dz/d, v=body.velocity;
  if (d<2.4){ v.x*=.85; v.z*=.85; return d; }
  const along=v.x*nx+v.y*ny+v.z*nz; if (along<speed){ const k=(speed-along)*Math.min(1,10*dt); v.x+=nx*k; v.y+=ny*k+26*dt*.5; v.z+=nz*k; }
  if (body.wakeUp) body.wakeUp(); return d;
}
function ropeStep(dt){
  if (!hook || hook.phase!=="attached") return;
  if (pullHeld && (hook.remote || (hook.body && hook.body.mass>0))){
    const A=anchorWorld(hook,tmpV), p=pBody.position; hook.len=Math.max(1.6,Math.hypot(A.x-p.x,A.y-p.y,A.z-p.z));
    if (hook.body) pullToward(hook.body,p.x,p.y+.5,p.z,Math.max(8,20/Math.sqrt(hook.body.mass)),dt);
    else if (hook.remote.startsWith("bot:") && amController){ const b=bots.find(o=>"bot:"+o.id===hook.remote); if (b){ pullToward(b.body,p.x,p.y+.3,p.z,13,dt); b.knockUntil=simTime+.2; b.hook=null; b.lastHitBy={peer:myPeer||"me",name:myName(),t:simTime}; } }
    if (!hook.pullCounted){ hook.pullCounted=true; stats.pulls=(stats.pulls||0)+1; tone(260,.25,"sawtooth",.04,1.6); }
    return;
  }
  const A=anchorWorld(hook,tmpV), p=pBody.position;
  const dx=A.x-p.x, dy=A.y-p.y, dz=A.z-p.z, dist=Math.hypot(dx,dy,dz)||1e-6, nx=dx/dist, ny=dy/dist, nz=dz/dist;
  if (reelHeld || keys.has("shift") || (settings.controls==="simple" && isTouch)) hook.len=Math.max(1.6,hook.len-24*dt);
  if (dist<=hook.len) return;
  const dyn = hook.body && hook.body.mass>0 ? hook.body : null;
  let vax=0,vay=0,vaz=0;
  if (dyn){ const va=dyn.getVelocityAtWorldPoint(new CANNON.Vec3(A.x,A.y,A.z),new CANNON.Vec3()); vax=va.x; vay=va.y; vaz=va.z; dyn.wakeUp(); }
  const v=pBody.velocity;
  const rel=(v.x-vax)*nx+(v.y-vay)*ny+(v.z-vaz)*nz; // + is towards anchor
  const err=dist-hook.len;
  const mp=pBody.mass, mb=dyn?dyn.mass:Infinity, share = dyn ? mb/(mp+mb) : 1;
  let dv = Math.max(0,-rel) + err*30*dt + (err>.3 ? err*4 : 0)*dt*10;
  const j=dv*share;
  v.x+=nx*j; v.y+=ny*j; v.z+=nz*j;
  if (dyn){ const imp=dv*(mp*mb/(mp+mb)); dyn.applyImpulse(new CANNON.Vec3(-nx*imp,-ny*imp,-nz*imp),new CANNON.Vec3(A.x-dyn.position.x,A.y-dyn.position.y,A.z-dyn.position.z)); }
}
function updateHook(dt){
  if (!hook) { rope.visible=hookTip.visible=false; return; }
  if (hook.phase==="fly"){
    const target = (hook.body||hook.remote) ? anchorWorld(hook,tmpV2) : hook.point;
    const d=target.distanceTo(hook.tip), step=HOOK_SPEED*dt;
    if (d<=step){ hook.tip.copy(target);
      if (hook.miss){ hook.phase="retract"; }
      else { hook.phase="attached"; onHookBite(hook); hook.len=Math.max(1.6,hook.tip.distanceTo(new THREE.Vector3(pBody.position.x,pBody.position.y,pBody.position.z))*.97); tone(1400,.07,"square",.05); tone(500,.1,"triangle",.05,1,.03); if(hook.body) hook.body.wakeUp(); if(!hookHeld) hook.phase="retract"; }
    } else hook.tip.addScaledVector(tmpV.subVectors(target,hook.tip).normalize(),step);
  } else if (hook.phase==="attached"){ anchorWorld(hook,hook.tip); }
  else if (hook.phase==="retract"){
    const d=hand.distanceTo(hook.tip), step=HOOK_SPEED*1.3*dt;
    if (d<=step){ hook=null; rope.visible=hookTip.visible=false; return; }
    hook.tip.addScaledVector(tmpV.subVectors(hand,hook.tip).normalize(),step);
  }
  // draw rope from hand to tip
  const len=hand.distanceTo(hook.tip);
  rope.visible=hookTip.visible=true;
  rope.position.copy(hand).add(hook.tip).multiplyScalar(.5);
  rope.scale.set(1,Math.max(.01,len),1);
  rope.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tmpV.subVectors(hook.tip,hand).normalize());
  hookTip.position.copy(hook.tip); hookTip.quaternion.copy(rope.quaternion);
}

// ---------------- movement ----------------
let grounded=false, onGround=false, lastJump=-9, lastGround=-9, airJumps=1, simTime=0, groundNormalY=1;
// Hover controller: instead of letting the collision sphere scrape over terrain triangles (noisy),
// measure the ground under the player each step and hold the body a few cm above it with a stiff spring.
const RIDE=.62, PROBE=.55;
let yanked=false;
let standing=false;
const rayFrom=new CANNON.Vec3(), rayTo=new CANNON.Vec3(), rayRes=new CANNON.RaycastResult();
function groundBelow(p){
  let gy=-Infinity, ny=1;
  const lx=p.x+HALF, ly=HALF-p.z;
  if (lx>=0 && ly>=0 && lx<=S && ly<=S){
    gy=terrainHF.getHeightAt(lx,ly,true);
    const e=.6, hx=terrainHF.getHeightAt(Math.min(S,lx+e),ly,true)-terrainHF.getHeightAt(Math.max(0,lx-e),ly,true), hz=terrainHF.getHeightAt(lx,Math.min(S,ly+e),true)-terrainHF.getHeightAt(lx,Math.max(0,ly-e),true);
    ny=1/Math.sqrt(1+(hx/(2*e))**2+(hz/(2*e))**2);
  }
  rayFrom.set(p.x,p.y,p.z); rayTo.set(p.x,p.y-RIDE-PROBE-.3,p.z); rayRes.reset();
  world.raycastClosest(rayFrom,rayTo,{collisionFilterMask:1,skipBackfaces:true},rayRes);
  if (rayRes.hasHit && rayRes.hitPointWorld.y>gy){ gy=rayRes.hitPointWorld.y; ny=rayRes.hitNormalWorld.y; }
  return [gy,ny];
}
// anti-tunnelling: at swing and dive speeds a body can move more than its own size in one step and skip through
// the terrain surface (or a thin pillar). Before each step, clip velocity that would end inside the terrain or a
// static body; after it, lift anything that still ended up under the surface. Player only: the bots' trained
// swing settings were tuned without it (the bench dropped from 129 to 115-124 with it on bots).
function hfAt(x,z){ const lx=x+HALF, ly=HALF-z; if (lx<0||ly<0||lx>S||ly>S) return -Infinity; return terrainHF.getHeightAt(lx,ly,true); }
const ccdN=new THREE.Vector3(), ccdFrom=new CANNON.Vec3(), ccdTo=new CANNON.Vec3(), ccdRes=new CANNON.RaycastResult();
function hfNormal(x,z,out){ const e=.8, dx=(hfAt(x+e,z)-hfAt(x-e,z))/(2*e), dz=(hfAt(x,z+e)-hfAt(x,z-e))/(2*e); return out.set(-dx,1,-dz).normalize(); }
function clipInto(v,n){ const vn=v.x*n.x+v.y*n.y+v.z*n.z; if (vn<0){ v.x-=n.x*vn; v.y-=n.y*vn; v.z-=n.z*vn; } }
function antiTunnelPre(body,dt,r){
  const v=body.velocity, p=body.position;
  const nx=p.x+v.x*dt, ny=p.y+v.y*dt, nz=p.z+v.z*dt, g=hfAt(nx,nz);
  if (g>-Infinity && ny<g+r*.9) clipInto(v,hfNormal(nx,nz,ccdN));
  const sp=Math.hypot(v.x,v.y,v.z);
  if (sp>15){ const L=sp*dt+r; ccdFrom.set(p.x,p.y,p.z); ccdTo.set(p.x+v.x/sp*L,p.y+v.y/sp*L,p.z+v.z/sp*L); ccdRes.reset();
    world.raycastClosest(ccdFrom,ccdTo,{collisionFilterMask:1,skipBackfaces:true},ccdRes);
    if (ccdRes.hasHit && ccdRes.body!==body && ccdRes.body.mass===0){ const n=ccdRes.hitNormalWorld; ccdN.set(n.x,n.y,n.z); clipInto(v,ccdN); } }
}
function antiTunnelPost(body,r){
  const p=body.position, g=hfAt(p.x,p.z); if (!(g>-Infinity) || p.y>g+r*.5) return false;
  p.y=g+r*.9; clipInto(body.velocity,hfNormal(p.x,p.z,ccdN)); return true;
}
world.addEventListener("preStep",()=>{
  const dt=world.dt||1/60;
  ropeStep(dt);
  inUpdraft=false;
  for (const u of updrafts){ const p=pBody.position; if (Math.hypot(p.x-u.x,p.z-u.z)<(gliding?4.5:2.8) && p.y<u.top+(gliding?25:0) && p.y>u.g-1){ inUpdraft=true; if(!gliding) pBody.velocity.y=Math.min(22,pBody.velocity.y+70*dt); } }
  // a friend who has hooked you pulls you toward them (they get pulled toward you on their side)
  yanked=false;
  if (myPeer) for (const a of avatars.values()){
    const h=a.pres && a.pres.h; if (!Array.isArray(h) || h[0]!==2 || h[5]!==myPeer) continue;
    if (h[6]===1 && shieldT<=0){ pullToward(pBody,a.disp.x,a.disp.y+.3,a.disp.z,13,dt); yanked=true; knockUntil=Math.max(knockUntil,simTime+.15); lastHitBy={peer:a.peer,name:a.name,t:simTime}; if (hook) hook.phase="retract"; continue; }
    const L=Math.max(1.6,+h[4]||0), p=pBody.position, v=pBody.velocity;
    const dx=a.disp.x-p.x, dy=a.disp.y+.3-p.y, dz=a.disp.z-p.z, d=Math.hypot(dx,dy,dz)||1;
    if (d>L){ const nx=dx/d, ny=dy/d, nz=dz/d, rel=v.x*nx+v.y*ny+v.z*nz; const k=Math.max(0,-rel)*.5+(d-L)*10*dt; v.x+=nx*k; v.y+=ny*k; v.z+=nz*k; yanked=true; }
  }
  standing=false;
  { const p=pBody.position, v=pBody.velocity, att=hook && hook.phase==="attached";
    if (!att && !yanked && simTime>knockUntil && !gliding && !inUpdraft && simTime-lastJump>.2 && v.y<6){
      const [gy,ny]=groundBelow(p), h=p.y-gy;
      if (ny>.6 && h<RIDE+PROBE){ standing=true; groundNormalY=ny;
        const target=(gy+RIDE-p.y)*18;            // spring toward ride height
        v.y=Math.max(-20,Math.min(10,target))+26*dt;  // + gravity, which the integrator subtracts this step
      } } }
  if (gliding){
    // the wing cancels most of gravity and settles you at a sink rate; updrafts become lift
    const v=pBody.velocity, target = inUpdraft ? 9 : glideSink;
    v.y += 26*dt; v.y += (target - v.y)*(1-Math.exp(-4*dt));
  }
  if (deadT<=0) antiTunnelPre(pBody,dt,.5);
  magnetStep(pBody,meMag,dt,true); if (traps.length && deadT<=0) trapForces(pBody,dt,true,null);
  // fast enough and you go straight through a wall
  { const v=pBody.velocity, sp=Math.hypot(v.x,v.y,v.z); if (sp>21 && towers.length){ const p=pBody.position;
      if (blastTowers(p.x+v.x*.06,p.y+v.y*.06,p.z+v.z*.06,1.9,.7)){ v.x*=.9; v.y*=.9; v.z*=.9; crack(); shakeT=Math.max(shakeT,.25); stats.smashes++; } } }
  botsPreStep(dt);
});
world.addEventListener("postStep",()=>{
  if (deadT<=0) antiTunnelPost(pBody,.5);
  let g=false, best=0;
  for (const c of world.contacts){
    let ny=null; if (c.bi===pBody) ny=-c.ni.y; else if (c.bj===pBody) ny=c.ni.y;
    if (ny!==null && ny>.55){ g=true; best=Math.max(best,ny); }
  }
  grounded=g||standing; simTime+=world.dt||1/60;
  if (grounded){ lastGround=simTime; airJumps=1; }
  onGround = grounded || (simTime-lastGround<.1 && simTime-lastJump>.25);
});
const fwd=new THREE.Vector3(), right=new THREE.Vector3(), wish=new THREE.Vector3();
function controls(dt){
  if (settings.controls==="simple" && isTouch && !lookT && !(hook && hook.phase==="attached") && !settings.gyro){
    lookIdle+=dt; const hv=pBody.velocity, hs=Math.hypot(hv.x,hv.z);
    if (lookIdle>.6 && hs>2.5){ let dy=Math.atan2(-hv.x,-hv.z)-yaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy)); yaw+=dy*(1-Math.exp(-2.2*dt)); pitch+=(.32-pitch)*(1-Math.exp(-1.2*dt)); } }
  if (deadT>0){ const sink=Math.min(3,(deadFor-deadT)*.5); pBody.position.set(deathPos.x,-2.2-sink,deathPos.z); pBody.velocity.set(0,0,0); jumpQueued=false; return; }
  if (raceCount>0){ pBody.velocity.x=0; pBody.velocity.z=0; jumpQueued=false; return; }
  let ix=touchMove.x, iy=touchMove.y;
  if (keys.has("w")||keys.has("arrowup")) iy+=1; if (keys.has("s")||keys.has("arrowdown")) iy-=1;
  if (keys.has("d")||keys.has("arrowright")) ix+=1; if (keys.has("a")||keys.has("arrowleft")) ix-=1;
  const L=Math.hypot(ix,iy); if (L>1){ ix/=L; iy/=L; }
  fwd.set(-Math.sin(yaw),0,-Math.cos(yaw)); right.set(Math.cos(yaw),0,-Math.sin(yaw));
  wish.copy(right).multiplyScalar(ix).addScaledVector(fwd,iy);
  if (wish.lengthSq()>0 || jumpQueued || hookHeld) startRunIfReady();
  const attached = hook && hook.phase==="attached";
  const sprint = keys.has("shift") && !attached;
  const speed = sprint ? 13 : 8.5;
  const v=pBody.velocity;
  if (onGround && !attached && !yanked && simTime>knockUntil){
    const k=1-Math.exp(-(MAP.theme.ice?2.6:14)*dt); v.x+=(wish.x*speed-v.x)*k; v.z+=(wish.z*speed-v.z)*k;   // ice: you keep your momentum
  } else if (wish.lengthSq()>0){
    const acc = attached ? 18 : 11, along=v.x*wish.x+v.z*wish.z, wl=wish.length();
    if (along < speed*wl || attached){ v.x+=wish.x*acc*dt; v.z+=wish.z*acc*dt; }
  }
  if (jumpQueued && meMag.mag){ jumpQueued=false; meMag.mash=(meMag.mash||0)+1; tone(300+meMag.mash*80,.06,"square",.04); if (meMag.mash>=4){ meMag.free=simTime+2.5; meMag.mag=null; v.y=-4; toast("Broke free!"); } }
  if (jumpQueued){
    jumpQueued=false;
    if (attached){ hook.phase="retract"; v.y=Math.max(v.y,0)+8; const hs=Math.hypot(v.x,v.z); if(hs>1){ v.x*=1.12; v.z*=1.12; } tone(600,.15,"triangle",.06,1.8); }
    else if (onGround || simTime-lastGround<.12){ v.y=11; lastGround=-9; lastJump=simTime; tone(420,.1,"triangle",.05,1.6); }
    else if (airJumps>0){ airJumps--; v.y=Math.max(v.y,9.5); tone(560,.12,"triangle",.05,1.6); puff(pBody.position); }
  }
  const wantGlide = gliderTime>0 && !onGround && !attached && (keys.has(" ")||jumpHeldTouch) && (v.y<0 || gliding);
  if (wantGlide && !gliding){ tone(300,.35,"sawtooth",.035,2.2); }
  gliding = wantGlide;
  if (gliding){
    const dive=Math.min(1,Math.max(0,(pitch-.15)/.9));
    glideSink = -(2.2+dive*9);
    const tgt=15+dive*16, hsp=Math.hypot(v.x,v.z)||.001;
    const spd = hsp>tgt ? hsp-3*dt : hsp+(tgt-hsp)*(1-Math.exp(-1.3*dt));
    const dx=fwd.x+right.x*ix*.7, dz=fwd.z+right.z*ix*.7, dl=Math.hypot(dx,dz)||1;
    const k=1-Math.exp(-2.4*dt);
    let nx=v.x/hsp+(dx/dl-v.x/hsp)*k, nz=v.z/hsp+(dz/dl-v.z/hsp)*k; const nl=Math.hypot(nx,nz)||1;
    v.x=nx/nl*spd; v.z=nz/nl*spd;
  }
  const hs=Math.hypot(v.x,v.z); if (hs>45){ v.x*=45/hs; v.z*=45/hs; }
}

// ---------------- camera ----------------
const camTarget=new THREE.Vector3(), camWant=new THREE.Vector3(), lookAtV=new THREE.Vector3();
let camSmooth=null, camCur=7.5, camDt=1/60;
function updateCamera(){
  const p=pBody.interpolatedPosition;
  const tgt = deadT>0 ? tmpV.set(deathPos.x,1.2,deathPos.z) : tmpV.set(p.x,p.y+1.1,p.z);
  if (deadT>0) yaw+=camDt*.22;
  if (!camSmooth) camSmooth=tgt.clone();
  else { camSmooth.x=tgt.x; camSmooth.z=tgt.z; camSmooth.y+=(tgt.y-camSmooth.y)*(1-Math.exp(-18*camDt)); }
  right.set(Math.cos(yaw),0,-Math.sin(yaw));
  camTarget.copy(camSmooth).addScaledVector(right,.7);
  const cp=Math.cos(pitch);
  camWant.set(Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp).multiplyScalar(deadT>0?Math.max(camDist,11):camDist).add(camTarget);
  // keep the camera out of walls and hills
  const dir=tmpV2.subVectors(camWant,camTarget); const dl=dir.length(); dir.divideScalar(dl);
  ray.set(camTarget,dir); ray.far=dl;
  const hit=ray.intersectObjects(camBlockers,false)[0];
  let allow=Math.min(dl, hit?hit.distance-.35:dl, terrainRay(camTarget,dir,dl)-.5);
  allow=Math.max(.8,allow);
  camCur = allow<camCur ? allow : camCur+(allow-camCur)*(1-Math.exp(-4*camDt));
  camWant.copy(camTarget).addScaledVector(dir,camCur);
  const gy=Math.max(H(camWant.x,camWant.z)+.6, deadT>0?1.5:-99); if (camWant.y<gy) camWant.y=gy;
  camera.position.copy(camWant);
  if (shakeT>0){ camera.position.x+=(Math.random()-.5)*shakeT*.7; camera.position.y+=(Math.random()-.5)*shakeT*.7; shakeT=Math.max(0,shakeT-camDt); }
  camera.lookAt(camTarget);
  sky.position.copy(camera.position);
  sunDisc.position.copy(camera.position).addScaledVector(SUN_DIR,700);
  for (const c of clouds){ c.position.x+=camDt*2.2; if (c.position.x>520) c.position.x-=1040; }
  // aim
  const ad=tmpV2; camera.getWorldDirection(ad);
  aimHit=castAim(ad); let assisted=false;
  if (!aimHit && settings.assist>0 && !hook){ assistT-=camDt; if (assistT<=0){ assistT=.12; assistHit=assistAim(ad,settings.assist); } aimHit=assistHit; assisted=!!aimHit; } else { assistHit=null; assistT=0; }
  $("cross").classList.toggle("lock",!!aimHit && !hook);
  const dot=$("assistDot");
  if (assisted){ const q=tmpV.copy(aimHit.point).project(camera); dot.hidden=false; dot.style.transform=`translate(${(q.x+1)/2*innerWidth}px,${(1-q.y)/2*innerHeight}px)`; } else if (!dot.hidden) dot.hidden=true;
}
// what the hook would bite along a direction from the camera (objects or terrain, within range of the hand)
function castAim(d){
  ray.set(camera.position,d); ray.far=HOOK_RANGE+camDist;
  const skip=camera.position.distanceTo(camTarget)-.2;
  let objHit=null;
  for (const h of ray.intersectObjects(grappleables,false)){ if (h.distance>skip){ objHit=h; break; } }
  const o2=tmpV.copy(camera.position).addScaledVector(d,skip);
  const td=terrainRay(o2,d,HOOK_RANGE+2)+skip;
  if (td<Infinity && (!objHit || td<objHit.distance)) objHit={distance:td, point:camera.position.clone().addScaledVector(d,td), object:terrainMesh};
  return objHit && objHit.point.distanceTo(hand)<=HOOK_RANGE ? objHit : null;
}
// aim assist: if the crosshair misses, look in widening rings around it for something to hook (Low ~4.5°, High ~9°)
let assistT=0, assistHit=null; const assistDir=new THREE.Vector3(), aRight=new THREE.Vector3(), aUp=new THREE.Vector3();
function assistAim(d,level){
  aRight.crossVectors(d,UP); if (aRight.lengthSq()<1e-6) return null; aRight.normalize(); aUp.crossVectors(aRight,d).normalize();
  const maxA=(level>=2?9:4.5)*Math.PI/180;
  for (const f of [.34,.67,1]){ const ta=Math.tan(maxA*f); let best=null;
    for (let k=0;k<8;k++){ const th=k/8*Math.PI*2+f; assistDir.copy(d).addScaledVector(aRight,Math.cos(th)*ta).addScaledVector(aUp,Math.sin(th)*ta).normalize();
      const h=castAim(assistDir); if (h && (!best || h.distance<best.distance)) best=h; }
    if (best) return best; }
  return null;
}

// ---------------- effects ----------------
const puffs=[];
const puffMat=new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.6,depthWrite:false});
function puff(p){ for(let i=0;i<6;i++){ const m=new THREE.Mesh(new THREE.SphereGeometry(.18,6,4),puffMat.clone()); m.position.set(p.x,p.y-.4,p.z); m.userData.v=new THREE.Vector3((Math.random()-.5)*4,Math.random()*1.5,(Math.random()-.5)*4); m.userData.t=0; scene.add(m); puffs.push(m); } }
// splashes: droplets thrown up in an arc, a ring spreading on the surface, a quick white column
const drops=[], dropGeo=new THREE.SphereGeometry(.13,5,4), ringGeo=new THREE.RingGeometry(.8,1.1,28);
const dropMat=new THREE.MeshBasicMaterial({color:MAP.theme.waterGlow?(MAP.theme.emberColor||"#ff8a3d"):"#e8f6ff",transparent:true,opacity:.9,depthWrite:false});
function splash(x,z,big=1){
  const n=Math.round(36*big);
  for (let i=0;i<n;i++){ const m=new THREE.Mesh(dropGeo,dropMat); const a=Math.random()*Math.PI*2, out=(1.5+Math.random()*4)*big;
    m.position.set(x+Math.cos(a)*.5,.1,z+Math.sin(a)*.5); m.scale.setScalar(.6+Math.random()*1.2*big);
    m.userData={v:new THREE.Vector3(Math.cos(a)*out,(6+Math.random()*9)*Math.sqrt(big),Math.sin(a)*out),t:0,kind:"drop"}; scene.add(m); drops.push(m); }
  for (let k=0;k<2;k++){ const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:dropMat.color,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}));
    m.rotation.x=-Math.PI/2; m.position.set(x,.06,z); m.userData={t:-k*.25,kind:"ring",big}; scene.add(m); drops.push(m); }
  const col=new THREE.Mesh(new THREE.CylinderGeometry(.5*big,.9*big,1,10,1,true),new THREE.MeshBasicMaterial({color:dropMat.color,transparent:true,opacity:.6,depthWrite:false}));
  col.position.set(x,0,z); col.userData={t:0,kind:"col",big}; scene.add(col); drops.push(col);
}
function watchSplash(a){ const y=a.disp.y; if (a.has && a.prevY!=null && a.prevY>-.4 && y<=-.4 && Math.hypot(a.disp.x,a.disp.z)>0){ splash(a.disp.x,a.disp.z,1); if (camera.position.distanceTo(a.disp)<60) splashS(); } a.prevY=y; }
function updateDrops(dt){
  for (const a of avatars.values()) watchSplash(a);
  for (const a of botAvatars.values()) watchSplash(a);
  for (let i=drops.length-1;i>=0;i--){ const m=drops[i], u=m.userData; u.t+=dt; let dead=false;
    if (u.kind==="drop"){ u.v.y-=26*dt; m.position.addScaledVector(u.v,dt); dead=m.position.y<-.2 && u.v.y<0; }
    else if (u.kind==="ring"){ if (u.t<0) { m.visible=false; continue; } m.visible=true; const s2=1+u.t*5*u.big; m.scale.set(s2,s2,1); m.material.opacity=.8*Math.max(0,1-u.t/1.4); dead=u.t>1.4; }
    else { const h=Math.sin(Math.min(1,u.t/.7)*Math.PI)*5*u.big; m.scale.y=Math.max(.01,h); m.position.y=h/2; m.material.opacity=.6*(1-u.t/.7); dead=u.t>.7; }
    if (dead){ scene.remove(m); if (u.kind!=="drop"){ m.material.dispose(); if (u.kind==="col") m.geometry.dispose(); } drops.splice(i,1); } }
}
// death cam: after a splash you sink and the camera lingers so you can admire it; Space (or Jump) skips
let DEATH_SECS=10; try{ const d=localStorage.getItem("skyhook.deathcam"); if (d!=null) DEATH_SECS=+d; }catch(e){}
let deadT=0, deadFor=0; const deathPos=new THREE.Vector3();
function startDeathCam(title,sub){
  deadT=deadFor=MODE==="sumo"?Math.min(DEATH_SECS,3):DEATH_SECS; deathPos.set(pBody.position.x,0,pBody.position.z); hook=null; gliding=false;
  $("deathTitle").textContent=title; $("deathSub").textContent=sub||""; $("death").hidden=false; renderDeath();
}
function renderDeath(){ const el=$("deathCount"), txt=`Respawn in ${Math.ceil(deadT)} · ${isTouch?"tap here or Jump":"Space"} to go now`; if (el.textContent!==txt) el.textContent=txt; }
let toastT=0;
function toast(big,small){ const t=$("toast"); t.replaceChildren(document.createTextNode(big)); if(small){ const s=document.createElement("small"); s.textContent=small; t.append(s); } t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2200); }
let lastSafe=spawnPos.clone(), safeT=0;
function respawn(msg){
  deadT=0; $("death").hidden=true;
  if (MODE==="sumo" && running){ const q=landNear(Math.random()<.5?SPAWN:PEAK); lastSafe.set(q[0],q[1],q[2]); }
  pBody.position.copy(lastSafe); pBody.position.y+=1.5; pBody.velocity.set(0,0,0); pBody.interpolatedPosition.copy(pBody.position); hook=null; camSmooth=null; gliding=false;
  if (msg) toast(msg); tone(220,.3,"sine",.07,.5);
}

// ---------------- HUD / game flow ----------------
let got=0, elapsed=0, finished=false;
// speedrun: runState is "ready" (waiting for first input), "running" or "done"
let runState="ready", splits=[], pb=null, gold=[];
const SPLIT_KEY= MAP.key==="isles" ? "skyhook.splits.v1" : "skyhook.splits.v1."+MAP.key;
try{ const raw=JSON.parse(localStorage.getItem(SPLIT_KEY)||"null"); if(raw){ if(Array.isArray(raw.pb)&&raw.pb.length) pb=raw.pb.map(Number); if(Array.isArray(raw.gold)) gold=raw.gold.map(Number); } }catch(e){}
const saveSplits=()=>{ try{ localStorage.setItem(SPLIT_KEY,JSON.stringify({pb,gold})); }catch(e){} };
const fmt=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
const fmtT=s=>{ const m=Math.floor(s/60), r=s-m*60; return `${m}:${r.toFixed(2).padStart(5,"0")}`; };
const fmtD=d=>{ const a=Math.abs(d), sgn=d<0?"−":"+"; return a>=60 ? sgn+fmt(a) : sgn+a.toFixed(a<10?2:1); };
function pbText(){ return pb && pb.length===TOTAL ? "PB "+fmtT(pb[TOTAL-1]) : "No PB yet"; }
if (pb && pb.length===TOTAL) $("best").textContent="Personal best for all sparks: "+fmtT(pb[TOTAL-1]);
function startRunIfReady(){ if (runState==="ready" && running){ runState="running"; elapsed=0; } }
function split(){
  const segStart = splits.length ? splits[splits.length-1] : 0;
  const seg = elapsed-segStart, i=splits.length;
  const wasGold = !(gold[i]>0) || seg<gold[i];
  splits.push(elapsed);
  splitMeta[i]={gold:wasGold && pb!=null, seg};
  if (wasGold){ gold[i]=seg; saveSplits(); }
}
let splitMeta=[];
function finishRun(){
  runState="done"; finished=true;
  const final=elapsed, prev=pb && pb.length===TOTAL ? pb[TOTAL-1] : null;
  const newPb = prev==null || final<prev;
  if (newPb){ pb=splits.slice(); saveSplits(); }
  $("best").textContent="Personal best for all sparks: "+fmtT(pb[TOTAL-1]);
  announce(newPb?"pb":"finish", newPb?"New personal best!":"Race complete!",true);
  return {final,prev,newPb};
}
function restartRun(){
  raceLive=false; batTime=0; for (const g of batPickups){ g.cd=0; g.grp.visible=g.beam.visible=true; }
  for (const b of itemBoxes){ b.cd=0; b.mesh.visible=true; }
  got=0; elapsed=0; finished=false; runState="ready"; splits=[]; splitMeta=[]; resetFinale();
  for (const sp of sparks){ sp.got=false; sp.mesh.visible=true; sp.beam.visible=true; }
  for (const d of dynamics){ d.body.position.copy(d.p0); d.body.quaternion.copy(d.q0); d.body.velocity.set(0,0,0); d.body.angularVelocity.set(0,0,0); d.body.interpolatedPosition.copy(d.p0); d.body.interpolatedQuaternion.copy(d.q0); d.body.wakeUp(); }
  lastSafe.copy(spawnPos); respawn(null); hook=null;
  gliderTime=0; gliding=false; for (const g of gliderPickups){ g.cd=0; g.grp.visible=g.beam.visible=true; }
  toast("Run reset","The timer starts on your first move.");
  renderSplits(true);
}
let splitsKey="";
function renderSplits(force){
  // a five-row window: two done, the current split, two upcoming
  const cur=Math.min(splits.length,TOTAL-1), from=Math.max(0,Math.min(cur-2,TOTAL-5)), key=from+"|"+splits.length+"|"+(pb?pb.length:0);
  if (!force && key===splitsKey) return; splitsKey=key;
  const ol=$("splitList"); ol.replaceChildren();
  for (let i=from;i<Math.min(TOTAL,from+5);i++){
    const li=document.createElement("li"); const name=document.createElement("span"), dl=document.createElement("span"), tm=document.createElement("span");
    name.textContent="Spark "+(i+1);
    if (i<splits.length){ tm.textContent=fmtT(splits[i]);
      if (pb && pb[i]!=null){ const d=splits[i]-pb[i]; dl.textContent=fmtD(d); dl.className = splitMeta[i]&&splitMeta[i].gold ? "gold" : d<0 ? "ahead" : "behind"; } }
    else { tm.textContent = pb && pb[i]!=null ? fmtT(pb[i]) : "–"; li.className = i===splits.length && runState!=="done" ? "cur" : "next"; if (i===splits.length) dl.id="liveDelta"; }
    li.append(name,dl,tm); ol.append(li);
  }
  $("pbLbl").textContent=pbText();
  const sob = gold.length>=TOTAL && gold.slice(0,TOTAL).every(g=>g>0) ? gold.slice(0,TOTAL).reduce((a,b)=>a+b,0) : null;
  $("sob").textContent = sob!=null ? fmtT(sob) : "–";
}
// the timer font has proportional digits: give every character a fixed-width slot so the box never jitters
function setClock(el,text){ if (el.dataset.t===text) return; el.dataset.t=text; el.innerHTML=[...text].map(c=>/\d/.test(c)?"<i>"+c+"</i>":"<b>"+c+"</b>").join(""); }
function renderTimer(){
  const tEl=$("timer");
  if (MODE==="sumo"){ const left=raceLive ? Math.max(0,SUMO_TIME-Math.max(0,simTime-raceStartSim)) : SUMO_TIME; setClock(tEl,fmt(left)); tEl.className="runtime"+(raceLive?"":" ready"); return; }
  setClock(tEl,fmtT(elapsed));
  let cls="runtime";
  if (runState==="ready") cls+=" ready";
  else if (runState==="done") cls+=" done";
  else if (pb && pb[splits.length]!=null){ cls += elapsed>pb[splits.length] ? " behind" : " ahead"; }
  tEl.className=cls;
  // live delta on the current split appears once you fall behind your PB pace, as in LiveSplit
  const ld=$("liveDelta");
  if (ld){ const target = pb && pb[splits.length]; if (runState==="running" && target!=null && elapsed>target){ ld.textContent=fmtD(elapsed-target); ld.className="behind"; } else { ld.textContent=""; ld.className=""; } }
}
$("resetBtn").addEventListener("click",e=>{ e.currentTarget.blur(); restartRun(); });
function showStart(paused){
  $("start").hidden=false;
  $("go").textContent = paused ? "Resume" : "Play";
}
$("go").addEventListener("click",()=>{
  audioOn(); $("start").hidden=true; running=true; clock.getDelta(); $("faceBox").hidden=false; faceMood=""; setTimeout(cupAutoStart,300);
  if (MODE==="sumo" && !raceLive && raceCount<=0 && !cup) setTimeout(()=>{ if (running && !raceLive && raceCount<=0) startRound(); },1500);
  if (settings.gyro) enableGyro();
  if (isTouch){ $("touch").hidden=false; return; }
  captureMouse();
});
const placeName=p=>MAP.placeName ? MAP.placeName(p,H) : MAP.name;

// ---------------- loop ----------------
const clock=new THREE.Clock();
let hudT=0, swings=0;
// match-end slow motion: time drops to 20% for a few seconds, then the leaderboard appears
let slowmo=null, lastTimeScale=1; const SLOWMO_SECS=3;
function frame(){
  requestAnimationFrame(frame);
  const dtReal=Math.min(clock.getDelta(),.05); let timeScale=1;
  if (slowmo){ slowmo.t+=dtReal; timeScale=Math.max(.2,1-slowmo.t*2.5); if (slowmo.t>=SLOWMO_SECS){ const sm=slowmo; slowmo=null; showResults(sm.rows,sm.inCup,sm.d); } }
  const dt=dtReal*timeScale; lastTimeScale=timeScale;
  const t=clock.elapsedTime;
  if (running && !simFrozen){ controls(dt); world.step(1/60,dt,4); if(runState==="running") elapsed+=dt; }
  for (const d of dynamics){ d.mesh.position.copy(d.body.interpolatedPosition); d.mesh.quaternion.copy(d.body.interpolatedQuaternion); }
  // hero
  const p=pBody.interpolatedPosition, v=pBody.velocity; camDt=dt;
  hero.position.set(p.x,p.y-.5+.5,p.z);
  const hs=Math.hypot(v.x,v.z);
  const attached=hook&&hook.phase==="attached";
  const faceYaw = hook ? yaw : (onGround && !gliding) ? (wish.lengthSq()>.01 ? Math.atan2(-wish.x,-wish.z) : hero.rotation.y) : (hs>1.5 ? Math.atan2(-v.x,-v.z) : hero.rotation.y);
  let dy=faceYaw-hero.rotation.y; dy=Math.atan2(Math.sin(dy),Math.cos(dy)); hero.rotation.y+=dy*Math.min(1,10*dt);
  if (onGround) bobPhase += hs*1.4*dt;
  poseArms(heroBody, attached?"rope" : gliding?"glide" : (!onGround && v.y<-14)?"fall" : "walk", bobPhase, onGround?Math.min(1,hs/6):.2);
  const bob = onGround ? Math.abs(Math.sin(bobPhase))*.08*Math.min(1,hs/4) : 0;
  sitOff += ((standing?RIDE-.5:0)-sitOff)*Math.min(1,12*dt); hero.position.y-=sitOff;
  heroBody.position.y=bob-.08;
  wingOpen += ((gliding?1:0)-wingOpen)*Math.min(1,10*dt);
  wing.visible = wingOpen>.02; wing.scale.set(wingOpen,1,.4+.6*wingOpen);
  { let turn=hero.rotation.y-lastYaw; turn=Math.atan2(Math.sin(turn),Math.cos(turn)); lastYaw=hero.rotation.y; wing.rotation.z += (Math.max(-.5,Math.min(.5,-turn/Math.max(dt,1e-3)*.12))-wing.rotation.z)*Math.min(1,6*dt); }
  if (swingAnim>0) swingAnim=Math.max(0,swingAnim-dt/.28);
  heroBat.visible=batTime>0; poseSwing(heroBody,heroBat,swingAnim,swingBat);
  if (running) trackSpin(dt);
  heroGun.visible=heldItem==="sniper" && !heroBat.visible;
  if (heroGun.visible){ const k=sniperCharge>0 ? .6+.4*Math.sin(performance.now()/70) : Math.min(1,Math.abs(spinAcc)/(Math.PI*2))*.5; sniperGlowMat.emissive.setRGB(.3*k,1.6*k,2*k); }
  heroBody.rotation.z = simTime<spinUntil ? (spinUntil-simTime)*14 : 0;
  heroBody.rotation.x = gliding ? -1.1 : onGround ? -Math.min(.25,hs*.02) : (attached? -.35 : Math.max(-.5,Math.min(.5,-v.y*.02)));
  hand.set(0,.35,-.1).applyEuler(hero.rotation).add(hero.position);
  if (running){
    if (deadT>0){ deadT-=dt; renderDeath(); if (deadT<=0) respawn(null); }
    else if (p.y < -1.8){ fellInWater(); }
    safeT+=dt; if (grounded && safeT>.5 && p.y>2){ safeT=0; lastSafe.copy(p); }
  }
  updateHook(dt);
  updateRemotes(dt); if (!simFrozen) updateBots(dt); sendPresence(); tickRace(dt); checkRaceEnd();
  updateCamera();
  updateWeather(dt,camera.position);
  sun.position.set(p.x+SUN_DIR.x*120,p.y+SUN_DIR.y*120,p.z+SUN_DIR.z*120); sun.target.position.set(p.x,p.y,p.z);
  // glider pickups
  if (running && gliderTime>0){ gliderTime=Math.max(0,gliderTime-dt); if (!gliderTime){ gliding=false; toast("Glider folded","Find another cyan pickup."); } }
  for (const g of gliderPickups){
    if (g.cd>0){ g.cd-=simFrozen?0:dt; g.grp.visible=g.beam.visible=g.cd<=0; continue; }
    g.grp.rotation.y+=dt*1.5; g.grp.position.y=g.pos.y+Math.sin(t*2.3+g.pos.z)*.25;
    if (running && g.pos.distanceTo(tmpV.set(p.x,p.y,p.z))<2.2){ g.cd=GLIDER_RESPAWN; g.grp.visible=g.beam.visible=false; gliderTime=GLIDE_TIME;
      [523,784,1046].forEach((f,i)=>tone(f,.16,"sine",.07,1,i*.06)); faceHappyT=1.6; announce("glider","Glider online."); toast("Glider!", isTouch?"Hold Jump while falling to glide · 30 s":"Hold Space while falling to glide · 30 s"); }
  }
  // baseball bat
  if (running){ if (hitCd>0) hitCd-=dt; if (batTime>0){ batTime=Math.max(0,batTime-dt); if (!batTime) toast("Bat's gone","Find another red pickup."); } }
  for (const g of batPickups){
    if (!RULES.bats){ if (g.grp.visible) g.grp.visible=g.beam.visible=false; continue; }
    if (g.cd>0){ g.cd-=simFrozen?0:dt; g.grp.visible=g.beam.visible=g.cd<=0; continue; }
    g.grp.rotation.y+=dt*1.8; g.grp.position.y=g.pos.y+Math.sin(t*2.1+g.pos.x)*.25;
    if (running && g.pos.distanceTo(tmpV.set(p.x,p.y,p.z))<2.2){ g.cd=MODE==="sumo"?8:BAT_RESPAWN; g.grp.visible=g.beam.visible=false; batTime=BAT_TIME;
      faceHappyT=1.6; tone(220,.2,"square",.06); tone(330,.25,"square",.05,1,.08); announce("bat","Bat acquired. Go get 'em."); toast("Baseball bat!", isTouch?"Tap Hit to swing · 30 s":"Press F to swing · 30 s"); }
  }
  // sparks
  for (const s of sparks){ if (s.got) continue; if (MODE==="sumo"){ if (s.mesh.visible) s.mesh.visible=s.beam.visible=false; continue; } else if (!s.mesh.visible){ s.mesh.visible=s.beam.visible=true; } s.mesh.rotation.y+=dt*2; s.mesh.position.y=s.pos.y+Math.sin(t*2+s.pos.x)*.2;
    if (running && s.pos.distanceTo(tmpV.set(p.x,p.y,p.z))<(magnetT>0?14:1.9)){ s.got=true; s.mesh.visible=false; s.beam.visible=false; got++;
      [880,1108,1318].forEach((f,i)=>tone(f,.18,"triangle",.07,1,i*.07));
      if (runState==="ready") runState="running";
      split(); const i=splits.length-1, d = pb && pb[i]!=null ? splits[i]-pb[i] : null;
      const dTxt = d==null ? fmtT(splits[i]) : `${fmtT(splits[i])} · ${fmtD(d)}${splitMeta[i].gold?" · best segment":""}`;
      faceHappyT=1.6;
      if (got===TOTAL && RULES.final && !finale.active && !finale.got){ const at=finaleSpot(pBody.position); setTimeout(()=>spawnFinale(at,myName(),true),1400); }
      if (got===TOTAL){ const r=finishRun(); toast(r.newPb ? (r.prev==null?"First full run!":"New personal best!") : "Every spark found!", r.prev==null ? fmtT(r.final) : `${fmtT(r.final)} · ${fmtD(r.final-r.prev)} vs PB`); }
      else toast(`Spark ${got} of ${TOTAL}`, got===1 && !pb ? "Follow the light beams to find the rest." : dTxt);
      renderSplits(true); } }
  updateFinale(dt,t); updateTraps(simFrozen?0:dt); updateThrown(dt);
  if (finale.active && running && deadT<=0 && finale.pos.distanceTo(tmpV.set(p.x,p.y,p.z))<(magnetT>0?8:2.8)) grabFinale(myName(),true);
  for (const u of updrafts) u.rings.forEach((r,k)=>{ const ph=((t*.6+k/u.rings.length)%1); r.position.y=ph*34; r.material.opacity=.55*(1-ph); });
  updateDrops(dt);
  for (let i=puffs.length-1;i>=0;i--){ const m=puffs[i]; m.userData.t+=dt; m.position.addScaledVector(m.userData.v,dt); m.material.opacity=.6*(1-m.userData.t/.5); if(m.userData.t>.5){ scene.remove(m); m.geometry.dispose(); m.material.dispose(); puffs.splice(i,1); } }
  hudT+=dt;
  if (hudT>.1){ hudT=0;
    $("sparks").textContent = MODE==="sumo" ? String(dunks) : `${got}/${TOTAL}`; $("sparksLbl").textContent = MODE==="sumo" ? "KOs" : "Sparks"; renderSplits(false); $("speed").textContent=Math.round(speedOut(Math.hypot(v.x,v.y,v.z))); if ($("speedLbl").textContent!==speedUnit()) $("speedLbl").textContent=speedUnit(); $("glider").textContent = gliderTime>0 ? Math.ceil(gliderTime)+"s" : "–"; $("bat").textContent = batTime>0 ? Math.ceil(batTime)+"s" : "–"; updateMusic();
    $("where").textContent=MAP.name+" · "+placeName(p); renderPlayers(); renderRibbon();
    if (running && deadT<=0){ if (!onGround && !attached) stats.airTime+=.1; stats.topSpeed=Math.max(stats.topSpeed,Math.hypot(v.x,v.y,v.z)); }
    if (!isTouch){ const h=$("hint");
      if (attached) swings++;
      const html = gliding ? "Gliding. Look down to dive and gain speed, up to float. Fly through updrafts to climb." :
        attached ? (hook && (hook.remote || (hook.body && hook.body.mass>0)) ? "Hooked something loose. Hold <kbd>C</kbd> to pull it to you, <kbd>F</kbd> to throw it, <kbd>Shift</kbd> to reel yourself in." : "Swinging. Hold <kbd>Shift</kbd> to reel in, <kbd>Space</kbd> to launch off, let go to fly.") :
        batTime>0 ? "Bat ready. Press <kbd>F</kbd> to swing at anyone in front of you. Knock them into the sea for a dunk." :
        gliderTime>0 ? "Glider ready. In the air, hold <kbd>Space</kbd> while falling to open it." :
        "Aim at anything solid. When the crosshair turns blue, hold <kbd>Mouse</kbd> or <kbd>E</kbd> to grapple.";
      h.hidden = (elapsed>45 && swings>20) || deadT>0;
      if (h.dataset.v!==html){ h.dataset.v=html; h.innerHTML=html; } }
  }
  renderTimer(); updateItems(dt); if (running) updateFace(dt);
  if (waterNormals){ waterNormals.offset.x=(t*.006)%1; waterNormals.offset.y=(t*.004)%1; }
  if (shafts){ sunNdc.copy(sunDisc.position).project(camera); const vis = sunNdc.z<1 ? Math.max(0,1-Math.hypot(sunNdc.x,sunNdc.y)/1.5) : 0;
    shafts.uniforms.sunPos.value.set(sunNdc.x*.5+.5,sunNdc.y*.5+.5); shafts.uniforms.amount.value+=(vis-shafts.uniforms.amount.value)*Math.min(1,dt*6); }
  if (composer) composer.render(); else renderer.render(scene,camera);
}
// ---------------- multiplayer ----------------
// Each player runs their own physics and shares a pose about 20 times a second through room presence.
// Friends are drawn where they last reported, nudged forward by their velocity, and smoothed.
let room=null, myPeer=null, presT=0, raceCount=0, raceId=0;
const avatars=new Map(), raceSeen=new Map();
const AV_COLORS=["#3a8ef2","#9b5cf0","#26b27a","#f2c230","#e8508a","#2fc4c4","#ff8a3d"];
const cleanName=s=>String(s||"").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g,"").trim().slice(0,16)||"Player";
const colorFor=peer=>{ let h=0; for (const ch of String(peer)) h=(h*31+ch.charCodeAt(0))|0; return AV_COLORS[Math.abs(h)%AV_COLORS.length]; };
try{ $("nick").value=localStorage.getItem("skyhook.nick")||""; }catch(e){}
const myName=()=>cleanName($("nick").value);
$("nick").addEventListener("change",()=>{ try{ localStorage.setItem("skyhook.nick",$("nick").value); }catch(e){} });
function setNet(state,text){ const n=$("net"); n.className="net "+state; n.querySelector("span").textContent=text; }
if (window.claude && typeof window.claude.use==="function"){
  window.claude.use("room").then(r=>{
    room=r;
    if (!r){ setNet("off","Online play isn't available in this view. You can still play solo."); return; }
    r.onConnection(c=>setNet(c?"on":"", c?"Online. Anyone who opens this page joins your island.":"Reconnecting…"), e=>setNet("off","Couldn't connect to other players ("+(e&&e.code||"error")+"). Playing solo."));
    r.onPeers(ch=>{ for (const p of ch.peers) if (p.sameTab) myPeer=p.peer; },()=>{});
  }).catch(()=>setNet("off","Online play isn't available in this view. You can still play solo."));
} else setNet("off","Online play isn't available here. You can still play solo.");

const r2=x=>Math.round(x*100)/100;
function sendPresence(){
  if (!room) return; const now=performance.now();
  if (now-presT < (running?50:1000)) return; presT=now;
  const p=pBody.interpolatedPosition, v=pBody.velocity;
  const h = hook ? [hook.phase==="fly"?1:hook.phase==="attached"?2:3, r2(hook.tip.x),r2(hook.tip.y),r2(hook.tip.z), r2(hook.len||0), hook.remote||"", pullHeld&&hook.phase==="attached"?1:0] : 0;
  room.presence({n:myName(), p:[r2(p.x),r2(p.y),r2(p.z)], v:[r2(v.x),r2(v.y),r2(v.z)], yw:r2(hero.rotation.y), g:gliding?1:0, h, s:got, t:Math.round(elapsed*10)/10, rs:runState, ps:running?0:1, mp:MAP.key, pc:myCharKey, sw:swingN, bt:batTime>0?1:0, hit:lastHit, sp:lastSplash, dk:dunks, bots:botsPayload(), bsp:lastBsp, chat:lastChat, bchat:lastBchat, boom:lastBoom, cupS:cupPresence(), fin:lastFin, fg:lastFinGot, trp:lastTrap, st:[stats.deaths,stats.hits,stats.homers,stats.punches,stats.items,Math.round(stats.airTime),Math.round(stats.topSpeed),stats.traps,stats.throws,stats.smashes,stats.snipes||0]}).catch(()=>{});
}
function nameSprite(text,color){
  const c=document.createElement("canvas"); let x=c.getContext("2d"); const font="700 30px 'Nunito Sans', system-ui, sans-serif";
  x.font=font; const tw=x.measureText(text).width, W=Math.max(256,Math.min(1024,Math.ceil(tw+48)));
  c.width=W; c.height=64; x=c.getContext("2d"); x.font=font; const w=Math.min(W-6,tw+28);
  x.fillStyle="rgba(14,22,38,.72)"; x.beginPath(); x.roundRect ? x.roundRect(W/2-w/2,8,w,48,14) : x.rect(W/2-w/2,8,w,48); x.fill();
  x.fillStyle=color; x.textAlign="center"; x.textBaseline="middle"; x.fillText(text,W/2,33);
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true})); sp.scale.set(2.6*W/256,.65,1); sp.renderOrder=10; return sp;
}
function makeAvatar(peer){
  const color=colorFor(peer), g=new THREE.Group(), body=heroBody.clone(true); g.add(body); dressBody(body,CLASSIC);
  const torso=body.children[0]; torso.material=new THREE.MeshStandardMaterial({color,roughness:.6}); torso.userData.remote=peer;
  for (const n of ["armL","armR"]) body.getObjectByName(n).getObjectByName("limb").material=torso.material;   // sleeves follow the suit
  const w=wing.clone(true); w.visible=false; g.add(w);
  const r=new THREE.Mesh(rope.geometry,rope.material), tip=hookTip.clone(); r.visible=tip.visible=false;
  scene.add(g,r,tip); grappleables.push(torso);
  return {bat:body.getObjectByName("bat"),swLast:null,swing:0,swingBat:false,peer,color,g,body,wing:w,rope:r,tip,torso,label:null,labelText:"",pres:null,recv:0,disp:new THREE.Vector3(),np:new THREE.Vector3(),nv:new THREE.Vector3(),has:false,yaw:0,open:0,name:"Player"};
}
function dropAvatar(a){
  scene.remove(a.g,a.rope,a.tip); const i=grappleables.indexOf(a.torso); if (i>=0) grappleables.splice(i,1);
  if (a.label){ a.label.material.map.dispose(); a.label.material.dispose(); }
  if (hook && hook.remote===a.peer) hook.phase="retract";
}
const vec3=a=>Array.isArray(a) && a.length===3 && a.every(n=>typeof n==="number" && isFinite(n) && Math.abs(n)<5000);
const tmpH=new THREE.Vector3(), tmpT=new THREE.Vector3(), UP=new THREE.Vector3(0,1,0);
function updateRemotes(dt){
  if (!room) return;
  const now=performance.now(), seen=new Set();
  for (const pr of room.peers()){
    if (pr.sameTab || pr.kind!=="viewer") continue;
    const ps=pr.presence; if (!ps || !vec3(ps.p)) continue;
    followCup(pr,ps);
    if (ps.mp && ps.mp!==MAP.key) continue;   // they're playing a different map
    seen.add(pr.peer);
    let a=avatars.get(pr.peer); if (!a){ a=makeAvatar(pr.peer); avatars.set(pr.peer,a); }
    if (ps!==a.pres){
      a.pres=ps; a.recv=now; a.np.fromArray(ps.p); if (vec3(ps.v)) a.nv.fromArray(ps.v); else a.nv.set(0,0,0);
      if (!a.has){ a.disp.copy(a.np); a.has=true; }
      a.name=cleanName(ps.n);
      // hits, splashes, power-ups and swings from this friend
      const hit=ps.hit;
      if (hit && typeof hit.n==="number"){ if (!lastHitSeen.has(pr.peer)) lastHitSeen.set(pr.peer,hit.n); else if (hit.n>lastHitSeen.get(pr.peer)){ lastHitSeen.set(pr.peer,hit.n);
        if (Array.isArray(hit.d) && hit.d.length===2 && hit.d.every(Number.isFinite)){ const dir=[Math.max(-1,Math.min(1,hit.d[0])),Math.max(-1,Math.min(1,hit.d[1]))];
          if (myPeer && hit.to===myPeer) takeHit(dir,!!hit.f, hit.bn ? {peer:"bot:"+(hit.bid|0),name:cleanName(hit.bn)} : a, Number.isFinite(hit.m) ? Math.max(.5,Math.min(1.6,hit.m)) : 1);
          else if (amController && typeof hit.to==="string" && hit.to.startsWith("bot:")) hitBot(hit.to,dir,!!hit.f,a.peer,a.name); } } }
      const sp=ps.sp;
      if (sp && typeof sp.n==="number"){ if (!lastSpSeen.has(pr.peer)) lastSpSeen.set(pr.peer,sp.n); else if (sp.n>lastSpSeen.get(pr.peer)){ lastSpSeen.set(pr.peer,sp.n);
        if (myPeer && sp.by===myPeer){ dunks++; faceHappyT=2; announce("dunk","Dunked! "+a.name+" is swimming."); toast("Dunked "+a.name+"!","Straight into the sea."); }
        else { if (amController && typeof sp.by==="string" && sp.by.startsWith("bot:")) creditBot(sp.by); } } }
      const tp=ps.trp;
      if (tp && typeof tp.n==="number"){ if (!lastTrapSeen.has(pr.peer)) lastTrapSeen.set(pr.peer,tp.n); else if (tp.n>lastTrapSeen.get(pr.peer)){ lastTrapSeen.set(pr.peer,tp.n); if (Number.isInteger(tp.i)) triggerTrap(tp.i,{peer:pr.peer,name:cleanName(tp.by)},false); } }
      const fn=ps.fin;
      if (fn && typeof fn.n==="number"){ if (!lastFinSeen.has(pr.peer)) lastFinSeen.set(pr.peer,fn.n); else if (fn.n>lastFinSeen.get(pr.peer)){ lastFinSeen.set(pr.peer,fn.n);
        if (vec3(fn.p)) spawnFinale(new THREE.Vector3(...fn.p),cleanName(fn.by),false); } }
      const fg=ps.fg;
      if (fg && typeof fg.n==="number"){ if (!lastFinGotSeen.has(pr.peer)) lastFinGotSeen.set(pr.peer,fg.n); else if (fg.n>lastFinGotSeen.get(pr.peer)){ lastFinGotSeen.set(pr.peer,fg.n); grabFinale(cleanName(fg.by),false); } }
      const bm=ps.boom;
      if (bm && typeof bm.n==="number" && [bm.x,bm.y,bm.z,bm.r,bm.p].every(Number.isFinite)){ if (!lastBoomSeen.has(pr.peer)) lastBoomSeen.set(pr.peer,bm.n); else if (bm.n>lastBoomSeen.get(pr.peer)){ lastBoomSeen.set(pr.peer,bm.n); explode(bm.x,bm.y,bm.z,Math.min(10,bm.r),Math.min(2,bm.p),{peer:pr.peer,name:a.name},false); } }
      const ch=ps.chat;
      if (ch && typeof ch.n==="number" && typeof ch.t==="string"){ if (!lastChatSeen.has(pr.peer)) lastChatSeen.set(pr.peer,ch.n); else if (ch.n>lastChatSeen.get(pr.peer)){ lastChatSeen.set(pr.peer,ch.n); addChat(a.name,cleanChat(ch.t),a.color); blip(); } }
      const bc=ps.bchat;
      if (bc && typeof bc.n==="number" && typeof bc.t==="string"){ if (!lastBchatSeen.has(pr.peer)) lastBchatSeen.set(pr.peer,bc.n); else if (bc.n>lastBchatSeen.get(pr.peer)){ lastBchatSeen.set(pr.peer,bc.n);
        const C=CHARACTERS.find(c=>c.name===cleanName(bc.who)); if (C) botSay(C,cleanChat(bc.t),true); } }
      const bsp=ps.bsp;
      if (bsp && typeof bsp.n==="number"){ if (!lastBspSeen.has(pr.peer)) lastBspSeen.set(pr.peer,bsp.n); else if (bsp.n>lastBspSeen.get(pr.peer)){ lastBspSeen.set(pr.peer,bsp.n);
        if (myPeer && bsp.by===myPeer){ const nm=cleanName(bsp.name); dunks++; announce("dunk","Dunked! "+nm+" is swimming."); toast("Dunked "+nm+"!","Bots can't swim."); } } }
      const bt=ps.bt?1:0; lastBtSeen.set(pr.peer,bt);   // (no pop-up: only actions that involve you get one)
      if (typeof ps.sw==="number"){ if (a.swLast!=null && ps.sw!==a.swLast){ a.swing=1; a.swingBat=!!ps.bt; } a.swLast=ps.sw; }
      if (typeof ps.race==="number"){ if (!raceSeen.has(pr.peer)) raceSeen.set(pr.peer,ps.race); else if (ps.race>raceSeen.get(pr.peer)){ raceSeen.set(pr.peer,ps.race); if (ps.race!==raceId) beginRace(ps.race,a.name,ps.md); } }
    }
    const age=Math.min(.25,(now-a.recv)/1000);
    tmpT.copy(a.np).addScaledVector(a.nv,age);
    if (a.disp.distanceTo(tmpT)>10) a.disp.copy(tmpT); else a.disp.lerp(tmpT,1-Math.exp(-14*dt));
    a.g.position.copy(a.disp);
    if (typeof ps.yw==="number" && isFinite(ps.yw)){ let d=ps.yw-a.yaw; d=Math.atan2(Math.sin(d),Math.cos(d)); a.yaw+=d*Math.min(1,10*dt); a.g.rotation.y=a.yaw; }
    a.open += ((ps.g?1:0)-a.open)*Math.min(1,10*dt); a.wing.visible=a.open>.02; a.wing.scale.set(a.open,1,.4+.6*a.open);
    if (a.bat) a.bat.visible=!!ps.bt; if (a.swing>0) a.swing=Math.max(0,a.swing-dt/.28); poseSwing(a.body,a.bat,a.swing,a.swingBat);
    if (ps.pc!==a.pcSeen){ a.pcSeen=ps.pc; const C=charByKey(typeof ps.pc==="string"?ps.pc:""); if (ps.pc && C!==CLASSIC){ dressBody(a.body,C); a.torso.material.color.set(C.suit); a.body.children[2].material=new THREE.MeshStandardMaterial({color:C.hat,roughness:.7}); a.g.scale.setScalar(C.scale||1); } }
    a.phase=(a.phase||0)+Math.hypot(a.nv.x,a.nv.z)*1.4*dt;
    poseArms(a.body, Array.isArray(ps.h)&&ps.h[0]===2?"rope" : ps.g?"glide" : a.nv.y<-14?"fall":"walk", a.phase, Math.min(1,Math.hypot(a.nv.x,a.nv.z)/6));
    a.body.rotation.x = ps.g ? -1.1 : (Array.isArray(ps.h) && ps.h[0]===2 ? -.35 : 0);
    const text = a.name + (ps.ps ? " (paused)" : "");
    if (text!==a.labelText){ if (a.label){ a.g.remove(a.label); a.label.material.map.dispose(); a.label.material.dispose(); } a.label=nameSprite(text,a.color); a.label.position.y=1.55; a.g.add(a.label); a.labelText=text; }
    // their rope
    const h=ps.h;
    if (Array.isArray(h) && h[0]>0 && [h[1],h[2],h[3]].every(n=>typeof n==="number" && isFinite(n))){
      tmpH.set(0,.35,-.1).applyEuler(a.g.rotation).add(a.g.position);
      if (h[5] && h[5]===myPeer) tmpT.set(pBody.interpolatedPosition.x,pBody.interpolatedPosition.y+.3,pBody.interpolatedPosition.z);
      else if (h[5] && avatars.has(h[5])) tmpT.copy(avatars.get(h[5]).disp).add(new THREE.Vector3(0,.3,0));
      else tmpT.set(h[1],h[2],h[3]);
      const len=tmpH.distanceTo(tmpT);
      if (len>.05 && len<200){ a.rope.visible=a.tip.visible=true; a.rope.position.copy(tmpH).add(tmpT).multiplyScalar(.5); a.rope.scale.set(1,len,1);
        a.rope.quaternion.setFromUnitVectors(UP,tmpT.clone().sub(tmpH).normalize()); a.tip.position.copy(tmpT); a.tip.quaternion.copy(a.rope.quaternion); }
      else a.rope.visible=a.tip.visible=false;
    } else a.rope.visible=a.tip.visible=false;
  }
  for (const [k,a] of avatars) if (!seen.has(k)){ dropAvatar(a); avatars.delete(k); }
}
// ---------------- messing with each other ----------------
// Hits are sent as numbered events in your presence; the target applies the knockback in their own physics.
// per-race stats (shown in results; cups add them up for awards)
const stats={deaths:0,dunks:0,hits:0,homers:0,hitsTaken:0,punches:0,items:0,airTime:0,topSpeed:0,traps:0,throws:0,smashes:0,dunkedBy:{}};
let batTime=0, hitCd=0, swingN=0, swingAnim=0, swingBat=false, knockUntil=-9, shakeT=0;
let hitN=0, lastHit=0, spN=0, lastSplash=0, dunks=0, lastHitBy=null;
const lastHitSeen=new Map(), lastSpSeen=new Map(), lastBtSeen=new Map();
const BAT_TIME=30, BAT_RESPAWN=20, BAT_K=40, BAT_UP=16;   // the bat should be scary
let spinUntil=-9;
function poseSwing(body,batObj,s,isBat){
  const u = s>0 ? 1-s : 0, e=Math.sin(Math.min(1,u)*Math.PI);
  if (batObj) batObj.rotation.set(-.35-(s>0?1.15*Math.min(1,u*1.6):0), s>0 ? 1.4-2.9*u : 1.2, -.5);
  body.position.z = s>0 && !isBat ? -.35*e : 0;
}
// distance to whatever is below (terrain, static bodies, or the water surface), up to maxD
function dropBelow(p,maxD){
  let gy=-Infinity; const lx=p.x+HALF, ly=HALF-p.z;
  if (lx>=0 && ly>=0 && lx<=S && ly<=S) gy=terrainHF.getHeightAt(lx,ly,true);
  rayFrom.set(p.x,p.y,p.z); rayTo.set(p.x,p.y-maxD,p.z); rayRes.reset();
  world.raycastClosest(rayFrom,rayTo,{collisionFilterMask:1|16,skipBackfaces:true},rayRes);
  if (rayRes.hasHit && rayRes.hitPointWorld.y>gy) gy=rayRes.hitPointWorld.y;
  const water=gy<0; if (water) gy=0;
  return {d:p.y-gy, water};
}
function groundPunch(bat){
  const p=pBody.position, v=pBody.velocity;
  if (onGround || v.y>-1.5 || (hook && hook.phase==="attached") || deadT>0) return false;
  const below=dropBelow(p,3.2); if (below.d>3.2) return false;
  // the harder you're falling, the more you get back; a bat gives a bigger bounce
  const fall=-v.y, up=Math.min(bat?26:18,(bat?13:9)+fall*(bat?.55:.35));
  v.y=up; airJumps=1; lastJump=simTime; lastGround=-9; stats.punches++;
  shakeT=bat?.3:.15; bat?crack():thud();
  if (below.water) splash(p.x,p.z,.6); else puff({x:p.x,y:p.y-below.d+.4,z:p.z});
  if (!stats.punchToast){ stats.punchToast=1; toast(bat?"Bat bounce!":"Ground punch!","Swing at the ground as you fall to bounce."); }
  // a bat slam knocks back anyone standing close by
  if (bat){ const near=[...avatars.values()].map(a=>({a,d:Math.hypot(a.disp.x-p.x,a.disp.z-p.z)})).filter(o=>o.d<4.5 && Math.abs(o.a.disp.y-(p.y-below.d))<2.5).sort((x,y)=>x.d-y.d)[0];
    if (near){ const nx=(near.a.disp.x-p.x)/(near.d||1), nz=(near.a.disp.z-p.z)/(near.d||1); hitN++; lastHit={n:hitN,to:near.a.peer,d:[r2(nx),r2(nz)],f:1}; }
    if (amController) for (const [key,a] of botAvatars){ const dx=a.disp.x-p.x, dz=a.disp.z-p.z, d=Math.hypot(dx,dz); if (d<4.5 && Math.abs(a.disp.y-(p.y-below.d))<2.5) hitBot(key,[dx/(d||1),dz/(d||1)],true,myPeer||"me",myName()); } }
  return true;
}
function attack(){
  if (!running || raceCount>0 || hitCd>0 || deadT>0) return;
  audioOn();
  const bat=batTime>0; hitCd=bat?.55:.8; swingN++; swingAnim=1; swingBat=bat; hero.rotation.y=yaw;
  whoosh(bat);
  if (hook && hook.phase==="attached" && hook.body && hook.body.mass>0){ yeet(hook.body); hook.phase="retract"; return; }
  if (groundPunch(bat)) return;
  { const p=pBody.position;
    for (const T of traps) for (const m of (T.triggers||[])){ const q=m.getWorldPosition(tmpV); if (Math.hypot(q.x-p.x,q.y-p.y,q.z-p.z)<(bat?4.2:3.2)) triggerTrap(T.i,{peer:myPeer||"me",name:myName()},true); }
    if (blastTowers(p.x-Math.sin(yaw)*1.7,p.y+.2,p.z-Math.cos(yaw)*1.7,bat?2.8:1.7,bat?.9:.45)){ bat?crack():thud(); shakeT=Math.max(shakeT,.2); stats.smashes++; } }
  const range=bat?3.4:2.2, fx=-Math.sin(yaw), fz=-Math.cos(yaw), p=pBody.position;
  let landed=false;
  for (const a of avatars.values()){
    const dx=a.disp.x-p.x, dy=a.disp.y-p.y, dz=a.disp.z-p.z, d=Math.hypot(dx,dz);
    if (d>range+.8 || Math.abs(dy)>2.5) continue;           // a little extra reach covers network lag
    if (d>.3 && (dx*fx+dz*fz)/d<.35) continue;                // must be roughly in front of you
    const nx=d>.3?dx/d:fx, nz=d>.3?dz/d:fz;
    hitN++; lastHit={n:hitN,to:a.peer,d:[r2(nx),r2(nz)],f:bat?1:0};
    a.disp.x+=nx*(bat?1.2:.5); a.disp.z+=nz*(bat?1.2:.5);    // instant feedback; their real position follows
    landed=true; stats.hits++; if (bat) stats.homers++;
    if (bat){ crack(); shakeT=.25; announce("homerun","Home run!"); toast("HOME RUN!","You launched "+a.name); }
    else { thud(); toast("Shoved "+a.name); }
  }
  for (const [key,a] of botAvatars){
    const dx=a.disp.x-p.x, dy=a.disp.y-p.y, dz=a.disp.z-p.z, d=Math.hypot(dx,dz);
    if (d>range+.8 || Math.abs(dy)>2.5) continue;
    if (d>.3 && (dx*fx+dz*fz)/d<.35) continue;
    const nx=d>.3?dx/d:fx, nz=d>.3?dz/d:fz;
    if (amController) hitBot(key,[nx,nz],bat,myPeer||"me",myName());
    else { hitN++; lastHit={n:hitN,to:key,d:[r2(nx),r2(nz)],f:bat?1:0}; a.disp.x+=nx*(bat?1.2:.5); a.disp.z+=nz*(bat?1.2:.5); }
    landed=true; stats.hits++; if (bat) stats.homers++;
    if (bat){ crack(); shakeT=.25; announce("homerun","Home run!"); toast("HOME RUN!","You launched "+a.name); } else { thud(); toast("Shoved "+a.name); }
  }
  for (const dyn of dynamics){
    const b=dyn.body, dx=b.position.x-p.x, dy=b.position.y-p.y, dz=b.position.z-p.z, d=Math.hypot(dx,dz)||1;
    if (d<range+.7 && Math.abs(dy)<2.5 && (dx*fx+dz*fz)/d>.2){ const f=(bat?90:20)*Math.min(1,b.mass/2); b.wakeUp(); b.applyImpulse(new CANNON.Vec3(dx/d*f,f*.45,dz/d*f)); if (bat) addThrown(b); claimIdol(b); if (!landed){ bat?crack():thud(); landed=true; } }
  }
}
function takeHit(dir,bat,from,mul=1){
  if (shieldT>0){ toast("Shield blocked it!"); tone(1500,.12,"sine",.06); return; }
  faceHurtT=1.2;
  const v=pBody.velocity, k=(bat?BAT_K:10)*mul;
  v.x+=dir[0]*k; v.z+=dir[1]*k; v.y=Math.max(v.y,bat?BAT_UP:5);
  knockUntil=simTime+(bat?1.3:.45); if (bat) spinUntil=simTime+1.1;
  stats.hitsTaken++; if (hook) hook.phase="retract"; gliding=false;
  lastHitBy={peer:from.peer,name:from.name,t:simTime}; shakeT=bat?.5:.25;
  if (bat){ crack(); announce("homerun","Home run!"); toast(from.name+" took a swing!","Batter up."); }
  else { thud(); toast(from.name+" shoved you"); }
}
function fellInWater(){
  faceDizzyT=2.2;
  splashS();
  const by = lastHitBy && simTime-lastHitBy.t<8 ? lastHitBy : null;
  spN++; lastSplash={n:spN,by:by?by.peer:""}; lastHitBy=null;
  if (by && amController && by.peer.startsWith("bot:")) creditBot(by.peer);
  if (by && by.peer.startsWith("bot:")){ const ba=botAvatars.get(by.peer); if (ba && ba.C){ setTimeout(()=>botSay(ba.C,ba.C.taunt,true),1200); } }
  stats.deaths++; if (by) stats.dunkedBy[by.name]=(stats.dunkedBy[by.name]||0)+1;
  splash(pBody.position.x,pBody.position.z,1.3); shakeT=.35;
  if (by) announce("dunked","Splashdown! "+by.name+" sends you swimming."); else announce("splash","Man overboard!");
  if (DEATH_SECS>0 && !simFrozen) startDeathCam(by?"SPLASHDOWN":"SPLASH!", by ? by.name+" knocked you into the "+(MAP.theme.waterGlow?"lava":"sea") : "Into the "+(MAP.theme.waterGlow?"lava":"drink")+" you go");
  else { respawn(null); toast(by?"Splashdown!":"Splash!", by?by.name+" knocked you in":"Back to dry land"); }
}

// ---------------- throwing props ----------------
// Hook a loose object, then press Hit: it flies where you're looking. Batted props fly too. Anything thrown that
// hits a player knocks them like a bat (scaled by its speed).
const thrown=[];
function addThrown(b){ const old=thrown.find(o=>o.body===b); if (old){ old.t=2.5; old.hitSet.clear(); return; } thrown.push({body:b,t:2.5,hitSet:new Set()}); }
function yeet(b){
  const d=new THREE.Vector3(); camera.getWorldDirection(d);
  const sp=Math.min(40,20+40/Math.max(1,b.mass)); b.wakeUp();
  b.velocity.set(d.x*sp,d.y*sp+5,d.z*sp); b.angularVelocity.set(Math.random()*8-4,Math.random()*8-4,Math.random()*8-4);
  addThrown(b); claimIdol(b); whoosh(true); swingN++; swingAnim=1; swingBat=false; stats.throws++;
  if (!stats.yeetToast){ stats.yeetToast=1; toast("YEET!","Hook something loose, then Hit to throw it."); }
}
function updateThrown(dt){
  for (let i=thrown.length-1;i>=0;i--){ const o=thrown[i]; o.t-=dt; const b=o.body, v=b.velocity, sp=Math.hypot(v.x,v.y,v.z);
    if (o.t<=0 || !b.world){ thrown.splice(i,1); continue; }
    if (sp<8) continue;
    const q=b.position, m=Math.max(.6,Math.min(1.6,sp/24)), hd=Math.hypot(v.x,v.z)||1, dir=[r2(v.x/hd),r2(v.z/hd)];
    for (const a of avatars.values()){ if (o.hitSet.has(a.peer)) continue; if (Math.hypot(a.disp.x-q.x,a.disp.y+.3-q.y,a.disp.z-q.z)<1.9){ o.hitSet.add(a.peer); hitN++; lastHit={n:hitN,to:a.peer,d:dir,f:1,m:r2(m)}; crack(); toast("Direct hit!","You beaned "+a.name); stats.hits++; } }
    for (const [key,a] of botAvatars){ if (o.hitSet.has(key)) continue; if (Math.hypot(a.disp.x-q.x,a.disp.y+.3-q.y,a.disp.z-q.z)<1.9){ o.hitSet.add(key);
      if (amController) hitBot(key,dir,true,myPeer||"me",myName()); else { hitN++; lastHit={n:hitN,to:key,d:dir,f:1,m:r2(m)}; }
      crack(); toast("Direct hit!","You beaned "+a.name); stats.hits++; } }
  }
}
// ---------------- map traps ----------------
// A map's build() pushes trap definitions; the engine runs them. Setting one off is a numbered presence event,
// so everyone's game runs the same trap at the same time, and each game applies it to its own player (and the
// bot controller to the bots). Kinds:
//   magnet: {kind, triggers:[mesh], magnets:[{x,y,z,ring}], dur, cool}: magnets grab anyone close for a while
//   idol:   {kind, altar:{x,y,z}, crater:{x,y,z,r}, dur, cool}: throw the idol in the crater and the volcano erupts
let trapN=0, lastTrap=0; const lastTrapSeen=new Map(), meMag={};
const idolStone=new THREE.MeshStandardMaterial({color:"#4a4038",roughness:.8,flatShading:true});
const idolGold=new THREE.MeshStandardMaterial({color:"#e8b030",metalness:.8,roughness:.3,emissive:"#5a3a00",emissiveIntensity:.5});
const idolEyes=new THREE.MeshBasicMaterial({color:"#7dffd0",toneMapped:false});
const lavaMat=new THREE.MeshBasicMaterial({color:"#ffb040",toneMapped:false});
function setupTraps(){
  traps.forEach((T,i)=>{ T.i=i; T.active=0; T.cd=0; T.windup=0; T.by=null; T.bombT=0;
    for (const m of (T.triggers||[])){ m.userData.trap=i; if (!grappleables.includes(m)) grappleables.push(m); }
    if (T.kind==="magnet"){ T.dur=T.dur||8; T.cool=T.cool||18; T.mat=T.magnets[0] && T.magnets[0].ring.material; T.base=T.mat ? T.mat.color.clone() : null; }
    if (T.kind==="gust"){ T.dur=T.dur||6; T.cool=T.cool||22; const l=Math.hypot(T.dir[0],T.dir[1])||1; T.dir=[T.dir[0]/l,T.dir[1]/l]; }
    if (T.kind==="zap"){ T.dur=T.dur||6; T.cool=T.cool||22; T.minAbove=T.minAbove??5; }
    if (T.kind==="boulder"){ T.dur=T.dur||11; T.cool=T.cool||30; T.r=T.r||2.4; }
    if (T.kind==="idol"){ T.dur=T.dur||12; T.cool=T.cool||40;
      const g=new THREE.Group();
      const body=new THREE.Mesh(new THREE.BoxGeometry(.9,1.3,.7),idolStone); g.add(body);
      const head=new THREE.Mesh(new THREE.BoxGeometry(1.1,.8,.85),idolStone); head.position.y=1; g.add(head);
      const mask=new THREE.Mesh(new THREE.BoxGeometry(.9,.5,.1),idolGold); mask.position.set(0,1.02,.44); g.add(mask);
      for (const sx of [-.22,.22]){ const e=new THREE.Mesh(new THREE.BoxGeometry(.16,.1,.05),idolEyes); e.position.set(sx,1.08,.5); g.add(e); }
      g.traverse(o=>{ if (o.isMesh){ o.castShadow=true; o.userData.idol=i; } });
      const pick=new THREE.Mesh(new THREE.BoxGeometry(1.2,2.2,1),new THREE.MeshBasicMaterial({visible:false})); pick.position.y=.35; g.add(pick);
      scene.add(g);
      const b=new CANNON.Body({mass:2.5,shape:new CANNON.Box(new CANNON.Vec3(.5,1.05,.45)),linearDamping:.05});
      b.position.set(T.altar.x,T.altar.y+1.2,T.altar.z); world.addBody(b);
      pick.userData.body=b; grappleables.push(pick); g.userData.body=b;
      T.idol={mesh:g,body:b}; dynamics.push({mesh:g,body:b,p0:b.position.clone(),q0:b.quaternion.clone()});
    }
  });
}
// a generic trigger post for map traps: a striped pole with a big glowing button on top (hit it or hook it)
function trapTrigger(x,z,color="#ff3a2a",ht=2.2){
  const g=H(x,z), grp=new THREE.Group(); grp.position.set(x,g,z); scene.add(grp);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.22,.28,ht,8),new THREE.MeshStandardMaterial({color:"#2a2a30",roughness:.6,metalness:.4})); pole.position.y=ht/2; pole.castShadow=true; grp.add(pole);
  for (let k=0;k<3;k++){ const band=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.18,8),new THREE.MeshStandardMaterial({color:"#ffd020",roughness:.5})); band.position.y=.4+k*.6; grp.add(band); }
  const btn=new THREE.Mesh(new THREE.SphereGeometry(.55,14,10),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.4})); btn.position.y=ht+.35; grp.add(btn);
  const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Cylinder(.28,.28,ht,8)); b.position.set(x,g+ht/2,z); world.addBody(b);
  camBlockers.push(pole); return btn;
}
function claimIdol(b){ for (const T of traps) if (T.idol && T.idol.body===b) T.lastTouch={peer:myPeer||"me",name:myName()}; }
function onHookBite(h){
  const tr=h.obj && h.obj.userData.trap; if (tr!=null) triggerTrap(tr,{peer:myPeer||"me",name:myName()},true);
  if (h.body) claimIdol(h.body);
}
function resetIdol(T){ const b=T.idol.body; b.position.set(T.altar.x,T.altar.y+1.2,T.altar.z); b.velocity.set(0,0,0); b.angularVelocity.set(0,0,0); b.quaternion.set(0,0,0,1); b.interpolatedPosition.copy(b.position); T.lastTouch=null; if (hook && hook.body===b) hook.phase="retract"; }
function triggerTrap(i,by,local){
  const T=traps[i]; if (!T || T.cd>0) return false;
  T.active=T.dur; T.cd=T.dur+T.cool; T.by=by; T.windup=T.kind==="magnet"?.8:0;
  if (local){ trapN++; lastTrap={n:trapN,i,by:String(by.name).slice(0,16)}; stats.traps++; }
  const mine=by.name===myName();
  if (T.kind==="magnet"){ toast("MAGNETS ON!", mine?"Anyone near a magnet gets stuck. Heh.":by.name+" powered the magnets. Stay clear!"); announce("magnets","Magnets on!",true);
    for (let k=0;k<4;k++) tone(110,.25,"sawtooth",.05,1.02,k*.2); }
  if (T.kind==="gust"){ toast("GUST!", mine?"Hold on to something.":by.name+" called the wind. Hold on!"); announce("gust","Hold on to your hats!",true); noise(T.dur,{type:"bandpass",f:400,f2:900,q:.6,vol:.25}); gustFx(true); }
  if (T.kind==="zap"){ toast("POWER SURGE!", mine?"The rooftops are live.":by.name+" overloaded the grid. Get off the roofs!"); announce("surge","Power surge!",true); T.pulse=0; }
  if (T.kind==="boulder"){ toast(T.label||"BOULDER!", mine?"Here it comes...":by.name+" let it roll. Look out below!"); announce("boulder","Look out below!",true); spawnBoulder(T); }
  if (T.kind==="idol"){ const c=T.crater; toast("ERUPTION!", mine?"You fed the idol to the volcano.":by.name+" fed the idol to the volcano. Take cover!"); announce("erupt","The volcano is erupting!",true);
    flashT=.9; shakeT=Math.max(shakeT,1.2); explode(c.x,c.y+3,c.z,22,1.5,by,false); noise(3,{type:"lowpass",f:300,f2:40,vol:.8}); tone(40,3,"sine",.4,.6);
    resetIdol(T); }
  return true;
}
// magnets: pull anyone within 10 m, pin them under it; mash Jump to break free
function magnetStep(body,st,dt,isMe){
  if (st.free>simTime) { st.mag=null; return; }
  for (const T of traps){ if (T.kind!=="magnet" || T.active<=0 || T.windup>0) continue;
    for (const m of T.magnets){ const ux=m.x-body.position.x, uy=(m.y-1.4)-body.position.y, uz=m.z-body.position.z, d=Math.hypot(ux,uy,uz)||1e-3, v=body.velocity;
      if (st.mag===m || d<2.2){
        if (st.mag!==m){ st.mag=m; st.mash=0; st.t=simTime; if (isMe){ toast("STUCK!",isTouch?"Mash Jump to break free":"Mash Space to break free"); tone(80,.4,"square",.06); if (T.by && T.by.name!==myName()) lastHitBy={peer:T.by.peer,name:T.by.name,t:simTime}; } else st.by=T.by; }
        v.x=ux*8; v.y=uy*8+26*dt; v.z=uz*8;
        if (isMe){ knockUntil=Math.max(knockUntil,simTime+.15); if (hook) hook.phase="retract"; gliding=false; if (T.by && T.by.name!==myName()) lastHitBy={peer:T.by.peer,name:T.by.name,t:simTime}; }
        return; }
      if (d<10){ const k=(52*(1-d/10)+6)*dt/d; v.x+=ux*k; v.y+=uy*k+26*dt*.5; v.z+=uz*k; } } }
  st.mag=null;
}
// wind streaks for gusts
const gustLines=[]; const gustMat=new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.35,depthWrite:false});
function gustFx(on){ if (on && !gustLines.length) for (let i=0;i<70;i++){ const m=new THREE.Mesh(new THREE.BoxGeometry(.04,.04,3),gustMat); m.visible=false; scene.add(m); gustLines.push(m); } }
function spawnBoulder(T){
  if (T.ball){ scene.remove(T.ball.mesh); world.removeBody(T.ball.body); }
  const m=new THREE.Mesh(new THREE.IcosahedronGeometry(T.r,1),new THREE.MeshStandardMaterial({color:T.color||"#7a6a58",roughness:.9,flatShading:true})); m.castShadow=true; scene.add(m);
  const b=new CANNON.Body({mass:60,shape:new CANNON.Sphere(T.r),collisionFilterGroup:16,collisionFilterMask:1|4|16,linearDamping:.02,angularDamping:.02});
  b.position.set(T.from.x,T.from.y,T.from.z); const dx=T.to.x-T.from.x, dz=T.to.z-T.from.z, dl=Math.hypot(dx,dz)||1; b.velocity.set(dx/dl*16,0,dz/dl*16); world.addBody(b);
  T.ball={mesh:m,body:b,hit:new Set()};
}
// what a trap does to one body each physics step (me, or a bot on the controller's game)
function trapForces(body,dt,isMe,st){
  for (const T of traps){ if (T.active<=0) continue;
    const v=body.velocity, p=body.position;
    if (T.kind==="gust"){ const onG = isMe ? standing : st.standing; const k=(onG?60:24)*dt*(isMe&&gliding?1.4:1); v.x+=T.dir[0]*k; v.z+=T.dir[1]*k; }
    if (T.kind==="boulder" && T.ball){ const q=T.ball.body.position, id=isMe?"me":st.key; if (!T.ball.hit.has(id) && Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<T.r+.8){ T.ball.hit.add(id);
      const bv=T.ball.body.velocity, bl=Math.hypot(bv.x,bv.z)||1, dir=[bv.x/bl,bv.z/bl];
      if (isMe){ if (shieldT>0) toast("Shield blocked it!"); else { v.x+=dir[0]*30; v.z+=dir[1]*30; v.y=Math.max(v.y,11); knockUntil=simTime+1.1; spinUntil=simTime+1; faceHurtT=1.2; shakeT=Math.max(shakeT,.5); crack(); toast("FLATTENED!"); if (T.by && T.by.name!==myName()) lastHitBy={peer:T.by.peer,name:T.by.name,t:simTime}; } }
      else if (st.bot){ v.x+=dir[0]*30; v.z+=dir[1]*30; v.y=Math.max(v.y,11); st.bot.knockUntil=simTime+1.1; if (T.by) st.bot.lastHitBy={peer:T.by.peer,name:T.by.name,t:simTime}; } } }
  }
}
function updateTraps(dt){
  for (const T of traps){
    if (T.cd>0) T.cd=Math.max(0,T.cd-dt);
    if (T.windup>0) T.windup=Math.max(0,T.windup-dt);
    if (T.active>0) T.active=Math.max(0,T.active-dt);
    if (T.kind==="magnet" && T.mat){ const on=T.active>0; T.mat.color.copy(on ? (T.windup>0 && Math.sin(performance.now()/40)>0 ? T.base : tmpCol.set("#ff3020")) : T.base); T.mat.emissive.copy(T.mat.color); }
    if (T.kind==="gust" && T.active>0 && gustLines.length){ const c=camera.position;
      for (const m of gustLines){ if (!m.visible || m.position.distanceTo(c)>40){ m.visible=true; m.position.set(c.x-T.dir[0]*30+(Math.random()-.5)*50,c.y+(Math.random()-.5)*20,c.z-T.dir[1]*30+(Math.random()-.5)*50); m.lookAt(m.position.x+T.dir[0],m.position.y,m.position.z+T.dir[1]); }
        m.position.x+=T.dir[0]*45*dt; m.position.z+=T.dir[1]*45*dt; } }
    if (T.kind==="gust" && T.active<=0 && gustLines.length && gustLines[0].visible) for (const m of gustLines) m.visible=false;
    if (T.kind==="zap" && T.active>0){ T.pulse=(T.pulse||0)-dt; if (T.pulse<=0){ T.pulse=.9; flashT=Math.max(flashT,.15); tone(90,.25,"sawtooth",.06,1.5);
        // anyone on a roof gets zapped up into the air
        if (running && deadT<=0 && standing && pBody.position.y-Math.max(0,H(pBody.position.x,pBody.position.z))>T.minAbove){ const v=pBody.velocity; v.y=13; v.x+=(Math.random()-.5)*14; v.z+=(Math.random()-.5)*14; knockUntil=simTime+.6; faceHurtT=1; shakeT=Math.max(shakeT,.3); toast("ZAP!"); puff(pBody.position); if (T.by && T.by.name!==myName()) lastHitBy={peer:T.by.peer,name:T.by.name,t:simTime}; }
        if (amController) for (const b of bots){ const q=b.body.position; if (b.standing && q.y-Math.max(0,H(q.x,q.z))>T.minAbove){ b.body.velocity.y=13; b.body.velocity.x+=(Math.random()-.5)*14; b.body.velocity.z+=(Math.random()-.5)*14; b.knockUntil=simTime+.6; if (T.by) b.lastHitBy={peer:T.by.peer,name:T.by.name,t:simTime}; } } } }
    if (T.kind==="boulder" && T.ball){ const b=T.ball.body; T.ball.mesh.position.copy(b.interpolatedPosition); T.ball.mesh.quaternion.copy(b.interpolatedQuaternion);
      if (Math.hypot(b.velocity.x,b.velocity.z)>3 && Math.random()<.3) puff({x:b.position.x,y:b.position.y-T.r+.5,z:b.position.z});
      if (T.active<=0 || b.position.y<-4){ scene.remove(T.ball.mesh); T.ball.mesh.geometry.dispose(); world.removeBody(b); T.ball=null; } }
    if (T.kind==="idol"){
      const q=T.idol.body.position, c=T.crater;
      if (q.y<-1.5 || q.y<H(q.x,q.z)-4) resetIdol(T);
      else if (T.cd<=0 && Math.hypot(q.x-c.x,q.z-c.z)<c.r && q.y<c.y+7) triggerTrap(T.i,T.lastTouch||{peer:myPeer||"me",name:myName()},true);
      // eruption: lava bombs rain down around the crater
      if (T.active>0 && !simFrozen){ T.bombT-=dt; if (T.bombT<=0){ T.bombT=.22;
        const a=Math.random()*Math.PI*2, r=12+Math.random()*70, tx=c.x+Math.cos(a)*r, tz=c.z+Math.sin(a)*r, ty=Math.max(0,H(tx,tz)), ft=1.8+Math.random()*1.2, g=26;
        const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.7+Math.random()*.5,0),lavaMat); m.position.set(c.x,c.y+4,c.z); scene.add(m);
        projectiles.push({kind:"lava",mesh:m,vel:new THREE.Vector3((tx-c.x)/ft,(ty-(c.y+4)+.5*g*ft*ft)/ft,(tz-c.z)/ft),t:ft+.5,by:T.by}); } }
    }
  }
}
const tmpCol=new THREE.Color();
setupTraps();

// ---------------- bots ----------------
// One player's game runs the bots (the lowest peer id among players who aren't paused) and shares their
// poses in presence; everyone else draws them. Hits on bots are routed to that player as "bot:<id>".
// The bots are a cast of original characters. Personality numbers drive the AI:
// aggr = how hard they chase and how often they swing, fear = how readily they run away,
// grapple = how often they swing on ropes, dodge = chance to slip a hit, power = knockback, grudge = hunts whoever hit them.
const CHARACTERS=[
  {key:"matteo",skin:"#e8b48a",hair:"#2a1a10",feature:"mustache",name:"Matteo",full:"Matteo “Il Fulmine” Ricci",from:"Italy",stripes:["#009246","#f4f5f0","#ce2b37"],suit:"#1f8f4e",hat:"#ce2b37",scale:1,
   trait:"Hyper-aggressive showboat",intro:"Ciao, everybody! Try to keep up.",taunt:"Bellissimo!",hurt:"Mamma mia!",anim:"spin",
   aggr:1,fear:0,speed:1.08,grapple:1,dodge:0,power:1,voice:{tts:"buttery",rate:1.2,pitch:1.1,lang:"it"}},
  {key:"yuki",skin:"#f2d2b0",hair:"#141418",feature:"bangs",name:"Yuki",full:"Yuki Tanabe",from:"Japan",stripes:["#f4f5f0","#bc002d","#f4f5f0"],suit:"#2b2f3a",hat:"#bc002d",scale:.95,
   trait:"Precise sky-runner. Avoids fights",intro:"Let us begin. Precisely.",taunt:"Efficient.",hurt:"Unacceptable.",anim:"bow",
   aggr:.25,fear:.2,speed:1.05,grapple:2.2,dodge:.25,power:.8,voice:{tts:"glassy",rate:1,pitch:1.2,lang:"ja"}},
  {key:"lars",skin:"#f4c8a8",hair:"#d8a040",feature:"beard",name:"Lars",full:"“Big” Lars Brekke",from:"Norway",stripes:["#ba0c2f","#f4f5f0","#00205b"],suit:"#00205b",hat:"#ba0c2f",scale:1.3,
   trait:"Slow, huge, hits like a landslide",intro:"Ha! The fjords made me strong!",taunt:"Like chopping wood!",hurt:"Is that all?",anim:"pound",
   aggr:.8,fear:0,speed:.78,grapple:.5,dodge:0,power:1.5,voice:{tts:"rounded",rate:.9,pitch:.5,lang:"nb"}},
  {key:"pip",skin:"#b8805a",hair:"#1a1010",feature:"bigeyes",name:"Pip",full:"Priya “Pip” Nair",from:"India",stripes:["#ff9933","#f4f5f0","#138808"],suit:"#ff9933",hat:"#138808",scale:.9,
   trait:"Terrified of everyone. Bites when cornered",intro:"Oh no, oh no, is it starting already?",taunt:"Sorry! So sorry!",hurt:"Aaah! Not the face!",anim:"cower",
   aggr:.15,fear:.95,speed:1.15,grapple:1.2,dodge:.15,power:.9,voice:{tts:"airy",rate:1.3,pitch:1.5,lang:"en-in"}},
  {key:"kofi",skin:"#6a4026",hair:"#141010",feature:"shades",name:"Kofi",full:"Kofi “Smooth” Mensah",from:"Ghana",stripes:["#ce1126","#fcd116","#006b3f"],suit:"#fcd116",hat:"#006b3f",scale:1,
   trait:"Trickster. Dodges and taunts",intro:"Relax, my friend. This will be fun.",taunt:"Too slow, my friend!",hurt:"Okay, okay. Nice one.",anim:"dance",
   aggr:.55,fear:.1,speed:1.1,grapple:1,dodge:.45,power:1,voice:{tts:"buttery",rate:1.05,pitch:.85,lang:"en-gh"}},
  {key:"valentina",skin:"#e0a882",hair:"#4a1a12",feature:"earrings",name:"Valentina",full:"Valentina “La Furia” Cruz",from:"Argentina",stripes:["#74acdf","#f4f5f0","#74acdf"],suit:"#74acdf",hat:"#f6b40e",scale:1,
   trait:"Holds grudges. Hit her once and she hunts you",intro:"You want trouble? You found it.",taunt:"That's what you get!",hurt:"Oh, now you've done it.",anim:"knuckles",
   aggr:.6,fear:0,speed:1.05,grapple:1.1,dodge:.1,power:1.1,grudge:true,voice:{tts:"glassy",rate:1.1,pitch:1,lang:"es"}},
  {key:"dylan",skin:"#f0c08e",hair:"#f6d55c",feature:"shaggy",name:"Dylan",full:"Dylan “Swell” Hayes",from:"California, USA",stripes:["#b22234","#f4f5f0","#3c3b6e"],suit:"#2ec4b6",hat:"#f6d55c",scale:1,
   trait:"Chill surfer. Rides ropes, rarely starts a fight",intro:"Duuude. Gnarly island, bro.",taunt:"Wipeout, brah!",hurt:"Whoa. Harsh, man.",anim:"shaka",
   aggr:.35,fear:0,speed:.95,grapple:1.7,dodge:.3,power:1,voice:{tts:"rounded",rate:.9,pitch:.9,lang:"en-us"}},
];
const BOT_NAMES=CHARACTERS.map(c=>c.name);
// the player's own character: one of the cast, or the original climber
const CLASSIC={key:"classic",name:"Climber",full:"The Climber",from:"Skyhook",suit:"#f26b3a",hat:"#22314d",scale:1,skin:"#ffd9b8",hair:"#22314d",feature:"goggles",stripes:["#f26b3a","#22314d","#7ce0ff"]};
const charByKey=k=>CHARACTERS.find(c=>c.key===k)||CLASSIC;
let myCharKey="classic"; try{ myCharKey=localStorage.getItem("skyhook.char")||"classic"; }catch(e){}
// character models: one shared body, dressed per character (skin, eyes, signature feature, flag band, legs and boots)
const dressMats=new Map();
const dmat=(c,r=.7,metal=0)=>{ const k=c+"|"+r+"|"+metal; if (!dressMats.has(k)) dressMats.set(k,new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:metal})); return dressMats.get(k); };
const DG={ eye:new THREE.SphereGeometry(.042,8,6), eyeW:new THREE.SphereGeometry(.078,10,8), pupil:new THREE.SphereGeometry(.04,8,6), puff:new THREE.SphereGeometry(.11,8,6),
  leg:new THREE.CylinderGeometry(.11,.095,.24,8), boot:new THREE.BoxGeometry(.2,.12,.3), band:new THREE.CylinderGeometry(.372,.372,.05,20,1,true),
  beard:new THREE.SphereGeometry(.25,14,8,0,Math.PI*2,Math.PI*.52,Math.PI*.48), stache:new THREE.BoxGeometry(.26,.055,.07), bangs:new THREE.BoxGeometry(.5,.11,.14),
  shades:new THREE.BoxGeometry(.46,.1,.1), ring:new THREE.TorusGeometry(.045,.012,6,12), tail:new THREE.SphereGeometry(.13,10,8) };
function dressBody(body,C){
  const old=body.getObjectByName("dress"); if (old) body.remove(old);
  const d=new THREE.Group(); d.name="dress"; body.add(d);
  const add=(geo,m,x,y,z,sx=1,sy=1,sz=1,rx=0)=>{ const o=new THREE.Mesh(geo,m); o.position.set(x,y,z); o.scale.set(sx,sy,sz); o.rotation.x=rx; o.castShadow=true; d.add(o); return o; };
  const skin=dmat(C.skin||"#ffd9b8",.8), hair=dmat(C.hair||"#22314d",.75), dark=dmat("#141820",.3);
  body.children[1].material=skin;
  for (const n of ["armL","armR"]){ const arm=body.getObjectByName(n); if (arm && arm.children[1]) arm.children[1].material=skin; }
  body.children[3].visible = C.feature==="goggles";
  const f=C.feature;
  if (f==="bigeyes") for (const sx of [-.1,.1]){ add(DG.eyeW,dmat("#ffffff",.3),sx,.7,-.25); add(DG.pupil,dark,sx,.69,-.32); }
  else if (f!=="goggles" && f!=="shades") for (const sx of [-.1,.1]) add(DG.eye,dark,sx,.71,-.27);
  if (f==="shades") add(DG.shades,dmat("#0a0a0e",.15,.6),0,.71,-.26);
  if (f==="mustache") add(DG.stache,hair,0,.6,-.285);
  if (f==="beard"){ add(DG.beard,hair,0,.66,-.05,1.05,1.1,1); add(DG.stache,hair,0,.6,-.29); }
  if (f==="bangs"){ add(DG.bangs,hair,0,.84,-.2,1,1,1,.35); add(DG.tail,hair,0,.72,.3); }
  if (f==="earrings"){ for (const sx of [-.3,.3]){ const r=add(DG.ring,dmat("#f6c040",.25,.9),sx,.58,0); r.rotation.y=Math.PI/2; } add(DG.tail,hair,0,.8,.24,1.3,1.1,1); }
  if (f==="shaggy") for (const [x,y,z] of [[-.22,.82,-.1],[.22,.82,-.1],[0,.9,-.16],[-.26,.7,.08],[.26,.7,.08],[0,.84,.2],[-.14,.92,.08],[.14,.92,.08]]) add(DG.puff,hair,x,y,z);
  // a band of the character's flag stripes around the chest
  const st=C.stripes||["#f26b3a","#22314d","#7ce0ff"]; st.forEach((c,i)=>add(DG.band,dmat(c,.6),0,.3-i*.05,0));
  // legs and boots, pivoting at the hip so they can swing
  const legM=dmat(new THREE.Color(C.suit||"#f26b3a").multiplyScalar(.6).getStyle(),.7), bootM=dmat("#26262c",.6);
  for (const [n,sx] of [["legL",-.16],["legR",.16]]){ const g=new THREE.Group(); g.name=n; g.position.set(sx,-.3,0); d.add(g);
    const l=new THREE.Mesh(DG.leg,legM); l.position.y=-.1; l.castShadow=true; g.add(l); const b=new THREE.Mesh(DG.boot,bootM); b.position.set(0,-.22,-.04); b.castShadow=true; g.add(b); }
}
function applyHeroLook(){
  const C=charByKey(myCharKey);
  heroBody.children[0].material=new THREE.MeshStandardMaterial({color:C.suit,roughness:.6});
  for (const n of ["armL","armR"]) heroBody.getObjectByName(n).getObjectByName("limb").material=heroBody.children[0].material;
  heroBody.children[2].material=new THREE.MeshStandardMaterial({color:C.hat,roughness:.7});
  hero.scale.setScalar(C.scale||1); dressBody(heroBody,C);
  $("faceName").textContent=C.name;
}
{ const sel=$("optChar"); for (const C of [CLASSIC,...CHARACTERS]){ const o=document.createElement("option"); o.value=C.key; o.textContent=C.key==="classic"?"The Climber (classic)":`${C.name} · ${C.from}`; sel.append(o); }
  sel.value=myCharKey; sel.addEventListener("change",()=>{ myCharKey=sel.value; try{ localStorage.setItem("skyhook.char",myCharKey); }catch(e){} applyHeroLook(); bots.forEach(removeBot); bots=[]; }); }
applyHeroLook();
let bots=[], botSerial=1, amController=false, wantBots=2, bspN=0, lastBsp=0;
const botAvatars=new Map(), lastBspSeen=new Map();
try{ const b=localStorage.getItem("skyhook.bots"); if (b!==null) wantBots=Math.max(0,Math.min(7,+b|0)); }catch(e){}
$("optBots").value=String(wantBots);
$("optBots").addEventListener("change",()=>{ wantBots=+$("optBots").value|0; try{ localStorage.setItem("skyhook.bots",String(wantBots)); }catch(e){} });
function isBotController(){
  if (!room || !myPeer) return true;
  if (!running) return false;
  for (const a of avatars.values()) if (a.pres && !a.pres.ps && a.peer<myPeer) return false;
  return true;
}
function landNear(c){
  for (let k=0;k<40;k++){ const a=Math.random()*Math.PI*2, d=14+Math.random()*22, x=c.x+Math.cos(a)*d, z=c.z+Math.sin(a)*d;
    if (Math.abs(x)>HALF*.85 || Math.abs(z)>HALF*.85) continue; const g=H(x,z); if (g>1 && slopeAt(x,z)<.5) return [x,g+2,z]; }
  return [spawnPos.x+4,spawnPos.y,spawnPos.z+4];
}
function spawnBot(i){
  const body=new CANNON.Body({mass:5,shape:new CANNON.Sphere(.5),fixedRotation:true,linearDamping:.01,material:playerMat,collisionFilterGroup:8,collisionFilterMask:1|4});
  body.allowSleep=false;   // a sleeping body ignores the velocity the AI sets, so bots never sleep
  body.position.set(...landNear(pBody.position)); body.interpolatedPosition.copy(body.position); world.addBody(body);
  const taken=new Set([myCharKey,...[...avatars.values()].map(a=>a.pres&&a.pres.pc).filter(Boolean),...bots.map(b=>b.C.key)]);
  const free=CHARACTERS.filter(c=>!taken.has(c.key)); const C=free.length?free[0]:CHARACTERS[i%CHARACTERS.length], ch=CHARACTERS.indexOf(C);
  bots.push({id:botSerial++,ch,C,name:C.name,grudge:null,introT:0,lastSay:0,body,yaw:0,hook:null,cd:1.5+Math.random(),grappleCd:2+Math.random()*2,wish:new THREE.Vector3(),speed:7.5,
    bat:0,swingN:0,knockUntil:-9,jumpT:-9,lastHitBy:null,stuck:0,standing:false,dunks:0,wander:null,wanderT:0,pickup:null,got:new Set(),sparkCount:0,target:null,reel:16});
}
function removeBot(b){ world.removeBody(b.body); }
// characters talk in text only: a speech bubble over their head and a line in the chat log
function botSay(C,text,priority,log=true){
  for (const a of botAvatars.values()) if (a.C===C){ a.sayText=text; a.sayT=2.8; }
  const now=performance.now();
  if (log && (priority || now-(C._lastLog||0)>4000)){ C._lastLog=now; addChat(C.name,text,"#ffb86b"); remember(C,"them",text); lastSpeaker={C,t:now}; }
}
function hitBot(key,dir,bat,fromPeer,fromName){
  const b=bots.find(x=>"bot:"+x.id===key); if (!b) return;
  if (b.shieldT>0) return;
  if (Math.random()<b.C.dodge){ const v=b.body.velocity; v.x+=-dir[1]*9; v.z+=dir[0]*9; v.y=Math.max(v.y,4); b.jumpT=simTime; if (fromPeer===(myPeer||"me")){ toast(b.name+" dodged!",b.C.taunt); botSay(b.C,b.C.taunt); } return; }
  if (Math.random()<.6) botSay(b.C,b.C.hurt);
  if (b.C.grudge) b.grudge={peer:fromPeer,until:simTime+20};
  const v=b.body.velocity, k=(bat?BAT_K:10)/Math.sqrt(b.C.scale); v.x+=dir[0]*k; v.z+=dir[1]*k; v.y=Math.max(v.y,bat?BAT_UP:5);
  b.knockUntil=simTime+(bat?1.3:.45); b.hook=null; b.lastHitBy={peer:fromPeer,name:fromName,t:simTime};
}
function creditBot(key){ const b=bots.find(x=>"bot:"+x.id===key); if (b) b.dunks++; }
function botSplash(b){
  b.falls=(b.falls||0)+1;
  const by=b.lastHitBy && simTime-b.lastHitBy.t<8 ? b.lastHitBy : null;
  b.body.position.set(...landNear(pBody.position)); b.body.velocity.set(0,0,0); b.body.interpolatedPosition.copy(b.body.position); b.hook=null; b.lastHitBy=null;
  if (!by) return;
  if (by.peer.startsWith("bot:")){ creditBot(by.peer); return; }
  if (by.peer===(myPeer||"me")){ dunks++; faceHappyT=2; announce("dunk","Dunked! "+b.name+" is swimming."); toast("Dunked "+b.name+"!","Bots can't swim."); }
  else { bspN++; lastBsp={n:bspN,by:by.peer,name:b.name}; }
}
function botAttack(b,t){
  b.swingN++; const bat=b.bat>0, p=b.body.position;
  let dx=t.pos.x-p.x, dz=t.pos.z-p.z; const d=Math.hypot(dx,dz)||1; dx/=d; dz/=d;
  const near=Math.hypot(p.x-pBody.position.x,p.z-pBody.position.z)<35;
  if (t.me){ takeHit([dx,dz],bat,{peer:"bot:"+b.id,name:b.name},b.C.power); }
  else if (t.bot){ hitBot(t.peer,[dx,dz],bat,"bot:"+b.id,b.name); if (near) (bat?crack:thud)(); }
  else { hitN++; lastHit={n:hitN,to:t.peer,d:[r2(dx),r2(dz)],f:bat?1:0,bn:b.name,bid:b.id,m:b.C.power}; if (near) (bat?crack:thud)(); }
  if (Math.random()<.35) botSay(b.C,b.C.taunt);
  if (near && !t.me) whoosh(bat);
}
// per-frame decisions for each bot (only on the controlling player's game)
const bRay=new THREE.Raycaster();
function botThink(b,dt){
  const p=b.body.position, v=b.body.velocity;
  b.cd-=dt; b.grappleCd-=dt; if (b.bat>0) b.bat=Math.max(0,b.bat-dt);
  if (p.y < -1.8){ botSplash(b); return; }
  botItems(b,dt);
  // nearest player who is actually playing
  let best=null, bd=1e9;
  const cands=[];
  if (running && raceCount<=0) cands.push({me:true,peer:myPeer||"me",pos:pBody.position});
  for (const a of avatars.values()) if (a.pres && !a.pres.ps) cands.push({me:false,peer:a.peer,pos:a.disp});
  if (MODE==="sumo") for (const o of bots) if (o!==b && !(o.introT>0)) cands.push({me:false,bot:true,peer:"bot:"+o.id,pos:o.body.position});
  // bots that got bored of a stalemate leave that opponent alone for a while
  const avoid=b.avoid||(b.avoid=new Map());
  const pool = cands.filter(c=>!(avoid.get(c.peer)>simTime)); const pickFrom = pool.length ? pool : cands;
  for (const c of pickFrom){ const d=Math.hypot(c.pos.x-p.x,c.pos.y-p.y,c.pos.z-p.z); if (d<bd){ bd=d; best=c; } }
  const C=b.C;
  if (b.introT>0){ b.introT-=dt; b.wish.set(0,0,0); return; }
  // grudge: hunt whoever hit us last
  if (b.grudge && simTime<b.grudge.until){ const g=cands.find(c=>c.peer===b.grudge.peer); if (g){ best=g; bd=Math.hypot(g.pos.x-p.x,g.pos.y-p.y,g.pos.z-p.z); } } else b.grudge=null;
  // aggressive characters break off the race to fight anyone who comes close; grudges always win
  const fightRange = MODE==="sumo" ? 999 : b.grudge ? 120 : (C.aggr>.4 ? 6+C.aggr*22 : 0);
  let goal = best && bd<fightRange ? best.pos : null;
  // fear: run from anyone close, especially if they carry a bat
  let fleeing=false;
  if (best && bd<12){ const armed = best.me ? batTime>0 : !!(avatars.get(best.peer)&&avatars.get(best.peer).pres&&avatars.get(best.peer).pres.bt);
    if (MODE==="sumo" ? (C.fear>.8 && armed) : (C.fear>.5 || (armed && C.fear>0))){ fleeing = bd>2.4 || C.fear<.9; } }
  if (fleeing){ const fx=p.x-best.pos.x, fz=p.z-best.pos.z, fl=Math.hypot(fx,fz)||1; b.wish.set(fx/fl,0,fz/fl); b.speed=11*C.speed;
    if (simTime-b.lastSay>4 && Math.random()<.02){ b.lastSay=simTime; botSay(C,C.hurt); }
    if (p.y<-1.8) botSplash(b); if (Math.hypot(v.x,v.z)>1) b.yaw=Math.atan2(-v.x,-v.z); return; }
  // detour for a bat if one is close
  b.pickup=null;
  if (b.bat<=0 && RULES.bats) for (const g of batPickups){ if (g.cd>0) continue; const d=g.pos.distanceTo(tmpV.set(p.x,p.y,p.z)); if (d<35 && d<bd*.8){ goal=g.pos; b.pickup=g; break; } }
  if (!(b.gliderT>0)) for (const g of gliderPickups){ if (g.cd<=0 && g.pos.distanceTo(tmpV.set(p.x,p.y,p.z))<2.2){ b.gliderT=GLIDE_TIME; g.cd=GLIDER_RESPAWN; g.grp.visible=g.beam.visible=false; break; } }
  if (b.gliderT>0) b.gliderT=Math.max(0,b.gliderT-dt);
  if (b.pickup && b.pickup.pos.distanceTo(tmpV.set(p.x,p.y,p.z))<2.2){ b.bat=BAT_TIME; b.pickup.cd=BAT_RESPAWN; b.pickup.grp.visible=b.pickup.beam.visible=false; b.pickup=null; }
  if (!goal && !b.pickup){ if (botRace(b,dt)){ botHop(b,dt); return; } }
  if (!goal){ b.wanderT-=dt; if (!b.wander || b.wanderT<=0){ b.wander=new THREE.Vector3(...landNear(p)); b.wanderT=6; } goal=b.wander; }
  if (best && goal===best.pos && !b.pickup) goal=botTactics(b,best,bd,dt) || goal;
  const gx=goal.x-p.x, gz=goal.z-p.z, gd=Math.hypot(gx,gz);
  if (gd>1.2) b.wish.set(gx/gd,0,gz/gd); else b.wish.set(0,0,0);
  b.speed = (gd>14 ? 11 : 7.5)*C.speed*(b.grudge?1.15:1);
  // swing when close (cornered cowards lash out too)
  const reach=(b.bat>0?3:2)*Math.sqrt(C.scale);
  if (best && !b.pickup && bd<reach && Math.abs(best.pos.y-p.y)<2 && b.cd<=0 && (C.aggr>.2 || bd<1.6)){ botAttack(b,best); b.cd=(2.6-1.6*C.aggr)+Math.random()*1.2; }
  // grapple toward far or high goals
  if (b.hook){ b.hook.t+=dt; if (b.hook.t>3.5 || b.hook.len<4 || gd<8) { b.hook=null; b.grappleCd=1.5+Math.random()*2; } }
  else if (b.grappleCd<=0 && (gd>28/C.grapple || goal.y-p.y>5/C.grapple)){
    b.grappleCd=(2+Math.random()*2)/C.grapple;
    const from=new THREE.Vector3(p.x,p.y+1,p.z), dir=new THREE.Vector3(goal.x,goal.y+7,goal.z).sub(from).normalize();
    bRay.set(from,dir); bRay.far=70;
    const hit=bRay.intersectObjects(grappleables,false).find(h=>!h.object.userData.remote && !h.object.userData.body);
    if (hit && hit.distance>6) b.hook={point:hit.point.clone(),len:hit.distance*.95,t:0};
  }
  botHop(b,dt);
}
// ---- fighting tactics ----
// The nearest way off the land from a point: march out in 12 directions until the ground drops into the sea.
const edgeCache=new Map();
function edgeFrom(x,z){
  const key=Math.round(x)+","+Math.round(z), hit=edgeCache.get(key); if (hit) return hit;
  let best={d:99,dx:0,dz:0};
  for (let k=0;k<12;k++){ const a=k/12*Math.PI*2, dx=Math.cos(a), dz=Math.sin(a);
    for (let r=1;r<=16;r++){ if (H(x+dx*r,z+dz*r)<.5){ if (r<best.d) best={d:r,dx,dz}; break; } } }
  if (edgeCache.size>4000) edgeCache.clear(); edgeCache.set(key,best); return best;
}
const tacTmp=new THREE.Vector3();
function botTactics(b,best,bd,dt){
  const p=b.body.position, v=b.body.velocity, C=b.C;
  // stalemate: the same opponent for a long time with no knockoff -> switch target, or go bait at the edge
  const e=b.eng||(b.eng={peer:null,t:0,dk:b.dunks||0});
  if (e.peer!==best.peer){ e.peer=best.peer; e.t=0; e.dk=b.dunks||0; e.limit=7+Math.random()*4; }
  else e.t+=dt;
  if ((b.dunks||0)>e.dk){ e.t=0; e.dk=b.dunks; }
  if (e.t>e.limit && !b.bait){
    if (C.dodge>=.1 && Math.random()<.5){ b.bait={until:simTime+7,peer:best.peer}; if (Math.random()<.5) botSay(C,"Come and get me.",false); }
    else { b.avoid.set(best.peer,simTime+9); e.t=0; if (Math.random()<.4) botSay(C,C.taunt,false); }
  }
  if (b.bait && (simTime>b.bait.until || b.bait.peer!==best.peer)) { if (simTime>b.bait.until) b.avoid.set(best.peer,simTime+6); b.bait=null; }
  const my=edgeFrom(p.x,p.z);
  if (b.bait){
    // wait a step from the edge, facing in; when they rush in, sidestep and let them run past
    const ov=best.me ? pBody.velocity : (best.bot ? (bots.find(o=>"bot:"+o.id===best.peer)||{body:{velocity:{x:0,z:0}}}).body.velocity : ((avatars.get(best.peer)||{}).nv||{x:0,z:0}));
    const tx=p.x-best.pos.x, tz=p.z-best.pos.z, tl=Math.hypot(tx,tz)||1, closing=(ov.x*tx+ov.z*tz)/tl;
    if (bd<3.2 && closing>3.5 && simTime-(b.dodgeT||-9)>1.5){ const side=Math.random()<.5?1:-1; v.x+=-tz/tl*9*side; v.z+=tx/tl*9*side; v.y=Math.max(v.y,3); b.jumpT=simTime; b.dodgeT=simTime; b.cd=Math.min(b.cd,.25); }
    if (my.d>3.5 && my.d<16) return tacTmp.set(p.x+my.dx*(my.d-2.5),p.y,p.z+my.dz*(my.d-2.5));
    return tacTmp.set(p.x,p.y,p.z);
  }
  // close in from the land side, so the shove sends them toward the nearest edge
  if (bd<9){ const te=edgeFrom(best.pos.x,best.pos.z); if (te.d<12) return tacTmp.set(best.pos.x-te.dx*1.4,best.pos.y,best.pos.z-te.dz*1.4); }
  return null;
}
// hop when stuck against something; face the way we're moving
function botHop(b,dt){
  const v=b.body.velocity, hs=Math.hypot(v.x,v.z);
  if (b.standing && b.wish.lengthSq()>0 && hs<2){ b.stuck+=dt; if (b.stuck>.5){ v.y=11; b.jumpT=simTime; b.stuck=0; } } else b.stuck=0;
  if (hs>1) b.yaw=Math.atan2(-v.x,-v.z);
}
// ---------- arm poses ----------
function poseArms(body,mode,phase,amt){
  const L=body.getObjectByName("armL"), Rr=body.getObjectByName("armR"); if (!L||!Rr) return;
  const t=performance.now()/1000;
  if (mode==="rope"){ Rr.rotation.set(-2.7,0,-.15); L.rotation.set(-.6,0,.25); }
  else if (mode==="glide"){ Rr.rotation.set(-2.9,0,-.25); L.rotation.set(-2.9,0,.25); }
  else if (mode==="fall"){ Rr.rotation.set(-2.4+Math.sin(t*18)*.5,0,-.6); L.rotation.set(-2.4+Math.cos(t*18)*.5,0,.6); }
  else { const w=Math.sin(phase*2)*.7*amt; Rr.rotation.set(w,0,-.08); L.rotation.set(-w,0,.08); }
  const LL=body.getObjectByName("legL"), LR=body.getObjectByName("legR"); if (!LL||!LR) return;
  if (mode==="walk"){ const w=Math.sin(phase*2)*.75*amt; LL.rotation.set(w,0,0); LR.rotation.set(-w,0,0); }
  else if (mode==="glide"){ LL.rotation.set(.5,0,.05); LR.rotation.set(.5,0,-.05); }
  else if (mode==="fall"){ LL.rotation.set(-.4+Math.sin(t*14)*.5,0,.25); LR.rotation.set(-.4+Math.cos(t*14)*.5,0,-.25); }
  else { LL.rotation.set(-.5,0,.1); LR.rotation.set(.3,0,-.1); }
}
// ---------- spark racing ----------
// Anchors are places a bot can swing to: pillar tops, floating rocks and tree tops.
let ANCHORS=null;
function buildAnchors(){
  ANCHORS=[...pillars.map(q=>({x:q.x,y:q.top-.6,z:q.z,stand:true})), ...rocks.map(r=>({x:r.x,y:r.y,z:r.z,stand:true})), ...trees.map(t=>({x:t.x,y:t.top-1.5,z:t.z,stand:false}))];
}
const botParams=C=>Object.assign({},BOT_PARAMS.default,BOT_PARAMS[C.key]||{});
function pickSpark(b,P){
  const p=b.body.position; let best=null, bc=1e9;
  // timid characters avoid sparks near other players
  const others = b.C.fear>.5 ? [ ...(running?[pBody.position]:[]), ...[...avatars.values()].map(a=>a.disp) ] : [];
  sparks.forEach((s,i)=>{ if (b.got.has(i) || (b.skip && b.skip.get(i)>simTime)) return;
    let c=Math.hypot(s.pos.x-p.x,s.pos.z-p.z)+Math.max(0,s.pos.y-p.y)*P.heightCost;
    for (const o of others) if (Math.hypot(o.x-s.pos.x,o.z-s.pos.z)<22) c+=45;
    if (c<bc){ bc=c; best=i; } });
  return best;
}
// what a spark sits on: a pillar, a floating rock or a tree (radius of its top), or nothing
function supportOf(T){
  for (const q of pillars) if (Math.hypot(q.x-T.x,q.z-T.z)<1.5 && Math.abs(q.top-T.y)<3) return {r:q.w/2+.2};
  for (const r of rocks) if (Math.hypot(r.x-T.x,r.z-T.z)<1.5 && Math.abs(r.top-T.y)<3) return {r:r.r*.85};
  for (const t of trees) if (Math.hypot(t.x-T.x,t.z-T.z)<1.5) return {r:1.4};
  return null;
}
// aim at the near rim of the support, just below the top surface
function rimAim(p,T,P){
  const sup=supportOf(T), dx=p.x-T.x, dz=p.z-T.z, d=Math.hypot(dx,dz)||1, r=sup?sup.r*.9:0;
  return {x:T.x+dx/d*r, y:T.y-P.aimDrop, z:T.z+dz/d*r};
}
// is there sea between here and there? (walking would drown us)
function waterBetween(p,T){ for (let k=1;k<=8;k++){ const t=k/9, x=p.x+(T.x-p.x)*t, z=p.z+(T.z-p.z)*t; if (H(x,z)<-.3) return true; } return false; }
// a stepping anchor that gets us closer to T, preferring height
function stepAnchor(p,T,P){
  const d0=Math.hypot(T.x-p.x,T.z-p.z); let best=null, bs=-1e9;
  for (const A of ANCHORS){
    const da=Math.hypot(A.x-p.x,A.z-p.z), dAT=Math.hypot(T.x-A.x,T.z-A.z), dy=A.y-p.y;
    if (da<P.stepMin || da>P.stepMax || dy<-4 || A.y<5) continue;
    const progress=d0-dAT; if (progress<6) continue;
    const sc=progress+Math.min(dy,25)*.3-(A.stand?0:6);
    if (sc>bs){ bs=sc; best=A; }
  }
  return best;
}
function fireBotHook(b,aim,P){
  const p=b.body.position; if (aim.y < p.y-2) return false;   // only hook things level with or above us
  const from=new THREE.Vector3(p.x,p.y+1,p.z), dir=new THREE.Vector3(aim.x,aim.y,aim.z).sub(from), dl=dir.length(); if (dl<4) return false;
  dir.divideScalar(dl); bRay.set(from,dir); bRay.far=Math.min(78,dl+6);
  const hit=bRay.intersectObjects(grappleables,false).find(h=>!h.object.userData.remote && !h.object.userData.body);
  if (!hit || hit.distance<5) return false;
  b.hook={point:hit.point.clone(),len:hit.distance*P.lenFactor,t:0}; b.reel=P.reel; return true;
}
function botRace(b,dt){
  if (MODE==="sumo") return false;
  const C=b.C, P=botParams(C), p=b.body.position, v=b.body.velocity;
  if (!ANCHORS) buildAnchors();
  let T;
  if (finale.active && (b.sparkCount>=TOTAL || finale.pos.distanceTo(p)<35)){
    T=finale.pos;
    if (Math.hypot(T.x-p.x,T.y-p.y,T.z-p.z)<(b.magnetT>0?8:2.8)){ b.final=true; grabFinale(b.name,true); botSay(C,C.taunt,true); return true; }
  } else {
    if (b.target==null || b.got.has(b.target)){ b.target=pickSpark(b,P); b.targetT=0; }
    if (b.target==null){ if (b.skip && b.skip.size){ b.skip.clear(); b.target=pickSpark(b,P); b.targetT=0; } if (b.target==null) return false; }
    // give up on a spark we can't reach for now, and come back to it later
    b.targetT=(b.targetT||0)+dt;
    if (b.targetT>14){ (b.skip||(b.skip=new Map())).set(b.target,simTime+40); b.target=null; b.hook=null; return true; }
    T=sparks[b.target].pos;
    if (Math.hypot(T.x-p.x,T.y-p.y,T.z-p.z)<(b.magnetT>0?14:2.3)){
      b.got.add(b.target); b.sparkCount++; b.target=null; if (b.sparkCount>=TOTAL) b.doneT=simTime-raceStartSim;
      if (b.sparkCount===TOTAL){ botSay(C,C.taunt,true); if (RULES.final && !finale.active && !finale.got) spawnFinale(finaleSpot(p),b.name,true); }
      return true;
    }
  }
  const dx=T.x-p.x, dz=T.z-p.z, hd=Math.hypot(dx,dz)||1, ux=dx/hd, uz=dz/hd;
  b.wish.set(ux,0,uz); b.speed=11*C.speed;
  // stuck right under the thing the spark sits on: back off sideways so the hook has an angle
  if (!b.hook && hd<6 && T.y-p.y>3.5){ b.backoff=(b.backoff||0)+dt; } else if (hd>12) b.backoff=0;
  if (b.backoff>.6 && b.backoff<2.4){ const sx=-ux*.8+uz*.6, sz=-uz*.8-ux*.6; b.wish.set(sx,0,sz); return true; }
  if (b.backoff>=2.4) b.backoff=0;
  if (b.hook){
    b.hook.t+=dt;
    const A=b.hook.point, ad=Math.hypot(A.x-p.x,A.y-p.y,A.z-p.z);
    const overTarget = p.y>T.y+1 && hd<6;
    const atRim = hd<4.5 && p.y>T.y-2.5;
    if (ad<P.releaseDist || p.y>A.y-.5 || overTarget || atRim || b.hook.t>4.5){
      // let go: boost up only if the target is above us, forward only if it's still far
      const up = T.y>p.y+1 ? P.boostUp : 0;
      v.y = up ? Math.max(v.y,0)+up : Math.min(v.y,4);
      if (hd>8){ v.x+=ux*P.boostFwd; v.z+=uz*P.boostFwd; }
      b.hook=null; b.jumpT=simTime; b.grappleCd=P.cooldown;
    }
    return true;
  }
  // in the air: steer hard toward the target, and brake to drop onto it from above
  if (!b.standing){
    b.airAcc=16;
    if (hd<5 && p.y>T.y-1){ const k=Math.exp(-4*dt); v.x*=k; v.z*=k; }
    const hs=Math.hypot(v.x,v.z); if (hs>30){ v.x*=30/hs; v.z*=30/hs; }
  } else b.airAcc=9;
  // falling toward the sea: grab the nearest anchor above us, like a player catching themselves
  if (!b.standing && v.y<-4 && H(p.x,p.z)<0 && p.y<30){
    let rescue=null, rd=1e9;
    for (const A of ANCHORS){ const d=Math.hypot(A.x-p.x,A.y-p.y,A.z-p.z); if (A.y>p.y-1 && d<60 && d<rd){ rd=d; rescue=A; } }
    if (rescue && fireBotHook(b,rescue,P)){ b.hook.rescue=true; return true; }
  }
  const high = T.y-Math.max(H(T.x,T.z),0) > 3;          // the spark sits on something
  const wet = waterBetween(p,T);
  if (b.grappleCd<=0 && (high||wet||hd>60)){
    b.grappleCd=.35;
    let ok=false;
    if (high && hd<P.fireDist && !wet) ok=fireBotHook(b,rimAim(p,T,P),P);
    if (!ok){ const A=stepAnchor(p,T,P); if (A) ok=fireBotHook(b,A,P); }
    if (!ok && high && hd<P.fireDist+15) ok=fireBotHook(b,rimAim(p,T,P),P);
  }
  // don't walk into the sea: wait at the shore for a grapple
  if (b.standing && H(p.x+ux*3,p.z+uz*3)<-.2) b.wish.set(0,0,0);
  if (b.standing && hd<3 && T.y-p.y>1.5 && T.y-p.y<3.5) { v.y=11; b.jumpT=simTime; }
  return true;
}
// per physics step: rope, hover over the ground, walking
function botsPreStep(dt){
  if (amController) for (const a of avatars.values()){ const h=a.pres && a.pres.h; if (!Array.isArray(h) || h[0]!==2 || h[6]!==1 || typeof h[5]!=="string" || !h[5].startsWith("bot:")) continue;
    const b=bots.find(o=>"bot:"+o.id===h[5]); if (b && !(b.shieldT>0)){ pullToward(b.body,a.disp.x,a.disp.y+.3,a.disp.z,13,dt); b.knockUntil=simTime+.2; b.hook=null; b.lastHitBy={peer:a.peer,name:a.name,t:simTime}; } }
  if (amController && traps.length) for (const b of bots){ const st=b.magSt||(b.magSt={}); magnetStep(b.body,st,dt,false); st.key="bot:"+b.id; st.bot=b; st.standing=b.standing; trapForces(b.body,dt,false,st);
    if (st.mag){ b.hook=null; b.knockUntil=simTime+.2; if (st.by && st.by.name!==b.name) b.lastHitBy={peer:st.by.peer,name:st.by.name,t:simTime}; if (simTime-st.t>3+b.C.fear*2){ st.free=simTime+3; st.mag=null; } } }
  if (!amController) return;
  for (const b of bots){
    const p=b.body.position, v=b.body.velocity;
    if (b.hook){ b.hook.len=Math.max(3,b.hook.len-(b.reel||14)*dt); const A=b.hook.point, dx=A.x-p.x, dy=A.y-p.y, dz=A.z-p.z, d=Math.hypot(dx,dy,dz)||1;
      if (d>b.hook.len){ const nx=dx/d, ny=dy/d, nz=dz/d, rel=v.x*nx+v.y*ny+v.z*nz, k=Math.max(0,-rel)+(d-b.hook.len)*30*dt; v.x+=nx*k; v.y+=ny*k; v.z+=nz*k; } }
    b.standing=false;
    if (!b.hook && simTime>b.knockUntil && simTime-b.jumpT>.2 && v.y<6){
      const [gy,ny]=groundBelow(p), h=p.y-gy;
      if (ny>.6 && h<RIDE+PROBE){ b.standing=true; v.y=Math.max(-20,Math.min(10,(gy+RIDE-p.y)*18))+26*dt; }
    }
    b.gliding = b.gliderT>0 && !b.standing && !b.hook && v.y<-2 && simTime>b.knockUntil && b.target!=null && Math.hypot(sparks[b.target].pos.x-p.x,sparks[b.target].pos.z-p.z)>15 && p.y>sparks[b.target].pos.y-4;
    if (b.gliding){ v.y+=26*dt; v.y+=(-3-v.y)*(1-Math.exp(-4*dt)); const hs=Math.hypot(v.x,v.z); if (hs<17){ v.x+=b.wish.x*10*dt; v.z+=b.wish.z*10*dt; } }
    if (b.standing && simTime>b.knockUntil){ const k=1-Math.exp(-10*dt); v.x+=(b.wish.x*b.speed-v.x)*k; v.z+=(b.wish.z*b.speed-v.z)*k; }
    else if (b.wish.lengthSq()>0){ const aa=b.airAcc||9; v.x+=b.wish.x*aa*dt; v.z+=b.wish.z*aa*dt; }
    if (!b.hook && v.y>22) v.y=22;
    // hard speed cap: a rope pulling a bot against a wall must never pile up speed
    const sp=Math.hypot(v.x,v.y,v.z); if (sp>45){ const k=45/sp; v.x*=k; v.y*=k; v.z*=k; }
    // a rope that isn't bringing us closer is useless: let go
    if (b.hook){ const A=b.hook.point, d=Math.hypot(A.x-p.x,A.y-p.y,A.z-p.z);
      if (b.hook.best==null || d<b.hook.best-.5){ b.hook.best=d; b.hook.bestT=simTime; } else if (simTime-b.hook.bestT>1.2){ b.hook=null; b.grappleCd=.8; } }
  }
}
function botsPayload(){
  if (!amController || !bots.length) return 0;
  return bots.map(b=>{ const q=b.body.interpolatedPosition, v=b.body.velocity;
    return [b.id,b.name,r2(q.x),r2(q.y),r2(q.z),r2(v.x),r2(v.y),r2(v.z),r2(b.yaw),b.bat>0?1:0,b.swingN,b.hook?[r2(b.hook.point.x),r2(b.hook.point.y),r2(b.hook.point.z)]:0,b.dunks,b.ch,b.sparkCount,b.gliding?1:0,b.falls||0]; });
}
function updateBots(dt){
  const ctrl=isBotController();
  if (ctrl!==amController){ amController=ctrl; if (!ctrl){ bots.forEach(removeBot); bots=[]; } }
  if (amController){
    if (running || raceLive) while (bots.length<Math.min(wantBots,CHARACTERS.length-(myCharKey==="classic"?0:1))) spawnBot(bots.length);   // spawn once play starts, so their entrances aren't missed
    while (bots.length>wantBots) removeBot(bots.pop());
    if (running) for (const b of bots) botThink(b,dt);
  }
  // gather poses: our own bots, or the ones another player is running
  const now=performance.now(), seen=new Set();
  const show=(key,name,pos,vel,yaw,bat,swingN,tip,dk,raw,local,ch,sc=0,gl=false,fl=0)=>{
    seen.add(key);
    let a=botAvatars.get(key);
    if (!a){ a=makeAvatar(key); const C=CHARACTERS[ch]||CHARACTERS[0]; a.ch=ch; a.C=C;
      a.torso.material.color.set(C.suit); const hat=a.body.children[2]; hat.material=new THREE.MeshStandardMaterial({color:C.hat,roughness:.7});
      a.g.scale.setScalar(C.scale); dressBody(a.body,C); a.color="#"+new THREE.Color(C.stripes[0]==="#f4f5f0"?C.stripes[1]:C.stripes[0]).lerp(new THREE.Color("#ffffff"),.45).getHexString(); botAvatars.set(key,a); queueIntro(ch,false); }
    a.name=name; a.dunks=dk; a.sparks=sc; a.falls=fl;
    if (local){ a.disp.copy(pos); }
    else {
      if (raw!==a.raw){ a.raw=raw; a.recv=now; a.np.copy(pos); a.nv.copy(vel); if (!a.has){ a.disp.copy(a.np); a.has=true; } }
      const age=Math.min(.25,(now-a.recv)/1000); tmpT.copy(a.np).addScaledVector(a.nv,age);
      if (a.disp.distanceTo(tmpT)>10) a.disp.copy(tmpT); else a.disp.lerp(tmpT,1-Math.exp(-14*dt));
    }
    a.g.position.copy(a.disp);
    let dy=yaw-a.yaw; dy=Math.atan2(Math.sin(dy),Math.cos(dy)); a.yaw+=dy*Math.min(1,10*dt); a.g.rotation.y=a.yaw;
    if (a.swLast!=null && swingN!==a.swLast){ a.swing=1; a.swingBat=bat; }
    a.swLast=swingN;
    if (a.bat) a.bat.visible=bat; if (a.swing>0) a.swing=Math.max(0,a.swing-dt/.28); poseSwing(a.body,a.bat,a.swing,a.swingBat);
    a.open=(a.open||0)+((gl?1:0)-(a.open||0))*Math.min(1,10*dt); a.wing.visible=a.open>.02; a.wing.scale.set(a.open,1,.4+.6*a.open);
    a.body.rotation.x = gl ? -1.1 : tip ? -.35 : 0;
    a.phase=(a.phase||0)+Math.hypot(vel.x,vel.z)*1.4*dt; poseArms(a.body, tip?"rope" : gl?"glide" : vel.y<-14?"fall":"walk", a.phase, Math.min(1,Math.hypot(vel.x,vel.z)/6));
    a.body.rotation.z=0; a.body.position.x=0; a.body.scale.set(1,1,1);
    if (a.introT>0){ a.introT=Math.max(0,a.introT-dt); const u=1-a.introT/1.8, w=Math.sin(Math.PI*u);
      switch (a.C.anim){
        case "spin": a.g.rotation.y=a.yaw+u*Math.PI*4; break;
        case "bow": a.body.rotation.x=-.9*w; break;
        case "pound": a.body.scale.set(1+.12*Math.abs(Math.sin(u*Math.PI*6)),1-.08*Math.abs(Math.sin(u*Math.PI*6)),1); break;
        case "cower": a.body.rotation.x=.35*w; a.body.position.x=Math.sin(u*80)*.06; break;
        case "dance": a.body.rotation.z=Math.sin(u*Math.PI*6)*.35; a.g.rotation.y=a.yaw+Math.sin(u*Math.PI*3)*.6; break;
        case "shaka": a.body.rotation.z=Math.sin(u*Math.PI*4)*.25; a.g.rotation.y=a.yaw+Math.sin(u*Math.PI*2)*.35; break;
        case "knuckles": a.body.position.y+= .1*Math.abs(Math.sin(u*Math.PI*5)); break;
      } }
    if (a.sayT>0) a.sayT-=dt;
    const text = a.sayT>0 ? "“"+a.sayText+"”" : name+" · "+(a.C?a.C.from:"Bot");
    if (text!==a.labelText){ if (a.label){ a.g.remove(a.label); a.label.material.map.dispose(); a.label.material.dispose(); } a.label=nameSprite(text,a.color); a.label.position.y=1.55; a.g.add(a.label); a.labelText=text; }
    if (tip){ tmpH.set(0,.35,-.1).applyEuler(a.g.rotation).add(a.g.position); const len=tmpH.distanceTo(tip);
      a.rope.visible=a.tip.visible=true; a.rope.position.copy(tmpH).add(tip).multiplyScalar(.5); a.rope.scale.set(1,len,1);
      a.rope.quaternion.setFromUnitVectors(UP,tmpT.copy(tip).sub(tmpH).normalize()); a.tip.position.copy(tip); a.tip.quaternion.copy(a.rope.quaternion); }
    else a.rope.visible=a.tip.visible=false;
  };
  if (amController){
    for (const b of bots) show("bot:"+b.id,b.name,b.body.interpolatedPosition,b.body.velocity,b.yaw,b.bat>0,b.swingN,b.hook?b.hook.point:null,b.dunks,null,true,b.ch,b.sparkCount,!!b.gliding,b.falls||0);
  } else {
    for (const a of avatars.values()){
      const list=a.pres && a.pres.bots; if (!Array.isArray(list)) continue;
      for (const e of list.slice(0,8)){
        if (!Array.isArray(e) || e.length<13 || ![e[2],e[3],e[4],e[5],e[6],e[7],e[8]].every(n=>typeof n==="number" && isFinite(n) && Math.abs(n)<5000)) continue;
        const tip=Array.isArray(e[11]) && e[11].length===3 && e[11].every(Number.isFinite) ? new THREE.Vector3(...e[11]) : null;
        show("bot:"+(e[0]|0),cleanName(e[1]),new THREE.Vector3(e[2],e[3],e[4]),new THREE.Vector3(e[5],e[6],e[7]),e[8],!!e[9],e[10]|0,tip,Math.max(0,e[12]|0),e,false,Math.max(0,Math.min(CHARACTERS.length-1,e[13]|0)),Math.max(0,Math.min(99,e[14]|0)),!!e[15],Math.max(0,Math.min(999,e[16]|0)));
      }
    }
  }
  for (const [k,a] of botAvatars) if (!seen.has(k)){ dropAvatar(a); botAvatars.delete(k); }
  tickIntro(dt);
}
// entrance cards: one at a time, with the character's move and line
const introQ=[], introSeen=new Set(); let introCh=null, introLeft=0;
function queueIntro(ch,force){ const C=CHARACTERS[ch]; if (!C || (!force && introSeen.has(C.key)) || introQ.includes(ch)) return; introSeen.add(C.key); introQ.push(ch); }
function tickIntro(dt){
  if (introCh!==null){ introLeft-=dt; if (introLeft<=0){ $("intro").hidden=true; introCh=null; } }
  if (introCh===null && introQ.length){
    const ch=introQ.shift(), C=CHARACTERS[ch], el=$("intro");
    el.style.setProperty("--s1",C.stripes[0]); el.style.setProperty("--s2",C.stripes[1]); el.style.setProperty("--s3",C.stripes[2]);
    $("introFrom").textContent=C.from; $("introName").textContent=C.full; $("introTrait").textContent=C.trait; $("introLine").textContent=C.intro;
    el.hidden=false; el.style.animation="none"; void el.offsetWidth; el.style.animation="";
    introCh=ch; introLeft=2.4;
    for (const a of botAvatars.values()) if (a.ch===ch) a.introT=1.8;
    for (const b of bots) if (b.ch===ch) b.introT=1.8;
    botSay(C,C.intro,true,false);
  }
}

// ---------------- chat ----------------
// Text chat travels as a numbered message in presence. Voice is turned into text by the dictation
// capability. When you chat with bots around, one of them answers in character via Claude (sample).
let lastChat=0, chatN=0, lastBchat=0, bchatN=0, sampleFn=null, dict=null, voiceOn=false, voiceText="", lastBotReply=0;
const lastChatSeen=new Map(), lastBchatSeen=new Map();
const cleanChat=s=>String(s||"").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g," ").trim().slice(0,140);
const blip=()=>tone(1200,.06,"sine",.05);
if (window.claude && typeof window.claude.use==="function"){
  window.claude.use("sample").then(f=>{ sampleFn=f; }).catch(()=>{});
  window.claude.use("dictation").then(d=>{ dict=d; if (!d) return;
    $("chatMic").hidden=false; if (isTouch) $("tMic").hidden=false;
    d.onPartial(({text})=>{ if (voiceOn) $("chatIn").value=(voiceText+" "+text).trim(); });
    d.onFinal(({text})=>{ voiceText=(voiceText+" "+text).trim(); $("chatIn").value=voiceText; });
    d.onState(({state,reason})=>{ const rec=state==="listening"||state==="starting"; $("chatMic").classList.toggle("rec",rec); $("tMic").classList.toggle("rec",rec);
      if (state==="idle" && voiceOn){ voiceOn=false; if (reason==="not_granted"||reason==="unavailable"){ $("chatMic").hidden=true; $("tMic").hidden=true; } } });
  }).catch(()=>{});
}
$("chatMic").hidden=true; $("tMic").hidden=true;
// (the chat buttons and the touch layout are toggled by applyInputUI)
// chat history: the last 60 lines, kept across reloads, scrollable; sticks to the newest unless you've scrolled up
const CHAT_KEY="skyhook.chat.v1"; let chatHist=[];
function chatRow(m){ const row=document.createElement("div"), b=document.createElement("b"); b.textContent=m.who; b.style.color=m.color||"#7ce0ff"; row.append(b,document.createTextNode(m.text)); return row; }
function addChat(who,text,color){
  if (!text) return;
  const log=$("chatlog"), atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<30;
  const m={who:String(who).slice(0,24),text:String(text).slice(0,160),color,ts:Date.now()};
  chatHist.push(m); while (chatHist.length>60) chatHist.shift();
  log.append(chatRow(m)); while (log.children.length>61) log.firstChild.remove();
  if (atBottom) log.scrollTop=log.scrollHeight;
  try{ localStorage.setItem(CHAT_KEY,JSON.stringify(chatHist)); }catch(e){}
}
try{ const saved=JSON.parse(localStorage.getItem(CHAT_KEY)||"[]"); if (Array.isArray(saved) && saved.length){
  chatHist=saved.filter(m=>m && typeof m.who==="string" && typeof m.text==="string").slice(-60).map(m=>({who:m.who.slice(0,24),text:m.text.slice(0,160),color:/^#[0-9a-f]{6}$/i.test(m.color)?m.color:"#7ce0ff",ts:+m.ts||0}));
  const log=$("chatlog"); log.append(...chatHist.map(chatRow)); const sep=document.createElement("div"); sep.className="sep"; sep.textContent="Earlier messages above"; log.append(sep); log.scrollTop=log.scrollHeight; } }catch(e){}
// short memory per character, so a conversation can go back and forth
const convo=new Map(); let lastSpeaker=null;
function remember(C,who,text){ const a=convo.get(C.key)||[]; a.push((who==="them"?C.name:who)+": "+text); while (a.length>8) a.shift(); convo.set(C.key,a); }
function openChat(){
  $("chatbar").hidden=false; $("chatlog").classList.add("active"); const inp=$("chatIn"); inp.value=""; voiceText="";
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(()=>inp.focus(),0);
}
function closeChat(){ $("chatbar").hidden=true; $("chatlog").classList.remove("active"); $("chatIn").blur(); if (running && !isTouch) captureMouse(); }
function sendChat(){
  const t=cleanChat($("chatIn").value); closeChat(); if (!t) return;
  chatN++; lastChat={n:chatN,t}; addChat(myName()+" (you)",t,"#7ce0ff"); blip();
  botReply(t);
}
$("chatIn").addEventListener("keydown",e=>{ e.stopPropagation(); if (e.key==="Enter"){ e.preventDefault(); sendChat(); } else if (e.key==="Escape"){ e.preventDefault(); closeChat(); } });
$("chatSend").addEventListener("click",sendChat);
$("tChat").addEventListener("click",openChat);
// voice: the first start must come straight from a click or key press
function startVoice(){
  if (!dict || voiceOn) return;
  voiceOn=true; voiceText=""; openChat();
  dict.start().catch(e=>{ voiceOn=false; if (e && (e.code==="not_granted"||e.code==="unavailable")){ $("chatMic").hidden=true; $("tMic").hidden=true; toast("Voice chat is off","Type instead (Enter)."); } });
}
async function stopVoice(send){
  if (!dict || !voiceOn) return;
  try{ await dict.stop(); }catch(e){}
  voiceOn=false; if (send && cleanChat($("chatIn").value)) sendChat();
}
$("chatMic").addEventListener("click",()=>{ voiceOn ? stopVoice(true) : startVoice(); });
$("tMic").addEventListener("click",()=>{ voiceOn ? stopVoice(true) : startVoice(); });
// a bot answers: whoever you named, otherwise a random one now and then
function botReply(text){
  if (!sampleFn || !botAvatars.size) return;
  const present=[...botAvatars.values()].map(a=>a.C).filter(Boolean); if (!present.length) return;
  const low=text.toLowerCase();
  let C=present.find(c=>low.includes(c.name.toLowerCase()));
  if (!C && lastSpeaker && performance.now()-lastSpeaker.t<25000 && present.includes(lastSpeaker.C)) C=lastSpeaker.C;
  if (!C){ if (Math.random()>.6) return; C=present[(Math.random()*present.length)|0]; }
  remember(C,myName(),text);
  const history=(convo.get(C.key)||[]).slice(0,-1).join("\n");
  const now=performance.now(); if (now-lastBotReply<2500) return; lastBotReply=now;
  const prompt=`You are ${C.full}, a cartoon character from ${C.from} in a silly multiplayer grappling-hook party game where players race for glowing sparks, swing on ropes, and knock each other into the sea with shoves and baseball bats. Your personality: ${C.trait}. Your catchphrase is "${C.taunt}".
${history ? "Recent chat between you and the player:\n"+history+"\n" : ""}A player named ${myName()} just said in the game chat: "${text}"
Reply in character with ONE short line of playful trash talk or banter, at most 14 words. Keep it PG-13: no slurs, nothing hateful, nothing explicit. Output only the line, with no quotes or name.`;
  sampleFn(prompt,{modelTier:"quick",cache:false}).then(r=>{
    const line=cleanChat(r && r.text).replace(/^["“]|["”]$/g,""); if (!line) return;
    botSay(C,line,true);
    bchatN++; lastBchat={n:bchatN,who:C.name,t:line};
  }).catch(()=>{});
}

// ---------------- races, cups and leaderboards ----------------
// A race ends when someone collects every spark, or after ROUND_TIME. Standings rank sparks, then time.
// Cups chain several maps (stored in localStorage across the reload between maps) and award points per race.
// Best times and cup totals are posted with arcade initials to the artifact's shared database.
let ROUND_TIME=240; const POINTS=[10,8,6,5,4,3,2,1];
// game rules a custom game can change (defaults = normal play)
const RULES={items:true,bats:true,final:true};
const CUP_KEY="skyhook.cup.v1";
let cup=null, raceStartSim=0, raceOver=false, db=null, boardUnsub=null;
// a custom game is a cup whose definition travels with it: {name, maps:[...], rules:{mode, raceTime, sumoTime, kos, items, bats, final}}
function cleanCustom(d){
  if (!d || typeof d!=="object" || !Array.isArray(d.maps)) return null;
  const maps=d.maps.filter(k=>typeof k==="string" && MAPS[k]).slice(0,8); if (!maps.length) return null;
  const r=d.rules||{}, pick=(v,ok,def)=>ok.includes(v)?v:def;
  return {key:"custom",name:"Custom game",maps,rules:{mode:pick(r.mode,["race","sumo","mixed"],"race"),raceTime:pick(+r.raceTime,[120,180,240,360],240),sumoTime:pick(+r.sumoTime,[90,150,240],150),kos:pick(+r.kos,[3,5,10,15,20],10),items:r.items!==false,bats:r.bats!==false,final:r.final!==false}};
}
try{ cup=JSON.parse(localStorage.getItem(CUP_KEY)||"null"); if (cup && cup.key==="custom"){ cup.def=cleanCustom(cup.def); if (!cup.def) cup=null; } else if (cup && !CUPS.some(c=>c.key===cup.key)) cup=null; }catch(e){ cup=null; }
const saveCup=()=>{ try{ cup ? localStorage.setItem(CUP_KEY,JSON.stringify(cup)) : localStorage.removeItem(CUP_KEY); }catch(e){} };
const cupDef=()=>cup && (cup.key==="custom" ? cup.def : CUPS.find(c=>c.key===cup.key));
// the current map's mode and rules come from the custom game it belongs to
function applyCupRules(){
  const d=cupDef(); if (!d || !d.rules || d.maps[cup.idx]!==MAP.key) return;
  const r=d.rules; ROUND_TIME=r.raceTime; SUMO_TIME=r.sumoTime; SUMO_KOS=r.kos; RULES.items=r.items; RULES.bats=r.bats; RULES.final=r.final;
  MODE = MAP.sumoOnly ? "sumo" : r.mode==="mixed" ? (cup.idx%2 ? "sumo" : "race") : r.mode;
  const sel=$("optMode"); if (sel) sel.value=MODE; applyInputUI();
}
{ const sel=$("optCup"); for (const c of CUPS){ const o=document.createElement("option"); o.value=c.key; o.textContent=c.name+" ("+c.maps.map(k=>MAPS[k].name).join(", ")+")"; sel.append(o); }
  const o=document.createElement("option"); o.value="custom"; o.textContent="Custom game…"; sel.append(o);
  sel.addEventListener("change",()=>{ $("customBox").hidden=sel.value!=="custom"; }); }
// ---- custom game builder ----
const CUSTOM_KEY="skyhook.custom.v1";
let customDraft=(()=>{ try{ return cleanCustom(JSON.parse(localStorage.getItem(CUSTOM_KEY)||"null")); }catch(e){ return null; } })() || cleanCustom({maps:["isles","ring","neon"],rules:{mode:"mixed"}});
const saveDraft=()=>{ try{ localStorage.setItem(CUSTOM_KEY,JSON.stringify(customDraft)); }catch(e){} };
function renderCustom(){
  const list=$("cuMaps"); list.replaceChildren(...customDraft.maps.map((k,i)=>{ const chip=document.createElement("span"); chip.className="cuchip";
    chip.textContent=(i+1)+". "+MAPS[k].name+(MAPS[k].sumoOnly?" (sumo)":""); const x=document.createElement("button"); x.type="button"; x.textContent="×"; x.setAttribute("aria-label","Remove "+MAPS[k].name);
    x.addEventListener("click",()=>{ if (customDraft.maps.length>1){ customDraft.maps.splice(i,1); saveDraft(); renderCustom(); } }); chip.append(x); return chip; }));
  const r=customDraft.rules; $("cuMode").value=r.mode; $("cuRace").value=r.raceTime; $("cuSumo").value=r.sumoTime; $("cuKos").value=r.kos; $("cuItems").checked=r.items; $("cuBats").checked=r.bats; $("cuFinal").checked=r.final;
  $("cuCount").textContent=customDraft.maps.length+" of 8 maps";
}
{ const add=$("cuAddMap"); for (const k of Object.keys(MAPS)){ const o=document.createElement("option"); o.value=k; o.textContent=MAPS[k].name+(MAPS[k].sumoOnly?" (sumo arena)":""); add.append(o); }
  $("cuAdd").addEventListener("click",()=>{ if (customDraft.maps.length<8){ customDraft.maps.push(add.value); saveDraft(); renderCustom(); } else toast("8 maps max"); });
  const upd=()=>{ const r=customDraft.rules; r.mode=$("cuMode").value; r.raceTime=+$("cuRace").value; r.sumoTime=+$("cuSumo").value; r.kos=+$("cuKos").value; r.items=$("cuItems").checked; r.bats=$("cuBats").checked; r.final=$("cuFinal").checked; saveDraft(); };
  for (const id of ["cuMode","cuRace","cuSumo","cuKos","cuItems","cuBats","cuFinal"]) $(id).addEventListener("change",upd);
  renderCustom(); }
function renderCupState(){
  const d=cupDef();
  $("cupState").textContent = d ? `In progress: ${cup.key==="custom"?"custom game":"race"} ${cup.idx+1} of ${d.maps.length} (${MAPS[d.maps[cup.idx]].name})` : "";
  $("startCup").textContent = d ? "Quit cup" : "Start cup";
}
renderCupState(); applyCupRules();
$("startCup").addEventListener("click",()=>{
  if (cupDef()){ cup=null; saveCup(); renderCupState(); return; }
  const custom=$("optCup").value==="custom", d=custom ? cleanCustom(customDraft) : CUPS.find(c=>c.key===$("optCup").value);
  cup={key:d.key,idx:0,points:{},races:[],id:Date.now(),host:true}; if (custom) cup.def=d; saveCup();
  if (d.maps[0]!==MAP.key){ location.hash="map-"+d.maps[0]; location.reload(); } else renderCupState();
});
// a cup race starts automatically when you press Play on the cup's current map
function cupAutoStart(){
  const d=cupDef(); if (!d || d.maps[cup.idx]!==MAP.key || raceLive || raceCount>0 || cup.follow) return;
  const id=Date.now(); if (room) room.presence({race:id}).catch(()=>{}); beginRace(id,null);
}
// who is racing and how they're doing
function standings(){
  const rows=[{name:myName(),me:true,s:got,t:runState==="done"?elapsed:null,k:dunks,d:stats.deaths,color:"#7ce0ff",st:stats}];
  for (const b of bots){ const a=botAvatars.get("bot:"+b.id); rows.push({name:b.name,bot:true,s:b.sparkCount,t:b.sparkCount>=TOTAL?b.doneT:null,k:b.dunks||0,d:b.falls||0,color:a?a.color:"#c9d3df"}); }
  if (!amController) for (const a of botAvatars.values()) rows.push({name:a.name,bot:true,s:a.sparks||0,t:null,k:a.dunks||0,d:a.falls||0,color:a.color});
  for (const a of avatars.values()){ const ps=a.pres||{}, st=Array.isArray(ps.st)?ps.st:[]; rows.push({name:a.name,s:Number(ps.s)||0,t:ps.rs==="done"?Number(ps.t)||null:null,k:Math.max(0,Number(ps.dk)||0),d:Math.max(0,Number(st[0])||0),color:a.color,
    st:{deaths:Number(st[0])||0,hits:Number(st[1])||0,homers:Number(st[2])||0,punches:Number(st[3])||0,items:Number(st[4])||0,airTime:Number(st[5])||0,topSpeed:Number(st[6])||0,traps:Number(st[7])||0,throws:Number(st[8])||0,smashes:Number(st[9])||0,snipes:Number(st[10])||0,dunks:Math.max(0,Number(ps.dk)||0)}}); }
  if (MODE==="sumo"){ for (const r of rows){ r.fin=false; r.score=r.k||0; } rows.sort((x,y)=>y.score-x.score || (x.d||0)-(y.d||0)); return rows; }
  for (const r of rows){ r.fin = !!finale.grabbedBy && r.name===finale.grabbedBy; r.score=r.s+(r.fin?FINAL_BONUS:0); }
  rows.sort((x,y)=>y.score-x.score || (x.t??1e9)-(y.t??1e9));
  return rows;
}
function checkRaceEnd(){
  if (!raceLive || raceOver || raceCount>0) return;
  const t=simTime-raceStartSim, rows=standings();
  if (MODE==="sumo"){ if (t>=SUMO_TIME || rows.some(r=>r.score>=SUMO_KOS)) endRace(rows,t); return; }
  if (finale.got || t>=ROUND_TIME || (!RULES.final && rows.some(r=>r.s>=TOTAL))) endRace(rows,t);
}
function endRace(rows){
  raceOver=true; raceLive=false;
  const d=cupDef(), inCup = d && d.maps[cup.idx]===MAP.key;
  if (inCup && !cup.follow){ rows.forEach((r,i)=>{ cup.points[r.name]=(cup.points[r.name]||0)+(POINTS[i]||0); }); cup.races.push(MAP.key); saveCup(); }
  if (inCup){ addCupStats(rows); saveCup(); }
  // the finish moment: a flash, a low boom, music dips, and time slows before the standings come up
  slowmo={t:0,rows,inCup,d}; flashT=Math.max(flashT,.4); shakeT=Math.max(shakeT,.3);
  tone(55,2.4,"sine",.3,.5); noise(2.2,{type:"lowpass",f:700,f2:80,vol:.35});
  if (musicBus && ac){ const t0=ac.currentTime; musicBus.gain.cancelScheduledValues(t0); musicBus.gain.setTargetAtTime(musicOn?.18:0,t0,.15); musicBus.gain.setTargetAtTime(musicOn?.55:0,t0+SLOWMO_SECS+1,.4); }
  if (hook) hook.phase="retract";
}
function standingsTable(rows,withPoints){
  const tb=$("resTable"); tb.replaceChildren();
  const hd=document.createElement("div"); hd.className="hd"; for (const t of (MODE==="sumo" ? ["#","Fighter","KOs","Falls","Hits",withPoints?"Pts":""] : ["#","Racer","Sparks","Time","K/D",withPoints?"Pts":""])){ const s=document.createElement("span"); s.textContent=t; hd.append(s); } tb.append(hd);
  rows.forEach((r,i)=>{ const row=document.createElement("div"); if (r.me) row.className="me";
    const cells= MODE==="sumo" ? [String(i+1), r.name+(r.me?" (you)":r.bot?" · bot":""), String(r.k||0), String(r.d||0), r.st?String(r.st.hits||0):"–", withPoints?String(r.pts??POINTS[i]??0):""] : [String(i+1), r.name+(r.me?" (you)":r.bot?" · bot":""), r.s+"/"+TOTAL+(r.fin?" ★":""), r.t!=null?fmt(r.t):"–", (r.k||0)+"/"+(r.d||0), withPoints?String(r.pts??POINTS[i]??0):""];
    for (const c of cells){ const s=document.createElement("span"); s.textContent=c; row.append(s); } tb.append(row); });
}
function showResults(rows,inCup,d){
  if (document.pointerLockElement) document.exitPointerLock();
  $("awards").hidden=true;
  const last = inCup && cup.idx>=d.maps.length-1;
  $("resKicker").textContent = inCup ? `${d.name} · race ${cup.idx+1} of ${d.maps.length}` : MAP.name;
  $("resTitle").textContent = MODE==="sumo" ? (rows[0].me ? "Last one standing: you!" : rows[0].name+" rules the ring") : rows[0].me ? "You win the race!" : rows[0].name+" wins the race";
  standingsTable(rows,inCup);
  $("resNote").textContent = inCup ? "Cup points so far: "+Object.entries(cup.points).sort((a,b)=>b[1]-a[1]).map(([n,p])=>`${n} ${p}`).join(" · ") : "";
  $("resInitials").hidden = !(db && rows.find(r=>r.me) && rows.find(r=>r.me).t!=null);
  pendingPost = $("resInitials").hidden ? null : {kind:"map",key:MAP.key,t:rows.find(r=>r.me).t};
  $("resNext").textContent = inCup ? (last ? (cup.key==="custom"?"See final results":"See cup results") : (cup.key==="custom"?"Next: ":"Next race: ")+MAPS[d.maps[cup.idx+1]].name) : "Keep playing";
  $("resNext").onclick = ()=>{ $("results").hidden=true;
    if (!inCup){ raceOver=false; return; }
    if (last){ showCupFinal(d); return; }
    cup.idx++; saveCup(); location.hash="map-"+d.maps[cup.idx]; location.reload(); };
  $("results").hidden=false; running=false; resShownAt=performance.now();
  $("resPrompt").textContent=(isTouch?"Tap":"Click")+" anywhere to continue";
}
let resShownAt=0;
function resContinue(){ if ($("results").hidden || performance.now()-resShownAt<800) return; $("resNext").click(); }
$("results").addEventListener("click",e=>{ if (e.target.closest("#resInitials") || e.target.closest("#resNext")) return; resContinue(); });
// ---- synced cups: friends follow the host's cup (map switches, points table, final standings) ----
function cupPresence(){
  if (!cup || !cup.host) return 0;
  const pts={}; for (const [k,v] of Object.entries(cup.points).slice(0,12)) pts[String(k).slice(0,16)]=v|0;
  const o={id:cup.id,key:cup.key,idx:cup.idx,pts,done:cup.done?1:0};
  if (cup.key==="custom" && cup.def) o.cd={maps:cup.def.maps,rules:cup.def.rules};
  return o;
}
function followCup(pr,ps){
  const cs=ps.cupS; if (!cs || typeof cs.id!=="number") return;
  const cdef = cs.key==="custom" ? cleanCustom(cs.cd) : CUPS.find(c=>c.key===cs.key); if (!cdef) return;
  if (cup && cup.host) return;                                   // we're running our own cup
  const d=cdef, idx=Math.max(0,Math.min(d.maps.length-1,cs.idx|0));
  const pts={}; if (cs.pts && typeof cs.pts==="object") for (const [k,v] of Object.entries(cs.pts).slice(0,12)) if (Number.isFinite(v)) pts[cleanName(k)]=v;
  if (!cup || cup.id!==cs.id){
    if (cs.done) return;
    cup={key:cs.key,idx,points:pts,races:[],id:cs.id,follow:true,hostPeer:pr.peer}; if (cs.key==="custom") cup.def=d; saveCup(); renderCupState(); applyCupRules();
    toast(`Joining ${cleanName(ps.n)}'s cup`,d.name);
  } else { cup.points=pts; if (cs.done && !cup.doneShown){ cup.doneShown=true; saveCup(); showCupFinal(d); return; } }
  if (idx!==cup.idx || d.maps[idx]!==MAP.key){ cup.idx=idx; saveCup(); if (d.maps[idx]!==MAP.key){ location.hash="map-"+d.maps[idx]; location.reload(); } }
  saveCup();
}
// stats add up across a cup's races (everyone keeps their own tally from what they saw); awards at the end
function addCupStats(rows){
  cup.stats=cup.stats||{};
  for (const r of rows){ const a=cup.stats[r.name]=cup.stats[r.name]||{s:0,k:0,d:0,hits:0,homers:0,punches:0,items:0,air:0,top:0,traps:0,throws:0,smashes:0,bot:r.bot?1:0,me:r.me?1:0};
    a.s+=r.s||0; a.k+=r.k||0; a.d+=r.d||0; const st=r.st; if (st){ a.hits+=st.hits||0; a.homers+=st.homers||0; a.punches+=st.punches||0; a.items+=st.items||0; a.traps=(a.traps||0)+(st.traps||0); a.throws=(a.throws||0)+(st.throws||0); a.smashes=(a.smashes||0)+(st.smashes||0); a.snipes=(a.snipes||0)+(st.snipes||0); a.air+=st.airTime||0; a.top=Math.max(a.top,st.topSpeed||0); } }
}
const AWARDS=[
  {k:"s",   t:"Spark Hoarder",   d:v=>`${v} sparks in the cup`},
  {k:"k",   t:"Menace",          d:v=>`${v} dunk${v>1?"s":""}: knocked people into the drink`},
  {k:"homers",t:"Home Run Derby",d:v=>`${v} bat hit${v>1?"s":""}`},
  {k:"hits",t:"Hands On",        d:v=>`${v} shoves and swings that landed`},
  {k:"d",   t:"Most Dramatic Exits", d:v=>`${v} splash${v>1?"es":""}. Always a show.`},
  {k:"punches",t:"Pogo Stick",   d:v=>`${v} ground punch${v>1?"es":""}`},
  {k:"air", t:"Frequent Flyer",  d:v=>`${Math.round(v)} s in the air`},
  {k:"top", t:"Speed Demon",     d:v=>`top speed ${Math.round(speedOut(v))} ${speedUnit()}`},
  {k:"items",t:"Item Gremlin",   d:v=>`${v} items used`},
  {k:"snipes",t:"Trickshot Artist",d:v=>`${v} spin-sniper hit${v>1?"s":""}`},
  {k:"traps",t:"Trap Master",    d:v=>`set off ${v} trap${v>1?"s":""}`},
  {k:"throws",t:"Yeet Lord",     d:v=>`${v} thing${v>1?"s":""} thrown`},
  {k:"smashes",t:"Wrecking Ball",d:v=>`${v} wall${v>1?"s":""} smashed`},
];
function cupAwards(){
  const all=Object.entries(cup.stats||{}); if (!all.length) return [];
  const out=[];
  for (const A of AWARDS){ let best=null; for (const [n,a] of all){ const v=a[A.k]||0; if (v>0 && (!best || v>best.v)) best={n,v}; } if (best) out.push({t:A.t,n:best.n,d:A.d(best.v)}); }
  // the survivor: most sparks among those who never fell in
  const dry=all.filter(([,a])=>a.d===0 && a.s>0).sort((x,y)=>y[1].s-x[1].s)[0]; if (dry) out.push({t:"Bone Dry",n:dry[0],d:"never once fell in"});
  return out;
}
function renderAwards(){
  const list=cupAwards(), el=$("awards"); el.hidden=!list.length;
  el.replaceChildren(...list.map(a=>{ const d=document.createElement("div"), b=document.createElement("b"), n=document.createElement("span"), sm=document.createElement("small");
    b.textContent=a.t; n.textContent=a.n===myName()?a.n+" (you)":a.n; sm.textContent=a.d; d.append(b,n,sm); return d; }));
}
function showCupFinal(d){
  renderAwards();
  const rows=Object.entries(cup.points).map(([name,pts])=>({name,pts,me:name===myName(),s:"",t:null})).sort((a,b)=>b.pts-a.pts);
  $("resKicker").textContent=d.name+" · final standings";
  $("resTitle").textContent = rows[0] && rows[0].me ? "You won the cup!" : (rows[0]?rows[0].name:"Nobody")+" wins the cup";
  const tb=$("resTable"); tb.replaceChildren();
  const hd=document.createElement("div"); hd.className="hd"; for (const t of ["#","Racer","","","","Pts"]){ const s=document.createElement("span"); s.textContent=t; hd.append(s); } tb.append(hd);
  rows.forEach((r,i)=>{ const row=document.createElement("div"); if (r.me) row.className="me"; for (const c of [String(i+1),r.name,"","","",String(r.pts)]){ const s=document.createElement("span"); s.textContent=c; row.append(s); } tb.append(row); });
  const mine=rows.find(r=>r.me);
  $("resInitials").hidden=!(db && mine && cup.key!=="custom"); pendingPost = mine && cup.key!=="custom" ? {kind:"cup",key:d.key,pts:mine.pts} : null;
  $("resNote").textContent="";
  $("resNext").textContent="Back to the island";
  if (cup && cup.host){ cup.done=true; saveCup(); }
  $("resNext").onclick=()=>{ $("results").hidden=true; setTimeout(()=>{ cup=null; saveCup(); renderCupState(); },3000); showStart(false); };
  $("results").hidden=false;
}
// leaderboards
let pendingPost=null;
$("initialsIn").addEventListener("input",e=>{ e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,3); });
$("initialsIn").addEventListener("keydown",e=>e.stopPropagation());
$("initialsSave").addEventListener("click",async()=>{
  const ini=$("initialsIn").value; if (!db || !pendingPost || ini.length<1){ toast("Type up to 3 letters"); return; }
  try{
    const docData = pendingPost.kind==="map" ? {i:ini,t:Math.round(pendingPost.t*100)/100,ts:Date.now()} : {i:ini,p:pendingPost.pts,ts:Date.now()};
    await db.collection(pendingPost.kind==="map" ? `boards/${pendingPost.key}/runs` : `cups/${pendingPost.key}/results`).add(docData);
    try{ localStorage.setItem("skyhook.initials",ini); }catch(e){}
    $("resInitials").hidden=true; pendingPost=null; toast("Score posted","Friends will see it on the board.");
  }catch(e){ toast("Couldn't post the score", e && e.code==="permission_denied" ? "Ask the owner to make you a Contributor." : "Try again in a moment."); }
});
try{ const ini=localStorage.getItem("skyhook.initials"); if (ini) $("initialsIn").value=ini; }catch(e){}
function watchBoard(){
  if (!db) return;
  if (boardUnsub) boardUnsub();
  $("boards").hidden=false; $("boardTitle").textContent=`Best full-clear times · ${MAP.name}`;
  let myIni=""; try{ myIni=localStorage.getItem("skyhook.initials")||""; }catch(e){}
  const done=setTimeout(()=>{ if (!$("boardList").childElementCount) { const e=document.createElement("div"); e.textContent="No times yet. Collect all 15 sparks to post one."; $("boardList").replaceChildren(e); } },10000);
  boardUnsub=db.collection(`boards/${MAP.key}/runs`).orderBy("t","asc").limit(10).onSnapshot(snap=>{
    clearTimeout(done);
    const list=$("boardList"); list.replaceChildren();
    if (!snap.docs.length){ const e=document.createElement("div"); e.textContent="No times yet. Collect all 15 sparks to post one."; list.append(e); return; }
    snap.docs.forEach((doc,i)=>{ const v=doc.data()||{}; const row=document.createElement("div"); const ini=String(v.i||"???").replace(/[^A-Z0-9]/g,"").slice(0,3);
      if (ini===myIni) row.className="me";
      const a=document.createElement("span"); a.textContent=String(i+1); const b=document.createElement("b"); b.textContent=ini;
      const c=document.createElement("span"); c.textContent=Number.isFinite(v.t)?fmtT(v.t):"–"; const dd=document.createElement("small"); dd.textContent=v.ts?new Date(v.ts).toLocaleDateString():"";
      row.append(a,b,c,dd); list.append(row); });
  },()=>{ $("boards").hidden=true; });
}
if (window.claude && typeof window.claude.use==="function") window.claude.use("db").then(x=>{ db=x; watchBoard(); }).catch(()=>{});

// ---------------- race items ----------------
// One item at a time from rainbow ? boxes, weighted by race position (leaders get defence, the back gets the nasty stuff).
const ITEMS={
  boost:{name:"Rocket boost",label:"BOOST"}, bomb:{name:"Bomb",label:"BOMB"}, comet:{name:"Homing comet",label:"COMET"},
  shield:{name:"Shield bubble",label:"SHIELD"}, magnet:{name:"Spark magnet",label:"MAGNET"},
  sniper:{name:"Spin sniper",label:"SNIPER"},
};
let heldItem=null, shieldT=0, magnetT=0, boomN=0, lastBoom=0;
const lastBoomSeen=new Map(), projectiles=[];
const shieldMesh=new THREE.Mesh(new THREE.SphereGeometry(1.2,20,14),new THREE.MeshBasicMaterial({color:"#7ce0ff",transparent:true,opacity:.22,depthWrite:false})); shieldMesh.visible=false; hero.add(shieldMesh); shieldMesh.position.y=.2;
function myRank(){ const rows=standings(); const i=rows.findIndex(r=>r.me); return {rank:i<0?0:i, n:rows.length}; }
function rollItem(){
  const {rank,n}=myRank(), back = n>1 ? rank/(n-1) : .5;   // 0 = leading, 1 = last
  const w = MODE==="sumo" ? { boost:1, shield:.8, magnet:0, bomb:1.4, comet:.8, sniper:1.4 }
    : { boost:1, shield:1.4*(1-back)+.2, magnet:1.2*(1-back)+.3, bomb:.4+1.2*back, comet:back>.45 ? 1.6*back : 0, sniper:.7 };
  let tot=0; for (const k in w) tot+=w[k]; let r=Math.random()*tot;
  for (const k in w){ r-=w[k]; if (r<=0) return k; } return "boost";
}
function leaderTarget(exclude){
  let best=null, bs=-1;
  if (exclude && running && got>bs){ bs=got; best={key:myPeer||"me",name:myName(),pos:()=>pBody.position}; }
  for (const b of bots) if ("bot:"+b.id!==exclude && b.sparkCount>bs){ bs=b.sparkCount; best={key:"bot:"+b.id,name:b.name,pos:()=>b.body.position}; }
  if (!amController) for (const [k,a] of botAvatars) if ((a.sparks||0)>bs){ bs=a.sparks||0; best={key:k,name:a.name,pos:()=>a.disp}; }
  for (const a of avatars.values()){ const s=Number(a.pres&&a.pres.s)||0; if (s>bs){ bs=s; best={key:a.peer,name:a.name,pos:()=>a.disp}; } }
  return best;
}
const bombMat=new THREE.MeshStandardMaterial({color:"#1a1a20",metalness:.4,roughness:.4}), fuseMat=new THREE.MeshBasicMaterial({color:"#ff6a2e"});
const cometMat=new THREE.MeshBasicMaterial({color:"#7cc8ff",toneMapped:false});
// spin sniper: it only fires after you turn a full 360°, which charges it for a few seconds (the gun glows).
// That forces trickshots: spin off a swing, spin while gliding, then fire.
let spinAcc=0, spinQuiet=0, sniperCharge=0, lastSpinYaw=null;
const SNIPER_CHARGE=3.2, SNIPER_RANGE=160;
function trackSpin(dt){
  if (heldItem!=="sniper"){ spinAcc=0; sniperCharge=0; lastSpinYaw=yaw; return; }
  if (lastSpinYaw==null) lastSpinYaw=yaw;
  let d=yaw-lastSpinYaw; d=Math.atan2(Math.sin(d),Math.cos(d)); lastSpinYaw=yaw;
  if (Math.abs(d)>.002){ if (Math.sign(d)!==Math.sign(spinAcc) && Math.abs(spinAcc)>.3) spinAcc*=.5; spinAcc+=d; spinQuiet=0; } else { spinQuiet+=dt; if (spinQuiet>.6) spinAcc*=Math.exp(-3*dt); }
  if (sniperCharge>0){ sniperCharge=Math.max(0,sniperCharge-dt); if (!sniperCharge) toast("Sniper cooled down","Spin again to charge it"); }
  if (Math.abs(spinAcc)>=Math.PI*2){ spinAcc=0; const was=sniperCharge>0; sniperCharge=SNIPER_CHARGE; if (!was){ [660,880,1320].forEach((f,i)=>tone(f,.12,"sawtooth",.05,1.3,i*.05)); toast("CHARGED!",isTouch?"Tap Item to fire":"Press G to fire"); } }
}
function fireSniper(){
  const dir=new THREE.Vector3(); camera.getWorldDirection(dir);
  const from=camera.position.clone().addScaledVector(dir,camera.position.distanceTo(camTarget));
  let best=null;
  const consider=(key,a,isBot)=>{ const to=tmpV.set(a.disp.x-from.x,a.disp.y+.4-from.y,a.disp.z-from.z), along=to.dot(dir); if (along<1 || along>SNIPER_RANGE) return;
    const off=Math.sqrt(Math.max(0,to.lengthSq()-along*along)); if (off<1.3+along*.012 && (!best || along<best.along)) best={key,a,along,isBot}; };
  for (const a of avatars.values()) consider(a.peer,a,false);
  for (const [key,a] of botAvatars) consider(key,a,true);
  // walls stop the bullet
  let endD=SNIPER_RANGE; ray.set(from,dir); ray.far=SNIPER_RANGE; const wall=ray.intersectObjects(grappleables,false).find(h=>!h.object.userData.remote); if (wall) endD=wall.distance;
  const td=terrainRay(from,dir,SNIPER_RANGE); if (td<endD) endD=td;
  if (best && best.along>endD+.5) best=null;
  const hitD=best?best.along:endD;
  // tracer
  const end=from.clone().addScaledVector(dir,hitD), len=hand.distanceTo(end);
  const tr=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1,6,1,true),new THREE.MeshBasicMaterial({color:"#9af6ff",transparent:true,opacity:.9,toneMapped:false,depthWrite:false}));
  tr.position.copy(hand).add(end).multiplyScalar(.5); tr.scale.set(1,len,1); tr.quaternion.setFromUnitVectors(UP,tmpV2.subVectors(end,hand).normalize()); scene.add(tr);
  projectiles.push({kind:"tracer",mesh:tr,t:.35});
  noise(.12,{type:"highpass",f:1800,vol:.9}); tone(140,.35,"sawtooth",.18,.3); shakeT=Math.max(shakeT,.3);
  const v=pBody.velocity; v.x-=dir.x*6; v.y-=dir.y*6; v.z-=dir.z*6;   // recoil
  if (!best){ explode(end.x,end.y,end.z,2.2,.5,{peer:myPeer||"me",name:myName()},true); toast("Missed!"); return; }
  const hd=Math.hypot(dir.x,dir.z)||1, d2=[r2(dir.x/hd),r2(dir.z/hd)];
  if (best.isBot && amController) hitBot(best.key,d2,true,myPeer||"me",myName());
  else { hitN++; lastHit={n:hitN,to:best.key,d:d2,f:1,m:1.6}; }
  stats.hits++; stats.snipes=(stats.snipes||0)+1; crack(); faceHappyT=2;
  const air=!onGround; announce("trickshot", air?"Trickshot!":"Sniped!",true); toast(air?"TRICKSHOT!":"SNIPED!",best.a.name+" from "+Math.round(best.along)+" m");
}
function useItem(){
  if (!running || raceCount>0 || !heldItem) return;
  if (heldItem==="sniper"){ audioOn(); if (sniperCharge<=0){ toast("Spin 360° to charge it!","Turn a full circle, then fire while it glows"); tone(220,.12,"square",.04); return; } heldItem=null; sniperCharge=0; stats.items++; fireSniper(); return; }
  audioOn(); const it=heldItem; heldItem=null; stats.items++;
  const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)), p=pBody.position, v=pBody.velocity;
  if (it==="boost"){ v.x+=fwd.x*26; v.z+=fwd.z*26; v.y=Math.max(v.y,0)+9; knockUntil=simTime+.5; puff(p); whoosh(true); toast("Rocket boost!"); }
  else if (it==="shield"){ shieldT=8; toast("Shield bubble","8 seconds of safety"); tone(880,.3,"sine",.06,1.5); }
  else if (it==="magnet"){ magnetT=6; toast("Spark magnet","Sparks within 14 m come to you"); tone(440,.3,"triangle",.06,2); }
  else if (it==="bomb"){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.4,14,10),bombMat); const f=new THREE.Mesh(new THREE.SphereGeometry(.12,6,4),fuseMat); f.position.y=.42; m.add(f); scene.add(m);
    const b=new CANNON.Body({mass:1,shape:new CANNON.Sphere(.4),collisionFilterGroup:16,collisionFilterMask:1|4|16,linearDamping:.1});
    b.position.set(p.x+fwd.x*1.2,p.y+.8,p.z+fwd.z*1.2); b.velocity.set(v.x+fwd.x*18,v.y+7,v.z+fwd.z*18); world.addBody(b);
    projectiles.push({kind:"bomb",mesh:m,body:b,t:1.8}); tone(300,.15,"square",.05,.6); toast("Bomb away!");
  }
  else if (it==="comet"){
    const T=leaderTarget(); if (!T){ toast("No one to chase","The comet fizzles."); return; }
    const m=new THREE.Mesh(new THREE.SphereGeometry(.45,12,8),cometMat); m.position.set(p.x,p.y+2,p.z); scene.add(m);
    projectiles.push({kind:"comet",mesh:m,target:T,t:7,vel:new THREE.Vector3(0,30,0)}); tone(1200,.5,"sawtooth",.04,.4); toast("Homing comet!","It's hunting "+T.name+", the leader"); announce("race","Homing comet incoming!");
  }
}
// an explosion: knock back everyone close (applied by each game to itself; bots by whoever runs them) and break towers
function explode(x,y,z,r,power,by,local){
  noise(.9,{type:"lowpass",f:900,f2:60,vol:.7}); tone(70,.5,"sine",.4,.5);
  const flash=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),new THREE.MeshBasicMaterial({color:"#ffb050",transparent:true,opacity:.8,toneMapped:false,depthWrite:false})); flash.position.set(x,y,z); scene.add(flash); projectiles.push({kind:"flash",mesh:flash,t:.45,r});
  for (let i=0;i<3;i++) puff({x:x+(Math.random()-.5)*2,y,z:z+(Math.random()-.5)*2});
  blastTowers(x,y,z,r,power);
  const p=pBody.position, d=Math.hypot(p.x-x,p.y-y,p.z-z);
  if (d<r){ const k=(1-d/r); if (Math.hypot(p.x-pBody.position.x)>=0){ shakeT=Math.max(shakeT,.6*k);
      const dx=(p.x-x)/(d||1), dz=(p.z-z)/(d||1); if (shieldT>0) toast("Shield blocked the blast!"); else { const v=pBody.velocity; v.x+=dx*26*power*k; v.z+=dz*26*power*k; v.y=Math.max(v.y,10*power*k+4); knockUntil=simTime+.9; faceHurtT=1.2; if (hook) hook.phase="retract"; gliding=false;
        if (by && by.peer!==(myPeer||"me")) lastHitBy={peer:by.peer,name:by.name,t:simTime}; } } }
  // a bot shield shows as a bubble on its avatar

  if (amController) for (const b of bots){ const q=b.body.position, db_=Math.hypot(q.x-x,q.y-y,q.z-z); if (db_<r && !(b.shieldT>0) && !(by && by.peer==="bot:"+b.id && db_>2)){ const k=1-db_/r, dx=(q.x-x)/(db_||1), dz=(q.z-z)/(db_||1), v=b.body.velocity; v.x+=dx*26*power*k; v.z+=dz*26*power*k; v.y=Math.max(v.y,10*power*k+4); b.knockUntil=simTime+.9; b.hook=null; if (by) b.lastHitBy={peer:by.peer,name:by.name,t:simTime}; } }
  if (local){ boomN++; lastBoom={n:boomN,x:r2(x),y:r2(y),z:r2(z),r,p:power}; }
}
function updateItems(dt,itemDt=simFrozen?0:dt){
  if (shieldT>0) shieldT=Math.max(0,shieldT-dt); if (magnetT>0) magnetT=Math.max(0,magnetT-dt);
  shieldMesh.visible=shieldT>0; if (shieldMesh.visible) shieldMesh.material.opacity=.18+.08*Math.sin(performance.now()/120);
  const p=pBody.position, t=performance.now()/1000;
  for (const b of itemBoxes){
    if (!RULES.items){ if (b.mesh.visible) b.mesh.visible=false; continue; }
    if (b.cd>0){ b.cd-=itemDt; b.mesh.visible=b.cd<=0; continue; }
    b.mesh.rotation.y+=dt*1.6; b.mesh.rotation.x+=dt*.7; b.mesh.position.y=b.pos.y+Math.sin(t*2+b.pos.x)*.25;
    if (running && !heldItem && b.pos.distanceTo(tmpV.set(p.x,p.y,p.z))<2){ b.cd=8; b.mesh.visible=false; heldItem=rollItem(); faceHappyT=1; tone(660,.08,"square",.05); tone(990,.12,"square",.05,1,.06); toast(ITEMS[heldItem].name+"!", isTouch?"Tap Item to use it":"Press G to use it"); }
  }
  for (let i=projectiles.length-1;i>=0;i--){
    const pr=projectiles[i]; pr.t-=dt;
    if (pr.kind==="bomb"){ pr.mesh.position.copy(pr.body.position); if (pr.t<=0){ const q=pr.body.position; explode(q.x,q.y,q.z,7,1,pr.by||{peer:myPeer||"me",name:myName()},true); scene.remove(pr.mesh); world.removeBody(pr.body); projectiles.splice(i,1); } }
    else if (pr.kind==="comet"){
      const tp=pr.target.pos(), m=pr.mesh, to=tmpV.set(tp.x-m.position.x,tp.y+.3-m.position.y,tp.z-m.position.z), d=to.length();
      if (pr.t<5.5){ to.normalize().multiplyScalar(48); pr.vel.lerp(to,1-Math.exp(-4*dt)); } else pr.vel.y-=10*dt;
      m.position.addScaledVector(pr.vel,dt);
      if (Math.random()<.5) puff({x:m.position.x,y:m.position.y+.4,z:m.position.z});
      if ((pr.t<5.5 && d<2.2) || pr.t<=0){ explode(m.position.x,m.position.y,m.position.z,6,1.6,pr.by||{peer:myPeer||"me",name:myName()},true); scene.remove(m); projectiles.splice(i,1); }
    }
    else if (pr.kind==="lava"){ const m=pr.mesh; pr.vel.y-=26*dt; m.position.addScaledVector(pr.vel,dt); m.rotation.x+=dt*5; if (Math.random()<.4) puff({x:m.position.x,y:m.position.y+.4,z:m.position.z});
      if (pr.t<=0 || (pr.vel.y<0 && m.position.y<Math.max(0,H(m.position.x,m.position.z))+.4)){ explode(m.position.x,m.position.y,m.position.z,5,.9,pr.by,false); scene.remove(m); m.geometry.dispose(); projectiles.splice(i,1); } }
    else if (pr.kind==="tracer"){ pr.mesh.material.opacity=.9*Math.max(0,pr.t/.35); if (pr.t<=0){ scene.remove(pr.mesh); pr.mesh.geometry.dispose(); pr.mesh.material.dispose(); projectiles.splice(i,1); } }
    else if (pr.kind==="flash"){ const k=1-pr.t/.45; pr.mesh.scale.setScalar(.5+pr.r*k); pr.mesh.material.opacity=.8*(1-k); if (pr.t<=0){ scene.remove(pr.mesh); pr.mesh.geometry.dispose(); pr.mesh.material.dispose(); projectiles.splice(i,1); } }
  }
  for (let i=debris.length-1;i>=0;i--){ const d=debris[i]; d.t-=dt; d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion); if (d.t<=0){ scene.remove(d.mesh); world.removeBody(d.body); debris.splice(i,1); } }
  $("item").textContent = heldItem==="sniper" ? (sniperCharge>0 ? "FIRE "+Math.ceil(sniperCharge) : "SPIN "+Math.round(Math.min(1,Math.abs(spinAcc)/(Math.PI*2))*100)+"%") : heldItem ? ITEMS[heldItem].label : (shieldT>0 ? "SHIELD "+Math.ceil(shieldT) : magnetT>0 ? "MAGNET "+Math.ceil(magnetT) : "–");
}

// bots grab boxes as they pass, and use items in character
function botItems(b,dt){
  if (b.shieldT>0) b.shieldT=Math.max(0,b.shieldT-dt); if (b.magnetT>0) b.magnetT=Math.max(0,b.magnetT-dt);
  const p=b.body.position, C=b.C;
  if (!b.item && RULES.items) for (const box of itemBoxes){ if (box.cd<=0 && box.pos.distanceTo(tmpV.set(p.x,p.y,p.z))<2.2){ box.cd=8; box.mesh.visible=false;
    const back = b.sparkCount < Math.max(got,...bots.map(o=>o.sparkCount)) ? 1 : 0;
    const pool = back ? ["bomb","comet","boost","bomb"] : ["shield","magnet","boost","bomb"]; b.item=pool[(Math.random()*pool.length)|0]; b.itemT=0; break; } }
  if (!b.item) return;
  b.itemT+=dt; if (b.itemT<.8) return;            // a beat before using it, so it reads as a decision
  const me=running?pBody.position:null;
  const near=[...(me?[{pos:me,peer:myPeer||"me"}]:[]),...[...avatars.values()].filter(a=>a.pres&&!a.pres.ps).map(a=>({pos:a.disp,peer:a.peer}))]
    .map(t=>({...t,d:Math.hypot(t.pos.x-p.x,t.pos.y-p.y,t.pos.z-p.z)})).sort((x,y)=>x.d-y.d)[0];
  const by={peer:"bot:"+b.id,name:b.name};
  let used=false;
  if (b.item==="shield" && (C.fear>.5 ? near&&near.d<14 : (near&&near.d<6) || b.itemT>8)){ b.shieldT=8; used=true; }
  else if (b.item==="magnet" && b.target!=null && sparks[b.target].pos.distanceTo(tmpV.set(p.x,p.y,p.z))<30){ b.magnetT=6; used=true; }
  else if (b.item==="boost" && b.standing && b.wish.lengthSq()>0 && b.target!=null && (()=>{ const T=sparks[b.target].pos, hd=Math.hypot(T.x-p.x,T.z-p.z); return hd>25 && !waterBetween(p,T) && H(p.x+b.wish.x*25,p.z+b.wish.z*25)>0; })()){ const v=b.body.velocity; v.x+=b.wish.x*24; v.z+=b.wish.z*24; v.y=Math.max(v.y,0)+8; b.jumpT=simTime; used=true; }
  else if (b.item==="bomb" && near && near.d<(C.aggr>.5?22:12)){
    const dir=tmpV.set(near.pos.x-p.x,0,near.pos.z-p.z).normalize();
    const m=new THREE.Mesh(new THREE.SphereGeometry(.4,14,10),bombMat); const f=new THREE.Mesh(new THREE.SphereGeometry(.12,6,4),fuseMat); f.position.y=.42; m.add(f); scene.add(m);
    const bb=new CANNON.Body({mass:1,shape:new CANNON.Sphere(.4),collisionFilterGroup:16,collisionFilterMask:1|4|16,linearDamping:.1});
    const sp=Math.min(20,near.d*.9+4); bb.position.set(p.x+dir.x*1.2,p.y+.8,p.z+dir.z*1.2); bb.velocity.set(dir.x*sp,7,dir.z*sp); world.addBody(bb);
    projectiles.push({kind:"bomb",mesh:m,body:bb,t:1.8,by}); used=true;
    if (Math.random()<.5) botSay(C,C.taunt);
  }
  else if (b.item==="comet"){
    const T=leaderTarget("bot:"+b.id);
    if (T && T.key!=="bot:"+b.id){ const m=new THREE.Mesh(new THREE.SphereGeometry(.45,12,8),cometMat); m.position.set(p.x,p.y+2,p.z); scene.add(m);
      projectiles.push({kind:"comet",mesh:m,target:T,t:7,vel:new THREE.Vector3(0,30,0),by}); used=true;
      if (T.key===(myPeer||"me")){ toast(b.name+" fired a homing comet","It's coming for you!"); announce("race","Homing comet incoming!"); } }
    else if (b.itemT>6){ b.item=null; }
  }
  if (b.itemT>15) used=true;                        // hang on to things only so long
  if (used) b.item=null;
}

// ---------------- reacting face (Doom-style portrait) ----------------
// A 42x42 pixel portrait of your character, redrawn when the mood changes: idle (blinks), grin, ow, panic, dizzy, thrill.
let faceHurtT=0, faceHappyT=0, faceDizzyT=0, faceMood="", faceBlink=false, faceDrawT=0;
const fctx=$("face").getContext("2d");
function drawFace(C,mood,blink){
  const x=fctx, W=42; x.clearRect(0,0,W,W);
  const shake = mood==="ow" ? (Math.random()-.5)*2 : 0;
  x.save(); x.translate(shake,0);
  x.fillStyle=C.skin||"#ffd9b8"; x.beginPath(); x.ellipse(21,23,13,15,0,0,Math.PI*2); x.fill();                 // head
  x.fillStyle=C.hat||"#22314d"; x.beginPath(); x.ellipse(21,13,14,8,0,Math.PI,0); x.fill(); x.fillRect(7,12,28,3); // hat
  const hair=C.hair||"#222";
  if (C.feature==="bangs"){ x.fillStyle=hair; x.fillRect(9,14,24,4); }
  if (C.feature==="shaggy"){ x.fillStyle=hair; for (let i=0;i<6;i++) x.fillRect(8+i*4.5,14,4,5+(i%2)*2); }
  // eyes
  const ey=21, eL=15, eR=27;
  x.fillStyle="#111";
  if (C.feature==="shades" && mood!=="ow" && mood!=="dizzy"){ x.fillStyle="#0c0c10"; x.fillRect(9,ey-3,10,5); x.fillRect(23,ey-3,10,5); x.fillRect(19,ey-2,4,2); }
  else if (C.feature==="goggles" && mood==="idle"){ x.fillStyle="#7ce0ff"; x.fillRect(9,ey-3,24,5); x.fillStyle="#2a7a9a"; x.fillRect(12,ey-2,6,3); x.fillRect(24,ey-2,6,3); }
  else if (blink && mood==="idle"){ x.fillRect(eL-3,ey,6,1.5); x.fillRect(eR-3,ey,6,1.5); }
  else if (mood==="ow"){ x.lineWidth=2; x.strokeStyle="#111"; for (const ex of [eL,eR]){ x.beginPath(); x.moveTo(ex-3,ey-3); x.lineTo(ex+3,ey+2); x.moveTo(ex-3,ey+2); x.lineTo(ex+3,ey-3); x.stroke(); } }
  else if (mood==="dizzy"){ x.lineWidth=1.5; x.strokeStyle="#111"; for (const ex of [eL,eR]){ x.beginPath(); x.arc(ex,ey,3,0,Math.PI*1.6); x.stroke(); } }
  else { const r = mood==="panic" ? 4.2 : (C.feature==="bigeyes"?3.6:2.4);
    for (const ex of [eL,eR]){ x.fillStyle="#fff"; x.beginPath(); x.arc(ex,ey,r+1,0,Math.PI*2); x.fill(); x.fillStyle="#111"; x.beginPath(); x.arc(ex,ey+(mood==="panic"?-1:0),r*.55,0,Math.PI*2); x.fill(); } }
  if (mood==="grin"||mood==="thrill"){ x.fillStyle="#111"; x.fillRect(eL-3,ey-6,6,1.5); x.fillRect(eR-3,ey-6,6,1.5); }        // raised brows
  if (mood==="ow"){ x.fillStyle="#111"; x.fillRect(eL-4,ey-7,7,1.5); x.fillRect(eR-3,ey-7,7,1.5); }
  // mouth
  x.fillStyle="#3a1010";
  if (mood==="grin"){ x.beginPath(); x.arc(21,29,6,0,Math.PI); x.fill(); x.fillStyle="#fff"; x.fillRect(16,29,10,2); }
  else if (mood==="thrill"){ x.beginPath(); x.arc(21,29,4.5,0,Math.PI); x.fill(); }
  else if (mood==="ow"){ x.beginPath(); x.ellipse(21,31,4,3,0,0,Math.PI*2); x.fill(); }
  else if (mood==="panic"){ x.beginPath(); x.ellipse(21,31,3.5,5,0,0,Math.PI*2); x.fill(); }
  else if (mood==="dizzy"){ x.strokeStyle="#3a1010"; x.lineWidth=1.5; x.beginPath(); x.moveTo(15,31); for (let i=0;i<6;i++) x.lineTo(16+i*2,31+(i%2?2:-1)); x.stroke(); }
  else { x.fillRect(17,30,8,1.6); }
  // character features drawn over the mouth area
  if (C.feature==="mustache"){ x.fillStyle=hair; x.fillRect(14,27,6,2); x.fillRect(22,27,6,2); x.fillRect(13,28,2,2); x.fillRect(27,28,2,2); }
  if (C.feature==="beard"){ x.fillStyle=hair; x.beginPath(); x.moveTo(8,25); x.quadraticCurveTo(21,46,34,25); x.lineTo(30,32); x.quadraticCurveTo(21,36,12,32); x.closePath(); x.fill(); }
  if (C.feature==="earrings"){ x.fillStyle="#f6b40e"; x.beginPath(); x.arc(8,28,2,0,Math.PI*2); x.arc(34,28,2,0,Math.PI*2); x.fill(); }
  if (mood==="panic"){ x.fillStyle="#7ce0ff"; x.fillRect(34,15,2,5); }                                                   // sweat drop
  x.restore();
}
function updateFace(dt){
  faceHurtT=Math.max(0,faceHurtT-dt); faceHappyT=Math.max(0,faceHappyT-dt); faceDizzyT=Math.max(0,faceDizzyT-dt);
  const v=pBody.velocity, att=hook&&hook.phase==="attached";
  const mood = faceHurtT>0 ? "ow" : faceDizzyT>0 ? "dizzy" : (v.y<-17 && !att && !gliding) ? "panic" : faceHappyT>0 ? "grin" : (att||gliding||Math.hypot(v.x,v.z)>18) ? "thrill" : "idle";
  faceDrawT-=dt; const blink = mood==="idle" && (performance.now()%3200)<160;
  if (mood!==faceMood || blink!==faceBlink || (mood==="ow" && faceDrawT<=0)){ faceMood=mood; faceBlink=blink; faceDrawT=.08; drawFace(charByKey(myCharKey),mood,blink); $("faceBox").classList.toggle("hurt",mood==="ow"); }
}

// ---------------- announcer ----------------
// Uses Claude's voice where the viewer offers it, otherwise the browser's own speech voice.
// Each line has a key so recorded clips can replace the synthetic voice later.
let ttsNS=null, lastSay=0;
if (window.claude && typeof window.claude.use==="function") window.claude.use("tts").then(t=>{ ttsNS=t; }).catch(()=>{});
// the French announcer: a French woman's voice from the device reading the (English) lines, accent and all
const FR_FEMALE=/(am[ée]lie|audrey|aur[ée]lie|marie|virginie|julie|c[ée]line|chantal|denise|hortense|v[ée]ronique|female|femme|fran[çc]ais)/i;
function pickFrenchVoice(vs){ const fr=vs.filter(v=>/^fr/i.test(v.lang)); return fr.find(v=>FR_FEMALE.test(v.name) && !/(thomas|daniel|nicolas|henri|paul|male\b)/i.test(v.name)) || fr[0] || null; }
let frVoice=null; const loadFr=()=>{ try{ frVoice=window.speechSynthesis ? pickFrenchVoice(speechSynthesis.getVoices()) : null; }catch(e){} };
if (window.speechSynthesis){ loadFr(); try{ speechSynthesis.addEventListener("voiceschanged",loadFr); }catch(e){} }
function sayFrench(text){
  const ss=window.speechSynthesis; if (!frVoice) loadFr(); if (!ss || !frVoice) return false;
  try{ ss.cancel(); const u=new SpeechSynthesisUtterance(text); u.voice=frVoice; u.lang=frVoice.lang; u.pitch=1.1; u.rate=1.05; u.volume=1; ss.speak(u); return true; }catch(e){ return false; }
}
function sayLocal(text,vo){
  const ss=window.speechSynthesis; if (!ss) return;
  try{ ss.cancel(); const u=new SpeechSynthesisUtterance(text); u.pitch=vo?vo.pitch:.6; u.rate=vo?vo.rate:1.05;
    const vs=ss.getVoices(), lang=vo&&vo.lang;
    const pick=(lang && vs.find(v=>v.lang.toLowerCase().replace("_","-").startsWith(lang)))
      || (!vo && vs.find(v=>/^en/i.test(v.lang)&&/(male|daniel|alex|fred|david|james)/i.test(v.name))) || vs.find(v=>/^en/i.test(v.lang));
    if (pick) u.voice=pick;
    ss.speak(u); }catch(e){}
}
// recorded clips (made with tools/voice/process.sh) are listed in voice/index.json and replace the synthetic voice
const clips={}; let clipsAsked=false;
function loadClips(){
  if (clipsAsked || !ac) return; clipsAsked=true;
  fetch("voice/index.json").then(r=>r.ok?r.json():[]).then(keys=>{ if (!Array.isArray(keys)) return;
    for (const k of keys.slice(0,40)) if (/^[a-z0-9_-]+$/.test(k)) fetch("voice/"+k+".mp3").then(r=>r.ok?r.arrayBuffer():null).then(b=>b&&ac.decodeAudioData(b)).then(buf=>{ if (buf) clips[k]=buf; }).catch(()=>{}); }).catch(()=>{});
}
function playClip(buf){
  const src=ac.createBufferSource(), g=ac.createGain(); src.buffer=buf; g.gain.value=1.3; src.connect(g).connect(master); src.start();
  if (musicBus){ const t=ac.currentTime; musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(musicOn?.2:0,t,.05); musicBus.gain.setTargetAtTime(musicOn?.55:0,t+buf.duration,.3); }
}
function announce(key,text,priority,vo,spoken){
  if (!audioOpts.voice) return;
  const now=performance.now(); if (!priority && now-lastSay<1500) return; lastSay=now;
  if (ac && clips[key]){ playClip(clips[key]); return; }
  const words=spoken||text;
  if (!vo && settings.announcer==="french" && sayFrench(words)) return;
  if (ttsNS){ ttsNS.speak(words,{voice:vo?vo.tts:"rounded",rate:vo?Math.max(.7,Math.min(1.5,vo.rate)):1.1}).catch(()=>sayLocal(words,vo)); return; }
  sayLocal(words,vo);
}

// ---------------- music ----------------
// An original 132 BPM techno track generated live: kick, offbeat hats, claps, a distorted acid
// bassline over Am-Am-F-G, and grungy chord stabs, arranged in 8-bar sections that build and break down.
const BPM=132, STEP=60/BPM/4, ROOTS=[0,0,-4,-2], RIFF=[0,0,12,0, 0,10,0,7, 0,0,12,0, 3,0,10,5], RIFF_ON=[1,0,1,1, 0,1,1,0, 1,0,1,1, 1,0,1,1];
const PARTS=[0,1,2,2,3,2,2,1];  // 0 intro, 1 groove, 2 full, 3 breakdown
let musicOn=false, mTimer=null, mNext=0, mStep=0, distCurve=null, mDelay=null, raceLive=false;
const hz=semi=>55*Math.pow(2,semi/12);
function mKick(t){ const o=ac.createOscillator(), g=ac.createGain(); o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(42,t+.12); g.gain.setValueAtTime(.95,t); g.gain.exponentialRampToValueAtTime(.001,t+.34); o.connect(g).connect(musicBus); o.start(t); o.stop(t+.36); }
function mBass(t,f,cut){
  if (!distCurve){ distCurve=new Float32Array(1024); for(let i=0;i<1024;i++){ const x=i/512-1; distCurve[i]=Math.tanh(x*6); } }
  const o=ac.createOscillator(), o2=ac.createOscillator(), sh=ac.createWaveShaper(), fl=ac.createBiquadFilter(), g=ac.createGain();
  o.type="sawtooth"; o2.type="square"; o.frequency.value=f; o2.frequency.value=f*1.005; sh.curve=distCurve;
  fl.type="lowpass"; fl.Q.value=9; fl.frequency.setValueAtTime(cut,t); fl.frequency.exponentialRampToValueAtTime(160,t+STEP*1.6);
  g.gain.setValueAtTime(.16,t); g.gain.exponentialRampToValueAtTime(.001,t+STEP*.95);
  o.connect(sh); o2.connect(sh); sh.connect(fl).connect(g).connect(musicBus); o.start(t); o2.start(t); o.stop(t+STEP); o2.stop(t+STEP);
}
function mStab(t,root,open){
  if (!mDelay){ mDelay=ac.createDelay(1); mDelay.delayTime.value=STEP*3; const fb=ac.createGain(); fb.gain.value=.38; const wet=ac.createGain(); wet.gain.value=.5; mDelay.connect(fb).connect(mDelay); mDelay.connect(wet).connect(musicBus); }
  const fl=ac.createBiquadFilter(), g=ac.createGain(); fl.type="lowpass"; fl.frequency.value=open?2600:900; fl.Q.value=3;
  g.gain.setValueAtTime(.07,t); g.gain.exponentialRampToValueAtTime(.001,t+.32); fl.connect(g); g.connect(musicBus); g.connect(mDelay);
  for (const iv of [0,3,7,12]){ const o=ac.createOscillator(); o.type="sawtooth"; o.frequency.value=hz(root+24+iv)*(1+(Math.random()-.5)*.006); o.connect(fl); o.start(t); o.stop(t+.34); }
}
function playStep(i,t){
  const s16=i%16, bar=Math.floor(i/16), part=finale.active?3:PARTS[Math.floor(bar/8)%PARTS.length], barInPart=finale.active?bar%4+4:bar%8, root=ROOTS[bar%4];
  if (finale.active && s16%2===0){ const arp=[0,3,7,10,12,15,19,22][(s16/2+bar)%8]; tone(hz(root+24+arp),STEP*1.6,"square",.035,1,Math.max(0,t-ac.currentTime),musicBus); }
  const kick = part!==3 || barInPart>=7 && s16>=8;
  if (kick && s16%4===0) mKick(t);
  if (s16%4===2) noise(part>=1?.16:.05,{type:"highpass",f:7500,vol:part>=1?.12:.08,at:t,bus:musicBus});
  else if (part>=1 && s16%2===1) noise(.03,{type:"highpass",f:9000,vol:.05,at:t,bus:musicBus});
  if (part>=2 && (s16===4||s16===12)){ noise(.18,{type:"bandpass",f:1500,q:.8,vol:.3,at:t,bus:musicBus}); noise(.12,{type:"bandpass",f:1100,q:.8,vol:.2,at:t+.012,bus:musicBus}); }
  if (part>=1 && RIFF_ON[s16]){ const sweep=.5+.5*Math.sin((i/64)*Math.PI*2); mBass(t,hz(root+RIFF[s16]),part===3?400+sweep*900:500+sweep*2600); }
  if ((part===2||part===3) && (s16===0||s16===6||s16===10)) mStab(t,root,part===2);
  if (part===3 && barInPart>=6 && s16===0) noise(STEP*32,{type:"highpass",f:400,f2:9000,vol:.12,at:t,bus:musicBus});
}
function schedule(){ while (mNext < ac.currentTime+.12){ playStep(mStep,mNext); mNext+=STEP; mStep++; } }
function updateMusic(){
  if (!ac) return;
  const want = audioOpts.music==="always" ? true : audioOpts.music==="races" ? (raceLive || raceCount>0) : false;
  if (want && !musicOn){ musicOn=true; mNext=ac.currentTime+.06; mTimer=setInterval(schedule,25); musicBus.gain.cancelScheduledValues(ac.currentTime); musicBus.gain.setTargetAtTime(.55,ac.currentTime,.4); }
  else if (!want && musicOn){ musicOn=false; musicBus.gain.setTargetAtTime(0,ac.currentTime,.3); const tm=mTimer; setTimeout(()=>{ if(!musicOn) clearInterval(tm); },1200); }
}
// settings
{ const sel=$("optMap"); for (const k of Object.keys(MAPS)){ const o=document.createElement("option"); o.value=k; o.textContent=MAPS[k].name+(MAPS[k].sumoOnly?" (sumo arena)":""); sel.append(o); } sel.value=MAP.key;
  sel.addEventListener("change",()=>{ if (sel.value!==MAP.key){ location.hash="map-"+sel.value; location.reload(); } }); }
$("optMusic").value=audioOpts.music; $("optSfx").checked=audioOpts.sfx; $("optVoice").checked=audioOpts.voice;
function saveAudio(){ audioOpts.music=$("optMusic").value; audioOpts.sfx=$("optSfx").checked; audioOpts.voice=$("optVoice").checked; try{ localStorage.setItem("skyhook.audio",JSON.stringify(audioOpts)); }catch(e){} if (sfxBus) sfxBus.gain.value=audioOpts.sfx?1:0; updateMusic(); }
["optMusic","optSfx","optVoice"].forEach(id=>$(id).addEventListener("change",saveAudio));

// races: whoever presses Start race bumps a number in their presence; everyone who sees it restarts with a countdown
function setMode(m){ m = m==="sumo" ? "sumo" : "race"; if (MAP.sumoOnly && m!=="sumo"){ const sel=$("optMode"); if (sel) sel.value="sumo"; toast("Sumo only","This arena has no spark race."); return; } if (m===MODE) return; MODE=m; try{ localStorage.setItem("skyhook.mode",m); }catch(e){} const sel=$("optMode"); if (sel) sel.value=m; applyInputUI(); resetFinale(); }
function beginRace(id,byName,mode){
  if (mode) setMode(mode);
  dunks=0; for (const k of ["deaths","dunks","hits","homers","hitsTaken","punches","items","airTime","topSpeed","traps","throws","smashes","snipes"]) stats[k]=0; stats.dunkedBy={};
  for (const b of bots){ b.dunks=0; b.falls=0; }
  raceId=id; restartRun(); buildTowers(); heldItem=null; raceLive=true; raceOver=false; raceStartSim=simTime+3; raceCount=3; for (const b of bots){ b.got.clear(); b.sparkCount=0; b.target=null; b.hook=null; b.final=false; b.eng=null; b.bait=null; b.avoid&&b.avoid.clear(); } announce("race","Race starting!",true);
  for (const a of botAvatars.values()) queueIntro(a.ch,true); tone(440,.15,"square",.05);
  toast("3", byName ? byName+" started a race" : "Race starting for everyone on the island");
}
function tickRace(dt){
  if (raceCount<=0) return;
  const before=Math.ceil(raceCount); raceCount-=dt; const after=Math.ceil(raceCount);
  if (raceCount<=0){ raceCount=0; runState="running"; elapsed=0; toast("GO!",MODE==="sumo"?`Knock them off. First to ${SUMO_KOS} wins.`:"Most sparks fastest wins."); announce("go","Go!",true); tone(880,.25,"square",.06); }
  else if (after!==before){ toast(String(after)); tone(440,.15,"square",.05); }
}
function startRound(){ const id=Date.now(); if (room) room.presence({race:id,md:MODE}).catch(()=>{}); beginRace(id,null,MODE); }
$("raceBtn").addEventListener("click",e=>{ e.currentTarget.blur(); startRound(); });
let plKey="";
// live standings: a strip at the top (leader, you, whoever is close) and a Mario Kart style position badge
const ordinal=n=>n+(n%100>=11&&n%100<=13?"th":["th","st","nd","rd"][n%10]||"th");
let ribbonKey="";
function renderRibbon(){
  const rows=standings(), show=rows.length>1 && running;
  $("ribbon").hidden=$("rank").hidden=!show; if (!show){ ribbonKey=""; return; }
  const mi=rows.findIndex(r=>r.me), me=rows[mi];
  // ties share a place
  const place=i=>1+rows.findIndex(r=>r.score===rows[i].score && (r.t??1e9)===(rows[i].t??1e9));
  let pick=[0,1,2].filter(i=>i<rows.length); if (!pick.includes(mi)){ pick=[0,mi-1,mi].filter((x,j,a)=>x>=0 && a.indexOf(x)===j); }
  const key=pick.map(i=>rows[i].name+rows[i].score+"|"+place(i)).join(",")+"#"+mi+"/"+rows.length; if (key===ribbonKey) return; ribbonKey=key;
  $("ribbon").replaceChildren(...pick.map(i=>{ const r=rows[i], d=document.createElement("div"); d.className=(r.me?"me ":"")+(place(i)===1?"lead":"");
    const em=document.createElement("em"); em.textContent=ordinal(place(i)); const dot=document.createElement("i"); dot.style.background=r.color||"#c9d3df";
    const n=document.createElement("span"); n.textContent=r.me?"You":r.name; const b=document.createElement("b"); b.textContent=r.score+(r.fin?"★":"");
    d.append(em,dot,n,b);
    if (!r.me){ const g=r.score-me.score, sm=document.createElement("small"); sm.textContent=g===0?"tied":(g>0?"+"+g:String(g)); sm.className=g>0?"behind":g<0?"ahead":""; d.append(sm); }
    return d; }));
  const pos=place(mi); $("rankPos").textContent=ordinal(pos); const best=Math.max(...rows.filter(r=>!r.me).map(r=>r.score)), gap=me.score-best;
  $("rankOf").textContent="of "+rows.length+(gap>0?` · ${gap} ahead`:gap<0?` · ${-gap} behind`:" · tied");
  $("rank").className="rank "+(pos===1?"":pos===2?"p2":pos===3?"p3":"pn");
}
function renderPlayers(){
  const panel=$("players");
  if (!avatars.size && !botAvatars.size){ panel.hidden=true; plKey=""; return; }
  panel.hidden=false;
  const rows=[{name:myName()+" (you)",color:"#7ce0ff",s:got,t:elapsed,rs:runState,me:1,dk:dunks}];
  for (const a of avatars.values()){ const ps=a.pres||{}; rows.push({name:a.name+(ps.ps?" · paused":""),color:a.color,s:Number(ps.s)||0,t:Number(ps.t)||0,rs:String(ps.rs||""),dk:Math.max(0,Number(ps.dk)||0)}); }
  for (const a of botAvatars.values()) rows.push({name:"Bot "+a.name,color:a.color,s:a.sparks||0,t:0,rs:"",dk:a.dunks||0,bot:1});
  if (MODE==="sumo") rows.sort((x,y)=>y.dk-x.dk); else rows.sort((x,y)=>y.s-x.s || x.t-y.t || y.dk-x.dk);
  const key=MODE+rows.map(r=>r.name+r.s+Math.floor(r.t)+r.rs+"d"+r.dk).join("|"); if (key===plKey) return; plKey=key;
  $("plCount").textContent=(rows.length-botAvatars.size)+" players"+(botAvatars.size?" · "+botAvatars.size+" bots":"");
  $("plList").replaceChildren(...rows.map(r=>{ const d=document.createElement("div"); d.className="pl"+(r.me?" me":"");
    const dot=document.createElement("i"); dot.style.background=r.color; const n=document.createElement("span"); n.textContent=r.name;
    const sc=document.createElement("span"); sc.textContent= MODE==="sumo" ? (r.dk||0)+" KO"+(r.dk===1?"":"s") : r.s+"/"+TOTAL+(r.dk?" · "+r.dk+" dunk"+(r.dk>1?"s":""):""); const tm=document.createElement("small"); tm.textContent = r.rs==="done" ? fmtT(r.t) : r.rs==="running" ? fmt(r.t) : "–";
    d.append(dot,n,sc,tm); return d; }));
}
addEventListener("resize",()=>{ renderer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); if (composer) composer.setSize(innerWidth,innerHeight); });
// bloom: load three.js post-processing add-ons; if they can't load, the game renders normally
let composer=null, aoOn=false, shafts=null; const sunNdc=new THREE.Vector3();
if (GFX_SET.bloom>0){
  Promise.all([import("three/addons/postprocessing/EffectComposer.js"),import("three/addons/postprocessing/RenderPass.js"),import("three/addons/postprocessing/UnrealBloomPass.js"),import("three/addons/postprocessing/OutputPass.js"),
      GFX==="high" ? import("three/addons/postprocessing/GTAOPass.js").catch(()=>null) : Promise.resolve(null),
      GFX==="high" ? import("three/addons/postprocessing/ShaderPass.js").catch(()=>null) : Promise.resolve(null)])
    .then(([{EffectComposer},{RenderPass},{UnrealBloomPass},{OutputPass},gtao,shp])=>{
      const rt=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:GFX==="high"?4:0});
      const c=new EffectComposer(renderer,rt); c.setPixelRatio(renderer.getPixelRatio()); c.setSize(innerWidth,innerHeight);
      c.addPass(new RenderPass(scene,camera));
      // ambient occlusion at High only: soft contact shading where things meet (too heavy for tablets)
      if (gtao && gtao.GTAOPass){ try{ const ao=new gtao.GTAOPass(scene,camera,innerWidth,innerHeight); const ov=ao.overrideVisibility.bind(ao);
        // see-through glows (beams, searchlights, splashes) shouldn't cast occlusion; the pass only skips points and lines
        ao.overrideVisibility=function(){ ov(); scene.traverse(o=>{ if (o.visible && (o.isSprite || (o.isMesh && o.material && o.material.transparent && o.material.depthWrite===false))) o.visible=false; }); }; ao.updateGtaoMaterial({radius:1.6,distanceExponent:1.2,thickness:2,scale:1.1,samples:12}); ao.blendIntensity=.85; c.addPass(ao); aoOn=true; }catch(e){ aoOn=false; } }
      const night=MAP.theme.night||MAP.theme.waterGlow;
      const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth*GFX_SET.bloom,innerHeight*GFX_SET.bloom), night?.85:.45, .5, night?.6:.9);
      c.addPass(bloom);
      // light shafts at High: streak the bright sky around the sun outward; anything in front of the sun blocks them
      if (shp && shp.ShaderPass && !MAP.theme.night){ try{ shafts=new shp.ShaderPass({
        uniforms:{tDiffuse:{value:null},sunPos:{value:new THREE.Vector2(.5,.5)},amount:{value:0},tint:{value:new THREE.Color(MAP.theme.sun[0])}},
        vertexShader:"varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader:`uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float amount; uniform vec3 tint; varying vec2 vUv;
          void main(){ vec4 base=texture2D(tDiffuse,vUv); if (amount<.001){ gl_FragColor=base; return; }
            vec2 d=(vUv-sunPos)*(.9/40.0); float j=fract(sin(dot(vUv,vec2(12.9898,78.233)))*43758.5453); vec2 uv=vUv-d*j; float decay=1.0; vec3 acc=vec3(0.0);
            for (int i=0;i<40;i++){ uv-=d; vec3 sm=texture2D(tDiffuse,clamp(uv,0.0,1.0)).rgb; float l=max(0.0,dot(sm,vec3(.299,.587,.114))-.85); acc+=sm*l*decay; decay*=.96; }
            gl_FragColor=vec4(base.rgb+acc*tint*amount*.13,base.a); }`}); c.addPass(shafts); }catch(e){ shafts=null; } }
      c.addPass(new OutputPass());
      composer=c;
    }).catch(()=>{ composer=null; });
}
{ const o=settings, bind=(id,key,conv=v=>v)=>{ const el=$(id); if (el.type==="checkbox") el.checked=!!o[key]; else el.value=String(o[key]);
    el.addEventListener(el.type==="range"?"input":"change",async()=>{ o[key]=conv(el.type==="checkbox"?el.checked:el.value);
      if (key==="gyro" && o.gyro && !(await enableGyro())){ o.gyro=false; el.checked=false; }
      if (key==="sens") $("sensVal").textContent=(+o.sens).toFixed(1)+"×";
      saveSettings(); applyInputUI(); }); };
  bind("optControls","controls"); bind("optUnits","units"); bind("optAnnouncer","announcer"); bind("optAssist","assist",Number); bind("optSens","sens",Number); bind("optHud","hud"); bind("optGyro","gyro"); bind("optGyroInv","gyroInv");
  $("sensVal").textContent=(+o.sens).toFixed(1)+"×"; }
{ const sel=$("optMode"); sel.value=MODE; sel.addEventListener("change",()=>{ setMode(sel.value); restartRun(); toast(MODE==="sumo"?"Sumo mode":"Spark race", MODE==="sumo"?"Knock everyone into the sea. Press Play or Start round.":"Collect sparks. The final spark ends the race."); }); }
{ const sel=$("optDeath"); sel.value=String(DEATH_SECS); if (sel.value!==String(DEATH_SECS)) sel.value="10"; sel.addEventListener("change",()=>{ DEATH_SECS=+sel.value; try{ localStorage.setItem("skyhook.deathcam",sel.value); }catch(e){} }); }
$("deathGo").addEventListener("click",e=>{ e.preventDefault(); respawn(null); });
{ const sel=$("optGfx"); sel.value=GFX; sel.addEventListener("change",()=>{ try{ localStorage.setItem("skyhook.gfx",sel.value); }catch(e){} location.reload(); }); }
// interpolated poses start at the origin until the first physics step
for (const b of world.bodies){ b.interpolatedPosition.copy(b.position); b.interpolatedQuaternion.copy(b.quaternion); }
// small hook for automated testing; not used by the game itself
window.__skyDebug={ gliderPickupsList:()=>gliderPickups, renderInfo:()=>({calls:renderer.info.render.calls,tris:renderer.info.render.triangles,meshes:(()=>{ let n=0; scene.traverse(o=>{ if(o.isMesh) n++; }); return n; })()}), headlessStart:(nBots=1)=>{ simFrozen=true; wantBots=nBots; running=true; $("start").hidden=true; for (const C of CHARACTERS) introSeen.add(C.key); introQ.length=0; }, botItems:(b,dt)=>botItems(b,dt), gfx:()=>({GFX,composer:!!composer,ao:aoOn,shafts:!!shafts}), giveItem:k=>{ heldItem=k; }, useItem:()=>useItem(), item:()=>({heldItem,shieldT,magnetT,lastBoom}), towers:()=>towers.map(t=>t.chunks.filter(c=>c.alive).length), towersAt:i=>({x:towerSpots[i].x,y:towerSpots[i].g,z:towerSpots[i].z}), explodeAt:(x,y,z)=>explode(x,y,z,7,1,null,true), itemBoxes, faceSheet:()=>{ const out=[]; for (const C of [CLASSIC,...CHARACTERS]) for (const m of ["idle","grin","ow","panic","dizzy","thrill"]){ drawFace(C,m,false); out.push($("face").toDataURL()); } return out; }, face:()=>({mood:faceMood}), hurt:()=>{ faceHurtT=1.2; }, calm:()=>{ faceHurtT=faceHappyT=faceDizzyT=0; shieldT=0; magnetT=0; }, cupAwards:()=>cupAwards(), showCupFinal:()=>showCupFinal(cupDef()), forceRaceEnd:()=>{ raceCount=0; raceLive=true; raceOver=false; endRace(standings()); }, cup:()=>cup, restartRun:()=>restartRun(), setBotParams:(k,o)=>{ BOT_PARAMS[k]=o; }, getBotParams:()=>JSON.parse(JSON.stringify(BOT_PARAMS)), botRace:(b,dt)=>botRace(b,dt), anchors:()=>ANCHORS, chat:()=>({lastChat,lastBchat,log:[...$("chatlog").children].map(d=>d.textContent)}), sendChatText:t=>{ $("chatIn").value=t; sendChat(); }, setSample:f=>{ sampleFn=f; }, CHARACTERS, intro:()=>({showing:introCh,queue:introQ.slice(),seen:[...introSeen]}), race:()=>({raceCount,raceId,raceLive,raceOver,slowmo:!!slowmo,timeScale:lastTimeScale,seen:[...raceSeen]}), bots:()=>bots, botAvatars, hitBot, ctrl:()=>amController, attack, takeHit, batPickups, bat:()=>batTime, audio:()=>({ctx:!!ac,state:ac&&ac.state,musicOn,step:mStep}), presence:()=>({lastHit,lastSplash,dunks}), avatars, net:()=>({room:!!room,myPeer}), keys, tick:(n=1)=>{ for(let i=0;i<n;i++){ controls(1/60); world.step(1/60,1/60,1); updateBots(1/60); for (const g of [...gliderPickups,...batPickups]) if (g.cd>0) g.cd-=1/60; for (const b of itemBoxes) if (b.cd>0) b.cd-=1/60; } }, ground:()=>({standing,onGround}), probe:p=>groundBelow(p), body:pBody, pillars, rocks, sparks, gliderPickups, glide:()=>({gliding,gliderTime}), view:(y,pt)=>{ yaw=y; pitch=pt; }, hook:()=>hook&&hook.phase, aim:()=>aimHit&&aimHit.distance, grounded:()=>grounded, speedText:()=>[$("speed").textContent,$("speedLbl").textContent], setClock:(t)=>setClock($("timer"),t), rules:()=>({...RULES,ROUND_TIME,SUMO_TIME,SUMO_KOS,MODE}), customDraft:()=>customDraft, setPull:v=>{ pullHeld=v; }, ropeStep:dt=>ropeStep(dt), setHook:h=>{ hook=h; }, edgeFrom:(x,z)=>edgeFrom(x,z), botThink:(b,dt)=>botThink(b,dt), mapInfo:()=>({key:MAP.key,sumoOnly:!!MAP.sumoOnly}), pickFrenchVoice, mode:()=>MODE, setMode:m=>setMode(m), startRound:()=>startRound(), checkRaceEnd:()=>checkRaceEnd(), sniper:()=>({spinAcc,sniperCharge,held:heldItem}), traps, projectiles, sunDir:SUN_DIR, camInfo:()=>({cam:camera.position.toArray().map(n=>+n.toFixed(2)),body:pBody.position.toArray().map(n=>+n.toFixed(2)),flashT,hemi:hemi.intensity,camCur}), triggerTrap:(i,n)=>triggerTrap(i,{peer:'x',name:n||'Tester'},true), meMag, yeet:b=>yeet(b), thrown, dynamics, finale, spawnFinale:(x,y,z,by)=>spawnFinale(new THREE.Vector3(x,y,z),by||myName(),true), finaleSpot:p=>finaleSpot(p), grabFinale:n=>grabFinale(n,true), resetFinale:()=>resetFinale(), finaleGrp, searchlights, standings:()=>standings(), settings, applyInputUI, setInput:t=>setInput(t), inputTouch:()=>isTouch, castAim:d=>castAim(d), assistAim:(d,l)=>assistAim(d,l), tapHook:(x,y)=>tapHook(x,y), camera, camTarget, hand, hookUp:()=>hookUp(), death:()=>({deadT,DEATH_SECS}), respawnNow:()=>respawn(null), setDeathSecs:n=>{ DEATH_SECS=n; }, stats:()=>JSON.parse(JSON.stringify(stats)), drops:()=>drops.length, groundPunch:b=>groundPunch(b), setOnGround:v=>{ onGround=v; } };
frame();
