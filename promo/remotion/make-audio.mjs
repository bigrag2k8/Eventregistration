// Generates a 32-second soft ambient pad as a 16-bit mono WAV (public/bed.wav).
// This is the same musical bed as the in-browser Web Audio version of the promo:
// a slow C - G - Am - F progression (triangle pads + sine sub-bass) with a faint
// shimmer, low-pass filtered, fading in at the start and out at the end. Pure math,
// no samples - so the audio is fully license-free.
import fs from "fs";

const SR = 44100;
const DUR = 32;
const N = SR * DUR;
const D = 32;
const S5A = 23.4; // savings-beat swell

const NOTE = {
  C3: 130.81, F2: 87.31, G2: 98, A2: 110,
  C4: 261.63, E4: 329.63, G4: 392, G3: 196,
  B3: 246.94, D4: 293.66, A3: 220, F3: 174.61,
};
const CHORDS = [
  { bass: "C3", notes: ["C4", "E4", "G4"] },
  { bass: "G2", notes: ["G3", "B3", "D4"] },
  { bass: "A2", notes: ["A3", "C4", "E4"] },
  { bass: "F2", notes: ["F3", "A3", "C4"] },
];

const voices = [];
for (let i = 0; i < 8; i++) {
  const ch = CHORDS[i % 4];
  const t0 = i * 4;
  for (const n of ch.notes) voices.push({ freq: NOTE[n], t0, dur: 4, peak: 0.05, type: "tri" });
  voices.push({ freq: NOTE[ch.bass], t0, dur: 4, peak: 0.045, type: "sine" });
}

function env(t, t0, dur) {
  const atk = 0.9;
  const relStart = dur - 0.6;
  const relEnd = dur + 1.6;
  const lt = t - t0;
  if (lt < 0 || lt > relEnd) return 0;
  if (lt < atk) return lt / atk;
  if (lt < relStart) return 1;
  const r = (lt - relStart) / (relEnd - relStart);
  return Math.max(0, 1 - r);
}
function tri(ph) {
  return (2 / Math.PI) * Math.asin(Math.sin(ph));
}
function masterGain(t) {
  if (t < 2.5) return (t / 2.5) * 0.8;
  if (t < S5A - 1) return 0.8;
  if (t < S5A + 1) return 0.8 + 0.15 * ((t - (S5A - 1)) / 2);
  if (t < D - 2.5) return 0.95;
  return 0.95 * Math.max(0, (D - t) / 2.5);
}

const TWO_PI = Math.PI * 2;
const dt = 1 / SR;
const buf = new Float32Array(N);
const phase = new Array(voices.length).fill(0);
let shPhase = 0;
let lfoPhase = 0;

for (let s = 0; s < N; s++) {
  const t = s * dt;
  let mix = 0;
  for (let v = 0; v < voices.length; v++) {
    const vo = voices[v];
    phase[v] += TWO_PI * vo.freq * dt;
    const e = env(t, vo.t0, vo.dur);
    if (e > 0) {
      const w = vo.type === "tri" ? tri(phase[v]) : Math.sin(phase[v]);
      mix += w * vo.peak * e;
    }
  }
  shPhase += TWO_PI * 1046.5 * dt;
  lfoPhase += TWO_PI * 0.16 * dt;
  mix += Math.sin(shPhase) * (0.007 + 0.005 * Math.sin(lfoPhase));
  buf[s] = mix * masterGain(t);
}

// one-pole low-pass, fc = 1500 Hz
const fc = 1500;
const RC = 1 / (TWO_PI * fc);
const alpha = dt / (RC + dt);
let y = 0;
for (let s = 0; s < N; s++) {
  y = y + alpha * (buf[s] - y);
  buf[s] = y;
}

// normalize to a soft peak
let peak = 0;
for (let s = 0; s < N; s++) peak = Math.max(peak, Math.abs(buf[s]));
const norm = peak > 0 ? 0.84 / peak : 1;
for (let s = 0; s < N; s++) buf[s] *= norm;

// write 16-bit mono PCM WAV
const bps = 2;
const dataSize = N * bps;
const out = Buffer.alloc(44 + dataSize);
out.write("RIFF", 0);
out.writeUInt32LE(36 + dataSize, 4);
out.write("WAVE", 8);
out.write("fmt ", 12);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(1, 22);
out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * bps, 28);
out.writeUInt16LE(bps, 32);
out.writeUInt16LE(16, 34);
out.write("data", 36);
out.writeUInt32LE(dataSize, 40);
for (let s = 0; s < N; s++) {
  const v = Math.max(-1, Math.min(1, buf[s]));
  out.writeInt16LE((v * 32767) | 0, 44 + s * bps);
}
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/bed.wav", out);
console.log("wrote public/bed.wav", (dataSize / 1024 / 1024).toFixed(2), "MB");
