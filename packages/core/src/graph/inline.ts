// Composite fork/group. Two inverse operations on a Graph:
//  inlineComposite: replace a composite node with its inner sub-graph (fork / expand).
//  encapsulate:     collapse a set of nodes into one composite block (group).
import { makeGraph, type Graph, type GNode, type NodeDef, type Ref } from './engine.ts';
import { portType } from './validate.ts';

// A composite's sub/outMap live either on the registered NodeDef (shipped blocks)
// or on the node instance's params (user-made blk.user blocks).
function subOf(node: GNode, NT: Record<string, NodeDef>): { sub?: Graph; outMap?: Record<string, [string, string]> } {
  const def = NT[node.type];
  return { sub: def?.sub ?? (node.params?.sub as Graph | undefined),
           outMap: def?.outMap ?? (node.params?.outMap as Record<string, [string, string]> | undefined) };
}

export function inlineComposite(g: Graph, nodeId: string, NT: Record<string, NodeDef>): Graph {
  const node = g.nodes[nodeId];
  const { sub, outMap } = node ? subOf(node, NT) : {};
  if (!sub || !outMap) return g;
  const prefix = nodeId + '/';
  const rn = (id: string) => prefix + id;
  const isCin = (id: string) => sub.nodes[id]?.type === 'cin';
  const extForCin = (cinId: string): Ref | undefined => node.in?.[sub.nodes[cinId].params!.port as string] as Ref | undefined;

  const nodes: Record<string, GNode> = {};
  for (const [id, n] of Object.entries(g.nodes)) if (id !== nodeId) nodes[id] = { ...n, in: { ...(n.in || {}) } };

  const base = node.pos || [0, 0];
  const visibleIds = sub.order.filter(id => sub.nodes[id].type !== 'cin');
  const depth: Record<string,number> = {};
  const innerDepth = (id:string):number => depth[id] ?? (depth[id] = Math.max(0, ...Object.values(sub.nodes[id].in || {}).map(ref => ref[0] === 'n' && !isCin(ref[1] as string) ? innerDepth(ref[1] as string)+1 : 0)));
  const perDepth: Record<number,number> = {};
  const maxDepth = Math.max(0, ...visibleIds.map(innerDepth));
  const shift = Math.max(0, maxDepth*240-210);
  for (const [id,n] of Object.entries(nodes)) if (n.pos && n.pos[0] > base[0]+80) nodes[id] = { ...n, pos:[n.pos[0]+shift,n.pos[1]] };

  for (const iid of visibleIds) {
    const inode=sub.nodes[iid], nin: Record<string, Ref> = {};
    if (inode.in) for (const [port, ref] of Object.entries(inode.in)) {
      if (ref[0] === 'n') {
        const src = ref[1] as string;
        if (isCin(src)) { const ext = extForCin(src); if (ext) nin[port] = ext; }
        else nin[port] = ['n', rn(src), ref[2] as string];
      } else nin[port] = ref as Ref;
    }
    const d=innerDepth(iid), row=(perDepth[d]=(perDepth[d]??0)+1)-1;
    if (inode.type === 'cparam') {
      const key=inode.params?.param as string, value=node.params?.[key] ?? inode.params?.fallback;
      nodes[rn(iid)] = { type:'const', params:{ value }, pos:[base[0]+d*240,base[1]+row*140], in:{} };
    } else {
      nodes[rn(iid)] = { type:inode.type, params:{ ...(inode.params || {}) }, pos:[base[0]+d*240,base[1]+row*140], in:nin };
    }
  }

  for (const id in nodes) {
    const n = nodes[id]; if (!n.in) continue;
    for (const port in n.in) {
      const ref = n.in[port];
      if (ref && ref[0] === 'n' && ref[1] === nodeId) {
        const om = outMap[ref[2] as string];
        if (om) n.in[port] = ['n', rn(om[0]), om[1]];
      }
    }
  }
  return makeGraph(nodes);
}

// Collapse `ids` into one blk.user node. Inputs = external wires into the set (via cin),
// outputs = inner wires consumed outside the set (via outMap). Behavior-preserving.
export function encapsulate(g: Graph, ids: string[], blockId: string, NT: Record<string, NodeDef>, label = '▣ 내 블록'): Graph {
  if (ids.length < 1 || ids.some(id => !g.nodes[id]) || g.nodes[blockId]) return g;
  const S = new Set(ids);
  const extKey = (r: Ref) => r[0] === 'n' ? `n:${r[1]}:${r[2]}` : `lit:${JSON.stringify(r[1])}`;

  const inPorts: { name: string; type: string; ext: Ref }[] = [];
  const inByExt = new Map<string, string>();
  const cinNodes: Record<string, GNode> = {};
  const innerNodes: Record<string, GNode> = {};
  for (const id of ids) {
    const n = g.nodes[id]; const nin: Record<string, Ref> = {};
    if (n.in) for (const [port, ref] of Object.entries(n.in)) {
      if (ref[0] === 'n' && !S.has(ref[1] as string)) {
        const key = extKey(ref);
        let cinPort = inByExt.get(key);
        if (!cinPort) {
          cinPort = 'in' + inPorts.length;
          const t = portType(g.nodes[ref[1] as string]?.type, ref[2] as string, 'out') || 'any';
          inPorts.push({ name: cinPort, type: t, ext: ref }); inByExt.set(key, cinPort);
          cinNodes['__cin_' + cinPort] = { type: 'cin', params: { port: cinPort } };
        }
        nin[port] = ['n', '__cin_' + cinPort, 'v'];
      } else nin[port] = ref as Ref;
    }
    innerNodes[id] = { type: n.type, params: { ...(n.params || {}) }, pos: n.pos, in: nin };
  }

  const outByInner = new Map<string, string>();
  const outPorts: { name: string; type: string }[] = [];
  const outMap: Record<string, [string, string]> = {};
  for (const [id, n] of Object.entries(g.nodes)) {
    if (S.has(id) || !n.in) continue;
    for (const ref of Object.values(n.in)) {
      if (ref[0] === 'n' && S.has(ref[1] as string)) {
        const key = `${ref[1]}:${ref[2]}`;
        if (!outByInner.has(key)) {
          const name = 'out' + outPorts.length;
          const t = portType(g.nodes[ref[1] as string].type, ref[2] as string, 'out') || 'any';
          outPorts.push({ name, type: t }); outByInner.set(key, name);
          outMap[name] = [ref[1] as string, ref[2] as string];
        }
      }
    }
  }

  const sub = makeGraph({ ...innerNodes, ...cinNodes });
  let cx = 0, cy = 0, cnt = 0;
  for (const id of ids) { const p = g.nodes[id].pos; if (p) { cx += p[0]; cy += p[1]; cnt++; } }
  const pos: [number, number] = cnt ? [cx / cnt, cy / cnt] : [0, 0];

  const nodes: Record<string, GNode> = {};
  for (const [id, n] of Object.entries(g.nodes)) if (!S.has(id)) nodes[id] = { ...n, in: { ...(n.in || {}) } };
  const blockIn: Record<string, Ref> = {};
  for (const ip of inPorts) blockIn[ip.name] = ip.ext;
  nodes[blockId] = { type: 'blk.user', pos, in: blockIn,
    params: { sub, outMap, inPorts, outPorts, label } as any };

  for (const id in nodes) {
    const n = nodes[id]; if (!n.in) continue;
    for (const port in n.in) {
      const ref = n.in[port];
      if (ref[0] === 'n' && S.has(ref[1] as string)) {
        const name = outByInner.get(`${ref[1]}:${ref[2]}`);
        if (name) n.in[port] = ['n', blockId, name];
      }
    }
  }
  return makeGraph(nodes);
}
