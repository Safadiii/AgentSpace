import { Command, Moon, Search, Sun } from 'lucide-react'
import { motion } from 'motion/react'
import { SPRING_QUICK } from '../../lib/motion'
import type { Theme } from '../../hooks/useTheme'

export type Route = 'home' | 'research'

interface Props {
  route: Route
  theme: Theme
  onNavigate: (route: Route) => void
  onCommand: () => void
  onToggleTheme: () => void
}

export default function TopPill({ route, theme, onNavigate, onCommand, onToggleTheme }: Props) {
  return (
    <header className="pill" role="banner">
      <button className="pill-brand" type="button" onClick={() => onNavigate('home')} aria-label="AgentSpace home">
        <i className="pill-mark" aria-hidden="true" /><span>AgentSpace</span>
      </button>
      <nav className="pill-nav" aria-label="Primary">
        {(['home', 'research'] as const).map(r => (
          <button key={r} type="button" aria-current={route === r ? 'page' : undefined} onClick={() => onNavigate(r)}>
            {route === r && <motion.span layoutId="pill-active" className="pill-active" transition={SPRING_QUICK} />}
            <span className="pill-label">{r === 'home' ? 'Console' : 'Research'}</span>
          </button>
        ))}
      </nav>
      <button className="pill-command" type="button" onClick={onCommand} aria-label="New directive, shortcut Command K">
        <Search size={14} aria-hidden="true" /><span>Ask anything</span><kbd className="kbd"><Command size={10} aria-hidden="true" />K</kbd>
      </button>
      <button className="pill-icon" type="button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
        {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
      </button>
    </header>
  )
}
