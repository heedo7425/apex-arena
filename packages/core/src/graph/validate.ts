// Structural and type validation for editable dataflow graphs.
import type { Graph, NodeDef } from './engine.ts';

export type PortType =
  | 'num' | 'bool' | 'pose' | 'track' | 'scan' | 'point'
  | 'array<num>' | 'any';

type PortShape = { ins?: Record<string, PortType>; outs?: Record<string, PortType> };

// Keep this explicit until node definitions own their port schemas.
const PORTS: Record<string, PortShape> = {
  'src.scan': { outs:{ ranges:'array<num>', a0:'num', da:'num' } },
  'src.speed': { outs:{ v:'num' } }, 'src.pose': { outs:{ pose:'pose' } },
  'src.track': { outs:{ track:'track' } }, 'const': { outs:{ v:'num' } },
  'add': { ins:{ a:'num', b:'num' }, outs:{ v:'num' } },
  'sub': { ins:{ a:'num', b:'num' }, outs:{ v:'num' } },
  'mul': { ins:{ a:'num', b:'num' }, outs:{ v:'num' } },
  'div': { ins:{ a:'num', b:'num' }, outs:{ v:'num' } },
  'abs': { ins:{ x:'num' }, outs:{ v:'num' } },
  'clamp': { ins:{ x:'num' }, outs:{ v:'num' } },
  'lt': { ins:{ a:'num', b:'num' }, outs:{ v:'bool' } },
  'select': { ins:{ c:'bool', a:'any', b:'any' }, outs:{ v:'any' } },
  'arg': { outs:{ v:'any' } }, 'array.map': { ins:{ arr:'any' }, outs:{ v:'any' } },
  'array.argmax': { ins:{ arr:'array<num>' }, outs:{ i:'num' } },
  'array.len': { ins:{ arr:'any' }, outs:{ v:'num' } },
  'array.max': { ins:{ arr:'array<num>' }, outs:{ v:'num' } },
  'std.lookahead': { ins:{ pose:'pose', track:'track', Ld:'num' }, outs:{ pt:'point', idx:'num' } },
  'std.tocar': { ins:{ pt:'point', pose:'pose' }, outs:{ e:'point' } },
  'vec.xy': { ins:{ e:'point' }, outs:{ x:'num', y:'num' } },
  'vec.len': { ins:{ e:'point' }, outs:{ v:'num' } },
  'std.curvAhead': { ins:{ pose:'pose', track:'track' }, outs:{ k:'num' } },
  'std.gripSpeed': { ins:{ k:'num' }, outs:{ v:'num' } },
  'ctrl.pid': { ins:{ err:'num' }, outs:{ u:'num' } },
  'rng.uniform': { ins:{ lo:'num', hi:'num' }, outs:{ v:'num' } },
  'rng.gauss': { outs:{ v:'num' } },
  'sim.predict': { ins:{ steer:'num', throttle:'num' }, outs:{ x:'num', y:'num', v:'num' } },
  'sink.steer': { ins:{ x:'num' } }, 'sink.throttle': { ins:{ x:'num' } },

  // P-a L0 expansion — math
  'neg': { ins:{ x:'num' }, outs:{ v:'num' } }, 'sign': { ins:{ x:'num' }, outs:{ v:'num' } },
  'mod': { ins:{ a:'num', b:'num' }, outs:{ v:'num' } }, 'pow': { ins:{ a:'num', b:'num' }, outs:{ v:'num' } },
  'sqrt': { ins:{ x:'num' }, outs:{ v:'num' } }, 'min': { ins:{ a:'num', b:'num' }, outs:{ v:'num' } },
  'max': { ins:{ a:'num', b:'num' }, outs:{ v:'num' } }, 'lerp': { ins:{ a:'num', b:'num', t:'num' }, outs:{ v:'num' } },
  'sin': { ins:{ x:'num' }, outs:{ v:'num' } }, 'cos': { ins:{ x:'num' }, outs:{ v:'num' } },
  'atan2': { ins:{ y:'num', x:'num' }, outs:{ v:'num' } }, 'hypot': { ins:{ a:'num', b:'num' }, outs:{ v:'num' } },
  'wrapAngle': { ins:{ x:'num' }, outs:{ v:'num' } },
  // logic
  'gt': { ins:{ a:'num', b:'num' }, outs:{ v:'bool' } }, 'le': { ins:{ a:'num', b:'num' }, outs:{ v:'bool' } },
  'ge': { ins:{ a:'num', b:'num' }, outs:{ v:'bool' } }, 'eq': { ins:{ a:'num', b:'num' }, outs:{ v:'bool' } },
  'ne': { ins:{ a:'num', b:'num' }, outs:{ v:'bool' } }, 'and': { ins:{ a:'bool', b:'bool' }, outs:{ v:'bool' } },
  'or': { ins:{ a:'bool', b:'bool' }, outs:{ v:'bool' } }, 'not': { ins:{ x:'bool' }, outs:{ v:'bool' } },
  // vector (vec2 = 'point')
  'vec.make': { ins:{ x:'num', y:'num' }, outs:{ e:'point' } }, 'vec.xy': { ins:{ e:'point' }, outs:{ x:'num', y:'num' } },
  'vec.len': { ins:{ e:'point' }, outs:{ v:'num' } }, 'vec.scale': { ins:{ e:'point', s:'num' }, outs:{ e:'point' } },
  'vec.add': { ins:{ a:'point', b:'point' }, outs:{ e:'point' } }, 'vec.sub': { ins:{ a:'point', b:'point' }, outs:{ e:'point' } },
  'vec.dot': { ins:{ a:'point', b:'point' }, outs:{ v:'num' } }, 'vec.normalize': { ins:{ e:'point' }, outs:{ e:'point' } },
  'vec.rotate': { ins:{ e:'point', th:'num' }, outs:{ e:'point' } }, 'vec.angle': { ins:{ e:'point' }, outs:{ v:'num' } },
  'vec.dist': { ins:{ a:'point', b:'point' }, outs:{ v:'num' } },
  // array & iteration
  'arg2': { outs:{ v:'any' } }, 'argacc': { outs:{ v:'any' } },
  'array.filter': { ins:{ arr:'any' }, outs:{ v:'any' } }, 'array.reduce': { ins:{ arr:'any', init:'any' }, outs:{ v:'any' } },
  'array.zipWith': { ins:{ a:'any', b:'any' }, outs:{ v:'any' } }, 'array.get': { ins:{ arr:'any', i:'num' }, outs:{ v:'any' } },
  'array.slice': { ins:{ arr:'any', i:'num', j:'num' }, outs:{ v:'any' } }, 'array.window': { ins:{ arr:'any', i:'num', w:'num' }, outs:{ v:'any' } },
  'array.range': { ins:{ n:'num' }, outs:{ v:'array<num>' } }, 'array.diff': { ins:{ arr:'array<num>' }, outs:{ v:'array<num>' } },
  'array.argmin': { ins:{ arr:'array<num>' }, outs:{ i:'num' } }, 'array.min': { ins:{ arr:'array<num>' }, outs:{ v:'num' } },
  'array.sum': { ins:{ arr:'array<num>' }, outs:{ v:'num' } }, 'array.mean': { ins:{ arr:'array<num>' }, outs:{ v:'num' } },
  // stateful
  'st.delay': { ins:{ x:'num' }, outs:{ v:'num' } }, 'st.accum': { ins:{ x:'num' }, outs:{ v:'num' } },
  'st.lowpass': { ins:{ x:'num' }, outs:{ v:'num' } }, 'st.rateLimit': { ins:{ x:'num' }, outs:{ v:'num' } },
  // composite / modules
  'cin': { outs:{ v:'any' } },
  'blk.pursuit': { outs:{ steer:'num' } },
  'blk.speedPid': { ins:{ target:'num' }, outs:{ throttle:'num' } },
};

export type GraphIssueCode =
  | 'unknown-node' | 'unknown-port' | 'missing-source' | 'type-mismatch'
  | 'cycle' | 'missing-output' | 'unwired-output' | 'unwired-input';
export type GraphIssue = { code: GraphIssueCode; message: string; nodeId?: string; port?: string };

export function portType(nodeType: string, port: string, direction: 'in' | 'out'): PortType | undefined {
  if (nodeType === 'blk.user') return 'any'; // user block ports are dynamic (per-instance)
  return direction === 'in' ? PORTS[nodeType]?.ins?.[port] : PORTS[nodeType]?.outs?.[port];
}

export function arePortsCompatible(sourceType: string, sourcePort: string, targetType: string, targetPort: string): boolean {
  const out = portType(sourceType, sourcePort, 'out');
  const input = portType(targetType, targetPort, 'in');
  return !!out && !!input && (out === 'any' || input === 'any' || out === input);
}

export function validateGraph(
  graph: Graph,
  registry: Record<string, NodeDef>,
  options: { requireOutputs?: boolean; requiredOutputs?: string[] } = {},
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodes = graph.nodes;

  for (const [id, node] of Object.entries(nodes)) {
    if (!registry[node.type]) {
      issues.push({ code:'unknown-node', nodeId:id, message:`Unknown node type: ${node.type}` });
      continue;
    }
    for (const [input, ref] of Object.entries(node.in ?? {})) {
      if (!portType(node.type, input, 'in')) {
        issues.push({ code:'unknown-port', nodeId:id, port:input, message:`${id}.${input} is not an input port` });
        continue;
      }
      if (ref[0] !== 'n') continue;
      const source = nodes[ref[1] as string];
      if (!source) {
        issues.push({ code:'missing-source', nodeId:id, port:input, message:`${id}.${input} references a missing node` });
      } else if (!portType(source.type, ref[2] as string, 'out')) {
        issues.push({ code:'unknown-port', nodeId:id, port:input, message:`${source.type}.${ref[2]} is not an output port` });
      } else if (!arePortsCompatible(source.type, ref[2] as string, node.type, input)) {
        issues.push({ code:'type-mismatch', nodeId:id, port:input, message:`${source.type}.${ref[2]} cannot connect to ${node.type}.${input}` });
      }
    }
  }

  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      issues.push({ code:'cycle', nodeId:id, message:`Cycle detected: ${[...path, id].join(' -> ')}` });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const ref of Object.values(nodes[id]?.in ?? {})) {
      if (ref[0] === 'n' && nodes[ref[1] as string]) visit(ref[1] as string, [...path, id]);
    }
    visiting.delete(id); visited.add(id);
  };
  Object.keys(nodes).forEach(id => visit(id, []));

  const requiredOutputs = options.requiredOutputs ?? (options.requireOutputs ? ['sink.steer', 'sink.throttle'] : []);
  if (requiredOutputs.length) {
    const active = new Set<string>();
    const markActive = (id: string) => {
      if (active.has(id) || !nodes[id]) return;
      active.add(id);
      for (const ref of Object.values(nodes[id].in ?? {})) if (ref[0] === 'n') markActive(ref[1] as string);
    };

    for (const type of requiredOutputs) {
      const sinks = Object.entries(nodes).filter(([, node]) => node.type === type);
      if (sinks.length === 0) {
        issues.push({ code:'missing-output', message:`Missing ${type} node` });
      } else {
        sinks.forEach(([id, node]) => {
          markActive(id);
          if (!node.in?.x) issues.push({ code:'unwired-output', nodeId:id, port:'x', message:`${type} must be wired` });
        });
      }
    }

    for (const id of active) {
      const node = nodes[id];
      const insList = node.type === 'blk.user'
        ? (((node.params?.inPorts as any[]) ?? []).map(p => p.name))
        : Object.keys(PORTS[node.type]?.ins ?? {});
      for (const input of insList) {
        if (!node.in?.[input]) issues.push({ code:'unwired-input', nodeId:id, port:input, message:`${id}.${input} must be wired` });
      }
    }
  }
  return issues;
}
