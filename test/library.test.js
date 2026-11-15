import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { encodeScore } from '../src/music/score-codec.js';
import { LIBRARY_KEY, addToLibrary, loadLibrary, removeFromLibrary } from '../src/state/library.js';
import { sanitize } from '../src/state/settings.js';
import { scoreWith } from './helpers.js';

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
const B = scoreWith({ melody: 'musical', accidentals: true, noteValues: ['eighth', 'sixteenth'] }, 2);
const C = scoreWith({ positions: [1, 7], rotatePositions: true, strings: [3, 2, 1] }, 3);

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
  for (const [index, score] of [A, B, C].entries()) {
    const result = addToLibrary(score, { id: `id-${index}`, savedAt: 1000 + index }, storage);
    assert.equal(result.ok, true);
    assert.deepEqual(result.entries[0], { id: `id-${index}`, savedAt: 1000 + index, score });
  }
  assert.deepEqual(loadLibrary(storage), [
    { id: 'id-2', savedAt: 1002, score: C },
    { id: 'id-1', savedAt: 1001, score: B },
    { id: 'id-0', savedAt: 1000, score: A }
  ]);
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
  const storage = memoryStorage(textOf({ id: 'future', savedAt: 9, data: { v: 2 } }));
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
    { savedAt: 10, data: { v: 2, bars: [] } },
    { id: null, savedAt: 11, data: { v: 2 } },
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
    { id: 'future', savedAt: 5, data: { v: 2, bars: [[1, 2, 3]], swing: true } },
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
    strings: [6, 1], noteValues: ['quarter'], accidentals: false, melody: 'random'
  });
  // The notes are the stored ones all the same.
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
  const before = textOf(raw('a', 1, A), { id: 'future', savedAt: 2, data: { v: 2 } });
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
  const storage = memoryStorage(textOf(raw('a', 1, A), { id: 'future', savedAt: 2, data: { v: 2 } }));
  const first = loadLibrary(storage);
  first[0].score.settings.strings.length = 0;
  first[0].score.measures.length = 0;
  first.length = 0;
  assert.deepEqual(loadLibrary(storage), [{ id: 'a', savedAt: 1, score: A }]);
  assert.equal(storage.writes, 0);
});
