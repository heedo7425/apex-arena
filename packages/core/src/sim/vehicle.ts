// Dynamic single-track vehicle model — pure function (hook #2: model-as-node,
// so MPPI/MPC can roll it out from inside a graph). Verified physics ported.
import { type World, nearestIndex, G, DT } from './world.ts';
import { pointInBox, boxForObject } from './collision.ts';

import type { SceneObject } from '../planning/types.ts';
export type CarState = {
  x: number; y: number; yaw: number;
  vx: number; vy: number; r: number; delta: number;
  idx: number; onTrack: boolean; nz: number; grade: number; beta: number; slipSat: number;
  v: number; prevProg: number;
  groundSpeed?: number; // physics v2: ground-speed magnitude (v stays longitudinal vx)
};
export type Control = { steer: number; throttle: number }; // both in [-1,1]

export function initCar(world: World): CarState {
  const p = world.track.pts[0], t = world.track.tan[0];
  return {
    x: p[0], y: p[1], yaw: Math.atan2(t[1], t[0]),
    vx: 0, vy: 0, r: 0, delta: 0,
    idx: 0, onTrack: true, nz: world.height.at(p[0], p[1]), grade: 0, beta: 0, slipSat: 0,
    v: 0, prevProg: 0, groundSpeed: 0,
  };
}

const clampAbs = (x: number, l: number) => (x > l ? l : x < -l ? -l : x);

// One physics tick. Returns a NEW state (pure — reusable for real sim AND rollout).
export function stepDynamics(car: CarState, u: Control, world: World, dt: number = DT): CarState {
  const vp = world.vp, T = world.track;
  const near = nearestIndex(T, car.x, car.y, car.idx);
  const idx = near.i;
  // steering actuator (rate-limited)
  const tgtDelta = Math.max(-1, Math.min(1, u.steer)) * vp.MAXSTEER;
  const delta = car.delta + clampAbs(tgtDelta - car.delta, vp.MAXSTEERVEL * dt);
  const thr = Math.max(-1, Math.min(1, u.throttle));
  const Fx = thr > 0 ? thr * vp.FXDRIVE : thr * vp.FXBRAKE, FxF = Fx*0.35, FxR = Fx*0.65;
  // terrain
  const gr = world.height.grad(car.x, car.y), ch = Math.cos(car.yaw), sh = Math.sin(car.yaw);
  const gradeAlong = gr[0]*ch + gr[1]*sh, bankLat = gr[0]*(-sh) + gr[1]*ch, slope = Math.hypot(gr[0], gr[1]);
  const cosS = 1 / Math.sqrt(1 + slope*slope);
  const onTrack = near.dist <= T.half, mu = onTrack ? world.mu : world.muGrass;
  const Fz = vp.M*G*cosS, axc = Fx/vp.M;
  const Fzf = Math.max(50, Fz*vp.LR/vp.L - vp.M*axc*vp.HCG/vp.L), Fzr = Math.max(50, Fz*vp.LF/vp.L + vp.M*axc*vp.HCG/vp.L);
  const vabs = Math.abs(car.vx), blend = Math.max(0, Math.min(1, (vabs-1.2)/2.0));
  const af = delta - Math.atan2(car.vy + vp.LF*car.r, Math.max(0.6, vabs));
  const ar = -Math.atan2(car.vy - vp.LR*car.r, Math.max(0.6, vabs));
  const FyfMax = Math.sqrt(Math.max(0, (mu*Fzf)*(mu*Fzf) - FxF*FxF)), FyrMax = Math.sqrt(Math.max(0, (mu*Fzr)*(mu*Fzr) - FxR*FxR));
  const Fyf = clampAbs(vp.CF*af, FyfMax), Fyr = clampAbs(vp.CR*ar, FyrMax);
  const slipSat = Math.max(Math.abs(vp.CF*af)/(FyfMax||1), Math.abs(vp.CR*ar)/(FyrMax||1));
  const vxdot = (Fx - Fyf*Math.sin(delta))/vp.M + car.vy*car.r - G*gradeAlong - (vp.DRAGC*car.vx*vabs + vp.ROLL*Math.sign(car.vx))/vp.M;
  const vydot = (Fyf*Math.cos(delta) + Fyr)/vp.M - car.vx*car.r + G*bankLat*cosS;
  const rdot = (vp.LF*Fyf*Math.cos(delta) - vp.LR*Fyr)/vp.IZ;
  const rKin = car.vx*Math.tan(delta)/vp.L, vyKin = rKin*vp.LR;
  const vx = Math.max(0, car.vx + vxdot*dt);
  const rr = blend*(car.r + rdot*dt) + (1-blend)*rKin;
  const vy = blend*(car.vy + vydot*dt) + (1-blend)*vyKin;
  const yaw = car.yaw + rr*dt;
  const x = car.x + (vx*ch - vy*sh)*dt, y = car.y + (vx*sh + vy*ch)*dt;
  return {
    x, y, yaw, vx, vy, r: rr, delta, idx,
    onTrack, nz: world.height.at(x, y), grade: gradeAlong,
    beta: Math.atan2(vy, Math.max(0.3, vx)), slipSat, v: vx, prevProg: car.prevProg,
  };
}

// Physics v2 (opt-in). Corrects the v1 issues from design/physics-audit-v1.md:
//  1) per-axle longitudinal force clamped to mu*Fz, 2) lateral capacity from the
//  remaining combined-slip budget, 3) gravity pulls DOWNHILL with a consistently
//  normalized road tangent for both grade and bank, 4) track/terrain observations
//  recomputed from the post-integration pose. Adds ground-speed magnitude. Pure/deterministic.
export function stepDynamicsV2(car: CarState, u: Control, world: World, dt: number = DT): CarState {
  const vp = world.vp, T = world.track;
  const near = nearestIndex(T, car.x, car.y, car.idx);
  const tgtDelta = Math.max(-1, Math.min(1, u.steer)) * vp.MAXSTEER;
  const delta = car.delta + clampAbs(tgtDelta - car.delta, vp.MAXSTEERVEL * dt);
  const thr = Math.max(-1, Math.min(1, u.throttle));
  // terrain at the current pose, normalized road tangent frame (fix 3/4)
  const gr = world.height.grad(car.x, car.y), ch = Math.cos(car.yaw), sh = Math.sin(car.yaw);
  const gradeAlong = gr[0]*ch + gr[1]*sh, bankLat = gr[0]*(-sh) + gr[1]*ch, slope = Math.hypot(gr[0], gr[1]);
  const cosS = 1 / Math.sqrt(1 + slope*slope);
  const onTrack0 = near.dist <= T.half, mu = onTrack0 ? world.mu : world.muGrass;
  const Fz = vp.M*G*cosS;
  // load transfer from the requested longitudinal demand, then clamp each axle to mu*Fz (fix 1)
  const FxReq = thr > 0 ? thr*vp.FXDRIVE : thr*vp.FXBRAKE, axcReq = FxReq/vp.M;
  const Fzf = Math.max(50, Fz*vp.LR/vp.L - vp.M*axcReq*vp.HCG/vp.L);
  const Fzr = Math.max(50, Fz*vp.LF/vp.L + vp.M*axcReq*vp.HCG/vp.L);
  const FxF = clampAbs(FxReq*0.35, mu*Fzf), FxR = clampAbs(FxReq*0.65, mu*Fzr), Fx = FxF + FxR;
  const vabs = Math.abs(car.vx), blend = Math.max(0, Math.min(1, (vabs-1.2)/2.0));
  const af = delta - Math.atan2(car.vy + vp.LF*car.r, Math.max(0.6, vabs));
  const ar = -Math.atan2(car.vy - vp.LR*car.r, Math.max(0.6, vabs));
  // lateral capacity from the friction budget remaining after longitudinal use (fix 2)
  const FyfMax = Math.sqrt(Math.max(0, (mu*Fzf)*(mu*Fzf) - FxF*FxF)), FyrMax = Math.sqrt(Math.max(0, (mu*Fzr)*(mu*Fzr) - FxR*FxR));
  const Fyf = clampAbs(vp.CF*af, FyfMax), Fyr = clampAbs(vp.CR*ar, FyrMax);
  const slipSat = Math.max(Math.abs(vp.CF*af)/(FyfMax||1), Math.abs(vp.CR*ar)/(FyrMax||1));
  const vxdot = (Fx - Fyf*Math.sin(delta))/vp.M + car.vy*car.r - G*gradeAlong*cosS - (vp.DRAGC*car.vx*vabs + vp.ROLL*Math.sign(car.vx))/vp.M;
  const vydot = (Fyf*Math.cos(delta) + Fyr)/vp.M - car.vx*car.r - G*bankLat*cosS;
  const rdot = (vp.LF*Fyf*Math.cos(delta) - vp.LR*Fyr)/vp.IZ;
  const rKin = car.vx*Math.tan(delta)/vp.L, vyKin = rKin*vp.LR;
  const vx = Math.max(0, car.vx + vxdot*dt);
  const rr = blend*(car.r + rdot*dt) + (1-blend)*rKin;
  const vy = blend*(car.vy + vydot*dt) + (1-blend)*vyKin;
  const yaw = car.yaw + rr*dt;
  const x = car.x + (vx*ch - vy*sh)*dt, y = car.y + (vx*sh + vy*ch)*dt;
  // recompute track/terrain observations from the integrated pose (fix 4)
  const nearPost = nearestIndex(T, x, y, near.i);
  const grPost = world.height.grad(x, y), chP = Math.cos(yaw), shP = Math.sin(yaw);
  return {
    x, y, yaw, vx, vy, r: rr, delta, idx: nearPost.i,
    onTrack: nearPost.dist <= T.half, nz: world.height.at(x, y), grade: grPost[0]*chP + grPost[1]*shP,
    beta: Math.atan2(vy, Math.max(0.3, vx)), slipSat,
    v: vx, groundSpeed: Math.hypot(vx, vy), prevProg: car.prevProg,
  };
}

// Version dispatcher — v1 stays the frozen default; v2 is opt-in via world.physicsVersion.
export function stepVehicle(car: CarState, u: Control, world: World, dt: number = DT): CarState {
  return world.physicsVersion === 2 ? stepDynamicsV2(car, u, world, dt) : stepDynamics(car, u, world, dt);
}

export type Scan = { ranges: number[]; a0: number; da: number };
export function castScan(car: CarState, world: World, nBeams = 21, fov = 2.0, objects:SceneObject[] = world.objects ?? []): Scan {
  const T = world.track, a0 = -fov, da = 2*fov/(nBeams-1), ranges: number[] = [];
  const boxHit = world.physicsVersion === 2; // v2: oriented-box; v1: circumscribed circle (frozen)
  for (let b = 0; b < nBeams; b++) {
    const ang = car.yaw + a0 + b*da, dx = Math.cos(ang), dy = Math.sin(ang);
    let r = 0.5, hint = car.idx, hit = 18;
    for (let t = 0; t < 35; t++) {
      r += 0.5; const px = car.x + dx*r, py = car.y + dy*r, nn = nearestIndex(T, px, py, hint); hint = nn.i;
      if (nn.dist > T.half) { hit = r - 0.25; break; }
      for(const object of objects){
        const inside = boxHit
          ? pointInBox(px, py, boxForObject(object))
          : (()=>{ const ox=px-object.pose.x,oy=py-object.pose.y, radius=object.shape.type==='circle'?object.shape.radius:Math.hypot(object.shape.length,object.shape.width)/2; return ox*ox+oy*oy<=radius*radius; })()
        if(inside){hit=Math.min(hit,r-0.25);break}
      }
      if(hit<18)break
    }
    ranges.push(hit);
  }
  return { ranges, a0, da };
}
