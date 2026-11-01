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
  glow?: 'violet' | 'electric' | 'ember' | 'gold'
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

const ATHENA_BOX_RATIO = 274 / 342
function athenaBox(width: number, height: number) {
  const maxW = width * .72
  const boxHeight = Math.min(height * .92, maxW / ATHENA_BOX_RATIO)
  const boxWidth = boxHeight * ATHENA_BOX_RATIO
  return { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2, width: boxWidth, height: boxHeight }
}

const HERMES_BOX_RATIO = 484 / 490
function hermesBox(width: number, height: number) {
  const maxW = width * .83
  const boxHeight = Math.min(height * .88, maxW / HERMES_BOX_RATIO)
  const boxWidth = boxHeight * HERMES_BOX_RATIO
  return { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2, width: boxWidth, height: boxHeight }
}

const ZEUS_BOX_RATIO = 750 / 580
function zeusBox(width: number, height: number) {
  const boxWidth = Math.min(width * .93, height * .86 * ZEUS_BOX_RATIO)
  const boxHeight = boxWidth / ZEUS_BOX_RATIO
  return { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2, width: boxWidth, height: boxHeight }
}

const HEPHAESTUS_BOX_RATIO = 900 / 965
function hephaestusBox(width: number, height: number) {
  const boxHeight=Math.min(height*.90,width*.90/HEPHAESTUS_BOX_RATIO)
  const boxWidth=boxHeight*HEPHAESTUS_BOX_RATIO
  return {x:(width-boxWidth)/2,y:(height-boxHeight)/2,width:boxWidth,height:boxHeight}
}

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
          if (name === 'athena') {
            const box = athenaBox(width, height)
            const ax = (gx - box.x) / box.width
            const ay = (gy - box.y) / box.height
            if (ax >= 0 && ax <= 1 && ay >= 0 && ay <= 1) {
              if (ax > .31 && ax < .63 && ay > .13 && ay < .23) dot.glow = 'gold'
              else if (ax > .08 && ax < .3 && ay > .02 && ay < .24) dot.glow = 'ember'
              else if (
                (ax > .28 && ax < .76 && ay > .46 && ay < .96) ||
                (ax > .26 && ax < .46 && ay > .61 && ay < .98)
              ) dot.glow = 'gold'
            }
          } else if (name === 'hermes') {
            const box = hermesBox(width, height)
            const hx = (gx - box.x) / box.width, hy = (gy - box.y) / box.height
            if (Math.hypot((hx - .165) * 1.1, hy - .795) < .053) dot.glow = 'gold'
          } else if (name === 'zeus') {
            if (r > 170 && g > 125 && b < 150) dot.glow = 'gold'
            else if (r > 210 && g > 170 && b >= 140) dot.glow = 'gold'
            else if (g > r * 1.13 && g > b * 1.08) dot.green = true
        } else if (name === 'hephaestus') {
            const hb=hephaestusBox(width,height)
            const hx=(gx-hb.x)/hb.width, hy=(gy-hb.y)/hb.height
            if ((hx>.33 && hx<.53 && hy<.19) ||
                (hx>.46 && hx<.70 && hy>.22 && hy<.31) ||
                (hx>.28 && hx<.55 && hy>.73 && hy<.84)) dot.glow='ember'
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
    const blink = 0

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
        } else if (name === 'hermes') {
          const box = hermesBox(width, height)
          const hx = (d.x - box.x) / box.width
          const hy = (d.y - box.y) / box.height
          if (d.green && hy < .46) {
            // The laurel is alive, but its outline never drifts far.
            lx += Math.sin(clock * 1.95 + hx * 14 + d.ph * .2) * 1.55 * hover
            ly += Math.sin(clock * 1.45 + hy * 12 + d.ph * .2) * .9 * hover
          } else if (hy > .56 && hy < .97 && hx > .15) {
            // Cloth moves gently while leaving the face rigid.
            lx += Math.sin(clock * 1.4 + hy * 12 + hx * 6) * 1.05 * hover
            ly += Math.cos(clock * 1.25 + hx * 9) * .65 * hover
          }
        } else if (name === 'zeus') {
          const box = zeusBox(width, height)
          const zx = (d.x - box.x) / box.width
          const zy = (d.y - box.y) / box.height
          if (d.green && zy < .39) {
            lx += Math.sin(clock * 1.6 + zx * 11 + d.ph * .1) * 1.1 * hover
            ly += Math.sin(clock * 1.4 + zx * 9) * .55 * hover
          } else if (d.glow === 'gold' && zy < .26) {
            lx += Math.sin(clock * 12 + d.ph) * .75 * hover
            ly += Math.cos(clock * 11 + d.ph) * .55 * hover
          }
        } else if (name === 'hephaestus') {
          const hb=hephaestusBox(width,height)
          const hx=(d.x-hb.x)/hb.width, hy=(d.y-hb.y)/hb.height
          if (hy>.39 && hy<.73 && hx>.26 && hx<.63) {
            lx+=Math.sin(clock*1.6+hy*13+d.ph*.15)*.9*hover
          } else if (d.glow==='ember' && hy<.19) {
            lx+=Math.sin(clock*5.1+d.ph)*.8*hover
            ly+=Math.cos(clock*5.6+d.ph)*.6*hover
          }
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
        if (!still && d.glow === 'gold') vitality = .86 + .14 * Math.sin(t * 4.2 + d.ph) ** 2
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
            : d.glow === 'electric' ? '#32cfff'
            : d.glow === 'gold' ? '#ffe08a' : '#ff6e28'
          ctx.shadowBlur = (d.glow === 'violet' ? 14 : d.glow === 'electric' ? 10 : d.glow === 'gold' ? 9 : 7) * hover
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

  /** Athena — robes reveal sacred light, crown glints, and the torch carries living fire. */
  function drawAthenaLiving(rect: DOMRect, hover: number, assembly: number) {
    const strength = clamp(hover * assembly)
    if (strength < .015) return
    const still = motion.matches, clock = still ? 0 : t, G = gap()
    const box = athenaBox(rect.width, rect.height)
    const left = rect.left + box.x, top = rect.top + box.y
    const px = (x: number) => left + box.width * x
    const py = (y: number) => top + box.height * y

    // Crown glints and a sacred diadem shimmer.
    for (const [x, y, k] of [[.392, .171, 0], [.488, .145, 1], [.577, .17, 2]] as const) {
      const twinkle = still ? .32 : .12 + .88 * Math.sin(clock * (2.5 + k * .4) + k) ** 6
      pixel(px(x), py(y), G * (.18 + k * .02), '#fff2c0', strength * twinkle)
      pixel(px(x), py(y), G * .1, '#f2c96f', strength * (.3 + twinkle * .5))
    }
    for (let i = 0; i < 9; i++) {
      const f = i / 8
      const x = .345 + f * .267
      const y = .198 - Math.sin(f * Math.PI) * .05
      const sweep = still ? .18 : Math.max(0, Math.sin(clock * 2 + f * 5.6)) ** 5
      pixel(px(x), py(y), G * .13, '#f0d68a', strength * (.08 + .32 * sweep))
    }

    // White-and-gold robe shimmer along garment folds.
    const robePaths = [
      [[.37, .5], [.435, .585], [.495, .668], [.563, .764], [.632, .858]],
      [[.322, .646], [.34, .752], [.376, .865], [.416, .962]],
      [[.53, .608], [.591, .669], [.651, .724]],
      [[.344, .528], [.39, .612], [.445, .705], [.515, .806], [.59, .895]],
    ] as const
    robePaths.forEach((points, idx) => {
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i]
        const glow = still ? .22 : .08 + .92 * Math.sin(clock * 1.9 - idx * .5 + i * .7) ** 6
        pixel(px(x), py(y), G * (i % 2 ? .19 : .22), i % 3 ? '#fff8ea' : '#e4be72', strength * (.08 + .5 * glow))
      }
      for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i], [x1, y1] = points[i + 1]
        trace(px(x0), py(y0), px(x1), py(y1), G * .72, idx % 2 ? '#fff6e3' : '#dfb566', strength * .22, G * .13)
      }
    })

    // Warm pulse climbing the torch shaft.
    for (let lane = 0; lane < 3; lane++) {
      const prog = still ? (lane + 1) / 4 : (clock * .42 + lane / 3) % 1
      const y = .66 - prog * .39
      pixel(px(.237 + (lane - 1) * .006), py(y), G * .18,
        lane === 1 ? '#ffe9b0' : '#d7b066', strength * (.34 + .42 * Math.sin(prog * Math.PI)))
    }
    pixel(px(.237), py(.548), G * .27, '#fff0bf', strength * .46)

    // Living torch head with flicker and upward sparks.
    const flames = [[.135, .12], [.214, .07], [.276, .125]] as const
    flames.forEach(([x, y], i) => {
      const flicker = still ? .35 : .18 + .82 * Math.sin(clock * (4.8 + i * .9) + i) ** 4
      pixel(px(x), py(y), G * (.18 + i * .03), i === 1 ? '#fff8df' : '#ffbf68', strength * flicker)
      pixel(px(x), py(y - .028), G * .14, '#ff9f47', strength * flicker * .75)
    })
    for (let i = 0; i < 11; i++) {
      const rise = still ? i / 11 : (clock * .55 + i / 11) % 1
      const sway = Math.sin(i * 2.3 + clock * 3.6) * .014
      const x = .205 + sway + (i % 3 - 1) * .022 * (1 - rise)
      const y = .19 - rise * .17
      pixel(px(x), py(y), G * .12, i % 2 ? '#ffd38b' : '#fff1c7', strength * (1 - rise) * .55)
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

  /** Hermes — living olive-green laurel, amber robe highlights and a gilded clasp. */
  function drawHermesLiving(rect: DOMRect, hover: number, assembly: number) {
    const strength = clamp(hover * assembly)
    if (strength < .015) return
    const still = motion.matches, clock = still ? 0 : t, G = gap()
    const box = hermesBox(rect.width, rect.height)
    const px = (x: number) => rect.left + box.x + box.width * x
    const py = (y: number) => rect.top + box.y + box.height * y

    // Brief sunlight glints across individual leaves in the real traced crown.
    const leaves: [number, number][] = [
      [.234, .403], [.266, .355], [.213, .348], [.289, .3], [.231, .292],
      [.34, .25], [.432, .261], [.489, .219], [.264, .235], [.383, .198],
      [.683, .174], [.518, .173], [.442, .153], [.307, .179], [.584, .138],
      [.515, .11], [.36, .128], [.662, .109], [.42, .089], [.61, .073],
      [.484, .054], [.262, .132], [.549, .036],
    ]
    leaves.forEach(([x, y], i) => {
      const glint = still ? .18 : Math.max(0, Math.sin(clock * 1.85 + i * .55)) ** 9
      pixel(px(x), py(y), G * .17,
        i % 4 ? '#b4d29b' : '#e3dda0', strength * (.07 + .49 * glint))
    })

    // A few floating pollen-like flecks, never a solid green overlay.
    for (let i = 0; i < 9; i++) {
      const phase = still ? (i + 1) / 10 : (clock * (.13 + i * .007) + i * .29) % 1
      const driftX = .24 + (i % 5) * .1 + Math.sin(clock * 1.3 + i * 2) * .022
      const driftY = .35 - phase * .27
      pixel(px(driftX), py(driftY), G * .12,
        i % 3 ? '#d5e9a6' : '#f1dca3', strength * (1 - phase) * .34)
    }

    // Warm glints travel across real robe-fold lines in the lower silhouette.
    const folds: [number, number][][] = [
      [[.25, .742], [.32, .756], [.39, .755], [.49, .738], [.61, .692], [.75, .60]],
      [[.25, .828], [.37, .849], [.52, .85], [.66, .812], [.77, .756]],
      [[.27, .885], [.39, .919], [.52, .91], [.69, .871]],
    ]
    folds.forEach((fold, i) => {
      const progress = still ? .47 : (clock * (.18 + i * .025) + i * .32) % 1
      const segment = progress * (fold.length - 1)
      const k = Math.min(fold.length - 2, Math.floor(segment))
      const mix = segment - k
      const x = lerp(fold[k][0], fold[k + 1][0], mix)
      const y = lerp(fold[k][1], fold[k + 1][1], mix)
      for (let j = -2; j <= 2; j++) {
        const shine = 1 - Math.abs(j) / 3
        pixel(px(x + j * .008), py(y + j * .002), G * .16,
          j % 2 ? '#fff0c7' : '#ffd18d', strength * shine * .57)
      }
    })

    // Glowing gold clasp is just a ring of bright dots near the left shoulder.
    const pulse = still ? .55 : .55 + .45 * Math.sin(clock * 2.7) ** 2
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2
      pixel(px(.164 + Math.cos(a) * .047), py(.794 + Math.sin(a) * .045),
        G * .15, i % 4 === 0 ? '#fff1bc' : '#e9b96a', strength * .48 * pulse)
    }
    ctx.globalAlpha = 1
  }

  /** Hephaestus — thermal distortion, heated anvil rim and impact ring. */
  function drawForgeHeat(rect: DOMRect, hover: number, assembly: number) {
    const strength=clamp(hover*assembly)
    if(strength<.015)return
    const still=motion.matches,clock=still?0:t,G=gap()
    const hb=hephaestusBox(rect.width,rect.height)
    const px=(x:number)=>rect.left+hb.x+hb.width*x
    const py=(y:number)=>rect.top+hb.y+hb.height*y
    const ox=px(.418),oy=py(.796)
    const cycle=still?.08:(clock*1.7)%1
    const blast=still?.42:Math.max(0,1-cycle*4.2)
    if(blast>.01){
      const rx=hb.width*(.02+cycle*.135),ry=hb.height*(.018+cycle*.065)
      for(let i=0;i<32;i++){
        const a=i/32*Math.PI*2
        pixel(ox+Math.cos(a)*rx,oy+Math.sin(a)*ry,G*.17,
          i%3?'#ff9c3b':'#ffe9a5',strength*blast*.85)
      }
    }
    // Hot anvil rim and molten metal. Consistent with the reference geometry.
    for(let i=0;i<23;i++){
      const f=i/22
      const glow=still?.45:Math.sin(clock*6.5-f*13)**2
      pixel(px(.215+f*.52),py(.82)+Math.sin(f*22+clock*6)*G*.15,G*.22,
        i%4===0?'#fff0bf':'#fb7a32',strength*(.16+.50*glow))
    }
    // Heat rising from the strike and surrounding fiery arcs.
    for(let i=0;i<27;i++){
      const seed=(i*.61803398875)%1
      const progress=still?seed*.5:(clock*(.14+(i%5)*.022)+seed)%1
      const x=.418+(i%9-4)*.032+Math.sin(progress*12+i)*.016
      const y=.79-progress*(.14+(i%4)*.025)
      pixel(px(x),py(y),G*(i%6===0?.26:.13),i%3?'#ff9a3e':'#ffeab6',
        strength*(1-progress)**2*(i%4===0?.76:.33))
    }
    // Goggles: alternating orange lens twinkles (not solid rectangles).
    for(const [x,y,k] of [[.591,.257,1],[.676,.281,2]] as const){
      const glint=still?.35:Math.max(0,Math.sin(clock*(2.7+k*.6)+k))**6
      pixel(px(x),py(y),G*.26,'#ffeec5',strength*(.18+.7*glint))
    }
    // Hammer: pulsing molten ridge, kept separate from the face.
    for(let i=0;i<13;i++){
      const f=i/12
      const x=.364+f*.12
      const y=.018+f*.11
      const twinkle=still?.4:Math.max(0,Math.sin(clock*7-f*7))**4
      pixel(px(x),py(y),G*.18,i%3===0?'#fff4d0':'#ff9e3d',strength*(.14+.6*twinkle))
    }
    ctx.globalAlpha=1
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
  /** Zeus: bright gold weapon with branching cyan / gold charge. */
  function drawZeusElectricity(
    rect: DOMRect, hover: number, assembly: number, pass: 'aura' | 'arcs',
  ) {
    const power = clamp(hover * assembly)
    if (power < .015) return
    const still = motion.matches
    const clock = still ? 0 : t
    const G = gap()
    const box = zeusBox(rect.width, rect.height)
    const px = (x: number) => rect.left + box.x + box.width * x
    const py = (y: number) => rect.top + box.y + box.height * y
    const pulse = still ? .65 : .55 + .45 * Math.sin(clock * 10.8) ** 2

    const arc = (path: readonly (readonly [number, number])[], color: string, alpha: number, seed: number) => {
      const tick = still ? 0 : Math.floor(clock * 12.5 + seed)
      for (let i = 0; i < path.length - 1; i++) {
        const [ax,ay] = path[i], [bx,by] = path[i+1]
        const x0=px(ax), y0=py(ay), x1=px(bx), y1=py(by)
        const len = Math.hypot(x1-x0,y1-y0) || 1
        const nx=-(y1-y0)/len, ny=(x1-x0)/len
        const count = Math.max(2, Math.ceil(len / Math.max(2,G*.83)))
        for (let k=0; k<=count; k++) {
          const f=k/count
          const drift = still ? 0 : Math.sin((k+1)*9.43+tick*7.31+seed) * Math.sin(f*Math.PI) * G*.8
          const x=x0+(x1-x0)*f+nx*drift, y=y0+(y1-y0)*f+ny*drift
          const bright=k%5===0
          pixel(x,y, G*(bright?.26:.19),bright?'#fffbda':color,power*alpha*(bright?1:.84))
          if (bright && !still) pixel(x,y,G*.58,color,power*alpha*.18)
        }
      }
    }
    if (pass === 'aura') {
      // Sparkles on the gold weapon. Never outline a circular crest.
      arc([[.013,.24],[.108,.215],[.081,.164],[.221,.159]], '#ffe079', .39*pulse, 1)
      arc([[.398,.109],[.464,.095],[.461,.033],[.542,.064],[.557,.004],[.695,.067]], '#ffda65', .43*pulse, 2)
      // The laurel glints independently of the weapon.
      for (let i=0;i<13;i++) {
        const f=i/12
        const x=.479+f*.194
        const y=.301-.07*Math.sin(Math.PI*f)
        const wave=still?.2:Math.max(0,Math.sin(clock*2.1+i*.64))**5
        pixel(px(x),py(y),G*.14,'#d5e9a2',power*(.07+.42*wave))
      }
      ctx.globalAlpha=1
      return
    }
    // Off-figure discharge forks; jagged square-dot paths, not solid lines.
    const discharges = [
      {p:[[.15,.17],[.055,.098],[-.025,.118]],c:'#44caff',s:1.8},
      {p:[[.58,.035],[.665,-.058],[.78,-.038]],c:'#99e6ff',s:2.5},
      {p:[[.065,.24],[-.036,.34],[.047,.4]],c:'#52b9ff',s:3.2},
      {p:[[.756,.33],[.845,.278],[.94,.33]],c:'#48ceff',s:4.1},
      {p:[[.768,.60],[.87,.54],[.972,.6]],c:'#dfb85b',s:5.6},
    ] as const
    for (const v of discharges) {
      const surge=still?.65:.48+.52*Math.max(0,Math.sin(clock*(4.3+v.s*.14)+v.s*1.8))**4
      if (surge>.035) arc(v.p,v.c,surge*.83,v.s)
    }
    for(let i=0;i<24;i++) {
      const r=(i*.61803398875)%1
      const rise=still?r:(r+clock*(.2+(i%3)*.05))%1
      const side=i%2?-1:1
      const x=side<0?-.028+Math.sin(i*3.4+clock)*.04:.90+Math.cos(i*2.7+clock)*.04
      const y=.16+rise*.64
      const color=i%4===0?'#ffeeb9':i%2===0?'#5fd6ff':'#d4a453'
      pixel(px(x),py(y),G*(i%7===0?.20:.105),color,power*(1-rise)*(.18+.38*pulse))
    }
    ctx.globalAlpha=1
  }

  /** Tiny deterministic, looping sparks originating near the hammer/anvil strike. */
  function drawForgeSparks(rect:DOMRect,hover:number,assembly:number){
    const strength=clamp(hover*assembly)
    if(strength<.015)return
    const hb=hephaestusBox(rect.width,rect.height)
    const ox=rect.left+hb.x+hb.width*.418
    const oy=rect.top+hb.y+hb.height*.795
    const still=motion.matches,clock=still?0:t,G=gap()
    const impact=still?.24:(clock*1.7)%1
    const burst=still?.4:Math.max(0,1-impact*4)
    for(let i=0;i<45;i++){
      const seed=(i*.61803398875)%1
      const life=still?seed*.58:(clock*(.53+(i%5)*.055)+seed)%1
      const dx=Math.sin(i*2.39996)*hb.width*(.075+(i%9)*.021)
      const dy=hb.height*(.09+(i%6)*.023)
      const x=ox+dx*life
      const y=oy-dy*life-hb.height*.16*life*life
      const visibility=(1-life)**1.5*strength*(.47+1.05*burst)
      if(visibility<.025)continue
      const radius=G*(i%7===0?.32:.17)*(1-life*.35)
      ctx.globalAlpha=clamp(visibility)
      ctx.fillStyle=['#ff572d','#ff8b2e','#ffbf51','#fff1a6'][i%4]
      if(i%8===0){ctx.shadowBlur=8*hover;ctx.shadowColor='#ff702f'}
      ctx.fillRect(x-radius,y-radius,radius*2,radius*2)
      ctx.shadowBlur=0
    }
    ctx.globalAlpha=1
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
  const onTheme = () => { cache.clear(); if (motion.matches) frame() }

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
