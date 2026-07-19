import { makeGraph } from '@apex/core'
import type { Graph } from '@apex/core'

export type Objective = { type: 'clean' } | { type: 'time'; target: number }
export type Level = { id: string; n: number; title: string; teach: string; palette: string[]; objective: Objective; starter: Graph }

// L1 — Throttle: steering is given (pursuit); build a speed controller.
const L1: Graph = makeGraph({
  pose:{type:'src.pose'}, track:{type:'src.track'},
  Ld:{type:'const',params:{value:6}},
  look:{type:'std.lookahead',in:{pose:['n','pose','pose'],track:['n','track','track'],Ld:['n','Ld','v']}},
  e:{type:'std.tocar',in:{pt:['n','look','pt'],pose:['n','pose','pose']}},
  k:{type:'std.pursuitCurv',in:{e:['n','e','e']}},
  gain:{type:'const',params:{value:1}},
  steer:{type:'std.steerFromCurv',in:{k:['n','k','k'],gain:['n','gain','v']}},
  ssink:{type:'sink.steer',in:{x:['n','steer','steer']}},
  tconst:{type:'const',params:{value:0.4}},
  tsink:{type:'sink.throttle',in:{x:['n','tconst','v']}},
})

// L2 — Steer: throttle is given; build Pure Pursuit steering (now the straight one crashes).
const L2: Graph = makeGraph({
  speed:{type:'src.speed'},
  vt:{type:'const',params:{value:8}},
  verr:{type:'sub',in:{a:['n','vt','v'],b:['n','speed','v']}},
  pid:{type:'ctrl.pid',params:{kp:0.6,ki:0.06,kd:0},in:{err:['n','verr','v']}},
  thr:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','pid','u']}},
  tsink:{type:'sink.throttle',in:{x:['n','thr','v']}},
  s0:{type:'const',params:{value:0}},
  ssink:{type:'sink.steer',in:{x:['n','s0','v']}},
})

// L3 — Corner speed: constant speed goes off in corners; add curvature→grip speed.
const L3: Graph = makeGraph({
  pose:{type:'src.pose'}, track:{type:'src.track'}, speed:{type:'src.speed'},
  Ld:{type:'const',params:{value:6}},
  look:{type:'std.lookahead',in:{pose:['n','pose','pose'],track:['n','track','track'],Ld:['n','Ld','v']}},
  e:{type:'std.tocar',in:{pt:['n','look','pt'],pose:['n','pose','pose']}},
  k:{type:'std.pursuitCurv',in:{e:['n','e','e']}},
  gain:{type:'const',params:{value:1}},
  steer:{type:'std.steerFromCurv',in:{k:['n','k','k'],gain:['n','gain','v']}},
  ssink:{type:'sink.steer',in:{x:['n','steer','steer']}},
  vt:{type:'const',params:{value:12}},
  verr:{type:'sub',in:{a:['n','vt','v'],b:['n','speed','v']}},
  pid:{type:'ctrl.pid',params:{kp:0.6,ki:0.06,kd:0},in:{err:['n','verr','v']}},
  thr:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','pid','u']}},
  tsink:{type:'sink.throttle',in:{x:['n','thr','v']}},
})

// L4 — Sense the gap: steer straight; use LiDAR + argmax to follow the widest gap.
const L4: Graph = makeGraph({
  scan:{type:'src.scan'}, speed:{type:'src.speed'},
  vt:{type:'const',params:{value:10}},
  verr:{type:'sub',in:{a:['n','vt','v'],b:['n','speed','v']}},
  pid:{type:'ctrl.pid',params:{kp:0.6,ki:0.06,kd:0},in:{err:['n','verr','v']}},
  thr:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','pid','u']}},
  tsink:{type:'sink.throttle',in:{x:['n','thr','v']}},
  s0:{type:'const',params:{value:0}},
  ssink:{type:'sink.steer',in:{x:['n','s0','v']}},
})

// TUT — a complete, already-driving graph (Pure Pursuit + PID speed control).
// No palette, no wiring. Just: run → raise the target-speed Const → see it respond.
const TUT: Graph = makeGraph({
  pose:{type:'src.pose'}, track:{type:'src.track'}, speed:{type:'src.speed'},
  Ld:{type:'const',params:{value:6}},
  look:{type:'std.lookahead',in:{pose:['n','pose','pose'],track:['n','track','track'],Ld:['n','Ld','v']}},
  e:{type:'std.tocar',in:{pt:['n','look','pt'],pose:['n','pose','pose']}},
  k:{type:'std.pursuitCurv',in:{e:['n','e','e']}},
  gain:{type:'const',params:{value:1}},
  steer:{type:'std.steerFromCurv',in:{k:['n','k','k'],gain:['n','gain','v']}},
  ssink:{type:'sink.steer',in:{x:['n','steer','steer']}},
  vt:{type:'const',params:{value:8}},                    // ← target speed the player raises
  verr:{type:'sub',in:{a:['n','vt','v'],b:['n','speed','v']}},
  pid:{type:'ctrl.pid',params:{kp:0.6,ki:0.06,kd:0},in:{err:['n','verr','v']}},
  thr:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','pid','u']}},
  tsink:{type:'sink.throttle',in:{x:['n','thr','v']}},
})

export const LEVELS: Level[] = [
  { id:'tut', n:0, title:'튜토리얼 (Tutorial)', teach:'이 노드 그래프가 곧 차의 두뇌야. 오른쪽 아래 안내 3단계만 따라와 — 짓는 건 다음 레벨부터.',
    palette:[], objective:{type:'clean'}, starter:TUT },
  { id:'l1', n:1, title:'스로틀 (Throttle)', teach:'조향은 주어져 있어. 속도 제어를 그래프로 짜자 — 목표속도 const에서 speed를 빼고(sub) → PID → clamp → THROTTLE. 노드를 이어봐.',
    palette:['const','sub','ctrl.pid','clamp','src.speed','sink.throttle'], objective:{type:'clean'}, starter:L1 },
  { id:'l2', n:2, title:'조향 (Steer)', teach:'이번엔 스로틀이 주어져. 지금은 직진해서 코너에서 나가떨어져. Pure Pursuit 조향을 조립: Lookahead point → To car frame → Pursuit curvature → Steer.',
    palette:['const','src.pose','src.track','std.lookahead','std.tocar','std.pursuitCurv','std.steerFromCurv','sink.steer'], objective:{type:'clean'}, starter:L2 },
  { id:'l3', n:3, title:'코너 감속 (Corner speed)', teach:'상수 속도로는 코너에서 밀려나. Curvature ahead → Grip speed로 목표속도를 곡률에 맞춰 스스로 줄여봐. 클린 랩 24초 이내.',
    palette:['const','sub','ctrl.pid','clamp','src.speed','src.pose','src.track','std.curvAhead','std.gripSpeed','sink.throttle'], objective:{type:'time',target:24}, starter:L3 },
  { id:'l4', n:4, title:'갭 감지 (Sense the gap)', teach:'트랙 지오메트리 대신 LiDAR로. scan.ranges에서 argmax로 가장 먼 빔을 찾아 → 그 각도(a0+beam·da)로 조향. 배열·argmax를 써서 Follow-the-Gap을 짜봐.',
    palette:['src.scan','const','mul','add','abs','array.argmax','array.max','clamp','sink.steer'], objective:{type:'clean'}, starter:L4 },
]
export const levelById = (id: string) => LEVELS.find(l => l.id === id)!
