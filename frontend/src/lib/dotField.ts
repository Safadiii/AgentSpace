import { isShape, paintShapeAccents, shapes } from './dotShapes'

/**
 * One fixed canvas renders every [data-god] element as dithered dots.
 *
 * Color is sampled from transparent, per-shape accent masks and only revealed
 * on hover. The base silhouette, scatter/assemble animation, scroll movement,
 * pointer response, sea/trireme scene and reduced-motion behavior are retained.
 *
 * Usage: createDotField(canvas) in your existing mount/effect; call the returned
 * cleanup function on unmount. Keep canvas { pointer-events: none } in CSS.
 */
interface Dot {
  x: number
  y: number
  lum: number
  sx: number
  sy: number
  delay: number
  ph: number
  color?: string
  colorAlpha?: number
  extra?: boolean
  glow?: 'violet' | 'electric' | 'ember'
  green?: boolean
}

interface Opts { rot: number; cx: number; cy: number }
interface ElementState { p: number; hover: number }

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map(row => row.map(value => (value + .5) / 16))

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (v: number) => 1 - (1 - v) ** 3

export function createDotField(canvas: HTMLCanvasElement, fontFamily = 'Geist Variable') {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not initialize 2D canvas')
  const ctx: CanvasRenderingContext2D = context

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const cache = new Map<string, Dot[]>()
  const state = new WeakMap<Element, ElementState>()
  const mouse = { x: -9999, y: -9999 }

  let W = 0, H = 0, dpr = 1, raf = 0, t = 0, lastFrameTime = 0, alive = true
  const gap = () => (window.innerWidth < 700 ? 4 : 6)

  function build(key: string, name: string, text: string, width: number, height: number): Dot[] {
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.round(width))
    off.height = Math.max(1, Math.round(height))
    const c = off.getContext('2d', { willReadFrequently: true })!
    c.fillStyle = '#000'
    c.fillRect(0, 0, off.width, off.height)

    if (name === 'text') {
      const words = text.trim().split(/\s+/)
      const lines = width < 700 && words.length > 1
        ? [words.slice(0, -1).join(' '), words[words.length - 1]]
        : [text]
      const face = `"${fontFamily}", system-ui, sans-serif`
      c.font = `600 100px ${face}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      const widest = Math.max(1, ...lines.map(line => c.measureText(line).width))
      const size = Math.max(1, Math.min(100 * (width * .96) / widest, (height / lines.length) * .92))
      c.font = `600 ${size}px ${face}`
      c.fillStyle = '#fff'
      lines.forEach((line, i) => c.fillText(line, width / 2, height * ((i + .5) / lines.length)))
    } else if (isShape(name)) {
      shapes[name](c, off.width, off.height)
    }

    // A *second* transparent raster is used only to tell each dot which color
    // it should acquire. That raster itself is never drawn on the main canvas.
    let accentPixels: Uint8ClampedArray | undefined
    if (isShape(name)) {
      const accentCanvas = document.createElement('canvas')
      accentCanvas.width = off.width
      accentCanvas.height = off.height
      const accentCtx = accentCanvas.getContext('2d', { willReadFrequently: true })!
      paintShapeAccents(name, accentCtx, off.width, off.height, gap())
      accentPixels = accentCtx.getImageData(0, 0, off.width, off.height).data
    }

    const pixels = c.getImageData(0, 0, off.width, off.height).data
    const G = gap()
    const dots: Dot[] = []

    for (let gy = G / 2, iy = 0; gy < off.height; gy += G, iy++) {
      for (let gx = G / 2, ix = 0; gx < off.width; gx += G, ix++) {
        const pixelIndex = (Math.floor(gy) * off.width + Math.floor(gx)) * 4
        const lum = pixels[pixelIndex] / 255
        const threshold = BAYER[iy & 3][ix & 3]
        const isBaseDot = lum >= .06 && lum >= threshold * .85

        const alpha = accentPixels ? accentPixels[pixelIndex + 3] / 255 : 0
        const isColorDot = alpha > .17
        // When a decoration is in a black part of the silhouette (the owl's
        // sockets, vines outside the columns), create a hover-only dot there.
        const isExtraDot = !isBaseDot && lum < .06 && alpha >= threshold * .76 && alpha > .23
        if (!isBaseDot && !isExtraDot) continue

        const dot: Dot = {
          x: gx, y: gy, lum,
          sx: gx + (Math.random() - .5) * width * 1.1,
          sy: gy + (Math.random() - .1) * height * 1.1 + height * .25,
          delay: Math.random() * .5,
          ph: Math.random() * Math.PI * 2,
        }

        if (isColorDot) {
          const r = accentPixels![pixelIndex]
          const g = accentPixels![pixelIndex + 1]
          const b = accentPixels![pixelIndex + 2]
          dot.color = `rgb(${r}, ${g}, ${b})`
          dot.colorAlpha = alpha
          dot.green = isLeaf(dot.color)

          const nx = gx / width, ny = gy / height
          if (name === 'athena' && Math.abs(ny - .33) < .08 &&
              (Math.abs(nx - .4) < .08 || Math.abs(nx - .6) < .08)) {
            dot.glow = 'violet'
          } else if (name === 'zeus' && b > r * 1.22) {
            dot.glow = 'electric'
          } else if (name === 'hephaestus' && r > g * 1.15 && r > b * 1.5 && ny < .55) {
            dot.glow = 'ember'
          }
        }
        if (isExtraDot) dot.extra = true
        dots.push(dot)
      }
    }

    cache.set(key, dots)
    return dots
  }

  function dotsFor(name: string, text: string, width: number, height: number) {
    const key = `${name}|${text}|${Math.round(width)}x${Math.round(height)}|${gap()}`
    return cache.get(key) ?? build(key, name, text, width, height)
  }

  function plot(dots: Dot[], ox: number, oy: number, p: number, base: number, hover = 0, opts?: Opts, name = '', width = 1, height = 1) {
    const G = gap()
    const still = motion.matches
    const ink = document.documentElement.dataset.theme === 'light' ? '#0e1116' : '#f4f4f5'
    const clock = still ? 0 : t
    // Blink is a quick, infrequent closure. Unlike random animation, it
    // remains deterministic between frames and has no lifetime state.
    const blink = name === 'athena' && !still && hover > .1
      ? clamp(1 - Math.abs((clock + .8) % 5.2 - 3.3) / .15)
      : 0

    for (const d of dots) {
      const local = still ? 1 : clamp((p * 1.5 - d.delay) / .6)
      if (local <= 0) continue
      const assembled = ease(local)
      let lx = lerp(d.sx, d.x, assembled)
      let ly = lerp(d.sy, d.y, assembled)

      if (opts) {
        const dx = lx - opts.cx, dy = ly - opts.cy
        const cs = Math.cos(opts.rot), sn = Math.sin(opts.rot)
        lx = opts.cx + dx * cs - dy * sn
        ly = opts.cy + dx * sn + dy * cs
      }
      // Movement is deliberately confined to the relevant part of each glyph.
      // The original dot locations are unchanged at rest and for reduced motion.
      if (!still && hover > .01) {
        const px = d.x / width, py = d.y / height
        if (name === 'temple' && d.green) {
          lx += Math.sin(clock * 1.7 + py * 18 + d.ph * .15) * 2.3 * hover
          ly += Math.sin(clock * 1.3 + px * 9) * .7 * hover
        } else if (name === 'hermes' && py < .35 && Math.abs(px - .5) > .1) {
          const wingTip = clamp((Math.abs(px - .5) - .1) / .36)
          ly += Math.sin(clock * 5.6 + px * 5.1) * wingTip * 3.4 * hover
          lx += Math.cos(clock * 4.6 + py * 7) * wingTip * .8 * hover
        } else if (name === 'hermes' && py > .3 && py < .93 && d.green) {
          lx += Math.sin(clock * 3.4 + py * 20) * 2.1 * hover
        } else if (name === 'hephaestus' && py > .48 && py < .66) {
          ly += Math.sin(clock * 3.3 + px * 14) * .9 * hover
        } else if (name === 'trireme') {
          ly += Math.sin(clock * 1.9) * 1.45 * hover
          if (py > .1 && py < .4 && px > .26 && px < .73) {
            lx += Math.sin(clock * 2.8 + py * 15) * 3.6 * hover * Math.sin((py - .1) / .3 * Math.PI)
          } else if (py > .6 && py < .86) {
            lx += Math.sin(clock * 4.2 + px * 18) * 1.5 * hover
          }
        }
      }
      let x = ox + lx, y = oy + ly
      let alpha = local * base * (.55 + .45 * d.lum) +
        (still ? 0 : Math.sin(t * 1.6 + d.ph) * .05 * local)
      let r = G * (.18 + .24 * d.lum)

      if (!still) {
        const dx = x - mouse.x, dy = y - mouse.y
        const d2 = dx * dx + dy * dy
        if (d2 < 16900) {
          const distance = Math.sqrt(d2) || 1
          const force = 1 - distance / 130
          alpha += force * .55
          r += force * 1.1
          // Gentle physical response rather than only brightening the dot.
          x += dx / distance * force * 3
          y += dy / distance * force * 3
        }
      }

      const eyeDot = name === 'athena' &&
        (Math.abs(d.x / width - .4) < .07 || Math.abs(d.x / width - .6) < .07) &&
        Math.abs(d.y / height - .33) < .065
      // Suppress the eye dots for a few frames, so the owl actually blinks
      // rather than merely flashing its violet glow.
      if (eyeDot && blink > .42) continue
      if (!d.extra) {
        ctx.fillStyle = ink
        ctx.globalAlpha = clamp(alpha)
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }

      if (hover > .01 && d.color) {
        let vitality = 1
        if (!still && d.glow === 'violet') vitality = .88 + .12 * Math.sin(t * 3.7 + d.ph)
        if (!still && d.glow === 'electric') vitality = .82 + .18 * Math.sin(t * 12 + d.ph) ** 2
        // Plant foliage reveals upward from the base as though growing.
        if (name === 'temple' && d.green && d.y / height < .81 - hover * .44) continue
        if (name === 'athena' && d.glow === 'violet') vitality *= 1 - blink * .96
        if (name === 'hephaestus' && d.glow === 'ember')
          vitality *= .75 + .25 * Math.sin(clock * 9 + d.ph) ** 2
        const colorOpacity = clamp(hover * local * (d.colorAlpha ?? 1) * vitality)
        if (colorOpacity < .015) continue
        ctx.fillStyle = d.color
        ctx.globalAlpha = colorOpacity

        // Glow only a handful of significant colored dots, never every pixel.
        if (d.glow && hover > .12) {
          ctx.shadowColor = d.glow === 'violet' ? '#a263ff'
            : d.glow === 'electric' ? '#32cfff' : '#ff6e28'
          ctx.shadowBlur = (d.glow === 'violet' ? 14 : d.glow === 'electric' ? 10 : 7) * hover
        }
        const colorSize = d.extra ? G * .36 : r
        ctx.fillRect(x - colorSize, y - colorSize, colorSize * 2, colorSize * 2)
        ctx.shadowBlur = 0
      }
    }
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }

  // Per-frame geometry is deterministic and bounded; no particle pools,
  // DOM decorations or extra canvases are created by these effects.
  function isLeaf(color: string) {
    // Emerald, sage and olive RGBs used by the color masks. Exclude warm gold.
    const values = color.match(/\d+/g)
    if (!values) return false
    const [r, g, b] = values.map(Number)
    return g > r * 1.07 && g > b * .96
  }

  function pixel(x: number, y: number, radius: number, color: string, alpha: number) {
    if (alpha < .012) return
    ctx.fillStyle = color
    ctx.globalAlpha = clamp(alpha)
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  function trace(
    x0: number, y0: number, x1: number, y1: number,
    step: number, color: string, alpha: number, radius: number,
  ) {
    const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step))
    for (let i = 0; i <= count; i++) {
      const f = i / count
      pixel(lerp(x0, x1, f), lerp(y0, y1, f), radius, color, alpha)
    }
  }

  /** Athena — living eyes, irregular blink, gilded feathers and orbiting motes. */
  function drawAthenaLiving(rect: DOMRect, hover: number, assembly: number) {
    const strength = clamp(hover * assembly)
    if (strength < .015) return
    const still = motion.matches, clock = still ? 0 : t, G = gap()
    const px = (x: number) => rect.left + rect.width * x
    const py = (y: number) => rect.top + rect.height * y
    const blink = still ? 0 : clamp(1 - Math.abs((clock + .8) % 5.2 - 3.3) / .15)
    const breathe = still ? .65 : .6 + .4 * Math.sin(clock * 3.4) ** 2

    for (const eyeX of [.4, .6]) {
      const ex = px(eyeX), ey = py(.33)
      if (blink > .3) {
        // A tiny lid drawn with squares, not a filled graphic.
        const close = Math.min(1, blink * 1.4)
        trace(px(eyeX - .055), ey, px(eyeX + .055), ey,
          G * .8, '#ddc9fa', strength * close * .98, G * .24)
      } else {
        const orbit = G * (1.0 + breathe * .34)
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2 + clock * .65
          const r = rect.width * .044 + orbit
          pixel(ex + Math.cos(a) * r, ey + Math.sin(a) * r,
            G * .16, i % 3 ? '#a872ff' : '#e0c7ff',
            strength * (i % 3 ? .16 : .42) * breathe)
        }
        pixel(ex, ey, G * .32, '#f6ddff', strength * .6 * breathe)
      }
    }

    // Gold feather glints ripple downwards like a slow breath.
    for (let i = 0; i < 17; i++) {
      const row = Math.floor(i / 4), col = i % 4
      const x = .34 + col * .105 + (row % 2) * .018
      const y = .6 + row * .076
      const shimmer = still ? .25 : Math.max(0, Math.sin(clock * 2.7 - row * .8 + col * .6)) ** 5
      pixel(px(x), py(y), G * .22, '#f1d49b', strength * (.11 + .57 * shimmer))
    }
    // Very sparse purple wisdom motes, not a halo that crowds the silhouette.
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39996 + clock * .2
      const spread = .29 + (i % 3) * .06
      const x = px(.5 + Math.cos(a) * spread)
      const y = py(.47 + Math.sin(a) * spread * .78)
      const twinkle = still ? .27 : .15 + .65 * Math.sin(clock * 1.8 + i * 3) ** 4
      pixel(x, y, G * .16, '#b79bff', strength * twinkle * .35)
    }
    ctx.globalAlpha = 1
  }

  /** Temple — climbing greenery, occasional olive pollen and sunlight on stone. */
  function drawTempleLiving(rect: DOMRect, hover: number, assembly: number) {
    const strength = clamp(hover * assembly)
    if (strength < .015) return
    const clock = motion.matches ? 0 : t, G = gap()
    const px = (x: number) => rect.left + rect.width * x
    const py = (y: number) => rect.top + rect.height * y
    // Vines awaken from the base before reaching the capitals.
    const growth = clamp((hover - .04) / .86)
    const columns = [[.1 + .16 + .0375, -1], [.1 + .64 + .0375, 1]] as const
    for (let side = 0; side < columns.length; side++) {
      const [cx, direction] = columns[side]
      for (let j = 0; j < 8; j++) {
        const fraction = j / 7
        if (fraction > growth + .02) continue
        const y = .77 - fraction * .34
        const bend = Math.sin(clock * 1.4 + j * .7 + side) * .007
        const x = cx + direction * (.053 + .019 * Math.sin((y - .4) * 16 + side)) + bend
        // Pairs of tiny olive leaves, luminous only while hovered.
        for (const turn of [-1, 1]) {
          const tipX = x + turn * (.013 + .005 * Math.cos(clock + j))
          const tipY = y - .012
          trace(px(x), py(y), px(tipX), py(tipY), G * .84,
            j % 3 ? '#86b67b' : '#b7c37c', strength * .58, G * .22)
        }
      }
    }
    // Traveling glints catch the gold capitals, one column at a time.
    for (let i = 0; i < 6; i++) {
      const x = .1375 + i * .16
      const phase = (clock * .45 + i / 6) % 1
      const glow = motion.matches ? .2 : Math.max(0, 1 - Math.abs(phase - .5) * 5)
      pixel(px(x), py(.36), G * .32, '#fff2c5', strength * glow * .8)
      pixel(px(x), py(.785), G * .22, '#e9c780', strength * glow * .35)
    }
    // A gentle moving light follows the sloped roof edge.
    for (let i = 0; i < 10; i++) {
      const position = (clock * .12 + i / 10) % 1
      const x = .04 + position * .92
      const y = position < .5 ? .3 - position * .52 : .04 + (position - .5) * .52
      const energy = motion.matches ? .15 : Math.max(0, Math.sin(i * 1.5 + clock * 2)) ** 7
      pixel(px(x), py(y), G * .17, '#fbe5b0', strength * (.08 + energy * .42))
    }
    ctx.globalAlpha = 1
  }

  /** Hermes — feather gusts, serpentine energy traveling along the staff. */
  function drawHermesLiving(rect: DOMRect, hover: number, assembly: number) {
    const strength = clamp(hover * assembly)
    if (strength < .015) return
    const still = motion.matches, clock = still ? 0 : t, G = gap()
    const px = (x: number) => rect.left + rect.width * x
    const py = (y: number) => rect.top + rect.height * y
    for (const side of [-1, 1]) {
      // Gust trails move away from the wing tips, drawn as disconnected dots.
      for (let trail = 0; trail < 3; trail++) {
        const phase = (still ? .45 : (clock * (.38 + trail * .09) + trail * .32) % 1)
        for (let i = 0; i < 12; i++) {
          const part = i / 11
          const x = .5 + side * (.28 + phase * .15 + part * .1)
          const y = .12 + trail * .055 + .018 * Math.sin(part * 7 - clock * 3 + trail)
          const fade = Math.sin(part * Math.PI) * (1 - phase * .6)
          pixel(px(x), py(y), G * .15,
            trail % 2 ? '#d4f5f2' : '#e0c389', strength * fade * .45)
        }
      }
    }
    // A pulse ascends the central staff, from the intertwined serpents to the tip.
    for (let lane = 0; lane < 3; lane++) {
      const progress = still ? (lane + 1) / 4 : (clock * .29 + lane / 3) % 1
      const y = .94 - progress * .77
      const width = .008 + .007 * Math.sin(progress * Math.PI)
      for (let n = -1; n <= 1; n++) {
        pixel(px(.5 + n * width), py(y + n * .006), G * .19,
          n === 0 ? '#f4e5b7' : '#97ddc5', strength * (.45 + .5 * Math.sin(progress * Math.PI)))
      }
    }
    ctx.globalAlpha = 1
  }

  /** Hephaestus — thermal distortion, heated anvil rim and impact ring. */
  function drawForgeHeat(rect: DOMRect, hover: number, assembly: number) {
    const strength = clamp(hover * assembly)
    if (strength < .015) return
    const still = motion.matches, clock = still ? 0 : t, G = gap()
    const px = (x: number) => rect.left + rect.width * x
    const py = (y: number) => rect.top + rect.height * y
    const originX = px(.3), originY = py(.46)
    const cycle = still ? .05 : clock * 1.85 % 1
    const shock = still ? .3 : Math.max(0, 1 - cycle * 3.8)

    // Impact grows as a dotted shockwave then disappears.
    if (shock > .015) {
      const radius = rect.width * (.035 + cycle * .18)
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * Math.PI * 2
        pixel(originX + Math.cos(a) * radius,
          originY + Math.sin(a) * radius * .52,
          G * .18, i % 3 === 0 ? '#ffe6aa' : '#ff6e2e', strength * shock * .85)
      }
    }

    // Heat travels along the top rim instead of glowing the entire anvil.
    for (let i = 0; i < 20; i++) {
      const fraction = i / 19
      const shimmer = still ? .25 : Math.sin(clock * 7.3 - fraction * 10) ** 2
      pixel(px(.18 + fraction * .68), py(.5) + Math.sin(fraction * 22 + clock * 5) * G * .15,
        G * .23, i % 4 === 0 ? '#ffe2a2' : '#ff7c32',
        strength * (.12 + .44 * shimmer))
    }
    // Upward wisps ripple like hot air and occasionally shed small embers.
    for (let i = 0; i < 20; i++) {
      const seed = (i * .6180339) % 1
      const progress = still ? seed * .4 : (clock * (.15 + i % 4 * .025) + seed) % 1
      const x = .25 + (i % 8) * .06 + Math.sin(progress * 14 + clock * 2 + i) * .027
      const y = .49 - progress * (.18 + (i % 3) * .04)
      const visibility = (1 - progress) ** 2 * strength * (i % 4 === 0 ? .65 : .2)
      pixel(px(x), py(y), G * (i % 5 === 0 ? .23 : .14),
        i % 3 ? '#ff9e4b' : '#ffd98b', visibility)
    }
    ctx.globalAlpha = 1
  }

  /** Trireme — sea spray, ocean glints and a breeze catching the sail. */
  function drawTriremeLiving(rect: DOMRect, hover: number, assembly: number, sailing = false) {
    const strength = clamp(hover * assembly)
    if (strength < .015) return
    const still = motion.matches, clock = still ? 0 : t, G = gap()
    const px = (x: number) => rect.left + rect.width * x
    const py = (y: number) => rect.top + rect.height * y
    // A diagonal satin gleam crosses the sail as it fills with wind.
    for (let i = 0; i < 14; i++) {
      const f = i / 13
      const sweep = still ? .35 : (clock * .24) % 1
      const x = .3 + f * .38 + (sweep - .5) * .18
      const y = .11 + f * .26
      if (x < .31 || x > .7) continue
      pixel(px(x), py(y), G * .22, '#fff8de', strength * (.16 + .4 * Math.sin(f * Math.PI)))
    }
    // A broken, foaming wake; no solid wave outline.
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 20; i++) {
        const fraction = i / 19
        const x = -.05 + fraction * 1.06
        const wave = Math.sin(fraction * 15 - clock * 2.7 + row * 2) * .018
        const y = .8 + row * .06 + wave
        const whiten = (still ? .5 : .45 + .55 * Math.sin(i * 1.7 + clock * 4) ** 2)
        pixel(px(x), py(y), G * .18,
          (row + i) % 4 === 0 ? '#c7f9ff' : '#46b9c7', strength * whiten * .32)
      }
    }
    // Salt spray comes off the prow, drifting in the direction of travel.
    for (let i = 0; i < 12; i++) {
      const seed = (i * .618) % 1
      const f = still ? .3 + seed * .3 : (clock * (.4 + (i % 3) * .06) + seed) % 1
      pixel(px(.93 + .15 * f + Math.sin(i) * .016),
        py(.54 - Math.sin(f * Math.PI) * .15 + f * .12),
        G * .15, i % 3 === 0 ? '#d8faff' : '#7acfd8', strength * (1 - f) * .6)
    }
    if (sailing) {
      // A few bright wavelets near the oars while moving through the sea section.
      for (let i = 0; i < 8; i++) {
        const x = .15 + i * .09
        pixel(px(x), py(.83 + .012 * Math.sin(clock * 4 + i)), G * .16,
          '#8de1e8', strength * .45)
      }
    }
    ctx.globalAlpha = 1
  }

  /**
   * Zeus: a restrained dot-based corona and irregular discharge paths.
   * Everything is procedural and bounded (no growing particle arrays).
   * The two passes put the soft aura BEHIND the broken crest and the crackling
   * arcs ABOVE it, without changing any of the other emblems.
   */
  function drawZeusElectricity(
    rect: DOMRect, hover: number, assembly: number, pass: 'aura' | 'arcs',
  ) {
    const power = clamp(hover * assembly)
    if (power < .015) return

    const still = motion.matches
    const clock = still ? 0 : t
    const G = gap()
    const cx = rect.left + rect.width * .5
    const cy = rect.top + rect.height * .5
    const radius = rect.width * .46
    const flicker = still ? 1 : .82 + .18 * Math.sin(clock * 17) ** 2

    if (pass === 'aura') {
      // Rotating cyan fragments tracing outside broken gold crest segments.
      // Square pixels keep the electrical field consistent with the dot art.
      const count = Math.min(180, Math.max(46, Math.ceil(2 * Math.PI * radius / (G * 1.4))))
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2
        // Incomplete arcs frame the lightning, avoiding a closed medallion.
        if (!((angle > .05 && angle < 1.05) ||
          (angle > 2.28 && angle < 2.91) ||
          (angle > 3.4 && angle < 4.65) ||
          (angle > 5.12 && angle < 5.76))) continue
        const wave = Math.max(0, Math.sin(angle * 7 - clock * 3.7)) ** 5
        const ripple = Math.sin(angle * 13 + clock * 5.2) * G * .24
        const x = cx + Math.cos(angle) * (radius + G * .72 + ripple)
        const y = cy + Math.sin(angle) * (radius + G * .72 + ripple)
        const opacity = power * flicker * (.055 + wave * .38)
        const size = G * (.22 + wave * .15)
        ctx.globalAlpha = opacity
        ctx.fillStyle = i % 4 === 0 ? '#d9fbff' : '#1dbdff'
        ctx.fillRect(x - size, y - size, size * 2, size * 2)
      }
      ctx.globalAlpha = 1
      return
    }

    // Charge travels through short jagged paths branching away from the bolt.
    // Geometry changes every ~90ms, like real lightning, rather than smoothly
    // wiggling like a decorative sine wave.
    const channels = [
      [.27, .55, .09, .63],
      [.74, .41, .92, .29],
      [.66, .13, .77, .11],
      [.37, .86, .21, .81],
      [.48, .49, .30, .30],
    ] as const

    const crackle = (
      x0: number, y0: number, x1: number, y1: number,
      seed: number, intensity: number,
    ) => {
      const dx = x1 - x0, dy = y1 - y0
      const distance = Math.hypot(dx, dy) || 1
      const nx = -dy / distance, ny = dx / distance
      const steps = Math.min(42, Math.max(4, Math.ceil(distance / (G * .8))))
      const tick = still ? 0 : Math.floor(clock * 11 + seed * 4.7)
      for (let k = 0; k <= steps; k++) {
        const fraction = k / steps
        const roughness = Math.sin((k * 12.989 + seed * 78.233 + tick * 18.173)) *
          Math.sin(Math.PI * fraction) * G * 1.1
        const x = x0 + dx * fraction + nx * roughness
        const y = y0 + dy * fraction + ny * roughness
        const tip = k % 5 === 0
        const size = tip ? G * .24 : G * .16
        ctx.globalAlpha = power * intensity * (tip ? .95 : .7)
        ctx.fillStyle = tip ? '#f2ffff' : '#46d9ff'
        ctx.fillRect(x - size, y - size, size * 2, size * 2)
        // Just a few highlights get a soft glow instead of shadowing every dot.
        if (tip && k % 10 === 0) {
          ctx.globalAlpha = power * intensity * .15
          ctx.fillStyle = '#35c8ff'
          const glowSize = G * .75
          ctx.fillRect(x - glowSize, y - glowSize, glowSize * 2, glowSize * 2)
        }
      }
    }

    channels.forEach(([ax, ay, bx, by], i) => {
      const surge = still ? (i < 2 ? .8 : .35)
        : Math.max(0, Math.sin(clock * (5.3 + i * .9) + i * 2.1)) ** 3
      if (surge < .035) return
      const x0 = rect.left + rect.width * ax
      const y0 = rect.top + rect.height * ay
      const x1 = rect.left + rect.width * bx
      const y1 = rect.top + rect.height * by
      crackle(x0, y0, x1, y1, i + 1, surge * flicker)

      // A smaller fork emerges from selected arcs (no continuous line art).
      if (i < 3 && surge > .3) {
        const fraction = .42
        const mx = lerp(x0, x1, fraction)
        const my = lerp(y0, y1, fraction)
        const spread = rect.width * .065
        crackle(mx, my, mx + Math.cos(i * 2.3) * spread,
          my + Math.sin(i * 2.3) * spread, 14 + i, surge * .58)
      }
    })

    // Traveling ion sparks around the ring, brighter than the static corona.
    for (let i = 0; i < 15; i++) {
      const phase = i * 2.3999632
      const angle = phase + (still ? 0 : clock * (.5 + (i % 3) * .22))
      const orbit = radius * (.85 + .23 * ((i * .6180339) % 1))
      const x = cx + Math.cos(angle) * orbit
      const y = cy + Math.sin(angle) * orbit
      const pulse = still ? .4 : .2 + .8 * Math.max(0, Math.sin(clock * 5.8 + i * 3.1)) ** 2
      const size = G * (i % 4 === 0 ? .32 : .18)
      ctx.fillStyle = i % 3 === 0 ? '#efffff' : '#59dfff'
      ctx.globalAlpha = power * pulse * .85
      ctx.fillRect(x - size, y - size, size * 2, size * 2)
    }
    ctx.globalAlpha = 1
  }

  /** Tiny deterministic, looping sparks originating near the hammer/anvil strike. */
  function drawForgeSparks(rect: DOMRect, hover: number, assembly: number) {
    const strength = hover * assembly
    if (strength < .015) return
    const originX = rect.left + rect.width * .3
    const originY = rect.top + rect.height * .46
    const still = motion.matches
    const impactPhase = still ? .25 : (t * 1.85) % 1
    const burst = still ? .35 : Math.max(0, 1 - impactPhase * 4)

    for (let i = 0; i < 27; i++) {
      // Each particle is recycled; no allocation or unbounded particle pool.
      const seed = (i * .61803398875) % 1
      const life = still ? seed * .58 : (t * (.64 + (i % 5) * .065) + seed) % 1
      const spread = Math.sin(i * 2.39996) * (rect.width * (.09 + (i % 7) * .019))
      const x = originX + spread * life
      const y = originY - rect.height * (.08 + (i % 6) * .024) * life - rect.height * .15 * life * life
      const visibility = (1 - life) ** 1.4 * strength * (.48 + .9 * burst)
      if (visibility < .02) continue
      const r = gap() * (i % 6 === 0 ? .4 : .22) * (1 - life * .42)
      ctx.globalAlpha = visibility
      ctx.fillStyle = ['#ff552e', '#ff892b', '#ffc15f', '#ffcc78'][i % 4]
      if (i % 5 === 0 && hover > .3) {
        ctx.shadowBlur = 9 * hover
        ctx.shadowColor = '#ff702f'
      }
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
      ctx.shadowBlur = 0
    }
    ctx.globalAlpha = 1
  }

  function drawSea(rect: DOMRect, p: number, hover: number) {
    const G = gap(), rows = 7
    const still = motion.matches
    const waveY = (x: number, row: number) =>
      rect.top + rect.height * (.32 + row * .095) +
      Math.sin(x * .011 + (still ? 0 : t * 1.1) + row * .9) * (4 + row * 1.6)

    const ink = document.documentElement.dataset.theme === 'light' ? '#0e1116' : '#f4f4f5'
    for (let row = 0; row < rows; row++) {
      const r = G * (.16 + row * .035)
      for (let x = 0; x < rect.width; x += G) {
        const y = waveY(x, row) + (1 - p) * 8 * (row + 1)
        ctx.fillStyle = ink
        ctx.globalAlpha = clamp((.14 + row * .09) * p)
        ctx.fillRect(rect.left + x - r, y - r, r * 2, r * 2)
        if (hover > .01) {
          ctx.globalAlpha = clamp(hover * p * (.2 + row * .055))
          ctx.fillStyle = row % 2 ? '#2595aa' : '#5bc1ca'
          ctx.fillRect(rect.left + x - r, y - r, r * 2, r * 2)
        }
      }
    }
    const bw = Math.min(rect.width * .42, 300), bh = bw * .62
    const progress = clamp((H - rect.top) / (rect.height + H * .35))
    const cx = rect.left + (rect.width + bw) * progress - bw * .6
    const localX = cx - rect.left
    const y0 = waveY(localX, 2)
    const slope = (waveY(localX + 12, 2) - waveY(localX - 12, 2)) / 24
    plot(
      dotsFor('trireme', '', bw, bh),
      cx - bw / 2, y0 - bh * .62,
      p, .95, hover,
      { rot: Math.atan(slope) * .8, cx: bw / 2, cy: bh * .8 },
      'trireme', bw, bh,
    )
    if (hover > .01) {
      const ship = new DOMRect(cx - bw / 2, y0 - bh * .62, bw, bh)
      drawTriremeLiving(ship, hover, p, true)
    }
    ctx.globalAlpha = 1
  }

  function frame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    document.querySelectorAll<HTMLElement>('[data-god]').forEach(el => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 10 || rect.height < 10 || rect.bottom < -200 || rect.top > H + 200) return

      const name = el.dataset.god ?? ''
      const mid = rect.top + rect.height / 2
      const linger = name === 'sea' || name === 'text'
      const target = linger
        ? clamp((H - rect.top) / (H * .45))
        : clamp(clamp(1 - Math.abs(mid - H * .5) / (H * .6)) ** .7 * 1.15)

      const pointerInside = mouse.x >= rect.left && mouse.x <= rect.right &&
        mouse.y >= rect.top && mouse.y <= rect.bottom
      const targetHover = (isShape(name) || name === 'sea') &&
        (pointerInside || el.matches(':focus-within')) ? 1 : 0

      let st = state.get(el)
      if (!st) {
        st = { p: motion.matches ? 1 : 0, hover: 0 }
        state.set(el, st)
      }
      st.p += (target - st.p) * (motion.matches ? 1 : .09)
      st.hover += (targetHover - st.hover) * (motion.matches ? 1 : .13)

      if (name === 'sea') {
        drawSea(rect, st.p, st.hover)
        return
      }
      const dots = dotsFor(name, el.dataset.text ?? '', rect.width, rect.height)
      const oy = rect.top + (linger ? 0 : (mid - H / 2) * -.12)
      // Use the same parallax offset as the underlying Zeus dot silhouette.
      const movedRect = new DOMRect(rect.left, oy, rect.width, rect.height)
      if (name === 'zeus') {
        drawZeusElectricity(movedRect, st.hover, motion.matches ? 1 : st.p, 'aura')
      }
      plot(dots, rect.left, oy, st.p, name === 'text' ? .7 : .62, st.hover, undefined, name, rect.width, rect.height)
      if (name === 'zeus') {
        drawZeusElectricity(movedRect, st.hover, motion.matches ? 1 : st.p, 'arcs')
      }

      // All procedural decorations are square dot clusters, sharing the
      // same parallax and hover intensity as the underlying sampled emblem.
      const visible = motion.matches ? 1 : st.p
      if (name === 'athena') drawAthenaLiving(movedRect, st.hover, visible)
      if (name === 'temple') drawTempleLiving(movedRect, st.hover, visible)
      if (name === 'hermes') drawHermesLiving(movedRect, st.hover, visible)
      if (name === 'hephaestus') {
        drawForgeHeat(movedRect, st.hover, visible)
        drawForgeSparks(movedRect, st.hover, visible)
      }
      if (name === 'trireme') drawTriremeLiving(movedRect, st.hover, visible)
    })
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
  }

  function loop(now: number) {
    if (!alive) return
    if (lastFrameTime) t += Math.min((now - lastFrameTime) / 1000, .05)
    lastFrameTime = now
    frame()
    raf = requestAnimationFrame(loop)
  }

  function start() {
    cancelAnimationFrame(raf)
    raf = 0
    lastFrameTime = 0
    if (!alive || document.hidden) return
    if (motion.matches) frame()
    else raf = requestAnimationFrame(loop)
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    cache.clear()
  }

  const onResize = () => { size(); start() }
  const onScroll = () => { if (motion.matches) frame() }
  const onPointer = (e: PointerEvent) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
    if (motion.matches) frame()
  }
  const onLeave = () => {
    mouse.x = mouse.y = -9999
    if (motion.matches) frame()
  }
  const onPointerEnd = (e: PointerEvent) => {
    if (e.pointerType === 'touch') onLeave()
  }
  const onFocus = () => { if (motion.matches) frame() }
  const onTheme = () => { if (motion.matches) frame() }

  size()
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('pointerdown', onPointer, { passive: true })
  window.addEventListener('pointerup', onPointerEnd)
  window.addEventListener('pointercancel', onPointerEnd)
  document.documentElement.addEventListener('pointerleave', onLeave)
  document.addEventListener('focusin', onFocus)
  document.addEventListener('focusout', onFocus)
  document.addEventListener('visibilitychange', start)
  motion.addEventListener('change', start)

  const observer = new MutationObserver(onTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  ;(document.fonts?.ready ?? Promise.resolve()).then(() => {
    if (alive) { cache.clear(); start() }
  })
  start()

  return () => {
    alive = false
    cancelAnimationFrame(raf)
    observer.disconnect()
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('pointerdown', onPointer)
    window.removeEventListener('pointerup', onPointerEnd)
    window.removeEventListener('pointercancel', onPointerEnd)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    document.removeEventListener('focusin', onFocus)
    document.removeEventListener('focusout', onFocus)
    document.removeEventListener('visibilitychange', start)
    motion.removeEventListener('change', start)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}
