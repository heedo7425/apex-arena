import { makeGraph } from '@apex/core'
import type { Graph } from '@apex/core'

export type Objective = { type: 'clean' } | { type: 'time'; target: number }
export type Requirement = { type:string; label:string }
export type Level = {
  id:string; n:number; title:string; kicker:string; teach:string; palette:string[]
  objective:Objective; starter:Graph; requirements:Requirement[]; unlock:string
}

// L1: speed control is built from a blank canvas; steering runs as a hidden assist.
const L1: Graph = makeGraph({})

export const L1_STEERING_ASSIST: Graph = makeGraph({
  assist_pose:{type:'src.pose'}, assist_track:{type:'src.track'},
  assist_ld:{type:'const',params:{value:6}},
  assist_look:{type:'std.lookahead',in:{pose:['n','assist_pose','pose'],track:['n','assist_track','track'],Ld:['n','assist_ld','v']}},
  assist_error:{type:'std.tocar',in:{pt:['n','assist_look','pt'],pose:['n','assist_pose','pose']}},
  assist_curve:{type:'std.pursuitCurv',in:{e:['n','assist_error','e']}},
  assist_gain:{type:'const',params:{value:1}},
  assist_steer:{type:'std.steerFromCurv',in:{k:['n','assist_curve','k'],gain:['n','assist_gain','v']}},
  assist_output:{type:'sink.steer',in:{x:['n','assist_steer','steer']}},
})

// L2: throttle is complete; the learner wires the Pure Pursuit chain.
const L2: Graph = makeGraph({
  speed:{type:'src.speed'}, vt:{type:'const',params:{value:8}},
  verr:{type:'sub',in:{a:['n','vt','v'],b:['n','speed','v']}},
  pid:{type:'ctrl.pid',params:{kp:0.6,ki:0.06,kd:0},in:{err:['n','verr','v']}},
  thr:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','pid','u']}},
  tsink:{type:'sink.throttle',in:{x:['n','thr','v']}},
  pose:{type:'src.pose'}, track:{type:'src.track'}, Ld:{type:'const',params:{value:6}},
  look:{type:'std.lookahead'}, e:{type:'std.tocar'}, k:{type:'std.pursuitCurv'},
  gain:{type:'const',params:{value:1}}, steer:{type:'std.steerFromCurv'}, ssink:{type:'sink.steer'},
})

// L3: steering and PID are complete; replace constant target speed with a grip-aware target.
const L3: Graph = makeGraph({
  pose:{type:'src.pose'}, track:{type:'src.track'}, speed:{type:'src.speed'},
  Ld:{type:'const',params:{value:6}},
  look:{type:'std.lookahead',in:{pose:['n','pose','pose'],track:['n','track','track'],Ld:['n','Ld','v']}},
  e:{type:'std.tocar',in:{pt:['n','look','pt'],pose:['n','pose','pose']}},
  k:{type:'std.pursuitCurv',in:{e:['n','e','e']}}, gain:{type:'const',params:{value:1}},
  steer:{type:'std.steerFromCurv',in:{k:['n','k','k'],gain:['n','gain','v']}},
  ssink:{type:'sink.steer',in:{x:['n','steer','steer']}},
  curve:{type:'std.curvAhead'}, grip:{type:'std.gripSpeed',params:{vmax:13,margin:0.85}},
  verr:{type:'sub',in:{b:['n','speed','v']}},
  pid:{type:'ctrl.pid',params:{kp:0.6,ki:0.06,kd:0},in:{err:['n','verr','v']}},
  thr:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','pid','u']}},
  tsink:{type:'sink.throttle',in:{x:['n','thr','v']}},
})

// L4: throttle is complete; build angle = a0 + argmax(ranges) * da.
const L4: Graph = makeGraph({
  speed:{type:'src.speed'}, vt:{type:'const',params:{value:10}},
  verr:{type:'sub',in:{a:['n','vt','v'],b:['n','speed','v']}},
  pid:{type:'ctrl.pid',params:{kp:0.6,ki:0.06,kd:0},in:{err:['n','verr','v']}},
  thr:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','pid','u']}},
  tsink:{type:'sink.throttle',in:{x:['n','thr','v']}},
  scan:{type:'src.scan'}, gap:{type:'array.argmax'}, beam:{type:'mul'},
  angle:{type:'add'}, safe:{type:'clamp',params:{lo:-1,hi:1}}, ssink:{type:'sink.steer'},
})

/* The first mission starts as a true blank build: install power and an actuator. */
const TUT: Graph = makeGraph({})

export const LEVELS: Level[] = [
  { id:'tut', n:0, title:'첫 시동', kicker:'FIRST IGNITION',
    teach:'빈 캔버스에 동력과 출력을 직접 장착해, 네 첫 제어 신호로 차량을 움직여라.',
    palette:['const','sink.throttle'], objective:{type:'clean'}, starter:TUT, requirements:[], unlock:'Const · THROTTLE' },
  { id:'l1', n:1, title:'속도를 붙잡아라', kicker:'THROTTLE CONTROL',
    teach:'목표속도에서 현재속도를 빼고 PID와 Clamp를 거쳐 THROTTLE까지 연결하세요.',
    palette:['const','sub','ctrl.pid','clamp','src.speed','sink.throttle'], objective:{type:'clean'}, starter:L1,
    requirements:[{type:'sub',label:'속도 오차 계산'},{type:'ctrl.pid',label:'PID 제어'},{type:'clamp',label:'출력 제한'}], unlock:'PID · Clamp' },
  { id:'l2', n:2, title:'코너를 읽어라', kicker:'PURE PURSUIT',
    teach:'Pose와 Track에서 목표점을 찾고, 차 좌표계와 곡률을 거쳐 STEER까지 연결하세요.',
    palette:['const','src.pose','src.track','std.lookahead','std.tocar','std.pursuitCurv','std.steerFromCurv','sink.steer'], objective:{type:'clean'}, starter:L2,
    requirements:[{type:'std.lookahead',label:'전방 목표점'},{type:'std.tocar',label:'차 좌표 변환'},{type:'std.pursuitCurv',label:'추종 곡률'}], unlock:'Pure Pursuit' },
  { id:'l3', n:3, title:'그립의 한계', kicker:'CORNER SPEED',
    teach:'전방 곡률로 안전 속도를 계산해 PID의 목표속도로 넣고 24초 안에 완주하세요.',
    palette:['sub','ctrl.pid','clamp','src.speed','src.pose','src.track','std.curvAhead','std.gripSpeed','sink.throttle'], objective:{type:'time',target:24}, starter:L3,
    requirements:[{type:'std.curvAhead',label:'전방 곡률'},{type:'std.gripSpeed',label:'그립 속도'}], unlock:'곡률 기반 속도 계획' },
  { id:'l4', n:4, title:'보이지 않는 길', kicker:'FOLLOW THE GAP',
    teach:'LiDAR 거리 배열의 가장 넓은 빔을 찾아 각도로 바꾸고 STEER까지 연결하세요.',
    palette:['src.scan','mul','add','array.argmax','clamp','sink.steer'], objective:{type:'clean'}, starter:L4,
    requirements:[{type:'src.scan',label:'LiDAR 감지'},{type:'array.argmax',label:'최대 간격 탐색'},{type:'mul',label:'빔 각도 변환'},{type:'add',label:'조향각 합성'}], unlock:'Follow-the-Gap' },
]
export const levelById = (id: string) => LEVELS.find(l => l.id === id)!
