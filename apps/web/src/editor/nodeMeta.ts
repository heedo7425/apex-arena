// Display metadata for palette + editor nodes. Ports (ins/outs) come from core NT.
import { NT } from '@apex/core'

export type ParamSpec = { key:string; label:string; min:number; max:number; step:number; def:number }
export type Meta = { label:string; cat:string; params?:ParamSpec[]; desc?:string; real?:string }

// category colors (lane-ish)
export const CAT_COLOR: Record<string,string> = {
  Sensors:'#6FA8DC', Math:'#9AA6B4', Logic:'#E4736A', Array:'#B58BE0', Vector:'#67C88A', State:'#D69A57',
  Struct:'#6FA8DC', Path:'#E7B24C', Geometry:'#E7B24C', LiDAR:'#B58BE0', Planning:'#E7B24C', Control:'#1FDDC9', Random:'#c98bff', Model:'#8fd6c9', Output:'#1FDDC9',
  Module:'#8C7CF0', Composite:'#8C7CF0',
}

export const META: Record<string, Meta> = {
  'src.scan':{label:'LiDAR scan',cat:'Sensors',desc:'LiDAR 거리 측정. 여러 빔이 각 방향으로 벽까지 거리를 잼. ranges=거리 배열, a0=시작 각도, da=빔 간격.',real:'실제 F1TENTH의 /scan 토픽.'},
  'src.speed':{label:'Speed',cat:'Sensors',desc:'차의 현재 전진 속도(m/s).'},
  'src.pose':{label:'Pose',cat:'Sensors',desc:'차의 현재 위치·방향 {x, y, yaw(방향각)}.',real:'Localization의 출력.'},
  'src.track':{label:'Track',cat:'Sensors',desc:'트랙 중심선(웨이포인트 목록). 경로 계획에 사용.'},
  'src.surface':{label:'Surface grip',cat:'Sensors',desc:'현재 노면의 마찰계수 μ와 중력가속도 g. 그립 한계 속도 계산에 사용.'},
  'const':{label:'Const',cat:'Math',desc:'고정 숫자. 목표 속도·게인 같은 파라미터로 씀. value에 값을 넣어.',params:[{key:'value',label:'value',min:-20,max:20,step:0.1,def:1}]},
  'add':{label:'+',cat:'Math',desc:'두 수를 더함 (a + b).'},'sub':{label:'−',cat:'Math',desc:'두 수를 뺌 (a − b). 예: 목표속도 − 현재속도 = 오차.'},
  'mul':{label:'×',cat:'Math',desc:'두 수를 곱함 (a × b). 게인 곱하기 등.'},'div':{label:'÷',cat:'Math',desc:'두 수를 나눔 (a ÷ b).'},
  'abs':{label:'abs',cat:'Math',desc:'절댓값(부호 제거). |x|.'},'neg':{label:'−x',cat:'Math',desc:'부호 반전 (−x).'},'sign':{label:'sign',cat:'Math',desc:'부호(+1 / 0 / −1).'},
  'mod':{label:'mod',cat:'Math',desc:'나머지 (a mod b). 각도 wrap 등에.'},'pow':{label:'xʸ',cat:'Math',desc:'거듭제곱 (a^b).'},'sqrt':{label:'√',cat:'Math',desc:'제곱근 √x. 예: grip 속도 √(μg/κ).'},
  'min':{label:'min',cat:'Math',desc:'두 수 중 작은 값.'},'max':{label:'max',cat:'Math',desc:'두 수 중 큰 값.'},
  'lerp':{label:'lerp',cat:'Math',desc:'선형 보간 a+(b−a)·t. 부드럽게 섞기.'},
  'sin':{label:'sin',cat:'Math',desc:'사인 sin(x). x는 라디안.'},'cos':{label:'cos',cat:'Math',desc:'코사인 cos(x).'},
  'atan2':{label:'atan2',cat:'Math',desc:'atan2(y, x) — 벡터의 방향각(rad). 헤딩·조향각 계산에.'},'hypot':{label:'hypot',cat:'Math',desc:'√(a²+b²). 빗변/거리.'},
  'wrapAngle':{label:'wrap∠',cat:'Math',desc:'각도를 −π~π로 감쌈. 헤딩 오차에 필수.'},
  'clamp':{label:'clamp',cat:'Math',desc:'값을 lo~hi 범위로 자름. 조향·스로틀을 −1~1로 제한할 때 필수.',params:[{key:'lo',label:'lo',min:-2,max:2,step:0.1,def:-1},{key:'hi',label:'hi',min:-2,max:2,step:0.1,def:1}]},
  'lt':{label:'<',cat:'Logic',desc:'a가 b보다 작으면 참(true).'},'gt':{label:'>',cat:'Logic',desc:'a가 b보다 크면 참.'},
  'le':{label:'≤',cat:'Logic',desc:'a ≤ b 이면 참.'},'ge':{label:'≥',cat:'Logic',desc:'a ≥ b 이면 참.'},
  'eq':{label:'=',cat:'Logic',desc:'a와 b가 (거의) 같으면 참.'},'ne':{label:'≠',cat:'Logic',desc:'a와 b가 다르면 참.'},
  'and':{label:'and',cat:'Logic',desc:'둘 다 참이면 참.'},'or':{label:'or',cat:'Logic',desc:'하나라도 참이면 참.'},'not':{label:'not',cat:'Logic',desc:'참/거짓 반전.'},
  'select':{label:'select',cat:'Logic',desc:'조건 c가 참이면 a, 아니면 b를 출력. 분기.'},
  'vec.make':{label:'Vec2',cat:'Vector',desc:'x·y를 벡터로 묶음.'},'vec.scale':{label:'v×s',cat:'Vector',desc:'벡터에 스칼라 곱.'},
  'vec.add':{label:'v+v',cat:'Vector',desc:'두 벡터 합.'},'vec.sub':{label:'v−v',cat:'Vector',desc:'두 벡터 차 (a−b).'},
  'vec.dot':{label:'dot',cat:'Vector',desc:'내적 a·b (스칼라).'},'vec.normalize':{label:'norm',cat:'Vector',desc:'단위벡터로 정규화(길이 1).'},
  'vec.rotate':{label:'rotate',cat:'Vector',desc:'벡터를 각도 θ만큼 회전.'},'vec.angle':{label:'∠v',cat:'Vector',desc:'벡터의 방향각 atan2(y,x).'},
  'vec.dist':{label:'dist',cat:'Vector',desc:'두 점 사이 거리.'},
  'pose.parts':{label:'Pose parts',cat:'Struct',desc:'Pose 구조체를 위치 x·y와 방향각 yaw 숫자로 분해.'},
  'wpt.parts':{label:'Waypoint parts',cat:'Struct',desc:'웨이포인트를 x·y·누적거리 s·곡률 kappa·방향 psi·목표속도 vref로 분해.'},
  'path.nearestIndex':{label:'Nearest waypoint',cat:'Path',desc:'트랙 중심선에서 입력 점 pt와 가장 가까운 웨이포인트 인덱스 i를 찾음.'},
  'path.advanceByDist':{label:'Advance by distance',cat:'Path',desc:'트랙 인덱스 i에서 거리 d만큼 전진한 목표점 pt와 새 인덱스 i2를 계산.'},
  'path.at':{label:'Waypoint at index',cat:'Path',desc:'트랙의 i번째 웨이포인트를 꺼냄. 위치·방향·곡률을 다시 분해할 수 있음.'},
  'path.maxCurvature':{label:'Max curvature ahead',cat:'Path',desc:'인덱스 i부터 거리 d 앞까지 가장 큰 절대 곡률을 읽음.'},
  'st.delay':{label:'z⁻¹',cat:'State',desc:'한 tick 이전 값을 냄(지연). 피드백 고리는 반드시 이 노드 경유.'},
  'st.accum':{label:'∫',cat:'State',desc:'값을 dt 간격으로 누적 Σx·dt (적분).'},
  'st.lowpass':{label:'lowpass',cat:'State',desc:'저역통과 필터로 부드럽게. α가 클수록 반응 빠름.',params:[{key:'alpha',label:'α',min:0.01,max:1,step:0.01,def:0.15}]},
  'st.rateLimit':{label:'rate lim',cat:'State',desc:'초당 변화량을 rate로 제한(급변 억제).',params:[{key:'rate',label:'rate',min:0.1,max:20,step:0.1,def:4}]},
  'array.argmax':{label:'argmax',cat:'Array',desc:'배열에서 가장 큰 값의 위치(인덱스). 예: 가장 먼 LiDAR 빔 = 가장 열린 방향 찾기.'},
  'array.argmin':{label:'argmin',cat:'Array',desc:'가장 작은 값의 위치(인덱스).'},
  'array.max':{label:'max[]',cat:'Array',desc:'배열의 최댓값.'},'array.min':{label:'min[]',cat:'Array',desc:'배열의 최솟값.'},
  'array.sum':{label:'sum',cat:'Array',desc:'배열의 합.'},'array.mean':{label:'mean',cat:'Array',desc:'배열의 평균.'},
  'array.len':{label:'len',cat:'Array',desc:'배열의 길이(개수).'},
  'array.get':{label:'get[i]',cat:'Array',desc:'배열의 i번째 원소(범위 밖은 양끝으로 자름).'},
  'array.slice':{label:'slice',cat:'Array',desc:'i~j 구간을 잘라 새 배열.'},
  'array.window':{label:'window',cat:'Array',desc:'i부터 w개(닫힌 트랙은 끝에서 앞으로 감쌈). 전방 구간 볼 때.'},
  'array.range':{label:'range',cat:'Array',desc:'0..n−1 정수 배열.'},'array.diff':{label:'diff',cat:'Array',desc:'이웃 원소 차이 배열(길이 −1). 곡률·기울기.'},
  'array.map':{label:'Map',cat:'Array',desc:'배열의 각 원소에 같은 연산(내부 서브그래프)을 적용해 새 배열을 만듦.'},
  'std.lookahead':{label:'Lookahead point',cat:'Geometry',desc:'전방 Ld미터 앞의 경로 지점(목표점)을 찾음. Pure Pursuit가 이 점을 향해 조향.',real:'F1TENTH 기본 컨트롤러의 L1 점.'},
  'std.tocar':{label:'To car frame',cat:'Geometry',desc:'월드 좌표의 점을 차 기준 좌표로 변환. e.y가 좌우 오차(양수=왼쪽).'},
  'vec.xy':{label:'vec → x,y',cat:'Vector',desc:'벡터(예: To car frame의 e)를 x·y 성분으로 분해. Pure Pursuit는 좌우 오차 y를 씀.'},
  'vec.len':{label:'vec length',cat:'Vector',desc:'벡터의 크기(길이) √(x²+y²). 목표점까지의 거리 Ld를 구할 때.'},
  'std.curvAhead':{label:'Curvature ahead',cat:'Geometry',desc:'전방 코너가 얼마나 급한지(곡률). 코너에서 속도를 줄일 때 사용.'},
  'std.gripSpeed':{label:'Grip speed',cat:'Planning',desc:'곡률과 타이어 마찰로 코너 최대 속도를 계산 √(μ·g·R). 코너에서 스스로 감속.',params:[{key:'vmax',label:'vmax',min:6,max:17,step:0.5,def:13},{key:'margin',label:'margin',min:0.5,max:1.05,step:0.02,def:0.85}]},
  'ctrl.pid':{label:'PID',cat:'Control',desc:'오차(err)를 0으로 만드는 제어기. 예: (목표속도 − 현재속도)를 넣으면 스로틀을 냄. kp=반응세기, ki=누적, kd=미분.',params:[{key:'kp',label:'kp',min:0,max:2,step:0.05,def:0.6},{key:'ki',label:'ki',min:0,max:0.3,step:0.01,def:0.06},{key:'kd',label:'kd',min:0,max:0.5,step:0.01,def:0}]},
  'std.nearestWpt':{label:'Nearest waypoint data',cat:'Geometry',desc:'점 pt에 가장 가까운 트랙 웨이포인트와 인덱스를 함께 찾는 열리는 표준 블록.'},
  'std.crossTrack':{label:'Cross-track error',cat:'Geometry',desc:'차량이 중심선의 왼쪽·오른쪽으로 얼마나 벗어났는지 부호 있는 거리로 계산.'},
  'std.headingErr':{label:'Heading error',cat:'Geometry',desc:'트랙 진행 방향과 차량 방향의 각도 차이를 −π~π로 계산.'},
  'lidar.widestGap':{label:'Widest gap',cat:'LiDAR',desc:'최소 여유거리보다 먼 빔이 가장 길게 이어지는 구간의 중심을 찾음.',params:[{key:'minClear',label:'min clear',min:0.5,max:15,step:0.5,def:3}]},
  'lidar.preprocess':{label:'LiDAR preprocess',cat:'LiDAR',desc:'비정상 거리값을 제거하고 센서 최대거리로 잘라 안정적인 배열을 만듦.',params:[{key:'maxRange',label:'max range',min:5,max:50,step:1,def:30}]},
  'lidar.freeAhead':{label:'Free ahead',cat:'LiDAR',desc:'정면 주변 여러 빔 중 가장 가까운 장애물까지의 거리를 계산.',params:[{key:'width',label:'beam width',min:1,max:31,step:2,def:5}]},
  'array.sanitizeRanges':{label:'sanitize ranges',cat:'Array',desc:'유효하지 않거나 음수인 거리값을 0으로 바꾸고 최대거리로 제한.'},
  'array.widestAbove':{label:'widest above',cat:'Array',desc:'기준값 이상인 값이 가장 길게 연속되는 구간의 중심과 폭을 찾음.'},
  'array.centerMin':{label:'center min',cat:'Array',desc:'배열 중앙의 w개 값 중 최솟값을 계산.'},
  'cparam':{label:'Block parameter',cat:'Composite',desc:'바깥 composite에 설정된 튜닝 값을 내부 계산으로 전달.'},
  'rng.uniform':{label:'rand',cat:'Random',desc:'난수(결정론 시드). MPPI·RL 탐색용.'},'rng.gauss':{label:'gauss',cat:'Random',desc:'정규분포 난수. 탐색용.'},
  'sim.predict':{label:'predict (model)',cat:'Model',desc:'차량 모델로 다음 상태를 예측. MPPI·MPC가 미래를 굴려볼 때.'},
  'sink.steer':{label:'▸ STEER',cat:'Output',desc:'최종 조향 출력 (−1 왼쪽 ~ +1 오른쪽). 그래프의 결과 중 하나.'},
  'sink.throttle':{label:'▸ THROTTLE',cat:'Output',desc:'최종 스로틀 출력 (−1 제동 ~ +1 가속). 차를 움직이려면 반드시 연결.'},
  'blk.pursuit':{label:'▣ Pursuit 조향',cat:'Module',desc:'L2에서 만든 Pure Pursuit 조향 전체. 더블클릭하면 내부 표준 블록까지 단계별로 탐색할 수 있음.'},
  'blk.speedPid':{label:'▣ Speed PID',cat:'Module',desc:'L1에서 만든 속도 PID 제어기. 목표속도(target)를 받아 throttle을 내며 열기·fork를 지원.'},
  'cin':{label:'in',cat:'Composite',desc:'블록 내부에서 바깥 입력을 받는 자리표.'},
  'blk.user':{label:'▣ 내 블록',cat:'Module',desc:'네가 노드들을 묶어 만든 블록. 더블클릭해 열어보거나 fork로 풀 수 있어.'},
}

// dynamic ports for user blocks (per-instance); everything else reads NT.
export function insOf(type:string, data?:any):string[]{ return type==='blk.user' ? (data?.params?.inPorts??[]).map((p:any)=>p.name) : ins(type) }
export function outsOf(type:string, data?:any):string[]{ return type==='blk.user' ? (data?.params?.outPorts??[]).map((p:any)=>p.name) : outs(type) }

export function ins(type:string):string[]{ return NT[type]?.ins ?? [] }
export function outs(type:string):string[]{ return NT[type]?.outs ?? [] }
export function metaOf(type:string):Meta{ return META[type] ?? {label:type,cat:'Math'} }
export function colorOf(type:string):string{ return CAT_COLOR[metaOf(type).cat] ?? '#9AA6B4' }
export function defaultParams(type:string):Record<string,number>{
  const o:Record<string,number>={}; (metaOf(type).params??[]).forEach(p=>o[p.key]=p.def); return o
}

// palette grouped by category (which node types the player can drop)
// master catalog (palette-v1). Levels expose a curated SUBSET via level.palette.
// Higher-order (map/filter/reduce/zipWith) are omitted until lambda authoring exists.
export const PALETTE_CATS: {cat:string; types:string[]}[] = [
  {cat:'Sensors',  types:['src.scan','src.speed','src.pose','src.track']},
  {cat:'Math',     types:['const','add','sub','mul','div','abs','neg','sign','mod','pow','sqrt','min','max','clamp','lerp','sin','cos','atan2','hypot','wrapAngle']},
  {cat:'Logic',    types:['lt','gt','le','ge','eq','ne','and','or','not','select']},
  {cat:'Vector',   types:['vec.make','vec.xy','vec.len','vec.scale','vec.add','vec.sub','vec.dot','vec.normalize','vec.rotate','vec.angle','vec.dist']},
  {cat:'Struct',   types:['pose.parts','wpt.parts']},
  {cat:'Array',    types:['array.get','array.slice','array.window','array.range','array.diff','array.argmax','array.argmin','array.max','array.min','array.sum','array.mean','array.len','array.sanitizeRanges','array.widestAbove','array.centerMin']},
  {cat:'Path',     types:['path.nearestIndex','path.advanceByDist','path.at','path.maxCurvature']},
  {cat:'State',    types:['st.delay','st.accum','st.lowpass','st.rateLimit']},
  {cat:'Geometry', types:['std.lookahead','std.tocar','std.curvAhead','std.nearestWpt','std.crossTrack','std.headingErr']},
  {cat:'LiDAR',    types:['lidar.preprocess','lidar.widestGap','lidar.freeAhead']},
  {cat:'Control',  types:['ctrl.pid']},
  {cat:'Planning', types:['std.gripSpeed']},
  {cat:'Model',    types:['sim.predict','rng.uniform','rng.gauss']},
  {cat:'Module',   types:['blk.pursuit','blk.speedPid']},
  {cat:'Output',   types:['sink.steer','sink.throttle']},
]
