import React, { useEffect, useRef, useState } from 'react'
import { makeSim, tick, castScan, DT } from '@apex/core'
import type { World, Graph } from '@apex/core'
import { computeCam, buildTerrain, renderSim, type Cam } from './render'

type Props = {
  world: World
  graph: Graph
  seed?: number
  autoplay?: boolean
  onValues?: (lastVal: Record<string, any> | null, info: { speed:number; lapT:number; best:number|null }) => void
  onLap?: (t: number, dirty: boolean) => void
}
const CW = 1200, CH = 760

export function Viewport({ world, graph, seed = 1, autoplay = true, onValues, onLap }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<ReturnType<typeof makeSim> | null>(null)
  const terrainRef = useRef<HTMLCanvasElement | null>(null)
  const camRef = useRef<Cam | null>(null)
  const argmaxId = useRef<string | null>(null)
  const runRef = useRef(true)
  const speedRef = useRef(1)
  const [running, setRunning] = useState(autoplay)
  const [speed, setSpeed] = useState(1)
  const [lapMsg, setLapMsg] = useState<string>('READY')
  // keep latest callbacks (loop effect captures once)
  const onValuesRef = useRef(onValues); const onLapRef = useRef(onLap)
  useEffect(() => { onValuesRef.current = onValues; onLapRef.current = onLap })

  // (re)build sim when world changes
  useEffect(() => {
    simRef.current = makeSim(world, graph, seed)
    terrainRef.current = buildTerrain(world, CW, CH)
    camRef.current = computeCam(world, CW, CH)
    // eslint-disable-next-line
  }, [world])

  // hot-swap graph without resetting car position (live editing)
  useEffect(() => {
    if (simRef.current) { simRef.current.graph = graph; simRef.current.graphState = {} }
    argmaxId.current = graph.order.find(id => graph.nodes[id].type === 'array.argmax') || null
  }, [graph])

  useEffect(() => { runRef.current = running }, [running])
  useEffect(() => { speedRef.current = speed }, [speed])

  // main loop
  useEffect(() => {
    let raf = 0, last = 0, acc = 0, valAcc = 0
    const loop = (ts: number) => {
      const ctx = canvasRef.current?.getContext('2d')
      const s = simRef.current, cam = camRef.current
      if (ctx && s && cam) {
        if (!last) last = ts
        let dt = Math.min(0.05, (ts - last) / 1000); last = ts
        if (runRef.current) {
          acc += dt * speedRef.current
          let g = 0, prevLaps = s.laps.length
          try { while (acc >= DT && g < 2000) { tick(s); acc -= DT; g++ } } catch (e:any) { setLapMsg('ERR: ' + (e?.message||e)) }
          if (s.laps.length > prevLaps) {
            const lp = s.laps[s.laps.length - 1]
            setLapMsg((lp.dirty ? 'DIRTY ' : 'LAP ') + lp.t.toFixed(3) + 's')
            onLapRef.current?.(lp.t, lp.dirty)
          }
        }
        const scan = castScan(s.car, world)
        const gap = argmaxId.current && s.lastVal ? s.lastVal[argmaxId.current]?.i ?? null : null
        renderSim(ctx, world, s.car, scan, gap, cam, terrainRef.current)
        valAcc += dt
        if (valAcc > 0.1) { valAcc = 0; onValuesRef.current?.(s.lastVal, { speed: s.car.vx, lapT: s.lapT, best: s.best }) }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line
  }, [world])

  const reset = () => { if (simRef.current) simRef.current = makeSim(world, graph, seed); setLapMsg('READY') }
  const stepN = () => { const s = simRef.current; if (s) { try { for (let i=0;i<12;i++) tick(s) } catch {} } }

  return (
    <div className="viewport">
      <div className="vp-stage">
        <div className="vp-tag"><span className="dot" /> SIM · {lapMsg}</div>
        <canvas ref={canvasRef} width={CW} height={CH} />
      </div>
      <div className="vp-controls">
        <button className={running ? 'on' : ''} onClick={() => setRunning(r => !r)}>{running ? '⏸ 일시정지' : '⏵ 재생'}</button>
        <button onClick={stepN} disabled={running}>⏭ 스텝</button>
        <button onClick={reset}>↻ 리셋</button>
        <span className="sp">속도</span>
        {[0.5, 1, 2, 4].map(x => <button key={x} className={speed === x ? 'on' : ''} onClick={() => setSpeed(x)}>{x}×</button>)}
      </div>
    </div>
  )
}
