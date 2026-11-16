import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POSITION_NUMBERS, keyPool, notePool, poolFor } from '../src/music/fretboard.js';
import {
  FLAT_ORDER, SHARP_ORDER, pitchName, signatureAlter, spellOnLetter, spellWithAlter, staffStep
} from '../src/music/pitch.js';
import { KEYS, inKey, keyAlter, keyById, signatureOf, spellInKey, spellToward } from '../src/music/theory.js';
import { settingsWith } from './helpers.js';

const ALL_STRINGS = [6, 5, 4, 3, 2, 1];
const name = spelling => (spelling ? pitchName(spelling) : null);
const pc = value => ((value % 12) + 12) % 12;

// Semitones above C of each natural letter.
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// The scale of a key as pitch classes, from its signature alone.
const scaleOf = key => Object.keys(NATURAL).map(letter => pc(NATURAL[letter] + keyAlter(key, letter)));

test('a spelling is a letter, its octave and one alteration; the value is what sounds', () => {
  assert.deepEqual(spellWithAlter(48, 0), { letter: 'C', octave: 4, alter: 0, value: 48 });
  assert.deepEqual(spellWithAlter(49, 1), { letter: 'C', octave: 4, alter: 1, value: 49 });
  assert.deepEqual(spellWithAlter(49, -1), { letter: 'D', octave: 4, alter: -1, value: 49 });
  // The octave belongs to the letter: B sharp 3 sounds as C4, C flat 4 as B3.
  assert.deepEqual(spellWithAlter(48, 1), { letter: 'B', octave: 3, alter: 1, value: 48 });
  assert.deepEqual(spellWithAlter(47, -1), { letter: 'C', octave: 4, alter: -1, value: 47 });
  assert.deepEqual(spellWithAlter(53, 1), { letter: 'E', octave: 4, alter: 1, value: 53 });
  // A black key has no plain spelling, and a white key next to two black ones no altered one.
  assert.equal(spellWithAlter(49, 0), null);
  assert.equal(spellWithAlter(50, 1), null);
  assert.equal(spellWithAlter(50, -1), null);
  // B sharp 3 sits on the staff one step under C4.
  assert.equal(staffStep(spellWithAlter(48, 1)), staffStep(spellWithAlter(48, 0)) - 1);
});

test('a value is spelled on a named letter when one sharp or flat will do', () => {
  assert.equal(name(spellOnLetter(54, 'F')), 'F♯4');
  assert.equal(name(spellOnLetter(54, 'G')), 'G♭4');
  assert.equal(name(spellOnLetter(48, 'B')), 'B♯3');
  assert.equal(name(spellOnLetter(47, 'C')), 'C♭4');
  assert.equal(name(spellOnLetter(52, 'E')), 'E4');
  assert.equal(spellOnLetter(54, 'E'), null); // would be a double sharp
  assert.equal(spellOnLetter(54, 'A'), null);
});

test('key signatures add sharps and flats in the traditional order', () => {
  assert.deepEqual(SHARP_ORDER, ['F', 'C', 'G', 'D', 'A', 'E', 'B']);
  assert.deepEqual(FLAT_ORDER, ['B', 'E', 'A', 'D', 'G', 'C', 'F']);
  assert.deepEqual(['F', 'C', 'G', 'D'].map(l => signatureAlter(2, l)), [1, 1, 0, 0]);
  assert.deepEqual(['B', 'E', 'A', 'F'].map(l => signatureAlter(-2, l)), [-1, -1, 0, 0]);
  for (const letter of 'CDEFGAB') assert.equal(signatureAlter(0, letter), 0);
});

test('every key on offer has the scale its name says', () => {
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const MINOR = [0, 2, 3, 5, 7, 8, 10];
  assert.equal(KEYS.length, 14);
  assert.equal(new Set(KEYS.map(key => key.id)).size, 14);
  for (const key of KEYS) {
    assert.equal(keyById(key.id), key);
    const tonic = pc(NATURAL[key.tonic] + keyAlter(key, key.tonic));
    const steps = key.mode === 'major' ? MAJOR : MINOR;
    assert.deepEqual(scaleOf(key).sort((a, b) => a - b), steps.map(s => pc(tonic + s)).sort((a, b) => a - b), key.label);
    // The label names the tonic as the key writes it.
    const sign = { 1: '♯', 0: '', [-1]: '♭' }[keyAlter(key, key.tonic)];
    assert.equal(key.label, `${key.tonic}${sign} ${key.mode}`);
    assert.ok(key.signature >= -2 && key.signature <= 4);
  }
  assert.equal(keyById('H'), null);
  assert.equal(signatureOf(null), 0);
});

test('a key writes each note of its scale on that note’s own letter', () => {
  for (const key of KEYS) {
    const scale = scaleOf(key);
    for (let value = 40; value <= 79; value++) {
      const spelling = spellInKey(value, key);
      assert.equal(spelling.value, value);
      assert.equal(inKey(key, spelling), scale.includes(pc(value)), `${key.label} ${value}`);
      assert.ok(Math.abs(spelling.alter) <= 1);
    }
  }
  const names = (key, values) => values.map(v => name(spellInKey(v, keyById(key))));
  assert.deepEqual(names('E', [52, 54, 56, 57, 59, 61, 63]), ['E4', 'F♯4', 'G♯4', 'A4', 'B4', 'C♯5', 'D♯5']);
  assert.deepEqual(names('Bb', [58, 60, 62, 63, 65, 67, 69]), ['B♭4', 'C5', 'D5', 'E♭5', 'F5', 'G5', 'A5']);
});

test('outside the scale: raised sixth and seventh in minor, plain white keys, then sharps or flats by signature', () => {
  const names = (key, values) => values.map(v => name(spellInKey(v, keyById(key))));
  assert.deepEqual(names('Am', [54, 56]), ['F♯4', 'G♯4']);
  assert.deepEqual(names('Dm', [59, 61]), ['B4', 'C♯5']);
  assert.deepEqual(names('Gm', [52, 54]), ['E4', 'F♯4']);
  assert.deepEqual(names('F#m', [51, 53]), ['D♯4', 'E♯4']);
  assert.deepEqual(names('C#m', [58, 60]), ['A♯4', 'B♯4']);
  // E major: the white keys outside it are plain, the one black key a sharp.
  assert.deepEqual(names('E', [48, 50, 53, 55, 58]), ['C4', 'D4', 'F4', 'G4', 'A♯4']);
  // B flat major: flats for the black keys outside it.
  assert.deepEqual(names('Bb', [49, 54, 56, 59, 52]), ['D♭4', 'G♭4', 'A♭4', 'B4', 'E4']);
  assert.deepEqual(names('C', [49, 51, 54, 56, 58]), ['C♯4', 'D♯4', 'F♯4', 'G♯4', 'A♯4']);
});

test('a note from outside the scale is spelled toward the note it moves to', () => {
  const toward = (key, value, resolution) => {
    const k = keyById(key);
    return name(spellToward(value, spellInKey(resolution, k), k));
  };
  // Up: the letter below, raised. Down: the letter above, lowered.
  assert.equal(toward('C', 56, 57), 'G♯4');
  assert.equal(toward('C', 58, 57), 'B♭4');
  assert.equal(toward('G', 49, 50), 'C♯4');
  assert.equal(toward('F', 59, 60), 'B4');   // B natural up to C
  assert.equal(toward('G', 53, 52), 'F4');   // F natural down to E
  // No double sharps, and none of E sharp, B sharp, C flat, F flat: the
  // resolution's own letter is used instead, with its sign cancelled.
  assert.equal(toward('A', 55, 56), 'G4');   // not F double sharp
  assert.equal(toward('D', 53, 54), 'F4');   // not E sharp
  assert.equal(toward('E', 48, 49), 'C4');   // not B sharp
  assert.equal(toward('F', 59, 58), 'B4');   // not C flat
  assert.equal(toward('Bb', 52, 51), 'E4');  // not F flat
  // ... except for the leading note of a minor key, always the seventh letter raised.
  assert.equal(toward('F#m', 53, 54), 'E♯4');
  assert.equal(toward('C#m', 48, 49), 'B♯3');
  assert.equal(toward('Am', 56, 57), 'G♯4');
  assert.equal(toward('Dm', 49, 50), 'C♯4');
  assert.equal(toward('Gm', 54, 55), 'F♯4');
});

test('every note outside a scale has a spelling toward each neighbour in the scale', () => {
  for (const key of KEYS) {
    const scale = scaleOf(key);
    for (let value = 40; value <= 79; value++) {
      if (scale.includes(pc(value))) continue;
      for (const dir of [1, -1]) {
        if (!scale.includes(pc(value + dir))) continue;
        const resolution = spellInKey(value + dir, key);
        const spelling = spellToward(value, resolution, key);
        assert.ok(spelling, `${key.label}: ${value} toward ${value + dir}`);
        assert.equal(spelling.value, value);
        assert.ok(Math.abs(spelling.alter) <= 1);
        assert.ok(!inKey(key, spelling), `${key.label}: ${name(spelling)} reads as a note of the key`);
        // On a neighbouring letter it is altered in the direction it moves;
        // on the resolution's own letter it cancels that letter's sign.
        const lift = spelling.alter - keyAlter(key, spelling.letter);
        if (spelling.letter === resolution.letter) assert.equal(lift, -dir);
        else assert.equal(lift, dir);
      }
    }
  }
});

test('a pool is natural notes, or every note with its black keys as sharps or as flats', () => {
  for (const position of POSITION_NUMBERS) {
    const sharps = poolFor(position, { accidentals: 'sharps', strings: ALL_STRINGS });
    const flats = poolFor(position, { accidentals: 'flats', strings: ALL_STRINGS });
    const none = poolFor(position, { accidentals: 'none', strings: ALL_STRINGS });
    assert.deepEqual(flats.map(p => p.value), sharps.map(p => p.value));
    assert.ok(sharps.every(p => p.alter >= 0) && sharps.some(p => p.alter === 1));
    assert.ok(flats.every(p => p.alter <= 0) && flats.some(p => p.alter === -1));
    assert.deepEqual(none, sharps.filter(p => p.alter === 0));
    assert.deepEqual(flats.filter(p => p.alter === 0), none);
    // Only the spelling differs: the fingerings are the same.
    flats.forEach((p, i) => assert.deepEqual(p.fingerings, sharps[i].fingerings));
  }
});

test('a key pool holds every note of the position, spelled for the key and marked in or out', () => {
  for (const key of KEYS) {
    for (const position of [1, 5, 12]) {
      const all = poolFor(position, { accidentals: 'sharps', strings: ALL_STRINGS });
      const pool = keyPool(position, { strings: ALL_STRINGS }, key);
      assert.deepEqual(pool.map(p => p.value), all.map(p => p.value));
      pool.forEach((p, i) => {
        // A pitch and nothing more: these objects go straight into a Score.
        assert.deepEqual(Object.keys(p).sort(), ['alter', 'fingerings', 'letter', 'octave', 'value']);
        assert.deepEqual(p.fingerings, all[i].fingerings);
        assert.equal(name(p), name(spellInKey(p.value, key)));
      });
      assert.ok(pool.filter(p => inKey(key, p)).length >= 7);
    }
  }
  const few = keyPool(5, { strings: [1] }, keyById('D'));
  const d = keyById('D');
  assert.deepEqual(few.map(p => [name(p), inKey(d, p)]), [['A5', true], ['A♯5', false], ['B5', true], ['C6', false]]);
});

test('the notes a study can contain follow its mode, key and accidentals', () => {
  const values = pool => pool.map(p => p.value);
  const random = accidentals => notePool(5, settingsWith({ accidentals }));
  assert.deepEqual(random('sharps'), poolFor(5, { accidentals: 'sharps', strings: ALL_STRINGS }));
  assert.deepEqual(random('flats'), poolFor(5, { accidentals: 'flats', strings: ALL_STRINGS }));
  assert.deepEqual(random('none'), poolFor(5, { accidentals: 'none', strings: ALL_STRINGS }));

  const inD = notePool(5, settingsWith({ melody: 'musical', key: 'D' }));
  assert.ok(inD.every(p => inKey(keyById('D'), p)));
  assert.ok(inD.some(p => name(p).startsWith('F♯')) && inD.some(p => name(p).startsWith('C♯')));
  const chromatic = notePool(5, settingsWith({ melody: 'musical', key: 'D', accidentals: 'sharps' }));
  assert.deepEqual(values(chromatic), values(random('sharps')));
  // In Musical mode "sharps" and "flats" both just mean on: the key does the spelling.
  assert.deepEqual(notePool(5, settingsWith({ melody: 'musical', key: 'D', accidentals: 'flats' })), chromatic);

  // Settings from before the setting had three values: on meant sharps, and
  // anything unknown means none.
  assert.deepEqual(random(true), random('sharps'));
  assert.deepEqual(random(false), random('none'));
  assert.deepEqual(random(undefined), random('none'));
  assert.deepEqual(notePool(5, settingsWith({ melody: 'musical', key: 'D', accidentals: true })), chromatic);
  assert.deepEqual(notePool(5, settingsWith({ melody: 'musical', key: 'D', accidentals: false })), inD);
});
