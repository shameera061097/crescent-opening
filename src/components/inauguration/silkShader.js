/**
 * WebGL2 shader that paints the inauguration shawl: two drapes of royal-red
 * silk with gold zari borders, gold buttas and a gold-thread fringe, hanging
 * from gold satin ribbon swags with curled ends, with a satin sash across the
 * middle and gold tie-back cords once drawn. Everything is lit per pixel (folds, satin sheen, metallic
 * gold), which is what makes it read as real cloth rather than flat colour.
 *
 * Coordinates: `py` runs from the top of the screen down. Each drape has a
 * cloth coordinate `u` that is 0 at its outer edge and 1 at its inner edge, so
 * when a drape is drawn aside (its inner edge moves outwards) the same cloth —
 * folds, borders, motifs — is squeezed into less space and bunches up.
 */

export const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;       // canvas size, device px
uniform float uScale;     // device px per CSS px
uniform float uTime;      // seconds
uniform float uOpen;      // 0 closed .. 1 drawn aside (eased, whole drape)
uniform float uDraw;      // 0..1 raw progress of the draw, before easing
uniform float uSettle;    // seconds since the drapes arrived (-1 before)
uniform float uSwing;     // hem swing rate, radians per second
uniform float uSwingDecay;
uniform float uVel;       // 0..1, how fast the cloth is moving right now
uniform float uSashY;     // sash centre, device px from the top
uniform float uSashW;     // sash thickness, device px
uniform float uSashA;     // sash fall angle, radians
uniform float uSashAlpha;
uniform float uTie;       // tie-back cords 0..1
uniform float uFolds;     // folds per drape (fewer on narrow screens)

const float PI = 3.14159265;
const float TIE_Y = 0.62;
const float BAND_U = 0.075;   // inner zari border, fraction of a drape
const float HEM_Y0 = 0.885;   // hem border, fraction of screen height
const float HEM_Y1 = 0.95;
const vec3  L = normalize(vec3(-0.42, 0.55, 0.75));
const vec3  HV = normalize(L + vec3(0.0, 0.0, 1.0));

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), w.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), w.x), w.y);
}

// Inner edge of the left drape, as a fraction of the screen width. Drawn, it
// sweeps out to the side, pinches in at the tie-back and flares at the hem.
float drawnEdge(float y){
  if (y <= TIE_Y) return 0.09 + 0.21 * cos(0.5 * PI * y / TIE_Y);
  return 0.09 + 0.09 * pow((y - TIE_Y) / (1.0 - TIE_Y), 1.4);
}
float easeInOut(float t){ return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

float edgeFrac(float y){
  // The hand pulls the cloth near the top; the hem trails behind it, so the
  // edge sweeps across on a diagonal rather than as one straight line.
  float p = easeInOut(clamp(uDraw * 1.3 - y * 0.3, 0.0, 1.0));
  float e = mix(0.5015, 0.5 * drawnEdge(y), p);
  // Once it arrives, the heavier hem keeps swinging gently, smaller each time,
  // until it comes to rest (the settling swishes in the sound follow it).
  if (uSettle >= 0.0) e += 0.024 * y * y * exp(-uSwingDecay * uSettle) * sin(uSwing * uSettle);
  return e + sin(y * 9.0 - uTime * 6.0) * 0.005 * uVel;   // the edge ripples while it moves
}

// Height of the cloth surface (device px) — the folds.
float heightAt(float px, float py, float side){
  float x = side < 0.5 ? px / uRes.x : (uRes.x - px) / uRes.x;
  float y = py / uRes.y;
  float u = x / edgeFrac(y);
  float s = u * uFolds + side * 0.37;
  float sway = sin(uTime * 0.7 + y * 2.0) * 0.025 * (1.0 - uOpen);
  float t = 2.0 * PI * (s + 0.17 * sin(s * 1.3 + 2.0 + side) + 0.05 * y * sin(s * 0.7) + sway);
  float h = sin(t);
  h = sign(h) * pow(abs(h), 0.75);                 // rounded crests
  h += 0.25 * sin(2.0 * t + 1.1 + y * 2.5);       // folds are never perfectly regular
  h *= 0.7 + 0.3 * sin(s * 0.45 + 0.6 + side * 2.0);
  h += 0.35 * uVel * sin(u * 26.0 - uTime * 10.0 + y * 7.0);   // ripple while moving
  h += 0.5 * sin(y * 3.1 + u * 2.0 + side);       // a soft billow
  h *= 0.75 + 0.35 * y;                           // fuller toward the hem
  float amp = (0.5 * uRes.x / uFolds) * 0.2 * mix(1.0, 1.25, uOpen);
  return h * amp;
}

// Fake surroundings for metal to reflect: brighter above, darker below.
float env(vec3 n){ return mix(0.22, 1.0, smoothstep(-0.4, 0.9, n.y * 0.7 + n.z * 0.5)); }

vec3 shadeGold(vec3 n, float ao, float glint){
  vec3 f0 = vec3(1.0, 0.69, 0.25);
  float ndl = max(dot(n, L), 0.0), ndh = max(dot(n, HV), 0.0);
  return f0 * (0.06 + 0.45 * ndl) * ao + f0 * env(n) * 0.38 * ao
       + f0 * pow(ndh, 30.0) * 1.3 + vec3(1.0, 0.9, 0.6) * glint * ndl;
}

vec3 shadeSilk(vec3 n, float ao, float weave){
  vec3 albedo = vec3(0.42, 0.005, 0.016) * (0.9 + 0.2 * weave);
  float ndl = max(dot(n, L), 0.0), ndh = max(dot(n, HV), 0.0);
  return albedo * (0.08 + 1.15 * ndl) * ao
       + vec3(1.0, 0.22, 0.2) * pow(ndh, 7.0) * 0.12 * ao      // broad satin sheen, red like the silk
       + vec3(1.0, 0.62, 0.55) * pow(ndh, 60.0) * 0.2;          // crisp highlight on crests
}

// Gold satin ribbon. lv runs -1..1 across the ribbon's width: the weave
// shows as a fine darker line just inside each edge, and the very edge turns
// away from the light, as real ribbon does.
vec3 satinGold(vec3 n, float lv, float streak){
  vec3 f0 = vec3(0.86, 0.55, 0.16) * (0.94 + 0.12 * streak);
  float ndl = max(dot(n, L), 0.0), ndh = max(dot(n, HV), 0.0);
  vec3 col = f0 * (0.06 + 0.62 * ndl) + f0 * env(n) * 0.16
           + vec3(1.0, 0.78, 0.4) * pow(ndh, 18.0) * 0.3 + vec3(1.0, 0.93, 0.75) * pow(ndh, 70.0) * 0.45;
  float e = abs(lv);
  col *= 1.0 - 0.35 * smoothstep(0.78, 0.82, e) * (1.0 - smoothstep(0.86, 0.9, e));
  col *= mix(1.0, 0.72, smoothstep(0.94, 1.0, e));
  return col;
}

// Diamond motif used in the zari borders: 1 = gold, 0 = red silk showing through.
float zari(vec2 c, float aa){
  float d = abs(c.x) + abs(c.y);
  float ring = smoothstep(0.035 + aa, 0.035 - aa, abs(d - 0.26));
  float dot_ = smoothstep(0.07 + aa, 0.07 - aa, d);
  return 1.0 - max(ring, dot_);
}

void over(inout vec4 acc, vec3 col, float a){
  acc.rgb = mix(acc.rgb, col, a);
  acc.a = a + acc.a * (1.0 - a);
}

void main(){
  float px = gl_FragCoord.x;
  float py = uRes.y - gl_FragCoord.y;
  float y = py / uRes.y;
  float s = uScale;
  vec4 acc = vec4(0.0);

  float side = px < 0.5 * uRes.x ? 0.0 : 1.0;
  float x = side < 0.5 ? px / uRes.x : (uRes.x - px) / uRes.x;
  float e = edgeFrac(y);

  // ---------------- The silk ----------------
  float clothA = clamp((e - x) * uRes.x, 0.0, 1.0);
  if (clothA > 0.0 && y < HEM_Y1) {
    float u = x / e;
    float h0 = heightAt(px, py, side);
    float dx = heightAt(px + 1.0, py, side) - heightAt(px - 1.0, py, side);
    float dy = heightAt(px, py + 1.0, side) - heightAt(px, py - 1.0, side);
    vec3 n = normalize(vec3(-0.5 * dx, 0.5 * dy, 1.0));
    float amp = (0.5 * uRes.x / uFolds) * 0.2;
    float ao = 0.5 + 0.5 * smoothstep(-1.2 * amp, 1.0 * amp, h0);

    float weave = vnoise(vec2(px * 0.8 / s, py * 0.04 / s));
    float glint = pow(vnoise(vec2(px, py) * 0.6 / s), 12.0) * 2.5;

    // Gold: inner border, hem border and the scattered buttas.
    float gold = 0.0;
    float bu = (u - (1.0 - BAND_U)) / BAND_U;
    if (bu > 0.0) {
      float cell = BAND_U * 0.5 * uRes.x;
      vec2 c = vec2(bu - 0.5, fract(py / cell) - 0.5);
      float aa = 1.2 / cell * (1.0 / max(e * 2.0, 0.15));
      gold = zari(c, aa);
      gold *= 1.0 - smoothstep(0.035 + aa, 0.035 - aa, abs(bu - 0.12));
      gold *= 1.0 - smoothstep(0.035 + aa, 0.035 - aa, abs(bu - 0.88));
    } else if (y > HEM_Y0) {
      float band = (HEM_Y1 - HEM_Y0) * uRes.y;
      float hx = u * 0.5 * uRes.x / band;
      vec2 c = vec2(fract(hx) - 0.5, (y - HEM_Y0) / (HEM_Y1 - HEM_Y0) - 0.5);
      float aa = 1.2 / band / max(e * 2.0, 0.15);
      gold = zari(c, aa);
    } else if (bu < -0.15 && y > 0.07 && y < HEM_Y0 - 0.02) {
      // Buttas: small five-petal zari flowers, each a little turned and
      // offset, the way hand-woven motifs never sit on a perfect grid.
      float nb = max(3.0, floor(uFolds * 0.55));
      float cw = 0.5 * uRes.x / nb;
      vec2 g = vec2(u * nb, py / (cw * 1.35));
      g.x += mod(floor(g.y), 2.0) * 0.5;
      vec2 id = floor(g);
      vec2 c = fract(g) - 0.5;
      c += (vec2(hash(id), hash(id + 7.3)) - 0.5) * 0.14;
      c.y *= 1.35;
      float r = length(c);
      float ang = atan(c.y, c.x) + hash(id + 3.1) * 6.2832;
      float petal = 0.06 + 0.032 * cos(5.0 * ang);
      float aa = 1.5 / cw / max(e * 2.0, 0.15);
      gold = smoothstep(petal + aa, petal - aa, r) * (1.0 - smoothstep(0.018 + aa, 0.018 - aa, r));
    }

    vec3 col = mix(shadeSilk(n, ao, weave), shadeGold(n, ao, glint), gold);

    // Shadow under the ribbon swags, and the light falling away toward the floor.
    col *= mix(0.5, 1.0, smoothstep(14.0 * s, 80.0 * s, py));
    col *= mix(1.0, 0.62, smoothstep(0.55, 1.0, y));

    // Soft shadow cast by the sash.
    if (uSashAlpha > 0.0) {
      vec2 pv = vec2(side < 0.5 ? px : uRes.x - px, py) - vec2(0.0, uSashY);
      float ca = cos(uSashA), sa = sin(uSashA);
      vec2 lc = vec2(ca * pv.x + sa * pv.y, -sa * pv.x + ca * pv.y);
      if (lc.x > 0.0 && lc.x < 0.5 * uRes.x) {
        float d = max(abs(lc.y - 9.0 * s) - 0.5 * uSashW, 0.0) / (10.0 * s);
        col *= 1.0 - 0.5 * uSashAlpha * exp(-d * d);
      }
    }
    over(acc, col, clothA);
  }

  // ---------------- Gold-thread fringe below the hem ----------------
  if (y >= HEM_Y1 && x < e + 1.0 / uRes.x) {
    float u = x / e;
    float fu = u * 0.5 * uRes.x / (3.0 * s);
    float tf = fract(fu);
    float endY = 0.988 + 0.009 * hash(vec2(floor(fu), side));
    float thread = smoothstep(0.5, 0.15, abs(tf - 0.5)) * step(y, endY);
    vec3 n = normalize(vec3((tf - 0.5) * 1.6, 0.0, 1.0));
    float glint = pow(vnoise(vec2(px, py) * 0.5 / s), 10.0) * 2.0;
    vec3 col = shadeGold(n, 0.85, glint) * mix(0.75, 0.55, (y - HEM_Y1) / 0.05);
    over(acc, col, thread * clamp((e - x) * uRes.x + 1.0, 0.0, 1.0));
  }

  // ---------------- Tie-back cords and tassels ----------------
  if (uTie > 0.0) {
    float mx = side < 0.5 ? px : uRes.x - px;
    float ty = TIE_Y * uRes.y;
    float xe = edgeFrac(TIE_Y) * uRes.x;
    float r = 7.0 * s;
    if (mx < xe + 10.0 * s && abs(py - ty) < r) {
      float v = (py - ty) / r;
      vec3 n = normalize(vec3(0.0, -v, sqrt(max(1.0 - v * v, 0.0))));
      float tw = fract((mx + (py - ty)) / (9.0 * s));
      vec3 col = shadeGold(n, 1.0, 0.0) * (0.7 + 0.4 * smoothstep(0.1, 0.5, abs(tw - 0.5)));
      over(acc, col, uTie * smoothstep(1.0, 0.85, abs(v)));
    }
    float tx = xe + 3.0 * s;
    float top = ty + 0.4 * r, len = 46.0 * s;
    float t = (py - top) / len;
    if (t > 0.0 && t < 1.0) {
      float w = 7.0 * s * (t < 0.25 ? 0.55 + 1.8 * t : 1.0 - 0.12 * (t - 0.25));
      float dxT = abs(mx - tx);
      if (dxT < w) {
        float c = dxT / w;
        vec3 n = normalize(vec3((mx - tx) / w * 0.8, t < 0.25 ? 0.6 : 0.0, 1.0));
        float threads = t < 0.25 ? 1.0 : 0.65 + 0.35 * smoothstep(0.2, 0.5, abs(fract(mx / (2.2 * s)) - 0.5));
        vec3 col = shadeGold(n, 1.0, 0.0) * threads;
        over(acc, col, uTie * smoothstep(1.0, 0.8, c));
      }
    }
  }

  // ---------------- The satin sash (two halves) ----------------
  // A flat satin ribbon: a gentle wave along its length, a slow twist that
  // moves the sheen, and gathered into narrower creased folds near the bow.
  if (uSashAlpha > 0.0) {
    float mx = side < 0.5 ? px : uRes.x - px;
    vec2 pv = vec2(mx, py - uSashY);
    float ca = cos(uSashA), sa = sin(uSashA);
    vec2 lc = vec2(ca * pv.x + sa * pv.y, -sa * pv.x + ca * pv.y);
    float gather = mix(0.62, 1.0, smoothstep(20.0 * s, 170.0 * s, lc.x));
    float wave = sin(lc.x * 0.011 / s + side * 1.7) * 3.0 * s * smoothstep(0.0, 120.0 * s, lc.x);
    float hs = 0.5 * uSashW * gather;
    float yy = lc.y - wave;
    if (lc.x > 0.0 && lc.x < 0.5 * uRes.x + hs && abs(yy) < hs + 1.0) {
      float lv = yy / hs;
      float twist = 0.25 * sin(lc.x * 0.006 / s + side * 2.3);
      float curve = sign(lv) * pow(abs(lv), 3.0) * 0.6;            // flat middle, edges turn
      float crease = (1.0 - gather) / 0.38 * 0.35 * sin(lv * 9.0);  // folds where it is gathered
      float streak = vnoise(vec2(lc.x * 0.02 / s, lv * 14.0));
      vec3 n = normalize(vec3(0.0, -curve + twist + crease + 0.08 * (streak - 0.5), 1.0));
      over(acc, satinGold(n, lv, streak), uSashAlpha * clamp(hs + 0.5 - abs(yy), 0.0, 1.0));
    }
  }

  // ---------------- Satin ribbon swags across the top ----------------
  {
    float nSw = max(3.0, floor(uRes.x / (300.0 * s)));
    float sw = uRes.x / nSw;
    float xl = mod(px, sw) / sw;
    float depth = 30.0 * s, top = 4.0 * s, hh = 8.0 * s;
    float yc = top + depth * sin(PI * xl);
    float slope = depth * PI / sw * cos(PI * xl);
    float d = (py - yc) / sqrt(1.0 + slope * slope);
    if (abs(d) < hh + 1.0) {
      float lv = d / hh;
      float streak = vnoise(vec2(px * 0.02 / s, lv * 14.0));
      vec3 n = normalize(vec3(-slope * 0.3, -sign(lv) * pow(abs(lv), 3.0) * 0.6 + 0.2 * cos(PI * xl), 1.0));
      over(acc, satinGold(n, lv, streak), clamp(hh + 0.5 - abs(d), 0.0, 1.0));
    }
    // A gathered knot where each pair of swags meets.
    float kx = floor(px / sw + 0.5) * sw;
    vec2 kd = vec2(px - kx, py - (top + 6.0 * s));
    float kr = 12.0 * s, r = length(kd);
    if (r < kr + 1.0) {
      vec3 n = normalize(vec3(kd.x / kr * 0.9, -kd.y / kr * 0.9, 1.0));
      float pleat = 0.85 + 0.15 * sin(atan(kd.y, kd.x) * 6.0);
      over(acc, satinGold(n, 0.0, 0.5) * pleat, clamp(kr + 0.5 - r, 0.0, 1.0));
    }
  }

  // ---------------- Curling ribbon ends at the two top corners ----------------
  // A ribbon curled into a spiral: it swings side to side as it falls, looks
  // narrow where it turns edge-on, and its inner face is in shadow.
  {
    float mx = side < 0.5 ? px : uRes.x - px;
    float dir = side < 0.5 ? 1.0 : -1.0;
    float y0 = 10.0 * s, len = 0.3 * uRes.y;
    float t = py - y0;
    if (t > 0.0 && t < len) {
      float k = t / len;
      float ph = t / (30.0 * s) * 2.0 * PI + side * 1.3;
      float R = 13.0 * s * (1.0 - 0.35 * k);
      float cx = 30.0 * s + R * sin(ph);
      float cw = 6.5 * s * (0.25 + 0.75 * abs(cos(ph))) * (1.0 - 0.6 * smoothstep(0.85, 1.0, k));
      float dd = mx - cx;
      if (abs(dd) < cw + 1.0) {
        float lv = dd / cw;
        float face = cos(ph) > 0.0 ? 1.0 : 0.6;
        vec3 n = normalize(vec3(dir * (lv * 0.5 + 0.6 * sin(ph)), 0.1, 1.0));
        over(acc, satinGold(n, lv, 0.5) * face, clamp(cw + 0.5 - abs(dd), 0.0, 1.0));
      }
    }
  }

  vec3 c = pow(max(acc.rgb, 0.0), vec3(1.0 / 2.2));
  outColor = vec4(c * acc.a, acc.a);
}
`
