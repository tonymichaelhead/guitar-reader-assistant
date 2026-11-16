// Tonal vocabulary for the musical generator: the keys a study can be in,
// how each key spells its notes, and the weights and chords of its mode.
import { LETTERS, signatureAlter, spell, spellOnLetter, spellWithAlter } from './pitch.js';

export const PHRASE_LENGTH = 4; // measures

// The keys on offer: those a guitarist meets most, up to four sharps and two
// flats, each major key with its relative minor. `tonic` is the tonic's
// letter; `signature` counts sharps when positive and flats when negative.
export const KEYS = [
  { id: 'C', label: 'C major', tonic: 'C', mode: 'major', signature: 0 },
  { id: 'G', label: 'G major', tonic: 'G', mode: 'major', signature: 1 },
  { id: 'D', label: 'D major', tonic: 'D', mode: 'major', signature: 2 },
  { id: 'A', label: 'A major', tonic: 'A', mode: 'major', signature: 3 },
  { id: 'E', label: 'E major', tonic: 'E', mode: 'major', signature: 4 },
  { id: 'F', label: 'F major', tonic: 'F', mode: 'major', signature: -1 },
  { id: 'Bb', label: 'B♭ major', tonic: 'B', mode: 'major', signature: -2 },
  { id: 'Am', label: 'A minor', tonic: 'A', mode: 'minor', signature: 0 },
  { id: 'Em', label: 'E minor', tonic: 'E', mode: 'minor', signature: 1 },
  { id: 'Bm', label: 'B minor', tonic: 'B', mode: 'minor', signature: 2 },
  { id: 'F#m', label: 'F♯ minor', tonic: 'F', mode: 'minor', signature: 3 },
  { id: 'C#m', label: 'C♯ minor', tonic: 'C', mode: 'minor', signature: 4 },
  { id: 'Dm', label: 'D minor', tonic: 'D', mode: 'minor', signature: -1 },
  { id: 'Gm', label: 'G minor', tonic: 'G', mode: 'minor', signature: -2 }
];
export const DEFAULT_KEY = 'C';

// The key with this id, or null. A study without a key (Random mode, or one
// saved before keys existed) is written as if in C: no signature.
export const keyById = id => KEYS.find(key => key.id === id) || null;
export const signatureOf = key => (key ? key.signature : 0);

// What the key's signature does to a letter: +1, -1 or 0.
export const keyAlter = (key, letter) => signatureAlter(signatureOf(key), letter);

// True for a note of the key's scale, spelled as the key spells it.
export const inKey = (key, pitch) => pitch.alter === keyAlter(key, pitch.letter);

// A letter some steps up the scale from another (steps may be negative).
const letterFrom = (letter, steps) => LETTERS[(LETTERS.indexOf(letter) + steps + 70) % 7];

// E sharp, B sharp, C flat and F flat: correct now and then, but hard to read.
const awkward = spelling =>
  (spelling.alter === 1 && (spelling.letter === 'E' || spelling.letter === 'B')) ||
  (spelling.alter === -1 && (spelling.letter === 'C' || spelling.letter === 'F'));

// How a key writes a value when nothing else decides: a note of the scale on
// its own letter; in a minor key the raised sixth and seventh on theirs
// (F sharp and G sharp in A minor); any other white key plain; any other
// black key as a sharp in a sharp key or in C, as a flat in a flat key.
export function spellInKey(value, key) {
  for (const letter of LETTERS) {
    const own = spellWithAlter(value, keyAlter(key, letter));
    if (own && own.letter === letter) return own;
  }
  if (key && key.mode === 'minor') {
    for (const degree of [5, 6]) {
      const letter = letterFrom(key.tonic, degree);
      const raised = spellWithAlter(value, keyAlter(key, letter) + 1);
      if (raised && raised.letter === letter) return raised;
    }
  }
  return spellWithAlter(value, 0) || spell(value, signatureOf(key) < 0 ? 'flat' : 'sharp');
}

// How a key writes a note from outside the scale that moves by a semitone to
// `resolution`, a note of the scale. Going up it is the letter below, raised
// (G sharp to A); going down, the letter above, lowered (B flat to A). Where
// that would take a double sharp or flat, or one of the awkward four, the
// resolution's own letter is used with its sign cancelled (F natural to F
// sharp in D major). The one place the awkward spelling is kept is the leading
// note of a minor key, which is always the seventh letter raised: E sharp in
// F sharp minor. Returns null when neither spelling will do.
export function spellToward(value, resolution, key) {
  const up = resolution.value > value;
  const neighbour = letterFrom(resolution.letter, up ? -1 : 1);
  const first = spellOnLetter(value, neighbour);
  const leadingNote = up && key && key.mode === 'minor' && resolution.letter === key.tonic;
  if (first && (leadingNote || !awkward(first))) return first;
  const second = spellOnLetter(value, resolution.letter);
  return second && !awkward(second) ? second : null;
}

// How stable each scale degree sounds (index 0 = tonic): the Krumhansl-Kessler
// probe-tone ratings for the seven degrees of the major and of the natural
// minor scale. They are relative to the tonic, so one row serves every key of
// a mode.
export const DEGREE_WEIGHTS = {
  major: [6.35, 3.48, 4.38, 4.09, 5.19, 3.66, 2.88],
  minor: [6.33, 3.52, 5.38, 3.53, 4.75, 3.98, 3.34]
};

// One chord per measure, written as the chord root's scale degree (0 = I).
// "open" phrases end away from the tonic (a half cadence); "closed" phrases
// end on it (an authentic cadence).
export const PROGRESSIONS = {
  major: {
    open: [[0, 0, 3, 4], [0, 3, 0, 4], [0, 5, 3, 4], [0, 1, 4, 4]],
    closed: [[0, 3, 4, 0], [5, 1, 4, 0], [3, 0, 4, 0], [0, 1, 4, 0]]
  },
  minor: {
    open: [[0, 3, 0, 4], [0, 5, 3, 4], [0, 2, 3, 4]],
    closed: [[0, 3, 4, 0], [5, 3, 4, 0], [0, 5, 6, 0]]
  }
};

// Scale degree (0-6) of a pitch in a key, read from its letter alone: for a
// chromatic note it is the degree of the letter it is written on.
export const degreeOf = (pitch, key) =>
  (LETTERS.indexOf(pitch.letter) - LETTERS.indexOf(key.tonic) + 7) % 7;

// Scale degrees of the triad built on a root degree.
export const chordDegrees = root => [root, (root + 2) % 7, (root + 4) % 7];
