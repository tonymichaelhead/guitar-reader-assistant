import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { OPEN_STRINGS, POSITION_NUMBERS, poolFor } from '../src/music/fretboard.js';
import { mulberry32, pick } from '../src/music/rng.js';
import { CODEC_VERSION, decodeScore, encodeScore } from '../src/music/score-codec.js';
import { allNotes, scoreWith, seeds } from './helpers.js';

const COMBINATIONS = [
  ['quarter'], ['eighth'], ['sixteenth'],
  ['quarter', 'eighth'], ['quarter', 'sixteenth'], ['eighth', 'sixteenth'],
  ['quarter', 'eighth', 'sixteenth']
];
const ALL_VALUES = COMBINATIONS[6];
const MODES = [
  { melody: 'random', accidentals: false },
  { melody: 'random', accidentals: true },
  { melody: 'musical', accidentals: false },
  { melody: 'musical', accidentals: true }
];
const DENSE = { noteValues: ['sixteenth'], accidentals: true };

// What storage does to an encoding: text out, text back in.
const throughJson = value => JSON.parse(JSON.stringify(value));
const roundTrip = score => decodeScore(throughJson(encodeScore(score)));

const SETTINGS = { strings: [6, 5, 4, 3, 2, 1] };
// A one-measure encoding in first position unless told otherwise.
const encoding = (n, overrides = {}) => ({
  v: 1, seed: 7, tonality: null, settings: SETTINGS, measures: [{ p: 1, n }], ...overrides
});
const QUARTERS = [[40, 0, 4], [41, 0, 4], [43, 0, 4], [45, 0, 4]]; // E3 F3 G3 A3
const BLACK_KEYS = [1, 3, 6, 8, 10];
// Four quarter notes on the lowest natural note a position offers.
const lowestNote = (position, strings) =>
  new Array(4).fill([poolFor(position, { accidentals: false, strings })[0].value, 0, 4]);

// decodeScore must refuse without throwing, so every refusal checks both.
const assertRefused = (data, label) => {
  let result;
  assert.doesNotThrow(() => { result = decodeScore(data); }, label);
  assert.equal(result, null, label);
};

test('a score survives encoding, JSON and decoding, for every note-value combination', () => {
  for (const mode of MODES) {
    for (const noteValues of COMBINATIONS) {
      for (const seed of seeds(10)) {
        const score = scoreWith({ ...mode, noteValues }, seed);
        assert.deepEqual(roundTrip(score), score, `${mode.melody} ${noteValues} seed ${seed}`);
      }
    }
  }
});

test('rotating positions survive the round trip', () => {
  for (const mode of MODES) {
    for (const positions of [[1, 7, 12], POSITION_NUMBERS]) {
      for (const seed of seeds(8)) {
        const score = scoreWith({ ...mode, positions, rotatePositions: true, noteValues: ALL_VALUES }, seed);
        assert.ok(new Set(score.measures.map(m => m.position)).size > 1);
        assert.deepEqual(roundTrip(score), score, `${mode.melody} ${positions} seed ${seed}`);
      }
    }
  }
});

test('restricted strings survive the round trip, fingerings included', () => {
  for (const mode of MODES) {
    for (const strings of [[6, 5, 4], [3, 2, 1], [4, 2], [6], [1]]) {
      for (const seed of seeds(6)) {
        const score = scoreWith({ ...mode, strings, positions: [1, 9], noteValues: ['quarter', 'eighth'] }, seed);
        const back = roundTrip(score);
        assert.deepEqual(back, score, `${mode.melody} strings ${strings} seed ${seed}`);
        for (const note of allNotes(back)) {
          assert.ok(note.pitch.fingerings.length > 0);
          assert.ok(note.pitch.fingerings.every(f => strings.includes(f.string)));
        }
      }
    }
  }
});

test('the encoding holds seed, tonality, settings and one [value, alter, duration] per note', () => {
  assert.equal(CODEC_VERSION, 1);
  for (const mode of MODES) {
    const score = scoreWith({ ...mode, noteValues: ALL_VALUES, positions: [2, 8], rotatePositions: true }, 4);
    const data = encodeScore(score);
    assert.deepEqual(Object.keys(data), ['v', 'seed', 'tonality', 'settings', 'measures']);
    assert.equal(data.v, 1);
    assert.equal(data.seed, 4);
    assert.equal(data.tonality, score.tonality);
    assert.deepEqual(data.settings, score.settings);
    assert.equal(data.measures.length, score.measures.length);
    data.measures.forEach((measure, i) => {
      const { position, notes } = score.measures[i];
      // No measure number, no starts, no letters, no fingerings.
      assert.deepEqual(measure, { p: position, n: notes.map(n => [n.pitch.value, n.pitch.alter, n.dur]) });
    });
    // Nothing in it is changed by a trip through JSON.
    assert.deepEqual(throughJson(data), data);
  }
});

test('random mode stores a null tonality and musical mode its label', () => {
  assert.equal(encodeScore(scoreWith({}, 1)).tonality, null);
  assert.equal(typeof encodeScore(scoreWith({ melody: 'musical' }, 1)).tonality, 'string');
});

test('settings are stored as they are, and copied in both directions', () => {
  const score = scoreWith({ positions: [2, 7], strings: [3, 2, 1], melody: 'musical' }, 9);
  const data = encodeScore(score);
  assert.deepEqual(data.settings, score.settings);
  assert.notEqual(data.settings, score.settings);
  assert.notEqual(data.settings.strings, score.settings.strings);

  // Settings the codec knows nothing about pass through untouched.
  const stored = throughJson(data);
  stored.settings.someLaterSetting = { tempo: 60 };
  const back = decodeScore(stored);
  assert.deepEqual(back.settings, stored.settings);
  assert.notEqual(back.settings, stored.settings);
  back.settings.strings.push(6);
  assert.deepEqual(stored.settings.strings, [3, 2, 1]);
});

test('a hand-written encoding decodes to the notes it names', () => {
  // E3 open, F#3, Gb3 (the same fret), then E5 open, F5 and F5 again.
  const n = [[40, 0, 4], [42, 1, 4], [42, -1, 4], [64, 0, 2], [65, 0, 1], [65, 0, 1]];
  const score = decodeScore(encoding(n, { seed: 123, tonality: 'A minor' }));
  const fret2 = [{ string: 6, fret: 2, finger: 2 }];
  const fret1 = [{ string: 1, fret: 1, finger: 1 }];
  assert.deepEqual(score, {
    seed: 123,
    settings: SETTINGS,
    tonality: 'A minor',
    measures: [{
      number: 1,
      position: 1,
      notes: [
        { pitch: { letter: 'E', octave: 3, alter: 0, value: 40, fingerings: [{ string: 6, fret: 0, finger: 0 }] }, start: 0, dur: 4 },
        { pitch: { letter: 'F', octave: 3, alter: 1, value: 42, fingerings: fret2 }, start: 4, dur: 4 },
        { pitch: { letter: 'G', octave: 3, alter: -1, value: 42, fingerings: fret2 }, start: 8, dur: 4 },
        { pitch: { letter: 'E', octave: 5, alter: 0, value: 64, fingerings: [{ string: 1, fret: 0, finger: 0 }] }, start: 12, dur: 2 },
        { pitch: { letter: 'F', octave: 5, alter: 0, value: 65, fingerings: fret1 }, start: 14, dur: 1 },
        { pitch: { letter: 'F', octave: 5, alter: 0, value: 65, fingerings: fret1 }, start: 15, dur: 1 }
      ]
    }]
  });
});

test('measures are numbered from one and starts are the running sum of the durations', () => {
  const data = encoding(null, {
    measures: [{ p: 1, n: QUARTERS }, { p: 5, n: [[57, 0, 2], [57, 0, 2], [60, 0, 4], [62, 0, 1], [62, 0, 1], [64, 0, 2], [57, 0, 4]] }]
  });
  const score = decodeScore(data);
  assert.deepEqual(score.measures.map(m => [m.number, m.position]), [[1, 1], [2, 5]]);
  assert.deepEqual(score.measures[1].notes.map(n => n.start), [0, 2, 4, 8, 9, 10, 12]);
});

test('a study may be shorter or longer than the sixteen measures generated today', () => {
  for (const count of [1, 2, 15, 16, 17, 40, 200]) {
    const score = decodeScore(encoding(null, { measures: new Array(count).fill({ p: 1, n: QUARTERS }) }));
    assert.deepEqual(score.measures.map(m => m.number), Array.from({ length: count }, (_, i) => i + 1));
    assert.deepEqual(score.measures.at(-1).notes.map(n => n.pitch.value), [40, 41, 43, 45]);
  }
});

test('fingerings come from the fretboard, narrowed to the enabled strings', () => {
  // B4 is the one note first position offers twice: fourth fret of the third
  // string, or the open second string.
  const b4 = strings => encoding(new Array(4).fill([59, 0, 4]), { settings: { strings } });
  const fingerings = strings => decodeScore(b4(strings)).measures[0].notes[0].pitch.fingerings;
  const third = { string: 3, fret: 4, finger: 4 };
  const second = { string: 2, fret: 0, finger: 0 };
  assert.deepEqual(fingerings([6, 5, 4, 3, 2, 1]), [third, second]);
  assert.deepEqual(fingerings([1, 2, 3]), [third, second]);
  assert.deepEqual(fingerings([3]), [third]);
  assert.deepEqual(fingerings([2, 1]), [second]);
  assertRefused(b4([6, 5, 4]), 'B4 lies on disabled strings only');
  assertRefused(b4([1]), 'B4 lies on disabled strings only');
});

test('extra fields are ignored and do not reach the score', () => {
  const data = encoding(QUARTERS, { title: 'Study', measures: [{ p: 1, n: QUARTERS, number: 99, start: 5 }] });
  assert.deepEqual(decodeScore(data), decodeScore(encoding(QUARTERS)));
});

test('only version 1 is accepted', () => {
  for (const v of [0, 2, 1.5, '1', true, null, undefined, [1]]) assertRefused(encoding(QUARTERS, { v }), `v ${inspect(v)}`);
});

test('the seed must be a non-negative safe integer', () => {
  for (const seed of [0, 1, 9999, 4294967295, Number.MAX_SAFE_INTEGER]) {
    assert.equal(decodeScore(encoding(QUARTERS, { seed })).seed, seed);
  }
  for (const seed of [-1, 1.5, 2 ** 53, NaN, Infinity, '7', null, undefined, [7]]) {
    assertRefused(encoding(QUARTERS, { seed }), `seed ${inspect(seed)}`);
  }
});

test('the tonality must be a string or null', () => {
  for (const tonality of [null, '', 'C major', 'F♯ Phrygian']) {
    assert.equal(decodeScore(encoding(QUARTERS, { tonality })).tonality, tonality);
  }
  for (const tonality of [undefined, 0, 1, true, [], {}, ['C major']]) {
    assertRefused(encoding(QUARTERS, { tonality }), `tonality ${inspect(tonality)}`);
  }
});

test('settings must be a plain object naming distinct strings from 1 to 6', () => {
  for (const strings of [[6], [1], [1, 6], [2, 4], [1, 2, 3, 4, 5, 6]]) {
    const score = decodeScore(encoding(lowestNote(1, strings), { settings: { strings, later: true } }));
    assert.deepEqual(score.settings, { strings, later: true });
  }
  // Every note below is on the sixth string, which each list of strings
  // enables, so only the settings themselves can be at fault.
  const onSixth = settings => encoding(lowestNote(1, [6]), { settings });
  assert.ok(decodeScore(onSixth({ strings: [6] })));
  const notPlain = [
    undefined, null, 'x', 7, [], [SETTINGS], new Map(), Object.create(SETTINGS), {},
    Object.assign([], SETTINGS), Object.assign(new (class Settings {})(), SETTINGS)
  ];
  for (const settings of notPlain) assertRefused(onSixth(settings), `settings ${inspect(settings)}`);
  const bad = [
    undefined, null, 6, '6', {}, { 0: 6, length: 1 }, new Set([6]), [],
    [6, 0], [6, 7], [6, -6], [6, 5.5], [6, '5'], [6, null], [6, NaN], [6, [5]],
    [6, 6], [6, 5, 4, 3, 2, 1, 6], [6, 5, 4, 3, 2, 1, 0]
  ];
  for (const strings of bad) assertRefused(onSixth({ strings }), `strings ${inspect(strings)}`);
});

test('measures must be a non-empty list of objects with a position and notes', () => {
  for (const measures of [undefined, null, [], {}, 'x', 16, [null], [[]], ['x'], [{}], [{ p: 1 }], [{ n: QUARTERS }]]) {
    assertRefused(encoding(QUARTERS, { measures }), `measures ${inspect(measures)}`);
  }
  // The right fields on the wrong kind of object.
  const measure = { p: 1, n: QUARTERS };
  assert.ok(decodeScore(encoding(null, { measures: [measure] })));
  for (const odd of [Object.assign([], measure), Object.create(measure), Object.assign(new (class Measure {})(), measure)]) {
    assertRefused(encoding(null, { measures: [odd] }), `measure ${inspect(odd)}`);
  }
  // One bad measure spoils the score.
  assertRefused(encoding(null, { measures: [measure, { p: 1, n: [] }] }), 'empty second measure');
  assertRefused(encoding(null, { measures: [measure, measure, null] }), 'null third measure');
});

test('the position must be a whole number from 1 to 12', () => {
  for (const p of POSITION_NUMBERS) {
    const data = encoding(null, { measures: [{ p, n: lowestNote(p, SETTINGS.strings) }] });
    assert.equal(decodeScore(data).measures[0].position, p);
  }
  for (const p of [0, 13, -1, 1.5, '1', NaN, null, undefined, [1], true]) {
    assertRefused(encoding(null, { measures: [{ p, n: QUARTERS }] }), `p ${inspect(p)}`);
  }
  // The notes above are out of reach of a thirteenth position anyway, so they
  // cannot show that the position itself is checked. Here each position
  // outside the range gets the note its own frets would begin with, on the
  // sixth string: nothing but the position is at fault.
  for (const p of [-1, 0, 13, 14, 24, 40, 99]) {
    const value = OPEN_STRINGS[0] + p;
    const alter = BLACK_KEYS.includes(value % 12) ? 1 : 0;
    const data = encoding(null, { measures: [{ p, n: new Array(4).fill([value, alter, 4]) }] });
    assertRefused(data, `p ${p} with a note of its own`);
  }
});

test('notes must be triples of whole numbers with a duration of 1, 2 or 4', () => {
  const withFirst = triple => encoding([triple, ...QUARTERS.slice(1)]);
  assert.ok(decodeScore(withFirst([40, 0, 4])));
  const bad = [
    undefined, null, 40, 'x', {}, [], [40], [40, 0], [40, 0, 4, 0], { 0: 40, 1: 0, 2: 4, length: 3 },
    new Uint8Array([40, 0, 4]),
    ['40', 0, 4], [40.5, 0, 4], [NaN, 0, 4], [null, 0, 4],
    [40, '0', 4], [40, null, 4], [40, 0.5, 4], [40, 2, 4], [40, -2, 4],
    [40, 0, '4'], [40, 0, 4.5], [40, 0, null], [40, 0, 0], [40, 0, -4], [40, 0, 3], [40, 0, 8], [40, 0, 16]
  ];
  for (const triple of bad) assertRefused(withFirst(triple), `triple ${inspect(triple)}`);
});

test('a measure must last exactly four beats', () => {
  const E = dur => [40, 0, dur];
  const fill = durs => encoding(durs.map(E));
  for (const durs of [[4, 4, 4, 4], [2, 2, 2, 2, 2, 2, 2, 2], new Array(16).fill(1), [4, 2, 2, 1, 1, 2, 2, 1, 1]]) {
    assert.ok(decodeScore(fill(durs)), `${durs}`);
  }
  for (const durs of [[4], [4, 4, 4], [4, 4, 4, 2], [4, 4, 4, 2, 1], [4, 4, 4, 4, 1], [4, 4, 4, 4, 4], new Array(17).fill(1), new Array(32).fill(1)]) {
    assertRefused(fill(durs), `${durs}`);
  }
});

test('only quarters, eighths and sixteenths are accepted, even where another value would fit', () => {
  const fill = durs => encoding(durs.map(dur => [40, 0, dur]));
  // A dotted eighth inside one beat, halves of a sixteenth, a half note, a whole note.
  const fitting = [
    [3, 1, 4, 4, 4], [1, 3, 4, 4, 4], [4, 4, 4, 3, 1], [0.5, 0.5, 1, 2, 4, 4, 4], [2.5, 1.5, 4, 4, 4],
    [8, 4, 4], [8, 8], [16]
  ];
  for (const durs of fitting) {
    assert.equal(durs.reduce((a, b) => a + b, 0), 16);
    assertRefused(fill(durs), `${durs}`);
  }
});

test('no note may cross a beat', () => {
  const fill = durs => encoding(durs.map(dur => [40, 0, dur]));
  // Each of these adds up to four beats and still ties a note over a beat.
  for (const durs of [[2, 4, 2, 4, 4], [1, 4, 1, 2, 4, 4], [1, 1, 1, 2, 1, 2, 4, 4], [4, 4, 2, 1, 2, 1, 2], [4, 4, 1, 1, 1, 2, 1, 2]]) {
    assert.equal(durs.reduce((a, b) => a + b, 0), 16);
    assertRefused(fill(durs), `${durs}`);
  }
});

test('alter must agree with the pitch: plain white keys, sharp or flat black keys', () => {
  const pool = poolFor(1, { accidentals: true, strings: SETTINGS.strings });
  const withFirst = triple => encoding([triple, ...QUARTERS.slice(1)]);
  for (const { value, alter } of pool) {
    const white = alter === 0;
    assert.equal(Boolean(decodeScore(withFirst([value, 0, 4]))), white, `${value} natural`);
    assert.equal(Boolean(decodeScore(withFirst([value, 1, 4]))), !white, `${value} sharp`);
    assert.equal(Boolean(decodeScore(withFirst([value, -1, 4]))), !white, `${value} flat`);
  }
  // The two spellings of a black key differ in letter, not in value or fingering.
  const sharp = decodeScore(withFirst([42, 1, 4])).measures[0].notes[0].pitch;
  const flat = decodeScore(withFirst([42, -1, 4])).measures[0].notes[0].pitch;
  assert.deepEqual([sharp.letter, sharp.alter, flat.letter, flat.alter], ['F', 1, 'G', -1]);
  assert.deepEqual(sharp.fingerings, flat.fingerings);
});

test('a note must be playable in its measure\'s position', () => {
  for (const position of POSITION_NUMBERS) {
    const playable = new Set(poolFor(position, { accidentals: true, strings: SETTINGS.strings }).map(p => p.value));
    for (let value = 30; value <= 90; value++) {
      const alter = BLACK_KEYS.includes(value % 12) ? 1 : 0;
      const data = encoding(null, { measures: [{ p: position, n: new Array(4).fill([value, alter, 4]) }] });
      assert.equal(Boolean(decodeScore(data)), playable.has(value), `${value} in position ${position}`);
    }
  }
});

test('holes in a list are refused, not skipped', () => {
  // The notes are on the sixth string, so the hole is all that is wrong here.
  assertRefused(encoding(lowestNote(1, [6]), { settings: { strings: [6, , 4] } }), 'strings');
  assertRefused(encoding(null, { measures: [{ p: 1, n: QUARTERS }, , { p: 1, n: QUARTERS }] }), 'measures');
  assertRefused(encoding([[40, 0, 4], , [40, 0, 4], [40, 0, 4], [40, 0, 4]]), 'notes');
  assertRefused(encoding([[40, , 4], ...QUARTERS.slice(1)]), 'triple');
  assertRefused(encoding(null, { measures: new Array(16) }), 'nothing but holes');
});

test('anything that is not an encoding is refused without throwing', () => {
  const valid = throughJson(encodeScore(scoreWith({}, 1)));
  assert.ok(decodeScore(valid));
  const things = [
    undefined, null, 0, 1, -1, NaN, Infinity, 1n, '', 'x', '{}', JSON.stringify(valid), true, false,
    Symbol('score'), () => valid, [], [valid], {}, new Map(Object.entries(valid)), new Date(0), /v/,
    Object.create(null), Object.create(valid), Object.assign(new (class Saved {})(), valid)
  ];
  for (const thing of things) assertRefused(thing, inspect(thing).slice(0, 60));
});

test('hostile objects are refused without throwing', () => {
  const valid = () => throughJson(encodeScore(scoreWith({}, 1)));
  const boom = () => { throw new Error('boom'); };
  const trapped = target => new Proxy(target, {
    get: boom, has: boom, ownKeys: boom, getPrototypeOf: boom, getOwnPropertyDescriptor: boom
  });
  const exploding = (object, key) => Object.defineProperty(object, key, { enumerable: true, get: boom });
  const touchy = { valueOf: boom, toString: boom, [Symbol.toPrimitive]: boom };
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();

  assertRefused(trapped({}), 'proxy');
  assertRefused(trapped(valid()), 'proxy over a valid encoding');
  assertRefused(revoked.proxy, 'revoked proxy');
  for (const key of ['v', 'seed', 'tonality', 'settings', 'measures']) {
    assertRefused(exploding(valid(), key), `getter on ${key}`);
    assertRefused({ ...valid(), [key]: trapped({}) }, `proxy as ${key}`);
    assertRefused({ ...valid(), [key]: revoked.proxy }, `revoked proxy as ${key}`);
    assertRefused({ ...valid(), [key]: touchy }, `touchy object as ${key}`);
  }

  const inSettings = valid();
  exploding(inSettings.settings, 'strings');
  assertRefused(inSettings, 'getter on strings');
  assertRefused({ ...valid(), settings: { strings: trapped([6, 5, 4, 3, 2, 1]) } }, 'proxy as strings');
  assertRefused({ ...valid(), settings: { strings: [6, 5, 4, 3, 2, 1], f: boom } }, 'a function in settings');

  for (const key of ['p', 'n']) {
    const data = valid();
    exploding(data.measures[3], key);
    assertRefused(data, `getter on a measure's ${key}`);
    const other = valid();
    other.measures[3][key] = touchy;
    assertRefused(other, `touchy object as a measure's ${key}`);
  }
  const data = valid();
  data.measures[2] = trapped(data.measures[2]);
  assertRefused(data, 'proxy as a measure');
  for (const index of [0, 1, 2]) {
    const inTriple = valid();
    inTriple.measures[5].n[1][index] = touchy;
    assertRefused(inTriple, `touchy object at ${index} of a triple`);
  }
  const trappedTriple = valid();
  trappedTriple.measures[5].n[1] = trapped(trappedTriple.measures[5].n[1]);
  assertRefused(trappedTriple, 'proxy as a triple');
});

test('data that answers differently the second time is judged by what is used', () => {
  // Settings that are a plain object when checked and a list when taken. The
  // notes are on the sixth string, so the list alone is what must be refused.
  const onSixth = settings => encoding(lowestNote(1, [6]), { settings });
  const asList = Object.assign([], { strings: [6] });
  assertRefused(onSixth(asList), 'a list as settings');
  let reads = 0;
  const shifting = Object.defineProperty(onSixth(null), 'settings', {
    enumerable: true,
    get: () => (reads++ === 0 ? { strings: [6] } : asList)
  });
  const score = decodeScore(shifting);
  assert.equal(reads, 1);
  assert.deepEqual(score.settings, { strings: [6] });

  // Measures that claim a length and hand nothing over when walked.
  const vanishing = [{ p: 1, n: QUARTERS }];
  assert.ok(decodeScore(encoding(null, { measures: [...vanishing] })));
  vanishing[Symbol.iterator] = function* () {};
  assert.equal(vanishing.length, 1);
  assertRefused(encoding(null, { measures: vanishing }), 'measures that vanish');
});

// Wrong wherever a number, a list or an object is expected, and not a valid
// value of any field of the encoding.
const WRONG = [
  undefined, null, NaN, Infinity, -Infinity, 1.5, -0.5, 1e21, '', '1', '4', 'x', true, false,
  [], [null], [[]], {}, { length: 1 }, { p: 1 }, () => 1, Symbol('wrong'), 1n, new Date(0)
];

// Every way of spoiling one field of a valid encoding: [label, spoiled copy].
function* malformed(valid) {
  const variant = (label, change) => {
    const copy = throughJson(valid);
    change(copy);
    return [label, copy];
  };
  const replace = function* (label, target, key, values) {
    for (const value of values) {
      yield variant(`${label} = ${inspect(value)}`, copy => { target(copy)[key] = value; });
    }
  };
  const remove = (label, target, key) => variant(`${label} removed`, copy => { delete target(copy)[key]; });
  const top = copy => copy;

  yield remove('v', top, 'v');
  yield* replace('v', top, 'v', [...WRONG, 0, 2, -1]);
  yield remove('seed', top, 'seed');
  yield* replace('seed', top, 'seed', [...WRONG, -1, -9999, 2 ** 53]);
  yield remove('tonality', top, 'tonality');
  yield* replace('tonality', top, 'tonality', [...WRONG.filter(w => w !== null && typeof w !== 'string'), 0, 1]);
  yield remove('settings', top, 'settings');
  yield* replace('settings', top, 'settings', [...WRONG, { strings: [] }, { positions: [5] }]);
  yield remove('strings', copy => copy.settings, 'strings');
  yield* replace('strings', copy => copy.settings, 'strings',
    [...WRONG, 6, '654321', [0], [7], [-1], [1.5], ['6'], [6, 6], [6, 5, 4, 3, 2, 1, 0], [1, 2, 3, 4, 5, 6, 7]]);
  yield remove('measures', top, 'measures');
  yield* replace('measures', top, 'measures', [...WRONG, 16, [{}], [{ p: 5 }]]);

  const last = valid.measures.length - 1;
  for (const m of [0, last >> 1, last]) {
    const measure = copy => copy.measures[m];
    const here = `measure ${m + 1}`;
    yield* replace(here, copy => copy.measures, m, [...WRONG, 5]);
    yield remove(`${here} p`, measure, 'p');
    yield* replace(`${here} p`, measure, 'p', [...WRONG, 0, 13, -1, -5, 99]);
    yield remove(`${here} n`, measure, 'n');
    yield* replace(`${here} n`, measure, 'n', [...WRONG, 16, [[57]], [[57, 0, 16]]]);
    yield variant(`${here} one note short`, copy => { measure(copy).n.pop(); });
    yield variant(`${here} one note over`, copy => { measure(copy).n.push([...measure(copy).n[0]]); });
    yield variant(`${here} played twice`, copy => { measure(copy).n.push(...throughJson(measure(copy).n)); });

    const lastNote = valid.measures[m].n.length - 1;
    for (const i of [0, lastNote]) {
      const [value, , dur] = valid.measures[m].n[i];
      const triple = copy => measure(copy).n[i];
      const note = `${here} note ${i + 1}`;
      const white = !BLACK_KEYS.includes(value % 12);
      yield* replace(note, copy => measure(copy).n, i, [...WRONG, value, [value], [value, 0]]);
      yield variant(`${note} cut short`, copy => { triple(copy).pop(); });
      yield variant(`${note} with a fourth number`, copy => { triple(copy).push(0); });
      // No position reaches below E3 (40) or above G6 (79).
      yield* replace(`${note} value`, triple, 0, [...WRONG, -1, 0, 1, 39, 80, 127, 1000]);
      yield* replace(`${note} alter`, triple, 1, [...WRONG, 2, -2, 3, ...(white ? [1, -1] : [0])]);
      // Any other duration changes the length of the measure.
      yield* replace(`${note} dur`, triple, 2, [...WRONG, -1, 0, 3, 8, 16, ...[1, 2, 4].filter(d => d !== dur)]);
    }
  }
}

test('every malformed variant of a valid encoding is refused without throwing', () => {
  const sources = [
    scoreWith({}, 1),
    scoreWith({ melody: 'musical', accidentals: true, noteValues: ALL_VALUES, positions: [1, 7, 12], rotatePositions: true }, 2),
    scoreWith({ ...DENSE, strings: [4, 3, 2] }, 3)
  ];
  let count = 0;
  for (const score of sources) {
    const valid = throughJson(encodeScore(score));
    assert.deepEqual(decodeScore(valid), score);
    for (const [label, variant] of malformed(valid)) {
      assertRefused(variant, label);
      count++;
    }
  }
  assert.ok(count > 2000, `only ${count} variants`);
});

// Every place in a JSON tree where a value sits: [container, key].
const slots = (node, out = []) => {
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      out.push([node, key]);
      slots(node[key], out);
    }
  }
  return out;
};

test('random damage is refused, or decodes to exactly what the damaged data says', () => {
  // Plausible numbers as well as nonsense, so that some damage stays valid.
  const junk = [
    ...WRONG, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 16, 40, 45, 52, 57, 58, 60, 64, 69, 72, 79, 80,
    'C major', [6, 5, 4], [1], [57, 0, 4], [58, 1, 2], [58, -1, 1], { p: 5, n: [[57, 0, 4]] }
  ];
  const sources = [
    scoreWith({ melody: 'musical', accidentals: true, noteValues: ALL_VALUES }, 5),
    scoreWith({ accidentals: true, noteValues: ['quarter', 'eighth'], positions: [4, 5, 6], rotatePositions: true }, 6)
  ];
  const rng = mulberry32(2024);
  let accepted = 0;
  let refused = 0;
  for (let round = 0; round < 4000; round++) {
    const data = throughJson(encodeScore(sources[round % sources.length]));
    const [container, key] = pick(rng, slots(data));
    const roll = rng();
    if (roll < 0.7) {
      container[key] = pick(rng, junk);
    } else if (Array.isArray(container)) {
      if (roll < 0.85) container.splice(key, 1);
      else container.splice(key, 0, throughJson(container[key]));
    } else {
      delete container[key];
    }

    let score;
    assert.doesNotThrow(() => { score = decodeScore(data); });
    if (score === null) {
      refused++;
      continue;
    }
    accepted++;
    // Whatever is accepted must say the same thing when encoded again, and
    // every note must be a real note of its position.
    assert.deepEqual(encodeScore(score), data);
    for (const measure of score.measures) {
      const pool = poolFor(measure.position, { accidentals: true, strings: score.settings.strings });
      assert.equal(measure.notes.reduce((sum, n) => sum + n.dur, 0), 16);
      for (const { pitch } of measure.notes) {
        assert.deepEqual(pitch.fingerings, pool.find(p => p.value === pitch.value).fingerings);
      }
    }
  }
  assert.ok(accepted > 100 && refused > 1000, `${accepted} accepted, ${refused} refused`);
});

test('the densest study encodes to under 3,072 characters of JSON', () => {
  // Sixteen measures of sixteenths with accidentals: 256 notes, 2,745 to 2,792
  // characters when this was written. A library is one localStorage value, and
  // the limit browsers document is about five million characters for an
  // origin, so this bound leaves room for some 1,600 of the densest studies.
  const densest = [
    DENSE,
    { ...DENSE, melody: 'musical' },
    { ...DENSE, positions: POSITION_NUMBERS, rotatePositions: true },
    { ...DENSE, melody: 'musical', positions: [10, 11, 12], rotatePositions: true }
  ];
  for (const overrides of densest) {
    for (const seed of [...seeds(12), 9999]) {
      const score = scoreWith(overrides, seed);
      assert.equal(allNotes(score).length, 256);
      const { length } = JSON.stringify(encodeScore(score));
      assert.ok(length < 3072, `${length} characters`);
    }
  }
  // The default study, quarter notes in one position, is about a third of that.
  assert.ok(JSON.stringify(encodeScore(scoreWith({}, 1))).length < 1100);
});
