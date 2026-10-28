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
  c.strokeStyle = g(.28); c.lineWidth = w * .03; c.beginPath(); c.arc(u(.5), v(.5), w * .46, 0, 7); c.stroke()
  c.strokeStyle = g(.16); c.lineWidth = w * .015; c.beginPath(); c.arc(u(.5), v(.5), w * .38, 0, 7); c.stroke()
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
