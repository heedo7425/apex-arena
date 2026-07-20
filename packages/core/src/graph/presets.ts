// Preset graphs (Act-1 classical). These are DATA — the same shape the editor produces.
import { makeGraph, type Graph } from './engine.ts';

const lamClamp = makeGraph({
  a: { type:'arg' },
  thr: { type:'const', params:{ value:1.2 } },
  islow: { type:'lt', in:{ a:['n','a','v'], b:['n','thr','v'] } },
  zero: { type:'const', params:{ value:0 } },
  out: { type:'select', in:{ c:['n','islow','v'], a:['n','zero','v'], b:['n','a','v'] } },
}, 'out', 'v');

export const FTG: Graph = makeGraph({
  scan: { type:'src.scan' },
  speed: { type:'src.speed' },
  safe: { type:'array.map', params:{ lambda:lamClamp }, in:{ arr:['n','scan','ranges'] } },
  best: { type:'array.argmax', in:{ arr:['n','safe','v'] } },
  bda: { type:'mul', in:{ a:['n','best','i'], b:['n','scan','da'] } },
  ang: { type:'add', in:{ a:['n','bda','v'], b:['n','scan','a0'] } },
  ksteer: { type:'const', params:{ value:1.1 } },
  sraw: { type:'mul', in:{ a:['n','ang','v'], b:['n','ksteer','v'] } },
  steer: { type:'clamp', params:{ lo:-1, hi:1 }, in:{ x:['n','sraw','v'] } },
  ssink: { type:'sink.steer', in:{ x:['n','steer','v'] } },
  absang: { type:'abs', in:{ x:['n','ang','v'] } },
  slow: { type:'const', params:{ value:4.5 } },
  slowT: { type:'mul', in:{ a:['n','absang','v'], b:['n','slow','v'] } },
  base: { type:'const', params:{ value:12 } },
  vtgt: { type:'sub', in:{ a:['n','base','v'], b:['n','slowT','v'] } },
  verr: { type:'sub', in:{ a:['n','vtgt','v'], b:['n','speed','v'] } },
  pid: { type:'ctrl.pid', params:{ kp:0.6, ki:0.06, kd:0 }, in:{ err:['n','verr','v'] } },
  thr: { type:'clamp', params:{ lo:-1, hi:1 }, in:{ x:['n','pid','u'] } },
  tsink: { type:'sink.throttle', in:{ x:['n','thr','v'] } },
});

export const PURSUIT: Graph = makeGraph({
  pose: { type:'src.pose' }, track: { type:'src.track' }, speed: { type:'src.speed' },
  Ld: { type:'const', params:{ value:6 } },
  look: { type:'std.lookahead', in:{ pose:['n','pose','pose'], track:['n','track','track'], Ld:['n','Ld','v'] } },
  e: { type:'std.tocar', in:{ pt:['n','look','pt'], pose:['n','pose','pose'] } },
  // pure-pursuit curvature law, built from primitives: k = 2*y / |e|^2
  comp: { type:'vec.xy', in:{ e:['n','e','e'] } },
  dist: { type:'vec.len', in:{ e:['n','e','e'] } },
  two: { type:'const', params:{ value:2 } },
  twoY: { type:'mul', in:{ a:['n','two','v'], b:['n','comp','y'] } },
  dsq: { type:'mul', in:{ a:['n','dist','v'], b:['n','dist','v'] } },
  k: { type:'div', in:{ a:['n','twoY','v'], b:['n','dsq','v'] } },
  gain: { type:'const', params:{ value:5.2 } },
  sraw: { type:'mul', in:{ a:['n','k','v'], b:['n','gain','v'] } },
  steer: { type:'clamp', params:{ lo:-1, hi:1 }, in:{ x:['n','sraw','v'] } },
  ssink: { type:'sink.steer', in:{ x:['n','steer','v'] } },
  ka: { type:'std.curvAhead', in:{ pose:['n','pose','pose'], track:['n','track','track'] } },
  vtgt: { type:'std.gripSpeed', params:{ vmax:13, margin:0.8 }, in:{ k:['n','ka','k'] } },
  verr: { type:'sub', in:{ a:['n','vtgt','v'], b:['n','speed','v'] } },
  pid: { type:'ctrl.pid', params:{ kp:0.6, ki:0.06, kd:0 }, in:{ err:['n','verr','v'] } },
  thr: { type:'clamp', params:{ lo:-1, hi:1 }, in:{ x:['n','pid','u'] } },
  tsink: { type:'sink.throttle', in:{ x:['n','thr','v'] } },
});

export const PRESETS: Record<string, Graph> = { ftg: FTG, pursuit: PURSUIT };
