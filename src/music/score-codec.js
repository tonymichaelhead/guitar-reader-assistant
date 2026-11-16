// Score <-> a compact JSON-safe form. A saved study must still open after the
// generator has changed, so the notes themselves are written out; the seed
// alone would not bring them back.
//
// Encoded = {
//   v, seed, tonality, key, settings,
//   measures: [{ p: position, n: [[value, alter, dur], ...] }]
// }
// What can be worked out again is left out: a note's start is the running sum
// of the durations before it, a measure's number is its place in the list,
// a note's letter and octave follow from its value and alteration, and its
// fingerings come from the fretboard.
//
// Only the newest version is written, and every older one stays readable:
// people's saved studies are in it. A change of format is a new version with
// a reader of its own; the reader of an old version is never loosened or
// tightened, because either would change what an old study opens as.
//   1  From before a study could be in a key. There is no `key`, and a note
//      is a white key written plain or a black key written as a sharp or a
//      flat.
//   2  Adds `key`: a key id from theory.js, or null for a study without one.
//      A note is any letter its alteration lands on, so that a key can write
//      E sharp or C flat.
import { OPEN_STRINGS, POSITION_NUMBERS, poolFor } from './fretboard.js';
import { respell, spellWithAlter } from './pitch.js';
import { BAR, BEAT } from './rhythm.js';
import { keyById } from './theory.js';

export const CODEC_VERSION = 2;

const DURATIONS = [1, 2, 4];
const ALTERS = [-1, 0, 1];

export function encodeScore(score) {
  return {
    v: CODEC_VERSION,
    seed: score.seed,
    tonality: score.tonality,
    key: score.key,
    settings: structuredClone(score.settings),
    measures: score.measures.map(measure => ({
      p: measure.position,
      n: measure.notes.map(({ pitch, dur }) => [pitch.value, pitch.alter, dur])
    }))
  };
}

// The Score an encoding stands for, or null when it is not a valid encoding.
// Stored data can be stale, hand-edited or hostile, so this never throws.
export function decodeScore(data) {
  try {
    return decode(data);
  } catch {
    // Reading a hostile object can throw by itself (a getter, a proxy).
    return null;
  }
}

// JSON.parse only ever makes plain objects; anything else is not an encoding.
const isPlainObject = value => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// How each version writes a note. Both take the entry of the measure's pool
// that has the stored value, and the stored alteration; both answer with the
// pitch, or with null when the version has no such spelling. The fingerings
// come with the pool entry, never from the stored data.

// Version 1: a white key is written plain and a black key as a sharp or a
// flat; there is no other spelling (no E sharp, no C flat). The pool spells
// with sharps, so its entry is plain exactly on a white key.
function spellVersion1(entry, alter) {
  if ((entry.alter === 0) !== (alter === 0)) return null;
  return respell(entry, alter === -1 ? 'flat' : 'sharp');
}

// Version 2: the alteration decides the letter, E sharp, B sharp, C flat and
// F flat included. An alteration the value cannot carry (a plain black key, a
// sharpened D) is no spelling at all.
function spellVersion2(entry, alter) {
  // JSON can hold -0, which passes for 0 in every comparison made here. The
  // pitch gets a true 0, or it would not equal the pitch that was saved.
  const spelling = spellWithAlter(entry.value, alter === 0 ? 0 : alter);
  return spelling && { ...entry, ...spelling };
}

// Everything the versions differ in. A version missing here is refused whole:
// a later one may mean something else by the same fields.
const READERS = new Map([
  [1, { hasKey: false, spellNote: spellVersion1 }],
  [2, { hasKey: true, spellNote: spellVersion2 }]
]);

// The loops below are for...of on purpose: it visits the holes of a sparse
// array (as undefined), which every() and map() would silently skip.

function validStrings(strings) {
  if (!Array.isArray(strings) || strings.length === 0) return false;
  for (const string of strings) {
    if (!Number.isInteger(string) || string < 1 || string > OPEN_STRINGS.length) return false;
  }
  return new Set(strings).size === strings.length;
}

function decode(data) {
  if (!isPlainObject(data)) return null;
  // Each field is read once. A getter may answer differently the second time,
  // and what was checked has to be what is used.
  const { v: version } = data;
  const reader = READERS.get(version);
  if (!reader) return null;
  const { seed, tonality, settings: stored, measures } = data;
  if (!Number.isSafeInteger(seed) || seed < 0) return null;
  if (tonality !== null && typeof tonality !== 'string') return null;
  // A version without keys does not look for one: whatever sits under `key`
  // there is an extra field like any other. An id this version does not know
  // (a key added later) is refused, not read as "no key": the study would
  // open without its key signature.
  const key = reader.hasKey ? data.key : null;
  if (key !== null && !keyById(key)) return null;
  if (!isPlainObject(stored)) return null;
  // Validate the copy that is handed back, not the object it was made from.
  const settings = structuredClone(stored);
  if (!validStrings(settings.strings)) return null;
  if (!Array.isArray(measures)) return null;

  const decoded = [];
  for (const raw of measures) {
    const measure = decodeMeasure(raw, decoded.length + 1, settings.strings, reader.spellNote);
    if (!measure) return null;
    decoded.push(measure);
  }
  // Counted after the walk, for the same reason: it is the list handed back
  // that must not be empty, whatever length the stored one claimed.
  if (decoded.length === 0) return null;
  return { seed, settings, key, tonality, measures: decoded };
}

function decodeMeasure(raw, number, strings, spellNote) {
  if (!isPlainObject(raw)) return null;
  const { p: position, n: triples } = raw;
  if (!POSITION_NUMBERS.includes(position)) return null;
  if (!Array.isArray(triples) || triples.length === 0) return null;

  // The whole chromatic pool: whether accidentals were allowed is the
  // generator's business, here a note only has to be playable in the position.
  const pool = poolFor(position, { accidentals: 'sharps', strings });
  const notes = [];
  let start = 0;
  for (const triple of triples) {
    const note = decodeNote(triple, start, pool, spellNote);
    if (!note) return null;
    notes.push(note);
    start += note.dur;
  }
  return start === BAR ? { number, position, notes } : null;
}

function decodeNote(triple, start, pool, spellNote) {
  if (!Array.isArray(triple) || triple.length !== 3) return null;
  const [value, alter, dur] = triple;
  if (!Number.isInteger(value) || !ALTERS.includes(alter) || !DURATIONS.includes(dur)) return null;
  // A note stays inside its beat, and the beats inside the measure.
  const lastSixteenth = start + dur - 1;
  if (lastSixteenth >= BAR || Math.floor(start / BEAT) !== Math.floor(lastSixteenth / BEAT)) return null;

  // Never invent a pitch: one the pool lacks has no fingering in this position.
  const entry = pool.find(p => p.value === value);
  if (!entry) return null;
  const pitch = spellNote(entry, alter);
  return pitch && { pitch, start, dur };
}
