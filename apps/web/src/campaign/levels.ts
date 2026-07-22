import { makeGraph } from '@apex/core'
import type { Graph } from '@apex/core'

export type Objective = { type: 'clean' } | { type: 'time'; target: number }
  | { type: 'speed'; target: number; hold: number; tolerance: number }
export type Requirement =
  | { kind:'node'; type:string; label:string }
  | { kind:'edge'; from:string; fromPort:string; to:string; toPort:string; label:string }
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

const L5: Graph = makeGraph({
  target:{type:'const',params:{value:8}},
  speedctl:{type:'blk.speedPid',in:{target:['n','target','v']}},
  tsink:{type:'sink.throttle',in:{x:['n','speedctl','throttle']}},
})

const L6: Graph = makeGraph({
  target:{type:'const',params:{value:11}},
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
    requirements:[{kind:'node',type:'sub',label:'속도 오차 계산'},{kind:'node',type:'ctrl.pid',label:'PID 제어'},{kind:'node',type:'clamp',label:'출력 제한'},{kind:'edge',from:'clamp',fromPort:'v',to:'sink.throttle',toPort:'x',label:'제한된 출력을 THROTTLE에 전달'}], unlock:'PID · Clamp' },
  { id:'l2', n:2, title:'코너를 읽어라', kicker:'PURE PURSUIT',
    teach:'Pose와 Track에서 목표점을 찾고, 차 좌표계와 곡률을 거쳐 STEER까지 연결하세요.',
    palette:['const','src.pose','src.track','std.lookahead','std.tocar','vec.xy','vec.len','mul','div','clamp','sink.steer'], objective:{type:'clean'}, starter:L2,
    requirements:[{kind:'node',type:'std.lookahead',label:'전방 목표점'},{kind:'node',type:'std.tocar',label:'차 좌표 변환'},{kind:'node',type:'vec.xy',label:'횡오차 y 추출'},{kind:'node',type:'div',label:'곡률 k 계산'},{kind:'edge',from:'clamp',fromPort:'v',to:'sink.steer',toPort:'x',label:'제한된 조향을 STEER에 전달'}], unlock:'Pure Pursuit' },
  { id:'l3', n:3, title:'그립의 한계', kicker:'CORNER SPEED',
    teach:'조향·속도 블록은 제공돼. 전방 곡률로 안전 속도를 만들어 속도 블록의 target에 넣고 32초 안에 완주하세요.',
    palette:['src.pose','src.track','std.curvAhead','std.gripSpeed'], objective:{type:'time',target:32}, starter:L3,
    requirements:[{kind:'node',type:'std.curvAhead',label:'전방 곡률'},{kind:'node',type:'std.gripSpeed',label:'그립 속도'},{kind:'edge',from:'std.gripSpeed',fromPort:'v',to:'blk.speedPid',toPort:'target',label:'계획 속도를 속도 제어기에 전달'}], unlock:'곡률 기반 속도 계획' },
  { id:'l4', n:4, title:'보이지 않는 길', kicker:'FOLLOW THE GAP',
    teach:'속도 제어는 준비돼 있습니다. LiDAR 노이즈를 정리하고 가장 넓게 이어진 안전 공간을 골라 STEER로 만드세요.',
    palette:['src.scan','lidar.preprocess','lidar.widestGap','mul','add','clamp','sink.steer'], objective:{type:'clean'}, starter:L4,
    requirements:[{kind:'edge',from:'src.scan',fromPort:'ranges',to:'lidar.preprocess',toPort:'ranges',label:'LiDAR 거리를 전처리'},{kind:'edge',from:'lidar.preprocess',fromPort:'ranges',to:'lidar.widestGap',toPort:'ranges',label:'연속된 안전 공간 탐색'},{kind:'node',type:'mul',label:'빔 인덱스를 각도로 변환'},{kind:'node',type:'add',label:'센서 시작각 보정'},{kind:'edge',from:'clamp',fromPort:'v',to:'sink.steer',toPort:'x',label:'안전 조향을 STEER에 전달'}], unlock:'Follow-the-Gap' },
  { id:'l5', n:5, title:'막힌 레이싱 라인', kicker:'STATIC AVOIDANCE',
    teach:'레이싱 라인 위 장애물을 감지하고, 가까워졌을 때만 기존 조향에 회피 오프셋을 합성하세요.',
    palette:['src.objects','src.pose','objects.nearest','object.relative','vec.xy','const','lt','select','add','clamp','blk.pursuit','sink.steer'], objective:{type:'clean'}, starter:L5,
    requirements:[{kind:'edge',from:'src.objects',fromPort:'objects',to:'objects.nearest',toPort:'objects',label:'장면에서 가장 가까운 장애물 선택'},{kind:'edge',from:'src.pose',fromPort:'pose',to:'objects.nearest',toPort:'pose',label:'자차 위치 기준 거리 판단'},{kind:'node',type:'select',label:'거리 조건에 따라 회피 개입'},{kind:'node',type:'add',label:'기본 조향과 회피 조향 합성'},{kind:'edge',from:'clamp',fromPort:'v',to:'sink.steer',toPort:'x',label:'안전 조향을 STEER에 전달'}], unlock:'Static avoidance' },
  { id:'l6', n:6, title:'빈 공간을 추월선으로', kicker:'OVERTAKING',
    teach:'느린 상대 차량을 인식하고 추월 의도를 만든 뒤, 필요할 때만 왼쪽 오프셋을 조향에 반영하세요.',
    palette:['src.objects','src.pose','objects.nearest','object.relative','intent.passLeft','intent.parts','vec.xy','const','lt','select','add','clamp','blk.pursuit','sink.steer'], objective:{type:'clean'}, starter:L6,
    requirements:[{kind:'edge',from:'src.objects',fromPort:'objects',to:'objects.nearest',toPort:'objects',label:'추월 대상 차량 선택'},{kind:'edge',from:'objects.nearest',fromPort:'object',to:'intent.passLeft',toPort:'target',label:'대상을 왼쪽 추월 의도에 지정'},{kind:'edge',from:'intent.passLeft',fromPort:'intent',to:'intent.parts',toPort:'intent',label:'추월 오프셋 사용'},{kind:'node',type:'select',label:'접근 시 추월 조향 개입'},{kind:'edge',from:'clamp',fromPort:'v',to:'sink.steer',toPort:'x',label:'합성 조향을 STEER에 전달'}], unlock:'Overtaking intent' },
]
export const levelById = (id: string) => LEVELS.find(l => l.id === id)!
