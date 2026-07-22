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

// L2: the speed controller built in L1 is provided as one openable block (▣ Speed PID)
// so the car moves; the player builds the Pure Pursuit steering law themselves.
const L2: Graph = makeGraph({
  cruise:{type:'const',params:{value:8}},
  speedctl:{type:'blk.speedPid',in:{target:['n','cruise','v']}},
  tsink:{type:'sink.throttle',in:{x:['n','speedctl','throttle']}},
})

// L3: prior missions are provided as two openable blocks (▣ Pursuit 조향, ▣ Speed PID).
// The player builds only this level's new concept: a grip-aware target speed that feeds
// the speed block. Steering block drives itself; throttle waits for the built target.
const L3: Graph = makeGraph({
  steerctl:{type:'blk.pursuit'}, ssink:{type:'sink.steer',in:{x:['n','steerctl','steer']}},
  speedctl:{type:'blk.speedPid'}, tsink:{type:'sink.throttle',in:{x:['n','speedctl','throttle']}},
})

// L4: only the previously learned speed controller is provided as one openable block.
// The LiDAR steering circuit starts empty so the player chooses and places every new part.
const L4: Graph = makeGraph({
  target:{type:'const',params:{value:10}},
  speedctl:{type:'blk.speedPid',in:{target:['n','target','v']}},
  tsink:{type:'sink.throttle',in:{x:['n','speedctl','throttle']}},
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
    teach:'조향·속도 블록은 제공돼. 전방 곡률로 안전 속도를 만들어 속도 블록의 target에 넣고 32초 안에 완주하세요.',
    palette:['src.pose','src.track','std.curvAhead','std.gripSpeed'], objective:{type:'time',target:32}, starter:L3,
    requirements:[{type:'std.curvAhead',label:'전방 곡률'},{type:'std.gripSpeed',label:'그립 속도'}], unlock:'곡률 기반 속도 계획' },
  { id:'l4', n:4, title:'보이지 않는 길', kicker:'FOLLOW THE GAP',
    teach:'속도 제어는 블록으로 준비돼 있습니다. 빈 조향 캔버스에서 필요한 파트를 직접 골라 LiDAR의 열린 방향을 STEER로 만드세요.',
    palette:['src.scan','mul','add','array.argmax','clamp','sink.steer'], objective:{type:'clean'}, starter:L4,
    requirements:[{type:'src.scan',label:'LiDAR 감지'},{type:'array.argmax',label:'최대 간격 탐색'},{type:'mul',label:'빔 각도 변환'},{type:'add',label:'조향각 합성'}], unlock:'Follow-the-Gap' },
]
export const levelById = (id: string) => LEVELS.find(l => l.id === id)!
