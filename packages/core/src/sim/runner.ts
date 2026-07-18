// Sim runner: builds observation, evaluates the graph, steps the plant, times laps.
import { type World, DT } from './world.ts';
import { type CarState, initCar, stepDynamics, castScan } from './vehicle.ts';
import { type Graph, type EvalCtx, evalGraph } from '../graph/engine.ts';
import { NT } from '../graph/registry.ts';
import { makeRng, type Rng } from '../rng.ts';

export type Medals = { dev: number; gold: number; silver: number; bronze: number };
export const DEFAULT_MEDALS: Medals = { dev: 20.5, gold: 22.5, silver: 26, bronze: 33 };
export type LapResult = { t: number; dirty: boolean };

export type SimState = {
  world: World; graph: Graph; rng: Rng; car: CarState; dt: number;
  lapT: number; dirty: boolean; prevProg: number;
  laps: LapResult[]; best: number | null; lastVal: Record<string, any> | null;
  graphState: Record<string, Record<string, unknown>>;
};

export function makeSim(world: World, graph: Graph, seed = 1): SimState {
  return { world, graph, rng: makeRng(seed), car: initCar(world), dt: DT,
    lapT: 0, dirty: false, prevProg: 0, laps: [], best: null, lastVal: null, graphState: {} };
}

// one control tick (= one physics step) driven by the graph
export function tick(s: SimState): void {
  const car = s.car, world = s.world;
  const obs = { scan: castScan(car, world), speed: car.vx, pose: { x: car.x, y: car.y, yaw: car.yaw }, track: world.track };
  const ctx: EvalCtx = { obs, cmd: { steer: 0, throttle: 0 }, state: s.graphState, rng: s.rng, world, car, dt: s.dt };
  s.lastVal = evalGraph(s.graph, ctx, NT);
  s.car = stepDynamics(car, ctx.cmd, world, s.dt);
  // lap timing
  const prog = s.car.idx / world.track.N;
  s.lapT += s.dt;
  if (!s.car.onTrack) s.dirty = true;
  if (s.prevProg > 0.7 && prog < 0.15) {
    const lap: LapResult = { t: s.lapT, dirty: s.dirty };
    s.laps.push(lap);
    if (!lap.dirty && (s.best === null || lap.t < s.best)) s.best = lap.t;
    s.lapT = 0; s.dirty = false;
  }
  s.prevProg = prog;
}

export type RunSummary = { laps: LapResult[]; bestClean: number | null; maxV: number; nan: boolean };
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
  return { laps: s.laps, bestClean: clean.length ? Math.min(...clean) : null, maxV, nan };
}

export function medalFor(best: number | null, m: Medals = DEFAULT_MEDALS): string {
  if (best === null) return 'none';
  if (best <= m.dev) return 'dev';
  if (best <= m.gold) return 'gold';
  if (best <= m.silver) return 'silver';
  if (best <= m.bronze) return 'bronze';
  return 'none';
}
