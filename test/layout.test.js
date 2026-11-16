import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTLINES, UNITS_PER_EM } from '../src/export/glyph-outlines.js';
import { keyPool } from '../src/music/fretboard.js';
import { spell, spellWithAlter, staffStep } from '../src/music/pitch.js';
import { KEYS, inKey, keyById, signatureOf } from '../src/music/theory.js';
import { GLYPH_SIZE, METRICS, SPACE } from '../src/render/glyphs.js';
import {
  PAGE, beamGroups, layoutScore, placeKeySignature, placeNote, resolveAccidentals, singleStem, viewWidthFor
} from '../src/render/layout.js';
import { scoreWith, seeds, settingsWith } from './helpers.js';

const HEAD = METRICS.noteheadWidth * SPACE;
const note = (value, prefer) => ({ pitch: spell(value, prefer) });
const systemNotes = system => system.bars.flatMap(bar => bar.notes);

const DENSE = { noteValues: ['sixteenth'], accidentals: 'sharps' };
const VARIED = [
  {},
  { noteValues: ['eighth'] },
  DENSE,
  { noteValues: ['quarter', 'eighth', 'sixteenth'], accidentals: 'sharps', melody: 'musical' },
  { noteValues: ['eighth', 'sixteenth'], positions: [1, 7, 12], rotatePositions: true }
];
const WIDTHS = [480, 640, 800, 960];

// ---- Scores in a key --------------------------------------------------------

// The generator for keys is another module's work, so these tests put a
// generated score into a key by hand. Every note keeps its value, its rhythm
// and its fingerings, and takes the spelling the key gives it (keyPool): a
// score drawn from all twelve notes then has notes inside the key and outside
// it. With `chromatic: false` each note from outside the key is first moved to
// the nearest note of the key, so that no note needs a sign.
function inKeyOf(score, keyId, { chromatic = true } = {}) {
  const key = keyById(keyId);
  const measures = score.measures.map(measure => {
    const pool = keyPool(measure.position, { strings: score.settings.strings }, key);
    const scale = pool.filter(p => inKey(key, p));
    const nearest = value => scale.reduce((best, p) =>
      (Math.abs(p.value - value) < Math.abs(best.value - value) ? p : best));
    return {
      ...measure,
      notes: measure.notes.map(n => {
        const spelled = pool.find(p => p.value === n.pitch.value);
        return { ...n, pitch: chromatic || inKey(key, spelled) ? spelled : nearest(n.pitch.value) };
      })
    };
  });
  return { ...score, key: keyId, tonality: key.label, measures };
}

// A sharp key, a flat key and the two keys of four sharps, each with notes
// from outside the key: the studies every check of a whole layout also runs on.
const KEYED = [
  ['D', { noteValues: ['quarter', 'eighth'], accidentals: 'sharps' }],
  ['Gm', { noteValues: ['eighth', 'sixteenth'], accidentals: 'flats', positions: [1, 7, 12], rotatePositions: true }],
  ['E', DENSE],
  ['C#m', DENSE]
];
// Each makes the score of a seed.
const STUDIES = [
  ...VARIED.map(overrides => seed => scoreWith(overrides, seed)),
  ...KEYED.map(([keyId, overrides]) => seed => inKeyOf(scoreWith(overrides, seed), keyId))
];

const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// The pitch a name says: 'F#4', 'Bb3', 'C5', and also 'B#3' or 'Cb4'.
function named(name) {
  const [, letter, mark, octave] = /^([A-G])([#b]?)(\d)$/.exec(name);
  const alter = { '#': 1, b: -1, '': 0 }[mark];
  const pitch = spellWithAlter(Number(octave) * 12 + SEMITONES[letter] + alter, alter);
  assert.equal(pitch.letter + pitch.octave, letter + octave);
  return pitch;
}
// The signs a measure of these notes needs under a signature.
const signsFor = (names, signature) => resolveAccidentals(names.map(name => ({ pitch: named(name) })), signature);

// A score written out by hand, four quarter notes to the measure.
function handMade(bars, key = null) {
  const measures = bars.map((names, i) => ({
    number: i + 1,
    position: 5,
    notes: names.map((name, k) => ({ pitch: named(name), start: 4 * k, dur: 4 }))
  }));
  return { seed: 1, settings: settingsWith({}), key, tonality: key && keyById(key).label, measures };
}

// What every key's signature must show: the kind of sign and how many.
const SIGNATURE = {
  C: ['sharp', 0], G: ['sharp', 1], D: ['sharp', 2], A: ['sharp', 3], E: ['sharp', 4],
  F: ['flat', 1], Bb: ['flat', 2],
  Am: ['sharp', 0], Em: ['sharp', 1], Bm: ['sharp', 2], 'F#m': ['sharp', 3], 'C#m': ['sharp', 4],
  Dm: ['flat', 1], Gm: ['flat', 2]
};
// Where the signs of a signature stand on a treble staff, in the order they
// are added: as notes, and as steps above the bottom line (E4 is 0).
const SIGN_NOTES = {
  sharp: ['F5', 'C5', 'G5', 'D5', 'A4', 'E5', 'B4'],
  flat: ['B4', 'E5', 'A4', 'D5', 'G4', 'C5', 'F4']
};
const SIGN_STEPS = { sharp: [8, 5, 9, 6, 3, 7, 4], flat: [4, 7, 3, 6, 2, 5, 1] };

// The spacing of a signature, restated so that a change to it has to be meant.
const CLEF_INSET = 0.45 * SPACE; // left end of the staff to the clef
const KEY_AFTER_CLEF = SPACE;    // right edge of the clef to the first sign
const KEY_TRAIL = SPACE;         // last sign to the time signature's room, or to the first measure
// The spacing table (staff spaces by duration in sixteenths), and how far a
// system may be squeezed.
const ADVANCE = { 1: 2.0 * SPACE, 2: 2.5 * SPACE, 4: 3.5 * SPACE };
const MIN_STRETCH = 0.8;

// Where the ink of a glyph lies, in layout units (y down), when it is drawn
// with its origin at x, y: from Bravura's own bounding boxes.
const UNIT = GLYPH_SIZE / UNITS_PER_EM;
function inkOf(name, x, y) {
  const [x1, y1, x2, y2] = OUTLINES[name].bbox;
  return { left: x + x1 * UNIT, right: x + x2 * UNIT, top: y - y2 * UNIT, bottom: y - y1 * UNIT };
}
const widthOf = name => OUTLINES[name].advance * UNIT;
// The marks at the head of a system, as draw.js draws them.
const clefInk = system => inkOf('gClef', system.clefX, system.bottom - SPACE);
const signInks = system => system.keySignature.map(k => inkOf(k.sign, k.x, k.y));
const timeInk = system => inkOf('timeSig4', system.timeX - widthOf('timeSig4') / 2, system.top + SPACE);
// The left edge of everything a note draws: its head, the ledger lines that
// pass it, and its accidental, which ends a quarter of a space before the head.
function noteLeft(placed) {
  const head = placed.x - HEAD / 2;
  const ledger = placed.ledgers.length ? head - METRICS.ledgerExtension * SPACE : head;
  const sign = placed.accidental ? head - 0.25 * SPACE - widthOf(placed.accidental) : head;
  return Math.min(head, ledger, sign);
}
const close = (a, b) => Math.abs(a - b) < 1e-9;

// ---- Accidentals ------------------------------------------------------------

test('an accidental is written once per measure, and cancelled with a natural', () => {
  // F#4, F#4, F4, G4, Gb4 (same line as G), G4
  const notes = [note(54), note(54), note(53), note(55), note(54, 'flat'), note(55)];
  assert.deepEqual(resolveAccidentals(notes), ['sharp', null, 'natural', null, 'flat', 'natural']);
});

test('an accidental applies only to its own octave', () => {
  assert.deepEqual(resolveAccidentals([note(54), note(66), note(54)]), ['sharp', 'sharp', null]);
});

test('a note of the key needs no sign, and a note that leaves the key needs its own', () => {
  // D major: F sharp and C sharp.
  assert.deepEqual(signsFor(['F#4', 'C#5', 'D4', 'G4'], 2), [null, null, null, null]);
  assert.deepEqual(signsFor(['F4', 'C5'], 2), ['natural', 'natural']);
  assert.deepEqual(signsFor(['G#4', 'Bb4', 'A#4'], 2), ['sharp', 'flat', 'sharp']);
  // B flat major: B flat and E flat.
  assert.deepEqual(signsFor(['Bb4', 'Eb5', 'F4'], -2), [null, null, null]);
  assert.deepEqual(signsFor(['B4', 'E5', 'Ab4', 'F#4'], -2), ['natural', 'natural', 'flat', 'sharp']);
  // A signature reaches its own letters only: in G major C sharp is marked.
  assert.deepEqual(signsFor(['F#4', 'C#5', 'C5'], 1), [null, 'sharp', 'natural']);
  assert.deepEqual(signsFor(['Bb4', 'Eb5', 'E5'], -1), [null, 'flat', 'natural']);
  // The same notes with no signature, given or left out: every altered note is marked.
  assert.deepEqual(signsFor(['F#4', 'C#5', 'D4', 'G4']), ['sharp', 'sharp', null, null]);
  assert.deepEqual(signsFor(['Bb4', 'Eb5', 'F4'], 0), ['flat', 'flat', null]);
});

test('a sign holds to the barline, and going back to the key takes the sharp or flat again', () => {
  // F natural, again, then the F sharp of the signature, again, and away once more.
  assert.deepEqual(signsFor(['F4', 'F4', 'F#4', 'F#4', 'F4'], 2), ['natural', null, 'sharp', null, 'natural']);
  assert.deepEqual(signsFor(['B4', 'Bb4', 'Bb4', 'B4'], -1), ['natural', 'flat', null, 'natural']);
  // A sign from outside the key is cancelled by a natural, as it is without a key.
  assert.deepEqual(signsFor(['G#4', 'G#4', 'G4', 'G#4'], 2), ['sharp', null, 'natural', 'sharp']);
  assert.deepEqual(signsFor(['Ab4', 'A4', 'A4'], -2), ['flat', 'natural', null]);
  // A flat on a letter the signature sharpens, and back.
  assert.deepEqual(signsFor(['Gb4', 'G#4', 'G4'], 3), ['flat', 'sharp', 'natural']);
});

test('the signature holds in every octave, a sign beside a note only in its own', () => {
  assert.deepEqual(signsFor(['F#3', 'F#4', 'F#5'], 2), [null, null, null]);
  assert.deepEqual(signsFor(['Bb3', 'Eb4', 'Bb4', 'Eb5'], -2), [null, null, null, null]);
  // F natural 4 changes nothing for F sharp 5 or F sharp 3.
  assert.deepEqual(
    signsFor(['F4', 'F#5', 'F5', 'F#4', 'F#5', 'F#3'], 2),
    ['natural', null, 'natural', 'sharp', 'sharp', null]);
  assert.deepEqual(signsFor(['B4', 'Bb3', 'B3', 'Bb4'], -1), ['natural', null, 'natural', 'flat']);
});

test('at the barline the signature is in force again', () => {
  const bars = [['F4', 'F#4', 'C5', 'C5'], ['F#4', 'C#5', 'F4', 'F4'], ['C5', 'F#5', 'F#4', 'C#5']];
  const signs = score => layoutScore(score, 960).systems
    .flatMap(system => system.bars)
    .map(bar => bar.notes.map(n => n.accidental));
  assert.deepEqual(signs(handMade(bars, 'D')), [
    ['natural', 'sharp', 'natural', null],
    [null, null, 'natural', null],
    ['natural', null, null, 'sharp']
  ]);
  // The same notes without a key: the sharps are written out, measure by measure.
  assert.deepEqual(signs(handMade(bars)), [
    [null, 'sharp', null, null],
    ['sharp', 'sharp', 'natural', null],
    [null, 'sharp', 'sharp', 'sharp']
  ]);
});

test('every sign of a keyed layout is the one the rule gives, and has its room', () => {
  let signs = 0;
  for (const [keyId, overrides] of KEYED) {
    for (const seed of seeds(4)) {
      const score = inKeyOf(scoreWith(overrides, seed), keyId);
      const signature = signatureOf(keyById(keyId));
      const bars = layoutScore(score, 800).systems.flatMap(system => system.bars);
      bars.forEach((bar, i) => {
        assert.deepEqual(bar.notes.map(n => n.accidental), resolveAccidentals(score.measures[i].notes, signature));
        bar.notes.forEach((n, k) => {
          // The sign says the note's own alteration, never the signature's.
          if (n.accidental) assert.equal(n.accidental, { 1: 'sharp', 0: 'natural', [-1]: 'flat' }[n.pitch.alter]);
          if (n.accidental && k > 0) assert.ok(n.x - bar.notes[k - 1].x >= HEAD + SPACE);
          signs += n.accidental ? 1 : 0;
        });
      });
      // A study that stays in its key has no sign beside any note; the same
      // notes without the signature need theirs written out.
      const diatonic = inKeyOf(scoreWith(overrides, seed), keyId, { chromatic: false });
      const marked = study => layoutScore(study, 800).systems.flatMap(systemNotes).filter(n => n.accidental).length;
      assert.equal(marked(diatonic), 0);
      assert.ok(marked({ ...diatonic, key: null }) > 0, `${keyId}, seed ${seed}`);
    }
  }
  assert.ok(signs > 500);
});

test('B sharp, E sharp and C flat are written on their own letter', () => {
  const bottom = 100;
  // B sharp 3, the leading note of C sharp minor, sounds as C4 and is written
  // on B: under the ledger line that C4 sits on.
  const bSharp = named('B#3');
  assert.equal(bSharp.value, named('C4').value);
  assert.equal(placeNote(bSharp, 0, bottom).steps, staffStep(named('B3')));
  assert.equal(placeNote(bSharp, 0, bottom).y, bottom + 1.5 * SPACE);
  assert.deepEqual(placeNote(bSharp, 0, bottom).ledgers, [bottom + SPACE]);
  assert.equal(placeNote(named('C4'), 0, bottom).y, bottom + SPACE);
  // It is outside the signature of four sharps, and says nothing about C.
  assert.deepEqual(
    signsFor(['B#3', 'C#4', 'B#3', 'C4', 'B3', 'B#3'], 4),
    ['sharp', null, null, 'natural', 'natural', 'sharp']);

  // E sharp 4, the leading note of F sharp minor, sounds as F4 and is written
  // on the bottom line.
  const eSharp = named('E#4');
  assert.equal(eSharp.value, named('F4').value);
  assert.equal(placeNote(eSharp, 0, bottom).y, bottom);
  assert.equal(placeNote(named('F4'), 0, bottom).y, bottom - SPACE / 2);
  assert.deepEqual(signsFor(['E#4', 'F#4', 'E4', 'F4', 'E#4'], 3), ['sharp', null, 'natural', 'natural', 'sharp']);

  // C flat 4 sounds as B3 and is written on C's ledger line.
  const cFlat = named('Cb4');
  assert.equal(cFlat.value, named('B3').value);
  assert.equal(placeNote(cFlat, 0, bottom).y, bottom + SPACE);
  assert.deepEqual(signsFor(['Cb4', 'Bb3', 'B3', 'C4', 'Cb4'], -2), ['flat', null, 'natural', 'natural', 'flat']);
});

// ---- Key signature ----------------------------------------------------------

test('the widths a signature is spaced by are Bravura\'s own', () => {
  const inSpaces = units => units / (UNITS_PER_EM / 4);
  for (const [metric, glyph] of [['gClefWidth', 'gClef'], ['sharpWidth', 'sharp'], ['flatWidth', 'flat']]) {
    const { advance, bbox } = OUTLINES[glyph];
    assert.equal(METRICS[metric], inSpaces(advance), metric);
    // The glyph fills its advance, so the advance is also the width of its ink.
    assert.deepEqual([bbox[0], bbox[2]], [0, advance], glyph);
  }
});

test('the signs of a signature stand on the lines and spaces of the treble staff, in order', () => {
  const bottom = 100;
  for (const sign of ['sharp', 'flat']) {
    const all = placeKeySignature(sign === 'sharp' ? 7 : -7, 20, bottom);
    assert.deepEqual(all.map(k => k.sign), Array(7).fill(sign));
    assert.deepEqual(all.map(k => (bottom - k.y) / (SPACE / 2)), SIGN_STEPS[sign]);
    // The height of a note of that name, which is how an accidental is placed.
    assert.deepEqual(all.map(k => k.y), SIGN_NOTES[sign].map(name => placeNote(named(name), 0, bottom).y));
    // Left to right from where the signature starts, edge to edge.
    all.forEach((k, i) => assert.ok(close(k.x, 20 + i * widthOf(sign))));
    // A shorter signature is the start of a longer one.
    for (let count = 0; count <= 7; count++) {
      assert.deepEqual(placeKeySignature(sign === 'sharp' ? count : -count, 20, bottom), all.slice(0, count));
    }
  }
  assert.deepEqual(placeKeySignature(0, 20, bottom), []);
});

test('every key shows its signature: the right signs at the right heights', () => {
  assert.deepEqual(Object.keys(SIGNATURE).sort(), KEYS.map(key => key.id).sort());
  for (const key of KEYS) {
    const [sign, count] = SIGNATURE[key.id];
    assert.equal(signatureOf(key), sign === 'sharp' ? count : -count);
    for (const width of [480, 960]) {
      const layout = layoutScore(inKeyOf(scoreWith({ noteValues: ['quarter', 'eighth'] }, 2), key.id), width);
      for (const system of layout.systems) {
        const signs = system.keySignature;
        assert.deepEqual(signs.map(k => k.sign), Array(count).fill(sign), key.label);
        assert.deepEqual(
          signs.map(k => (system.bottom - k.y) / (SPACE / 2)), SIGN_STEPS[sign].slice(0, count), key.label);
        signs.forEach((k, i) => {
          assert.equal(k.y, placeNote(named(SIGN_NOTES[sign][i]), 0, system.bottom).y);
          // One space after the clef, then edge to edge.
          assert.ok(close(k.x, clefInk(system).right + KEY_AFTER_CLEF + i * widthOf(sign)), key.label);
        });
      }
    }
  }
  // Said outright for the two ends of the list, E major and B flat major, as
  // distances below the top line.
  const [sharps] = layoutScore(inKeyOf(scoreWith({}, 1), 'E'), 960).systems;
  assert.deepEqual(
    sharps.keySignature.map(k => [k.sign, k.y - sharps.top]),
    [['sharp', 0], ['sharp', 1.5 * SPACE], ['sharp', -0.5 * SPACE], ['sharp', SPACE]]); // F5 C5 G5 D5
  const [flats] = layoutScore(inKeyOf(scoreWith({}, 1), 'Bb'), 960).systems;
  assert.deepEqual(
    flats.keySignature.map(k => [k.sign, k.y - flats.top]),
    [['flat', 2 * SPACE], ['flat', 0.5 * SPACE]]); // B4 E5
});

test('without a key there is no signature, and the layout is what it was before keys', () => {
  for (const overrides of VARIED) {
    for (const width of WIDTHS) {
      const { key, ...bare } = scoreWith(overrides, 4); // a study saved before keys existed has no key at all
      const reference = layoutScore(bare, width);
      for (const system of reference.systems) assert.deepEqual(system.keySignature, []);
      // No key, a key without sharps or flats, and a key nobody offers.
      for (const id of [null, undefined, 'C', 'Am', 'H']) {
        assert.deepEqual(layoutScore({ ...bare, key: id }, width), reference);
      }
    }
  }
  // The measures start where the clef's room ends, or the time signature's.
  const layout = layoutScore(scoreWith({}, 1), 960);
  assert.equal(layout.systems[0].clefX, PAGE.left + CLEF_INSET);
  assert.equal(layout.systems[0].bars[0].x0, PAGE.left + PAGE.clefWidth + PAGE.timeWidth);
  assert.equal(layout.systems[1].bars[0].x0, PAGE.left + PAGE.clefWidth);
  assert.equal(layout.systems[0].timeX, PAGE.left + PAGE.clefWidth + 0.9 * SPACE);
});

test('the signature is on every system, the time signature on the first only', () => {
  for (const [keyId, overrides] of KEYED) {
    for (const width of WIDTHS) {
      const layout = layoutScore(inKeyOf(scoreWith(overrides, 3), keyId), width);
      assert.ok(layout.systems.length >= 4);
      const [first] = layout.systems;
      const shape = system => system.keySignature.map(k => [k.sign, k.x, k.y - system.top]);
      assert.equal(first.keySignature.length, Math.abs(signatureOf(keyById(keyId))));
      layout.systems.forEach((system, s) => {
        assert.deepEqual(shape(system), shape(first));
        assert.equal(system.timeX === null, s > 0);
      });
    }
  }
});

test('clef, signature, time signature and first note stand apart, in that order, at every width', () => {
  const fourSharps = [['E', DENSE], ['C#m', DENSE]];
  for (const [keyId, overrides] of [...fourSharps, ...KEYED]) {
    for (const width of [480, 700, 960]) {
      for (const seed of seeds(5)) {
        const layout = layoutScore(inKeyOf(scoreWith(overrides, seed + 10), keyId), width);
        const at = `${keyId} at ${width}, seed ${seed + 10}`;
        assert.ok(layout.width >= width);
        layout.systems.forEach((system, s) => {
          const clef = clefInk(system);
          const signs = signInks(system);
          const first = noteLeft(system.bars[0].notes[0]);
          assert.ok(signs.length > 0);
          assert.ok(clef.left >= PAGE.left);
          assert.ok(signs[0].left - clef.right >= SPACE - 1e-9, `${at}: the signature crowds the clef`);
          for (let i = 1; i < signs.length; i++) {
            assert.ok(signs[i].left >= signs[i - 1].right - 1e-9, `${at}: two signs overlap`);
          }
          const last = signs.at(-1);
          if (s === 0) {
            const time = timeInk(system);
            assert.ok(time.left - last.right >= SPACE - 1e-9, `${at}: the time signature crowds the signature`);
            assert.ok(first - time.right >= SPACE - 1e-9, `${at}: the first note crowds the time signature`);
          } else {
            assert.ok(first - last.right >= SPACE - 1e-9, `${at}: the first note crowds the signature`);
          }
          // The measures begin where the signature's room ends.
          const start = last.right + KEY_TRAIL + (s === 0 ? PAGE.timeWidth : 0);
          assert.ok(close(system.bars[0].x0, start), at);

          // Nothing leaves the page: not to the right, and not out of the
          // system's own slice of the drawing.
          const sliceTop = system.top - PAGE.systemTop;
          for (const ink of signs) {
            assert.ok(ink.top > sliceTop && ink.bottom < sliceTop + PAGE.systemGap, at);
            // A sign belongs to the staff: none hangs wholly above or below it.
            assert.ok(ink.bottom > system.top && ink.top < system.bottom, at);
          }
          assert.ok(Math.abs(system.staffEnd - (layout.width - PAGE.right)) < 0.01, at);
          for (const n of systemNotes(system)) {
            assert.ok(n.x + HEAD / 2 <= layout.width - PAGE.right && noteLeft(n) > last.right, at);
          }
        });
      }
    }
  }
});

test('the signature takes its room from the measures, and nothing else changes', () => {
  // Notes of the key only: no sign beside any note, as in the same rhythm
  // without a key. So the keyed layout is the plain one moved right by the
  // signature's room, on a page that much narrower.
  const rooms = [];
  const counts = new Set();
  let fewer = 0;
  for (const noteValues of [['quarter'], ['quarter', 'eighth'], ['eighth'], ['eighth', 'sixteenth']]) {
    const plain = scoreWith({ noteValues }, 7);
    for (const key of KEYS) {
      const [sign, count] = SIGNATURE[key.id];
      const keyed = inKeyOf(plain, key.id, { chromatic: false });
      // From the end of the clef's room to the first sign, the signs, and the
      // room after them.
      const lead = CLEF_INSET + widthOf('gClef') + KEY_AFTER_CLEF - PAGE.clefWidth;
      const room = count ? lead + count * widthOf(sign) + KEY_TRAIL : 0;
      rooms.push({ sign, count, room });
      for (let width = 480; width <= 960; width += 20) {
        const layout = layoutScore(keyed, width);
        const all = layout.systems.flatMap(systemNotes);
        assert.ok(all.every(n => n.accidental === null));
        assert.ok(close(layout.systems[0].bars[0].x0, PAGE.left + PAGE.clefWidth + room + PAGE.timeWidth));
        assert.ok(close(layout.systems[1].bars[0].x0, PAGE.left + PAGE.clefWidth + room));
        assert.ok(close(layout.systems[0].timeX, PAGE.left + PAGE.clefWidth + room + 0.9 * SPACE));
        if (layout.width !== width) continue; // widened to keep its notes apart: the next test

        const reference = layoutScore(plain, width - room);
        // The same number of measures to a system as the plain study has,
        // wherever they still fit in what the signature leaves.
        assert.equal(layout.perSystem, reference.perSystem, `${key.label} at ${width}`);
        const expected = reference.systems.flatMap(systemNotes);
        all.forEach((n, i) => assert.ok(close(n.x, expected[i].x + room), `${key.label} at ${width}`));
        // Never more measures to a system than without the signature.
        const unkeyed = layoutScore(plain, width).perSystem;
        assert.ok(layout.perSystem <= unkeyed);
        if (layout.perSystem < unkeyed) fewer++;
        counts.add(layout.perSystem);
      }
    }
  }
  // More signs, less room for the music: each sign costs its own width.
  for (const sign of ['sharp', 'flat']) {
    const byCount = new Map(rooms.filter(r => r.sign === sign && r.count > 0).map(r => [r.count, r.room]));
    const ordered = [...byCount.keys()].sort((a, b) => a - b);
    assert.ok(ordered.length >= 2);
    for (let i = 1; i < ordered.length; i++) {
      assert.ok(close(byCount.get(ordered[i]) - byCount.get(ordered[i - 1]), widthOf(sign)));
    }
  }
  assert.ok(rooms.filter(r => r.count === 0).every(r => r.room === 0));
  // The comparison saw systems of four, two and one measures, and widths at
  // which the signature cost a study its four or its two.
  assert.deepEqual([...counts].sort(), [1, 2, 4]);
  assert.ok(fewer > 0);
  // Quarter notes still go four to a system at full width, in every key.
  for (const key of KEYS) assert.equal(layoutScore(inKeyOf(scoreWith({}, 1), key.id), PAGE.maxWidth).perSystem, 4);
});

test('note spacing is never squeezed past four fifths, with a signature or without', () => {
  let widened = 0;
  for (const study of STUDIES) {
    for (const width of [...WIDTHS, 700]) {
      for (const seed of seeds(4)) {
        const layout = layoutScore(study(seed), width);
        if (layout.width > width) widened++;
        for (const bar of layout.systems.flatMap(system => system.bars)) {
          for (let i = 1; i < bar.notes.length; i++) {
            const gap = bar.notes[i].x - bar.notes[i - 1].x;
            const least = MIN_STRETCH * ADVANCE[bar.notes[i - 1].dur];
            assert.ok(gap >= least - 1e-6, `gap ${gap.toFixed(2)} of ${least.toFixed(2)} at width ${width}`);
          }
        }
      }
    }
  }
  // Dense studies on a narrow page were among them: the drawing was widened.
  assert.ok(widened > 0);
});

// ---- Notes, stems and beams -------------------------------------------------

test('notes are placed by staff step, with ledger lines outside the staff', () => {
  const bottom = 100;
  assert.equal(placeNote(spell(52), 0, bottom).y, bottom);                 // E4, bottom line
  assert.equal(placeNote(spell(65), 0, bottom).y, bottom - 4 * SPACE);     // F5, top line
  assert.deepEqual(placeNote(spell(59), 0, bottom).ledgers, []);           // B4, inside
  assert.deepEqual(placeNote(spell(48), 0, bottom).ledgers, [bottom + SPACE]);      // C4
  assert.equal(placeNote(spell(40), 0, bottom).ledgers.length, 3);         // E3
  assert.deepEqual(placeNote(spell(69), 0, bottom).ledgers, [bottom - 5 * SPACE]);  // A5
});

test('single stems point up below the middle line and down from it upward', () => {
  const bottom = 100;
  assert.equal(singleStem(placeNote(spell(57), 0, bottom), bottom).up, true);   // A4
  assert.equal(singleStem(placeNote(spell(59), 0, bottom), bottom).up, false);  // B4, middle line
  // A low ledger note's stem reaches the middle line.
  const lowE = placeNote(spell(40), 0, bottom);
  assert.equal(singleStem(lowE, bottom).y2, bottom - 2 * SPACE);
});

test('beam groups hold the eighths and sixteenths of one beat', () => {
  const durs = [4, 2, 2, 1, 1, 2, 1, 1, 1, 1];
  let start = 0;
  const notes = durs.map(dur => {
    const n = { start, dur };
    start += dur;
    return n;
  });
  assert.deepEqual(beamGroups(notes).map(g => g.map(n => n.dur)), [[2, 2], [1, 1, 2], [1, 1, 1, 1]]);
});

// ---- Whole layouts ----------------------------------------------------------

test('layout width follows the container within limits', () => {
  assert.equal(viewWidthFor(0), PAGE.minWidth);
  assert.equal(viewWidthFor(320), PAGE.minWidth);
  assert.equal(viewWidthFor(2000), PAGE.maxWidth);
  assert.ok(viewWidthFor(600) > PAGE.minWidth && viewWidthFor(600) < PAGE.maxWidth);
});

test('every measure is laid out exactly once, four, two or one to a system', () => {
  for (const study of STUDIES) {
    for (const width of WIDTHS) {
      const layout = layoutScore(study(3), width);
      assert.ok([4, 2, 1].includes(layout.perSystem));
      const numbers = layout.systems.flatMap(s => s.bars.map(b => b.number));
      assert.deepEqual(numbers, Array.from({ length: 16 }, (_, i) => i + 1));
      assert.ok(layout.systems.every(s => s.bars.length === layout.perSystem));
    }
  }
});

test('quarter notes fit four measures to a system at full width', () => {
  assert.equal(layoutScore(scoreWith({}, 1), PAGE.maxWidth).perSystem, 4);
});

test('systems fill the width and nothing spills past the right margin', () => {
  for (const study of STUDIES) {
    for (const width of WIDTHS) {
      const layout = layoutScore(study(5), width);
      for (const system of layout.systems) {
        assert.ok(Math.abs(system.staffEnd - (layout.width - PAGE.right)) < 0.01);
        assert.ok(system.bars.every(bar => bar.x1 <= layout.width - PAGE.right + 0.01));
      }
    }
  }
});

test('noteheads never overlap, even dense sixteenths on a narrow screen', () => {
  for (const study of STUDIES) {
    for (const width of WIDTHS) {
      for (const seed of seeds(5)) {
        const layout = layoutScore(study(seed), width);
        for (const system of layout.systems) {
          const notes = systemNotes(system);
          for (let i = 1; i < notes.length; i++) {
            const gap = notes[i].x - notes[i - 1].x;
            assert.ok(gap >= HEAD, `gap ${gap.toFixed(1)} at width ${width}`);
            // An accidental needs its own room on top of that.
            if (notes[i].accidental) assert.ok(gap >= HEAD + SPACE, `accidental gap ${gap.toFixed(1)}`);
          }
        }
      }
    }
  }
});

test('the first note of a measure clears the barline before it', () => {
  for (const study of STUDIES) {
    const layout = layoutScore(study(2), 960);
    for (const system of layout.systems) {
      for (const bar of system.bars) {
        const first = bar.notes[0];
        assert.ok(first.x - bar.x0 >= HEAD / 2 + (first.accidental ? SPACE : 0.5 * SPACE));
      }
    }
  }
});

test('every note has a stem; beamed stems end on their beam and are long enough', () => {
  for (const seed of seeds(10)) {
    const score = scoreWith({ noteValues: ['quarter', 'eighth', 'sixteenth'], accidentals: 'sharps' }, seed);
    const layout = layoutScore(score, 960);
    for (const system of layout.systems) {
      for (const bar of system.bars) {
        for (const n of bar.notes) {
          const length = Math.abs(n.stem.y2 - n.y);
          assert.ok(length >= 3.2 * SPACE, `stem ${length.toFixed(1)}`);
          assert.equal(n.stem.up, n.stem.y2 < n.y);
        }
        // Notes of one beam group share a stem direction.
        for (const group of beamGroups(bar.notes)) {
          assert.equal(new Set(group.map(n => n.stem.up)).size, 1);
        }
        // Beams never slant by more than one staff space.
        for (const beam of bar.beams) assert.ok(Math.abs(beam.y2 - beam.y1) <= SPACE + 0.5);
      }
    }
  }
});

test('one primary beam per group, plus one secondary beam per run of sixteenths', () => {
  const score = scoreWith({ noteValues: ['eighth', 'sixteenth'] }, 11);
  const layout = layoutScore(score, 960);
  for (const system of layout.systems) {
    for (const bar of system.bars) {
      let expected = 0;
      for (const group of beamGroups(bar.notes)) {
        expected += 1;
        if (group.some(n => n.dur === 1)) expected += 1;
      }
      assert.equal(bar.beams.length, expected);
    }
  }
});

test('position marks appear at the start and wherever the position changes', () => {
  const fixed = layoutScore(scoreWith({ positions: [7] }, 1), 960);
  const marks = layout => layout.systems.flatMap(s => s.bars.filter(b => b.showPosition).map(b => b.number));
  assert.deepEqual(marks(fixed), [1]);
  const rotating = layoutScore(scoreWith({ positions: [1, 5, 9], rotatePositions: true }, 1), 960);
  assert.equal(marks(rotating).length, 16);
});

test('position marks sit above everything in their system', () => {
  for (const seed of seeds(10)) {
    const score = scoreWith({ positions: [12], noteValues: ['eighth', 'sixteenth'], accidentals: 'sharps' }, seed);
    // Without a key, and in one whose signature reaches above the staff.
    for (const study of [score, inKeyOf(score, 'A')]) {
      for (const system of layoutScore(study, 960).systems) {
        for (const n of systemNotes(system)) {
          assert.ok(system.markY < n.y - 0.5 * SPACE);
          assert.ok(system.markY < n.stem.y2);
        }
        for (const ink of signInks(system)) assert.ok(system.markY < ink.top);
        assert.ok(system.markY > system.top - PAGE.systemTop + SPACE, 'mark stays on the page');
      }
    }
  }
});

test('only the last measure gets the final barline', () => {
  const layout = layoutScore(scoreWith({}, 1), 960);
  const finals = layout.systems.flatMap(s => s.bars.filter(b => b.final).map(b => b.number));
  assert.deepEqual(finals, [16]);
});
