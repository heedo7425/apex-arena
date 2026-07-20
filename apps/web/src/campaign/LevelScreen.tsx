import React, { useEffect, useMemo, useRef, useState } from 'react'
import { buildWorld, makeGraph, NT, validateGraph } from '@apex/core'
import type { Graph, GraphIssue } from '@apex/core'
import { Editor } from '../editor/Editor'
import { coreToRF } from '../editor/compile'
import { Viewport } from '../sim/Viewport'
import { useGame, useLive, useTut } from '../store'
import { levelById, LEVELS, L1_STEERING_ASSIST } from './levels'

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
  { message:'속도 제어 회로 완성. 주행을 시작해 클린 랩에 도전하세요.', palette:[] },
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

function issueLabel(issue: GraphIssue): string {
  if (issue.code === 'unwired-output') return 'STEER와 THROTTLE 출력 연결이 필요해요.'
  if (issue.code === 'unwired-input') return `${issue.nodeId}의 ${issue.port} 입력이 비어 있어요.`
  if (issue.code === 'type-mismatch') return '서로 다른 데이터 타입의 포트가 연결되어 있어요.'
  if (issue.code === 'cycle') return 'Delay 없이 순환하는 연결이 있어요.'
  return issue.message
}

export function LevelScreen({ id }: { id: string }) {
  const level = levelById(id)
  const world = useMemo(() => buildWorld(), [])
  const initial = useMemo(() => coreToRF(level.starter), [id])
  const [graph, setGraph] = useState<Graph>(level.starter)
  const [hud, setHud] = useState({ speed: 0, best: null as number | null })
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
  const l1Build = isL1 ? l1BuildStep(graph) : null
  const requiredOutputs = isTut || isL1 ? ['sink.throttle'] : undefined
  const issues = useMemo(() => validateGraph(graph, NT, {
    requireOutputs:!requiredOutputs, requiredOutputs,
  }), [graph, requiredOutputs])
  const activeTypes = useMemo(() => activeNodeTypes(graph), [graph])
  const checks = level.requirements.map(req => ({ ...req, ok:activeTypes.has(req.type) }))
  const requirementsMet = checks.every(c => c.ok)
  const hasConst = graph.order.some(n => graph.nodes[n].type === 'const')
  const hasThrottle = graph.order.some(n => graph.nodes[n].type === 'sink.throttle')
  const outputReady = isTut || isL1 ? throttleWired(graph) : issues.length === 0
  const canRun = issues.length === 0 && requirementsMet && (!(isTut || isL1) || outputReady)
  const editorPalette = l1Build?.step.palette ?? level.palette
  const editorHighlight = l1Build?.step.highlight ?? (isTut ? (coach === 0 ? 'const' : coach === 1 ? 'sink.throttle' : undefined) : undefined)
  const simGraph = useMemo(() => isL1
    ? makeGraph({ ...L1_STEERING_ASSIST.nodes, ...graph.nodes })
    : graph, [graph, isL1])
  const waitingMessage = isL1 ? l1Build!.step.message
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
          {isL1 && <span className="done">✓ STEERING ASSIST</span>}
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
            highlightPalette={editorHighlight} nodeDefaults={isL1 ? { const:{value:8} } : undefined} requiredOutputs={requiredOutputs} />
        </div>
        <button className="split-handle" aria-label="그래프와 시뮬레이션 영역 너비 조절"
          onPointerDown={(e) => { resizing.current=true; e.currentTarget.setPointerCapture(e.pointerId) }}
          onKeyDown={(e) => { if(e.key==='ArrowLeft') setSplit(v=>Math.max(38,v-2)); if(e.key==='ArrowRight') setSplit(v=>Math.min(68,v+2)) }}>
          <span />
        </button>
        <div className={'lv-pane lv-right' + (pane !== 'sim' ? ' mobile-hidden' : '')}>
          <div className="circuit-head"><div><span>LIVE CIRCUIT</span><b>ON-ROAD · SECTOR 01</b></div><em><i /> TELEMETRY ONLINE</em></div>
          <Viewport key={simKey} world={world} graph={simGraph} canRun={canRun}
            onValues={(vals, info) => {
              setVals(vals); setHud({ speed:info.speed, best:info.best })
              if (isTut && coach === 3 && info.speed > 2) setCoach(4)
            }}
            onLap={onLap} />
          {(isTut || isL1) && <div className="coach">
            <div className="coach-n">{isL1 ? 'GUIDED BUILD · '+(l1Build!.index+1)+'/'+L1_STEPS.length : 'GUIDED START · '+(coach+1)+'/'+COACH.length}</div>
            <p>{isL1 ? l1Build!.step.message : COACH[coach]}</p>
            {isTut && coach === COACH.length-1 && <button className="coach-go" onClick={finishTut}>레벨 1로 →</button>}
          </div>}
          <div className="lv-hud mono">
            <span><small>SPEED</small><b>{Math.round(hud.speed*3.6)}</b> km/h</span>
            <span><small>OBJECTIVE</small><b>{level.objective.type === 'time' ? `CLEAN ≤ ${level.objective.target}s` : 'CLEAN LAP'}</b></span>
            <span><small>SESSION BEST</small><b>{hud.best != null ? hud.best.toFixed(2)+'s' : '—'}</b></span>
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
