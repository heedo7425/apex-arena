import React from 'react'
import { useGame } from './store'
import { CampaignMap } from './campaign/CampaignMap'
import { LevelScreen } from './campaign/LevelScreen'

export function App() {
  const screen = useGame((s) => s.screen)
  const levelId = useGame((s) => s.levelId)
  return screen === 'level' && levelId ? <LevelScreen id={levelId} /> : <CampaignMap />
}
