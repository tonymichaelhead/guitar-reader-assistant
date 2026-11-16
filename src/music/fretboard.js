// Fretboard: which written pitches each position offers, and how to finger them.
import { respell, spell } from './pitch.js';
import { inKey, keyById, spellInKey } from './theory.js';

// Open strings as written pitch, 6th string first: E3 A3 D4 G4 B4 E5.
export const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];
export const POSITION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Every pitch reachable without shifting out of the position, with each
// string/fret that produces it. Position I also includes the open strings.
export function buildPosition(position) {
  const frets = position === 1
    ? [0, 1, 2, 3, 4]
    : [position, position + 1, position + 2, position + 3];
  const byValue = new Map();
  OPEN_STRINGS.forEach((open, i) => {
    const string = 6 - i;
    for (const fret of frets) {
      const value = open + fret;
      if (!byValue.has(value)) byValue.set(value, { ...spell(value), fingerings: [] });
      byValue.get(value).fingerings.push({
        string,
        fret,
        finger: fret === 0 ? 0 : fret - position + 1
      });
    }
  });
  const all = [...byValue.values()].sort((a, b) => a.value - b.value);
  for (const p of all) p.fingerings.sort((a, b) => b.string - a.string);
  return all;
}

const cache = new Map();
const positionNotes = position => {
  if (!cache.has(position)) cache.set(position, buildPosition(position));
  return cache.get(position);
};

// The accidentals setting as one of its three values. Settings reach this
// module through sanitize, but a study saved before the setting had three
// values carries true or false, and may be looked at before it is sanitized:
// "on" meant sharps.
const spellingOf = accidentals => {
  if (accidentals === true) return 'sharps';
  return accidentals === 'sharps' || accidentals === 'flats' ? accidentals : 'none';
};

const onStrings = (notes, strings) => (strings.length === 6
  ? notes
  : notes
    .map(p => ({ ...p, fingerings: p.fingerings.filter(f => strings.includes(f.string)) }))
    .filter(p => p.fingerings.length > 0));

// Notes playable in a position on the enabled strings, lowest first, with
// fingerings narrowed to those strings. `accidentals` is 'none' (the natural
// notes only), 'sharps' (every note, the black keys written as sharps) or
// 'flats' (every note, the black keys written as flats).
export function poolFor(position, { accidentals, strings }) {
  const written = spellingOf(accidentals);
  let notes = positionNotes(position);
  if (written === 'flats') notes = notes.map(p => (p.alter === 0 ? p : respell(p, 'flat')));
  else if (written === 'none') notes = notes.filter(p => p.alter === 0);
  return onStrings(notes, strings);
}

// Every note of a position on the enabled strings, written as a key writes it
// (see spellInKey in theory.js, and inKey to tell the notes of its scale from
// the rest). `key` is a key from theory.js.
export function keyPool(position, { strings }, key) {
  const notes = positionNotes(position).map(p => ({ ...p, ...spellInKey(p.value, key) }));
  return onStrings(notes, strings);
}

// The notes a study with these settings can contain in a position. Random
// mode: as its accidentals setting says. Musical mode: the notes of the key,
// and with accidentals switched on the notes outside it too.
export function notePool(position, settings) {
  if (settings.melody !== 'musical') return poolFor(position, settings);
  const key = keyById(settings.key);
  const pool = keyPool(position, settings, key);
  return spellingOf(settings.accidentals) === 'none' ? pool.filter(p => inKey(key, p)) : pool;
}
