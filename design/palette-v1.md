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
`make.waypoint +` · `make.command +` · `get.field +`(.x/.y/.s/.kappa/.vref …)

### 5. Array & Iteration · L0  (핵심 enabler)
`array.len ✓` `array.get +`(index) `array.slice +` `array.window +`(닫힌트랙 wrap) `array.range +` `array.diff +` ·
**고차λ:** `array.map ✓`λ `array.filter +`λ `array.reduce +`λ `array.zipWith +`λ ·
**리덕션:** `array.sum +` `array.mean +` `array.max ✓` `array.min +` `array.argmax ✓` `array.argmin +`

### 6. Stateful · L0 ⏱  (피드백 = 반드시 이 노드 경유)
`st.delay +`(z⁻¹) · `st.accum +`(Σx·dt) · `st.lowpass +`(α) · `st.rateLimit +` · `ctrl.pid ✓`(=delay+accum 합성, L1)

### 7. L1 — Geometry / Perception  (composite, 열림)
`std.tocar ✓`(To Car Frame) · `std.nearestWpt +` · `std.curvAhead ✓`(Curvature ahead) ·
`std.headingErr +` · `std.crossTrack +` · `std.lookahead ✓`(Lookahead point)

### 8. L1 — LiDAR  (composite, 열림)
`lidar.preprocess +`(bubble) · `lidar.widestGap +` · `lidar.freeAhead +`

### 9. L1 — Planning / Path  (composite, 열림; 웨이포인트 직접 생성)
`std.gripSpeed ✓`(Grip speed) · `path.nearestIndex +` · `path.advanceByDist +` ·
`path.midpoints +`(bounds→센터라인) · `path.resample +`(ds)

### 10. L1 — Control  (composite, 열림)
`ctrl.pid ✓` · `clamp ✓`(L0지만 여기 노출) · `std.rateLimit`/`std.lowpass`(§6)
— **Pursuit/Steer/Stanley 조향식은 여기 없음**(예제 그래프).

### 11. Model — MPC/MPPI/RL 훅
`sim.predict ✓`(1-step) · `sim.rollout +`(N-step 배치 궤적) · `rng.uniform ✓` · `rng.gauss ✓`

### 12. Sinks · L0 (경계, 필수 둘 다)
`sink.steer ✓` · `sink.throttle ✓`

### 13. 캡슐화 (노드 아님, 에디터 기능)
서브그래프 선택 → **"노드로 만들기"** → 재사용 composite(= 내 L1). L1을 늘리는 위쪽 escape hatch.

---

## 구현 웨이브 (정하고 시작)
- **P-a · L0 채우기** — Math 확장 + Vector/Struct + Array 고차/윈도우 + Stateful.
  → 현재 알고리즘(pursuit·FTG·grip)이 프리미티브만으로 짜여야 함(회귀검증: 랩타임 동일).
- **P-b · L1 = composite 전환** — 현 opaque `std.*`(fn)를 내부 서브그래프로 재정의(engine `composite` 지원 이미 있음) →
  에디터 "열기"로 속 보이고 fork. + 신규 L1(crossTrack·headingErr·widestGap·nearestWpt …).
- **P-c · Path + Model** — 웨이포인트 생성 노드 + `sim.rollout`(MPPI 샘플 궤적 시각화).

각 웨이브 합격 = 기존 랩 결정론 유지 + 대표 알고리즘 1개가 새 노드로 재구성됨.

### 진행
- **P-a ✅ 완료(2026-07-21)** — L0 확장 구현: Math(neg·sign·mod·pow·sqrt·min·max·lerp·sin·cos·atan2·hypot·wrapAngle) ·
  Logic(gt·le·ge·eq·ne·and·or·not) · Vector(make·scale·add·sub·dot·normalize·rotate·angle·dist) ·
  Array(get·slice·window·range·diff·argmin·min·sum·mean + 고차 filter/reduce/zipWith) · State(delay·accum·lowpass·rateLimit).
  registry+validate(포트타입)+nodeMeta(마스터 카탈로그) 일괄. 단위검증 `test/prims.ts`(20 assert) + 기존 랩 결정론 유지.
  고차(map/filter/reduce/zipWith)는 core엔 있으나 **에디터 람다 저작 UI 전까지 팔레트 미노출**. Struct(make.waypoint/get.field)는 P-c(Path)와 함께.
- **P-b 🔶 진행중(2026-07-21)** — composite 실행 엔진 구현(내부 서브그래프 + `cin` 입력 + 상태 네임스페이싱, engine `composite` kind). 첫 블록: `blk.pursuit`(L2 조향 전체)·`blk.speedPid`(L1 속도 PID) = 이전 미션 결과물을 **재사용 노드 하나**로. **왜**: L3가 pursuit 13노드+PID를 통짜로 깔아 "이미 다 되어있다"(사용자 지적) → L3를 블록 2개+새 grip 부분(4노드)로 정리, L2도 blk.speedPid로. 검증 `test/blocks.ts`: 블록 랩 === 인라인 랩(20.175s, 결정론). ✅ **열기/fork/캡슐화 완료(2026-07-21)**: (1)블록 더블클릭→내부 읽기전용 뷰(InnerView) (2)"펼쳐서 내 그래프로"→`inlineComposite`로 인라인(cin=외부입력, outMap=출력 재배선) (3)★캡슐화: 여러 노드 마퀴선택(selectionOnDrag)→"블록으로 묶기"→`encapsulate`가 `blk.user`(sub/outMap을 params에 실은 동적 composite) 생성. 동적포트=insOf/outsOf(data). evalGraph가 정적 nt.ins 없어도 n.in 전부 resolve. 검증 `test/blocks.ts`: fork후 랩===블록랩(20.175s), 캡슐화후 랩===원본(PURSUIT 21.083s), encapsulate↔fork 왕복 보존. 브라우저: 마퀴9선택→묶기→내블록→열기 확인, 에러0. **남은 것**: std.* L1(lookahead·tocar·curvAhead·gripSpeed)도 composite化(현재 opaque fn) + 신규 L1(crossTrack·headingErr·widestGap·nearestWpt).
