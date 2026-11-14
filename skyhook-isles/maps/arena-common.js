// Shared pieces for the sumo arenas: grapple posts out in the sea, floating rocks overhead, a storm-horn trap.
export function arenaExtras(api,{posts,postR,rockR,rockY,hornAt,gustDir,tint}){
  const {THREE,CANNON,scene,world,R,H,groundMat,grappleables,camBlockers,pillars,rocks,traps,trapTrigger}=api;
  const stone=new THREE.MeshStandardMaterial({color:tint||"#8a8f9a",roughness:.8,flatShading:true});
  const band=new THREE.MeshStandardMaterial({color:"#ffd020",roughness:.5});
  // tall posts standing in the sea: grapple one to swing back after a knock-off
  for (let i=0;i<posts;i++){
    const a=i/posts*Math.PI*2+.3, x=Math.cos(a)*postR, z=Math.sin(a)*postR, base=-7, ht=22+R()*6;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.2,ht,8),stone); m.position.set(x,base+ht/2,z); m.castShadow=true; scene.add(m);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.25,.5,8),band); cap.position.set(x,base+ht+.25,z); scene.add(cap);
    grappleables.push(m,cap); camBlockers.push(m);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Cylinder(1.1,1.1,ht,8)); b.position.set(x,base+ht/2,z); world.addBody(b);
    pillars.push({x,z,top:base+ht+.5,w:1.2});
  }
  // floating rocks overhead
  for (let i=0;i<6;i++){
    const a=i/6*Math.PI*2, x=Math.cos(a)*rockR, z=Math.sin(a)*rockR, y=rockY+R()*5, r=1.8+R();
    const m=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),stone); m.position.set(x,y,z); m.castShadow=true; scene.add(m); grappleables.push(m); camBlockers.push(m);
    const b=new CANNON.Body({mass:0,material:groundMat}); b.addShape(new CANNON.Sphere(r*.9)); b.position.set(x,y,z); world.addBody(b);
    rocks.push({x,y,z,r,top:y+r*.8});
  }
  if (traps && trapTrigger) traps.push({kind:"gust",triggers:[trapTrigger(hornAt.x,hornAt.z,"#7cd8ff",2.4)],dir:gustDir,dur:5,cool:20,name:"Storm horn"});
}
// red-and-white warning stripes near an edge
export function edgeColor(c,P,edgeDist,x,z){ if (edgeDist<1.6) c.copy(((Math.floor((x+z)*.7)%2)+2)%2 ? P.red : P.white); }
