import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POSITION_NUMBERS, keyPool, notePool } from '../src/music/fretboard.js';
import { diatonicIndex, pitchName } from '../src/music/pitch.js';
import {
  DEFAULT_KEY, KEYS, degreeOf, inKey, keyAlter, keyById, spellInKey, spellToward
} from '../src/music/theory.js';
import { allNotes, scoreWith, seeds } from './helpers.js';

// Several tests read the same studies, so each is generated once. Nothing
// here changes a score it is given.
const built = new Map();
const musical = (overrides, seed) => {
  const id = JSON.stringify([overrides, seed]);
  if (!built.has(id)) built.set(id, scoreWith({ melody: 'musical', ...overrides }, seed));
  return built.get(id);
};

const ALL_VALUES = ['quarter', 'eighth', 'sixteenth'];
// The studies the chromatic tests read. Each is played in position I or in
// position V: the first has every semitone of its range, the second lacks
// four (in A minor, two of the notes of E, F sharp, G sharp, A).
const CHROMATIC = { accidentals: 'sharps', noteValues: ALL_VALUES, positions: [1, 5] };
const keyOf = score => keyById(score.key);
const isTonic = (key, pitch) => inKey(key, pitch) && degreeOf(pitch, key) === 0;
// What the pitch's own sign adds to (+1) or takes from (-1) its letter in the key.
const lift = (key, pitch) => pitch.alter - keyAlter(key, pitch.letter);
const TONIC_CHORD = [0, 2, 4];
const DOMINANT_CHORD = [4, 6, 1];

// Intervals between consecutive notes that the melodic rules govern: not the
// jump into a new position, and not the seam where a phrase begins.
const governedIntervals = score => {
  const notes = allNotes(score);
  const intervals = [];
  for (let i = 1; i < notes.length; i++) {
    const a = notes[i - 1];
    const b = notes[i];
    if (a.position !== b.position) continue;
    if (b.start === 0 && (b.measure - 1) % 4 === 0) continue;
    intervals.push(Math.abs(b.pitch.value - a.pitch.value));
  }
  return intervals;
};

test('musical mode is in the key its settings name; random mode has no key', () => {
  for (const key of KEYS) {
    const score = musical({ key: key.id }, 1);
    assert.equal(score.key, key.id);
    assert.equal(score.tonality, key.label);
  }
  const random = scoreWith({ key: 'D' }, 1);
  assert.equal(random.key, null);
  assert.equal(random.tonality, null);
});

test('settings that name no key on offer are played in the default key', () => {
  for (const key of ['H', undefined, null, 'C major']) {
    const score = scoreWith({ melody: 'musical', key }, 3);
    assert.equal(score.key, DEFAULT_KEY);
    assert.equal(score.tonality, keyById(DEFAULT_KEY).label);
    assert.deepEqual(score.measures, scoreWith({ melody: 'musical', key: DEFAULT_KEY }, 3).measures);
  }
});

test('with accidentals off, every note is a note of the scale, spelled as the key spells it', () => {
  for (const key of KEYS) {
    const letters = new Set();
    for (const seed of seeds(12)) {
      for (const n of allNotes(musical({ key: key.id, noteValues: ['quarter', 'eighth'] }, seed))) {
        assert.ok(inKey(key, n.pitch), `${key.label} seed ${seed}: ${pitchName(n.pitch)}`);
        assert.equal(pitchName(n.pitch), pitchName(spellInKey(n.pitch.value, key)));
        letters.add(n.pitch.letter);
      }
    }
    // All seven degrees are in use, the ones the signature alters included.
    assert.equal(letters.size, 7, key.label);
  }
});

test('a key signature changes which notes are in the scale, not only their names', () => {
  const names = key => new Set(seeds(12).flatMap(seed =>
    allNotes(musical({ key, noteValues: ['quarter', 'eighth'] }, seed)).map(n => n.pitch.letter + n.pitch.alter)));
  const d = names('D');
  assert.ok(d.has('F1') && d.has('C1') && !d.has('F0') && !d.has('C0'));
  const bFlat = names('Bb');
  assert.ok(bFlat.has('B-1') && bFlat.has('E-1') && !bFlat.has('B0') && !bFlat.has('E0'));
  const cSharpMinor = names('C#m');
  assert.deepEqual([...cSharpMinor].sort(), ['A0', 'B0', 'C1', 'D1', 'E0', 'F1', 'G1']);
});

test('no note ever leaves the key pool of its measure', () => {
  const strings = [4, 3, 2];
  for (const key of KEYS) {
    for (const accidentals of ['none', 'sharps']) {
      for (const seed of seeds(6)) {
        const score = musical({
          key: key.id, accidentals, positions: [2, 5, 10], rotatePositions: true, strings, noteValues: ALL_VALUES
        }, seed);
        for (const m of score.measures) {
          const pool = keyPool(m.position, { strings }, key);
          const allowed = notePool(m.position, score.settings);
          for (const { pitch } of m.notes) {
            const entry = pool.find(p => p.value === pitch.value);
            assert.ok(entry, `${key.label}: ${pitchName(pitch)} is not playable in position ${m.position}`);
            assert.ok(allowed.some(p => p.value === pitch.value));
            // A pitch and nothing more, fingered as the pool fingers it, on the enabled strings.
            assert.deepEqual(Object.keys(pitch).sort(), ['alter', 'fingerings', 'letter', 'octave', 'value']);
            assert.deepEqual(pitch.fingerings, entry.fingerings);
            assert.ok(pitch.fingerings.length > 0 && pitch.fingerings.every(f => strings.includes(f.string)));
            // A scale note is the pool's own object, name and all.
            if (inKey(key, pitch)) assert.deepEqual(pitch, entry);
          }
        }
      }
    }
  }
});

test('with accidentals on, notes from outside the key appear but stay a small minority', () => {
  for (const key of KEYS) {
    let chromatic = 0;
    let total = 0;
    for (const seed of seeds(40)) {
      const notes = allNotes(musical({ key: key.id, accidentals: 'sharps' }, seed));
      chromatic += notes.filter(n => !inKey(key, n.pitch)).length;
      total += notes.length;
    }
    const share = chromatic / total;
    assert.ok(share > 0.02 && share < 0.15, `${key.label}: chromatic share ${share.toFixed(3)}`);
  }
});

test('a note from outside the key resolves by semitone to a scale note and is spelled toward it', () => {
  const figures = new Map(KEYS.map(key => [key.id, 0]));
  for (const key of KEYS) {
    for (const seed of seeds(25)) {
      const notes = allNotes(musical({ key: key.id, ...CHROMATIC }, seed));
      notes.forEach((n, i) => {
        if (inKey(key, n.pitch)) return;
        const where = `${key.label} seed ${seed} note ${i} (${pitchName(n.pitch)})`;
        const next = notes[i + 1];
        assert.ok(next, `${where}: a chromatic note is never the last note`);
        const rise = next.pitch.value - n.pitch.value;

        if (!inKey(key, next.pitch)) {
          // The one exception: the raised sixth of a minor key, which climbs a
          // whole tone to the raised seventh on its way from the fifth degree
          // to the tonic.
          assert.equal(key.mode, 'minor', where);
          assert.deepEqual([degreeOf(n.pitch, key), lift(key, n.pitch)], [5, 1], where);
          assert.deepEqual([degreeOf(next.pitch, key), lift(key, next.pitch), rise], [6, 1, 2], where);
          const before = notes[i - 1].pitch;
          assert.ok(inKey(key, before) && degreeOf(before, key) === 4 && n.pitch.value - before.value === 2, where);
          const after = notes[i + 2].pitch;
          assert.ok(isTonic(key, after) && after.value - next.pitch.value === 1, where);
          figures.set(key.id, figures.get(key.id) + 1);
          return;
        }

        assert.equal(Math.abs(rise), 1, where);
        assert.equal(pitchName(n.pitch), pitchName(spellToward(n.pitch.value, next.pitch, key)), where);
        // On a neighbouring letter it is altered in the direction it moves; on
        // the resolution's own letter it cancels that letter's sign.
        const letters = diatonicIndex(next.pitch) - diatonicIndex(n.pitch);
        if (letters === 0) assert.equal(lift(key, n.pitch), -rise, where);
        else assert.deepEqual([letters, lift(key, n.pitch)], [rise, rise], where);
      });
    }
  }
  // The melodic minor figure is really written, in every minor key and in no major one.
  for (const key of KEYS) {
    if (key.mode === 'minor') assert.ok(figures.get(key.id) > 0, `${key.label}: no melodic minor figure`);
    else assert.equal(figures.get(key.id), 0);
  }
});

test('chromatic spelling follows the key: naturals in sharp keys, E sharp and B sharp as leading notes', () => {
  const chromaticNames = key => new Set(seeds(25).flatMap(seed =>
    allNotes(musical({ key, ...CHROMATIC }, seed))
      .filter(n => !inKey(keyById(key), n.pitch))
      .map(n => n.pitch.letter + n.pitch.alter)));
  // E major: four of its chromatic notes are white keys, written plain.
  const e = chromaticNames('E');
  for (const plain of ['F0', 'C0', 'G0', 'D0']) assert.ok(e.has(plain), `E major never wrote ${plain}`);
  assert.ok(!e.has('E1') && !e.has('B1'));
  // B flat major: B and E natural leave the key, and flats serve the falling notes.
  const bFlat = chromaticNames('Bb');
  assert.ok(bFlat.has('B0') && bFlat.has('E0') && bFlat.has('A-1'));
  // The leading note of a minor key is its seventh letter raised, awkward or not.
  assert.ok(chromaticNames('F#m').has('E1'));
  assert.ok(chromaticNames('C#m').has('B1'));
  assert.ok(chromaticNames('Am').has('G1'));
  assert.ok(chromaticNames('Gm').has('F1'));
});

test('chromatic notes avoid the strong beats and are approached by step from a scale note', () => {
  for (const key of KEYS) {
    for (const seed of seeds(25)) {
      const notes = allNotes(musical({ key: key.id, ...CHROMATIC }, seed));
      notes.forEach((n, i) => {
        if (inKey(key, n.pitch)) return;
        const before = notes[i - 1];
        assert.ok(before, 'a chromatic note is never the first note');
        if (!inKey(key, before.pitch)) return; // the raised seventh after the raised sixth
        const where = `${key.label} seed ${seed} note ${i}`;
        assert.notEqual(n.start % 8, 0, where);
        assert.ok(Math.abs(n.pitch.value - before.pitch.value) <= 2, where);
        // As written, too: never a diminished third (D sharp to F natural).
        assert.ok(Math.abs(diatonicIndex(n.pitch) - diatonicIndex(before.pitch)) <= 1,
          `${where}: ${pitchName(before.pitch)} to ${pitchName(n.pitch)}`);
      });
    }
  }
});

test('in musical mode "sharps" and "flats" both mean on: the key does the spelling', () => {
  for (const key of KEYS) {
    for (const seed of seeds(4)) {
      const settings = { key: key.id, noteValues: ['quarter', 'eighth'] };
      const sharps = musical({ ...settings, accidentals: 'sharps' }, seed);
      const flats = musical({ ...settings, accidentals: 'flats' }, seed);
      assert.deepEqual(flats.measures, sharps.measures);
      assert.notDeepEqual(musical({ ...settings, accidentals: 'none' }, seed).measures, sharps.measures);
    }
  }
});

test('the piece ends on the tonic, arriving by step', () => {
  // Arrival by step is counted, not required. Positions II to XII lack one
  // note between most pairs of strings (position V has no C sharp 4, F sharp
  // 4, B4 or G sharp 5), so in some keys a tonic has a neighbour on one side
  // only: nine studies in ten overall, and three in four in the worst key.
  let byStep = 0;
  let studies = 0;
  for (const key of KEYS) {
    let inThisKey = 0;
    const runs = seeds(30);
    for (const seed of runs) {
      const notes = allNotes(musical(seed % 2 === 0 ? { key: key.id, accidentals: 'sharps' } : { key: key.id }, seed));
      const last = notes[notes.length - 1].pitch;
      assert.ok(isTonic(key, last), `${key.label} seed ${seed} ends on ${pitchName(last)}`);
      const arrival = Math.abs(last.value - notes[notes.length - 2].pitch.value);
      if (arrival === 1 || arrival === 2) inThisKey++;
    }
    assert.ok(inThisKey >= 0.75 * runs.length, `${key.label}: ${inThisKey} of ${runs.length} arrive by step`);
    byStep += inThisKey;
    studies += runs.length;
  }
  assert.ok(byStep >= 0.9 * studies, `${byStep} of ${studies} arrive by step`);
});

test('phrases alternate open and closed cadences', () => {
  for (const key of KEYS) {
    for (const seed of seeds(20)) {
      // In quarter notes the note before a cadence stands on a strong beat,
      // where no chromatic note may; shorter values let one lead into it.
      const score = musical(seed % 2 === 0
        ? { key: key.id, accidentals: 'sharps', noteValues: ['eighth', 'sixteenth'] }
        : { key: key.id }, seed);
      const ending = measure => score.measures[measure - 1].notes.at(-1).pitch;
      for (const measure of [4, 12]) {
        // A half cadence: a note of the dominant chord, which has no tonic in it.
        assert.ok(inKey(key, ending(measure)));
        assert.ok(DOMINANT_CHORD.includes(degreeOf(ending(measure), key)),
          `${key.label} seed ${seed} measure ${measure}: ${pitchName(ending(measure))}`);
      }
      for (const measure of [8, 16]) {
        assert.ok(isTonic(key, ending(measure)),
          `${key.label} seed ${seed} measure ${measure}: ${pitchName(ending(measure))}`);
      }
    }
  }
});

test('the third phrase reopens like the first', () => {
  for (const key of KEYS) {
    for (const seed of seeds(10)) {
      const score = musical({ key: key.id }, seed);
      const values = m => score.measures[m - 1].notes.map(n => n.pitch.value);
      assert.deepEqual(values(9), values(1));
    }
  }
});

test('in every key melodic motion is mostly stepwise, with few wide leaps', () => {
  for (const key of KEYS) {
    let steps = 0;
    let wide = 0;
    let forbidden = 0;
    let total = 0;
    for (const seed of seeds(40)) {
      for (const semis of governedIntervals(musical({ key: key.id }, seed))) {
        total++;
        if (semis === 1 || semis === 2) steps++;
        if (semis >= 7) wide++;
        if (semis === 6 || semis === 10 || semis === 11 || semis > 12) forbidden++;
      }
    }
    assert.ok(steps / total > 0.55, `${key.label}: steps ${(steps / total).toFixed(2)}`);
    assert.ok(wide / total < 0.1, `${key.label}: fifths or wider ${(wide / total).toFixed(3)}`);
    assert.ok(forbidden / total < 0.005, `${key.label}: tritones and sevenths ${(forbidden / total).toFixed(4)}`);
  }
});

test('a key is the same music transposed: moving key and position together moves every note', () => {
  // Positions II to XII all have the same shape, so a study in D major in
  // position V has to be the study in C major in position III, a tone higher.
  // Nothing in the generator may depend on which notes happen to carry a sign.
  // E major and C sharp minor are left out: one figure of theirs (D sharp, E
  // sharp, F sharp) is never written, because E sharp is spelled F natural.
  const PAIRS = [
    ['C', 7, 'G', 2], ['C', 3, 'D', 5], ['C', 5, 'A', 2], ['C', 2, 'F', 7], ['C', 5, 'Bb', 3],
    ['Am', 7, 'Em', 2], ['Am', 3, 'Bm', 5], ['Am', 5, 'F#m', 2], ['Am', 2, 'Dm', 7], ['Am', 5, 'Gm', 3]
  ];
  for (const [from, fromPosition, to, toPosition] of PAIRS) {
    const shift = toPosition - fromPosition;
    for (const seed of seeds(5)) {
      const study = (id, position) => {
        const key = keyById(id);
        const settings = { key: id, positions: [position], accidentals: 'sharps', noteValues: ALL_VALUES };
        return allNotes(musical(settings, seed)).map(n => [n.pitch.value, inKey(key, n.pitch), n.start, n.dur]);
      };
      assert.deepEqual(
        study(to, toPosition).map(([value, ...rest]) => [value - shift, ...rest]),
        study(from, fromPosition),
        `${to} in position ${toPosition} against ${from} in position ${fromPosition}, seed ${seed}`);
    }
  }
});

test('sixteenth-note runs move by step or third', () => {
  for (const key of ['C', 'A', 'Bb', 'F#m', 'Dm']) {
    for (const seed of seeds(8)) {
      const notes = allNotes(musical({ key, noteValues: ['sixteenth'] }, seed));
      let wide = 0;
      for (let i = 1; i < notes.length; i++) {
        if (Math.abs(notes[i].pitch.value - notes[i - 1].pitch.value) > 4) wide++;
      }
      assert.ok(wide / notes.length < 0.03, `${key} seed ${seed}: ${wide} wide intervals`);
    }
  }
});

test('different exercises explore different registers of the position', () => {
  for (const key of ['C', 'E', 'Gm']) {
    const lows = seeds(40).map(seed => Math.min(...allNotes(musical({ key }, seed)).map(n => n.pitch.value)));
    assert.ok(Math.max(...lows) - Math.min(...lows) >= 7, key);
  }
});

test('the same seed and settings give the same musical score', () => {
  for (const key of ['C', 'E', 'Bb', 'C#m']) {
    const settings = { melody: 'musical', key, accidentals: 'sharps', noteValues: ALL_VALUES };
    assert.deepEqual(scoreWith(settings, 7), scoreWith(settings, 7));
    assert.notDeepEqual(scoreWith(settings, 7), scoreWith(settings, 8));
  }
  // The key is part of what a seed means.
  assert.notDeepEqual(
    scoreWith({ melody: 'musical', key: 'C' }, 7).measures, scoreWith({ melody: 'musical', key: 'G' }, 7).measures);
});

test('musical mode copes with the smallest pools: one string in any position, in any key', () => {
  const endings = { tonic: 0, chord: 0, scale: 0 };
  for (const key of KEYS) {
    for (const position of POSITION_NUMBERS) {
      for (const string of [6, 5, 4, 3, 2, 1]) {
        for (const accidentals of ['none', 'flats']) {
          const score = scoreWith({
            melody: 'musical', key: key.id, positions: [position], strings: [string], accidentals,
            noteValues: ALL_VALUES
          }, position * 10 + string);
          const where = `${key.label}, position ${position}, string ${string}, ${accidentals}`;
          assert.equal(score.measures.length, 16);
          const pool = keyPool(position, { strings: [string] }, key);
          const scale = pool.filter(p => inKey(key, p));
          for (const m of score.measures) {
            assert.equal(m.notes.reduce((sum, n) => sum + n.dur, 0), 16, where);
            for (const n of m.notes) {
              assert.ok(pool.some(p => p.value === n.pitch.value), where);
              if (accidentals === 'none') assert.ok(inKey(key, n.pitch), where);
            }
          }
          // The ending: the tonic if this string has one here; failing that
          // the third or fifth of the tonic chord; failing that a scale note.
          const last = allNotes(score).at(-1).pitch;
          assert.ok(inKey(key, last), where);
          if (scale.some(p => degreeOf(p, key) === 0)) {
            assert.equal(degreeOf(last, key), 0, where);
            endings.tonic++;
          } else if (scale.some(p => TONIC_CHORD.includes(degreeOf(p, key)))) {
            assert.ok(TONIC_CHORD.includes(degreeOf(last, key)), where);
            endings.chord++;
          } else {
            endings.scale++;
          }
        }
      }
    }
  }
  // All three endings were really met.
  assert.ok(endings.tonic > 0 && endings.chord > 0 && endings.scale > 0, JSON.stringify(endings));
});

test('musical mode works when every position rotates, in every key', () => {
  for (const key of KEYS) {
    for (const seed of seeds(4)) {
      const score = musical({
        key: key.id, positions: POSITION_NUMBERS, rotatePositions: true, accidentals: 'sharps',
        noteValues: ['quarter', 'eighth']
      }, seed);
      assert.equal(new Set(score.measures.slice(0, 12).map(m => m.position)).size, 12);
      for (const m of score.measures) {
        const pool = keyPool(m.position, score.settings, key);
        assert.ok(m.notes.every(n => pool.some(p => p.value === n.pitch.value)));
      }
      // Six strings always hold a tonic, whatever the position.
      assert.ok(isTonic(keyOf(score), allNotes(score).at(-1).pitch));
    }
  }
});
