#!/usr/bin/env node
/* =====================================================================
   Playout continuity check — proves the chat player never audibly
   stalls while a reply is generating.

   It extracts the REAL AudioWorklet processor source from
   web/player.js, instantiates it with stubbed worklet globals, then
   runs a virtual render clock (128-sample quanta @ 24 kHz) against
   scripted PCM arrival patterns:

     A  slow start      first 250 ms chunk, then chunky arrivals
     B  bursty pipeline two segments with an arrival lull between
     C  hostile gap     a 3 s mid-stream starvation (must re-prime once)
     D  short clip      one tiny utterance, eos immediately

   Assertions per pattern: number of underrun events, audible gaps
   (silence rendered while the processor considers itself started and
   the stream is not drained), first-audible latency, and that the
   adaptive cushion grows after a starvation.

   Exit code 0 = continuous playout in every pattern.
   ===================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const playerSrc = readFileSync(path.join(HERE, '..', 'web', 'player.js'), 'utf8');
const m = playerSrc.match(/const WORKLET_SRC = `([\s\S]*?)`;/);
if (!m) { console.error('✗ WORKLET_SRC not found in web/player.js'); process.exit(1); }

let ProcessorClass = null;
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.port = { onmessage: null, postMessage: () => {} };
  }
};
globalThis.registerProcessor = (name, cls) => { ProcessorClass = cls; };
globalThis.currentTime = 0;
eval(m[1]);
if (!ProcessorClass) { console.error('✗ processor not registered'); process.exit(1); }

const SR = 24000;
const Q = 128; // render quantum

function chunk(seconds, freq = 220) {
  const n = Math.round(seconds * SR);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = 0.4 * Math.sin(2 * Math.PI * freq * i / SR);
  return a;
}

/* arrivals: [atSec, secondsOfAudio][]; returns metrics */
function runPattern(name, arrivals, eosAt, expect) {
  const inst = new ProcessorClass();
  const msgs = [];
  inst.port.postMessage = (msg) => msgs.push(msg);
  inst.port.onmessage?.({ data: { type: 'reset' } });

  const sorted = [...arrivals].sort((a, b) => a[0] - b[0]);
  let ai = 0;
  let eosSent = false;
  let maxPrimeNeed = 0;
  let t = 0;
  let firstAudible = null;
  let gapsAfterStart = 0;
  let maxRunOfGaps = 0;
  let gapRun = 0;
  const endT = eosAt + 2.5;

  while (t <= endT) {
    globalThis.currentTime = t;
    while (ai < sorted.length && sorted[ai][0] <= t) {
      inst.port.onmessage({ data: { type: 'pcm', data: chunk(sorted[ai][1]) } });
      ai++;
    }
    if (!eosSent && t >= eosAt) {
      inst.port.onmessage({ data: { type: 'eos' } });
      eosSent = true;
    }
    const out = new Float32Array(Q);
    const wasStarted = inst.started;
    inst.process([], [[out]]);
    maxPrimeNeed = Math.max(maxPrimeNeed, inst.primeNeed);
    const silent = out.every((v) => v === 0);
    if (!silent && firstAudible === null) firstAudible = t;
    // A silence only becomes an AUDIBLE gap if playback later resumes
    // (trailing silence before the END frame is just the stream ending).
    if (wasStarted && silent && !inst.eos) {
      gapRun++;
    } else {
      if (!silent && gapRun > 0) {
        gapsAfterStart += gapRun;
        maxRunOfGaps = Math.max(maxRunOfGaps, gapRun);
      }
      gapRun = 0;
    }
    t += Q / SR;
  }

  const underruns = msgs.filter((x) => x.type === 'underrun').length;
  const drained = msgs.filter((x) => x.type === 'drained').length;
  const problems = [];
  if (firstAudible === null) problems.push('never became audible');
  if (expect.maxUnderruns != null && underruns > expect.maxUnderruns)
    problems.push(`underruns ${underruns} > ${expect.maxUnderruns}`);
  if (expect.maxGaps != null && gapsAfterStart > expect.maxGaps)
    problems.push(`audible gap quanta ${gapsAfterStart} > ${expect.maxGaps}`);
  if (expect.firstAudibleMax != null && firstAudible > expect.firstAudibleMax)
    problems.push(`first audible ${(firstAudible * 1000).toFixed(0)}ms > ${expect.firstAudibleMax * 1000}ms`);
  if (expect.minPrimeNeed != null && maxPrimeNeed < expect.minPrimeNeed)
    problems.push(`cushion did not grow: primeNeed peaked ${maxPrimeNeed} < ${expect.minPrimeNeed}`);
  const ok = problems.length === 0;
  console.log(`${ok ? '✓' : '✗'} ${name}: first=${firstAudible?.toFixed(2)}s underruns=${underruns} ` +
    `gapQuanta=${gapsAfterStart} maxGapRun=${(maxRunOfGaps * Q / SR * 1000).toFixed(0)}ms drained=${drained} ` +
    `primeNeed=${inst.primeNeed} queued=${inst.queued()}`);
  for (const p of problems) console.log(`    - ${p}`);
  return ok;
}

let all = true;
// A: slow start — the reported bug: 250 ms first chunk, chunky follow-ups
all &= runPattern('A slow-start', [
  [0.30, 0.25], [0.62, 0.25], [0.95, 0.25], [1.30, 0.50],
  [1.85, 0.90], [2.80, 0.90], [3.75, 0.90], [4.70, 0.90],
], 5.65, { maxUnderruns: 0, maxGaps: 0, firstAudibleMax: 1.6 });

// B: bursty pipeline — 1.5 s segment, next segment lands before it drains
all &= runPattern('B bursty', [
  [0.40, 1.50], [1.75, 0.90], [2.70, 0.90], [3.65, 0.90], [4.60, 0.90],
], 5.55, { maxUnderruns: 0, maxGaps: 0, firstAudibleMax: 1.7 });

// C: hostile 3 s starvation mid-stream — exactly one re-prime, then clean
all &= runPattern('C hostile-gap', [
  [0.35, 1.20], [5.60, 0.90], [6.55, 0.90], [7.50, 0.90],
], 8.45, { maxUnderruns: 1, maxGaps: 200, firstAudibleMax: 1.7, minPrimeNeed: 33600 });

// D: short clip — plays immediately at eos, drains cleanly
all &= runPattern('D short-clip', [
  [0.30, 0.40],
], 0.32, { maxUnderruns: 0, maxGaps: 0, firstAudibleMax: 0.6 });

console.log(all ? '\nPLAYOUT: PASS — continuous in all patterns' : '\nPLAYOUT: FAIL');
process.exit(all ? 0 : 1);
