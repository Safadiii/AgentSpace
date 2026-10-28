import { useEffect, useRef } from 'react'

/** One slow line field behind the console. Static when reduced motion is on, paused when the tab is hidden,
 *  and omitted in the light theme where it adds nothing. */
export default function Atmosphere({ theme }: { theme: 'dark' | 'light' }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || theme === 'light') return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, t = 0, raf = 0

    const size = () => { w = canvas.width = window.innerWidth * dpr; h = canvas.height = window.innerHeight * dpr }
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(255,255,255,.05)'
      ctx.lineWidth = dpr
      for (let i = 0; i < 26; i++) {
        ctx.beginPath()
        for (let k = 0; k <= 60; k++) {
          const x = (k / 60) * w
          const y = h * (.15 + i * .032) + Math.sin(k * .22 + t + i * .5) * 18 * dpr * (1 + i * .04)
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y)
        }
        ctx.stroke()
      }
      t += .004
      if (!motion.matches && !document.hidden) raf = requestAnimationFrame(draw)
    }
    const restart = () => { cancelAnimationFrame(raf); draw() }

    size(); draw()
    const onResize = () => { size(); restart() }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', restart)
    motion.addEventListener('change', restart)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', restart)
      motion.removeEventListener('change', restart)
    }
  }, [theme])

  return <canvas ref={ref} className="atmosphere" aria-hidden="true" />
}
