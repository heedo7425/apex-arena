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
  'std.pursuitCurv': { ins:{ e:'point' }, outs:{ k:'num' } },
  'std.steerFromCurv': { ins:{ k:'num', gain:'num' }, outs:{ steer:'num' } },
  'std.curvAhead': { ins:{ pose:'pose', track:'track' }, outs:{ k:'num' } },
  'std.gripSpeed': { ins:{ k:'num' }, outs:{ v:'num' } },
  'ctrl.pid': { ins:{ err:'num' }, outs:{ u:'num' } },
  'rng.uniform': { ins:{ lo:'num', hi:'num' }, outs:{ v:'num' } },
  'rng.gauss': { outs:{ v:'num' } },
  'sim.predict': { ins:{ steer:'num', throttle:'num' }, outs:{ x:'num', y:'num', v:'num' } },
  'sink.steer': { ins:{ x:'num' } }, 'sink.throttle': { ins:{ x:'num' } },
};

export type GraphIssueCode =
  | 'unknown-node' | 'unknown-port' | 'missing-source' | 'type-mismatch'
  | 'cycle' | 'missing-output' | 'unwired-output' | 'unwired-input';
export type GraphIssue = { code: GraphIssueCode; message: string; nodeId?: string; port?: string };

export function portType(nodeType: string, port: string, direction: 'in' | 'out'): PortType | undefined {
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
      for (const input of Object.keys(PORTS[node.type]?.ins ?? {})) {
        if (!node.in?.[input]) issues.push({ code:'unwired-input', nodeId:id, port:input, message:`${id}.${input} must be wired` });
      }
    }
  }
  return issues;
}
