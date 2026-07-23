# Planning data contracts v1

상태: **v1 확정 (2026-07-22)**. overtaking, static avoidance, local planning을 Rule-based, MPC, RL 중 어느 방식으로도 조립하기 위한 공통 데이터 계약이다.

## 1. 불변 규칙

- 단위는 SI(`m`, `m/s`, `m/s²`, `rad`, `s`)이며 각도는 radian이다.
- 기본 좌표계는 world frame이다. 다른 frame의 값은 타입 또는 포트 이름으로 명시한다.
- 시간은 wall-clock이 아닌 simulation `tick`과 `simTime`만 사용한다.
- 배열 순서는 결정론적이어야 한다. 동률은 생성 순서, object는 안정적인 `id` 순서로 정렬한다.
- 결과 없음은 `null`보다 `found:bool`과 타입별 기본값을 사용한다.
- perception, prediction, behavior, planning, control은 데이터 타입으로 연결하며 서로의 알고리즘을 숨겨 호출하지 않는다.

## 2. Scene objects

```ts
type SceneObject = {
  id: string
  kind: 'vehicle' | 'static' | 'cone' | 'debris'
  pose: Pose
  velocity: Vec2
  yawRate: number
  shape: CircleShape | BoxShape | PolygonShape
  confidence: number
}
type ObjectSet = SceneObject[]
```

정적 물체는 velocity `(0,0)`, yawRate `0`이다. shape는 충돌·팽창 계산에 쓰며 점 장애물로 축약하지 않는다.

## 3. Corridor and drivable space

```ts
type Corridor = {
  samples: CorridorSample[]
  closed: boolean
}
type CorridorSample = {
  s: number
  center: Vec2
  heading: number
  leftWidth: number
  rightWidth: number
  speedLimit: number
}
type DrivableSpace = {
  reference: Corridor
  regions: Polygon[]
  blocked: Polygon[]
}
```

Corridor는 진행 방향·progress 기준이다. DrivableSpace는 장애물 때문에 좌우로 갈라지는 자유 공간을 표현한다. local planner는 단일 left/right 폭에 제한되지 않는다.

## 4. Trajectory

```ts
type Trajectory = {
  points: TrajectoryPoint[]
  duration: number
  valid: boolean
}
type TrajectoryPoint = {
  t: number
  state: VehicleState
  command: Command
}
type TrajectorySet = Trajectory[]
```

Path는 시간 없는 공간 경로, Trajectory는 시간·차량 상태·명령을 가진 동적 계획이다. MPC rollout, 상대 예측, 추월 후보, 비상정지가 이 타입을 공유한다.

## 5. Prediction

```ts
type Prediction = {
  objectId: string
  hypotheses: PredictionHypothesis[]
}
type PredictionHypothesis = {
  trajectory: Trajectory
  occupancy: TimedPolygon[]
  probability: number
}
type PredictionSet = Prediction[]
```

probability 합은 1이며 동률 순서는 안정적이다. occupancy는 물체 크기와 시간별 불확실성을 포함하므로 중심 궤적만으로 충돌을 판단하지 않는다.

## 6. Behavior intent and planning request

```ts
type BehaviorIntent = {
  mode: 'follow' | 'avoid' | 'pass-left' | 'pass-right' | 'yield' | 'return-line' | 'emergency-stop'
  targetObjectId: string
  targetOffset: number
  targetSpeed: number
  commitUntil: number
  priority: number
}
type PlanningRequest = {
  referencePath: Path
  targetProgress: number
  targetSpeed: number
  preferredOffset: number
  targetObjectId: string
  costs: CostTerm[]
  constraints: Constraint[]
  commitUntil: number
}
```

BehaviorIntent는 설명 가능한 상위 상태다. planner는 enum을 직접 해석하지 않고 PlanningRequest를 받는다. 따라서 state machine과 RL policy가 같은 planner를 사용할 수 있다.

## 7. Costs and constraints

```ts
type CostTerm = {
  kind: string
  weight: number
  params: Record<string, number>
}
type Constraint = {
  kind: string
  hard: boolean
  params: Record<string, number>
}
```

실제 팔레트에서는 문자열 kind를 편집하지 않는다. `cost.progress`, `cost.collision`, `cost.clearance`, `cost.smoothness`, `constraint.track`, `constraint.collision`, `constraint.speed`, `constraint.steer`처럼 타입별 생성 노드를 제공한다. 사용자 정의 항은 composite로 만든다.

## 8. Layer contracts

```text
Perception  → ObjectSet + DrivableSpace
Prediction  → PredictionSet
Behavior    → BehaviorIntent
Translation → PlanningRequest + CostTerm[] + Constraint[]
Planning    → TrajectorySet → Trajectory
Control     → Command
```

- Static avoidance: `VehicleState + ObjectSet + DrivableSpace + PlanningRequest → TrajectorySet`
- Overtaking: `VehicleState + ObjectSet + PredictionSet + DrivableSpace + PlanningRequest → TrajectorySet`
- Rule-based는 조건과 state machine으로 request와 후보를 만든다.
- MPC는 model rollout과 cost/constraint 평가로 후보를 선택한다.
- RL은 intent, request, trajectory 또는 command 중 명시된 한 계층만 출력한다.
- `Overtake`, `StaticAvoidance`, `LocalPlanner`, `MPPI`, `PPO`, `SAC` turnkey 노드는 팔레트에 두지 않는다.

### 8.1 구현 상태 (2026-07-23)

- `packages/core/src/planning/types.ts`에 v1 공통 타입과 결정론 연산을 구현했다.
- Scene: 동적/정적 객체 생성, 분해, 상대 위치, 최근접, 반경 필터, ObjectSet 조립.
- Space: Track→Corridor/DrivableSpace, 객체 occupancy 차단, point drivable 판정.
- Trajectory: vehicle state + command rollout, progress/clearance/collision, 후보 집합과 최소 비용 선택.
- Prediction: constant-velocity trajectory와 시간별 box occupancy, PredictionSet 조립과 미래 clearance.
- Behavior: follow/avoid/pass-left/pass-right/emergency intent, intent→PlanningRequest 변환.
- Objective: progress/collision/clearance/tracking/smoothness/control 비용과 track/collision/speed/steer 제약, trajectory 평가.
- 모든 타입은 `validate.ts`의 서로 다른 포트 타입으로 검사되며 `nodeMeta.ts` 마스터 팔레트에 한국어 설명과 함께 노출된다.
- 현재 shape 생성 노드는 box 기반이다. polygon 생성/불확실성 팽창은 후속 perception·prediction 웨이브에서 추가한다.
- Path: `points.empty/append`로 점열을 조립하고 `path.fromPoints/midpoints/offset/resample`로 닫힌 reference path를 생성·변형한다. waypoint의 s/heading/curvature는 결정론적으로 재계산한다.
- rollout은 일정 command와 시간별 `CommandSequence`를 모두 지원한다. `commands.steerLattice`→`trajectories.rolloutLattice`로 결정론적 N개 후보를 생성할 수 있다.
- `trajectory.evaluate`와 batch `trajectories.evaluate`는 raw/weighted cost breakdown 및 constraint violation의 시점·위치를 반환한다. valid-aware 선택은 invalid 후보를 제외한다.
- 현재 rollout은 일정 command 후보용 기본 enabler다. `array.pack2`로 후보 비용 순서를 고정하고 `trajectory.commandAt`→`command.parts`로 선택된 첫 명령을 actuator에 전달한다.
- RL 배포 경계는 열리는 `policy.linear2` composite이며, `reward.track`→`sink.reward` 평가 경로는 command와 분리된다. PPO/SAC 같은 학습 알고리즘은 여전히 노드로 제공하지 않는다.
- `test/planning.ts`가 Path 생성·offset·resample·midpoint 복원과 전체 데이터 흐름, 결정론, hard constraint, 최소 비용 선택, turnkey 노드 부재와 완성된 MPC/RL 참조 그래프의 클린 랩을 검증한다.

## 9. VISUALIZE contract

VISUALIZE는 graph output을 읽기만 하며 시뮬레이션 결과에 영향을 주지 않는다.

```ts
type VisualizedSignal = {
  nodeId: string
  port: string
  label: string
  unit: string
  valueType: string
  view: 'auto' | 'time' | 'xy' | 'track' | 'event'
}
type VisualizationSample = {
  tick: number
  simTime: number
  values: Record<string, unknown>
}
```

- scalar는 timeline, bool은 event, Vec2/Pose/Path/Trajectory/ObjectSet/PredictionSet/DrivableSpace는 track overlay가 기본 view다.
- 화면 다운샘플링은 허용하지만 원본 simulation tick, 비용, 랩 결과를 바꾸면 안 된다.
- 신호 키는 root `nodeId.port`, composite 내부 `blockId/innerNodeId.port` 형식이다.
- NaN, saturation, constraint violation, collision risk는 timeline event marker 대상이다.

## 10. 구현 순서

1. 숫자 output timeline과 run reset
2. 여러 신호 비교와 저장된 experiment preset
3. Vec2/Pose/Path/Trajectory track overlay
4. ObjectSet/PredictionSet/DrivableSpace overlay
5. run scrubber와 A/B comparison
6. cost breakdown과 constraint event marker
