// Node registry: L0 primitives, L1 standard library, sources/sinks,
// plus reserved hooks (rng.uniform, sim.predict) for MPPI/MPC/RL.
import { type NodeDef, type EvalCtx, type Graph, evalGraph } from './engine.ts';
import { nearestIndex, curvAheadAt, G } from '../sim/world.ts';
import { stepDynamics } from '../sim/vehicle.ts';
import { uniform, gaussian } from '../rng.ts';

function argmaxArr(a: number[]): number { let bi = 0, bv = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > bv) { bv = a[i]; bi = i; } return bi; }

export const NT: Record<string, NodeDef> = {
  // ---- sources (read observation) ----
  'src.scan':  { kind:'source', cat:'Sensors', outs:['ranges','a0','da'], fn:(i,p,s,c)=>{ const sc:any=c.obs.scan; return { ranges:sc.ranges, a0:sc.a0, da:sc.da }; } },
  'src.speed': { kind:'source', cat:'Sensors', outs:['v'], fn:(i,p,s,c)=>({ v:c.obs.speed }) },
  'src.pose':  { kind:'source', cat:'Sensors', outs:['pose'], fn:(i,p,s,c)=>({ pose:c.obs.pose }) },
  'src.track': { kind:'source', cat:'Sensors', outs:['track'], fn:(i,p,s,c)=>({ track:c.obs.track }) },

  // ---- L0 primitives: math ----
  'const': { kind:'prim', cat:'Math', outs:['v'], fn:(i,p)=>({ v:p.value }) },
  'add': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a+i.b }) },
  'sub': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a-i.b }) },
  'mul': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a*i.b }) },
  'div': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a/(i.b||1e-6) }) },
  'abs': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i)=>({ v:Math.abs(i.x) }) },
  'clamp': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i,p)=>({ v:Math.max(p.lo,Math.min(p.hi,i.x)) }) },

  // ---- L0 primitives: logic ----
  'lt': { kind:'prim', cat:'Logic', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a<i.b }) },
  'select': { kind:'prim', cat:'Logic', ins:['c','a','b'], outs:['v'], fn:(i)=>({ v:i.c?i.a:i.b }) },

  // ---- L0 primitives: array & iteration (higher-order) ----
  'arg': { kind:'prim', cat:'Array', outs:['v'], fn:(i,p,s,c)=>({ v:c.__arg }) },
  'array.map': { kind:'higher', cat:'Array', ins:['arr'], outs:['v'], fn:(i,p,s,c)=>{
    const lam:Graph=p.lambda, out:any[]=[], saved=c.__arg;
    for (let k=0;k<i.arr.length;k++){ c.__arg=i.arr[k]; const v=evalGraph(lam,c,NT); out.push(v[lam.outNode!][lam.outPort!]); }
    c.__arg=saved; return { v:out };
  } },
  'array.argmax': { kind:'prim', cat:'Array', ins:['arr'], outs:['i'], fn:(i)=>({ i:argmaxArr(i.arr) }) },
  'array.len': { kind:'prim', cat:'Array', ins:['arr'], outs:['v'], fn:(i)=>({ v:i.arr.length }) },
  'array.max': { kind:'prim', cat:'Array', ins:['arr'], outs:['v'], fn:(i)=>({ v:Math.max.apply(null,i.arr) }) },

  // ---- L1 standard library (shipped composites; here as builtins for now) ----
  'std.lookahead': { kind:'std', cat:'Geometry', ins:['pose','track','Ld'], outs:['pt','idx'], fn:(i,p,s,c)=>{
    const T=c.world.track, idx=nearestIndex(T,i.pose.x,i.pose.y,undefined).i, steps=Math.max(1,Math.round(i.Ld/T.spacing)), t=(idx+steps)%T.N;
    return { pt:{x:T.pts[t][0],y:T.pts[t][1]}, idx };
  } },
  'std.tocar': { kind:'std', cat:'Geometry', ins:['pt','pose'], outs:['e'], fn:(i)=>{
    const dx=i.pt.x-i.pose.x, dy=i.pt.y-i.pose.y, cs=Math.cos(i.pose.yaw), sn=Math.sin(i.pose.yaw);
    return { e:{ x:cs*dx+sn*dy, y:-sn*dx+cs*dy } };
  } },
  'std.pursuitCurv': { kind:'std', cat:'Control', ins:['e'], outs:['k'], fn:(i)=>{ const Ld=Math.max(1,Math.hypot(i.e.x,i.e.y)); return { k:2*i.e.y/(Ld*Ld) }; } },
  'std.steerFromCurv': { kind:'std', cat:'Control', ins:['k','gain'], outs:['steer'], fn:(i,p,s,c)=>{
    const L=c.world.vp.L, MS=c.world.vp.MAXSTEER; return { steer:Math.max(-1,Math.min(1,Math.atan(L*i.k)*i.gain/MS)) };
  } },
  'std.curvAhead': { kind:'std', cat:'Geometry', ins:['pose','track'], outs:['k'], fn:(i,p,s,c)=>{
    const idx=nearestIndex(c.world.track,i.pose.x,i.pose.y,undefined).i; return { k:curvAheadAt(c.world.track,idx,18) };
  } },
  'std.gripSpeed': { kind:'std', cat:'Planning', ins:['k'], outs:['v'], fn:(i,p,s,c)=>({ v:Math.min(p.vmax,Math.sqrt(c.world.mu*G/Math.max(i.k,0.004))*p.margin) }) },
  'ctrl.pid': { kind:'std', cat:'Control', ins:['err'], outs:['u'], fn:(i,p,s)=>{
    s.int=Math.max(-6,Math.min(6,(s.int||0)+i.err*(1/120))); const d=(i.err-(s.prev||0))*120; s.prev=i.err;
    return { u:p.kp*i.err + (p.ki||0)*s.int + (p.kd||0)*d };
  } },

  // ---- hooks (reserved for MPPI/MPC/RL) ----
  'rng.uniform': { kind:'prim', cat:'Random', ins:['lo','hi'], outs:['v'], fn:(i,p,s,c)=>({ v:uniform(c.rng, i.lo??0, i.hi??1) }) },
  'rng.gauss':   { kind:'prim', cat:'Random', outs:['v'], fn:(i,p,s,c)=>({ v:gaussian(c.rng) }) },
  // model-as-node: predict next (x,y,speed) given a control from the CURRENT car state
  'sim.predict': { kind:'builtin', cat:'Model', ins:['steer','throttle'], outs:['x','y','v'], fn:(i,p,s,c)=>{
    const nx=stepDynamics(c.car, { steer:i.steer, throttle:i.throttle }, c.world, c.dt); return { x:nx.x, y:nx.y, v:nx.vx };
  } },

  // ---- sinks (write command) ----
  'sink.steer':    { kind:'sink', cat:'Output', ins:['x'], fn:(i,p,s,c)=>{ c.cmd.steer=i.x; return {}; } },
  'sink.throttle': { kind:'sink', cat:'Output', ins:['x'], fn:(i,p,s,c)=>{ c.cmd.throttle=i.x; return {}; } },
};
