// Sim runner: builds observation, evaluates the graph, steps the plant, times laps.
import { type World, type PhysicsVersion, DT, PHYSICS_VERSION } from './world.ts';
import { type CarState, initCar, stepVehicle, castScan } from './vehicle.ts';
import { type Graph, type EvalCtx, evalGraph } from '../graph/engine.ts';
import { NT } from '../graph/registry.ts';
import { makeRng, type Rng } from '../rng.ts';

export type Medals = { dev: number; gold: number; silver: number; bronze: number };
export const DEFAULT_MEDALS: Medals = { dev: 20.5, gold: 22.5, silver: 26, bronze: 33 };
export type LapResult = { t: number; dirty: boolean; physicsVersion: PhysicsVersion };

export type SimState = {
  world: World; graph: Graph; rng: Rng; car: CarState; dt: number;
  physicsVersion: PhysicsVersion;
  elapsed:number; objects:NonNullable<World['objects']>;
  lapT: number; dirty: boolean; prevProg: number;
  laps: LapResult[]; best: number | null; lastVal: Record<string, any> | null;
  graphState: Record<string, Record<string, unknown>>;
};

export function makeSim(world: World, graph: Graph, seed = 1): SimState {
  return { world, graph, rng: makeRng(seed), car: initCar(world), dt: DT, physicsVersion:world.physicsVersion ?? PHYSICS_VERSION, elapsed:0,
    objects:(world.objects??[]).map(o=>({...o,pose:{...o.pose},velocity:{...o.velocity},shape:{...o.shape}})),
    lapT: 0, dirty: false, prevProg: 0, laps: [], best: null, lastVal: null, graphState: {} };
}

function sceneAt(s:SimState){
  const track=s.world.track
  return (s.world.objects??[]).map(o=>{
    if(o.trackIndex!=null&&o.trackSpeed!=null){
      const i=Math.floor((o.trackIndex+o.trackSpeed*s.elapsed/track.spacing)%track.N)
      const p=track.pts[i],t=track.tan[i]
      return {...o,pose:{x:p[0],y:p[1],yaw:Math.atan2(t[1],t[0])},velocity:{x:t[0]*o.trackSpeed,y:t[1]*o.trackSpeed},shape:{...o.shape}}
    }
    return {...o,pose:{...o.pose,x:o.pose.x+o.velocity.x*s.elapsed,y:o.pose.y+o.velocity.y*s.elapsed},velocity:{...o.velocity},shape:{...o.shape}}
  })
}

// one control tick (= one physics step) driven by the graph
export function tick(s: SimState): void {
  const car = s.car, world = s.world;
  s.objects=sceneAt(s)
  const obs = { scan: castScan(car, world, 21, 2, s.objects), speed: car.vx, groundSpeed: car.groundSpeed ?? Math.hypot(car.vx, car.vy), pose: { x: car.x, y: car.y, yaw: car.yaw }, track: world.track, objects:s.objects };
  const ctx: EvalCtx = { obs, cmd: { steer: 0, throttle: 0 }, state: s.graphState, rng: s.rng, world, car, dt: s.dt };
  s.lastVal = evalGraph(s.graph, ctx, NT);
  s.car = stepVehicle(car, ctx.cmd, world, s.dt);
  // lap timing
  s.elapsed += s.dt;
  for(const object of s.objects){
    const radius=object.shape.type==='circle'?object.shape.radius:Math.hypot(object.shape.length,object.shape.width)/2
    if(Math.hypot(s.car.x-object.pose.x,s.car.y-object.pose.y)<radius+1.35)s.dirty=true
  }
  const prog = s.car.idx / world.track.N;
  s.lapT += s.dt;
  if (!s.car.onTrack) s.dirty = true;
  if (s.prevProg > 0.7 && prog < 0.15) {
    const lap: LapResult = { t: s.lapT, dirty: s.dirty, physicsVersion:s.physicsVersion };
    s.laps.push(lap);
    if (!lap.dirty && (s.best === null || lap.t < s.best)) s.best = lap.t;
    s.lapT = 0; s.dirty = false;
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
