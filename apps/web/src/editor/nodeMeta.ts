// Display metadata for palette + editor nodes. Ports (ins/outs) come from core NT.
import { NT } from '@apex/core'

export type ParamSpec = { key:string; label:string; min:number; max:number; step:number; def:number }
export type Meta = { label:string; cat:string; params?:ParamSpec[]; desc?:string; real?:string }

// category colors (lane-ish)
export const CAT_COLOR: Record<string,string> = {
  Sensors:'#6FA8DC', Math:'#9AA6B4', Logic:'#E4736A', Array:'#B58BE0',
  Geometry:'#E7B24C', Planning:'#E7B24C', Control:'#1FDDC9', Random:'#c98bff', Model:'#8fd6c9', Output:'#1FDDC9',
}

export const META: Record<string, Meta> = {
  'src.scan':{label:'LiDAR scan',cat:'Sensors',desc:'LiDAR 거리 측정. 여러 빔이 각 방향으로 벽까지 거리를 잼. ranges=거리 배열, a0=시작 각도, da=빔 간격.',real:'실제 F1TENTH의 /scan 토픽.'},
  'src.speed':{label:'Speed',cat:'Sensors',desc:'차의 현재 전진 속도(m/s).'},
  'src.pose':{label:'Pose',cat:'Sensors',desc:'차의 현재 위치·방향 {x, y, yaw(방향각)}.',real:'Localization의 출력.'},
  'src.track':{label:'Track',cat:'Sensors',desc:'트랙 중심선(웨이포인트 목록). 경로 계획에 사용.'},
  'const':{label:'Const',cat:'Math',desc:'고정 숫자. 목표 속도·게인 같은 파라미터로 씀. value에 값을 넣어.',params:[{key:'value',label:'value',min:-20,max:20,step:0.1,def:1}]},
  'add':{label:'+',cat:'Math',desc:'두 수를 더함 (a + b).'},'sub':{label:'−',cat:'Math',desc:'두 수를 뺌 (a − b). 예: 목표속도 − 현재속도 = 오차.'},
  'mul':{label:'×',cat:'Math',desc:'두 수를 곱함 (a × b). 게인 곱하기 등.'},'div':{label:'÷',cat:'Math',desc:'두 수를 나눔 (a ÷ b).'},
  'abs':{label:'abs',cat:'Math',desc:'절댓값(부호 제거). |x|.'},
  'clamp':{label:'clamp',cat:'Math',desc:'값을 lo~hi 범위로 자름. 조향·스로틀을 −1~1로 제한할 때 필수.',params:[{key:'lo',label:'lo',min:-2,max:2,step:0.1,def:-1},{key:'hi',label:'hi',min:-2,max:2,step:0.1,def:1}]},
  'lt':{label:'<',cat:'Logic',desc:'a가 b보다 작으면 참(true).'},'select':{label:'select',cat:'Logic',desc:'조건 c가 참이면 a, 아니면 b를 출력. 분기.'},
  'array.argmax':{label:'argmax',cat:'Array',desc:'배열에서 가장 큰 값의 위치(인덱스). 예: 가장 먼 LiDAR 빔 = 가장 열린 방향 찾기.'},
  'array.max':{label:'max',cat:'Array',desc:'배열의 최댓값.'},'array.len':{label:'len',cat:'Array',desc:'배열의 길이(개수).'},
  'array.map':{label:'Map',cat:'Array',desc:'배열의 각 원소에 같은 연산을 적용해 새 배열을 만듦.'},
  'std.lookahead':{label:'Lookahead point',cat:'Geometry',desc:'전방 Ld미터 앞의 경로 지점(목표점)을 찾음. Pure Pursuit가 이 점을 향해 조향.',real:'F1TENTH 기본 컨트롤러의 L1 점.'},
  'std.tocar':{label:'To car frame',cat:'Geometry',desc:'월드 좌표의 점을 차 기준 좌표로 변환. e.y가 좌우 오차(양수=왼쪽).'},
  'vec.xy':{label:'vec → x,y',cat:'Geometry',desc:'벡터(예: To car frame의 e)를 x·y 성분으로 분해. Pure Pursuit는 좌우 오차 y를 씀.'},
  'vec.len':{label:'vec length',cat:'Geometry',desc:'벡터의 크기(길이) √(x²+y²). 목표점까지의 거리 Ld를 구할 때.'},
  'std.curvAhead':{label:'Curvature ahead',cat:'Geometry',desc:'전방 코너가 얼마나 급한지(곡률). 코너에서 속도를 줄일 때 사용.'},
  'std.gripSpeed':{label:'Grip speed',cat:'Planning',desc:'곡률과 타이어 마찰로 코너 최대 속도를 계산 √(μ·g·R). 코너에서 스스로 감속.',params:[{key:'vmax',label:'vmax',min:6,max:17,step:0.5,def:13},{key:'margin',label:'margin',min:0.5,max:1.05,step:0.02,def:0.85}]},
  'ctrl.pid':{label:'PID',cat:'Control',desc:'오차(err)를 0으로 만드는 제어기. 예: (목표속도 − 현재속도)를 넣으면 스로틀을 냄. kp=반응세기, ki=누적, kd=미분.',params:[{key:'kp',label:'kp',min:0,max:2,step:0.05,def:0.6},{key:'ki',label:'ki',min:0,max:0.3,step:0.01,def:0.06},{key:'kd',label:'kd',min:0,max:0.5,step:0.01,def:0}]},
  'rng.uniform':{label:'rand',cat:'Random',desc:'난수(결정론 시드). MPPI·RL 탐색용.'},'rng.gauss':{label:'gauss',cat:'Random',desc:'정규분포 난수. 탐색용.'},
  'sim.predict':{label:'predict (model)',cat:'Model',desc:'차량 모델로 다음 상태를 예측. MPPI·MPC가 미래를 굴려볼 때.'},
  'sink.steer':{label:'▸ STEER',cat:'Output',desc:'최종 조향 출력 (−1 왼쪽 ~ +1 오른쪽). 그래프의 결과 중 하나.'},
  'sink.throttle':{label:'▸ THROTTLE',cat:'Output',desc:'최종 스로틀 출력 (−1 제동 ~ +1 가속). 차를 움직이려면 반드시 연결.'},
}

export function ins(type:string):string[]{ return NT[type]?.ins ?? [] }
export function outs(type:string):string[]{ return NT[type]?.outs ?? [] }
export function metaOf(type:string):Meta{ return META[type] ?? {label:type,cat:'Math'} }
export function colorOf(type:string):string{ return CAT_COLOR[metaOf(type).cat] ?? '#9AA6B4' }
export function defaultParams(type:string):Record<string,number>{
  const o:Record<string,number>={}; (metaOf(type).params??[]).forEach(p=>o[p.key]=p.def); return o
}

// palette grouped by category (which node types the player can drop)
export const PALETTE_CATS: {cat:string; types:string[]}[] = [
  {cat:'Sensors',  types:['src.scan','src.speed','src.pose','src.track']},
  {cat:'Math',     types:['const','add','sub','mul','div','abs','clamp']},
  {cat:'Logic',    types:['lt','select']},
  {cat:'Array',    types:['array.argmax','array.max','array.len']},
  {cat:'Geometry', types:['std.lookahead','std.tocar','vec.xy','vec.len','std.curvAhead']},
  {cat:'Control',  types:['ctrl.pid']},
  {cat:'Planning', types:['std.gripSpeed']},
  {cat:'Output',   types:['sink.steer','sink.throttle']},
]
