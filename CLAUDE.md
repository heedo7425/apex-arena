# Apex-arena — repo guide for agents

자율주행 알고리즘을 **배우고 경쟁하는** 브라우저 탑다운 2D 레이싱 게임. 플레이어는 센서→조향/스로틀을 내는
"차의 두뇌"를 **데이터플로 그래프**(노드=계산, 와이어=타입 있는 신호)로 직접 짜서 랩타임을 겨룬다.

## 저장소 구조
- **`packages/core/`** — 프레임워크 없는 **결정론 코어**(브라우저 + node 양쪽 실행). 빌드 없이 Node 24 타입스트리핑으로 바로 실행.
  ⚠️ 타입 전용 import는 반드시 `import type`/inline `type` 표시(아니면 런타임 에러).
  - `src/sim/` — world(트랙·높이필드·차량파라미터), vehicle(`stepDynamics` 동역학 single-track = 모델노드), runner(makeSim/tick/runFor/medal).
  - `src/graph/` — `engine.ts`(makeGraph 위상정렬 + `evalGraph` 매tick 순수평가, `EvalCtx`), `registry.ts`(`NT` 노드레지스트리: L0 프리미티브·L1 std·composite 블록·rng/predict 훅·sink), `validate.ts`(포트타입 스키마 + 그래프 검증), `inline.ts`(`inlineComposite`=fork, `encapsulate`=group), `presets.ts`(FTG/PURSUIT 예제 그래프 = 데이터).
  - `test/*.ts` — 헤드리스 검증. **`drive.ts`**(랩·결정론), `prims.ts`(L0 수치), `blocks.ts`(composite/캡슐화 behavior 보존), `planning.ts`(Scene/Space/Trajectory/Prediction/Intent/Cost/Constraint). 변경 후 관련 테스트와 기존 3개가 모두 통과해야 함.
- **`apps/web/`** — Vite + React 18 + zustand + @xyflow/react(React Flow) 에디터/게임 UI. `@apex/core`는 workspace 의존.
  - `src/editor/` — Editor(React Flow 래퍼, 팔레트, 클릭·드래그 연결, 다중선택→블록으로 묶기, 블록 더블클릭 열기/fork), GraphNode(커스텀 노드), compile(rfToCore/coreToRF 왕복), nodeMeta(META·PALETTE_CATS·insOf/outsOf).
  - `src/campaign/` — levels(레벨 그래프·팔레트·목표·요구조건), LevelScreen(에디터+뷰포트+브리핑+HUD+결과), worlds(레벨별 트랙), CampaignMap.
  - `src/sim/` — Viewport(rAF로 core sim 구동 + Canvas 렌더), render, store.
- **`app/`** — **빌드 산출물(커밋됨)**. GitHub Pages가 이걸 서빙. 소스만 고치고 여기 리빌드 안 하면 라이브 반영 안 됨.
- **`design/palette-v1.md`** ★ 현행 권위 문서: 팔레트 노드 어휘 전체 + 소속 규칙 + P-a/P-b 진행상황.
- **`design/node-spec.md`** — 타입 시스템 + L0/L1 어휘 + 유도 검증.
- **`design/planning-types-v1.md`** — overtaking/static avoidance/local planning 공통 타입과 VISUALIZE 계약. P-c/P-d 확장의 권위 문서.
- `docs/GAME_DESIGN.md` — ⚠️ **오래됨(그래프 엔진 이전)**. 초기 비전 참고용, 현재 아키텍처는 palette-v1/node-spec/이 파일을 따를 것.
- `codex_edit.md` — Codex(다른 에이전트)가 이 repo에서 한 작업 로그.

## 핵심 개념
- **결정론**: 같은 시드 → 동일 랩(리더보드·리플레이 재검증). RNG/wall-clock 금지, 피드백은 상태노드(`st.delay` 등) 경유.
- **3계층 어휘**(palette-v1 규칙): L0 프리미티브(`prim`) / L1 표준 메서드(`composite`, 열려서 fork) / **알고리즘의 시그니처 결정규칙은 팔레트에 없고 유저가 조립**(Pure Pursuit `k=2y/Ld²` 등). turnkey 통짜 노드 금지, 생 math 도배도 금지.
- **composite 블록**: 내부 서브그래프를 품는 노드. shipped 블록(`blk.pursuit`/`blk.speedPid`)은 `NT`에 sub/outMap, **유저 블록 `blk.user`는 sub/outMap을 params에** 실음(동적 포트). 더블클릭→내부 열기, fork(`inlineComposite`)로 펼침, 여러 노드 선택→`encapsulate`로 묶음. 셋 다 behavior 보존(랩 동일).
- **레벨 = 이번 개념만 짓기**: 이전 미션 결과물은 **열리는 블록 하나로 제공**(예: L3 = ▣Pursuit·▣Speed PID 블록 + 새 grip 부분). 통짜 프리미티브 벽으로 깔지 말 것(사용자가 "이미 다 되어있다"고 거부함).

## 빌드 · 검증 · 배포 (반드시 이 순서)
```
node packages/core/test/drive.ts && node packages/core/test/prims.ts && node packages/core/test/blocks.ts   # 코어
pnpm --filter @apex/web build          # → app/ 로 빌드 (vite base '/apex-arena/app/')
git add -A && git commit && git push origin main                                                            # Pages 자동 배포
```
- **오프스크린 검증(로컬 창 절대 금지)**: base 경로 맞춰 서빙해야 함 → 심링크 `<root>/apex-arena/app -> app/` 만들고 `python3 -m http.server`, URL은 `http://localhost:PORT/apex-arena/app/`.
  - 스크린샷: `env -u DISPLAY google-chrome --headless=new --user-data-dir=<tmp> --virtual-time-budget=7000 --screenshot=out.png <URL>` (DISPLAY 제거가 핵심 — 창 안 뜸).
  - 클릭 인터랙션: Playwright headless(scratchpad에 설치됨). 첫방문 온보딩 우회는 `localStorage: apex_onboard=1` + `apex_progress_v1`(completed 배열) 주입, 레벨 진입은 `.mission-card` 버튼 클릭.
- 배포 확인: `curl -s https://heedo7425.github.io/apex-arena/app/ | grep -o 'index-.*\.js'` 가 방금 빌드한 번들 해시와 일치할 때까지 폴링(수십 초).

## 제약
- **사용자는 항상 원격**: 이 머신에서 GUI 창을 띄우면 사용자 화면에 뜬다. 로컬 크롬/브라우저 실행 금지(헤드리스도 DISPLAY 있으면 창 뜸). 결과는 채팅 텍스트 + 배포 URL로.
- public repo `heedo7425/apex-arena`, `main`에 직접 푸시(이 세션의 확립된 플로우). 커밋 메시지에 백틱 쓰지 말 것(bash가 실행해버림).

## 현재 상태 (2026-07-22)
- Codex UX 오버홀 + 내 후속 작업 반영: Parts Bay 좌측 레일, Pure Pursuit 프리미티브 조립화, L2/L3 블록 제공, **P-a 완료**(L0 어휘), **P-b 열기/fork/캡슐화 완료**, 반응형(상단바 겹침·sim 높이) 수정.
- **P-b 완료**: 경로 접근자와 센서 배열 프리미티브를 추가하고 `std.lookahead`·`std.tocar`·`std.curvAhead`·`std.gripSpeed` 및 geometry/LiDAR L1 노드를 모두 열기/fork 가능한 composite로 전환했다. PURSUIT 랩은 정확히 동일하다.
- composite 내부는 breadcrumb, 파트 설명, live signal, 자동 배치 fork를 제공한다. 유저 블록은 Parts Bay 보관함에 저장되어 모든 미션에서 재사용할 수 있고 그래프 오류는 해당 블록·포트 단위로 안내된다.
- 에디터 VISUALIZE는 출력 신호를 읽기 전용으로 수집한다. simulation 시간만 사용하며 graph 계산·랩 결과에 영향을 주면 안 된다.
- **P-c 일부/P-d enabler 완료**: vehicle state 기반 결정론 trajectory rollout과 Scene ObjectSet, DrivableSpace, PredictionSet, Intent, PlanningRequest, Cost/Constraint 블록이 registry·typed validation·master palette에 구현됐다. turnkey planner/알고리즘 노드는 금지한다.
- **다음**: static avoidance 예제 그래프·장애물 미션으로 공통 블록 조합을 증명하고, 이후 moving opponent prediction을 쓰는 overtaking 미션을 만든다. Path 생성(`midpoints`·`resample`·make waypoint)도 별도 P-c 패스로 남아 있다.
