# APEX ARENA improvement program — 40 items

상태: **실행 기준 확정 (2026-07-23)**. 이 문서는 기능, 알고리즘 저작 구조, UX/디자인, 현재 블록/아키텍처 적합성 검토를 각각 10개로 고정한다.

우선순위: `P0` 잘못된 알고리즘 또는 확장 차단 · `P1` 제작/분석에 중요 · `P2` 고급 확장. 상태: `TODO` · `DOING` · `DONE`.

## A. Product capabilities (F01–F10)

| ID | P | 상태 | 항목 | 합격 기준 |
|---|---|---|---|---|
| F01 | P0 | DONE | N개 후보 생성 | steer/throttle 범위에서 결정론적으로 N개 candidate를 만들고 순서를 보존한다. |
| F02 | P0 | DONE | Command sequence rollout | horizon 동안 시간별 command를 적용하며 동일 seed 결과가 같다. |
| F03 | P0 | DONE | Cost breakdown | 후보별 progress/tracking/collision/smoothness/control 원값·가중값을 표시한다. |
| F04 | P0 | DOING | Constraint diagnostics | 위반 constraint, 최초 시점, 위치를 반환하고 트랙 overlay에 표시한다. |
| F05 | P1 | DONE | Path authoring | midpoint/resample/offset/append로 centerline 밖 reference path를 만든다. |
| F06 | P1 | TODO | Replay and scrubber | 저장 run의 임의 simTime에서 차량·신호·overlay를 동기화해 재생한다. |
| F07 | P1 | TODO | Parameter sweep | 파라미터 조합을 headless로 반복 평가하고 랩/충돌/이탈 표를 만든다. |
| F08 | P1 | TODO | Scenario editor | 장애물·상대차·마찰·노이즈를 배치하고 scenario를 저장한다. |
| F09 | P2 | TODO | Multi-hypothesis prediction | hypothesis probability와 occupancy uncertainty를 보존한다. |
| F10 | P2 | TODO | Policy artifact import | 입력 shape/normalization/output/determinism 검증 후 policy boundary에 로드한다. |

## B. Algorithm-authoring structure (S01–S10)

| ID | P | 상태 | 항목 | 합격 기준 |
|---|---|---|---|---|
| S01 | P0 | DOING | NodeDef port schema 통합 | 실행 포트와 타입 포트의 중복 선언을 제거하고 registry가 단일 진실 원천이 된다. |
| S02 | P0 | TODO | 단위·좌표계 타입 | m/mps/rad 및 world/car frame 오연결을 compile 단계에서 막는다. |
| S03 | P0 | DOING | Generic collection | array command/trajectory/cost를 원소 타입까지 검사한다. |
| S04 | P0 | DONE | Composite interface validation | cin/cparam/outMap과 외부 포트 불일치를 저장·실행 전에 검출한다. |
| S05 | P1 | DONE | Graph schema migration | 저장 graph/design/block에 version을 기록하고 이전 버전을 migration한다. |
| S06 | P1 | DOING | Execution trace | tick별 source→decision→sink provenance를 조회한다. |
| S07 | P1 | DONE | Pure/state/effect phase | source, pure, stateful, control sink, metric sink의 역할을 명시한다. |
| S08 | P1 | TODO | Mission DSL | starter/palette/requirements/venue/brief/objective를 한 선언 스키마로 검증한다. |
| S09 | P2 | TODO | Node-pack manifest | core 수정 없이 node pack을 등록하고 충돌/버전을 검사한다. |
| S10 | P2 | TODO | Model/policy provider | feature shape, normalization, deterministic inference, clamp 계약을 고정한다. |

## C. UX and visual design (U01–U10)

| ID | P | 상태 | 항목 | 합격 기준 |
|---|---|---|---|---|
| U01 | P0 | DONE | Semantic zoom | 축소 시 흐름 중심, 확대 시 포트·값·파라미터 중심으로 정보량이 바뀐다. |
| U02 | P0 | DOING | Port semantics and units | hover/inspect에서 의미·타입·단위·frame을 확인한다. |
| U03 | P0 | DONE | Active execution path | 현재 control/metric sink에 영향을 주는 경로를 강조한다. |
| U04 | P0 | DONE | Inline error location | 오류 node/port/edge에 직접 상태와 원인을 표시한다. |
| U05 | P1 | DONE | Parts Bay search | 검색, category filter, 최근 사용으로 큰 팔레트를 탐색한다. |
| U06 | P1 | DOING | Auto-layout and lanes | 선택/전체 graph를 Perception→Planning→Control lane으로 정렬한다. |
| U07 | P1 | TODO | Graph diff | A/B 설계의 node/edge/parameter 차이를 강조한다. |
| U08 | P1 | TODO | Timeline-canvas sync | scrub time과 node value/overlay/vehicle pose가 일치한다. |
| U09 | P2 | DONE | Parameter tuning controls | 단위, 기본값 reset, 위험 범위, 직접 입력을 제공한다. |
| U10 | P2 | DOING | Accessibility/responsiveness | 키보드, 색 외 표식, 최소 글자/블록 크기, mobile flow를 검증한다. |

## D. Current block and architecture review (A01–A10)

| ID | P | 상태 | 판단과 조치 | 합격 기준 |
|---|---|---|---|---|
| A01 | — | DONE | L0→openable L1→user graph 3계층 유지 | turnkey 알고리즘 node가 registry에 없다. |
| A02 | — | DONE | Scene/Trajectory/Prediction/Intent/Cost/Constraint 공통 계약 유지 | Rule/MPC/RL reference graph가 같은 타입을 사용한다. |
| A03 | P1 | DONE | controller의 숨은 source 의존성 제거 | 명시 입력형 controller composite를 추가하고 기존 blk는 호환 wrapper로 둔다. |
| A04 | P0 | DONE | PID openable + dt-correct | L0 state primitive로 열린 내부를 구성하고 1/120 기존 랩을 보존한다. |
| A05 | P0 | DONE | advanceByDist 의미 수정 | d=0 보존, 음수 후진, sub-spacing interpolation, closed wrap을 단위 검증한다. |
| A06 | P0 | DONE | constant-command rollout 일반화 | 기존 node 호환을 유지하며 command sequence rollout을 추가한다. |
| A07 | P0 | DONE | pack2 임시 경계 일반화 | typed empty/append 또는 candidate set으로 N개를 조립한다. |
| A08 | P0 | DONE | invalid-safe trajectory selection | invalid/비용 누락 후보를 선택하지 않고 이유를 출력한다. |
| A09 | P1 | DOING | object identity/empty semantics | stable id를 보존하고 empty nearest는 found=false,d=Infinity다. |
| A10 | P1 | DOING | policy/reward/type 임시 구조 일반화 | feature vector·reward terms·실제 metric sink 및 단일 schema로 이동한다. |

## Beginner tutorial requirement

완전 초보자는 “노드를 놓는 법” 이전에 아래 질문에 답할 수 있어야 한다.

1. 자율주행 알고리즘은 왜 `관찰 → 계산 → 판단 → 행동` 흐름인가?
2. 값, 타입, 단위, 좌표계는 무엇이며 왜 아무 포트나 연결할 수 없는가?
3. open loop와 feedback의 차이는 무엇인가?
4. path tracking, local planning, control은 각각 무엇을 결정하는가?
5. Rule, MPC, RL은 무엇이 다르고 어떤 공통 입출력을 쓰는가?
6. simulation 결과 하나가 좋은 알고리즘을 증명하지 못하는 이유는 무엇인가?
7. VISUALIZE, replay, A/B 실험으로 실패 원인을 어떻게 찾는가?

튜토리얼은 읽기 전용 설명으로 끝내지 않는다. 각 개념은 짧은 그림, 한 문장 정의, 실제 APEX block 예시, 확인 질문 또는 첫 미션 행동으로 연결한다. 전문 용어는 처음 등장할 때 한국어 설명과 단위를 함께 제공한다.

## Delivery order

1. A04/A05/A08/A09 및 S04 — 결과가 틀릴 수 있는 기반 결함.
2. S01/S05/S07, U02/U04/U05/U06 — 안전하게 확장 가능한 저작 환경.
3. 초보자 개념 튜토리얼과 용어집.
4. F01–F05 — 실제 local planning/MPC 자유도.
5. F06–F10, U03/U07/U08 — 분석·실험·고급 모델.


## 2026-07-23 implementation checkpoint

완료: F01/F02/F03/F05, S04/S05/S07, U01/U03/U04/U05/U09, A03–A08. 부분 진행: F04, S01/S03/S06, U02/U06/U10, A09/A10.

이번 checkpoint는 나머지를 완료했다고 간주하지 않는다. F06–F10과 graph diff/replay/scenario/policy provider는 별도 기능 패스로 남으며, 이 문서의 합격 기준을 만족할 때만 `DONE`으로 바꾼다.
