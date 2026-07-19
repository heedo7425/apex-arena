import { create } from 'zustand'

// live node output values (from the running sim) — read by editor node probes, ~10fps
export const useLive = create<{ vals: Record<string, any> | null; setVals: (v: Record<string, any> | null) => void }>(
  (set) => ({ vals: null, setVals: (v) => set({ vals: v }) })
)

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
  return {
    screen: 'map', levelId: null, completed: s.completed, best: s.best,
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
