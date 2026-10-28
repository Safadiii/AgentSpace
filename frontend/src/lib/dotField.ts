import { isShape, shapes } from './dotShapes'

/** Dot-matrix scroll engine. One fixed canvas draws every [data-god] element as ordered-dither dots.
 *  - Shapes assemble from scattered dots as their element nears the middle of the viewport, and disperse as it leaves.
 *  - Shapes drift against the scroll; dots near the pointer brighten and are nudged away.
 *  - data-god="sea": drifting wave rows with a trireme that sails across as you scroll past.
 *  - data-god="text": the headline in dots (the element's `data-text` holds the words).
 *  Reduced motion: everything is drawn assembled and still, and only redraws on scroll, resize and pointer events. */

interface Dot { x: number; y: number; lum: number; sx: number; sy: number; delay: number; ph: number }
interface Opts { rot: number; cx: number; cy: number }

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(r => r.map(v => (v + .5) / 16))
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function createDotField(canvas: HTMLCanvasElement, fontFamily = 'Geist Variable') {
  const ctx = canvas.getContext('2d')!
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const cache = new Map<string, Dot[]>()
  const state = new WeakMap<Element, { p: number }>()
  const mouse = { x: -9999, y: -9999 }
  let W = 0, H = 0, dpr = 1, raf = 0, t = 0
  const gap = () => (window.innerWidth < 700 ? 4 : 6)

  function build(key: string, name: string, text: string, w: number, h: number) {
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.round(w)); off.height = Math.max(1, Math.round(h))
    const c = off.getContext('2d', { willReadFrequently: true })!
    c.fillStyle = '#000'; c.fillRect(0, 0, off.width, off.height)
    if (name === 'text') {
      const lines = w < 700 && text.includes(' ') ? [text.split(' ').slice(0, -1).join(' '), text.split(' ').slice(-1)[0]] : [text]
      const face = `"${fontFamily}", system-ui, sans-serif`
      c.font = `600 100px ${face}`; c.textAlign = 'center'; c.textBaseline = 'middle'
      const widest = Math.max(...lines.map(l => c.measureText(l).width))
      const size = Math.min(100 * (w * .96) / widest, (h / lines.length) * .92)
      c.font = `600 ${size}px ${face}`; c.fillStyle = '#fff'
      lines.forEach((l, i) => c.fillText(l, w / 2, h * ((i + .5) / lines.length)))
    } else if (isShape(name)) shapes[name](c, off.width, off.height)
    const d = c.getImageData(0, 0, off.width, off.height).data, G = gap(), dots: Dot[] = []
    for (let gy = G / 2, iy = 0; gy < off.height; gy += G, iy++) for (let gx = G / 2, ix = 0; gx < off.width; gx += G, ix++) {
      const lum = d[(Math.floor(gy) * off.width + Math.floor(gx)) * 4] / 255
      if (lum < .06 || lum < BAYER[iy & 3][ix & 3] * .85) continue
      dots.push({ x: gx, y: gy, lum, sx: gx + (Math.random() - .5) * w * 1.1, sy: gy + (Math.random() - .1) * h * 1.1 + h * .25, delay: Math.random() * .5, ph: Math.random() * 6.28 })
    }
    cache.set(key, dots)
    return dots
  }
  const dotsFor = (name: string, text: string, w: number, h: number) => {
    const key = `${name}|${text}|${Math.round(w)}x${Math.round(h)}|${gap()}`
    return cache.get(key) ?? build(key, name, text, w, h)
  }

  function plot(dots: Dot[], ox: number, oy: number, p: number, base: number, opts?: Opts) {
    const G = gap(), still = motion.matches
    for (const d of dots) {
      const local = still ? 1 : clamp((p * 1.5 - d.delay) / .6)
      if (local <= 0) continue
      const e = 1 - Math.pow(1 - local, 3)
      let x = ox + lerp(d.sx, d.x, e), y = oy + lerp(d.sy, d.y, e)
      if (opts) {
        const dx = d.x - opts.cx, dy = d.y - opts.cy, cs = Math.cos(opts.rot), sn = Math.sin(opts.rot)
        x = ox + opts.cx + dx * cs - dy * sn; y = oy + opts.cy + dx * sn + dy * cs
      }
      let a = local * base * (.55 + .45 * d.lum) + (still ? 0 : Math.sin(t * 1.6 + d.ph) * .05 * local)
      let r = G * (.18 + .24 * d.lum)
      if (!still) {
        const mx = x - mouse.x, my = y - mouse.y, d2 = mx * mx + my * my
        if (d2 < 16900) { const dist = Math.sqrt(d2) || 1, f = 1 - dist / 130; a += f * .55; r += f * 1.1; x += (mx / dist) * f * 9; y += (my / dist) * f * 9 }
      }
      ctx.globalAlpha = clamp(a); ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }

  function drawSea(rect: DOMRect, p: number) {
    const G = gap(), rows = 7
    const waveY = (x: number, row: number) => rect.top + rect.height * (.32 + row * .095) + Math.sin(x * .011 + t * 1.1 + row * .9) * (4 + row * 1.6)
    for (let row = 0; row < rows; row++) {
      ctx.globalAlpha = clamp((.14 + row * .09) * p)
      const r = G * (.16 + row * .035)
      for (let x = 0; x < rect.width; x += G) {
        const y = waveY(x, row) + (1 - p) * 8 * (row + 1)
        ctx.fillRect(rect.left + x - r, y - r, r * 2, r * 2)
      }
    }
    const bw = Math.min(rect.width * .42, 300), bh = bw * .62
    const prog = clamp((H - rect.top) / (rect.height + H * .35))
    const cx = rect.left + (rect.width + bw) * prog - bw * .6
    const local = (cx - rect.left)
    const y0 = waveY(local, 2), slope = (waveY(local + 12, 2) - waveY(local - 12, 2)) / 24
    plot(dotsFor('trireme', '', bw, bh), cx - bw / 2, y0 - bh * .62, p, .95, { rot: Math.atan(slope) * .8, cx: bw / 2, cy: bh * .8 })
  }

  function frame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = document.documentElement.dataset.theme === 'light' ? '#0e1116' : '#f4f4f5'
    document.querySelectorAll<HTMLElement>('[data-god]').forEach(el => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 10 || rect.height < 10 || rect.bottom < -200 || rect.top > H + 200) return
      const name = el.dataset.god ?? '', mid = rect.top + rect.height / 2
      const linger = name === 'sea' || name === 'text'
      const target = linger ? clamp((H - rect.top) / (H * .45)) : clamp(clamp(1 - Math.abs(mid - H * .5) / (H * .6)) ** .7 * 1.15)
      let st = state.get(el)
      if (!st) { st = { p: motion.matches ? 1 : 0 }; state.set(el, st) }
      st.p += (target - st.p) * (motion.matches ? 1 : .09)
      if (name === 'sea') { drawSea(rect, st.p); return }
      plot(dotsFor(name, el.dataset.text ?? '', rect.width, rect.height), rect.left, rect.top + (linger ? 0 : (mid - H / 2) * -.12), st.p, name === 'text' ? .7 : .62)
    })
    ctx.globalAlpha = 1
  }

  function loop() { t += .016; frame(); raf = requestAnimationFrame(loop) }
  function start() { cancelAnimationFrame(raf); if (motion.matches) frame(); else if (!document.hidden) loop() }
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; cache.clear()
  }
  const onResize = () => { size(); start() }
  const onScroll = () => { if (motion.matches) frame() }
  const onPointer = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; if (motion.matches) frame() }
  const onLeave = () => { mouse.x = mouse.y = -9999 }
  const onTheme = () => { if (motion.matches) frame() }

  size()
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointermove', onPointer, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  document.addEventListener('visibilitychange', start)
  motion.addEventListener('change', start)
  const observer = new MutationObserver(onTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  let alive = true
  ;(document.fonts?.ready ?? Promise.resolve()).then(() => { if (alive) { cache.clear(); start() } })
  start()

  return () => {
    alive = false; cancelAnimationFrame(raf); observer.disconnect()
    window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll); window.removeEventListener('pointermove', onPointer)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    document.removeEventListener('visibilitychange', start); motion.removeEventListener('change', start)
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}
