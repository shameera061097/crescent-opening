import { useEffect, useMemo, useRef, useState } from 'react'
import architectureBuilding from '../assets/architecture-building.png'
import cresolineLogo from '../assets/cresoline-cdoe.png'
import crescentInstituteLogo from '../assets/replacement-brand.png'
import backgroundMusic from '../../Soft Background Music for Presentation, Speech and Events.mp3'
import { VERTEX_SHADER, FRAGMENT_SHADER } from './inauguration/silkShader.js'
import { startPoppers } from './inauguration/poppers.js'

/**
 * INAUGURATION SHAWL
 * ---------------------------------------------------------------------------
 * A ceremonial reveal over the home page: two drapes of royal-red silk with
 * gold zari borders and buttas, hanging from gold satin ribbon swags with
 * curled ends, with a gold satin sash across the middle tied in a bow.
 *
 * The cloth is painted by a WebGL shader (inauguration/silkShader.js) that
 * lights every pixel — fold shadows, satin sheen, metallic gold — so it reads
 * as real fabric. Clicking (or pressing Enter on) the bow:
 *   1. unties the bow; the two halves of the sash swing down and fall away;
 *   2. draws the drapes aside — the top leads and the hem trails behind, the
 *      folds bunch up and deepen, and once the cloth arrives its hem swings
 *      back and settles; each drape is caught by a gold cord and tassel;
 *   3. when the shawl is half open, fires a party popper from each bottom
 *      corner and a confetti shower across the full width
 *      (inauguration/poppers.js); it flutters down over the revealed site.
 * The supplied background music starts at a low volume when the ribbon opens
 * and continues independently of the curtain animation.
 * Without WebGL2 the overlay falls back to plain silk-red and simply fades.
 *
 * WHEN IT SHOWS
 *   - `INAUGURATION_ENABLED` switches the whole thing on or off.
 *   - Once opened, it stays open for the rest of that browser tab's session.
 *   - Add `?inaugurate` to the address to show it again; opening the ribbon
 *     removes that override so browser Back returns to the programme page.
 */
export const INAUGURATION_ENABLED = true

const SEEN_KEY = 'cdoe-inaugurated'
const DRAW_FROM = 0.45
const DRAW_FOR = 5
const SETTLE_FOR = 4.5
const SWING_RATE = 4.2
const SWING_DECAY = 0.5
const MUSIC_START_VOLUME = 1
const MUSIC_VOLUME = 0.08
const MUSIC_DUCK_AFTER_MS = 30 * 1000
const MUSIC_FADE_DURATION_MS = 6 * 1000
const MUSIC_DURATION_MS = 7 * 60 * 1000
/* The sequence, in seconds from the click. */
const SASH_FROM = 0.12
const TIE_FROM = DRAW_FROM + DRAW_FOR - 0.2 // the cords catch the drapes as they arrive
// The drapes stay up while their hems settle, then fade with the confetti.
const FADE_AT_MS = (DRAW_FROM + DRAW_FOR + SETTLE_FOR) * 1000 - 300
const END_AT_MS = FADE_AT_MS + 400

function shouldShow() {
  if (!INAUGURATION_ENABLED) return false
  try {
    if (new URLSearchParams(window.location.search).has('inaugurate')) return true
    return sessionStorage.getItem(SEEN_KEY) !== '1'
  } catch {
    return true
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/* ================= The silk (WebGL) ================= */

function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
  if (!gl) return null
  const compile = (type, src) => {
    const sh = gl.createShader(type)
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh))
    return sh
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX_SHADER))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
  gl.useProgram(prog)

  // One triangle that covers the whole screen.
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const names = ['uRes', 'uScale', 'uTime', 'uOpen', 'uDraw', 'uSettle', 'uSwing', 'uSwingDecay', 'uVel', 'uSashY', 'uSashW', 'uSashA', 'uSashAlpha', 'uTie', 'uFolds']
  const u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]))

  return {
    draw(p) {
      // Cap the pixel count so large or high-density screens stay smooth.
      const w = window.innerWidth
      const h = window.innerHeight
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.4e6 / (w * h)))
      const cw = Math.round(w * scale)
      const ch = Math.round(h * scale)
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
        gl.viewport(0, 0, cw, ch)
      }
      gl.uniform2f(u.uRes, cw, ch)
      gl.uniform1f(u.uScale, scale)
      gl.uniform1f(u.uTime, p.time)
      gl.uniform1f(u.uOpen, p.open)
      gl.uniform1f(u.uDraw, p.draw)
      gl.uniform1f(u.uSettle, p.settle)
      gl.uniform1f(u.uSwing, SWING_RATE)
      gl.uniform1f(u.uSwingDecay, SWING_DECAY)
      gl.uniform1f(u.uVel, p.vel)
      gl.uniform1f(u.uSashY, p.sashY * scale)
      gl.uniform1f(u.uSashW, p.sashW * scale)
      gl.uniform1f(u.uSashA, p.sashA)
      gl.uniform1f(u.uSashAlpha, p.sashAlpha)
      gl.uniform1f(u.uTie, p.tie)
      // About one fold per 85 CSS px of drape: fuller on a wide screen, never pinstripes on a phone.
      gl.uniform1f(u.uFolds, Math.max(4, Math.min(11, Math.round(w / 2 / 85))))
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    },
  }
}

/* ================= Bow ================= */

function Bow() {
  // Gold satin: each loop is lit from the upper left, with a darker inner fold,
  // soft creases where it is gathered into the knot and a sheen along the top.
  // The viewBox is centred on the knot, so the knot sits exactly on the sash.
  return (
    <svg className="ic-bow-svg" viewBox="0 -2 240 168" aria-hidden="true">
      <defs>
        <linearGradient id="ic-satin" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#fff4d2" />
          <stop offset="0.22" stopColor="#f2d283" />
          <stop offset="0.5" stopColor="#c99434" />
          <stop offset="0.78" stopColor="#8d6118" />
          <stop offset="1" stopColor="#b5862c" />
        </linearGradient>
        <linearGradient id="ic-satin-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5e3c08" />
          <stop offset="1" stopColor="#a87b25" />
        </linearGradient>
        <linearGradient id="ic-satin-tail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7d5512" />
          <stop offset="0.35" stopColor="#e7c26b" />
          <stop offset="0.55" stopColor="#fff0c4" />
          <stop offset="0.75" stopColor="#c08e30" />
          <stop offset="1" stopColor="#7d5512" />
        </linearGradient>
        <filter id="ic-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id="ic-bow-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="1" dy="7" stdDeviation="5" floodColor="#1a0004" floodOpacity="0.6" />
        </filter>
      </defs>
      <g filter="url(#ic-bow-shadow)">
        <g className="ic-bow-tails">
          <path d="M112 90 C104 112 92 134 76 158 L92 150 L100 166 C110 140 118 116 124 94 Z" fill="url(#ic-satin-tail)" />
          <path d="M112 90 C106 108 98 126 88 144" stroke="#6b4709" strokeOpacity="0.35" strokeWidth="1.4" fill="none" />
          <path d="M128 90 C136 112 148 134 164 158 L148 150 L140 166 C130 140 122 116 116 94 Z" fill="url(#ic-satin-tail)" />
          <path d="M128 90 C134 108 142 126 152 144" stroke="#6b4709" strokeOpacity="0.35" strokeWidth="1.4" fill="none" />
        </g>
        <g className="ic-bow-loop ic-bow-loop-l">
          <path d="M120 82 C98 44 38 20 22 50 C10 76 46 100 120 84 Z" fill="url(#ic-satin)" />
          <path d="M120 82 C102 62 60 46 42 58 C58 66 92 76 120 84 Z" fill="url(#ic-satin-inner)" opacity="0.85" />
          <path d="M30 46 C46 28 82 34 106 60" stroke="#fffbe8" strokeOpacity="0.7" strokeWidth="4" fill="none" filter="url(#ic-soft)" />
          <path d="M120 83 C100 86 84 88 68 88" stroke="#6b4709" strokeOpacity="0.3" strokeWidth="1.2" fill="none" />
          <path d="M118 78 C108 70 98 64 86 60" stroke="#6b4709" strokeOpacity="0.28" strokeWidth="1.2" fill="none" />
        </g>
        <g className="ic-bow-loop ic-bow-loop-r">
          <path d="M120 82 C142 44 202 20 218 50 C230 76 194 100 120 84 Z" fill="url(#ic-satin)" />
          <path d="M120 82 C138 62 180 46 198 58 C182 66 148 76 120 84 Z" fill="url(#ic-satin-inner)" opacity="0.85" />
          <path d="M134 60 C158 36 192 30 210 44" stroke="#fffbe8" strokeOpacity="0.55" strokeWidth="4" fill="none" filter="url(#ic-soft)" />
          <path d="M120 83 C140 86 156 88 172 88" stroke="#6b4709" strokeOpacity="0.3" strokeWidth="1.2" fill="none" />
          <path d="M122 78 C132 70 142 64 154 60" stroke="#6b4709" strokeOpacity="0.28" strokeWidth="1.2" fill="none" />
        </g>
        <g className="ic-bow-knot">
          <path d="M106 70 C112 64 128 64 134 70 C138 78 138 88 134 95 C128 101 112 101 106 95 C102 88 102 78 106 70 Z" fill="url(#ic-satin)" />
          <path d="M110 72 C114 80 114 88 110 95" stroke="#6b4709" strokeOpacity="0.4" strokeWidth="1.3" fill="none" />
          <path d="M130 72 C126 80 126 88 130 95" stroke="#6b4709" strokeOpacity="0.4" strokeWidth="1.3" fill="none" />
          <path d="M116 70 C119 78 119 86 117 93" stroke="#fffbe8" strokeOpacity="0.65" strokeWidth="3" fill="none" filter="url(#ic-soft)" />
        </g>
      </g>
    </svg>
  )
}

/* ================= Styles ================= */

const styles = `
  .ic-overlay{
    position:fixed; inset:0; z-index:200;
    overflow:hidden;
    font-family:'Cinzel', Georgia, 'Times New Roman', serif;
    /* Behind the cloth while it is closed; clears as the drapes part. */
    background:#160006;
    transition:background-color .5s ease .45s, opacity .8s ease;
  }
  .ic-overlay.is-open{ pointer-events:none; background-color:transparent; }
  .ic-canvas, .ic-stage{ transition:opacity .8s ease; }
  .is-fading .ic-canvas, .is-fading .ic-stage{ opacity:0; }
  /* The poppers sit above everything and outlast the drapes a little, so the
     confetti keeps falling over the revealed site. */
  .ic-pop{ position:absolute; inset:0; width:100%; height:100%; z-index:5; pointer-events:none; transition:opacity .7s ease; }
  .is-ending .ic-pop{ opacity:0; }
  .ic-overlay.no-gl{ background:radial-gradient(ellipse at 50% 40%, #a3142b, #5a0011 75%); }
  .ic-overlay.no-gl.is-open{ opacity:0; transition:opacity .9s ease .3s; }
  /* The site justifies paragraphs globally; everything here is centred. */
  .ic-overlay p, .ic-overlay h2{ text-align:center; hyphens:manual; -webkit-hyphens:manual; }

  .ic-canvas{ position:absolute; inset:0; width:100%; height:100%; display:block; }

  /* ---- The centred column: title, bow, hint ---- */
  .ic-stage{
    position:absolute; inset:0; z-index:2;
    box-sizing:border-box; padding:clamp(18px, 8vh, 64px) 12px clamp(14px, 6vh, 48px);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:clamp(10px, 4vh, 30px);
  }
  .ic-title{
    position:relative;
    width:min(92vw, 820px);
    padding:clamp(8px, 2.2vh, 20px) 12px;
    transition:opacity .5s ease .05s, transform .7s ease .05s;
  }
  /* A soft shadow behind the lettering so it reads cleanly over the folds. */
  .ic-title::before{
    content:''; position:absolute; inset:-12% -10%; z-index:-1;
    background:radial-gradient(ellipse at center, rgba(30,0,6,.55), rgba(30,0,6,0) 70%);
  }
  .is-open .ic-title{ opacity:0; transform:translateY(-24px); }
  .ic-heading{
    margin:0; font-weight:700; line-height:1.1;
    font-family:'Palatino Linotype','Book Antiqua',Georgia,serif;
    font-size:clamp(2.4rem, min(8vw, 11vh), 6.25rem);
    letter-spacing:.035em; text-transform:none;
    background:linear-gradient(180deg, #fff6d0 0%, #f2cf6b 45%, #b8862b 80%, #f6dd8a 100%);
    -webkit-background-clip:text; background-clip:text; color:transparent;
    filter:drop-shadow(0 3px 4px rgba(30,0,6,.7));
    transition:transform .35s ease,filter .35s ease;
    animation:ic-title-arrive .8s cubic-bezier(.2,.8,.2,1) both;
  }
  .ic-title:hover .ic-heading{ transform:scale(1.045); filter:drop-shadow(0 0 16px rgba(255,230,150,.75)); }
  @keyframes ic-title-arrive{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
  .ic-rule{
    width:min(60%, 340px); height:2px; margin:clamp(6px, 1.3vh, 12px) auto;
    background:linear-gradient(90deg, transparent, #e3bd5c, transparent);
  }
  .ic-sub{
    margin:0; color:#f8e7b5;
    font-size:clamp(.95rem, min(2.4vw, 2.7vh), 1.25rem);
    letter-spacing:.04em;
    line-height:1.5;
    text-shadow:0 2px 6px rgba(0,0,0,.65);
  }

  /* The shader draws the sash through the bow's centre, so the two always meet. */
  .ic-ribbon{ position:relative; width:100%; display:flex; justify-content:center; align-items:center; }

  .ic-bow{
    position:relative; z-index:1;
    width:clamp(112px, min(21vw, 30vh), 220px);
    background:none; border:none; padding:0; margin:0; cursor:pointer;
    -webkit-tap-highlight-color:transparent;
    animation:ic-breathe 2.8s ease-in-out infinite;
  }
  .ic-bow:focus{ outline:none; }
  .ic-bow:hover .ic-bow-svg{ transform:scale(1.04); }
  /* Keyboard focus: a soft gold glow on the bow itself, not a ring around it. */
  .ic-bow:focus-visible .ic-bow-svg{ filter:drop-shadow(0 0 10px #fff2c2) drop-shadow(0 0 4px #fff2c2); }
  .ic-bow-svg{ width:100%; height:auto; display:block; overflow:visible; transition:transform .3s ease; }
  @keyframes ic-breathe{
    0%,100%{ filter:drop-shadow(0 0 0 rgba(255,230,150,0)); }
    50%{ filter:drop-shadow(0 0 14px rgba(255,226,140,.55)); }
  }
  .ic-bow-loop, .ic-bow-tails, .ic-bow-knot{
    transform-box:fill-box;
    transition:transform .65s cubic-bezier(.5,0,.3,1), opacity .5s ease .15s;
  }
  .ic-bow-loop-l{ transform-origin:100% 60%; }
  .ic-bow-loop-r{ transform-origin:0% 60%; }
  .ic-bow-knot{ transform-origin:50% 50%; }
  .ic-bow-tails{ transform-origin:50% 0%; }
  .is-open .ic-bow{ animation:none; pointer-events:none; }
  .is-open .ic-bow-loop-l{ transform:translate(-40px, -10px) rotate(-55deg) scale(.6); opacity:0; }
  .is-open .ic-bow-loop-r{ transform:translate(40px, -10px) rotate(55deg) scale(.6); opacity:0; }
  .is-open .ic-bow-knot{ transform:scale(0); opacity:0; }
  .is-open .ic-bow-tails{ transform:translateY(60px) scaleY(.4); opacity:0; }

  .ic-hint{
    margin:0; color:#f8e7b5;
    font-size:clamp(.58rem, min(1.5vw, 1.9vh), .92rem);
    letter-spacing:.26em; padding-left:.26em;
    text-transform:uppercase;
    text-shadow:0 2px 6px rgba(0,0,0,.7);
    animation:ic-hint 2.6s ease-in-out infinite;
    transition:opacity .4s ease;
  }
  @keyframes ic-hint{ 0%,100%{ opacity:.6; } 50%{ opacity:1; } }
  .is-open .ic-hint{ animation:none; opacity:0; }

  @media (max-width:640px){
    .ic-stage{ gap:clamp(8px, 3vh, 20px); }
    .ic-title{ width:min(96vw, 820px); }
    .ic-heading{ font-size:clamp(2rem, min(9vw, 10vh), 4rem); }
    .ic-bow{ width:clamp(112px, min(30vw, 26vh), 180px); }
  }
  @media (max-height:560px){
    .ic-stage{ padding:10px 12px 8px; gap:clamp(4px, 1.6vh, 10px); }
    .ic-title{ padding:4px 10px; }
    .ic-rule{ margin:4px auto; }
    .ic-heading{font-size:clamp(1.8rem, 8vh, 3.2rem);}
    .ic-sub{font-size:clamp(.85rem, 2.5vh, 1.05rem);}
    .ic-bow{ width:clamp(104px, 22vh, 140px); }
    .ic-hint{ font-size:clamp(.52rem, 1.55vh, .68rem); }
  }
  @media (prefers-reduced-motion: reduce){
    .ic-bow, .ic-hint{ animation:none; }
  }

  .ic-landing{
    position:fixed; inset:0; z-index:0; overflow:hidden;
    display:grid; grid-template-rows:34px minmax(0,1.05fr) minmax(0,.95fr) 68px;
    height:100vh; height:100svh; min-height:0;
    color:#001f3f; background:#fff;
    font-family:'Manrope',system-ui,'Segoe UI',sans-serif;
  }
  .ic-admissions{
    min-height:0; padding:4px 20px; box-sizing:border-box;
    display:flex; align-items:center; justify-content:center; gap:12px;
    color:#fff; background:#001f3f; flex-shrink:0;
  }
  .ic-admissions span[aria-hidden]{
    display:block; width:clamp(24px, 4vw, 56px); height:1px; background:#d4a017;
  }
  .ic-admissions span:not([aria-hidden]){
    font:800 9px/1.4 'Manrope',system-ui,sans-serif;
    letter-spacing:.28em; text-transform:uppercase;
  }
  .ic-landing-header{
    position:relative; z-index:1; overflow:hidden; isolation:isolate;
    box-sizing:border-box; width:100%; min-height:0; padding:clamp(6px,1.5vh,16px) 24px;
    display:block; text-align:center;
    background:transparent;
  }
  .ic-landing-header::before,.ic-landing-header::after{
    content:''; position:absolute; z-index:-1; pointer-events:none;
  }
  .ic-landing-header::before{
    width:min(72vw,620px); aspect-ratio:1; left:-160px; top:-120px; border-radius:50%;
    background:radial-gradient(circle,rgba(212,160,23,.22),rgba(212,160,23,0) 68%);
  }
  .ic-landing-header::after{
    right:0; top:0; width:min(34%,460px); height:100%;
    background:
      linear-gradient(90deg,rgba(255,255,255,.92),rgba(255,255,255,.52) 48%,rgba(255,255,255,.26)),
      url("${architectureBuilding}") right center/cover no-repeat;
    opacity:.32;
  }
  .ic-branding{
    position:absolute; z-index:2; left:16px; top:10px;
    display:flex; align-items:center; justify-content:center;
    gap:clamp(6px,1vw,12px); min-width:0; padding:12px;
  }
  .ic-branding-cresoline{
    width:clamp(76px,min(9vw,12vh),112px); height:auto; flex:none;
    object-fit:contain; clip-path:circle(43% at 50% 50%);
  }
  .ic-branding-institute{
    width:clamp(180px,22vw,260px); height:auto; flex:none; object-fit:contain;
  }
  .ic-landing-copy{
    position:absolute; z-index:1; inset:0; box-sizing:border-box; width:100%; min-width:0;
    padding:clamp(12px,2vh,24px);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
  }
  .ic-landing-title{
    max-width:980px; margin:0 auto; color:#001f3f;
    font:800 clamp(36px,min(6.4vw,8vh),88px)/1.08 'Palatino Linotype','Book Antiqua',Georgia,serif;
    letter-spacing:.015em; text-wrap:balance;
    background:linear-gradient(115deg,#001f3f 15%,#0a58a8 52%,#8a6400 88%);
    -webkit-background-clip:text; background-clip:text; color:transparent;
    transition:transform .3s ease,filter .3s ease;
  }
  .ic-landing-title:hover{transform:scale(1.025);filter:drop-shadow(0 8px 12px rgba(10,88,168,.22));}
  .ic-landing-rule{
    margin:clamp(6px,1.5vh,20px) 0 clamp(4px,1vh,14px);
    display:flex; align-items:center; gap:10px; flex-shrink:0;
  }
  .ic-landing-rule span{
    display:block; width:48px; height:1px;
    background:linear-gradient(90deg,transparent,#d4a017);
  }
  .ic-landing-rule span:last-child{transform:rotate(180deg);}
  .ic-landing-subtitle{
    margin:0; color:#06427f; flex-shrink:0;
    font:600 clamp(19px,2.8vw,25px)/1.45 'Palatino Linotype','Book Antiqua',Georgia,serif;
    letter-spacing:.025em; text-shadow:0 1px 0 rgba(255,255,255,.55);
  }
  .ic-programmes{
    position:relative; isolation:isolate; min-height:0;
    box-sizing:border-box; width:100%; padding:clamp(8px,2vh,20px) 24px;
    background:#f4f6fa;
  }
  .ic-programmes-wave{
    position:absolute; z-index:0; top:-59px; left:0; width:100%; height:60px;
    display:block;
  }
  .ic-programmes-inner{
    position:relative; z-index:1;
    width:min(100%, 1000px); height:100%; margin:0 auto;
    display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
    align-items:center; gap:clamp(10px,2vw,24px);
  }
  .ic-programme{
    position:relative; box-sizing:border-box; min-width:0; width:100%;
    height:min(100%,250px); min-height:0; padding:clamp(12px,2.4vh,30px) clamp(10px,2vw,24px);
    overflow:hidden; isolation:isolate;
    display:flex; flex-direction:column; align-items:center; text-align:center;
    justify-content:center;
    background:
      radial-gradient(ellipse at 50% 110%,rgba(10,88,168,.16),transparent 48%),
      radial-gradient(circle at 8% 12%,rgba(212,160,23,.16),transparent 34%),
      radial-gradient(circle at 95% 0%,rgba(10,88,168,.08),transparent 28%),
      linear-gradient(145deg,#fff 24%,#f8fbff 72%,#fffdf5);
    border:1px solid rgba(0,58,120,.12); border-radius:26px;
    box-shadow:0 18px 46px rgba(0,31,63,.12),inset 0 1px 0 rgba(255,255,255,.98),inset 0 -12px 28px rgba(10,88,168,.025);
    transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s ease,border-color .35s ease;
  }
  .ic-programme::after{
    content:''; position:absolute; z-index:-1; right:-40px; bottom:-70px;
    width:190px; height:190px;
    border:1px solid rgba(212,160,23,.22); border-radius:50%;
    background:radial-gradient(circle,rgba(212,160,23,.11),rgba(10,88,168,.035) 55%,transparent 72%);
    box-shadow:0 0 0 16px rgba(212,160,23,.045),0 0 0 34px rgba(10,88,168,.03),0 0 0 54px rgba(212,160,23,.02);
    transition:transform .55s cubic-bezier(.2,.8,.2,1),opacity .35s ease; opacity:.85;
  }
  .ic-programme::before{
    content:''; position:absolute; z-index:1; top:0; left:0; right:0; height:6px;
    background:linear-gradient(90deg,#003a78 0%,#0a58a8 38%,#72a7d6 52%,#d4a017 100%);
    box-shadow:0 2px 12px rgba(10,88,168,.15);
  }
  .ic-programme-02::before{ background:linear-gradient(90deg,#d4a017 0%,#0a58a8 48%,#003a78 100%); }
  .ic-programme:hover,.ic-programme:focus-within{
    transform:translateY(-8px);
    border-color:rgba(212,160,23,.5);
    box-shadow:0 28px 62px rgba(0,31,63,.18),0 0 0 4px rgba(212,160,23,.07),inset 0 1px 0 #fff;
  }
  .ic-programme:hover::after,.ic-programme:focus-within::after{transform:scale(1.2);opacity:1;}
  .ic-programme a{
    width:min(100%,320px); min-height:clamp(54px,8vh,72px);
    box-sizing:border-box; padding:0 clamp(12px,2vw,24px); flex-shrink:0;
    display:inline-flex; align-items:center; justify-content:center; gap:10px;
    position:relative; overflow:hidden;
    color:#fff; background:linear-gradient(110deg,#084d96,#0b69c5 50%,#084d96); border:1px solid rgba(255,255,255,.22); border-radius:999px;
    box-shadow:0 4px 0 #d4a017,0 14px 28px rgba(10,88,168,.25),inset 0 1px 0 rgba(255,255,255,.18);
    font:800 clamp(15px,2vw,20px)/1.2 'Manrope',system-ui,sans-serif;
    letter-spacing:.035em; text-decoration:none;
    transition:transform .25s ease,filter .25s ease,box-shadow .25s ease,background-position .4s ease;
  }
  .ic-programme a::after{
    content:''; position:absolute; inset:0; pointer-events:none;
    background:linear-gradient(115deg,transparent 25%,rgba(255,255,255,.22) 50%,transparent 75%);
    transform:translateX(-120%); transition:transform .6s ease;
  }
  .ic-programme a:hover{ color:#fff; transform:translateY(-3px) scale(1.025); filter:brightness(1.1); box-shadow:0 5px 0 #d4a017,0 20px 36px rgba(10,88,168,.34),inset 0 1px 0 rgba(255,255,255,.25); }
  .ic-programme a:hover::after{transform:translateX(120%);}
  .ic-programme a:focus-visible{ outline:3px solid #d4a017; outline-offset:4px; }
  .ic-landing-footer{
    position:relative; box-sizing:border-box; padding:6px clamp(48px,8vw,100px);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
    color:#fff; background:linear-gradient(110deg,#001a35,#003a78 50%,#001f3f);
    border-top:3px solid #d4a017; text-align:center;
  }
  .ic-landing-footer::before,.ic-landing-footer::after{
    content:''; position:absolute; top:50%; width:clamp(24px,6vw,72px); height:1px;
    background:linear-gradient(90deg,transparent,#e7c56e);
  }
  .ic-landing-footer::before{left:clamp(12px,4vw,48px);}
  .ic-landing-footer::after{right:clamp(12px,4vw,48px);transform:rotate(180deg);}
  .ic-landing-footer p{
    margin:0; color:#fff8df;
    font:600 clamp(16px,2.4vw,22px)/1.35 'Palatino Linotype','Book Antiqua',Georgia,serif;
    letter-spacing:.02em; text-shadow:0 2px 12px rgba(0,0,0,.24);
  }
  .ic-landing-footer span{
    color:rgba(255,248,223,.78);
    font:500 clamp(10px,1.4vw,13px)/1.3 'Manrope',system-ui,sans-serif;
    letter-spacing:.12em; text-transform:uppercase;
  }
  .ic-music-error{position:absolute;z-index:20;right:12px;bottom:8px;left:12px;margin:0;color:#ffe0dd!important;text-align:center;font:500 12px/1.35 'Manrope',system-ui,sans-serif!important;}
  @media (max-width:640px){
    .ic-landing-header{display:grid;grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);gap:clamp(4px,1vh,10px);padding:clamp(5px,1vh,10px) 14px;}
    .ic-landing-header::after{width:48%;opacity:.22;}
    .ic-branding{position:relative;left:auto;top:auto;transform:none;grid-row:1;justify-self:start;gap:8px;padding:4px;}
    .ic-branding-cresoline{width:clamp(64px,18vw,82px);}
    .ic-branding-institute{width:clamp(150px,43vw,205px);}
    .ic-landing-copy{position:relative;inset:auto;grid-row:2;justify-self:stretch;padding:clamp(8px,2vh,16px) 0;}
    .ic-landing-title{font-size:clamp(30px,min(8vw,6.6vh),56px);}
    .ic-landing-subtitle{font-size:clamp(17px,4vw,22px);}
    .ic-landing-rule{margin:5px 0;}
    .ic-landing-rule span{width:30px;}
    .ic-programmes{padding:8px 12px;}
    .ic-programmes-inner{gap:8px;}
    .ic-programme{padding:10px 7px;border-radius:18px;}
    .ic-programme a{width:100%;min-height:60px;padding:0 8px;font-size:clamp(13px,3.7vw,17px);}
  }
  @media (max-height:560px){
    .ic-landing{grid-template-rows:28px minmax(0,1.05fr) minmax(0,.95fr) 58px;}
    .ic-programme{padding-block:6px;}
    .ic-programme a{min-height:48px;}
  }
  @media (prefers-reduced-motion:reduce){
    .ic-heading,.ic-branding img,.ic-landing-title,.ic-programme,.ic-programme::after,.ic-programme a,.ic-programme a::after{animation:none;transition:none;}
  }
`

/* ================= Component ================= */

export default function InaugurationCurtain() {
  const [visible] = useState(shouldShow)
  const [open, setOpen] = useState(false)
  const [fading, setFading] = useState(false)
  const [ending, setEnding] = useState(false)
  const [noGl, setNoGl] = useState(false)
  const [musicError, setMusicError] = useState('')
  const canvasRef = useRef(null)
  const popRef = useRef(null)
  const bowRef = useRef(null)
  const landingRef = useRef(null)
  const musicRef = useRef(null)
  const musicFadeRef = useRef(null)
  const musicStopRef = useRef(null)
  const openedAt = useRef(null)
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => () => {
    window.clearInterval(musicFadeRef.current)
    window.clearTimeout(musicStopRef.current)
    musicRef.current?.pause()
  }, [])

  // Paint the silk every frame while the overlay is up.
  useEffect(() => {
    if (!visible) return
    let renderer = null
    try {
      renderer = createRenderer(canvasRef.current)
    } catch (err) {
      console.warn('Inauguration shawl: WebGL unavailable, using the plain fallback.', err)
    }
    if (!renderer) {
      setNoGl(true)
      return
    }
    let raf = 0
    const frame = (ms) => {
      const time = ms / 1000
      const bow = bowRef.current?.getBoundingClientRect()
      const sashY = bow ? bow.top + bow.height / 2 : window.innerHeight / 2
      const sashW = Math.min(48, Math.max(30, window.innerWidth * 0.046))
      let open = 0
      let draw = 0
      let settle = -1
      let vel = 0
      let sashA = 0
      let sashAlpha = 1
      let tie = 0
      if (openedAt.current != null) {
        const t = time - openedAt.current
        const k = clamp01((t - SASH_FROM) / 0.95)
        // The sash swings down from each outer end and settles, then fades.
        sashA = 1.42 * (1 - Math.exp(-4 * k) * Math.cos(7 * k))
        // Gone quickly, so it doesn't cross the party poppers in the corners.
        sashAlpha = 1 - clamp01((t - 0.45) / 0.45)
        const d = clamp01((t - DRAW_FROM) / DRAW_FOR)
        draw = d
        open = easeInOut(d)
        vel = Math.sin(Math.PI * d)
        if (d >= 1) settle = t - (DRAW_FROM + DRAW_FOR)
        tie = clamp01((t - TIE_FROM) / 0.4)
      }
      renderer.draw({ time, open, draw, settle, vel, sashY, sashW, sashA, sashAlpha, tie })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
    }
  }, [visible])

  // Hold the page still behind the shawl, and put focus on the bow.
  useEffect(() => {
    if (!visible || open) return
    const html = document.documentElement
    const previous = html.style.overflow
    html.style.overflow = 'hidden'
    bowRef.current?.focus({ preventScroll: true })
    return () => {
      html.style.overflow = previous
    }
  }, [visible, open])

  useEffect(() => {
    if (!open || !visible) return
    const quick = reducedMotion || noGl
    const fade = setTimeout(() => setFading(true), quick ? 300 : FADE_AT_MS)
    const end = setTimeout(() => setEnding(true), quick ? 300 : END_AT_MS)
    // The poppers go off when the shawl is half open.
    const stopPoppers = reducedMotion ? null : startPoppers(popRef.current, { delay: DRAW_FROM + DRAW_FOR * 0.5 })
    return () => {
      clearTimeout(fade)
      clearTimeout(end)
      stopPoppers?.()
    }
  }, [open, visible, reducedMotion, noGl])

  const inaugurate = () => {
    if (open) return
    const music = new Audio(backgroundMusic)
    music.volume = MUSIC_START_VOLUME
    music.loop = true
    musicRef.current = music
    const fadeStartsAt = performance.now() + MUSIC_DUCK_AFTER_MS
    musicFadeRef.current = window.setInterval(() => {
      if (musicRef.current !== music) {
        window.clearInterval(musicFadeRef.current)
        musicFadeRef.current = null
        return
      }
      const progress = Math.min(1, Math.max(0, (performance.now() - fadeStartsAt) / MUSIC_FADE_DURATION_MS))
      music.volume = MUSIC_START_VOLUME * (MUSIC_VOLUME / MUSIC_START_VOLUME) ** progress
      if (progress === 1) {
        window.clearInterval(musicFadeRef.current)
        musicFadeRef.current = null
      }
    }, 50)
    musicStopRef.current = window.setTimeout(() => {
      music.pause()
      music.currentTime = 0
      musicRef.current = null
      window.clearInterval(musicFadeRef.current)
      musicFadeRef.current = null
      musicStopRef.current = null
    }, MUSIC_DURATION_MS)
    music.play().catch((error) => {
      window.clearInterval(musicFadeRef.current)
      musicFadeRef.current = null
      window.clearTimeout(musicStopRef.current)
      musicStopRef.current = null
      musicRef.current = null
      console.error('Background music could not be played.', error)
      setMusicError('Background music could not be started. Check your browser audio settings.')
    })
    openedAt.current = performance.now() / 1000
    const url = new URL(window.location.href)
    if (url.searchParams.has('inaugurate')) {
      url.searchParams.delete('inaugurate')
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      )
    }
    setOpen(true)
    landingRef.current.scrollTop = 0
    requestAnimationFrame(() => {
      landingRef.current.scrollTop = 0
      window.getSelection()?.removeAllRanges()
    })
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* private mode: it simply shows again next time */
    }
  }

  const onlineEducationUrl = 'https://ridha0409.github.io/Crescent-Website/'
  const distanceEducationUrl = 'https://cres-site.vercel.app/'

  return (
    <>
      <main className="ic-landing" ref={landingRef}>
        <style>{styles}</style>
        <div className="ic-admissions">
          <span aria-hidden="true" />
          <span>Admissions Open</span>
          <span aria-hidden="true" />
        </div>

        <header className="ic-landing-header">
          <div className="ic-branding">
            <img className="ic-branding-cresoline" src={cresolineLogo} alt="CRESOLINE CDOE" />
            <img className="ic-branding-institute" src={crescentInstituteLogo} alt="B.S. Abdur Rahman Crescent Institute of Science and Technology" />
          </div>
          <div className="ic-landing-copy">
            <h1 className="ic-landing-title">Grand Inauguration</h1>
            <div className="ic-landing-rule" aria-hidden="true">
              <span />
              <span />
            </div>
            <p className="ic-landing-subtitle">Centre for Online and Distance Education Websites</p>
          </div>
        </header>

        <section className="ic-programmes" aria-label="Choose a distance education programme">
          <svg className="ic-programmes-wave" aria-hidden="true" viewBox="0 0 1440 120" preserveAspectRatio="none">
            <path d="M0 80 C240 20 480 10 720 40 C960 70 1200 90 1440 50 L1440 120 L0 120 Z" fill="#f4f6fa" />
          </svg>
          <div className="ic-programmes-inner">
            <article className="ic-programme">
              <a href={onlineEducationUrl} target="_blank" rel="noopener noreferrer">
                <span>Online Education</span>
              </a>
            </article>
            <article className="ic-programme ic-programme-02">
              <a href={distanceEducationUrl} target="_blank" rel="noopener noreferrer">
                <span>Distance Education</span>
              </a>
            </article>
          </div>
        </section>

        <footer className="ic-landing-footer">
          {/* <p>B.S. Abdur Rahman Crescent Institute of Science &amp; Technology</p>
          <span></span> */}
        </footer>

        {musicError && <p className="ic-music-error" role="status">{musicError}</p>}
      </main>

      {visible && (
        <div
          className={`ic-overlay${open ? ' is-open' : ''}${fading ? ' is-fading' : ''}${ending ? ' is-ending' : ''}${noGl ? ' no-gl' : ''}`}
          role="dialog"
          aria-modal={!open}
          aria-label="Inauguration of Crescent Online"
        >
          <canvas ref={canvasRef} className="ic-canvas" aria-hidden="true" />

          <div className="ic-stage">
            <div className="ic-title">
              <h2 className="ic-heading">Grand Inauguration</h2>
              <div className="ic-rule" />
              <p className="ic-sub"></p>
            </div>

            <div className="ic-ribbon">
              <button
                ref={bowRef}
                type="button"
                className="ic-bow"
                onPointerDown={(event) => event.preventDefault()}
                onClick={inaugurate}
                aria-label="Untie the ribbon to open the website"
              >
                <Bow />
              </button>
            </div>

            <p className="ic-hint" aria-hidden="true">Untie the ribbon to inaugurate</p>
          </div>

          <canvas ref={popRef} className="ic-pop" aria-hidden="true" />
        </div>
      )}
    </>
  )
}
