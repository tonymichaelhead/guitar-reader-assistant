import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preferredPageSize } from '../src/export/download.js';
import {
  describeBriefly, describeNoteMap, describeScore, fileStem, studyName, summarizeSettings
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
  const score = scoreWith({ noteValues: ['eighth', 'sixteenth'], accidentals: true, strings: [3, 2, 1] }, 5);
  const { meta } = describeScore(score);
  assert.match(meta, /eighth & sixteenth notes/);
  assert.match(meta, /with accidentals/);
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
});

test('short forms: list row, settings summary, name and file name', () => {
  const score = scoreWith({ melody: 'musical', accidentals: true }, 42);
  assert.equal(studyName(score), 'Étude No. 42');
  assert.equal(fileStem(score), 'etude-0042');
  assert.equal(describeBriefly(score), `${score.tonality} · Position V · quarter notes · accidentals`);
  assert.equal(describeBriefly(scoreWith({}, 1)), 'random · Position V · quarter notes · naturals');
  assert.equal(
    summarizeSettings(settingsWith({ positions: [1, 5], rotatePositions: true })),
    'Pos. I, V (rotating) · all strings · quarter · naturals · random');
});

test('paper size follows the reader’s region: Letter in North America, A4 elsewhere', () => {
  assert.equal(preferredPageSize('en-US'), 'letter');
  assert.equal(preferredPageSize('en'), 'letter'); // "en" alone most likely means the US
  assert.equal(preferredPageSize('fr-CA'), 'letter');
  assert.equal(preferredPageSize('en-GB'), 'a4');
  assert.equal(preferredPageSize('de'), 'a4');
  assert.equal(preferredPageSize('ja-JP'), 'a4');
  assert.equal(preferredPageSize('not a locale'), 'letter');
  assert.equal(preferredPageSize(undefined), 'letter');
});
