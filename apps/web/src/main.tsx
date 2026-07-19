import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: any }> {
  constructor(p: any) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err: any) { return { err } }
  render() {
    if (this.state.err) return (
      <div style={{ fontFamily: 'monospace', color: '#ffd7cf', background: '#0a0d12', minHeight: '100vh', padding: 24, whiteSpace: 'pre-wrap' }}>
        <h2>⚠ 런타임 에러</h2>
        <div>{String(this.state.err?.message || this.state.err)}</div>
        <div style={{ opacity: .6, marginTop: 12, fontSize: 12 }}>{String(this.state.err?.stack || '').split('\n').slice(0, 6).join('\n')}</div>
      </div>
    )
    return this.props.children
  }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>)
