// Original soundtrack for the PMT film, synthesised from scratch (no samples).
// node score.js out.wav
const fs = require("fs");
const SR = 44100, DUR = 76.5, N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);       // dry master
const RL = new Float32Array(N), RR = new Float32Array(N);     // reverb send
const DL = new Float32Array(N), DR = new Float32Array(N);     // delay send (arp)
const MUS_L = new Float32Array(N), MUS_R = new Float32Array(N); // ducked bus (pad + bass)

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const n = (s) => { const m = s.match(/([A-G])(#?)(\d)/); return NOTE[m[1]] + (m[2] ? 1 : 0) + 12 * (Number(m[3]) + 1); };
const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

function add(bufL, bufR, t0, len, fn, p = 0, g = 1) {
  const s0 = Math.floor(t0 * SR), s1 = Math.min(N, s0 + Math.floor(len * SR));
  const [pl, pr] = pan(p);
  for (let i = Math.max(0, s0); i < s1; i++) {
    const v = fn((i - s0) / SR) * g;
    bufL[i] += v * pl; bufR[i] += v * pr;
  }
}
const send = (t0, len, fn, p, g, rev = 0, dly = 0, bus = "dry") => {
  const [bl, br] = bus === "mus" ? [MUS_L, MUS_R] : [L, R];
  add(bl, br, t0, len, fn, p, g);
  if (rev) add(RL, RR, t0, len, fn, p, g * rev);
  if (dly) add(DL, DR, t0, len, fn, p, g * dly);
};

// ── instruments ──────────────────────────────────────────────
const kick = (t0, g = 1) => send(t0, 0.5, (t) => {
  const f = 45 + 95 * Math.exp(-t * 28);
  const ph = 2 * Math.PI * (45 * t + (95 / 28) * (1 - Math.exp(-t * 28)));
  return Math.sin(ph) * Math.exp(-t * 7) + 0.25 * rnd() * Math.exp(-t * 300) * (f > 0 ? 1 : 0);
}, 0, 0.55 * g);
const clap = (t0, g = 1) => {
  let lp = 0;
  send(t0, 0.35, (t) => {
    const bursts = [0, 0.011, 0.022].reduce((a, d) => a + (t >= d ? Math.exp(-(t - d) * 160) : 0), 0) + Math.exp(-t * 18) * 0.6;
    const x = rnd(); const hp = x - lp; lp += 0.35 * (x - lp);
    return hp * bursts;
  }, 0.05, 0.16 * g, 0.5);
};
const hat = (t0, g = 1, open = false) => {
  let lp = 0;
  send(t0, open ? 0.25 : 0.06, (t) => { const x = rnd(); const hp = x - lp; lp += 0.6 * (x - lp); return hp * Math.exp(-t * (open ? 14 : 70)); }, 0.25, 0.07 * g);
};
const softSaw = (f, t, h = 7) => { let v = 0; for (let k = 1; k <= h; k++) v += Math.sin(2 * Math.PI * f * k * t) / k; return v * 0.55; };
const padChord = (t0, len, notes, g = 1, bright = 4) => notes.forEach((m, i) => {
  [-0.08, 0.08].forEach((det, j) => {
    const f = mtof(m + det);
    send(t0, len + 0.8, (t) => {
      const a = Math.min(1, t / 0.6) * (t > len ? Math.exp(-(t - len) * 5) : 1);
      return softSaw(f, t, bright) * a;
    }, (j ? 0.45 : -0.45) * (i % 2 ? 1 : -1) * 0.8, 0.035 * g, 0.6, 0, "mus");
  });
});
const bass = (t0, len, m, g = 1) => send(t0, len + 0.05, (t) => {
  const f = mtof(m), a = Math.min(1, t / 0.008) * Math.exp(-t * 2.5) * (t > len ? Math.exp(-(t - len) * 60) : 1);
  return (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + 0.12 * Math.sin(6 * Math.PI * f * t)) * a;
}, 0, 0.2 * g, 0, 0, "mus");
const pluck = (t0, m, g = 1, p = 0) => send(t0, 0.6, (t) => {
  const f = mtof(m);
  return (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 20)) * Math.exp(-t * 9) * Math.min(1, t / 0.003);
}, p, 0.06 * g, 0.25, 0.35);
const bell = (t0, m, g = 1, p = 0) => send(t0, 3.5, (t) => {
  const f = mtof(m);
  return (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.6) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 4) + 0.2 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 7)) * Math.min(1, t / 0.002);
}, p, 0.09 * g, 0.7);
const boom = (t0, g = 1) => send(t0, 2.5, (t) => {
  const ph = 2 * Math.PI * (38 * t + (60 / 9) * (1 - Math.exp(-t * 9)));
  return Math.sin(ph) * Math.exp(-t * 2.2);
}, 0, 0.6 * g, 0.4);
// UI sound design
const click = (t0, g = 1) => send(t0, 0.05, (t) => (Math.sin(2 * Math.PI * 2100 * t) * 0.6 + rnd() * 0.4) * Math.exp(-t * 180), 0.1, 0.12 * g, 0.15);
const tick = (t0, g = 1) => send(t0, 0.02, (t) => rnd() * Math.exp(-t * 400), (rnd() * 0.3), 0.05 * g);
const pop = (t0, g = 1, up = 1) => send(t0, 0.12, (t) => Math.sin(2 * Math.PI * (500 * up * t + 3000 * up * t * t)) * Math.exp(-t * 35), 0, 0.12 * g, 0.3);
const blip = (t0, m, g = 1) => send(t0, 0.25, (t) => Math.sin(2 * Math.PI * mtof(m) * t) * Math.exp(-t * 18) * Math.min(1, t / 0.002), 0.2, 0.08 * g, 0.4);
const whoosh = (t0, len = 0.6, g = 1, dir = 1) => {
  let lp = 0, lp2 = 0;
  send(t0 - len * 0.6, len, (t) => {
    const k = t / len, env = Math.sin(Math.PI * Math.min(1, k)) ** 2;
    const cut = 0.02 + 0.25 * (dir > 0 ? k : 1 - k);
    const x = rnd(); lp += cut * (x - lp); lp2 += cut * (lp - lp2);
    return (lp - lp2 * 0.5) * env * 3;
  }, dir * 0.4, 0.09 * g, 0.4);
};
const riser = (t0, len, g = 1) => {
  let lp = 0;
  send(t0, len, (t) => { const k = t / len; const x = rnd(); lp += (0.02 + 0.5 * k * k) * (x - lp); return lp * k * k * 2.5; }, 0, 0.12 * g, 0.5);
};

// ── arrangement (120 BPM, bar = 2 s, grid starts at 3.0 s) ──────────────
const BEAT = 0.5, BAR = 2, T0 = 3.0;
const PROG = [
  { pad: ["F3", "A3", "C4", "E4", "G4"], root: "F1" },
  { pad: ["G3", "B3", "D4", "E4"], root: "G1" },
  { pad: ["A3", "C4", "E4", "G4"], root: "A1" },
  { pad: ["C4", "E4", "G4", "D5"], root: "C2" },
];
const ARP = [0, 2, 1, 3, 2, 4, 3, 1];
// intro: swell on the first chord while the logo builds
padChord(0, 3.0, PROG[0].pad.map(n), 0.9, 2);
riser(1.4, 1.6, 0.6);
[0.5, 0.64, 0.78].forEach((t, i) => bell(t, n(["C5", "E5", "G5"][i]), 0.7, (i - 1) * 0.3));
[0.95, 1.03, 1.11].forEach((t, i) => pluck(t, n(["C5", "D5", "E5"][i]), 1.2));
boom(3.0, 0.9);
whoosh(3.0, 0.9, 1.1, 1);

for (let bar = 0; bar < 35; bar++) {
  const t = T0 + bar * BAR, ch = PROG[bar % 4];
  const breakdown = t >= 59 && t < 61;
  // pads — brighter as the film builds
  padChord(t, BAR, ch.pad.map(n), breakdown ? 0.7 : 1, t < 11 ? 3 : 5);
  for (let b = 0; b < 4; b++) {
    const tb = t + b * BEAT;
    if (!breakdown) {
      if (t < 11) { if (b % 2 === 0) kick(tb, 0.75); } else kick(tb, 1);
      if (t >= 11 && (b === 1 || b === 3)) clap(tb);
      if (t >= 5) hat(tb + BEAT / 2, b === 3 && bar % 4 === 3 ? 1.2 : 1, b === 3 && bar % 4 === 3);
      if (t >= 21) { hat(tb + BEAT / 4, 0.45); hat(tb + 3 * BEAT / 4, 0.45); }
    }
    // bass: whole-note pulse early, eighths once the groove is in
    if (t < 11) { if (b === 0) bass(tb, BAR - 0.05, n(ch.root) + 12, 0.8); }
    else if (!breakdown) { bass(tb, BEAT / 2 - 0.02, n(ch.root) + 12); bass(tb + BEAT / 2, BEAT / 2 - 0.02, n(ch.root) + (b === 3 ? 19 : 12), 0.8); }
  }
  // arp from the Planning chapter on, quieter under the settings scene
  if (t >= 21) {
    const g = t >= 54.5 && t < 61 ? 0.6 : 1;
    const tones = ch.pad.map(n).map((m) => m + 12);
    for (let s = 0; s < 16; s++) pluck(t + s * BEAT / 2 / 2 * 1, tones[ARP[s % 8] % tones.length] + (s >= 8 ? 0 : 0), g * (s % 4 === 0 ? 1.1 : 0.8), s % 2 ? 0.35 : -0.35);
  }
}
// lift into Efficiency, then the impact
riser(59.0, 2.0, 1.1);
[59.5, 59.75, 60.0, 60.25, 60.5, 60.62, 60.75, 60.87].forEach((t, i) => clap(t, 0.4 + i * 0.08));
boom(61.0, 0.7); whoosh(61.0, 0.8, 1, 1);
// ending: window collapses into the logo, bells spell the five words
boom(73.1, 1.1);
padChord(73.0, 3.0, ["C3", "G3", "C4", "E4", "G4", "D5"].map(n), 1.2, 4);
bass(73.0, 2.8, n("C2"), 1.1);
[0, 1, 2, 3, 4].forEach((i) => bell(73.95 + i * 0.18, n(["G4", "C5", "D5", "E5", "G5"][i]), 0.8, (i - 2) * 0.25));
bell(75.0, n("C6"), 0.5, 0);

// ── sound design synced to the picture ───────────────────────
const OFF_PA = 20.4, OFF_EFF = 6.5, OFF_FIN = 36.4;
[5.95, 7.35, 19.5, 25.6, 26.7, 29.2, 13.55 + OFF_PA, 14.85 + OFF_PA, 20.0 + OFF_PA, 45.3, 46.0, 46.5, 55.9, 56.25, 56.8, 57.5, 58.4, 57.3 + OFF_EFF, 35.4 + OFF_FIN].forEach((t) => click(t));
const typing = (a, b, chars) => { for (let i = 0; i < chars; i++) tick(a + ((b - a) * i) / chars, 0.8 + 0.4 * Math.abs(rnd())); };
typing(6.05, 6.9, 24); typing(8.0, 8.25, 6); typing(18.5 + OFF_PA, 19.4 + OFF_PA, 28); typing(58.55, 58.85, 2); typing(33.4 + OFF_FIN, 33.7 + OFF_FIN, 3);
[32.92 + OFF_FIN, 32.98 + OFF_FIN].forEach((t) => click(t, 1.4)); // Ctrl K keycaps
// cuts between chapters
[10.85, 20.8, 31.0, 37.0, 42.75, 48.0, 54.5].forEach((t, i) => whoosh(t, 0.55, 0.9, i % 2 ? -1 : 1));
whoosh(13.4, 0.6, 0.7, 1); whoosh(17.75, 0.5, 0.7, -1);    // phone in / out
whoosh(51.9, 0.7, 0.6, 1);                                   // Home scroll
whoosh(57.7, 0.4, 0.6, 1);                                   // capacity → targets
whoosh(33.3 + OFF_FIN, 0.35, 0.7, 1); whoosh(34.05 + OFF_FIN, 0.45, 0.8, -1); // palette open / jump
whoosh(37.1 + OFF_FIN, 0.7, 1, -1);                          // window into logo
// pops, blips and success moments
pop(8.45, 1, 1.2); pop(14.25, 0.9, 1);
[15.95, 16.2, 16.45, 16.52, 16.59, 16.9].forEach((t, i) => blip(t + 0.62, n(["E6", "G6", "A6", "B6", "C7", "D6"][i]), 0.8));
pop(18.1, 0.7, 0.8); pop(20.1, 1.1, 1.4); blip(20.12, n("G6"), 0.7);
pop(26.9, 0.9, 1.2); blip(28.0, n("E6"), 0.8); whoosh(29.5, 0.5, 0.6, 1);
pop(14.95 + OFF_PA, 0.8, 1); pop(20.25 + OFF_PA, 1, 1.3); blip(20.6 + OFF_PA, n("C7"), 0.7);
pop(47.05, 1, 1.2); pop(56.85, 0.9, 1.2); blip(58.9, n("A6"), 0.8); blip(59.25, n("E7"), 0.5);
pop(59.3 + OFF_EFF, 0.7, 0.9); blip(60.0 + OFF_EFF, n("C7"), 0.9); blip(60.08 + OFF_EFF, n("G7"), 0.6);
pop(35.55 + OFF_FIN, 1, 1.3); blip(35.7 + OFF_FIN, n("E7"), 0.7);

// ── effects + master ─────────────────────────────────────────
// sidechain: pads and bass duck under each kick
const duck = new Float32Array(N).fill(1);
for (let bar = 0; bar < 35; bar++) for (let b = 0; b < 4; b++) {
  const tk = T0 + bar * BAR + b * BEAT;
  if ((tk >= 59 && tk < 61) || (tk < 11 && b % 2)) continue;
  const s0 = Math.floor(tk * SR);
  for (let i = 0; i < SR * 0.4 && s0 + i < N; i++) duck[s0 + i] = Math.min(duck[s0 + i], 1 - 0.5 * Math.exp(-i / SR / 0.11));
}
for (let i = 0; i < N; i++) { L[i] += MUS_L[i] * duck[i]; R[i] += MUS_R[i] * duck[i]; RL[i] += MUS_L[i] * duck[i] * 0.35; RR[i] += MUS_R[i] * duck[i] * 0.35; }
// ping-pong eighth-note delay for the arp
const dSamp = Math.floor(SR * 0.375);
for (let i = dSamp; i < N; i++) { DL[i] += DR[i - dSamp] * 0.45; DR[i] += DL[i - dSamp] * 0.45; }
for (let i = 0; i < N; i++) { L[i] += DL[i] * 0.5; R[i] += DR[i] * 0.5; }
// Schroeder reverb
function reverb(inp, spread) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ d: d + spread, buf: new Float32Array(d + spread), i: 0, lp: 0 }));
  const aps = [556, 441, 341].map((d) => ({ d: d + spread, buf: new Float32Array(d + spread), i: 0 }));
  for (let s = 0; s < N; s++) {
    let acc = 0;
    for (const c of combs) { const y = c.buf[c.i]; c.lp = y * 0.7 + c.lp * 0.3; c.buf[c.i] = inp[s] + c.lp * 0.84; c.i = (c.i + 1) % c.d; acc += y; }
    let x = acc / combs.length;
    for (const a of aps) { const y = a.buf[a.i]; const v = -x + y; a.buf[a.i] = x + y * 0.5; a.i = (a.i + 1) % a.d; x = v; }
    out[s] = x;
  }
  return out;
}
const wl = reverb(RL, 0), wr = reverb(RR, 23);
for (let i = 0; i < N; i++) { L[i] += wl[i] * 0.9; R[i] += wr[i] * 0.9; }
// gentle glue + limiter, fades
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, f = Math.min(1, t / 0.05) * Math.min(1, (DUR - t) / 0.45);
  L[i] = Math.tanh(L[i] * 1.4) * f; R[i] = Math.tanh(R[i] * 1.4) * f;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;
const out = Buffer.alloc(44 + N * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVE", 8); out.write("fmt ", 12);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
}
fs.writeFileSync(process.argv[2] || "score.wav", out);
console.log("wrote", (N / SR).toFixed(2) + "s", "peak", peak.toFixed(3));
