import { create } from 'zustand'
import type { Graph } from '@apex/core'

// live node output values (from the running sim) — read by editor node probes, ~10fps
export const useLive = create<{ vals: Record<string, any> | null; setVals: (v: Record<string, any> | null) => void }>(
  (set) => ({ vals: null, setVals: (v) => set({ vals: v }) })
)

// ---- read-only experiment visualization; never feeds values back into the graph ----
export type VisualizedSignal = {
  id:string
  nodeId:string
  port:string
  label:string
  unit:string
  valueType:string
  color:string
}
export type VisualizationPoint = { t:number; value:number }
export type ExperimentRun={slot:'A'|'B';capturedAt:number;stats:Record<string,{min:number;max:number;mean:number;samples:number}>}
type SignalDraft = Omit<VisualizedSignal,'id'|'color'>
type Visualization = {
  signals:VisualizedSignal[]
  samples:Record<string,VisualizationPoint[]>
  latest:Record<string,unknown>
  runs:Partial<Record<'A'|'B',ExperimentRun>>
  open:boolean
  lastTime:number|null
  addSignal:(signal:SignalDraft)=>void
  removeSignal:(id:string)=>void
  sample:(time:number,values:Record<string,any>|null)=>void
  clearSamples:()=>void
  clearAll:()=>void
  toggle:()=>void
  saveRun:(slot:'A'|'B')=>void
}
const VIS_COLORS=['#1FDDC9','#F0B541','#69AEEB','#F27D62','#B7DB67','#E78FD0']
export const useVisualization=create<Visualization>((set,get)=>({
  signals:[],samples:{},latest:{},runs:{},open:false,lastTime:null,
  addSignal:(draft)=>{
    const id=`${draft.nodeId}.${draft.port}`
    const current=get().signals
    if(current.some(s=>s.id===id)){set({open:true});return}
    const signal:{id:string;color:string}&SignalDraft={...draft,id,color:VIS_COLORS[current.length%VIS_COLORS.length]}
    set({signals:[...current,signal],samples:{...get().samples,[id]:[]},open:true})
  },
  removeSignal:(id)=>set(state=>{
    const samples={...state.samples};delete samples[id]
    return {signals:state.signals.filter(s=>s.id!==id),samples}
  }),
  sample:(time,values)=>{
    const state=get()
    if(!values||!state.signals.length||time===state.lastTime)return
    const reset=state.lastTime!=null&&time<state.lastTime
    const samples:Record<string,VisualizationPoint[]>={...state.samples}
    const latest={...state.latest}
    for(const signal of state.signals){
      const value=values[signal.nodeId]?.[signal.port]
      if(value===undefined)continue
      latest[signal.id]=value  // spatial (objects/trajectory/prediction/space) + numeric both land here for overlay
      if(typeof value!=='number'||!Number.isFinite(value))continue  // only numeric feeds the timeline
      const previous=reset?[]:(samples[signal.id]||[])
      samples[signal.id]=[...previous,{t:time,value}].slice(-360)
    }
    set({samples,latest,lastTime:time})
  },
  clearSamples:()=>set(state=>({samples:Object.fromEntries(state.signals.map(s=>[s.id,[]])),latest:{},lastTime:null})),
  clearAll:()=>set({signals:[],samples:{},latest:{},runs:{},open:false,lastTime:null}),
  saveRun:(slot)=>set(state=>{
    const stats:ExperimentRun['stats']={}
    for(const signal of state.signals){
      const values=(state.samples[signal.id]??[]).map(p=>p.value)
      if(values.length)stats[signal.id]={min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length,samples:values.length}
    }
    return {runs:{...state.runs,[slot]:{slot,capturedAt:Date.now(),stats}}}
  }),
  toggle:()=>set(state=>({open:!state.open})),
}))

// ---- reusable player-made blocks (persisted across missions) ----
export type SavedBlock = { id:string; label:string; params:Record<string,any> }
const BLOCK_KEY = 'apex_block_library_v1'
function loadBlocks():SavedBlock[]{ try { const v=JSON.parse(localStorage.getItem(BLOCK_KEY)||'[]'); return Array.isArray(v)?v:[] } catch { return [] } }
function persistBlocks(blocks:SavedBlock[]){ try { localStorage.setItem(BLOCK_KEY,JSON.stringify(blocks)) } catch {} }
type BlockLibrary = {
  blocks:SavedBlock[]
  saveBlock:(label:string,params:Record<string,any>)=>void
  removeBlock:(id:string)=>void
}
export const useBlockLibrary=create<BlockLibrary>((set,get)=>({
  blocks:loadBlocks(),
  saveBlock:(label,params)=>{
    const blocks=get().blocks
    const seq=Math.max(0,...blocks.map(b=>Number(b.id.split('_').pop())||0))+1
    const clean=JSON.parse(JSON.stringify(params))
    const next=[...blocks,{id:`saved_${seq}`,label,params:clean}]
    persistBlocks(next);set({blocks:next})
  },
  removeBlock:(id)=>{
    const next=get().blocks.filter(b=>b.id!==id)
    persistBlocks(next);set({blocks:next})
  },
}))

// ---- complete control-graph designs, versioned per mission ----
export type SavedDesign={id:string;name:string;levelId:string;version:number;createdAt:number;graph:Graph}
const DESIGN_KEY='apex_design_library_v1'
function loadDesigns():SavedDesign[]{try{const v=JSON.parse(localStorage.getItem(DESIGN_KEY)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function persistDesigns(designs:SavedDesign[]){try{localStorage.setItem(DESIGN_KEY,JSON.stringify(designs))}catch{}}
type DesignLibrary={
  designs:SavedDesign[]
  saveDesign:(levelId:string,name:string,graph:Graph)=>SavedDesign
  removeDesign:(id:string)=>void
}
export const useDesignLibrary=create<DesignLibrary>((set,get)=>({
  designs:loadDesigns(),
  saveDesign:(levelId,name,graph)=>{
    const designs=get().designs
    const version=Math.max(0,...designs.filter(d=>d.levelId===levelId&&d.name===name).map(d=>d.version))+1
    const design:SavedDesign={id:`${levelId}_${Date.now()}_${version}`,name,levelId,version,createdAt:Date.now(),graph:JSON.parse(JSON.stringify(graph))}
    const next=[...designs,design];persistDesigns(next);set({designs:next});return design
  },
  removeDesign:(id)=>{
    const next=get().designs.filter(d=>d.id!==id)
    persistDesigns(next);set({designs:next})
  },
}))

// ---- click-to-connect: currently armed port (nodeId|handle|kind) ----
export const usePending = create<{ sel: string | null; setSel: (s: string | null) => void }>(
  (set) => ({ sel: null, setSel: (sel) => set({ sel }) })
)

// ---- concept overview modal (reopenable via ? — not auto-shown; onboarding is the tutorial level) ----
export const useTut = create<{ open: boolean; show: () => void; close: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}))

// ---- game progress (persisted) ----
const KEY = 'apex_progress_v1'
type Saved = { completed: string[]; best: Record<string, number> }
function load(): Saved { try { return JSON.parse(localStorage.getItem(KEY) || '') } catch { return { completed: [], best: {} } } }
function save(s: Saved) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {} }

type Game = {
  screen: 'map' | 'level'
  levelId: string | null
  completed: string[]
  best: Record<string, number>
  goMap: () => void
  goLevel: (id: string) => void
  complete: (id: string, time: number) => void
}
export const useGame = create<Game>((set, get) => {
  const s = load()
  // first-ever visit → drop straight into the tutorial level (no "where do I start")
  const onboarded = (() => { try { return !!localStorage.getItem('apex_onboard') } catch { return true } })()
  try { localStorage.setItem('apex_onboard', '1') } catch {}
  return {
    screen: onboarded ? 'map' : 'level', levelId: onboarded ? null : 'tut',
    completed: s.completed, best: s.best,
    goMap: () => set({ screen: 'map', levelId: null }),
    goLevel: (id) => set({ screen: 'level', levelId: id }),
    complete: (id, time) => {
      const st = get()
      const completed = st.completed.includes(id) ? st.completed : [...st.completed, id]
      const best = { ...st.best, [id]: st.best[id] != null ? Math.min(st.best[id], time) : time }
      save({ completed, best }); set({ completed, best })
    },
  }
})
