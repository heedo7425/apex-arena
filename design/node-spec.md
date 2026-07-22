# Apex-arena — Node & Type Spec (v0.1)

데이터플로 그래프의 **토대**. curvature·lookahead·waypoint 생성·컨트롤러 전부 이 프리미티브로 조립하고, 고수준 노드는 **합성(composite)** 일 뿐 — 열어서 뜯거나 새로 짓는다.

멀티카·회피·local planning 확장 타입의 권위 계약은 [`planning-types-v1.md`](./planning-types-v1.md)를 따른다.

## 0. 원칙
- 그래프 = **매 tick(고정 dt) 실행되는 순수 함수**. 결정론(wall-clock·RNG 금지). 피드백(사이클)은 **Delay(z⁻¹)** 노드를 통해서만.
- **타입 있는 와이어.** Primitives = 원자(못 엶). Composites = 서브그래프(열림·유저 생성).

### 0.1 입자/추상 레벨 = 3계층 (★ "애매한 중간선")
목표: **유저가 거의 다 설계**하되, **순수 로우레벨부터 다 만들진 않게.**
- **L0 · Primitives** — 원자(수학·배열/반복·기하·상태). 열려있지만 **여기서 시작 안 함**(atan2 지옥 방지).
- **L1 · Standard Library** — **기본 작업 어휘.** "논문 method 섹션에서 이름 붙일 만한 의미 단위"(Lookahead point, Curvature ahead, Cross-track error, Frenet, Widest gap, Grip speed, PID …). **전부 열리는 합성**(까보면 L0). → §3.5.
- **알고리즘 = 유저 그래프.** 완성형(Pure Pursuit 등)은 **팔레트 노드가 아니라 "예제 그래프"** — 불러오면 L1 노드 4~5개가 배선된 작은 그래프, 열어서 fork.
- **선을 부드럽게 하는 escape hatch**: 아래로=L1 노드 열기, 위로=서브그래프 캡슐화(내 L1 노드 만들기).
- **L1 큐레이션 규칙**: 각 노드 = *이름 붙은 method 단위* 1개. 컨트롤러 하나 짜려면 **여러 개를 배선**해야 하는 크기(= 구조를 설계). 통짜 "Pure Pursuit 노드"(튜닝) 금지, 생 `×`·`atan2` 도배(지옥) 금지.

## 1. 타입 시스템
| 타입 | 설명 | 포트색 |
|---|---|---|
| `num` | 스칼라 실수 | grey |
| `bool` | 참/거짓 | red |
| `vec2` | (x, y) | green |
| `angle` | rad, 자동 wrap (num 하위) | green |
| `pose` | `{x, y, yaw}` | blue |
| `twist` | `{vx, vy, w}` 속도 | blue |
| `waypoint` | `{x, y, s, kappa, wl, wr, psi, vref}` (실스택 Wpnt) | gold |
| `command` | `{steer, throttle}` (싱크) | teal |
| `array<T>` | 동종 배열, 원소타입을 포트에 표시 | 원소색 |
| `scan` | `{ranges: array<num>, a0, da}` (LiDAR) | purple |
| `vehicleState` | pose·twist·동역학 상태 | blue |
| `object` / `objects` | 장면 객체 / 결정론 정렬 객체 집합 | orange |
| `corridor` | progress 기준 중심선·좌우 폭 | gold |
| `drivable` | 다중 자유공간 region과 blocked polygon | lime |
| `trajectory` / `trajectories` | 시간별 vehicleState·command / 후보 집합 | cyan |
| `prediction` / `predictions` | 객체별 다중 미래와 occupancy | magenta |
| `intent` | 설명 가능한 상위 행동 의도 | white |
| `planningRequest` | 목표·비용·제약을 묶은 planner 입력 | white |
| `constraint` / `constraints` | hard/soft 주행 제약 | red |
| `cost` / `costs` | 독립 가중 비용 항 | amber |

- 위 확장 타입은 registry·포트 검증·마스터 팔레트에 구현됐다. 레벨은 학습 목표에 맞는 부분집합만 노출한다.

- **제네릭**: `array<T>` 는 원소 타입까지 매칭돼야 연결(`array<num>`↔`array<num>`).
- **구조체**: `Make X` 로 생성, `Get .field` 로 접근.

## 2. 소스 · 싱크 (시뮬 경계)
**Sources (매 tick 읽기전용):**
`Pose→pose` · `Velocity→twist` · `Speed→num` · `LiDAR→scan` · `IMU→{r, ax}` ·
`TrackBounds→{left:array<vec2>, right:array<vec2>}` · `TrackRef→array<waypoint>`(주어진 센터라인, **안 써도 됨—직접 생성 가능**) · `Const(dt)→num`.

**Sinks (필수 둘 다):** `Steer ◂ num` · `Throttle ◂ num`.

## 3. 프리미티브 카탈로그
**Math (num):** `+ − × ÷ mod pow sqrt abs neg sign` · `sin cos tan atan2 hypot` · `min max clamp lerp wrapAngle` · `Const<num>`(파라미터 노드).

**Logic (bool):** `> < ≥ ≤ == ≠` · `and or not` · `Select(cond, a, b):T`(분기 원자).

**Vector / Geometry:** `Vec2(x,y)` · `X Y` · `+v −v scale dot length normalize rotate(v,θ) angleOf(v)` · `distance(a,b)` · `toLocal(pt, pose)`(월드→차프레임) · `toWorld(pt, pose)`.

**Struct:** `Pose parts(pose)→x,y,yaw` · `Waypoint parts(wpt)→x,y,s,kappa,psi,vref`.
문자열 파라미터 UI가 생기기 전까지 범용 `Get .field` 대신 타입별 분해 노드를 사용. 생성은 `Make waypoint|command`.

**Array & Iteration ← 핵심 enabler:**
- 기본: `Length` · `Index(arr,i)` · `Slice(arr,i,j)` · `Window(arr,i,W)`(닫힌트랙 wrap) · `Range(n)` · `Diff(arr)` · `Concat`.
- **고차(내부 서브그래프 λ):** `Map(arr, λ)→array` · `Filter(arr, λ)` · `Reduce(arr, init, λ)→acc` · `ZipWith(a,b, λ)→array`.
- 리덕션: `Sum Max Min Mean` · `Argmax Argmin`(최대/최소 인덱스 — 예: 가장 넓은 갭, 최근접).
- 센서 배열: `SanitizeRanges(arr,max)` · `WidestAbove(arr,min)→(i,width)` · `CenterMin(arr,w)`.

**Path / Waypoint:** `NearestIndex(path, pt)→i` · `At(path,i)→waypoint` · `AdvanceByDist(path, i, d)→(pt, i2)` · `MaxCurvature(path,i,d)→κ` · `Resample(path, ds)` · `Midpoints(left, right)→path` · `MinCurvStep(path, bounds)→path`(레이싱라인 1스텝, Loop로 반복).

**Stateful (결정론, 리셋시 0) — ⏱ 표시:** `Delay z⁻¹(x)→prev` · `Accumulate(x)→Σx·dt` · `PID(err, kp,ki,kd)→u`(=Delay/Acc 합성) · `LowPass(x, α)` · `RateLimit(x, rate)`. **사이클은 반드시 ⏱ 노드 경유.**

**Scene / Space:** `Vehicle object` · `Static object` · `Object parts/relative` · `Objects empty/append/nearest/inRadius` ·
`Track corridor` · `Drivable space` · `Block obstacle` · `Point is drivable`.

**Trajectory / Prediction:** `Vehicle state` · `Control command` · `Rollout trajectory` · `Trajectory parts/clearance/progress/collides` ·
`Trajectories empty/append/selectMin` · `Constant velocity prediction` · `Predictions empty/append` · `Future clearance`.

**Behavior:** `Follow` · `Avoid` · `Pass left/right` · `Emergency stop` intent와 `Planning request`.
Intent는 목적만 표현하며 경로 생성·후보 선택·제어를 내부에서 수행하지 않는다.

**Cost / Constraint:** progress·collision·clearance·tracking·smoothness·control 비용 항과 track·collision·speed·steer 하드 제약.
`Trajectory evaluate`가 독립 항을 합산하고, `selectMin`이 후보를 고른다.

> 금지: `Overtake`, `StaticAvoidance`, `LocalPlanner`, `MPPI`, `PPO`, `SAC` 같은 turnkey 노드.
> Rule-based/RL/MPC는 위 공통 데이터 경계를 사용하되 의사결정과 후보 생성 방식을 그래프로 드러낸다.

## 3.5 Layer 1 — 표준 라이브러리 (기본 작업 어휘, 전부 열리는 합성)
컨트롤러는 이걸 배선해 만든다. 각 노드는 L0 프리미티브의 합성 = 열어서 보고 fork 가능. **"애매한 선"이 사는 곳.**

**Geometry / Perception:** `To Car Frame` · `Frenet (s,d)` · `Nearest Waypoint` · `Curvature ahead(W)` · `Heading error` · `Cross-track error` · `Distance to boundary` · `Track width here`.

**LiDAR:** `Preprocess scan (sanitize/clip)` · `Widest gap (연속 여유 구간)` · `Free distance ahead (중앙 안전창)` · `Min range in arc`.

**Planning:** `Lookahead point(Ld)` · `Speed from curvature (grip)` · `Speed profile` · `Sample path ahead` · `Centerline (from bounds)` · `Racing-line step`(Loop).

**Control:** `Pursuit curvature` · `Steer from curvature` · `Stanley term` · `PID` · `Clamp` · `Rate limit` · `Low-pass`.

**Util(얇음, 그래도 의미 단위):** `lerp` · `clamp` · `wrapAngle` · `atan2`.

**완성 알고리즘 = 예제 그래프(팔레트 노드 아님):** Pure Pursuit · Follow-the-Gap · Grip-limited speed … → 불러와서 열고 fork.

> **v1 팔레트 확정 = `design/palette-v1.md`.** 왼쪽에 존재하는 노드 어휘 전체를 못 박음(레벨은 부분집합만 노출).
> 결정(2026-07-21): L1은 넉넉하되 전부 `composite`(열림). 위 Control의 `Pursuit curvature`/`Steer from curvature`는
> **L1에서 내려 예제 그래프로만** — 알고리즘의 시그니처 결정규칙이라 유저가 조립(오늘 registry에서 제거함).
> 에디터에서 composite는 중첩 breadcrumb로 계속 열 수 있고, 각 내부 노드의 설명·실시간 출력을 확인한다. fork는 인스턴스 파라미터를 Const로 치환해 수치를 보존하며 기존 노드를 자동 이동한다.
> 사용자 `blk.user`는 이름을 붙여 로컬 보관함에 저장하고 다른 미션의 Parts Bay에서 재사용할 수 있다.

## 4. 실행 · 비용
- 매 tick **위상 정렬 평가**. ⏱ 노드는 이전-tick 상태 읽고 새 상태 씀. 리셋 = ⏱ 상태 0.
- 각 노드 **compute-cost 가중치** → 그래프 총합 = 예산 지표(fast vs cheap vs robust 다중지표).
- 컴파일 시 **타입검사 + "사이클은 Delay 경유" 검사**.

## 5. 검증 — 고수준 노드 = 위 프리미티브의 합성
```
# Curvature ahead(wpts, i, W) → κ
seg  = Window(wpts, i, W)
P    = Map(seg, wpt → Vec2(wpt.x, wpt.y))
head = ZipWith(Slice(P,0,-1), Slice(P,1,-0), (a,b) → angleOf(b − a))
dθ   = Map(Diff(head), wrapAngle)
ds   = ZipWith(Slice(P,0,-1), Slice(P,1,-0), (a,b) → distance(a,b))
κ    = ZipWith(dθ, ds, ÷)
→ Max(Map(κ, abs))            # 이 서브그래프를 선택 → "노드로 만들기: Curvature ahead"

# Lookahead point(pose, path, Ld) → pt      (Ld 자체도 서브그래프: Const 또는 1.2·speed+3)
(x,y,_) = PoseParts(pose);  i = NearestIndex(path, Vec2(x,y));  (pt,_) = AdvanceByDist(path, i, Ld)

# Pure Pursuit steer(pose, pt, L, gain) → steer
e = toLocal(pt, pose);  κ = 2·Y(e) / length(e)²;  δ = atan(L·κ)·gain;  clamp(δ/δmax, −1, 1)

# Grip speed(κ, μ, vmax, margin) → v :  min(vmax, sqrt(μ·g / max(κ, ε))·margin)
# Speed throttle :  clamp( PID(v_tgt − speed, kp,ki,kd), −1, 1 )

# Follow-the-Gap(scan) → steer
r = SanitizeRanges(scan.ranges, maxRange)
best = WidestAbove(r, minClear).i
ang = scan.a0 + best·scan.da;  clamp(ang·k, −1, 1)

# Waypoints — Centerline :  Midpoints(left, right)   (또는 ZipWith(left,right,(l,r)→scale(l+r, .5)))
# Waypoints — Racing line :  Loop N× MinCurvStep(path, bounds)
```
→ 전부 프리미티브로 표현됨 = 세트가 충분함을 확인.

## 6. 결정 (확정 2026-07-15)
1. ✅ **고차 Map/Reduce(내부 λ 서브그래프) 처음부터 포함.**
2. ✅ **상태 노드(Delay/PID/LowPass) 포함.**
3. ✅ **제네릭 array<T> + 구조체 확정** (커스텀 노드의 전제).
4. ✅ **센터라인(`TrackRef`) 제공** + `TrackBounds`도 제공(직접 웨이포인트 설계 가능).
5. ✅ **추상 레벨 = 3계층(§0.1), 기본 작업 레벨 = L1 표준 라이브러리(§3.5).** 완성 알고리즘은 예제 그래프.
