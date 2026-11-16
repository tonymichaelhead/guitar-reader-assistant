// Pitch model. A pitch is { letter, octave, alter, value }: a letter on the
// staff, the octave that letter is in, an alteration of -1, 0 or +1, and the
// value that sounds, counted in semitones so that C4 = 48. For the natural
// notes and the usual sharps and flats, value = octave * 12 + pitch class.
// The octave belongs to the letter, which matters for two spellings: B sharp 3
// has the value of C4, and C flat 4 the value of B3.
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

const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// The spelling of a value that carries the given alteration (-1, 0 or +1), or
// null when there is none: a black key has no plain spelling. Any letter can
// result, E sharp and C flat included.
export function spellWithAlter(value, alter) {
  const natural = value - alter;
  const letter = LETTERS.find(l => NATURAL_PC[l] === ((natural % 12) + 12) % 12);
  return letter ? { letter, octave: Math.floor(natural / 12), alter, value } : null;
}

// The spelling of a value on a given letter, or null when that would take
// more than a single sharp or flat.
export function spellOnLetter(value, letter) {
  const pc = ((value % 12) + 12) % 12;
  const alter = ((pc - NATURAL_PC[letter] + 18) % 12) - 6;
  return Math.abs(alter) <= 1 ? spellWithAlter(value, alter) : null;
}

// The order in which a key signature adds its sharps, and its flats.
export const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
export const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

// What a key signature does to a letter: +1, -1 or 0. A signature is a count:
// of sharps when positive, of flats when negative, and 0 for none.
export function signatureAlter(signature, letter) {
  if (signature > 0) return SHARP_ORDER.indexOf(letter) < signature ? 1 : 0;
  if (signature < 0) return FLAT_ORDER.indexOf(letter) < -signature ? -1 : 0;
  return 0;
}

// Position on the diatonic ladder: one unit per staff line or space.
export const diatonicIndex = p => p.octave * 7 + LETTERS.indexOf(p.letter);

const E4 = 4 * 7 + LETTERS.indexOf('E'); // bottom line of the treble staff
// Half-space steps above the bottom staff line (E4 = 0, top line F5 = 8).
export const staffStep = p => diatonicIndex(p) - E4;

export const pitchName = p =>
  p.letter + (p.alter === 1 ? '♯' : p.alter === -1 ? '♭' : '') + p.octave;
