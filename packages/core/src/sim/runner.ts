// Sim runner: builds observation, evaluates the graph, steps the plant, times laps.
import { type World, type PhysicsVersion, DT, PHYSICS_VERSION, nearestIndex } from './world.ts';
import { type CarState, type Control, initCar, stepVehicle, castScan } from './vehicle.ts';
import { boxForObject, carBoxOf, resolveStatic, resolvePair } from './collision.ts';
import type { SceneObject } from '../planning/types.ts';
import { type Graph, type EvalCtx, evalGraph } from '../graph/engine.ts';
import { NT } from '../graph/registry.ts';
import { makeRng, type Rng } from '../rng.ts';

export type Medals = { dev: number; gold: number; silver: number; bronze: number };
export const DEFAULT_MEDALS: Medals = { dev: 20.5, gold: 22.5, silver: 26, bronze: 33 };
// physics v2 medals are a separate ladder (v2 grip is stricter; the v2 reference laps ~27.8 s).
// v1 and v2 medals/records are never compared in the same ranking.
export const MEDALS_V2: Medals = { dev: 26.5, gold: 28.5, silver: 32, bronze: 40 };
export const medalsForVersion = (v: PhysicsVersion): Medals => v === 2 ? MEDALS_V2 : DEFAULT_MEDALS;
export type LapResult = { t: number; dirty: boolean; physicsVersion: PhysicsVersion };

// physics v2 lap validation: ordered interior checkpoints (lap-progress fractions) that must be
// crossed in sequence before the finish line, so index-wrap shortcuts cannot register a clean lap.
export const SECTOR_FRACS = [0.25, 0.5, 0.75];
export function advanceCheckpoint(prevProg: number, prog: number, cpNext: number, fracs = SECTOR_FRACS): number {
  return (cpNext < fracs.length && prevProg < fracs[cpNext] && prog >= fracs[cpNext]) ? cpNext + 1 : cpNext;
}

// physics v2: an opponent is a full vehicle (same stepVehicle model + collision), not a
// kinematic track follower. It carries its own CarState and a target cruise speed.
export type OpponentState = { car: CarState; target: number; spec: SceneObject };

export type SimState = {
  world: World; graph: Graph; rng: Rng; car: CarState; dt: number;
  physicsVersion: PhysicsVersion;
  elapsed:number; objects:NonNullable<World['objects']>;
  staticSpecs: SceneObject[]; opponents: OpponentState[];
  lapT: number; dirty: boolean; prevProg: number; cpNext: number;
  laps: LapResult[]; best: number | null; lastVal: Record<string, any> | null;
  graphState: Record<string, Record<string, unknown>>;
};

const cloneObj = (o:SceneObject):SceneObject => ({...o,pose:{...o.pose},velocity:{...o.velocity},shape:{...o.shape}});
const isMover = (o:SceneObject) => o.kind==='vehicle' && o.trackIndex!=null && o.trackSpeed!=null;

function initOpponent(world: World, spec: SceneObject): OpponentState {
  const T=world.track, i=(((spec.trackIndex??0)%T.N)+T.N)%T.N, p=T.pts[i], t=T.tan[i], sp=spec.trackSpeed??0;
  const car: CarState = { ...initCar(world), x:p[0], y:p[1], yaw:Math.atan2(t[1],t[0]), vx:sp, v:sp, idx:i, nz:world.height.at(p[0],p[1]), groundSpeed:sp };
  return { car, target: sp, spec: cloneObj(spec) };
}
// deterministic opponent brain: pure pursuit on the centerline at the target speed
function opponentControl(car: CarState, world: World, target: number): Control {
  const T=world.track, i=nearestIndex(T,car.x,car.y,car.idx).i;
  const j=(i+Math.max(1,Math.round(6/T.spacing)))%T.N, pt=T.pts[j];
  const dx=pt[0]-car.x, dy=pt[1]-car.y, cs=Math.cos(car.yaw), sn=Math.sin(car.yaw);
  const ey=-sn*dx+cs*dy, ex=cs*dx+sn*dy, Ld2=Math.max(1, ex*ex+ey*ey);
  return { steer: Math.max(-1,Math.min(1, (2*ey/Ld2)*5.2)), throttle: Math.max(-1,Math.min(1,(target-car.vx)*0.5)) };
}
function oppSceneObject(opp: OpponentState): SceneObject {
  const c=opp.car, ch=Math.cos(c.yaw), sh=Math.sin(c.yaw);
  return { ...opp.spec, pose:{x:c.x,y:c.y,yaw:c.yaw}, velocity:{x:c.vx*ch-c.vy*sh, y:c.vx*sh+c.vy*ch}, shape:{...opp.spec.shape} };
}

export function makeSim(world: World, graph: Graph, seed = 1): SimState {
  const v2 = (world.physicsVersion ?? PHYSICS_VERSION) === 2;
  const all = world.objects ?? [];
  const opponents = v2 ? all.filter(isMover).map(o=>initOpponent(world,o)) : [];
  const staticSpecs = (v2 ? all.filter(o=>!isMover(o)) : all).map(cloneObj);
  return { world, graph, rng: makeRng(seed), car: initCar(world), dt: DT, physicsVersion: v2?2:PHYSICS_VERSION, elapsed:0,
    objects: [], staticSpecs, opponents,
    lapT: 0, dirty: false, prevProg: 0, cpNext: 0, laps: [], best: null, lastVal: null, graphState: {} };
}

function sceneAt(s:SimState){
  const track=s.world.track
  return s.staticSpecs.map(o=>{
    if(o.trackIndex!=null&&o.trackSpeed!=null){
      const i=Math.floor((o.trackIndex+o.trackSpeed*s.elapsed/track.spacing)%track.N)
      const p=track.pts[i],t=track.tan[i]
      return {...o,pose:{x:p[0],y:p[1],yaw:Math.atan2(t[1],t[0])},velocity:{x:t[0]*o.trackSpeed,y:t[1]*o.trackSpeed},shape:{...o.shape}}
    }
    return {...o,pose:{...o.pose,x:o.pose.x+o.velocity.x*s.elapsed,y:o.pose.y+o.velocity.y*s.elapsed},velocity:{...o.velocity},shape:{...o.shape}}
  })
}

// physics v2 collision response. Static objects are immovable (1-body); physical
// opponents share an equal-mass, deterministic, inelastic 2-body impulse with the car.
function resolveCollisions(s: SimState): void {
  const staticCount = s.objects.length - s.opponents.length; // opponents are appended last in tick
  for (let k=0; k<staticCount; k++) if (resolveStatic(s.car, boxForObject(s.objects[k]))) s.dirty = true;
  for (const opp of s.opponents) {
    const b = opp.car, bBox = { x:b.x, y:b.y, yaw:b.yaw, hl:opp.spec.shape.length/2, hw:opp.spec.shape.width/2 };
    if (resolvePair(s.car, carBoxOf(s.car), b, bBox)) s.dirty = true;
  }
}

// one control tick (= one physics step) driven by the graph
export function tick(s: SimState): void {
  const car = s.car, world = s.world;
  // v2: advance physical opponents through the same vehicle model (their own brain), then
  // publish them into the scene (appended last, so resolveCollisions can split static vs opponent).
  if (world.physicsVersion === 2) for (const opp of s.opponents) opp.car = stepVehicle(opp.car, opponentControl(opp.car, world, opp.target), world, s.dt);
  s.objects = world.physicsVersion === 2 ? [...sceneAt(s), ...s.opponents.map(oppSceneObject)] : sceneAt(s)
  const obs = { scan: castScan(car, world, 21, 2, s.objects), speed: car.vx, groundSpeed: car.groundSpeed ?? Math.hypot(car.vx, car.vy), pose: { x: car.x, y: car.y, yaw: car.yaw }, track: world.track, objects:s.objects };
  const ctx: EvalCtx = { obs, cmd: { steer: 0, throttle: 0 }, state: s.graphState, rng: s.rng, world, car, dt: s.dt };
  s.lastVal = evalGraph(s.graph, ctx, NT);
  s.car = stepVehicle(car, ctx.cmd, world, s.dt);
  // physics v2: oriented-box narrow-phase collision response (v1 stays detection-only below)
  if (world.physicsVersion === 2) resolveCollisions(s);
  // lap timing
  s.elapsed += s.dt;
  for(const object of s.objects){
    const radius=object.shape.type==='circle'?object.shape.radius:Math.hypot(object.shape.length,object.shape.width)/2
    if(Math.hypot(s.car.x-object.pose.x,s.car.y-object.pose.y)<radius+1.35)s.dirty=true
  }
  const prog = s.car.idx / world.track.N;
  s.lapT += s.dt;
  if (!s.car.onTrack) s.dirty = true;
  if (world.physicsVersion === 2) s.cpNext = advanceCheckpoint(s.prevProg, prog, s.cpNext);
  if (s.prevProg > 0.7 && prog < 0.15) {
    // v2: a finish that skipped ordered checkpoints is an invalid (shortcut) lap
    if (world.physicsVersion === 2 && s.cpNext < SECTOR_FRACS.length) s.dirty = true;
    const lap: LapResult = { t: s.lapT, dirty: s.dirty, physicsVersion:s.physicsVersion };
    s.laps.push(lap);
    if (!lap.dirty && (s.best === null || lap.t < s.best)) s.best = lap.t;
    s.lapT = 0; s.dirty = false; s.cpNext = 0;
  }
  s.prevProg = prog;
}

export type RunSummary = { physicsVersion:PhysicsVersion; laps: LapResult[]; bestClean: number | null; maxV: number; nan: boolean };
export function runFor(world: World, graph: Graph, seed: number, seconds: number): RunSummary {
  const s = makeSim(world, graph, seed);
  let maxV = 0, nan = false;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    tick(s);
    if (!isFinite(s.car.x) || !isFinite(s.car.vx)) { nan = true; break; }
    if (s.car.vx > maxV) maxV = s.car.vx;
  }
  const clean = s.laps.filter(l => !l.dirty).map(l => l.t);
  return { physicsVersion:s.physicsVersion, laps: s.laps, bestClean: clean.length ? Math.min(...clean) : null, maxV, nan };
}

export function medalFor(best: number | null, m: Medals = DEFAULT_MEDALS): string {
  if (best === null) return 'none';
  if (best <= m.dev) return 'dev';
  if (best <= m.gold) return 'gold';
  if (best <= m.silver) return 'silver';
  if (best <= m.bronze) return 'bronze';
  return 'none';
}
