import { makeGraph, PURSUIT } from '@apex/core'
import type { Graph } from '@apex/core'

export type Objective = { type: 'clean' } | { type: 'time'; target: number }
  | { type: 'speed'; target: number; hold: number; tolerance: number }
  | { type:'motion'; target:number } | { type:'skills' }
export type Requirement =
  | { kind:'node'; type:string; label:string; count?:number }
  | { kind:'edge'; from:string; fromPort:string; to:string; toPort:string; label:string }
  | { kind:'skill'; skill:'add'|'connect'|'param'|'open'|'fork'|'delete'; label:string }
export type Level = {
  id:string; n:number; title:string; kicker:string; teach:string; palette:string[]
  objective:Objective; starter:Graph; requirements:Requirement[]; unlock:string
  path?:'campaign'|'academy'|'race'; requiredOutputs?:string[]
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

// L7 provides only prior controllers. Candidate generation, scoring and selection are blank.
const L7: Graph = makeGraph({
  cruise:{type:'const',params:{value:8}},
  baseSteer:{type:'blk.pursuit'},
  speedctl:{type:'blk.speedPid',in:{target:['n','cruise','v']}},
})

// L8 keeps the previously learned speed loop; policy features, action and reward start blank.
const L8: Graph = makeGraph({
  cruise:{type:'const',params:{value:8}},
  speedctl:{type:'blk.speedPid',in:{target:['n','cruise','v']}},
  tsink:{type:'sink.throttle',in:{x:['n','speedctl','throttle']}},
})

/* The first mission starts as a true blank build: install power and an actuator. */
const TUT: Graph = makeGraph({})

export const LEVELS: Level[] = [
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
  { id:'l7', n:7, title:'두 개의 미래', kicker:'CANDIDATE MPC',
    teach:'기본 조향 양쪽에 후보 명령을 만들고 미래 궤적을 굴린 뒤, 전진 비용이 더 낮은 후보의 첫 명령만 실행하세요.',
    palette:['src.vehicleState','src.track','blk.pursuit','blk.speedPid','const','add','sub','neg','command.make','commands.steerLattice','trajectory.rollout','trajectory.rolloutCommands','trajectories.rolloutLattice','trajectory.progress','trajectories.empty','trajectories.append','array.pack2','trajectories.selectMin','trajectories.selectEvaluated','trajectory.commandAt','command.parts','sink.steer','sink.throttle'], objective:{type:'clean'}, starter:L7,
    requirements:[{kind:'node',type:'trajectory.rollout',count:2,label:'두 후보 미래 생성'},{kind:'node',type:'array.pack2',label:'후보 비용 순서대로 묶기'},{kind:'node',type:'trajectories.selectMin',label:'최저 비용 후보 선택'},{kind:'edge',from:'trajectories.selectMin',fromPort:'trajectory',to:'trajectory.commandAt',toPort:'trajectory',label:'선택 궤적에서 실행 명령 추출'},{kind:'edge',from:'trajectory.commandAt',fromPort:'command',to:'command.parts',toPort:'command',label:'명령을 조향·가속으로 분해'}], unlock:'Candidate MPC pipeline' },
  { id:'l8', n:8, title:'정책을 시험하라', kicker:'RL POLICY EVALUATION',
    teach:'횡오차와 헤딩오차를 정책 관측으로 넣어 조향 행동을 만들고, 주행 성능과 이탈을 별도의 보상 신호로 평가하세요.',
    palette:['src.pose','src.track','src.speed','src.vehicleState','state.parts','std.crossTrack','std.headingErr','policy.linear2','reward.track','clamp','sink.steer','sink.reward'], objective:{type:'clean'}, starter:L8,
    requirements:[{kind:'edge',from:'std.crossTrack',fromPort:'e',to:'policy.linear2',toPort:'x1',label:'횡오차를 정책 관측 x1에 입력'},{kind:'edge',from:'std.headingErr',fromPort:'e',to:'policy.linear2',toPort:'x2',label:'헤딩오차를 정책 관측 x2에 입력'},{kind:'edge',from:'clamp',fromPort:'v',to:'sink.steer',toPort:'x',label:'정책 행동을 안전 범위로 제한'},{kind:'edge',from:'reward.track',fromPort:'reward',to:'sink.reward',toPort:'x',label:'보상 신호를 평가 출력에 연결'}], unlock:'Policy · Reward boundary' },
]
export const ACADEMY_LEVELS:Level[]=[
  {id:'tut',n:1,title:'신호를 행동으로',kicker:'GRAPH ACADEMY · 01',path:'academy',teach:'파트를 직접 놓고 출력 포트를 입력 포트에 연결해 첫 데이터 흐름을 만드세요.',palette:['const','sink.throttle'],objective:{type:'motion',target:2},starter:TUT,requiredOutputs:['sink.throttle'],requirements:[{kind:'skill',skill:'add',label:'Parts Bay에서 블록 장착'},{kind:'skill',skill:'connect',label:'출력→입력 포트 연결'},{kind:'edge',from:'const',fromPort:'v',to:'sink.throttle',toPort:'x',label:'Const를 THROTTLE에 연결'}],unlock:'배치 · 연결 · 실행'},
  {id:'a2',n:2,title:'목표와 현재를 비교',kicker:'GRAPH ACADEMY · 02',path:'academy',teach:'Speed를 다시 읽는 closed loop를 만들고 목표 8 m/s를 안정적으로 유지하세요.',palette:['const','src.speed','sub','ctrl.pid','clamp','sink.throttle'],objective:{type:'speed',target:8,hold:2,tolerance:.45},starter:makeGraph({}),requiredOutputs:['sink.throttle'],requirements:[{kind:'node',type:'sub',label:'target−current 오차 계산'},{kind:'node',type:'ctrl.pid',label:'PID feedback'},{kind:'edge',from:'clamp',fromPort:'v',to:'sink.throttle',toPort:'x',label:'제한된 command 실행'}],unlock:'Feedback · PID'},
  {id:'a3',n:3,title:'두 행동 출력',kicker:'GRAPH ACADEMY · 03',path:'academy',teach:'STEER와 THROTTLE을 각각 만들고 파라미터를 바꿔 두 actuator의 역할을 확인하세요.',palette:['const','sink.steer','sink.throttle'],objective:{type:'motion',target:2},starter:makeGraph({}),requiredOutputs:['sink.steer','sink.throttle'],requirements:[{kind:'node',type:'const',count:2,label:'서로 다른 command 두 개'},{kind:'skill',skill:'param',label:'Const 파라미터 조정'},{kind:'edge',from:'const',fromPort:'v',to:'sink.steer',toPort:'x',label:'STEER 연결'},{kind:'edge',from:'const',fromPort:'v',to:'sink.throttle',toPort:'x',label:'THROTTLE 연결'}],unlock:'두 출력 · 파라미터'},
  {id:'a4',n:4,title:'블록 안을 열어라',kicker:'GRAPH ACADEMY · 04',path:'academy',teach:'완성된 composite를 더블클릭해 내부 배선을 읽고, 편집 가능한 primitive 그래프로 펼치세요.',palette:['blk.pursuit','blk.speedPid','const','sink.steer','sink.throttle'],objective:{type:'skills'},starter:makeGraph({target:{type:'const',params:{value:8}},speed:{type:'blk.speedPid',in:{target:['n','target','v']}},throttle:{type:'sink.throttle',in:{x:['n','speed','throttle']}},pursuit:{type:'blk.pursuit'},steer:{type:'sink.steer',in:{x:['n','pursuit','steer']}}}),requirements:[{kind:'skill',skill:'open',label:'composite 더블클릭해 열기'},{kind:'skill',skill:'fork',label:'편집 가능한 그래프로 펼치기'}],unlock:'Open · Fork · 내부 배선'},
]

const RACE_PALETTE=['const','src.pose','src.track','src.speed','src.scan','src.objects','std.lookahead','std.tocar','std.curvAhead','std.gripSpeed','std.crossTrack','std.headingErr','lidar.preprocess','lidar.widestGap','objects.nearest','object.relative','ctrl.pid','ctrl.pursuit','ctrl.speed','add','sub','mul','div','clamp','select','lt','sink.steer','sink.throttle']

export const RACE_LEVELS:Level[]=[
  {id:'rt',n:1,title:'Time Trial',kicker:'SOLO QUALIFYING',path:'race',teach:'같은 차량·트랙·seed에서 오직 네 알고리즘의 가장 빠른 클린 랩을 기록하세요.',palette:RACE_PALETTE,objective:{type:'clean'},starter:PURSUIT,requirements:[],unlock:'개인 기록 · 결정론 검증'},
  {id:'rh',n:2,title:'Head-to-Head',kicker:'DUEL PRACTICE',path:'race',teach:'한 대의 라이벌과 동시에 출발해 접촉 없이 먼저 클린 랩을 완주하세요.',palette:RACE_PALETTE,objective:{type:'clean'},starter:PURSUIT,requirements:[],unlock:'1 VS 1 레이스'},
  {id:'rg',n:3,title:'Grid Start',kicker:'SIX-CAR PRACTICE',path:'race',teach:'여섯 대가 함께 출발하는 혼잡한 첫 코너에서 살아남아 클린 랩을 완주하세요.',palette:RACE_PALETTE,objective:{type:'clean'},starter:PURSUIT,requirements:[],unlock:'멀티카 레이스'},
]

export const ALL_LEVELS=[...ACADEMY_LEVELS,...LEVELS,...RACE_LEVELS]
export const levelById = (id: string) => ALL_LEVELS.find(l => l.id === id)!
