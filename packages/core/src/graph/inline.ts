// Fork a composite block: replace one composite node with its inner sub-graph,
// rewiring the block's inputs (via cin placeholders) and outputs (via outMap).
import { makeGraph, type Graph, type GNode, type NodeDef, type Ref } from './engine.ts';

export function inlineComposite(g: Graph, nodeId: string, NT: Record<string, NodeDef>): Graph {
  const node = g.nodes[nodeId];
  const def = node && NT[node.type];
  if (!def?.sub || !def.outMap) return g;
  const sub = def.sub, prefix = nodeId + '/';
  const rn = (id: string) => prefix + id;
  const isCin = (id: string) => sub.nodes[id]?.type === 'cin';
  const extForCin = (cinId: string): Ref | undefined => node.in?.[sub.nodes[cinId].params!.port as string] as Ref | undefined;

  const nodes: Record<string, GNode> = {};
  for (const [id, n] of Object.entries(g.nodes)) if (id !== nodeId) nodes[id] = { ...n, in: { ...(n.in || {}) } };

  const base = node.pos || [0, 0];
  let k = 0;
  for (const [iid, inode] of Object.entries(sub.nodes)) {
    if (inode.type === 'cin') continue;
    const nin: Record<string, Ref> = {};
    if (inode.in) for (const [port, ref] of Object.entries(inode.in)) {
      if (ref[0] === 'n') {
        const src = ref[1] as string;
        if (isCin(src)) { const ext = extForCin(src); if (ext) nin[port] = ext; }
        else nin[port] = ['n', rn(src), ref[2] as string];
      } else nin[port] = ref as Ref;
    }
    nodes[rn(iid)] = { type: inode.type, params: { ...(inode.params || {}) },
      pos: [base[0] + (k % 4) * 220, base[1] + Math.floor(k / 4) * 120], in: nin };
    k++;
  }

  // rewire external consumers of the block's outputs to the inner producing node
  for (const id in nodes) {
    const n = nodes[id]; if (!n.in) continue;
    for (const port in n.in) {
      const ref = n.in[port];
      if (ref && ref[0] === 'n' && ref[1] === nodeId) {
        const om = def.outMap[ref[2] as string];
        if (om) n.in[port] = ['n', rn(om[0]), om[1]];
      }
    }
  }
  return makeGraph(nodes);
}
