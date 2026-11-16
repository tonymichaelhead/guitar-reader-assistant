// Musical mode: still random, but shaped by melody-writing conventions.
// See docs/music-generation.md for the reasoning and sources behind each rule.
//
// Layers: the key -> phrases with a chord per measure and a cadence each
// -> a shared rhythm -> pitches from a weighted random walk -> several
// candidate walks per phrase, of which one of the best-shaped is kept.
//
// Two words used throughout. A "scale" note belongs to the key; a "chromatic"
// note does not. Neither is about the sign a note carries: in D major F sharp
// is a scale note and F natural the chromatic one. Ask `inKey`, never `alter`.
import { diatonicIndex } from './pitch.js';
import { pick, weightedPick } from './rng.js';
import { barSlots, musicalRhythm } from './rhythm.js';
import {
  DEGREE_WEIGHTS, PHRASE_LENGTH, PROGRESSIONS, chordDegrees, degreeOf, inKey, spellToward
} from './theory.js';

// Starting values, tuned by ear and by the statistics checked in the tests.
export const TUNING = {
  // Preference by melodic distance in diatonic steps: repeat, step, third,
  // fourth, fifth, sixth, seventh (never), octave.
  interval: [0.12, 0.55, 0.2, 0.08, 0.04, 0.02, 0, 0.02],
  registerSigma: 5.4,        // semitones; how tightly notes hug the register centre
  archHeight: 3,             // semitones the register centre rises mid-phrase
  strongBeatChordTone: 2.5,  // beats 1 and 3
  weakBeatChordTone: 1.4,    // beats 2 and 4
  stepInertia: 1.5,          // a step tends to continue in the same direction
  leapReversal: 3,           // after a fourth or more, step back the other way
  leapContinuation: 0.4,
  chromaticRate: 0.07,       // weight of a chromatic note relative to a stable step
  // Multipliers on chromaticRate, by what the chromatic note does.
  chromaticFalling: 0.5,     // one that resolves downward is rarer
  leadingNote: 2,            // up to the tonic (the raised seventh of a minor key)
  raisedFourth: 1.5,         // up to the fifth degree
  loweredSeventh: 1.4,       // down to the sixth degree, in major
  chromaticCadence: 3,       // straight into the note a phrase ends on
  melodicMinor: 1.5,         // the rising figure 5, raised 6, raised 7, 1
  candidatesPerPhrase: 24
};

const gaussian = (x, sigma) => Math.exp(-(x * x) / (2 * sigma * sigma));

// Melodic distance in staff steps, signed. A chromatic semitone written on one
// letter (F natural to F sharp in D major) is still a step in its direction.
const stepsBetween = (from, to) =>
  diatonicIndex(to) - diatonicIndex(from) || Math.sign(to.value - from.value);

// `pools` holds, for each measure, every note of its position spelled for
// `key` (keyPool in fretboard.js). Returns each measure's notes.
export function musicalMelody({ pools, positions, settings, key }, rng) {
  // 'sharps' and 'flats' both mean on (the key does the spelling), and so does
  // true, which is how the setting was stored before it had three values.
  const chromatic = settings.accidentals === 'sharps' || settings.accidentals === 'flats' ||
    settings.accidentals === true;
  // Any four neighbouring frets hold at least two notes of a scale, so `scale`
  // is never empty, however few strings are enabled.
  const bars = pools.map(pool => {
    const scale = pool.filter(p => inKey(key, p));
    const outside = chromatic ? pool.filter(p => !inKey(key, p)) : [];
    return {
      scale,
      outside,
      scaleAt: new Map(scale.map(p => [p.value, p])),
      outsideAt: new Map(outside.map(p => [p.value, p]))
    };
  });

  const rhythm = musicalRhythm(settings.noteValues, bars.length, PHRASE_LENGTH, rng);
  const phrases = planPhrases(bars.length, key, rhythm, rng);

  const peak = Math.max(...DEGREE_WEIGHTS[key.mode]);
  const ctx = {
    bars,
    positions,
    key,
    chromatic,
    degreeWeights: DEGREE_WEIGHTS[key.mode].map(w => w / peak),
    centres: planRegisters(bars, phrases, rng)
  };

  const out = bars.map(() => []);
  let state = { prev: null, move: 0, leaps: 0, prevDur: 0 };
  let opening = null; // first measure of the first phrase, echoed by later odd phrases
  phrases.forEach((phrase, index) => {
    const echo = index >= 2 && index % 2 === 0 ? opening : null;
    const candidates = [];
    for (let k = 0; k < TUNING.candidatesPerPhrase; k++) {
      candidates.push(walkPhrase(ctx, phrase, state, echo, rng));
    }
    candidates.sort((a, b) => b.score - a.score);
    const chosen = weightedPick(rng, candidates.slice(0, 3), [3, 2, 1]);
    for (const n of chosen.notes) out[n.bar].push({ pitch: n.pitch, start: n.start, dur: n.dur });
    state = chosen.end;
    if (index === 0) {
      opening = chosen.notes.filter(n => n.bar === phrase.firstBar).map(n => n.pitch.value);
    }
  });

  return out;
}

// Four-measure phrases alternating open and closed cadences; the last phrase
// always closes. A short final phrase uses the tail of its chord template.
function planPhrases(barCount, key, rhythm, rng) {
  const phrases = [];
  for (let firstBar = 0; firstBar < barCount; firstBar += PHRASE_LENGTH) {
    const length = Math.min(PHRASE_LENGTH, barCount - firstBar);
    const closed = firstBar + length >= barCount || phrases.length % 2 === 1;
    const template = pick(rng, PROGRESSIONS[key.mode][closed ? 'closed' : 'open']);
    const slots = [];
    for (let b = 0; b < length; b++) {
      for (const slot of barSlots(rhythm[firstBar + b])) slots.push({ bar: firstBar + b, ...slot });
    }
    phrases.push({ firstBar, closed, chords: template.slice(PHRASE_LENGTH - length), slots });
  }
  return phrases;
}

// The register centre of every measure. Each phrase settles in its own part of
// the position, so a study covers the low strings as well as the high ones,
// but neighbouring phrases stay within a fifth of each other and phrases that
// echo the opening share its register. A measure whose position cannot reach
// the phrase's centre uses the nearest part of its own range.
function planRegisters(bars, phrases, rng) {
  const MARGIN = 5;      // semitones kept clear at either end of the range
  const MAX_DRIFT = 7;   // semitones between neighbouring phrase centres
  const low = b => b.scale[0].value;
  const high = b => b.scale[b.scale.length - 1].value;
  const centres = new Array(bars.length);
  const phraseCentres = [];
  phrases.forEach((phrase, index) => {
    const own = bars.slice(phrase.firstBar, phrase.firstBar + phrase.chords.length);
    const lo = Math.min(...own.map(low)) + MARGIN;
    const hi = Math.max(...own.map(high)) - MARGIN;
    let centre;
    if (index >= 2 && index % 2 === 0) {
      centre = phraseCentres[0];
    } else if (hi <= lo) {
      centre = (lo + hi) / 2;
    } else {
      const previous = phraseCentres[index - 1];
      const from = previous === undefined ? lo : Math.max(lo, Math.min(hi, previous - MAX_DRIFT));
      const to = previous === undefined ? hi : Math.min(hi, Math.max(lo, previous + MAX_DRIFT));
      centre = from + rng() * (to - from);
    }
    phraseCentres.push(centre);
    own.forEach((b, k) => {
      const reachLo = Math.min(low(b) + 3, high(b));
      const reachHi = Math.max(high(b) - 3, reachLo);
      centres[phrase.firstBar + k] = Math.max(reachLo, Math.min(reachHi, centre));
    });
  });
  return centres;
}

// One random walk through a phrase. Returns its notes, the state to continue
// from, and a score for how well-shaped it turned out.
function walkPhrase(ctx, phrase, start, echo, rng) {
  const { slots } = phrase;
  const last = slots.length - 1;
  const firstBar = ctx.bars[phrase.firstBar];
  const firstBarSlots = slots.filter(s => s.bar === phrase.firstBar).length;
  // Reopen like the first phrase only if this measure can play it note for note.
  const canEcho = Boolean(echo) && echo.length === firstBarSlots &&
    echo.every(v => firstBar.scaleAt.has(v));

  const notes = [];
  let { prev, move, leaps, prevDur } = start;
  let pending = [];
  let target; // undefined until chosen; null when the pool offers no cadence note

  for (let i = 0; i <= last; i++) {
    const slot = slots[i];
    const remaining = last - i;
    if (target === undefined && remaining <= 6) target = chooseTarget(ctx, phrase, prev, rng);

    let pitch;
    if (pending.length) {
      pitch = pending.shift();
    } else if (remaining === 0 && target) {
      pitch = target;
    } else if (canEcho && slot.bar === phrase.firstBar) {
      pitch = firstBar.scaleAt.get(echo[i]);
    } else {
      const choice = choose(ctx, phrase, i, { prev, move, leaps, prevDur, target }, rng);
      pitch = choice.pitch;
      if (choice.pending) pending = [...choice.pending];
    }

    if (prev) {
      move = stepsBetween(prev, pitch);
      leaps = Math.abs(move) >= 2 ? leaps + 1 : 0;
    }
    notes.push({ bar: slot.bar, start: slot.start, dur: slot.dur, pitch });
    prev = pitch;
    prevDur = slot.dur;
  }

  return {
    notes,
    end: { prev, move, leaps, prevDur },
    score: scorePhrase(notes, Boolean(target), ctx)
  };
}

// The note a phrase ends on: the tonic for a closed phrase, otherwise a
// non-tonic note of the final chord. Whichever such note is nearest is likeliest.
// The key is the reader's choice, so the measure may be unable to play that
// note (a single string holds four or five semitones). Then any note of the
// final chord will do, which for a closed phrase is the third or fifth of the
// tonic chord; and with none of those either, null: the walk ends where its
// own weights take it, on a note of the scale.
function chooseTarget(ctx, phrase, prev, rng) {
  const lastSlot = phrase.slots[phrase.slots.length - 1];
  const { scale } = ctx.bars[lastSlot.bar];
  const finalChord = chordDegrees(phrase.chords[phrase.chords.length - 1]);
  const wanted = phrase.closed ? [0] : finalChord.filter(d => d !== 0);
  let options = scale.filter(p => wanted.includes(degreeOf(p, ctx.key)));
  if (!options.length) {
    options = scale.filter(p => finalChord.includes(degreeOf(p, ctx.key)));
  }
  if (!options.length) return null;
  const anchor = prev ? prev.value : ctx.centres[lastSlot.bar];
  return weightedPick(rng, options, options.map(p => Math.exp(-Math.abs(p.value - anchor) / 2.5)));
}

function choose(ctx, phrase, i, state, rng) {
  const { scale } = ctx.bars[phrase.slots[i].bar];
  const options = [];
  const weights = [];
  for (const p of scale) {
    const w = scaleWeight(ctx, phrase, i, state, p);
    if (w > 0) {
      options.push({ pitch: p });
      weights.push(w);
    }
  }
  for (const option of chromaticOptions(ctx, phrase, i, state)) {
    options.push(option);
    weights.push(option.weight);
  }
  if (!options.length) {
    // The rules left nothing (a very small pool): take a nearby note instead.
    for (const p of scale) {
      options.push({ pitch: p });
      weights.push(Math.exp(-Math.abs(p.value - state.prev.value) / 3) + 1e-6);
    }
  }
  return weightedPick(rng, options, weights);
}

// True when this slot opens a measure played in a different position from the
// measure before it. Melodic rules are relaxed across such a shift.
const afterShift = (ctx, slot) =>
  slot.start === 0 && slot.bar > 0 && ctx.positions[slot.bar] !== ctx.positions[slot.bar - 1];

// The weight of a scale note at slot i. `state.prev` is always a scale note
// here: a chromatic note commits the notes after it until it has resolved.
function scaleWeight(ctx, phrase, i, state, p) {
  const { slots } = phrase;
  const slot = slots[i];
  const remaining = slots.length - 1 - i;
  const { prev, move, leaps, prevDur, target } = state;
  const degree = degreeOf(p, ctx.key);
  const inChord = chordDegrees(phrase.chords[slot.bar - phrase.firstBar]).includes(degree);

  // Tonal stability, register, harmony.
  let w = ctx.degreeWeights[degree];
  const progress = slots.length > 1 ? i / (slots.length - 1) : 0;
  const centre = ctx.centres[slot.bar] + TUNING.archHeight * Math.sin(Math.PI * progress);
  w *= gaussian(p.value - centre, TUNING.registerSigma);
  if (inChord) {
    if (slot.start % 8 === 0) w *= TUNING.strongBeatChordTone;
    else if (slot.start % 4 === 0) w *= TUNING.weakBeatChordTone;
  }
  if (!prev) return w * (inChord ? 2 : 0.5); // the piece opens on the tonic chord

  const dd = diatonicIndex(p) - diatonicIndex(prev);
  const ad = Math.abs(dd);
  const semis = Math.abs(p.value - prev.value);
  if (afterShift(ctx, slot)) return w * Math.exp(-semis / 4);

  // Hard rules.
  if (semis === 6 || ad === 6 || ad > 7) return 0;  // tritone, seventh, beyond an octave
  if (ad >= 2 && leaps >= 2) return 0;              // never three leaps in a row
  const fast = slot.dur === 1 || prevDur === 1;
  if (fast && ad > 2) return 0;                     // sixteenths move by step or third

  // Soft preferences.
  w *= TUNING.interval[ad];
  if (fast && ad === 2) w *= 0.5;
  if (fast && ad === 0) w *= 0.3;
  if (Math.abs(move) === 1 && dd === move) w *= TUNING.stepInertia;
  if (Math.abs(move) >= 3) {
    if (ad === 1 && Math.sign(dd) !== Math.sign(move)) w *= TUNING.leapReversal;
    else if (Math.sign(dd) === Math.sign(move)) w *= TUNING.leapContinuation;
  }

  // Steer toward the cadence note, arriving by step.
  if (target && remaining >= 1) {
    const distance = Math.abs(diatonicIndex(p) - diatonicIndex(target));
    if (remaining === 1) w *= distance === 1 ? 6 : distance === 2 ? 0.6 : 0.03;
    else if (distance > remaining * 2) w *= 0.03;
    else if (distance > remaining) w *= 0.5;
  }
  return w;
}

// Chromatic notes never stand alone: each is approached from a scale note at
// most a whole tone away, sits off the strong beats, and commits the next note
// to its resolution, the scale note a semitone further on. It is written
// toward that resolution (spellToward in theory.js).
function chromaticOptions(ctx, phrase, i, state) {
  const { slots } = phrase;
  const slot = slots[i];
  const bar = ctx.bars[slot.bar];
  const last = slots.length - 1;
  const { prev, target } = state;
  if (!bar.outside.length || !prev || !inKey(ctx.key, prev) || i >= last) return [];
  if (slot.start % 8 === 0 || afterShift(ctx, slot)) return [];

  const next = ctx.bars[slots[i + 1].bar];
  const cadence = i + 1 === last && target;
  const register = value => gaussian(value - ctx.centres[slot.bar], TUNING.registerSigma);
  const options = [];

  for (const x of bar.outside) {
    for (const dir of [1, -1]) {
      const resolution = next.scaleAt.get(x.value + dir);
      if (!resolution) continue;
      // From the resolution itself (a neighbour note), from the scale note a
      // semitone on the far side (a passing note), or from a whole tone
      // further. This also rules out the augmented second.
      const approach = prev.value - x.value;
      if (approach !== dir && approach !== -dir && approach !== -2 * dir) continue;
      if (cadence && resolution.value !== target.value) continue;
      const spelling = spellToward(x.value, resolution, ctx.key);
      if (!spelling) continue;
      const pitch = { ...x, ...spelling };
      // The approach must also read as a step or less. Where E sharp is written
      // as F natural, D sharp before it would stand a diminished third away.
      if (Math.abs(stepsBetween(prev, pitch)) > 1) continue;

      const degree = degreeOf(resolution, ctx.key);
      let w = TUNING.chromaticRate * ctx.degreeWeights[degree] * register(x.value);
      if (dir === -1) w *= TUNING.chromaticFalling;
      if (dir === 1 && degree === 0) w *= TUNING.leadingNote;
      if (dir === 1 && degree === 4) w *= TUNING.raisedFourth;
      if (dir === -1 && degree === 5 && ctx.key.mode === 'major') w *= TUNING.loweredSeventh;
      if (cadence) w *= TUNING.chromaticCadence;
      options.push({ pitch, pending: [resolution], weight: w });
    }
  }

  // Melodic minor: the raised sixth appears only on the way up from the fifth
  // degree through the raised seventh to the tonic (E F# G# A in A minor).
  // The pool already writes those two notes as the sixth and seventh letters
  // raised (D sharp and E sharp in F sharp minor).
  if (ctx.key.mode === 'minor' && i + 2 <= last && degreeOf(prev, ctx.key) === 4) {
    const sixth = bar.outsideAt.get(prev.value + 2);
    const seventh = next.outsideAt.get(prev.value + 4);
    const tonic = ctx.bars[slots[i + 2].bar].scaleAt.get(prev.value + 5);
    const closes = i + 2 === last && target;
    if (sixth && seventh && tonic && !(closes && tonic.value !== target.value)) {
      options.push({
        pitch: sixth,
        pending: [seventh, tonic],
        weight: TUNING.chromaticRate * TUNING.melodicMinor * register(sixth.value) *
          (closes ? TUNING.chromaticCadence : 1)
      });
    }
  }
  return options;
}

// Phrase-level shape, used to choose among candidate walks: mostly stepwise,
// one climax away from the edges, a sensible range, few repeated notes, a
// stepwise arrival at the cadence, and (when enabled) some chromatic colour.
function scorePhrase(notes, hasTarget, ctx) {
  if (notes.length < 2) return 0;
  let steps = 0;
  let repeats = 0;
  let chromatic = 0;
  let high = -Infinity;
  let low = Infinity;
  let highCount = 0;
  let highAt = 0;
  notes.forEach((n, i) => {
    const v = n.pitch.value;
    if (v > high) {
      high = v;
      highCount = 1;
      highAt = i;
    } else if (v === high) {
      highCount++;
    }
    if (v < low) low = v;
    if (!inKey(ctx.key, n.pitch)) chromatic++;
    if (i > 0) {
      const semis = Math.abs(v - notes[i - 1].pitch.value);
      if (semis === 0) repeats++;
      else if (semis <= 2) steps++;
    }
  });

  let score = 2 * Math.min(1, steps / (notes.length - 1) / 0.6);
  if (highCount === 1) score += 1;
  const where = highAt / (notes.length - 1);
  if (where >= 0.2 && where <= 0.8) score += 1;
  if (high - low >= 5 && high - low <= 14) score += 1;
  score -= 0.5 * Math.max(0, repeats - 2);
  if (hasTarget) {
    const arrival = Math.abs(notes[notes.length - 1].pitch.value - notes[notes.length - 2].pitch.value);
    if (arrival === 1 || arrival === 2) score += 1.5;
    // A cadence should not be reached by scrambling: no wide leaps just before it.
    for (let i = Math.max(1, notes.length - 3); i < notes.length; i++) {
      if (Math.abs(notes[i].pitch.value - notes[i - 1].pitch.value) > 5) score -= 1;
    }
  }
  if (ctx.chromatic && chromatic >= 1 && chromatic <= Math.max(2, notes.length / 6)) score += 1;
  return score;
}
