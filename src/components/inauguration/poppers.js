/**
 * Party poppers for the inauguration: a gold-and-red popper cone in each bottom
 * corner fires a big burst of confetti and curly streamers across the screen,
 * then a second volley, while a shower of confetti bursts over the full width
 * so the whole screen fills. The pieces slow in the air, then flutter down —
 * each confetti square turns as it falls, so it flashes as it catches the
 * light, the way real paper confetti does.
 *
 * Drawn on a 2D canvas with simple physics (gravity, air drag, flutter).
 * `startPoppers(canvas, { delay })` runs it — firing `delay` seconds from now —
 * and returns a function that stops it.
 */

const COLOURS = ['#f6dd8a', '#e3bd5c', '#c9972f', '#fff2c2', '#b31b34', '#8e0f24', '#fffaf0']
const STREAMER_COLOURS = ['#e3bd5c', '#f6dd8a', '#b31b34', '#fffaf0']

/** When each popper fires, in seconds after the delay, and how much it throws. */
const VOLLEYS = [
  { at: 0, confetti: 170, streamers: 8, power: 1.12, spread: 0.45 },
  { at: 0.3, confetti: 110, streamers: 5, power: 1, spread: 0.4 },
]
/** The shower across the full width, fired with the first volley. */
const SHOWER = { at: 0.08, count: 230 }

const rand = (a, b) => a + Math.random() * (b - a)

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`
}

export function startPoppers(canvas, { delay = 0 } = {}) {
  const ctx = canvas?.getContext('2d')
  if (!ctx) return () => {}
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let W = 0
  let H = 0
  const resize = () => {
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  // Sizes and positions are worked out from the window as it is now, so the
  // poppers stay in the corners even if the window changes size mid-burst.
  const unit = () => Math.min(1.25, Math.max(0.6, H / 900)) // falling speed follows the screen
  const coneLen = () => Math.max(54, Math.min(90, W * 0.06))

  // Each popper sits in a bottom corner, tilted up and in like a popper held
  // in the hand — steeper on a narrow phone screen so the burst stays in view.
  // Speeds and gravity scale with the screen height, so the arc is the same
  // shape everywhere: up past the middle of the screen, then fluttering down.
  const place = (p) => {
    p.base = { x: p.side < 0 ? 18 : W - 18, y: H - 18 }
    const tilt = ((W / H < 0.8 ? 80 : 62) * Math.PI) / 180
    p.aim = p.side < 0 ? -tilt : -(Math.PI - tilt)
  }
  const poppers = [-1, 1].map((side) => ({ side, recoil: 0 }))

  const confetti = []
  const streamers = []

  const addConfetti = (x, y, vx, vy) => {
    confetti.push({
      x,
      y,
      vx,
      vy,
      w: rand(7, 11),
      h: rand(10, 16),
      rot: rand(0, Math.PI * 2),
      spin: rand(-9, 9),
      flip: rand(0, Math.PI * 2),
      flipSpeed: rand(8, 16),
      sway: rand(0.6, 1.4),
      phase: rand(0, Math.PI * 2),
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      round: Math.random() < 0.25,
    })
  }

  // The shower: pieces burst out across the whole width of the upper screen
  // and drift down, so the confetti fills the screen edge to edge.
  const shower = () => {
    for (let i = 0; i < SHOWER.count; i++) {
      addConfetti(rand(-0.02, 1.02) * W, rand(-0.08, 0.38) * H, rand(-220, 220), rand(-0.55, 0.05) * H)
    }
  }

  const fire = (popper, volley) => {
    place(popper)
    popper.recoil = 1
    const mouth = {
      x: popper.base.x + Math.cos(popper.aim) * coneLen(),
      y: popper.base.y + Math.sin(popper.aim) * coneLen(),
    }
    for (let i = 0; i < volley.confetti; i++) {
      const a = popper.aim + rand(-volley.spread, volley.spread)
      const v = rand(1.5, 2.5) * H * volley.power
      addConfetti(mouth.x, mouth.y, Math.cos(a) * v, Math.sin(a) * v)
    }
    for (let i = 0; i < volley.streamers; i++) {
      const a = popper.aim + rand(-volley.spread * 0.7, volley.spread * 0.7)
      const v = rand(1.6, 2.3) * H * volley.power
      streamers.push({
        x: mouth.x,
        y: mouth.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        trail: [],
        curl: rand(9, 14),
        phase: rand(0, Math.PI * 2),
        colour: STREAMER_COLOURS[Math.floor(Math.random() * STREAMER_COLOURS.length)],
      })
    }
  }

  const drawPopper = (p, alpha) => {
    place(p)
    const len = coneLen()
    const kick = p.recoil * 10
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(p.base.x - Math.cos(p.aim) * kick, p.base.y - Math.sin(p.aim) * kick)
    ctx.rotate(p.aim)
    // The cone: narrow at the base, open at the mouth, gold with red bands.
    const mouthW = len * 0.42
    ctx.beginPath()
    ctx.moveTo(0, -4)
    ctx.lineTo(len, -mouthW / 2)
    ctx.lineTo(len, mouthW / 2)
    ctx.lineTo(0, 4)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, -mouthW / 2, 0, mouthW / 2)
    g.addColorStop(0, '#fff2c2')
    g.addColorStop(0.35, '#e3bd5c')
    g.addColorStop(0.75, '#a87a22')
    g.addColorStop(1, '#6e4a0c')
    ctx.fillStyle = g
    ctx.shadowColor = 'rgba(0,0,0,.45)'
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.save()
    ctx.clip()
    ctx.fillStyle = 'rgba(155,17,30,.85)'
    for (let x = 6; x < len; x += 14) {
      ctx.beginPath()
      ctx.moveTo(x, -mouthW)
      ctx.lineTo(x + 6, -mouthW)
      ctx.lineTo(x + 12, mouthW)
      ctx.lineTo(x + 6, mouthW)
      ctx.fill()
    }
    ctx.restore()
    // The open mouth.
    ctx.beginPath()
    ctx.ellipse(len, 0, 4, mouthW / 2, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#3a0a0a'
    ctx.fill()
    ctx.strokeStyle = '#f6dd8a'
    ctx.lineWidth = 2
    ctx.stroke()
    // A brief flash at the mouth when it fires.
    if (p.recoil > 0.55) {
      const f = ctx.createRadialGradient(len + 10, 0, 0, len + 10, 0, 46)
      f.addColorStop(0, `rgba(255,246,208,${(p.recoil - 0.55) * 1.6})`)
      f.addColorStop(1, 'rgba(255,246,208,0)')
      ctx.fillStyle = f
      ctx.beginPath()
      ctx.arc(len + 10, 0, 46, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  let raf = 0
  let last = performance.now()
  const t0 = last
  let volleyIndex = 0
  let showered = false

  const frame = (now) => {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    const t = (now - t0) / 1000 - delay // seconds since the poppers fire

    while (volleyIndex < VOLLEYS.length && t >= VOLLEYS[volleyIndex].at) {
      poppers.forEach((p) => fire(p, VOLLEYS[volleyIndex]))
      volleyIndex += 1
    }
    if (!showered && t >= SHOWER.at) {
      shower()
      showered = true
    }

    ctx.clearRect(0, 0, W, H)

    // Popper cones rise into view just before they fire, then fade out.
    const coneAlpha = Math.min(1, Math.max(0, (t + 0.35) / 0.3)) * (1 - Math.min(1, Math.max(0, (t - 1.4) / 0.6)))
    poppers.forEach((p) => {
      p.recoil = Math.max(0, p.recoil - dt * 5)
      if (coneAlpha > 0) drawPopper(p, coneAlpha)
    })

    const u = unit()
    const g = 0.9 * H

    // Streamers: a ribbon that curls as it flies, drawn along its recent path.
    for (const s of streamers) {
      s.vx *= 1 - 1.3 * dt
      s.vy = s.vy * (1 - 1.3 * dt) + g * 0.6 * dt
      s.phase += dt * s.curl
      const sp = Math.hypot(s.vx, s.vy) || 1
      const curl = Math.sin(s.phase) * 9
      s.x += s.vx * dt + (-s.vy / sp) * curl * dt * 10
      s.y += s.vy * dt + (s.vx / sp) * curl * dt * 10
      s.trail.push({ x: s.x, y: s.y })
      if (s.trail.length > 26) s.trail.shift()
      if (s.trail.length > 2) {
        ctx.beginPath()
        ctx.moveTo(s.trail[0].x, s.trail[0].y)
        for (let i = 1; i < s.trail.length - 1; i++) {
          const a = s.trail[i]
          const b = s.trail[i + 1]
          ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2)
        }
        ctx.strokeStyle = s.colour
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.shadowColor = 'rgba(0,0,0,.25)'
        ctx.shadowBlur = 3
        ctx.stroke()
        ctx.shadowBlur = 0
      }
    }

    // Confetti: thrown up, slowed by the air, then fluttering down.
    for (const c of confetti) {
      c.vx *= 1 - 1.1 * dt
      c.vy = c.vy * (1 - 1.1 * dt) + g * dt
      // Paper reaches a gentle falling speed and drifts side to side.
      if (c.vy > 230 * u) c.vy = 230 * u + (c.vy - 230 * u) * (1 - 6 * dt)
      c.phase += dt * 3.2
      c.x += c.vx * dt + Math.sin(c.phase) * c.sway * 40 * dt
      c.y += c.vy * dt
      c.rot += c.spin * dt
      c.flip += c.flipSpeed * dt
      if (c.y > H + 30) continue
      const face = Math.cos(c.flip)
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(c.rot)
      ctx.scale(Math.max(0.08, Math.abs(face)), 1)
      // The face catches the light as it turns: brighter face-on, darker edge-on.
      ctx.fillStyle = shade(c.colour, 0.55 + 0.6 * Math.abs(face))
      if (c.round) {
        ctx.beginPath()
        ctx.arc(0, 0, c.w * 0.5, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h)
      }
      ctx.restore()
    }

    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    ctx.clearRect(0, 0, W, H)
  }
}
