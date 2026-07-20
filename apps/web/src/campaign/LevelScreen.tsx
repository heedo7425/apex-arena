import React, { useEffect, useMemo, useRef, useState } from 'react'
import { buildWorld, makeGraph, NT, validateGraph } from '@apex/core'
import type { Graph, GraphIssue } from '@apex/core'
import { Editor } from '../editor/Editor'
import { coreToRF } from '../editor/compile'
import { Viewport } from '../sim/Viewport'
import { useGame, useLive, useTut } from '../store'
import { levelById, LEVELS, L2_THROTTLE_ASSIST } from './levels'

const COACH: React.ReactNode[] = [
  <><b>1단계.</b> 캔버스는 비어 있습니다. PARTS BAY에서 반짝이는 <b>Const</b>를 장착하세요.</>,
  <><b>2단계.</b> 이제 차량의 가속 장치인 <b>THROTTLE</b> 파트를 장착하세요.</>,
  <><b>3단계.</b> Const의 <b>v</b> 포트를 클릭하고, 이어서 THROTTLE의 <b>x</b> 포트를 클릭하세요.</>,
  <><b>4단계.</b> 제어 신호가 준비됐습니다. <b>▶ 주행 시작</b>을 눌러 차량을 움직이세요.</>,
  <><b>점화 성공.</b> 노드를 이으면 계산이 흐르고, 그 계산이 차량의 행동이 됩니다.</>,
]

type BuildStep = { message:string; palette:string[]; highlight?:string }
const L1_STEPS: BuildStep[] = [
  { message:'속도 센서를 장착해 현재 차량 상태를 읽으세요.', palette:['src.speed'], highlight:'src.speed' },
  { message:'목표 속도를 정할 Const 파트를 장착하세요.', palette:['const'], highlight:'const' },
  { message:'목표와 현재 속도의 차이를 계산할 Sub 파트를 장착하세요.', palette:['sub'], highlight:'sub' },
  { message:'Const → Sub.a, Speed → Sub.b 순서로 신호를 연결하세요.', palette:[] },
  { message:'속도 오차를 제어 신호로 바꿀 PID를 장착하세요.', palette:['ctrl.pid'], highlight:'ctrl.pid' },
  { message:'Sub의 v 출력을 PID의 err 입력에 연결하세요.', palette:[] },
  { message:'출력을 안전 범위로 제한할 Clamp를 장착하세요.', palette:['clamp'], highlight:'clamp' },
  { message:'PID의 u 출력을 Clamp의 x 입력에 연결하세요.', palette:[] },
  { message:'차량에 명령을 보낼 THROTTLE 출력을 장착하세요.', palette:['sink.throttle'], highlight:'sink.throttle' },
  { message:'Clamp의 v 출력을 THROTTLE의 x 입력에 연결하세요.', palette:[] },
  { message:'속도 제어 회로 완성. 직선 시험을 시작해 8 m/s를 2초 동안 유지하세요.', palette:[] },
]

const L2_STEPS: BuildStep[] = [
  { message:'차량 위치와 방향을 읽을 Pose 센서를 장착하세요.', palette:['src.pose'], highlight:'src.pose' },
  { message:'주행할 중심선을 제공하는 Track 센서를 장착하세요.', palette:['src.track'], highlight:'src.track' },
  { message:'전방 주시 거리 Ld를 정할 Const를 장착하세요.', palette:['const'], highlight:'const' },
  { message:'트랙 앞쪽 목표점을 찾을 Lookahead point를 장착하세요.', palette:['std.lookahead'], highlight:'std.lookahead' },
  { message:'Pose.pose를 Lookahead의 pose 입력에 연결하세요.', palette:[] },
  { message:'Track.track을 Lookahead의 track 입력에 연결하세요.', palette:[] },
  { message:'Const.v를 Lookahead의 Ld 입력에 연결하세요.', palette:[] },
  { message:'목표점을 차량 기준으로 바꿀 To car frame을 장착하세요.', palette:['std.tocar'], highlight:'std.tocar' },
  { message:'Lookahead.pt를 To car frame의 pt 입력에 연결하세요.', palette:[] },
  { message:'Pose.pose를 To car frame의 pose 입력에 연결하세요.', palette:[] },
  { message:'좌우 오차를 곡률로 바꿀 Pursuit curvature를 장착하세요.', palette:['std.pursuitCurv'], highlight:'std.pursuitCurv' },
  { message:'To car frame.e를 Pursuit curvature.e에 연결하세요.', palette:[] },
  { message:'조향 감도 gain을 정할 두 번째 Const를 장착하세요.', palette:['const'], highlight:'const' },
  { message:'곡률을 조향 명령으로 바꿀 Steer from curv를 장착하세요.', palette:['std.steerFromCurv'], highlight:'std.steerFromCurv' },
  { message:'Pursuit curvature.k를 Steer from curv.k에 연결하세요.', palette:[] },
  { message:'두 번째 Const.v를 Steer from curv.gain에 연결하세요.', palette:[] },
  { message:'차량 조향 장치인 STEER 출력을 장착하세요.', palette:['sink.steer'], highlight:'sink.steer' },
  { message:'Steer from curv.steer를 STEER.x에 연결하세요.', palette:[] },
  { message:'Pure Pursuit 완성. 주행을 시작해 코너를 공략하세요.', palette:[] },
]

function hasType(graph:Graph, type:string): boolean {
  return graph.order.some(id => graph.nodes[id].type === type)
}
function wiredFrom(graph:Graph, targetType:string, port:string, sourceType:string, sourcePort:string): boolean {
  return graph.order.some(id => {
    const node = graph.nodes[id], ref = node.type === targetType ? node.in?.[port] : undefined
    return !!(ref && ref[0] === 'n' && ref[2] === sourcePort && graph.nodes[ref[1] as string]?.type === sourceType)
  })
}
function wiredFromIndex(graph:Graph, targetType:string, port:string, sourceType:string, sourcePort:string, sourceIndex=0, targetIndex=0): boolean {
  const sourceId = graph.order.filter(id => graph.nodes[id].type === sourceType)[sourceIndex]
  const targetId = graph.order.filter(id => graph.nodes[id].type === targetType)[targetIndex]
  const ref = targetId ? graph.nodes[targetId].in?.[port] : undefined
  return !!(sourceId && ref && ref[0] === 'n' && ref[1] === sourceId && ref[2] === sourcePort)
}
function l1BuildStep(graph:Graph): { index:number; step:BuildStep } {
  let index = 0
  if (hasType(graph,'src.speed')) index = 1
  if (index === 1 && hasType(graph,'const')) index = 2
  if (index === 2 && hasType(graph,'sub')) index = 3
  if (index === 3 && wiredFrom(graph,'sub','a','const','v') && wiredFrom(graph,'sub','b','src.speed','v')) index = 4
  if (index === 4 && hasType(graph,'ctrl.pid')) index = 5
  if (index === 5 && wiredFrom(graph,'ctrl.pid','err','sub','v')) index = 6
  if (index === 6 && hasType(graph,'clamp')) index = 7
  if (index === 7 && wiredFrom(graph,'clamp','x','ctrl.pid','u')) index = 8
  if (index === 8 && hasType(graph,'sink.throttle')) index = 9
  if (index === 9 && wiredFrom(graph,'sink.throttle','x','clamp','v')) index = 10
  return { index, step:L1_STEPS[index] }
}

function l2BuildStep(graph:Graph): { index:number; step:BuildStep } {
  const count = (type:string) => graph.order.filter(id => graph.nodes[id].type === type).length
  let index = 0
  if (hasType(graph,'src.pose')) index = 1
  if (index === 1 && hasType(graph,'src.track')) index = 2
  if (index === 2 && count('const') >= 1) index = 3
  if (index === 3 && hasType(graph,'std.lookahead')) index = 4
  if (index === 4 && wiredFromIndex(graph,'std.lookahead','pose','src.pose','pose')) index = 5
  if (index === 5 && wiredFromIndex(graph,'std.lookahead','track','src.track','track')) index = 6
  if (index === 6 && wiredFromIndex(graph,'std.lookahead','Ld','const','v',0)) index = 7
  if (index === 7 && hasType(graph,'std.tocar')) index = 8
  if (index === 8 && wiredFromIndex(graph,'std.tocar','pt','std.lookahead','pt')) index = 9
  if (index === 9 && wiredFromIndex(graph,'std.tocar','pose','src.pose','pose')) index = 10
  if (index === 10 && hasType(graph,'std.pursuitCurv')) index = 11
  if (index === 11 && wiredFromIndex(graph,'std.pursuitCurv','e','std.tocar','e')) index = 12
  if (index === 12 && count('const') >= 2) index = 13
  if (index === 13 && hasType(graph,'std.steerFromCurv')) index = 14
  if (index === 14 && wiredFromIndex(graph,'std.steerFromCurv','k','std.pursuitCurv','k')) index = 15
  if (index === 15 && wiredFromIndex(graph,'std.steerFromCurv','gain','const','v',1)) index = 16
  if (index === 16 && hasType(graph,'sink.steer')) index = 17
  if (index === 17 && wiredFromIndex(graph,'sink.steer','x','std.steerFromCurv','steer')) index = 18
  return { index, step:L2_STEPS[index] }
}

function activeNodeTypes(graph: Graph): Set<string> {
  const active = new Set<string>()
  const visit = (id:string) => {
    if (active.has(id) || !graph.nodes[id]) return
    active.add(id)
    for (const ref of Object.values(graph.nodes[id].in ?? {})) if (ref[0] === 'n') visit(ref[1] as string)
  }
  graph.order.filter(id => graph.nodes[id].type.startsWith('sink.')).forEach(visit)
  return new Set([...active].map(id => graph.nodes[id].type))
}
function throttleWired(graph: Graph): boolean {
  const sinkId = graph.order.find(n => graph.nodes[n].type === 'sink.throttle')
  return !!(sinkId && graph.nodes[sinkId].in?.x)
}

function steerWired(graph: Graph): boolean {
  const sinkId = graph.order.find(n => graph.nodes[n].type === 'sink.steer')
  return !!(sinkId && graph.nodes[sinkId].in?.x)
}

function issueLabel(issue: GraphIssue): string {
  if (issue.code === 'unwired-output') return 'STEER와 THROTTLE 출력 연결이 필요해요.'
  if (issue.code === 'unwired-input') return `${issue.nodeId}의 ${issue.port} 입력이 비어 있어요.`
  if (issue.code === 'type-mismatch') return '서로 다른 데이터 타입의 포트가 연결되어 있어요.'
  if (issue.code === 'cycle') return 'Delay 없이 순환하는 연결이 있어요.'
  return issue.message
}

export function LevelScreen({ id }: { id: string }) {
  const level = levelById(id)
  const world = useMemo(() => {
    if (id !== 'l1') return buildWorld()
    const provingGround = buildWorld({
      ctrl:[[0,0],[100,0],[200,0],[260,40],[200,80],[100,80],[0,80],[-60,40],[-100,0]] as [number,number][],
      half:7,
    })
    provingGround.height = { at:() => 0, grad:():[number,number] => [0,0], zmin:0, zmax:0, zlo:0, zhi:0 }
    return provingGround
  }, [id])
  const initial = useMemo(() => coreToRF(level.starter), [id])
  const [graph, setGraph] = useState<Graph>(level.starter)
  const [hud, setHud] = useState({ speed:0, best:null as number | null, hold:0 })
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [coach, setCoach] = useState(0)
  const [pane, setPane] = useState<'graph'|'sim'>('graph')
  const [split, setSplit] = useState(55)
  const [simKey, setSimKey] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)
  const setVals = useLive((s) => s.setVals)
  const { complete, goMap, best } = useGame()
  const nextLevel = LEVELS.find(l => l.n === level.n + 1)
  const isTut = level.id === 'tut'
  const isL1 = level.id === 'l1'
  const isL2 = level.id === 'l2'
  const isGuidedBuild = isL1 || isL2
  const l1Build = isL1 ? l1BuildStep(graph) : null
  const l2Build = isL2 ? l2BuildStep(graph) : null
  const guidedBuild = l1Build ?? l2Build
  const guidedSteps = isL1 ? L1_STEPS : L2_STEPS
  const requiredOutputs = useMemo(() => isTut || isL1 ? ['sink.throttle']
    : isL2 ? ['sink.steer'] : undefined, [isTut, isL1, isL2])
  const issues = useMemo(() => validateGraph(graph, NT, {
    requireOutputs:!requiredOutputs, requiredOutputs,
  }), [graph, requiredOutputs])
  const activeTypes = useMemo(() => activeNodeTypes(graph), [graph])
  const checks = level.requirements.map(req => ({ ...req, ok:activeTypes.has(req.type) }))
  const requirementsMet = checks.every(c => c.ok)
  const hasConst = graph.order.some(n => graph.nodes[n].type === 'const')
  const hasThrottle = graph.order.some(n => graph.nodes[n].type === 'sink.throttle')
  const outputReady = isTut || isL1 ? throttleWired(graph) : isL2 ? steerWired(graph) : issues.length === 0
  const canRun = issues.length === 0 && requirementsMet && (!isGuidedBuild || outputReady) && (!isTut || outputReady)
  const editorPalette = guidedBuild?.step.palette ?? level.palette
  const editorHighlight = guidedBuild?.step.highlight ?? (isTut ? (coach === 0 ? 'const' : coach === 1 ? 'sink.throttle' : undefined) : undefined)
  const simGraph = useMemo(() => isL2
    ? makeGraph({ ...L2_THROTTLE_ASSIST.nodes, ...graph.nodes })
    : graph, [graph, isL2])
  const waitingMessage = isGuidedBuild ? guidedBuild!.step.message
    : isTut && !hasConst ? '먼저 Const 동력 파트를 장착하세요.'
    : isTut && !hasThrottle ? 'THROTTLE 출력 파트를 장착하세요.'
    : isTut && !outputReady ? 'Const의 v와 THROTTLE의 x 포트를 연결하세요.'
    : issueLabel(issues[0] ?? { code:'unwired-input', message:'필수 노드를 출력 경로에 연결하세요.' })

  useEffect(() => {
    if (!isTut) return
    if (coach === 0 && hasConst) setCoach(1)
    else if (coach === 1 && hasThrottle) setCoach(2)
    else if (coach === 2 && throttleWired(graph)) { setCoach(3); setPane('sim') }
  }, [graph, isTut, coach, hasConst, hasThrottle])

  useEffect(() => {
    setGraph(level.starter); setCoach(0); setPane('graph'); setResult(null)
  }, [id, level.starter])

  const finishTut = () => { complete('tut', 60); useGame.getState().goLevel('l1') }
  const handleGraph = (next:Graph) => { setGraph(next); setResult(null) }
  const retry = () => { setResult(null); setSimKey(k => k + 1) }

  const onSpeedTrial = (t:number) => {
    if (!isL1) return
    complete(level.id, t)
    setResult({ ok:true, msg:'8 m/s 고정 성공 · ' + t.toFixed(2) + 's' })
  }

  const onLap = (t: number, dirty: boolean) => {
    if (isTut) return
    if (dirty) { setResult({ ok:false, msg:`트랙 이탈 · ${t.toFixed(2)}s` }); return }
    if (level.objective.type === 'time' && t > level.objective.target) {
      setResult({ ok:false, msg:`클린 랩 ${t.toFixed(2)}s · 목표까지 ${(t-level.objective.target).toFixed(2)}s` }); return
    }
    complete(level.id, t)
    setResult({ ok:true, msg:`클리어 · ${t.toFixed(2)}s` })
  }

  const resize = (e:React.PointerEvent) => {
    if (!resizing.current || !bodyRef.current) return
    const box = bodyRef.current.getBoundingClientRect()
    setSplit(Math.max(38, Math.min(68, ((e.clientX-box.left)/box.width)*100)))
  }

  return (
    <div className="level">
      <div className="lv-top">
        <button className="back" onClick={goMap}>← 캠페인</button>
        <div className="lv-title-wrap">
          <span className="eyebrow">{level.kicker}</span>
          <div className="lv-title"><b>0{level.n}</b> {level.title}</div>
        </div>
        <div className="lv-best mono">BEST {best[level.id] != null ? best[level.id].toFixed(2) + 's' : '—'}</div>
        <button className="help-btn" aria-label="도움말 열기" title="도움말" onClick={() => useTut.getState().show()}>?</button>
      </div>

      <div className="mission-bar">
        <div className="mission-copy"><span className="eyebrow">MISSION</span><p>{level.teach}</p></div>
        <div className="mission-checks">
          {isL1 && <span className="done">✓ STRAIGHT PROVING GROUND</span>}
          {isL2 && <span className="done">✓ THROTTLE ASSIST</span>}
          {checks.map(c => <span key={c.type} className={c.ok ? 'done' : ''}>{c.ok ? '✓' : '○'} {c.label}</span>)}
          <span className={outputReady ? 'done' : ''}>{outputReady ? '✓' : '○'} 출력 연결</span>
        </div>
        <div className={'run-state ' + (canRun ? 'ready' : 'waiting')}>
          <i />{canRun ? '실행 준비됨' : waitingMessage}
        </div>
      </div>

      <div className="mobile-tabs" role="tablist" aria-label="작업 화면">
        <button className={pane === 'graph' ? 'on' : ''} onClick={() => setPane('graph')}>그래프</button>
        <button className={pane === 'sim' ? 'on' : ''} onClick={() => setPane('sim')}>시뮬레이션 {canRun ? '✓' : ''}</button>
      </div>

      <div ref={bodyRef} className="lv-body" style={{ ['--split' as any]:split+'%' }}
        onPointerMove={resize} onPointerUp={() => { resizing.current=false }} onPointerCancel={() => { resizing.current=false }}>
        <div className={'lv-pane editor-pane' + (pane !== 'graph' ? ' mobile-hidden' : '')}>
          <Editor key={id} initial={initial} palette={editorPalette} onGraph={handleGraph}
            highlightPalette={editorHighlight} nodeDefaults={isL1 ? { const:{value:8} } : isL2 ? { const:{value:l2Build!.index === 2 ? 6 : 1} } : undefined} requiredOutputs={requiredOutputs} />
        </div>
        <button className="split-handle" aria-label="그래프와 시뮬레이션 영역 너비 조절"
          onPointerDown={(e) => { resizing.current=true; e.currentTarget.setPointerCapture(e.pointerId) }}
          onKeyDown={(e) => { if(e.key==='ArrowLeft') setSplit(v=>Math.max(38,v-2)); if(e.key==='ArrowRight') setSplit(v=>Math.min(68,v+2)) }}>
          <span />
        </button>
        <div className={'lv-pane lv-right' + (pane !== 'sim' ? ' mobile-hidden' : '')}>
          <div className="circuit-head"><div><span>{isL1 ? 'SPEED LAB' : 'LIVE CIRCUIT'}</span><b>{isL1 ? 'STRAIGHT · CONTROL TEST' : 'ON-ROAD · SECTOR 01'}</b></div><em><i /> TELEMETRY ONLINE</em></div>
          <Viewport key={simKey} world={world} graph={simGraph} canRun={canRun}
            trial={level.objective.type === 'speed' ? level.objective : undefined} onTrial={onSpeedTrial}
            onValues={(vals, info) => {
              setVals(vals); setHud({ speed:info.speed, best:info.best, hold:info.hold })
              if (isTut && coach === 3 && info.speed > 2) setCoach(4)
            }}
            onLap={onLap} />
          {(isTut || isGuidedBuild) && <div className="coach">
            <div className="coach-n">{isGuidedBuild ? 'GUIDED BUILD · '+(guidedBuild!.index+1)+'/'+guidedSteps.length : 'GUIDED START · '+(coach+1)+'/'+COACH.length}</div>
            <p>{isGuidedBuild ? guidedBuild!.step.message : COACH[coach]}</p>
            {isTut && coach === COACH.length-1 && <button className="coach-go" onClick={finishTut}>레벨 1로 →</button>}
          </div>}
          <div className="lv-hud mono">
            <span><small>SPEED</small><b>{Math.round(hud.speed*3.6)}</b> km/h</span>
            <span><small>OBJECTIVE</small><b>{level.objective.type === 'time' ? 'CLEAN ≤ ' + level.objective.target + 's' : level.objective.type === 'speed' ? Math.round(level.objective.target*3.6) + ' km/h · ' + level.objective.hold + 's' : 'CLEAN LAP'}</b></span>
            <span><small>{isL1 ? 'TARGET HOLD' : 'SESSION BEST'}</small><b>{isL1 ? Math.min(hud.hold, level.objective.type === 'speed' ? level.objective.hold : 0).toFixed(1) + ' / 2.0s' : hud.best != null ? hud.best.toFixed(2)+'s' : '—'}</b></span>
          </div>
          {result && <div className={'lv-result ' + (result.ok ? 'ok' : 'bad')}>
            <span><small>{result.ok ? 'MISSION COMPLETE' : 'TRY AGAIN'}</small>{result.msg}</span>
            {!result.ok && <button onClick={retry}>↻ 다시 시작</button>}
            {result.ok && nextLevel && <button onClick={() => useGame.getState().goLevel(nextLevel.id)}>다음 레벨 →</button>}
            {result.ok && !nextLevel && <button onClick={goMap}>캠페인으로</button>}
          </div>}
        </div>
      </div>
    </div>
  )
}
