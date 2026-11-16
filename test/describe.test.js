import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preferredPageSize } from '../src/export/download.js';
import { KEYS, keyById } from '../src/music/theory.js';
import {
  describeBriefly, describeKey, describeNoteMap, describeScore, fileStem, spokenKey, studyName,
  summarizeSettings
} from '../src/ui/describe.js';
import { scoreWith, settingsWith } from './helpers.js';

test('a random study is described by its number, position and settings', () => {
  const text = describeScore(scoreWith({}, 417));
  assert.equal(text.title, 'Étude');
  assert.equal(text.number, 'No. 417');
  assert.equal(text.left, 'Notes drawn at random');
  assert.equal(text.right, 'Position V');
  assert.equal(
    text.meta,
    '16 measures in 4/4 · quarter notes · natural notes · all strings · A3–C6 as written');
  assert.equal(text.plate, 'G. R. A. — 0417');
});

test('a musical study names its tonal centre', () => {
  const score = scoreWith({ melody: 'musical' }, 3);
  assert.equal(describeScore(score).left, `Melody in ${score.tonality}`);
});

test('rotating positions are listed in the order they first appear', () => {
  const score = scoreWith({ positions: [1, 5, 9], rotatePositions: true }, 8);
  const cycle = score.measures.slice(0, 3).map(m => ['', 'I', '', '', '', 'V', '', '', '', 'IX'][m.position]);
  assert.equal(describeScore(score).right, `Positions ${cycle.join(' · ')}`);
});

test('the description follows the score’s own settings, not the current ones', () => {
  const score = scoreWith({ noteValues: ['eighth', 'sixteenth'], accidentals: 'sharps', strings: [3, 2, 1] }, 5);
  const { meta } = describeScore(score);
  assert.match(meta, /eighth & sixteenth notes/);
  assert.match(meta, /with sharps/);
  assert.match(meta, /strings 3, 2, 1/);
});

test('three note values are joined as a list', () => {
  const score = scoreWith({ noteValues: ['quarter', 'eighth', 'sixteenth'] }, 5);
  assert.match(describeScore(score).meta, /quarter, eighth & sixteenth notes/);
});

test('the note map is described by the current settings', () => {
  const text = describeNoteMap(settingsWith({ positions: [2, 7], strings: [1] }));
  assert.equal(text.title, 'Notes');
  assert.equal(text.number, '');
  assert.equal(text.right, 'Positions II · VII');
  assert.match(text.meta, /string 1/);
  // The advice about hovering is for the screen only, so it is not part of
  // the line that also gets printed.
  assert.match(text.hint, /hover or tap/);
  assert.doesNotMatch(text.meta, /hover/);
  assert.equal(describeScore(scoreWith({}, 1)).hint, undefined);
});

test('a key is described with its signature', () => {
  assert.equal(describeKey(keyById('C')), 'C major: no sharps or flats.');
  assert.equal(describeKey(keyById('Am')), 'A minor: no sharps or flats.');
  assert.equal(describeKey(keyById('G')), 'G major: one sharp, F♯.');
  assert.equal(describeKey(keyById('Bm')), 'B minor: two sharps, F♯ C♯.');
  assert.equal(describeKey(keyById('E')), 'E major: four sharps, F♯ C♯ G♯ D♯.');
  assert.equal(describeKey(keyById('Dm')), 'D minor: one flat, B♭.');
  assert.equal(describeKey(keyById('Bb')), 'B♭ major: two flats, B♭ E♭.');
  for (const key of KEYS) assert.ok(describeKey(key).startsWith(`${key.label}: `));
  assert.equal(spokenKey('F♯ minor'), 'F sharp minor');
  assert.equal(spokenKey('B♭ major'), 'B flat major');
  assert.equal(spokenKey('C major'), 'C major');
});

test('the accidentals setting reads differently in the two melody modes', () => {
  const meta = overrides => describeScore(scoreWith(overrides, 9)).meta;
  assert.match(meta({ accidentals: 'none' }), /· natural notes ·/);
  assert.match(meta({ accidentals: 'sharps' }), /· with sharps ·/);
  assert.match(meta({ accidentals: 'flats' }), /· with flats ·/);
  assert.match(meta({ melody: 'musical', key: 'D' }), /· notes of the key only ·/);
  assert.match(meta({ melody: 'musical', key: 'D', accidentals: 'flats' }), /· with chromatic notes ·/);
  // A study saved before the setting had three values still reads: on meant sharps.
  const old = scoreWith({}, 9);
  old.settings.accidentals = true;
  delete old.settings.key;
  assert.match(describeScore(old).meta, /· with sharps ·/);
  assert.equal(describeBriefly(old).split(' · ').at(-1), 'sharps');
  // A stored value that is no setting at all, even one that names a property
  // every object has, reads as none.
  for (const junk of ['constructor', '__proto__', 'toString', 7, null]) {
    old.settings.accidentals = junk;
    assert.match(describeScore(old).meta, /· natural notes ·/);
  }
});

test('the note map names the key in Musical mode', () => {
  assert.match(describeNoteMap(settingsWith({ melody: 'musical', key: 'F#m' })).meta, /^F♯ minor · notes of the key only · /);
  assert.match(describeNoteMap(settingsWith({ accidentals: 'flats' })).meta, /^with flats · /);
});

test('short forms: list row, settings summary, name and file name', () => {
  const score = scoreWith({ melody: 'musical', accidentals: 'sharps' }, 42);
  assert.equal(studyName(score), 'Étude No. 42');
  assert.equal(fileStem(score), 'etude-0042');
  assert.equal(describeBriefly(score), `${score.tonality} · Position V · quarter notes · chromatic`);
  assert.equal(describeBriefly(scoreWith({}, 1)), 'random · Position V · quarter notes · naturals');
  assert.equal(
    summarizeSettings(settingsWith({ positions: [1, 5], rotatePositions: true })),
    'Pos. I, V (rotating) · all strings · quarter · random · naturals');
  assert.equal(
    summarizeSettings(settingsWith({ melody: 'musical', key: 'F#m', accidentals: 'sharps' })),
    'Pos. V · all strings · quarter · F♯ minor · chromatic');
  assert.equal(
    summarizeSettings(settingsWith({ melody: 'musical', key: 'Bb' })),
    'Pos. V · all strings · quarter · B♭ major · in key');
});

test('paper size follows the reader’s region: Letter in North America, A4 elsewhere', () => {
  assert.equal(preferredPageSize('en-US'), 'letter');
  assert.equal(preferredPageSize('en'), 'letter'); // "en" alone most likely means the US
  assert.equal(preferredPageSize('fr-CA'), 'letter');
  assert.equal(preferredPageSize('es-MX'), 'letter');
  assert.equal(preferredPageSize('es-SV'), 'letter');
  assert.equal(preferredPageSize('es-NI'), 'letter');
  assert.equal(preferredPageSize('en-BZ'), 'letter');
  assert.equal(preferredPageSize('es-419'), 'letter'); // "Spanish (Latin America)" names no country
  assert.equal(preferredPageSize('es-AR'), 'a4');
  assert.equal(preferredPageSize('pt-BR'), 'a4');
  assert.equal(preferredPageSize('es'), 'a4'); // "es" alone most likely means Spain
  assert.equal(preferredPageSize('en-GB'), 'a4');
  assert.equal(preferredPageSize('de'), 'a4');
  assert.equal(preferredPageSize('ja-JP'), 'a4');
  assert.equal(preferredPageSize('not a locale'), 'letter');
  assert.equal(preferredPageSize(undefined), 'letter');
});
