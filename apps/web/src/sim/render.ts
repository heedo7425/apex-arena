// Canvas render for the sim viewport — reads the core World + CarState (proven draw code).
import type { World, CarState, Scan } from '@apex/core'

export type Cam = { minx:number; miny:number; maxx:number; maxy:number; s:number; slant:number; zk:number; ox:number; oy:number }
const LIGHT = [-0.5, -0.7, 0.6]

export function computeCam(world: World, CW: number, CH: number): Cam {
  const T = world.track
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9
  for (let i=0;i<T.N;i++){const p=T.pts[i];if(p[0]<minx)minx=p[0];if(p[0]>maxx)maxx=p[0];if(p[1]<miny)miny=p[1];if(p[1]>maxy)maxy=p[1]}
  const pad=13; minx-=pad;maxx+=pad;miny-=pad;maxy+=pad
  const slant=0.80, sx=CW/(maxx-minx), sy=CH/((maxy-miny)*slant), s=Math.min(sx,sy)*0.96
  return {minx,miny,maxx,maxy,s,slant,zk:s*1.15,ox:(CW-(maxx-minx)*s)/2,oy:(CH-(maxy-miny)*s*slant)/2+18}
}
function W2S(cam:Cam,x:number,y:number,z:number){return [cam.ox+(x-cam.minx)*cam.s, cam.oy+(y-cam.miny)*cam.s*cam.slant-(z||0)*cam.zk] as const}
function shade(world:World,x:number,y:number,base:number[]){
  const g=world.height.grad(x,y),nrm=[-g[0],-g[1],1],nl=Math.hypot(nrm[0],nrm[1],nrm[2])
  const d=(nrm[0]*LIGHT[0]+nrm[1]*LIGHT[1]+nrm[2]*LIGHT[2])/nl, lit=0.45+0.85*Math.max(0,d)
  const f=(world.height.at(x,y)-world.height.zlo)/((world.height.zhi-world.height.zlo)||1), m=lit*(0.82+f*0.5)
  return `rgb(${Math.round(base[0]*m)},${Math.round(base[1]*m)},${Math.round(base[2]*m)})`
}
export function buildTerrain(world:World, CW:number, CH:number): HTMLCanvasElement {
  const cam=computeCam(world,CW,CH)
  const oc=document.createElement('canvas'); oc.width=CW; oc.height=CH; const o=oc.getContext('2d')!
  o.fillStyle='#0c1620'; o.fillRect(0,0,CW,CH); const st=2.4, base=[46,62,74]
  for(let gx=cam.minx;gx<cam.maxx;gx+=st)for(let gy=cam.miny;gy<cam.maxy;gy+=st){
    const a=W2S(cam,gx,gy,world.height.at(gx,gy)),b=W2S(cam,gx+st,gy,world.height.at(gx+st,gy)),c=W2S(cam,gx+st,gy+st,world.height.at(gx+st,gy+st)),d=W2S(cam,gx,gy+st,world.height.at(gx,gy+st))
    o.beginPath();o.moveTo(a[0],a[1]);o.lineTo(b[0],b[1]);o.lineTo(c[0],c[1]);o.lineTo(d[0],d[1]);o.closePath();o.fillStyle=shade(world,gx+st/2,gy+st/2,base);o.fill()
  }
  return oc
}
function rr(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}

export function renderSim(ctx:CanvasRenderingContext2D, world:World, car:CarState, scan:Scan|null, gapBeam:number|null, cam:Cam, terrain:HTMLCanvasElement|null){
  const CW=ctx.canvas.width, CH=ctx.canvas.height, T=world.track, H=world.height
  if(terrain) ctx.drawImage(terrain,0,0); else {ctx.fillStyle='#0c1620';ctx.fillRect(0,0,CW,CH)}
  // ribbon (verge + asphalt)
  const ribbon=(hw:number,col:(x:number,y:number)=>string,dz:number)=>{for(let i=0;i<T.N;i++){const j=(i+1)%T.N,pi=T.pts[i],pj=T.pts[j],ni=T.nrm[i],nj=T.nrm[j],zi=H.at(pi[0],pi[1])+dz,zj=H.at(pj[0],pj[1])+dz
    const a=W2S(cam,pi[0]+ni[0]*hw,pi[1]+ni[1]*hw,zi),b=W2S(cam,pi[0]-ni[0]*hw,pi[1]-ni[1]*hw,zi),c=W2S(cam,pj[0]-nj[0]*hw,pj[1]-nj[1]*hw,zj),d=W2S(cam,pj[0]+nj[0]*hw,pj[1]+nj[1]*hw,zj)
    ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.lineTo(d[0],d[1]);ctx.closePath();ctx.fillStyle=col(pi[0],pi[1]);ctx.fill()}}
  ribbon(T.half+1.3,()=>'rgba(20,28,36,.9)',0.05)
  ribbon(T.half,(x,y)=>shade(world,x,y,[43,55,66]),0.1)
  // curbs
  for(let i=0;i<T.N;i++){if(Math.abs(T.curv[i])<0.03)continue;const side=T.curv[i]>0?1:-1,p=T.pts[i],nr=T.nrm[i],ex=p[0]+nr[0]*T.half*side,ey=p[1]+nr[1]*T.half*side,s=W2S(cam,ex,ey,H.at(ex,ey)+0.15);ctx.fillStyle=(i%2===0)?'#D0443B':'#E6E9EC';ctx.fillRect(s[0]-2.5,s[1]-2.5,5,5)}
  // racing line (centerline)
  ctx.beginPath();for(let i=0;i<=T.N;i++){const idx=i%T.N,p=T.pts[idx],s=W2S(cam,p[0],p[1],H.at(p[0],p[1])+0.15);i===0?ctx.moveTo(s[0],s[1]):ctx.lineTo(s[0],s[1])}ctx.strokeStyle='#E7B24C';ctx.globalAlpha=0.4;ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha=1
  // scan
  if(scan){const o=W2S(cam,car.x,car.y,car.nz)
    for(let b=0;b<scan.ranges.length;b++){const ang=car.yaw+scan.a0+b*scan.da,r=scan.ranges[b],ex=car.x+Math.cos(ang)*r,ey=car.y+Math.sin(ang)*r,e=W2S(cam,ex,ey,H.at(ex,ey)+0.2);ctx.strokeStyle='rgba(31,221,201,.20)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(o[0],o[1]);ctx.lineTo(e[0],e[1]);ctx.stroke();ctx.fillStyle='rgba(31,221,201,.5)';ctx.beginPath();ctx.arc(e[0],e[1],2,0,7);ctx.fill()}
    if(gapBeam!=null){const ang=car.yaw+scan.a0+gapBeam*scan.da,r=scan.ranges[gapBeam],ex=car.x+Math.cos(ang)*r,ey=car.y+Math.sin(ang)*r,e=W2S(cam,ex,ey,H.at(ex,ey)+0.3);ctx.strokeStyle='#E7B24C';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(o[0],o[1]);ctx.lineTo(e[0],e[1]);ctx.stroke();ctx.fillStyle='#E7B24C';ctx.beginPath();ctx.arc(e[0],e[1],5,0,7);ctx.fill()}}
  // car + shadow
  const s=W2S(cam,car.x,car.y,car.nz),len=2.5*cam.s,wid=1.35*cam.s
  ctx.globalAlpha=0.4;ctx.fillStyle='#04090d';ctx.beginPath();ctx.ellipse(s[0],s[1]+wid*0.32,wid*0.7,wid*0.4,0,0,7);ctx.fill();ctx.globalAlpha=1
  ctx.save();ctx.translate(s[0],s[1]);ctx.rotate(car.yaw);ctx.fillStyle='#1FDDC9';rr(ctx,-len/2,-wid/2,len,wid,wid*0.4);ctx.fill();ctx.fillStyle='rgba(4,35,31,.55)';rr(ctx,len*0.02,-wid*0.32,len*0.34,wid*0.64,2);ctx.fill();ctx.restore()
  // spot height
  ctx.fillStyle='rgba(200,240,233,.7)';ctx.font='600 20px ui-monospace,monospace';const hp=W2S(cam,84,38,H.at(84,38));ctx.fillText('▲ '+H.at(84,38).toFixed(0)+' m',hp[0]-22,hp[1]-14)
}
