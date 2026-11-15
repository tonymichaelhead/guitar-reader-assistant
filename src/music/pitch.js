// Pitch model. A pitch is { letter, octave, alter, value } where
// value = octave * 12 + pitch class (so C4 = 48) and alter is -1, 0 or +1.
// Pitches are *written* pitch: guitar notation sounds an octave lower.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Chromatic pitch class -> [letter, alteration].
const SHARP_SPELLING = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]
];
const FLAT_SPELLING = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
  ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]
];

// Spell a value with sharps (default) or flats. Only the five black keys
// differ, and none of their spellings crosses an octave boundary.
export function spell(value, prefer = 'sharp') {
  const [letter, alter] = (prefer === 'flat' ? FLAT_SPELLING : SHARP_SPELLING)[value % 12];
  return { letter, octave: Math.floor(value / 12), alter, value };
}

// Same pitch object (fingerings and all) under a different spelling.
export const respell = (pitch, prefer) => ({ ...pitch, ...spell(pitch.value, prefer) });

// Position on the diatonic ladder: one unit per staff line or space.
export const diatonicIndex = p => p.octave * 7 + LETTERS.indexOf(p.letter);

const E4 = 4 * 7 + LETTERS.indexOf('E'); // bottom line of the treble staff
// Half-space steps above the bottom staff line (E4 = 0, top line F5 = 8).
export const staffStep = p => diatonicIndex(p) - E4;

export const pitchName = p =>
  p.letter + (p.alter === 1 ? '♯' : p.alter === -1 ? '♭' : '') + p.octave;
