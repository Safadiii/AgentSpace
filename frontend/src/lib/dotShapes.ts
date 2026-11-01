/** Greyscale shapes. Brightness becomes dot density after ordered dithering, so shading is drawn with greys. */
type Ctx = CanvasRenderingContext2D
export type ShapeName = 'temple' | 'zeus' | 'athena' | 'hermes' | 'hephaestus' | 'trireme'

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const g = (v: number) => { const n = Math.round(clamp(v) * 255); return `rgb(${n},${n},${n})` }

function temple(c: Ctx, w: number, h: number) {
  const u = (x: number) => x * w, v = (y: number) => y * h
  c.fillStyle = g(.55); c.beginPath(); c.moveTo(u(.04), v(.3)); c.lineTo(u(.5), v(.04)); c.lineTo(u(.96), v(.3)); c.closePath(); c.fill()
  c.fillStyle = g(.05); c.beginPath(); c.moveTo(u(.17), v(.275)); c.lineTo(u(.5), v(.1)); c.lineTo(u(.83), v(.275)); c.closePath(); c.fill()
  c.fillStyle = g(.9); c.fillRect(u(.05), v(.31), u(.9), v(.045))
  for (let i = 0; i < 6; i++) {
    const x = u(.1 + i * .16), cw = u(.075)
    const gr = c.createLinearGradient(x, 0, x + cw, 0); gr.addColorStop(0, g(.35)); gr.addColorStop(.45, g(1)); gr.addColorStop(1, g(.3))
    c.fillStyle = gr; c.fillRect(x, v(.37), cw, v(.4))
    c.fillStyle = g(.9); c.fillRect(x - u(.008), v(.36), cw + u(.016), v(.025)); c.fillRect(x - u(.008), v(.765), cw + u(.016), v(.025))
  }
  ;[.8, .86, .92].forEach((y, i) => { c.fillStyle = g(.85 - i * .18); const m = .02 + i * .03; c.fillRect(u(m), v(y), u(1 - 2 * m), v(.05)) })
}

function zeus(c: Ctx, w: number, h: number) {
  const u = (x: number) => x * w, v = (y: number) => y * h
  // Broken crest fragments support the bolt rather than enclosing it in a full medallion.
  for (const [a, b, lum] of [[.12, 1.05, .22], [2.25, 2.94, .19], [3.47, 4.58, .18], [5.12, 5.8, .24]] as const) {
    c.strokeStyle = g(lum); c.lineWidth = w * .019
    c.beginPath(); c.arc(u(.5), v(.5), w * .46, a, b); c.stroke()
  }
  const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, g(1)); gr.addColorStop(1, g(.55))
  c.fillStyle = gr; c.beginPath()
  ;[[.6, .08], [.24, .56], [.46, .56], [.34, .94], [.78, .4], [.54, .4], [.72, .08]].forEach(([x, y], i) => i ? c.lineTo(u(x), v(y)) : c.moveTo(u(x), v(y)))
  c.closePath(); c.fill()
}

function athena(c: Ctx, w: number, h: number) {
  const u = (x: number) => x * w, v = (y: number) => y * h
  const ell = (x: number, y: number, rx: number, ry: number, col: string | CanvasGradient) => { c.fillStyle = col; c.beginPath(); c.ellipse(u(x), v(y), u(rx), v(ry), 0, 0, 7); c.fill() }
  const body = c.createLinearGradient(0, v(.3), 0, v(.95)); body.addColorStop(0, g(.9)); body.addColorStop(1, g(.4))
  ell(.5, .62, .27, .33, body)
  c.fillStyle = g(.95)
  ;[[.27, .26, .2, .0, .42, .17], [.73, .26, .8, .0, .58, .17]].forEach(([a, b, c1, d, e, f]) => { c.beginPath(); c.moveTo(u(a), v(b)); c.lineTo(u(c1), v(d)); c.lineTo(u(e), v(f)); c.closePath(); c.fill() })
  ell(.5, .34, .2, .19, g(.95))
  ell(.4, .33, .085, .085, g(0)); ell(.6, .33, .085, .085, g(0))
  ell(.4, .33, .032, .032, g(1)); ell(.6, .33, .032, .032, g(1))
  c.fillStyle = g(.2); c.beginPath(); c.moveTo(u(.46), v(.4)); c.lineTo(u(.54), v(.4)); c.lineTo(u(.5), v(.5)); c.closePath(); c.fill()
  c.strokeStyle = g(.12); c.lineWidth = w * .016; c.lineCap = 'round'
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(u(.38 + k * .12), v(.62 + r * .08), w * .055, .2, Math.PI - .2); c.stroke() }
  c.strokeStyle = g(.6); c.lineWidth = w * .03; c.beginPath(); c.moveTo(u(.36), v(.95)); c.lineTo(u(.44), v(.95)); c.moveTo(u(.56), v(.95)); c.lineTo(u(.64), v(.95)); c.stroke()
}

function hermes(c: Ctx, w: number, h: number) {
  const u = (x: number) => x * w, v = (y: number) => y * h
  c.strokeStyle = g(.95); c.lineCap = 'round'
  c.lineWidth = w * .035; c.beginPath(); c.moveTo(u(.5), v(.14)); c.lineTo(u(.5), v(.96)); c.stroke()
  c.fillStyle = g(1); c.beginPath(); c.arc(u(.5), v(.12), w * .045, 0, 7); c.fill()
  ;[-1, 1].forEach(s => {
    const x = (k: number) => u(.5 + s * k)
    const gr = c.createLinearGradient(u(.5), 0, x(.45), 0); gr.addColorStop(0, g(.95)); gr.addColorStop(1, g(.45))
    c.fillStyle = gr; c.beginPath(); c.moveTo(x(.02), v(.2))
    c.bezierCurveTo(x(.2), v(.02), x(.38), v(.02), x(.46), v(.1)); c.bezierCurveTo(x(.4), v(.17), x(.4), v(.18), x(.38), v(.2))
    c.bezierCurveTo(x(.36), v(.27), x(.34), v(.27), x(.3), v(.28)); c.bezierCurveTo(x(.26), v(.35), x(.2), v(.34), x(.14), v(.34)); c.bezierCurveTo(x(.1), v(.3), x(.05), v(.28), x(.02), v(.27)); c.closePath(); c.fill()
  })
  c.lineWidth = w * .03
  ;[0, Math.PI].forEach((ph, i) => {
    c.strokeStyle = g(i ? .55 : .85); c.beginPath()
    for (let y = .3; y <= .92; y += .01) { const x = .5 + Math.sin((y - .3) * 17 + ph) * .13; if (y === .3) c.moveTo(u(x), v(y)); else c.lineTo(u(x), v(y)) }
    c.stroke()
  })
}

function hephaestus(c: Ctx, w: number, h: number) {
  const u = (x: number) => x * w, v = (y: number) => y * h
  const gr = c.createLinearGradient(0, v(.5), 0, v(.92)); gr.addColorStop(0, g(.95)); gr.addColorStop(1, g(.3))
  c.fillStyle = gr; c.beginPath()
  ;[[.2, .5], [.88, .5], [.8, .6], [.64, .63], [.64, .74], [.76, .8], [.76, .93], [.24, .93], [.24, .8], [.36, .74], [.36, .63], [.2, .6], [.04, .55]].forEach(([x, y], i) => i ? c.lineTo(u(x), v(y)) : c.moveTo(u(x), v(y)))
  c.closePath(); c.fill()
  c.save(); c.translate(u(.52), v(.3)); c.rotate(-.55)
  c.fillStyle = g(.9); c.fillRect(-w * .025, -h * .02, w * .05, h * .5)
  c.fillStyle = g(1); c.fillRect(-w * .15, -h * .12, w * .3, h * .13); c.restore()
  c.fillStyle = g(1)
  for (let i = 0; i < 22; i++) { const a = -.9 + (i * 137.5 % 100) / 100 * 1.8, r = w * (.12 + (i * 53 % 40) / 100); c.beginPath(); c.arc(u(.3) + Math.sin(a) * r * 1.6, v(.46) - Math.cos(a) * r, w * (.006 + (i % 3) * .004), 0, 7); c.fill() }
}

function trireme(c: Ctx, w: number, h: number) {
  const u = (x: number) => x * w, v = (y: number) => y * h
  c.fillStyle = g(.95); c.beginPath(); c.moveTo(u(.02), v(.56)); c.lineTo(u(.1), v(.6)); c.bezierCurveTo(u(.3), v(.86), u(.7), v(.86), u(.9), v(.6)); c.bezierCurveTo(u(.97), v(.5), u(.98), v(.4), u(.95), v(.28)); c.bezierCurveTo(u(.93), v(.44), u(.9), v(.5), u(.84), v(.52)); c.lineTo(u(.12), v(.52)); c.closePath(); c.fill()
  c.fillStyle = g(.35); c.fillRect(u(.12), v(.56), u(.7), v(.03))
  c.fillStyle = g(.9); c.fillRect(u(.495), v(.06), u(.012), v(.46))
  const sail = c.createLinearGradient(0, v(.08), 0, v(.38)); sail.addColorStop(0, g(.85)); sail.addColorStop(1, g(.5))
  c.fillStyle = sail; c.beginPath(); c.moveTo(u(.28), v(.1)); c.lineTo(u(.72), v(.1)); c.lineTo(u(.68), v(.38)); c.lineTo(u(.32), v(.38)); c.closePath(); c.fill()
  c.fillStyle = g(.1); c.fillRect(u(.28), v(.2), u(.44), v(.025))
  c.strokeStyle = g(.7); c.lineWidth = Math.max(1.5, w * .008)
  for (let i = 0; i < 8; i++) { const x = .2 + i * .075; c.beginPath(); c.moveTo(u(x), v(.62)); c.lineTo(u(x - .05), v(.82)); c.stroke() }
}

export const shapes: Record<ShapeName, (c: Ctx, w: number, h: number) => void> = { temple, zeus, athena, hermes, hephaestus, trireme }
export const isShape = (name: string): name is ShapeName => name in shapes

/**
 * A second, transparent canvas is sampled by the dot engine on the SAME grid
 * as the grayscale silhouette. No full-color image is ever shown: its pixels
 * become colored dots only while the corresponding emblem is hovered.
 *
 * Decorations that extend outside the silhouette (olive leaves, owl irises,
 * forge embers) are also allowed to add new dots, but only on hover.
 */
export function paintShapeAccents(name: ShapeName, c: Ctx, w: number, h: number, gap = 6) {
  const u = (x: number) => x * w
  const v = (y: number) => y * h
  const line = (fraction: number) => Math.max(gap * .95, w * fraction)
  const path = (points: [number, number][]) => {
    c.beginPath()
    points.forEach(([x, y], i) => i ? c.lineTo(u(x), v(y)) : c.moveTo(u(x), v(y)))
    c.closePath()
  }
  const oval = (x: number, y: number, rx: number, ry: number, color: string) => {
    c.fillStyle = color
    c.beginPath()
    c.ellipse(u(x), v(y), u(rx), v(ry), 0, 0, Math.PI * 2)
    c.fill()
  }

  switch (name) {
    case 'zeus': {
      // Uneven antique-gold fragments frame a dominant, cold plasma bolt.
      for (const [a, b, color] of [
        [.12, 1.05, '#d6ae66'], [2.25, 2.94, '#977549'],
        [3.47, 4.58, '#b58f57'], [5.12, 5.8, '#eed29a'],
      ] as const) {
        c.strokeStyle = color
        c.lineWidth = line(.019)
        c.beginPath()
        c.arc(u(.5), v(.5), w * .46, a, b)
        c.stroke()
      }

      const boltOutline: [number, number][] = [
        [.6, .08], [.24, .56], [.46, .56], [.34, .94],
        [.78, .4], [.54, .4], [.72, .08],
      ]
      const bolt = c.createLinearGradient(u(.27), v(.04), u(.7), v(.94))
      bolt.addColorStop(0, '#f1fdff')
      bolt.addColorStop(.22, '#80efff')
      bolt.addColorStop(.52, '#10baff')
      bolt.addColorStop(.76, '#2469e8')
      bolt.addColorStop(1, '#85dcff')
      c.fillStyle = bolt
      path(boltOutline)
      c.fill()

      // Draw a narrow near-white electrical vein, clipped *inside* the bolt.
      // It is still converted to dots by the sampling engine, never a solid line.
      c.save()
      path(boltOutline)
      c.clip()
      c.strokeStyle = '#e9ffff'
      c.lineWidth = Math.max(gap * 1.2, w * .025)
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.beginPath()
      c.moveTo(u(.65), v(.11))
      c.lineTo(u(.39), v(.53))
      c.lineTo(u(.6), v(.43))
      c.lineTo(u(.39), v(.87))
      c.stroke()
      c.restore()
      break
    }

    case 'temple': {
      // Gold pediment/entablature and carefully placed olive vines.
      c.strokeStyle = '#d8ae63'
      c.lineJoin = 'round'
      c.lineWidth = line(.016)
      c.beginPath()
      c.moveTo(u(.04), v(.3))
      c.lineTo(u(.5), v(.04))
      c.lineTo(u(.96), v(.3))
      c.stroke()
      c.fillStyle = '#d7ac63'
      c.fillRect(u(.05), v(.31), u(.9), Math.max(gap, v(.018)))
      c.fillStyle = '#ebce87'
      for (let i = 0; i < 6; i++) {
        const x = u(.1 + i * .16), cw = u(.075)
        c.fillRect(x - u(.008), v(.36), cw + u(.016), Math.max(gap, v(.017)))
        c.fillRect(x - u(.008), v(.765), cw + u(.016), Math.max(gap, v(.014)))
      }
      c.fillStyle = '#bc914d'
      c.fillRect(u(.02), v(.8), u(.96), Math.max(gap, v(.016)))

      // Two slim, asymmetrical branches, with leaves rendered as *extra* dots.
      for (const [column, side, phase] of [[1, -1, 0], [4, 1, 1]] as const) {
        const center = .1 + column * .16 + .075 / 2
        const xAt = (y: number) => center + side * (.053 + .019 * Math.sin((y - .4) * 16 + phase))
        c.strokeStyle = '#668c53'
        c.lineWidth = Math.max(gap * .75, w * .008)
        c.lineCap = 'round'
        c.beginPath()
        for (let j = 0; j <= 24; j++) {
          const y = .4 + j / 24 * .35
          if (j === 0) c.moveTo(u(xAt(y)), v(y))
          else c.lineTo(u(xAt(y)), v(y))
        }
        c.stroke()
        for (let i = 0; i < 7; i++) {
          const y = .42 + i * .047
          const sideOfLeaf = i % 2 ? -1 : 1
          c.save()
          c.translate(u(xAt(y) + sideOfLeaf * .015), v(y))
          c.rotate(sideOfLeaf * .62)
          c.fillStyle = i % 3 === 0 ? '#b6b977' : '#6e9659'
          c.beginPath()
          c.ellipse(0, 0, Math.max(gap * .9, u(.018)), Math.max(gap * .55, v(.012)), 0, 0, Math.PI * 2)
          c.fill()
          c.restore()
        }
      }
      break
    }

    case 'athena': {
      // Lavender light inside the empty dark sockets; gold feather details.
      for (const x of [.4, .6]) {
        const halo = c.createRadialGradient(u(x), v(.33), 0, u(x), v(.33), u(.079))
        halo.addColorStop(0, 'rgba(219,176,255,1)')
        halo.addColorStop(.48, 'rgba(158,86,255,.98)')
        halo.addColorStop(.78, 'rgba(104,54,205,.58)')
        halo.addColorStop(1, 'rgba(104,54,205,0)')
        c.fillStyle = halo
        c.beginPath()
        c.arc(u(x), v(.33), u(.079), 0, Math.PI * 2)
        c.fill()
        oval(x, .33, .026, .026, '#e5c5ff')
      }
      c.strokeStyle = '#b99a5a'
      c.lineWidth = line(.011)
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 3; k++) {
          c.beginPath()
          c.arc(u(.38 + k * .12), v(.62 + row * .08), w * .055, .2, Math.PI - .2)
          c.stroke()
        }
      }
      break
    }

    case 'hermes': {
      // Mercury-silver staff, gilded wings, serpents in muted emerald.
      c.strokeStyle = '#bdcfe0'
      c.lineWidth = line(.032)
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(u(.5), v(.14))
      c.lineTo(u(.5), v(.96))
      c.stroke()
      oval(.5, .12, .045, .045, '#e3c57b')
      for (const s of [-1, 1]) {
        const x = (k: number) => u(.5 + s * k)
        const gold = c.createLinearGradient(u(.5), 0, x(.45), 0)
        gold.addColorStop(0, '#f4e5b8')
        gold.addColorStop(1, '#b68a44')
        c.fillStyle = gold
        c.beginPath()
        c.moveTo(x(.02), v(.2))
        c.bezierCurveTo(x(.2), v(.02), x(.38), v(.02), x(.46), v(.1))
        c.bezierCurveTo(x(.4), v(.17), x(.4), v(.18), x(.38), v(.2))
        c.bezierCurveTo(x(.36), v(.27), x(.34), v(.27), x(.3), v(.28))
        c.bezierCurveTo(x(.26), v(.35), x(.2), v(.34), x(.14), v(.34))
        c.bezierCurveTo(x(.1), v(.3), x(.05), v(.28), x(.02), v(.27))
        c.closePath()
        c.fill()
      }
      c.lineWidth = line(.024)
      for (const [phase, color] of [[0, '#548f83'], [Math.PI, '#9cc9b4']] as const) {
        c.strokeStyle = color
        c.beginPath()
        for (let i = 0; i <= 62; i++) {
          const y = .3 + i * .01
          const x = .5 + Math.sin((y - .3) * 17 + phase) * .13
          i === 0 ? c.moveTo(u(x), v(y)) : c.lineTo(u(x), v(y))
        }
        c.stroke()
      }
      break
    }

    case 'hephaestus': {
      // Steel hammer and dark iron anvil with a heated, gold strike edge.
      const metal = c.createLinearGradient(0, v(.5), 0, v(.93))
      metal.addColorStop(0, '#82919c')
      metal.addColorStop(.22, '#55616d')
      metal.addColorStop(1, '#293540')
      c.fillStyle = metal
      path([[.2, .5], [.88, .5], [.8, .6], [.64, .63], [.64, .74], [.76, .8], [.76, .93], [.24, .93], [.24, .8], [.36, .74], [.36, .63], [.2, .6], [.04, .55]])
      c.fill()
      c.fillStyle = '#b87738'
      c.fillRect(u(.2), v(.5), u(.68), Math.max(gap, v(.014)))
      c.save()
      c.translate(u(.52), v(.3))
      c.rotate(-.55)
      c.fillStyle = '#946d4b'
      c.fillRect(-w * .025, -h * .02, w * .05, h * .5)
      c.fillStyle = '#b9c4ce'
      c.fillRect(-w * .15, -h * .12, w * .3, h * .13)
      c.fillStyle = '#ffe1a1'
      c.fillRect(-w * .15, -h * .12, w * .3, Math.max(gap, h * .014))
      c.restore()
      // Recolor existing sparks while the hover-only animated ones rise above.
      for (let i = 0; i < 22; i++) {
        const a = -.9 + (i * 137.5 % 100) / 100 * 1.8
        const r = w * (.12 + (i * 53 % 40) / 100)
        const x = u(.3) + Math.sin(a) * r * 1.6
        const y = v(.46) - Math.cos(a) * r
        c.fillStyle = ['#ff5b2e', '#ff9a40', '#ffd46c'][i % 3]
        c.beginPath()
        c.arc(x, y, Math.max(gap * .7, w * (.006 + (i % 3) * .004)), 0, Math.PI * 2)
        c.fill()
      }
      break
    }

    case 'trireme': {
      const wood = c.createLinearGradient(0, v(.5), 0, v(.8))
      wood.addColorStop(0, '#b18450')
      wood.addColorStop(1, '#64452d')
      c.fillStyle = wood
      c.beginPath()
      c.moveTo(u(.02), v(.56))
      c.lineTo(u(.1), v(.6))
      c.bezierCurveTo(u(.3), v(.86), u(.7), v(.86), u(.9), v(.6))
      c.bezierCurveTo(u(.97), v(.5), u(.98), v(.4), u(.95), v(.28))
      c.bezierCurveTo(u(.93), v(.44), u(.9), v(.5), u(.84), v(.52))
      c.lineTo(u(.12), v(.52))
      c.closePath()
      c.fill()
      c.fillStyle = '#efe1be'
      path([[.28, .1], [.72, .1], [.68, .38], [.32, .38]])
      c.fill()
      c.fillStyle = '#be9b62'
      c.fillRect(u(.495), v(.06), Math.max(gap, u(.012)), v(.46))
      c.strokeStyle = '#cda65d'
      c.lineWidth = Math.max(gap * .85, w * .008)
      for (let i = 0; i < 8; i++) {
        const x = .2 + i * .075
        c.beginPath()
        c.moveTo(u(x), v(.62))
        c.lineTo(u(x - .05), v(.82))
        c.stroke()
      }
      break
    }
  }
}
