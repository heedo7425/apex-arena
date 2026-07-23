# Race modes and online competition v1

상태: **클라이언트·로컬 경기 기반 구현, 온라인 서버 미배포 (2026-07-23)**.

## 1. 종목

| 모드 | 인원 | 승리 조건 | 온라인 데이터 |
|---|---:|---|---|
| Time Trial | 1 | 동일 track/car/seed에서 가장 빠른 clean lap | 검증 run, ghost, leaderboard |
| Head-to-Head | 2 | 동시 출발 후 clean P1 finish | room snapshots, contact events, result |
| Grid Start | 6 | qualifying grid에서 출발해 finish position/points 경쟁 | room snapshots, grid, penalties, standings |

현재 앱은 세 모드 모두 결정론 코어에서 실행되는 로컬 AI 연습을 제공한다. Head-to-Head는 2-car, Grid Start는 6-car field와 실시간 순위를 표시하며 P1 clean finish만 승리다.

## 2. 공정성 계약

- 클라이언트 시간이나 임의 결과를 leaderboard에 직접 신뢰하지 않는다.
- Time Trial 제출은 graph hash, seed, lap time, dirty flag, input hash를 포함한다. 서버가 허용 registry와 같은 코어 버전으로 재실행해 검증한다.
- 실시간 경기는 서버가 room start tick과 authoritative snapshots/result를 발행한다. 클라이언트는 예측·표시를 담당하지만 최종 순위는 서버 결과를 따른다.
- RNG와 wall-clock을 차량 알고리즘 입력으로 사용하지 않는다. 동률은 검증된 finish tick, 그 다음 제출 시각 순이다.
- graph/node-pack/core version 불일치, 금지 노드, 비결정론 출력은 제출을 거절한다.

## 3. 클라이언트 경계

- `VITE_RACE_API_URL`: `GET /leaderboard?mode=...`, `POST /runs`.
- `VITE_RACE_WS_URL`: `queue.join` → `match.found` → room snapshot/event/result.
- `RunSubmission`과 `MatchTicket`은 version 1 계약이다.
- 서버가 설정되지 않으면 로컬 AI benchmark만 표시하며 가짜 유저나 가짜 글로벌 기록을 만들지 않는다.

## 4. 서버 후속 범위

1. 계정·표시명·시즌 및 rate limit.
2. core version별 격리된 headless verifier workers.
3. ghost/replay object storage와 제출 서명.
4. region queue, reconnect, spectator, abuse reporting.
5. collision/track-limit penalty와 disconnect 판정.
6. season leaderboard, rating, matchmaking, result audit log.

실시간 PvP를 공개하기 전 네트워크 지연·재접속·치팅·서버 비용에 대한 부하 테스트가 필수다.
