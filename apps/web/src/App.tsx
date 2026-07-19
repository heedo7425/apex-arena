import React from 'react'
import { useGame, useTut } from './store'
import { CampaignMap } from './campaign/CampaignMap'
import { LevelScreen } from './campaign/LevelScreen'
import { Tutorial } from './Tutorial'

export function App() {
  const screen = useGame((s) => s.screen)
  const levelId = useGame((s) => s.levelId)
  const tutOpen = useTut((s) => s.open)
  return (
    <>
      {screen === 'level' && levelId ? <LevelScreen id={levelId} /> : <CampaignMap />}
      {tutOpen && <Tutorial />}
    </>
  )
}
