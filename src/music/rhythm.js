// Rhythm. Durations are counted in sixteenths: quarter 4, eighth 2, sixteenth 1.
// A measure of 4/4 is four beats; each beat is filled by one "cell", so notes
// never cross a beat and every eighth or sixteenth has a beam partner.
import { pick, weightedPick } from './rng.js';

export const BEAT = 4;
export const BEATS_PER_BAR = 4;
export const BAR = BEAT * BEATS_PER_BAR;
export const NOTE_VALUES = ['quarter', 'eighth', 'sixteenth'];

// Cells available for the enabled note values, with weights that give each
// enabled value an equal share of the beats. The two mixed cells only exist
// when eighths and sixteenths are both enabled.
export function allowedCells(noteValues) {
  const on = name => noteValues.includes(name);
  const cells = [];
  if (on('quarter')) cells.push({ durs: [4], weight: 2 });
  if (on('eighth')) cells.push({ durs: [2, 2], weight: 2 });
  if (on('sixteenth')) {
    const mixed = on('eighth');
    cells.push({ durs: [1, 1, 1, 1], weight: mixed ? 1 : 2 });
    if (mixed) {
      cells.push({ durs: [2, 1, 1], weight: 0.5 });
      cells.push({ durs: [1, 1, 2], weight: 0.5 });
    }
  }
  return cells;
}

const pickCell = (cells, rng) => weightedPick(rng, cells, cells.map(c => c.weight));

// Random mode: every beat of every measure draws its own cell.
export function randomRhythm(noteValues, measureCount, rng) {
  const cells = allowedCells(noteValues);
  return Array.from({ length: measureCount }, () =>
    Array.from({ length: BEATS_PER_BAR }, () => pickCell(cells, rng).durs));
}

// Musical mode: two one-measure motifs alternate through each phrase, and the
// measure that closes a phrase comes to rest on the longest enabled value.
export function musicalRhythm(noteValues, measureCount, phraseLength, rng) {
  const cells = allowedCells(noteValues);
  const longest = cells.reduce((a, c) => (c.durs.length < a.durs.length ? c : a)).durs;
  const motif = () => {
    const a = pickCell(cells, rng).durs;
    const b = pickCell(cells, rng).durs;
    return [...pick(rng, ['aaab', 'abab', 'aabb', 'abaa', 'aaba'])].map(ch => (ch === 'a' ? a : b));
  };
  // Between them the two motifs must use every enabled note value. The first
  // two measures of a phrase play the motifs unaltered, so every enabled value
  // is then certain to appear in the piece.
  const wanted = new Set(cells.flatMap(c => c.durs));
  let motifs;
  for (let attempt = 0; attempt < 100; attempt++) {
    motifs = [motif(), motif()];
    if (new Set(motifs.flat(2)).size === wanted.size) break;
  }
  return Array.from({ length: measureCount }, (_, i) => {
    const inPhrase = i % phraseLength;
    const closesPhrase = inPhrase === phraseLength - 1 || i === measureCount - 1;
    const bar = [...motifs[inPhrase % 2]];
    if (closesPhrase) bar[BEATS_PER_BAR - 1] = longest;
    if (i === measureCount - 1) bar[BEATS_PER_BAR - 2] = longest;
    return bar;
  });
}

// Flatten one measure's cells into note slots: [{ start, dur }].
export function barSlots(barCells) {
  const slots = [];
  let start = 0;
  for (const durs of barCells) {
    for (const dur of durs) {
      slots.push({ start, dur });
      start += dur;
    }
  }
  return slots;
}
