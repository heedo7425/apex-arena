# Apex-arena — Palette Catalog v1 (확정)

**결정일 2026-07-21.** 왼쪽 팔레트에 **존재하는 노드 어휘 전체**를 여기서 못 박는다. 레벨별 노출은
이 집합의 **부분집합**만 큐레이션한다(레벨이 노드를 새로 만들지 않는다). 파생/유도는 `node-spec.md` §3·§5 참조.

## 결정 요약
- **L1 선 = 넉넉하되 전부 "열리는 합성".** 재사용 메서드는 팔레트로 주되(To Car Frame, Curvature ahead,
  Grip speed, Widest gap, Lookahead, PID …), **모든 L1 노드는 `composite`(내부 서브그래프)** 로 정의 →
  더블클릭하면 L0로 짜인 속을 보고 fork. 기본은 쉽게, 고인물은 뜯어봄.
- **v1 범위 = Act-1 완결 + Path(웨이포인트 생성) + Model(MPPI).** 약 75노드.

## 팔레트 소속 규칙 (드리프트 방지)
| 계층 | 정체 | 처리 |
|---|---|---|
| **L0 프리미티브** | 원자(수학·논리·벡터·구조체·배열·상태). `kind:'prim'` | 팔레트, 항상 존재 |
| **L1 표준 메서드** | *이름 붙은 재사용 부품* — 여러 알고리즘에 두루 쓰이고 **특정 알고리즘의 정체는 아님**. `kind:'composite'`(열림) | 팔레트, 열어서 fork |
| **예제 그래프(팔레트 아님)** | **알고리즘의 시그니처 결정규칙** = 유저가 조립 | 불러와서 열고 fork |

**예제 그래프로만(팔레트 금지):** Pure Pursuit `k=2y/Ld²` · Steer-from-curvature · Stanley 조향식 ·
Follow-the-Gap `argmax→각도` · 완성 속도정책. (2026-07-21 `std.pursuitCurv`/`std.steerFromCurv` 제거 = 이 규칙의 첫 적용.)

---

## 카탈로그 (`✓`=구현됨 · `+`=추가 · `⏱`=상태노드 · `λ`=내부 서브그래프)

### 0. Sources / Sensors  (경계, 매 tick 읽기)
`src.pose ✓` · `src.speed ✓` · `src.twist +`(vx,vy,w) · `src.scan ✓` ·
`src.track ✓`(주어진 센터라인, 안 써도 됨) · `src.bounds +`(left/right array<vec2>) · `src.dt +`

### 1. Math · L0 (num)
`const ✓` · `add ✓` `sub ✓` `mul ✓` `div ✓` · `mod +` `pow +` `sqrt +` `abs ✓` `neg +` `sign +` ·
`min +` `max +` `clamp ✓` `lerp +` · `sin +` `cos +` `atan2 +` `hypot +` `wrapAngle +`

### 2. Logic · L0 (bool)
`lt ✓` `gt +` `le +` `ge +` `eq +` `ne +` · `and +` `or +` `not +` · `select ✓`

### 3. Vector / Geometry · L0 (vec2)
`vec.make +`(x,y→vec2) · `vec.xy ✓`(→x,y) · `vec.len ✓` · `vec.scale +` `vec.add +` `vec.sub +` ·
`vec.dot +` `vec.normalize +` `vec.rotate +`(v,θ) · `vec.angle +`(angleOf) · `vec.dist +`

### 4. Struct · L0  (커스텀 노드·웨이포인트 생성 전제)
`pose.parts ✓`(x/y/yaw) · `wpt.parts ✓`(x/y/s/kappa/psi/vref) ·
`make.waypoint +` · `make.command +`

### 5. Array & Iteration · L0  (핵심 enabler)
`array.len ✓` `array.get +`(index) `array.slice +` `array.window +`(닫힌트랙 wrap) `array.range +` `array.diff +` ·
**고차λ:** `array.map ✓`λ `array.filter +`λ `array.reduce +`λ `array.zipWith +`λ ·
**리덕션:** `array.sum +` `array.mean +` `array.max ✓` `array.min +` `array.argmax ✓` `array.argmin +` ·
**센서 배열:** `array.sanitizeRanges ✓` `array.widestAbove ✓` `array.centerMin ✓`

### 6. Stateful · L0 ⏱  (피드백 = 반드시 이 노드 경유)
`st.delay +`(z⁻¹) · `st.accum +`(Σx·dt) · `st.lowpass +`(α) · `st.rateLimit +` · `ctrl.pid ✓`(=delay+accum 합성, L1)

### 7. L1 — Geometry / Perception  (composite, 열림)
`std.tocar ✓`(To Car Frame) · `std.nearestWpt ✓` · `std.curvAhead ✓`(Curvature ahead) ·
`std.headingErr ✓` · `std.crossTrack ✓` · `std.lookahead ✓`(Lookahead point)

### 8. L1 — LiDAR  (composite, 열림)
`lidar.preprocess ✓`(sanitize/clip) · `lidar.widestGap ✓` · `lidar.freeAhead ✓`

### 9. Planning / Path  (L1 composite + L0 경계 프리미티브)
`std.gripSpeed ✓`(Grip speed) · `path.nearestIndex ✓` · `path.advanceByDist ✓` · `path.at ✓` · `path.maxCurvature ✓` ·
`path.midpoints +`(bounds→센터라인) · `path.resample +`(ds)

### 10. L1 — Control  (composite, 열림)
`ctrl.pid ✓` · `clamp ✓`(L0지만 여기 노출) · `std.rateLimit`/`std.lowpass`(§6)
— **Pursuit/Steer/Stanley 조향식은 여기 없음**(예제 그래프).

### 11. Model — MPC/MPPI/RL 훅
`sim.predict ✓`(1-step) · `trajectory.rollout ✓`(일정 command 미래) · `rng.uniform ✓` · `rng.gauss ✓` · `policy.linear2 ✓`(열리는 추론 경계) · `reward.track ✓`(열리는 평가식)

### 12. Sinks · L0 (경계, 필수 둘 다)
`sink.steer ✓` · `sink.throttle ✓` · `sink.reward ✓`(평가 전용, 제어 불변)

### 13. 캡슐화 (노드 아님, 에디터 기능)
서브그래프 선택 → **"노드로 만들기"** → 재사용 composite(= 내 L1). L1을 늘리는 위쪽 escape hatch.

---

## 구현 웨이브 (정하고 시작)
- **P-a · L0 채우기** — Math 확장 + Vector/Struct + Array 고차/윈도우 + Stateful.
  → 현재 알고리즘(pursuit·FTG·grip)이 프리미티브만으로 짜여야 함(회귀검증: 랩타임 동일).
- **P-b · L1 = composite 전환** — 현 opaque `std.*`(fn)를 내부 서브그래프로 재정의(engine `composite` 지원 이미 있음) →
  에디터 "열기"로 속 보이고 fork. + 신규 L1(crossTrack·headingErr·widestGap·nearestWpt …).
- **P-c · Path + Model** — 웨이포인트 생성 노드 + `sim.rollout`(MPPI 샘플 궤적 시각화).
- **P-d · Scene + Local Planning** — ObjectSet·DrivableSpace·Prediction·Intent·PlanningRequest·TrajectorySet을 기반으로 static avoidance와 overtaking을 조립한다.
  turnkey Overtake/Planner 노드는 금지하고 perception→prediction→behavior→planning→control 경계를 유지한다.

각 웨이브 합격 = 기존 랩 결정론 유지 + 대표 알고리즘 1개가 새 노드로 재구성됨.

### 진행
- **P-a ✅ 완료(2026-07-21)** — L0 확장 구현: Math(neg·sign·mod·pow·sqrt·min·max·lerp·sin·cos·atan2·hypot·wrapAngle) ·
  Logic(gt·le·ge·eq·ne·and·or·not) · Vector(make·scale·add·sub·dot·normalize·rotate·angle·dist) ·
  Array(get·slice·window·range·diff·argmin·min·sum·mean + 고차 filter/reduce/zipWith) · State(delay·accum·lowpass·rateLimit).
  registry+validate(포트타입)+nodeMeta(마스터 카탈로그) 일괄. 단위검증 `test/prims.ts`(20 assert) + 기존 랩 결정론 유지.
  고차(map/filter/reduce/zipWith)는 core엔 있으나 **에디터 람다 저작 UI 전까지 팔레트 미노출**. Struct 생성(make.waypoint/make.command)은 P-c(Path)와 함께.
- **P-b ✅ 완료(2026-07-22)** — shipped `lookahead`·`tocar`·`curvAhead`·`gripSpeed`와 신규 `nearestWpt`·`crossTrack`·`headingErr`, LiDAR 3종을 전부 L0 서브그래프 기반 composite로 전환. `path.at` 등 경계 프리미티브와 파라미터 fork 치환까지 포함하며 기존 결정론 랩을 완전히 보존.
  에디터는 중첩 breadcrumb, 내부 PART GUIDE, 실시간 신호, 충돌 회피 fork 배치, 원인별 회로 진단, 사용자 블록 이름 지정·영구 보관함을 지원.
- **P-c 🟡 일부 완료(2026-07-22)** — 현재 vehicle state와 command로 결정론적 `trajectory.rollout` 후보를 생성한다. Path 생성(`midpoints`·`resample`·make waypoint)은 남아 있다.
- **P-d enabler ✅ 완료(2026-07-22)** — Scene ObjectSet, Corridor/DrivableSpace, TrajectorySet, PredictionSet, BehaviorIntent, PlanningRequest, CostTerm, Constraint를 실제 registry·포트 검증·팔레트에 구현했다.
  static avoidance와 overtaking은 이 블록들의 예제 그래프/미션으로 조립하며 turnkey Planner·Overtake·MPPI·PPO·SAC 노드는 두지 않는다. 전용 `test/planning.ts`가 장면→공간→예측→행동→평가 흐름과 결정론을 검증한다.
  static avoidance(L5), overtaking(L6), 후보 선택 MPC(L7), 정책 평가 RL(L8) 미션까지 구현했다.
- **P-e ✅ 완료(2026-07-23)** — `array.pack2`, `trajectory.commandAt`, `command.parts`로 Trajectory→Command 실행 경계를 완성했다. `policy.linear2`와 `reward.track`은 L0 내부가 보이는 composite이며 `sink.reward`는 제어와 분리된 평가 출력이다. 두 후보 MPC와 정책/보상 RL 참조 그래프가 각각 전용 트랙에서 클린 랩을 완주한다.
