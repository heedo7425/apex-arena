import { makeGraph } from '@apex/core'
import type { Graph } from '@apex/core'

export type Objective = { type: 'clean' } | { type: 'time'; target: number }
  | { type: 'speed'; target: number; hold: number; tolerance: number }
export type Requirement = { type:string; label:string }
export type Level = {
  id:string; n:number; title:string; kicker:string; teach:string; palette:string[]
  objective:Objective; starter:Graph; requirements:Requirement[]; unlock:string
}

// L1: speed control is built and tested on a straight proving ground.
const L1: Graph = makeGraph({})

// L2: the speed controller built last mission is provided (visible) so the car actually
// moves; the player builds the Pure Pursuit steering law themselves.
const L2: Graph = makeGraph({
  sp:{type:'src.speed'}, tgt:{type:'const',params:{value:8}},
  verr:{type:'sub',in:{a:['n','tgt','v'],b:['n','sp','v']}},
  spid:{type:'ctrl.pid',params:{kp:0.6,ki:0.06,kd:0},in:{err:['n','verr','v']}},
  sthr:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','spid','u']}},
  tsink:{type:'sink.throttle',in:{x:['n','sthr','v']}},
})

// L3: steering and PID are complete; replace constant target speed with a grip-aware target.
const L3: Graph = makeGraph({
  pose:{type:'src.pose'}, track:{type:'src.track'}, speed:{type:'src.speed'},
  Ld:{type:'const',params:{value:6}},
  look:{type:'std.lookahead',in:{pose:['n','pose','pose'],track:['n','track','track'],Ld:['n','Ld','v']}},
  e:{type:'std.tocar',in:{pt:['n','look','pt'],pose:['n','pose','pose']}},
  comp:{type:'vec.xy',in:{e:['n','e','e']}}, dist:{type:'vec.len',in:{e:['n','e','e']}},
  two:{type:'const',params:{value:2}}, twoY:{type:'mul',in:{a:['n','two','v'],b:['n','comp','y']}},
  dsq:{type:'mul',in:{a:['n','dist','v'],b:['n','dist','v']}}, k:{type:'div',in:{a:['n','twoY','v'],b:['n','dsq','v']}},
  gain:{type:'const',params:{value:5.2}}, sraw:{type:'mul',in:{a:['n','k','v'],b:['n','gain','v']}},
  steer:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','sraw','v']}},
  ssink:{type:'sink.steer',in:{x:['n','steer','v']}},
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
    teach:'직선 성능시험장에서 목표속도 8 m/s를 만들고 2초 동안 안정적으로 유지하세요.',
    palette:['const','sub','ctrl.pid','clamp','src.speed','sink.throttle'],
    objective:{type:'speed',target:8,hold:2,tolerance:0.45}, starter:L1,
    requirements:[{type:'sub',label:'속도 오차 계산'},{type:'ctrl.pid',label:'PID 제어'},{type:'clamp',label:'출력 제한'}], unlock:'PID · Clamp' },
  { id:'l2', n:2, title:'코너를 읽어라', kicker:'PURE PURSUIT',
    teach:'Pose와 Track에서 목표점을 찾고, 차 좌표계와 곡률을 거쳐 STEER까지 연결하세요.',
    palette:['const','src.pose','src.track','std.lookahead','std.tocar','vec.xy','vec.len','mul','div','clamp','sink.steer'], objective:{type:'clean'}, starter:L2,
    requirements:[{type:'std.lookahead',label:'전방 목표점'},{type:'std.tocar',label:'차 좌표 변환'},{type:'vec.xy',label:'횡오차 y 추출'},{type:'div',label:'곡률 k 계산'}], unlock:'Pure Pursuit' },
  { id:'l3', n:3, title:'그립의 한계', kicker:'CORNER SPEED',
    teach:'전방 곡률로 안전 속도를 계산해 PID의 목표속도로 넣고 32초 안에 완주하세요.',
    palette:['sub','ctrl.pid','clamp','src.speed','src.pose','src.track','std.curvAhead','std.gripSpeed','sink.throttle'], objective:{type:'time',target:32}, starter:L3,
    requirements:[{type:'std.curvAhead',label:'전방 곡률'},{type:'std.gripSpeed',label:'그립 속도'}], unlock:'곡률 기반 속도 계획' },
  { id:'l4', n:4, title:'보이지 않는 길', kicker:'FOLLOW THE GAP',
    teach:'LiDAR 거리 배열의 가장 넓은 빔을 찾아 각도로 바꾸고 STEER까지 연결하세요.',
    palette:['src.scan','mul','add','array.argmax','clamp','sink.steer'], objective:{type:'clean'}, starter:L4,
    requirements:[{type:'src.scan',label:'LiDAR 감지'},{type:'array.argmax',label:'최대 간격 탐색'},{type:'mul',label:'빔 각도 변환'},{type:'add',label:'조향각 합성'}], unlock:'Follow-the-Gap' },
]
export const levelById = (id: string) => LEVELS.find(l => l.id === id)!
