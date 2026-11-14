// Shared helpers for every map: seeded random numbers, value noise and easing.
export function rng(a){ return () => { a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export function hash(x,y){ let h=Math.imul(x|0,374761393)+Math.imul(y|0,668265263)|0; h=Math.imul(h^(h>>>13),1274126177); h^=h>>>16; return (h>>>0)/4294967295; }
export function vnoise(x,y){ const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi, u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const a=hash(xi,yi), b=hash(xi+1,yi), c=hash(xi,yi+1), d=hash(xi+1,yi+1); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
export function fbm(x,y){ let s=0,a=.5,f=1; for(let i=0;i<5;i++){ s+=a*vnoise(x*f,y*f); f*=2.03; a*=.5; } return s/.97; }
export const smooth=(a,b,x)=>{ const t=Math.min(1,Math.max(0,(x-a)/(b-a))); return t*t*(3-2*t); };
export const lerp=(a,b,t)=>a+(b-a)*t;
