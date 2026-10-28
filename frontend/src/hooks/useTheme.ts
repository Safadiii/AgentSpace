import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'agentspace:theme'

function readTheme(): Theme {
  try { const v = window.localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v } catch { /* storage may be blocked */ }
  return 'dark'
}

/** Dark is the designed default; the choice persists per browser. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070809' : '#eceef1')
    try { window.localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
