import { create } from 'zustand'

// live node output values (from the running sim) — read by editor node probes, ~10fps
export const useLive = create<{ vals: Record<string, any> | null; setVals: (v: Record<string, any> | null) => void }>(
  (set) => ({ vals: null, setVals: (v) => set({ vals: v }) })
)

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
