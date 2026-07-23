import React, { useEffect, useState } from 'react'
import { useGame, useTut } from './store'
import { CampaignMap } from './campaign/CampaignMap'
import { LevelScreen } from './campaign/LevelScreen'
import { Tutorial } from './Tutorial'
import { AcademyMap } from './academy/AcademyMap'
import { RaceHub } from './race/RaceHub'

type Theme = 'light' | 'dark'
function initialTheme():Theme {
  try {
    const saved = localStorage.getItem('apex_theme')
    if (saved === 'light' || saved === 'dark') return saved
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch { return 'dark' }
}

export function App() {
  const screen = useGame((s) => s.screen)
  const levelId = useGame((s) => s.levelId)
  const tutOpen = useTut((s) => s.open)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => { window.scrollTo({ top:0, behavior:"auto" }) }, [screen, levelId])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('apex_theme', theme) } catch {}
  }, [theme])

  return (
    <>
      <button className="theme-toggle" aria-label={theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'}
        onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
        <span>{theme === 'dark' ? '☼' : '◐'}</span>{theme === 'dark' ? 'LIGHT' : 'DARK'}
      </button>
      {screen === 'level' && levelId ? <LevelScreen id={levelId} /> : screen === 'academy' ? <AcademyMap /> : screen === 'race' ? <RaceHub /> : <CampaignMap />}
      {tutOpen && <Tutorial />}
    </>
  )
}
