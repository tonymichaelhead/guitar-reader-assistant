import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { pitchName } from '../src/music/pitch.js';
import { decodeScore, encodeScore } from '../src/music/score-codec.js';
import { LIBRARY_KEY, addToLibrary, loadLibrary, removeFromLibrary } from '../src/state/library.js';
import { sanitize } from '../src/state/settings.js';
import { allNotes, scoreWith, settingsWith } from './helpers.js';

// A storage that works, optionally holding a library already. `writes` counts
// the calls to setItem and `keys` lists what has been written to.
const memoryStorage = initial => {
  const data = new Map();
  if (initial !== undefined) data.set(LIBRARY_KEY, initial);
  const storage = {
    writes: 0,
    keys: () => [...data.keys()],
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      storage.writes++;
      data.set(key, String(value));
    }
  };
  return storage;
};

// A storage that can be read but refuses every write with the given error.
const refusingStorage = (error, initial) => ({
  ...memoryStorage(initial),
  setItem() { throw error; }
});

const blockedStorage = () => ({
  getItem() { throw new DOMException('denied', 'SecurityError'); },
  setItem() { throw new DOMException('denied', 'SecurityError'); }
});

const throughJson = value => JSON.parse(JSON.stringify(value));
const stored = storage => JSON.parse(storage.getItem(LIBRARY_KEY));
const raw = (id, savedAt, score) => ({ id, savedAt, data: encodeScore(score) });
const textOf = (...entries) => JSON.stringify(entries);
const ids = entries => entries.map(entry => entry.id);

// Settings in canonical order, so a loaded score equals the one saved.
const A = scoreWith({}, 1);
const B = scoreWith({ melody: 'musical', accidentals: 'sharps', noteValues: ['eighth', 'sixteenth'] }, 2);
const C = scoreWith({ positions: [1, 7], rotatePositions: true, strings: [3, 2, 1] }, 3);
// A study in a key, written out by hand so that it does not wait on what the
// generator makes of one: F sharp minor in first position, with its leading
// note E sharp and a B sharp, spellings only a key calls for.
const KEYED = decodeScore({
  v: 2,
  seed: 4,
  tonality: 'F♯ minor',
  key: 'F#m',
  settings: settingsWith({ melody: 'musical', key: 'F#m', accidentals: 'sharps', positions: [1] }),
  measures: [
    { p: 1, n: [[42, 1, 4], [44, 1, 4], [45, 0, 4], [41, 1, 4]] },
    { p: 1, n: [[49, 1, 2], [48, 1, 2], [49, 1, 4], [53, 1, 4], [54, 1, 4]] }
  ]
});

// ---- Version 1 as the released app stored it -----------------------------
//
// A library exactly as version 0.2.0 of the app, the last one before keys,
// left it in localStorage: two studies in version 1 of the format, the later
// save first. This is the very text people have in their browsers. Do not
// regenerate it with today's code, and do not edit it to make a change pass:
// if a test on it fails, saved studies have stopped opening as they were.
const V1_PLAIN_ID = '3b0f6c1e-52a7-4d09-9a4e-7f1c2d8e6b35';
const V1_MIXOLYDIAN_ID = 'c7d2a9f4-1e6b-4c83-b05d-9a3e4f7b2c18';

// Random mode with the settings a new visitor had: accidentals off.
const V1_PLAIN_ENTRY = '{"id":"3b0f6c1e-52a7-4d09-9a4e-7f1c2d8e6b35","savedAt":1789000000000,"data":' +
  '{"v":1,"seed":4821,"tonality":null,' +
  '"settings":{"measures":16,"maxLeapSteps":7,"positions":[5],"rotatePositions":false,"strings":[6,5,4,3,2,1],"noteValues":["quarter"],"accidentals":false,"melody":"random"},' +
  '"measures":[' +
  '{"p":5,"n":[[50,0,4],[57,0,4],[45,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[52,0,4],[48,0,4],[47,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[53,0,4],[64,0,4],[52,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[57,0,4],[62,0,4],[53,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[69,0,4],[62,0,4],[64,0,4],[71,0,4]]},' +
  '{"p":5,"n":[[60,0,4],[71,0,4],[64,0,4],[67,0,4]]},' +
  '{"p":5,"n":[[71,0,4],[67,0,4],[57,0,4],[64,0,4]]},' +
  '{"p":5,"n":[[69,0,4],[60,0,4],[64,0,4],[72,0,4]]},' +
  '{"p":5,"n":[[64,0,4],[55,0,4],[62,0,4],[72,0,4]]},' +
  '{"p":5,"n":[[60,0,4],[65,0,4],[57,0,4],[62,0,4]]},' +
  '{"p":5,"n":[[52,0,4],[60,0,4],[52,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[64,0,4],[71,0,4],[72,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[65,0,4],[64,0,4],[65,0,4],[67,0,4]]},' +
  '{"p":5,"n":[[64,0,4],[69,0,4],[71,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[69,0,4],[64,0,4],[62,0,4],[67,0,4]]},' +
  '{"p":5,"n":[[65,0,4],[67,0,4],[64,0,4],[60,0,4]]}' +
  ']}}';

// Musical mode with the old accidentals switch on, in a mode that is no
// longer on offer. It has both sharps (C sharp, F sharp) and a flat (B flat).
const V1_MIXOLYDIAN_ENTRY = '{"id":"c7d2a9f4-1e6b-4c83-b05d-9a3e4f7b2c18","savedAt":1789000360000,"data":' +
  '{"v":1,"seed":31,"tonality":"G Mixolydian",' +
  '"settings":{"measures":16,"maxLeapSteps":7,"positions":[5],"rotatePositions":false,"strings":[6,5,4,3,2,1],"noteValues":["quarter","eighth"],"accidentals":true,"melody":"musical"},' +
  '"measures":[' +
  '{"p":5,"n":[[62,0,2],[61,1,2],[62,0,2],[64,0,2],[62,0,4],[65,0,4]]},' +
  '{"p":5,"n":[[67,0,4],[64,0,4],[62,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[64,0,2],[62,0,2],[57,0,2],[62,0,2],[60,0,4],[62,0,4]]},' +
  '{"p":5,"n":[[60,0,4],[55,0,4],[55,0,4],[57,0,4]]},' +
  '{"p":5,"n":[[55,0,2],[53,0,2],[52,0,2],[50,0,2],[53,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[57,0,4],[58,-1,4],[57,0,4],[58,-1,4]]},' +
  '{"p":5,"n":[[57,0,2],[55,0,2],[57,0,2],[60,0,2],[62,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[57,0,4],[55,0,4],[57,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[57,0,2],[60,0,2],[62,0,2],[60,0,2],[62,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[60,0,4],[62,0,4],[60,0,4],[61,1,4]]},' +
  '{"p":5,"n":[[62,0,2],[67,0,2],[66,1,2],[67,0,2],[71,0,4],[64,0,4]]},' +
  '{"p":5,"n":[[65,0,4],[62,0,4],[64,0,4],[65,0,4]]},' +
  '{"p":5,"n":[[67,0,2],[66,1,2],[67,0,2],[65,0,2],[67,0,4],[69,0,4]]},' +
  '{"p":5,"n":[[67,0,4],[66,1,4],[67,0,4],[65,0,4]]},' +
  '{"p":5,"n":[[62,0,2],[60,0,2],[60,0,2],[67,0,2],[65,0,4],[62,0,4]]},' +
  '{"p":5,"n":[[64,0,4],[65,0,4],[65,0,4],[67,0,4]]}' +
  ']}}';

const V1_LIBRARY = `[${V1_MIXOLYDIAN_ENTRY},${V1_PLAIN_ENTRY}]`;

// ---- Entries this version must not read ----------------------------------
//
// Text as some later version of the app might store it. Each is hidden by
// loadLibrary and has to come through every save and deletion byte for byte.

// A later format altogether: fields and shapes this version knows nothing of.
const LATER_FORMAT = '{"id":"0d9b7c2e-4f1a-4e86-a3d5-6c8e1f7b9a20","savedAt":1795000000000,"data":' +
  '{"v":3,"seed":2718,"tonality":"E♭ major","key":"Eb","tempo":72,"settings":{"strings":[6,5,4,3,2,1],"capo":3},' +
  '"measures":[{"p":1,"t":"3/4","n":[[51,-1,4,"tie"],[55,0,4],[58,-1,4]]}]}}';
// A later version whose data happens to read as version 2 would: the label
// alone says it is not for this version.
const LATER_LABEL = '{"id":"5a8e3f1c-7b2d-4c69-9e0a-1d4f6b8c2e73","savedAt":1795000000001,"data":' +
  '{"v":3,"seed":5,"tonality":"G major","key":"G","settings":{"strings":[6,5,4,3,2,1]},' +
  '"measures":[{"p":1,"n":[[43,0,4],[45,0,4],[47,0,4],[42,1,4]]}]}}';
// Version 2 in a key added after this version: E flat major.
const UNKNOWN_KEY = '{"id":"e2c4a6b8-0d1f-4357-8a9c-bd3e5f7a1c92","savedAt":1795000000002,"data":' +
  '{"v":2,"seed":6,"tonality":"E♭ major","key":"Eb","settings":{"strings":[6,5,4,3,2,1]},' +
  '"measures":[{"p":1,"n":[[51,-1,4],[53,0,4],[55,0,4],[56,-1,4]]}]}}';

const UNAVAILABLE = { ok: false, reason: 'unavailable' };
const QUOTA = { ok: false, reason: 'quota' };

// The ways browsers have said "no room left".
const QUOTA_ERRORS = [
  new DOMException('The quota has been exceeded.', 'QuotaExceededError'),
  new DOMException('Persistent storage maximum size reached', 'NS_ERROR_DOM_QUOTA_REACHED'),
  Object.assign(new Error('legacy'), { code: 22 }),
  Object.assign(new Error('legacy Firefox'), { code: 1014 }),
  { name: 'QuotaExceededError' }
];
const OTHER_ERRORS = [
  new Error('denied'), new TypeError('not a function'), new DOMException('denied', 'SecurityError'),
  Object.assign(new Error('other code'), { code: 18 }), { code: '22' }, 'a string', 22, null, undefined
];

// Thrown values that throw again when they are looked at: [label, value].
const unreadableErrors = () => {
  const boom = () => { throw new Error('boom'); };
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  return [
    ['a proxy', new Proxy({}, { get: boom })],
    ['a revoked proxy', revoked.proxy],
    ['a name that throws', { get name() { return boom(); } }],
    ['a code that throws', { get code() { return boom(); } }]
  ];
};

// The last millisecond a Date can hold, either side of the epoch.
const LAST_TIME = 8.64e15;

// Run with globalThis.localStorage defined as given, then put things back.
const withGlobalStorage = (descriptor, run) => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor });
  try {
    run();
  } finally {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete globalThis.localStorage;
  }
};

test('an empty storage holds an empty library', () => {
  assert.deepEqual(loadLibrary(memoryStorage()), []);
});

test('a saved score comes back note for note', () => {
  const storage = memoryStorage();
  for (const [index, score] of [A, B, C, KEYED].entries()) {
    const result = addToLibrary(score, { id: `id-${index}`, savedAt: 1000 + index }, storage);
    assert.equal(result.ok, true);
    assert.deepEqual(result.entries[0], { id: `id-${index}`, savedAt: 1000 + index, score });
  }
  assert.deepEqual(loadLibrary(storage), [
    { id: 'id-3', savedAt: 1003, score: KEYED },
    { id: 'id-2', savedAt: 1002, score: C },
    { id: 'id-1', savedAt: 1001, score: B },
    { id: 'id-0', savedAt: 1000, score: A }
  ]);
});

test('a study is saved as version 2, with its key and the spellings the key gave it', () => {
  // The scores these tests save: without a key, in C major, in F sharp minor.
  assert.deepEqual([A.key, B.key, KEYED.key], [null, 'C', 'F#m']);
  assert.deepEqual(allNotes(KEYED).map(note => pitchName(note.pitch)),
    ['F♯3', 'G♯3', 'A3', 'E♯3', 'C♯4', 'B♯3', 'C♯4', 'E♯4', 'F♯4']);

  const storage = memoryStorage();
  addToLibrary(A, { id: 'a', savedAt: 1 }, storage);
  addToLibrary(B, { id: 'b', savedAt: 2 }, storage);
  addToLibrary(KEYED, { id: 'k', savedAt: 3 }, storage);
  const [k, b, a] = stored(storage).map(entry => entry.data);
  assert.deepEqual([a.v, b.v, k.v], [2, 2, 2]);
  // A study without a key says so: the field is written, as null.
  assert.deepEqual(Object.keys(a), ['v', 'seed', 'tonality', 'key', 'settings', 'measures']);
  assert.deepEqual([a.key, b.key, k.key], [null, 'C', 'F#m']);
  assert.deepEqual([a.tonality, b.tonality, k.tonality], [null, 'C major', 'F♯ minor']);
  assert.equal(JSON.stringify(k.measures),
    '[{"p":1,"n":[[42,1,4],[44,1,4],[45,0,4],[41,1,4]]},{"p":1,"n":[[49,1,2],[48,1,2],[49,1,4],[53,1,4],[54,1,4]]}]');
  assert.deepEqual(loadLibrary(storage)[0], { id: 'k', savedAt: 3, score: KEYED });
});

test('the stored value is a JSON list of { id, savedAt, data } under the library key', () => {
  assert.equal(LIBRARY_KEY, 'guitar-reading-assistant.library.v1');
  const storage = memoryStorage();
  addToLibrary(A, { id: 'a', savedAt: 1700000000000 }, storage);
  addToLibrary(B, { id: 'b', savedAt: 1700000000001 }, storage);
  assert.deepEqual(storage.keys(), [LIBRARY_KEY]);
  const byId = stored(storage).sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(byId, [
    { id: 'a', savedAt: 1700000000000, data: throughJson(encodeScore(A)) },
    { id: 'b', savedAt: 1700000000001, data: throughJson(encodeScore(B)) }
  ]);
});

test('add and remove report exactly what loadLibrary then returns', () => {
  const storage = memoryStorage(textOf({ id: 'future', savedAt: 9, data: { v: 3 } }));
  const steps = [
    () => addToLibrary(A, { id: 'a', savedAt: 3 }, storage),
    () => addToLibrary(B, { id: 'b', savedAt: 1 }, storage),
    () => addToLibrary(C, { id: 'a', savedAt: 2 }, storage),
    () => removeFromLibrary('nobody', storage),
    () => removeFromLibrary('b', storage),
    () => removeFromLibrary('a', storage)
  ];
  const sizes = steps.map(step => {
    const result = step();
    assert.equal(result.ok, true);
    assert.deepEqual(result.entries, loadLibrary(storage));
    return result.entries.length;
  });
  assert.deepEqual(sizes, [1, 2, 2, 2, 1, 0]);
});

test('the library is listed newest first', () => {
  const storage = memoryStorage();
  addToLibrary(A, { id: 'middle', savedAt: 200 }, storage);
  addToLibrary(B, { id: 'newest', savedAt: 300 }, storage);
  const { entries } = addToLibrary(C, { id: 'oldest', savedAt: 100 }, storage);
  assert.deepEqual(ids(entries), ['newest', 'middle', 'oldest']);
  assert.deepEqual(entries.map(entry => entry.savedAt), [300, 200, 100]);
});

test('entries saved at the same time keep their stored order', () => {
  const text = textOf(raw('a', 5, A), raw('b', 5, B), raw('c', 9, C), raw('d', 5, A), raw('e', 1, B), raw('f', 5, C));
  assert.deepEqual(ids(loadLibrary(memoryStorage(text))), ['c', 'a', 'b', 'd', 'f', 'e']);
});

test('of two saves in the same millisecond the later one is listed first', () => {
  const storage = memoryStorage();
  addToLibrary(A, { id: 'first', savedAt: 50 }, storage);
  addToLibrary(B, { id: 'second', savedAt: 50 }, storage);
  assert.deepEqual(ids(addToLibrary(C, { id: 'third', savedAt: 50 }, storage).entries), ['third', 'second', 'first']);
});

test('saving under an existing id replaces that entry', () => {
  const storage = memoryStorage();
  addToLibrary(A, { id: 'keep', savedAt: 1 }, storage);
  addToLibrary(B, { id: 'same', savedAt: 2 }, storage);
  const result = addToLibrary(C, { id: 'same', savedAt: 3 }, storage);
  assert.deepEqual(result, {
    ok: true,
    entries: [{ id: 'same', savedAt: 3, score: C }, { id: 'keep', savedAt: 1, score: A }]
  });
  assert.equal(stored(storage).length, 2);

  // Even when a hand-edited list holds the id more than once.
  const doubled = memoryStorage(textOf(raw('same', 1, A), raw('keep', 2, B), raw('same', 3, A)));
  assert.deepEqual(ids(addToLibrary(C, { id: 'same', savedAt: 4 }, doubled).entries), ['same', 'keep']);
  assert.equal(stored(doubled).length, 2);
});

test('removing an entry leaves the others as they were', () => {
  const storage = memoryStorage();
  addToLibrary(A, { id: 'a', savedAt: 1 }, storage);
  addToLibrary(B, { id: 'b', savedAt: 2 }, storage);
  addToLibrary(C, { id: 'c', savedAt: 3 }, storage);
  assert.deepEqual(removeFromLibrary('b', storage), {
    ok: true,
    entries: [{ id: 'c', savedAt: 3, score: C }, { id: 'a', savedAt: 1, score: A }]
  });
  assert.deepEqual(ids(stored(storage)).sort(), ['a', 'c']);
  assert.deepEqual(removeFromLibrary('a', storage).entries, [{ id: 'c', savedAt: 3, score: C }]);
  assert.deepEqual(removeFromLibrary('c', storage), { ok: true, entries: [] });
  assert.deepEqual(stored(storage), []);
});

test('removing an unknown id is fine and writes nothing', () => {
  const storage = memoryStorage();
  assert.deepEqual(removeFromLibrary('nobody', storage), { ok: true, entries: [] });
  addToLibrary(A, { id: 'a', savedAt: 1 }, storage);
  const before = storage.getItem(LIBRARY_KEY);
  for (const id of ['nobody', '', 'A', undefined, null, 1, {}]) {
    assert.deepEqual(removeFromLibrary(id, storage), { ok: true, entries: [{ id: 'a', savedAt: 1, score: A }] });
  }
  assert.equal(storage.getItem(LIBRARY_KEY), before);
  assert.equal(storage.writes, 1);

  // Nothing to write, so even a storage that refuses writes is no obstacle.
  const readOnly = refusingStorage(new Error('read only'), before);
  assert.deepEqual(removeFromLibrary('nobody', readOnly), { ok: true, entries: [{ id: 'a', savedAt: 1, score: A }] });
});

test('an id that is not a non-empty string removes nothing, not even entries without an id', () => {
  // Raw entries of some other format: no id, an id of another kind, or not an
  // object at all. Compared carelessly, undefined would match most of them.
  const unreadable = [
    { savedAt: 10, data: { v: 3, bars: [] } },
    { id: null, savedAt: 11, data: { v: 3 } },
    { id: '', savedAt: 12, data: encodeScore(A) },
    { id: 9, savedAt: 13, data: encodeScore(A) },
    { id: true, savedAt: 14, data: encodeScore(A) },
    42, null, 'text', true, [], [1, 2], {}
  ];
  const before = JSON.stringify([...unreadable.slice(0, 6), raw('a', 1, A), ...unreadable.slice(6)]);
  const unknown = { ok: true, entries: [{ id: 'a', savedAt: 1, score: A }] };
  const storage = memoryStorage(before);
  // A storage that refuses writes agrees: there is nothing to write.
  const readOnly = refusingStorage(new Error('read only'), before);

  for (const id of [undefined, null, '', 9, 0, 1, NaN, true, false, {}, [], ['a']]) {
    assert.deepEqual(removeFromLibrary(id, storage), unknown, `id ${inspect(id)}`);
    assert.equal(storage.getItem(LIBRARY_KEY), before, `id ${inspect(id)}`);
    assert.deepEqual(removeFromLibrary(id, readOnly), unknown, `id ${inspect(id)}`);
  }
  assert.equal(storage.writes, 0);

  // A real id still removes its entry, and only that one.
  assert.deepEqual(removeFromLibrary('a', storage), { ok: true, entries: [] });
  assert.deepEqual(stored(storage), throughJson(unreadable));
});

test('entries this version cannot read are hidden, and kept through add and remove', () => {
  const unreadable = [
    { id: 'future', savedAt: 5, data: { v: 3, bars: [[1, 2, 3]], swing: true } },
    { id: 'later-label', savedAt: 5, data: { ...encodeScore(A), v: 3 } },
    { id: 'later-key', savedAt: 5, data: { ...encodeScore(B), key: 'Eb' } },
    { id: 'no-key', savedAt: 5, data: { ...encodeScore(A), key: undefined } },
    { id: 'no-measures', savedAt: 6, data: { ...encodeScore(A), measures: [] } },
    { id: 'no-data', savedAt: 7 },
    { id: '', savedAt: 8, data: encodeScore(A) },
    { id: 9, savedAt: 9, data: encodeScore(A) },
    { savedAt: 10, data: encodeScore(A) },
    { id: 'text-time', savedAt: '11', data: encodeScore(A) },
    { id: 'no-time', data: encodeScore(A) },
    { id: 'null-time', savedAt: null, data: encodeScore(A) },
    { id: 'nanoseconds', savedAt: 1.7e18, data: encodeScore(A) },
    { id: 'past-the-last-day', savedAt: LAST_TIME + 1, data: encodeScore(A) },
    { id: 'before-the-first-day', savedAt: -LAST_TIME - 1, data: encodeScore(A) },
    42, null, 'text', true, [], [raw('nested', 12, A)]
  ];
  // The one readable entry sits in the middle of the unreadable ones.
  const all = [...unreadable.slice(0, 7), raw('a', 1, A), ...unreadable.slice(7)];
  const storage = memoryStorage(JSON.stringify(all));
  const kept = () => stored(storage).filter(entry => !['a', 'b'].includes(entry?.id));

  assert.deepEqual(loadLibrary(storage), [{ id: 'a', savedAt: 1, score: A }]);

  assert.deepEqual(ids(addToLibrary(B, { id: 'b', savedAt: 2 }, storage).entries), ['b', 'a']);
  assert.equal(stored(storage).length, unreadable.length + 2);
  assert.deepEqual(kept(), throughJson(unreadable));

  assert.deepEqual(ids(addToLibrary(C, { id: 'a', savedAt: 3 }, storage).entries), ['a', 'b']);
  assert.deepEqual(kept(), throughJson(unreadable));

  assert.deepEqual(ids(removeFromLibrary('a', storage).entries), ['b']);
  assert.deepEqual(ids(removeFromLibrary('b', storage).entries), []);
  assert.deepEqual(stored(storage), throughJson(unreadable));
  assert.deepEqual(loadLibrary(storage), []);
});

test('studies of a later version, or in a key this version does not know, are hidden and kept byte for byte', () => {
  const hidden = [LATER_FORMAT, LATER_LABEL, UNKNOWN_KEY];
  // Each is text as JSON.stringify writes it, so a list that is parsed and
  // written again can give the same bytes back.
  for (const text of hidden) assert.equal(JSON.stringify(JSON.parse(text)), text);
  const alone = text => loadLibrary(memoryStorage(`[${text}]`));
  for (const text of hidden) assert.deepEqual(alone(text), []);
  // The version alone hides the second, and the key alone the third.
  assert.equal(alone(LATER_LABEL.replace('"v":3', '"v":2'))[0].score.key, 'G');
  assert.equal(alone(UNKNOWN_KEY.replace('"key":"Eb"', '"key":"Bb"'))[0].score.key, 'Bb');

  const a = JSON.stringify(raw('a', 1, A));
  const storage = memoryStorage(`[${LATER_FORMAT},${a},${LATER_LABEL},${UNKNOWN_KEY}]`);
  const text = () => storage.getItem(LIBRARY_KEY);
  assert.deepEqual(loadLibrary(storage), [{ id: 'a', savedAt: 1, score: A }]);
  assert.equal(storage.writes, 0);

  const b = JSON.stringify(raw('b', 2, B));
  assert.deepEqual(ids(addToLibrary(B, { id: 'b', savedAt: 2 }, storage).entries), ['b', 'a']);
  assert.equal(text(), `[${b},${LATER_FORMAT},${a},${LATER_LABEL},${UNKNOWN_KEY}]`);

  // Saving over 'a' replaces that entry and no other.
  const k = JSON.stringify(raw('a', 3, KEYED));
  assert.deepEqual(ids(addToLibrary(KEYED, { id: 'a', savedAt: 3 }, storage).entries), ['a', 'b']);
  assert.equal(text(), `[${k},${b},${LATER_FORMAT},${LATER_LABEL},${UNKNOWN_KEY}]`);

  assert.deepEqual(ids(removeFromLibrary('b', storage).entries), ['a']);
  assert.equal(text(), `[${k},${LATER_FORMAT},${LATER_LABEL},${UNKNOWN_KEY}]`);
  assert.deepEqual(removeFromLibrary('a', storage), { ok: true, entries: [] });
  assert.equal(text(), `[${LATER_FORMAT},${LATER_LABEL},${UNKNOWN_KEY}]`);
  assert.equal(storage.writes, 4);
});

test('a library saved before keys existed loads, with its settings brought up to date', () => {
  const storage = memoryStorage(V1_LIBRARY);
  const entries = loadLibrary(storage);
  assert.deepEqual(entries.map(entry => [entry.id, entry.savedAt]),
    [[V1_MIXOLYDIAN_ID, 1789000360000], [V1_PLAIN_ID, 1789000000000]]);
  const [mixolydian, plain] = entries.map(entry => entry.score);

  // The old accidentals switch reads as 'sharps' when it was on and 'none'
  // when it was off, and the settings gain the default key.
  assert.deepEqual(mixolydian.settings, {
    measures: 16, maxLeapSteps: 7, positions: [5], rotatePositions: false,
    strings: [6, 5, 4, 3, 2, 1], noteValues: ['quarter', 'eighth'], accidentals: 'sharps', melody: 'musical', key: 'C'
  });
  assert.deepEqual(plain.settings, {
    measures: 16, maxLeapSteps: 7, positions: [5], rotatePositions: false,
    strings: [6, 5, 4, 3, 2, 1], noteValues: ['quarter'], accidentals: 'none', melody: 'random', key: 'C'
  });
  // The study itself has no key, whatever its settings now say, and keeps the
  // label it was saved with.
  assert.deepEqual([mixolydian.seed, mixolydian.key, mixolydian.tonality], [31, null, 'G Mixolydian']);
  assert.deepEqual([plain.seed, plain.key, plain.tonality], [4821, null, null]);
  assert.deepEqual(Object.keys(plain).sort(), ['key', 'measures', 'seed', 'settings', 'tonality']);

  // The notes are the stored ones, written as they were.
  const names = (score, measure) => score.measures[measure - 1].notes.map(note => pitchName(note.pitch));
  assert.deepEqual(names(mixolydian, 1), ['D5', 'C♯5', 'D5', 'E5', 'D5', 'F5']);
  assert.deepEqual(names(mixolydian, 6), ['A4', 'B♭4', 'A4', 'B♭4']);
  assert.deepEqual(names(mixolydian, 11), ['D5', 'G5', 'F♯5', 'G5', 'B5', 'E5']);
  assert.deepEqual(names(plain, 1), ['D4', 'A4', 'A3', 'G4']);
  assert.deepEqual(names(plain, 16), ['F5', 'G5', 'E5', 'C5']);
  assert.deepEqual(mixolydian.measures[0].notes.map(note => [note.start, note.dur]), [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 4]]);
  for (const [text, score] of [[V1_MIXOLYDIAN_ENTRY, mixolydian], [V1_PLAIN_ENTRY, plain]]) {
    const { data } = JSON.parse(text);
    assert.equal(data.v, 1);
    assert.equal(score.measures.length, 16);
    assert.deepEqual(
      score.measures.map(m => ({ p: m.position, n: m.notes.map(n => [n.pitch.value, n.pitch.alter, n.dur]) })),
      data.measures);
    assert.deepEqual(score, { ...decodeScore(data), settings: sanitize(data.settings) });
  }

  // Loading changes nothing in storage.
  assert.equal(storage.writes, 0);
  assert.equal(storage.getItem(LIBRARY_KEY), V1_LIBRARY);
});

test('version-1 entries are never rewritten: saves and deletions beside them leave their text as it was', () => {
  const storage = memoryStorage(V1_LIBRARY);
  const text = () => storage.getItem(LIBRARY_KEY);
  const before = loadLibrary(storage);
  const newA = JSON.stringify(raw('new-a', 1790000000000, A));
  const newK = JSON.stringify(raw('new-k', 1790000000001, KEYED));

  assert.equal(addToLibrary(A, { id: 'new-a', savedAt: 1790000000000 }, storage).ok, true);
  assert.equal(text(), `[${newA},${V1_MIXOLYDIAN_ENTRY},${V1_PLAIN_ENTRY}]`);
  const { entries } = addToLibrary(KEYED, { id: 'new-k', savedAt: 1790000000001 }, storage);
  assert.equal(text(), `[${newK},${newA},${V1_MIXOLYDIAN_ENTRY},${V1_PLAIN_ENTRY}]`);
  // The new saves are version 2. The old entries are still version 1, and
  // load as they did before anything was saved beside them.
  assert.deepEqual(stored(storage).map(entry => entry.data.v), [2, 2, 1, 1]);
  assert.deepEqual(ids(entries), ['new-k', 'new-a', V1_MIXOLYDIAN_ID, V1_PLAIN_ID]);
  assert.deepEqual(entries.slice(2), before);

  assert.equal(removeFromLibrary('new-a', storage).ok, true);
  assert.equal(text(), `[${newK},${V1_MIXOLYDIAN_ENTRY},${V1_PLAIN_ENTRY}]`);
  // Deleting one old study leaves the other as it was.
  assert.equal(removeFromLibrary(V1_PLAIN_ID, storage).ok, true);
  assert.equal(text(), `[${newK},${V1_MIXOLYDIAN_ENTRY}]`);
  assert.deepEqual(removeFromLibrary('new-k', storage), { ok: true, entries: [before[0]] });
  assert.equal(text(), `[${V1_MIXOLYDIAN_ENTRY}]`);
});

test('a study loaded from a version-1 entry and saved again is the same study, stored as version 2', () => {
  const storage = memoryStorage(V1_LIBRARY);
  const [{ score }] = loadLibrary(storage);
  const result = addToLibrary(score, { id: 'again', savedAt: 1790000000000 }, storage);
  assert.deepEqual(result.entries[0], { id: 'again', savedAt: 1790000000000, score });

  const [again, old] = stored(storage);
  assert.deepEqual([again.data.v, again.data.key, again.data.tonality], [2, null, 'G Mixolydian']);
  assert.deepEqual([old.data.v, 'key' in old.data, old.data.tonality], [1, false, 'G Mixolydian']);
  assert.deepEqual(again.data.measures, old.data.measures);
  // It is stored with the settings it was loaded with, the up-to-date ones.
  assert.deepEqual(again.data.settings, score.settings);
  // The entry it came from is still there, to the letter.
  assert.equal(storage.getItem(LIBRARY_KEY), `[${JSON.stringify(again)},${V1_MIXOLYDIAN_ENTRY},${V1_PLAIN_ENTRY}]`);
});

test('the key of a loaded study is the stored key, not the one in its settings', () => {
  const n = [[43, 0, 4], [45, 0, 4], [47, 0, 4], [42, 1, 4]];
  const load = (key, settings) => {
    const data = { v: 2, seed: 8, tonality: null, key, settings: { strings: [6, 5, 4, 3, 2, 1], ...settings }, measures: [{ p: 1, n }] };
    return loadLibrary(memoryStorage(textOf({ id: 'x', savedAt: 1, data })))[0].score;
  };
  // Random mode has no key, though its settings remember the one last chosen.
  const random = load(null, { melody: 'random', key: 'D' });
  assert.deepEqual([random.key, random.settings.key, random.settings.melody], [null, 'D', 'random']);
  // Settings in need of repair get the default key; the study keeps its own.
  const repaired = load('G', { melody: 'musical', key: 'nonsense' });
  assert.deepEqual([repaired.key, repaired.settings.key, repaired.settings.melody], ['G', 'C', 'musical']);
  const bare = load('F#m', {});
  assert.deepEqual([bare.key, bare.settings.key, bare.settings.melody], ['F#m', 'C', 'random']);
});

test('loaded settings are brought up to date, whatever was stored', () => {
  // Stored by some other version: strings out of order, a mode and a position
  // that do not exist, a setting missing and one unknown. Every note is on an
  // enabled string.
  const settings = { strings: [1, 6], positions: [12, 99, 1], melody: 'jazz', accidentals: 'yes', tempo: 60 };
  const n = [[40, 0, 4], [64, 0, 4], [41, 0, 2], [41, 0, 2], [65, 0, 4]];
  const data = { v: 1, seed: 8, tonality: null, settings, measures: [{ p: 1, n }] };
  const [entry] = loadLibrary(memoryStorage(textOf({ id: 'old', savedAt: 1, data })));

  assert.deepEqual(entry.score.settings, sanitize(settings));
  assert.deepEqual(entry.score.settings, {
    measures: 16, maxLeapSteps: 7, positions: [1, 12], rotatePositions: false,
    strings: [6, 1], noteValues: ['quarter'], accidentals: 'none', melody: 'random', key: 'C'
  });
  // The notes are the stored ones all the same, and a study of version 1 has
  // no key, though its settings have just been given one.
  assert.equal(entry.score.key, null);
  assert.equal(entry.score.seed, 8);
  assert.deepEqual(entry.score.measures[0].notes.map(note => [note.pitch.value, note.start, note.dur]),
    [[40, 0, 4], [64, 4, 4], [41, 8, 2], [41, 10, 2], [65, 12, 4]]);
  assert.deepEqual(entry.score.measures[0].notes[1].pitch.fingerings, [{ string: 1, fret: 0, finger: 0 }]);
});

test('settings are stored as the score has them, and brought up to date only on loading', () => {
  // Settings no panel produces: the strings the other way round, and a
  // setting this version does not know.
  const odd = structuredClone(A);
  odd.settings.strings = [1, 2, 3, 4, 5, 6];
  odd.settings.tempo = 60;
  assert.notDeepEqual(sanitize(odd.settings), odd.settings);

  const storage = memoryStorage();
  const result = addToLibrary(odd, { id: 'odd', savedAt: 1 }, storage);
  assert.deepEqual(stored(storage), [{ id: 'odd', savedAt: 1, data: throughJson(encodeScore(odd)) }]);
  assert.deepEqual(stored(storage)[0].data.settings, odd.settings);
  // Loaded, it is the same study under this version's settings.
  assert.deepEqual(result, { ok: true, entries: [{ id: 'odd', savedAt: 1, score: A }] });
  assert.deepEqual(result.entries[0].score.settings, sanitize(odd.settings));
});

test('every time a Date can hold is a saved time, and nothing beyond is', () => {
  // The page shows each entry's time as a date, and a number past the reach of
  // Date (a time in nanoseconds, say) cannot be shown: formatting it throws.
  const isDate = time => !Number.isNaN(new Date(time).getTime());
  const times = [
    0, -1, 1.5, 1700000000000, LAST_TIME, -LAST_TIME,
    LAST_TIME + 1, -LAST_TIME - 1, 9e15, 1e16, 1.7e18, -1e300, Number.MAX_VALUE, -Number.MAX_VALUE
  ];
  const storage = memoryStorage(textOf(...times.map(time => raw(`at ${time}`, time, A))));
  const before = storage.getItem(LIBRARY_KEY);

  const listed = loadLibrary(storage).map(entry => entry.savedAt);
  assert.deepEqual(listed, [LAST_TIME, 1700000000000, 1.5, 0, -1, -LAST_TIME]);
  assert.deepEqual(listed, times.filter(isDate).sort((a, b) => b - a));

  // Saving follows the same rule, and a refused save writes nothing.
  for (const time of times.filter(time => !isDate(time))) {
    assert.deepEqual(addToLibrary(B, { id: 'b', savedAt: time }, storage), UNAVAILABLE, `savedAt ${time}`);
  }
  assert.equal(storage.getItem(LIBRARY_KEY), before);
  for (const time of [LAST_TIME, -LAST_TIME]) {
    const fresh = memoryStorage();
    assert.deepEqual(addToLibrary(B, { id: 'b', savedAt: time }, fresh), {
      ok: true,
      entries: [{ id: 'b', savedAt: time, score: B }]
    });
  }
});

const CORRUPT = ['{not json', '', ' ', 'null', 'true', '42', '"text"', '{}', '{"id":"a"}', '[', 'undefined'];

test('a corrupt or non-list stored value loads as an empty library', () => {
  for (const text of [...CORRUPT, '[]', '[[]]', '[null]', '[{}]']) {
    assert.deepEqual(loadLibrary(memoryStorage(text)), [], text);
  }
});

test('adding to a corrupt stored value starts a fresh list', () => {
  for (const text of CORRUPT) {
    const storage = memoryStorage(text);
    assert.deepEqual(addToLibrary(A, { id: 'a', savedAt: 1 }, storage), {
      ok: true,
      entries: [{ id: 'a', savedAt: 1, score: A }]
    }, text);
    assert.deepEqual(stored(storage), [throughJson(raw('a', 1, A))], text);
  }
});

test('removing from a corrupt stored value finds nothing and leaves it alone', () => {
  for (const text of CORRUPT) {
    const storage = memoryStorage(text);
    assert.deepEqual(removeFromLibrary('a', storage), { ok: true, entries: [] }, text);
    assert.equal(storage.getItem(LIBRARY_KEY), text);
    assert.equal(storage.writes, 0);
  }
});

test('a full storage reports "quota" and keeps what it had', () => {
  const before = textOf(raw('a', 1, A), { id: 'future', savedAt: 2, data: { v: 3 } });
  for (const error of QUOTA_ERRORS) {
    const storage = refusingStorage(error, before);
    assert.deepEqual(addToLibrary(B, { id: 'b', savedAt: 3 }, storage), QUOTA, inspect(error));
    assert.deepEqual(addToLibrary(B, { id: 'a', savedAt: 3 }, storage), QUOTA, inspect(error));
    assert.deepEqual(removeFromLibrary('a', storage), QUOTA, inspect(error));
    assert.equal(storage.getItem(LIBRARY_KEY), before);
    assert.deepEqual(loadLibrary(storage), [{ id: 'a', savedAt: 1, score: A }]);

    const empty = refusingStorage(error);
    assert.deepEqual(addToLibrary(B, { id: 'b', savedAt: 3 }, empty), QUOTA, inspect(error));
    assert.equal(empty.getItem(LIBRARY_KEY), null);
  }
});

test('any other failed write reports "unavailable" and keeps what it had', () => {
  const before = textOf(raw('a', 1, A));
  for (const error of OTHER_ERRORS) {
    const storage = refusingStorage(error, before);
    assert.deepEqual(addToLibrary(B, { id: 'b', savedAt: 3 }, storage), UNAVAILABLE, inspect(error));
    assert.deepEqual(removeFromLibrary('a', storage), UNAVAILABLE, inspect(error));
    assert.equal(storage.getItem(LIBRARY_KEY), before);
    assert.deepEqual(loadLibrary(storage), [{ id: 'a', savedAt: 1, score: A }]);
  }
});

test('a library that outgrows its storage keeps every earlier save', () => {
  // Like a browser: a write that would pass the limit throws and changes nothing.
  const LIMIT = 10000;
  const inner = memoryStorage();
  const storage = {
    getItem: inner.getItem,
    setItem(key, value) {
      if (String(value).length > LIMIT) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      inner.setItem(key, value);
    }
  };
  const saved = [];
  let result;
  for (let i = 0; i < 100; i++) {
    result = addToLibrary(scoreWith({}, i + 1), { id: `study-${i}`, savedAt: i }, storage);
    if (!result.ok) break;
    saved.unshift(`study-${i}`);
  }
  assert.deepEqual(result, QUOTA);
  // A quarter-note study takes about 1,070 characters with its id and time.
  assert.equal(saved.length, 9);
  assert.deepEqual(ids(loadLibrary(storage)), saved);
  // Making room makes the next save succeed.
  assert.equal(removeFromLibrary('study-0', storage).ok, true);
  assert.deepEqual(ids(addToLibrary(A, { id: 'late', savedAt: 500 }, storage).entries), ['late', ...saved.slice(0, -1)]);
});

test('a storage that throws on everything never makes the library throw', () => {
  const blocked = blockedStorage();
  assert.deepEqual(loadLibrary(blocked), []);
  assert.deepEqual(addToLibrary(A, { id: 'a', savedAt: 1 }, blocked), UNAVAILABLE);
  assert.deepEqual(removeFromLibrary('a', blocked), UNAVAILABLE);

  // Whatever is thrown, even nothing at all.
  const odd = { getItem() { throw null; }, setItem() { throw undefined; } };
  assert.deepEqual(loadLibrary(odd), []);
  assert.deepEqual(addToLibrary(A, { id: 'a', savedAt: 1 }, odd), UNAVAILABLE);
  assert.deepEqual(removeFromLibrary('a', odd), UNAVAILABLE);
});

test('a thrown value that cannot even be looked at is reported as "unavailable"', () => {
  const before = textOf(raw('a', 1, A));
  for (const [label, error] of unreadableErrors()) {
    // Thrown by a write, with the stored value left as it was.
    const refusing = refusingStorage(error, before);
    assert.deepEqual(addToLibrary(B, { id: 'b', savedAt: 3 }, refusing), UNAVAILABLE, label);
    assert.deepEqual(removeFromLibrary('a', refusing), UNAVAILABLE, label);
    assert.equal(refusing.getItem(LIBRARY_KEY), before, label);

    // Thrown by a read.
    const blocked = { getItem() { throw error; }, setItem() { throw error; } };
    assert.deepEqual(loadLibrary(blocked), [], label);
    assert.deepEqual(addToLibrary(B, { id: 'b', savedAt: 3 }, blocked), UNAVAILABLE, label);
    assert.deepEqual(removeFromLibrary('a', blocked), UNAVAILABLE, label);

    // Thrown by what the caller handed over.
    const storage = memoryStorage(before);
    assert.deepEqual(addToLibrary(B, { get id() { throw error; }, savedAt: 3 }, storage), UNAVAILABLE, label);
    assert.deepEqual(addToLibrary({ get seed() { throw error; } }, { id: 'b', savedAt: 3 }, storage), UNAVAILABLE, label);
    assert.equal(storage.writes, 0, label);
  }
});

test('things that are not a storage behave like a blocked one', () => {
  for (const storage of [null, {}, 7, 'localStorage', [], { getItem: 'no', setItem: 'no' }, { getItem: () => ({}) }]) {
    assert.deepEqual(loadLibrary(storage), [], inspect(storage));
    assert.deepEqual(addToLibrary(A, { id: 'a', savedAt: 1 }, storage), UNAVAILABLE, inspect(storage));
  }
  for (const storage of [null, {}, 7, 'localStorage', []]) {
    assert.deepEqual(removeFromLibrary('a', storage), UNAVAILABLE, inspect(storage));
  }
});

test('the storage defaults to the global localStorage', () => {
  const storage = memoryStorage();
  withGlobalStorage({ value: storage }, () => {
    assert.deepEqual(loadLibrary(), []);
    assert.deepEqual(ids(addToLibrary(A, { id: 'a', savedAt: 1 }).entries), ['a']);
    assert.deepEqual(ids(addToLibrary(B, { id: 'b', savedAt: 2 }).entries), ['b', 'a']);
    assert.deepEqual(ids(removeFromLibrary('a').entries), ['b']);
    assert.deepEqual(loadLibrary(), [{ id: 'b', savedAt: 2, score: B }]);
    assert.deepEqual(loadLibrary(undefined), [{ id: 'b', savedAt: 2, score: B }]);

    // Only a missing argument asks for the default; null is no storage at all.
    assert.deepEqual(loadLibrary(null), []);
    assert.deepEqual(addToLibrary(C, { id: 'c', savedAt: 3 }, null), UNAVAILABLE);
    assert.deepEqual(removeFromLibrary('b', null), UNAVAILABLE);
  });
  assert.deepEqual(ids(loadLibrary(storage)), ['b']);
  assert.equal(storage.writes, 3);
});

test('a missing global localStorage behaves like a blocked one', () => {
  withGlobalStorage({ value: undefined }, () => {
    assert.deepEqual(loadLibrary(), []);
    assert.deepEqual(addToLibrary(A, { id: 'a', savedAt: 1 }), UNAVAILABLE);
    assert.deepEqual(removeFromLibrary('a'), UNAVAILABLE);
  });
});

test('a global localStorage that throws when merely read does not make the library throw', () => {
  // Firefox with cookies refused, or a sandboxed frame: the property itself throws.
  const get = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
  withGlobalStorage({ get }, () => {
    assert.throws(() => globalThis.localStorage, { name: 'SecurityError' });
    assert.deepEqual(loadLibrary(), []);
    assert.deepEqual(addToLibrary(A, { id: 'a', savedAt: 1 }), UNAVAILABLE);
    assert.deepEqual(removeFromLibrary('a'), UNAVAILABLE);
  });
});

test('nothing is stored that could not be read back', () => {
  const storage = memoryStorage(textOf(raw('a', 1, A)));
  const before = storage.getItem(LIBRARY_KEY);
  const refuse = (score, meta, label) => {
    assert.deepEqual(addToLibrary(score, meta, storage), UNAVAILABLE, label);
    assert.equal(storage.getItem(LIBRARY_KEY), before, label);
  };

  for (const id of ['', undefined, null, 7, ['b'], { id: 'b' }]) refuse(B, { id, savedAt: 2 }, `id ${inspect(id)}`);
  // The last three are numbers, but past the reach of a Date.
  for (const savedAt of [undefined, null, NaN, Infinity, -Infinity, '2', new Date(2), [2], LAST_TIME + 1, -LAST_TIME - 1, 1.7e18]) {
    refuse(B, { id: 'b', savedAt }, `savedAt ${inspect(savedAt)}`);
  }
  for (const meta of [undefined, null, {}, 'b', 2]) refuse(B, meta, `meta ${inspect(meta)}`);

  // Not a score, or a score whose notes its own positions cannot play.
  for (const score of [undefined, null, {}, 'score', encodeScore(B), { ...B, measures: [] }]) {
    refuse(score, { id: 'b', savedAt: 2 }, `score ${inspect(score).slice(0, 40)}`);
  }
  const tooLow = structuredClone(B);
  tooLow.measures[0].notes[0].pitch.value = 39; // a semitone below the open sixth string
  refuse(tooLow, { id: 'b', savedAt: 2 }, 'a note no position can play');
  const moved = structuredClone(A); // fifth position, so it has notes below twelfth position's B3
  for (const measure of moved.measures) measure.position = 12;
  refuse(moved, { id: 'b', savedAt: 2 }, 'measures moved out of reach');
  const tied = structuredClone(A);
  tied.measures[0].notes[0].dur = 8;
  refuse(tied, { id: 'b', savedAt: 2 }, 'a half note');

  // A key that is not on offer, or no word about the key at all: null is the
  // only way to say that a study has none.
  for (const key of ['H', 'Eb', 'C major', '', 0, false, undefined, {}, ['C']]) {
    refuse({ ...KEYED, key }, { id: 'b', savedAt: 2 }, `key ${inspect(key)}`);
  }
  const { key, ...keyless } = A;
  assert.equal(key, null);
  refuse(keyless, { id: 'b', savedAt: 2 }, 'a score with no key field');
  // A spelling no note has.
  const plainBlack = structuredClone(KEYED);
  plainBlack.measures[0].notes[0].pitch.alter = 0; // F sharp without its sharp
  refuse(plainBlack, { id: 'b', savedAt: 2 }, 'a black key written plain');

  assert.equal(storage.writes, 0);
});

test('the same calls always store the same text, with the id and time given', () => {
  const run = () => {
    const storage = memoryStorage();
    addToLibrary(A, { id: 'a', savedAt: 0 }, storage);
    addToLibrary(B, { id: 'b', savedAt: -1 }, storage);
    addToLibrary(C, { id: 'c', savedAt: 1.5 }, storage);
    removeFromLibrary('b', storage);
    return storage.getItem(LIBRARY_KEY);
  };
  const text = run();
  assert.equal(run(), text);
  // No clock and no dice: ids and times are the caller's, to the letter.
  assert.deepEqual(JSON.parse(text).map(entry => [entry.id, entry.savedAt]).sort(), [['a', 0], ['c', 1.5]]);
});

test('loading does not write, and what it returns is not shared between calls', () => {
  const storage = memoryStorage(textOf(raw('a', 1, A), { id: 'future', savedAt: 2, data: { v: 3 } }));
  const first = loadLibrary(storage);
  first[0].score.settings.strings.length = 0;
  first[0].score.measures.length = 0;
  first.length = 0;
  assert.deepEqual(loadLibrary(storage), [{ id: 'a', savedAt: 1, score: A }]);
  assert.equal(storage.writes, 0);
});
