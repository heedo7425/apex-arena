// Dataflow graph engine: typed nodes, topological per-tick evaluation,
// higher-order (Map) via inner sub-graphs, stateful nodes, seeded rng, model-as-node.
import type { World } from '../sim/world.ts';
import type { CarState } from '../sim/vehicle.ts';
import type { Rng } from '../rng.ts';

export type Ref = ['lit', unknown] | ['n', string, string];
export type GNode = { type: string; params?: Record<string, unknown>; pos?: [number, number]; in?: Record<string, Ref> };
export type Graph = { nodes: Record<string, GNode>; order: string[]; outNode?: string; outPort?: string };

// node kind — hook #3: builtin (opaque, e.g. solver/policy) vs composite (openable subgraph)
export type NodeKind = 'source' | 'sink' | 'prim' | 'std' | 'higher' | 'builtin' | 'composite';
export type EvalCtx = {
  obs: Record<string, unknown>;
  cmd: { steer: number; throttle: number };
  state: Record<string, Record<string, unknown>>;
  rng: Rng;
  world: World;
  car: CarState;
  dt: number;
  __arg?: unknown;    // higher-order lambda: current element
  __arg2?: unknown;   // zipWith: paired element
  __argAcc?: unknown; // reduce: accumulator
  __cin?: Record<string, unknown>; // composite node: inputs by port name
};
export type NodeDef = {
  kind: NodeKind; cat: string; label?: string;
  ins?: string[]; outs?: string[];
  sub?: Graph; // composite: inner sub-graph (openable / forkable)
  outMap?: Record<string, [string, string]>; // composite: output port -> [innerNodeId, innerPort]
  fn: (inv: Record<string, any>, params: any, st: any, ctx: EvalCtx) => Record<string, any>;
};

export function makeGraph(nodes: Record<string, GNode>, outNode?: string, outPort?: string): Graph {
  const order: string[] = []; const vis: Record<string, boolean> = {}, tmp: Record<string, boolean> = {};
  function visit(id: string) {
    if (vis[id] || tmp[id]) return; tmp[id] = true;
    const n = nodes[id];
    if (n.in) for (const p in n.in) { const r = n.in[p]; if (r && r[0] === 'n') visit(r[1] as string); }
    tmp[id] = false; vis[id] = true; order.push(id);
  }
  for (const id in nodes) visit(id);
  return { nodes, order, outNode, outPort };
}

function resolveRef(ref: Ref | undefined, val: Record<string, any>): any {
  if (!ref) return undefined;
  if (ref[0] === 'lit') return ref[1];
  if (ref[0] === 'n') return val[ref[1] as string]?.[ref[2] as string];
  return undefined;
}

// Evaluate a graph once; returns { nodeId: outputs }. Registry injected to avoid import cycle.
export function evalGraph(g: Graph, ctx: EvalCtx, NT: Record<string, NodeDef>): Record<string, any> {
  const val: Record<string, any> = {};
  for (const id of g.order) {
    const n = g.nodes[id], nt = NT[n.type];
    if (!nt) throw new Error('unknown node type: ' + n.type);
    const inv: Record<string, any> = {};
    if (nt.ins) for (const port of nt.ins) inv[port] = resolveRef(n.in?.[port], val);
    const st = ctx.state[id] || (ctx.state[id] = {});
    val[id] = nt.fn(inv, n.params || {}, st, ctx) || {};
  }
  return val;
}
