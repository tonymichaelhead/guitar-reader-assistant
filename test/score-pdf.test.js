import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTLINES, UNITS_PER_EM } from '../src/export/glyph-outlines.js';
import { createPdf, textWidth } from '../src/export/pdf-writer.js';
import { PAGE_SIZES, scoreToPdf } from '../src/export/score-pdf.js';
import { ROMAN } from '../src/music/fretboard.js';
import { spell, staffStep } from '../src/music/pitch.js';
import { GLYPH, GLYPH_SIZE, METRICS, SPACE } from '../src/render/glyphs.js';
import { PAGE, layoutScore } from '../src/render/layout.js';
import { allNotes, scoreWith, seeds, settingsWith } from './helpers.js';

// The page design, restated here so that a change to it has to be meant.
const MARGIN = { left: 40, right: 40, top: 44, bottom: 40 };
const FLOOR = MARGIN.bottom + 18; // the music keeps this clear for the plate line
const LINES_GAP = 14;             // the least space between the left and right lines
const SLOT_DEPTH = PAGE.systemGap - PAGE.systemTop; // top staff line to the foot of a system's slot

const TEXT = {
  dedication: 'for the classical guitar',
  title: 'Étude',
  number: 'No. 417',
  left: 'Melody in C major',
  right: 'Positions V · I · IX',
  meta: '16 measures in 4/4 · quarter & eighth notes · natural notes · all strings · A3–C6 as written',
  plate: 'G. R. A. — 0417'
};

const HEAD = METRICS.noteheadWidth * SPACE;
const ALL_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PAGE_SIZE_NAMES = Object.keys(PAGE_SIZES);
const NOTE_VALUE_SETS = [
  ['quarter'], ['eighth'], ['sixteenth'], ['quarter', 'eighth'], ['quarter', 'sixteenth'],
  ['eighth', 'sixteenth'], ['quarter', 'eighth', 'sixteenth']
];
const DENSE = { noteValues: ['sixteenth'], accidentals: true };
const VARIED = [
  {},
  { noteValues: ['eighth'] },
  DENSE,
  { noteValues: ['quarter', 'eighth', 'sixteenth'], accidentals: true, melody: 'musical' },
  { noteValues: ['eighth', 'sixteenth'], positions: [1, 7, 12], rotatePositions: true },
  { noteValues: ['quarter', 'eighth'], positions: ALL_POSITIONS, rotatePositions: true, accidentals: true }
];

// A score written out by hand, for notes no generator would give: each measure
// is a list of [written pitch value, duration in sixteenths], with 'flat' as
// a third member to spell a black key as a flat.
function handMade(bars) {
  const measures = bars.map((bar, i) => {
    let start = 0;
    const notes = bar.map(([value, dur, prefer]) => {
      const note = { pitch: spell(value, prefer), start, dur };
      start += dur;
      return note;
    });
    return { number: i + 1, position: 5, notes };
  });
  return { seed: 1, settings: settingsWith({}), tonality: null, measures };
}
const PLAIN_BAR = [[59, 4], [59, 4], [59, 4], [59, 4]]; // four quarters on the middle line

const latin1 = bytes => Buffer.from(bytes).toString('latin1');
const count = (text, pattern) => (text.match(pattern) || []).length;
// Numbers in the file keep three decimals, so two of them agree to a thousandth.
const near = (a, b, tolerance = 0.002) => Math.abs(a - b) <= tolerance;

// ---- Reading a file back ----------------------------------------------------

function streamOf(body) {
  const head = /^<< (.*)\/Length (\d+) >>\nstream\n/.exec(body);
  if (!head) return null;
  const length = Number(head[2]);
  const start = head[0].length;
  return { dict: head[1], length, data: body.slice(start, start + length), rest: body.slice(start + length) };
}

// The way a viewer does: from the end, through the cross-reference table, to
// each object.
function parsePdf(bytes) {
  const file = latin1(bytes);
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(file)[1]);
  const head = /^xref\n0 (\d+)\n/.exec(file.slice(startxref));
  const size = Number(head[1]);
  const first = startxref + head[0].length;
  const entries = Array.from({ length: size }, (_, i) => file.slice(first + 20 * i, first + 20 * (i + 1)));
  const objects = new Map();
  entries.slice(1).forEach((entry, i) => {
    const number = i + 1;
    const offset = Number(entry.slice(0, 10));
    const label = `${number} 0 obj\n`;
    const body = file.slice(offset + label.length, file.indexOf('\nendobj\n', offset));
    objects.set(number, { offset, labelled: file.startsWith(label, offset), body, stream: streamOf(body) });
  });
  return { file, startxref, size, entries, trailer: file.slice(first + 20 * size), objects };
}

const refs = text => [...text.matchAll(/\/(\w+) (\d+) 0 R/g)].map(m => ({ name: m[1], ref: Number(m[2]) }));

// A long dictionary or array runs over several lines, so what is inside one
// is read up to its closing delimiter, line ends and all.
function resourcesOf(pageBody, key) {
  const match = new RegExp(`/${key} <<\\s([^>]*)>>`).exec(pageBody);
  return match ? refs(match[1]) : [];
}

function pagesOf(pdf) {
  const kids = /\/Kids \[([^\]]*)\]/.exec(pdf.objects.get(2).body)[1];
  return [...kids.matchAll(/(\d+) 0 R/g)].map(([, number]) => {
    const { body } = pdf.objects.get(Number(number));
    const contents = Number(/\/Contents (\d+) 0 R/.exec(body)[1]);
    return {
      body,
      content: pdf.objects.get(contents).stream.data,
      fonts: resourcesOf(body, 'Font'),
      shapes: resourcesOf(body, 'XObject')
    };
  });
}

// The lines of a file with the data of every stream taken out. PDF 1.4 allows
// these, and only these, no more than 255 characters.
function linesOutsideStreams(pdf) {
  const streams = [...pdf.objects.values()].filter(object => object.stream);
  const emptied = streams.reduce(
    (file, { stream }) => file.replace(`stream\n${stream.data}\nendstream`, 'stream\nendstream'), pdf.file);
  return emptied.split('\n');
}

// A file's title as a viewer reads it: UTF-16BE in hex, where white space
// between the digits means nothing.
function titleOf(pdf) {
  const digits = /\/Title <FEFF([^>]*)>/.exec(pdf.objects.get(3).body)[1].replace(/\s+/g, '');
  return String.fromCharCode(...digits.match(/.{4}/g).map(unit => parseInt(unit, 16)));
}

// The checks of test/pdf-writer.test.js, on a finished score: a viewer can
// find every object, every stream is as long as it says, no line is too long
// and each page declares exactly what it uses.
function assertWellFormed(bytes) {
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(latin1(bytes.subarray(0, 10)), '%PDF-1.4\n%');
  assert.ok([...bytes.subarray(10, 14)].every(byte => byte > 127));
  assert.ok(bytes.subarray(15).every(byte => byte < 128), 'the file is ASCII after its header');

  const pdf = parsePdf(bytes);
  assert.ok(pdf.file.startsWith('xref\n', pdf.startxref));
  assert.equal(pdf.entries[0], '0000000000 65535 f \n');
  for (const entry of pdf.entries.slice(1)) assert.match(entry, /^\d{10} 00000 n \n$/);
  for (const [number, object] of pdf.objects) {
    assert.ok(object.labelled, `entry ${number} does not point at "${number} 0 obj"`);
  }
  assert.equal(count(pdf.file, /^\d+ 0 obj$/gm), pdf.size - 1);
  assert.equal(pdf.file.lastIndexOf('\nendobj\n') + '\nendobj\n'.length, pdf.startxref);
  assert.equal(pdf.trailer,
    `trailer\n<< /Size ${pdf.size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${pdf.startxref}\n%%EOF\n`);
  assert.equal(pdf.objects.get(1).body, '<< /Type /Catalog /Pages 2 0 R >>');
  assert.ok(!/CreationDate|ModDate|\/ID/.test(pdf.file), 'nothing that changes from one export to the next');

  for (const { stream } of pdf.objects.values()) {
    if (!stream) continue;
    assert.equal(stream.rest, '\nendstream');
    assert.equal(stream.data.length, stream.length);
    assert.ok(!stream.dict.includes('/Filter'));
  }
  // The line end is counted too, so the rule holds however a reader counts.
  for (const line of linesOutsideStreams(pdf)) {
    assert.ok(line.length + 1 <= 255, `a line of ${line.length} characters: ${line.slice(0, 40)}...`);
  }

  const pages = pagesOf(pdf);
  assert.ok(pages.length >= 1);
  assert.ok(pdf.objects.get(2).body.endsWith(`/Count ${pages.length} >>`));
  assert.equal(count(pdf.file, /\/Type \/Page /g), pages.length);
  for (const page of pages) {
    const selected = new Set([...page.content.matchAll(/\/(\w+) [\d.]+ Tf/g)].map(m => m[1]));
    const drawn = new Set([...page.content.matchAll(/\/(\w+) Do/g)].map(m => m[1]));
    assert.deepEqual([...selected].sort(), page.fonts.map(f => f.name).sort());
    assert.deepEqual([...drawn].sort(), page.shapes.map(s => s.name).sort());
    assert.equal(count(page.content, /\bq\b/g), count(page.content, /\bQ\b/g));
    assert.equal(count(page.content, /\bBT\b/g), count(page.content, /\bET\b/g));
  }
  return pdf;
}

// Which glyph a shape's stream draws: the stream the writer makes of each
// outline, by name.
const GLYPH_OF_STREAM = (() => {
  const doc = createPdf();
  const page = doc.addPage(100, 100);
  const names = Object.keys(OUTLINES);
  for (const name of names) {
    doc.defineShape(name, OUTLINES[name].d, OUTLINES[name].bbox);
    page.shape(name, 0, 0, 1);
  }
  const pdf = parsePdf(doc.toBytes());
  const forms = pagesOf(pdf)[0].shapes.map(({ ref }) => pdf.objects.get(ref).stream.data);
  return new Map(forms.map((data, i) => [data, names[i]]));
})();

const NUM = '(-?[\\d.]+)';
const WIDTH_OP = /^([\d.]+) w$/;
const LINE_OP = new RegExp(`^${NUM} ${NUM} m ${NUM} ${NUM} l S$`);
const SHAPE_OP = new RegExp(`^q ${NUM} 0 0 ${NUM} ${NUM} ${NUM} cm /(\\w+) Do Q$`);
const TEXT_OP = new RegExp(`^BT /(\\w+) ${NUM} Tf (?:${NUM} Tc )?${NUM} ${NUM} Td <([0-9A-F]*)> Tj ET$`);
const winAnsi = new TextDecoder('windows-1252');

// Everything one page draws, in drawing order: lines, polygons, glyphs and
// text, each with its coordinates in points. An operator this reader does not
// know fails the test, so nothing on a page goes unchecked.
function readPage(pdf, page) {
  const [, , width, height] = /\/MediaBox \[([^\]]*)\]/.exec(page.body)[1].split(' ').map(Number);
  const fontOf = new Map(page.fonts.map(({ name, ref }) =>
    [name, /\/BaseFont \/([\w-]+)/.exec(pdf.objects.get(ref).body)[1]]));
  const formOf = new Map(page.shapes.map(({ name, ref }) => [name, pdf.objects.get(ref)]));
  const items = [];
  let lineWidth = null;
  let spacing = 0;

  for (const op of page.content.split('\n')) {
    let m;
    if ((m = WIDTH_OP.exec(op))) {
      lineWidth = Number(m[1]);
    } else if ((m = LINE_OP.exec(op))) {
      const [x1, y1, x2, y2] = m.slice(1).map(Number);
      items.push({ kind: 'line', x1, y1, x2, y2, width: lineWidth });
    } else if (op.endsWith(' h f')) {
      const tokens = op.slice(0, -' h f'.length).split(' ');
      const points = [];
      for (let i = 0; i < tokens.length; i += 3) {
        assert.equal(tokens[i + 2], i ? 'l' : 'm');
        points.push([Number(tokens[i]), Number(tokens[i + 1])]);
      }
      items.push({ kind: 'polygon', points });
    } else if ((m = SHAPE_OP.exec(op))) {
      const form = formOf.get(m[5]);
      // Neither the form nor the placement may flip, turn or stretch a glyph.
      const matrix = /\/Matrix \[([\d.]+) 0 0 ([\d.]+) 0 0\]/.exec(form.body);
      assert.ok(matrix && matrix[1] === matrix[2], form.body.slice(0, 120));
      assert.equal(m[1], m[2]);
      items.push({
        kind: 'glyph',
        name: GLYPH_OF_STREAM.get(form.stream.data),
        x: Number(m[3]),
        y: Number(m[4]),
        scale: Number(m[1]) * Number(matrix[1]) // points per font unit
      });
    } else if ((m = TEXT_OP.exec(op))) {
      if (m[3] !== undefined) spacing = Number(m[3]);
      const string = winAnsi.decode(Uint8Array.from(m[6].match(/../g).map(pair => parseInt(pair, 16))));
      const font = fontOf.get(m[1]);
      const size = Number(m[2]);
      items.push({
        kind: 'text', string, font, size, spacing,
        x: Number(m[4]),
        y: Number(m[5]),
        // The ink ends before the letter-space that follows the last character.
        width: textWidth(string, font, size, spacing) - spacing
      });
    } else {
      assert.fail(`a page holds a line this test cannot read: ${op}`);
    }
  }
  return { width, height, items };
}

// A system as drawn: its five staff lines, top line first, and everything
// drawn after them up to the next staff. The title block comes before the
// first staff, and the plate line is the only Times-Roman text after it.
function systemsOf(page, scale) {
  const systems = [];
  const staffWeight = METRICS.staffLine * SPACE * scale;
  for (const item of page.items) {
    const staffLine = item.kind === 'line' && item.y1 === item.y2 && near(item.width, staffWeight, 0.001);
    const current = systems[systems.length - 1];
    if (staffLine && (!current || current.staff.length === 5)) systems.push({ staff: [item], items: [] });
    else if (staffLine) current.staff.push(item);
    else if (current && !(item.kind === 'text' && item.font === 'Times-Roman')) current.items.push(item);
  }
  return systems;
}

function exportOf(score, { pageSize = 'letter', text = TEXT } = {}) {
  const bytes = scoreToPdf(score, { text, pageSize });
  const pdf = parsePdf(bytes);
  const layout = layoutScore(score, PAGE.maxWidth);
  const scale = (PAGE_SIZES[pageSize][0] - MARGIN.left - MARGIN.right) / layout.width;
  const pages = pagesOf(pdf).map(page => readPage(pdf, page));
  const systems = pages.map(page => systemsOf(page, scale));
  return { bytes, pdf, layout, scale, pages, systemsByPage: systems, systems: systems.flat() };
}

const glyphs = (items, ...names) => items.filter(i => i.kind === 'glyph' && names.includes(i.name));
const texts = (items, font) => items.filter(i => i.kind === 'text' && i.font === font);
const polygons = items => items.filter(i => i.kind === 'polygon');
const uprights = (items, weight, scale) => items.filter(i =>
  i.kind === 'line' && i.x1 === i.x2 && near(i.width, METRICS[weight] * SPACE * scale, 0.001));
const noteheads = items => glyphs(items, 'noteheadBlack');
const stems = (items, scale) => uprights(items, 'stem', scale);
const layoutNotes = system => system.bars.flatMap(bar => bar.notes);

// How far text reaches above and below its baseline, in ems. Capitals,
// figures and ascenders of the Times faces stay under 0.7 and an accented
// capital under 0.9; descenders go down 0.22 at most.
const rise = string => (/[À-Ý]/.test(string) ? 0.9 : 0.7);
const SINK = 0.22;

// The box [x1, y1, x2, y2] an item's ink lies in.
function inkBox(item) {
  if (item.kind === 'line') {
    const half = item.width / 2;
    assert.ok(item.x1 === item.x2 || item.y1 === item.y2, 'every line is upright or level');
    const [dx, dy] = item.x1 === item.x2 ? [half, 0] : [0, half];
    return [
      Math.min(item.x1, item.x2) - dx, Math.min(item.y1, item.y2) - dy,
      Math.max(item.x1, item.x2) + dx, Math.max(item.y1, item.y2) + dy
    ];
  }
  if (item.kind === 'polygon') {
    const xs = item.points.map(([x]) => x);
    const ys = item.points.map(([, y]) => y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  if (item.kind === 'glyph') {
    const [x1, y1, x2, y2] = OUTLINES[item.name].bbox;
    const { x, y, scale } = item;
    return [x + x1 * scale, y + y1 * scale, x + x2 * scale, y + y2 * scale];
  }
  return [item.x, item.y - SINK * item.size, item.x + item.width, item.y + rise(item.string) * item.size];
}

const lowestInk = system => Math.min(...[...system.staff, ...system.items].map(item => inkBox(item)[1]));

function assertInsideMargins(pages) {
  const slack = 0.01;
  for (const page of pages) {
    for (const item of page.items) {
      const [x1, y1, x2, y2] = inkBox(item);
      const where = `${item.kind} ${item.name ?? item.string ?? ''} at ${x1.toFixed(1)}, ${y1.toFixed(1)}`;
      const [left, right] = [MARGIN.left - slack, page.width - MARGIN.right + slack];
      const [bottom, top] = [MARGIN.bottom - slack, page.height - MARGIN.top + slack];
      assert.ok(x1 >= left && x2 <= right, `${where} leaves the side margins`);
      assert.ok(y1 >= bottom && y2 <= top, `${where} leaves the top or bottom margin`);
    }
  }
}

// Every system, measure and note of the score is on some page exactly once.
function assertComplete(score, { layout, scale, pages, systems }) {
  const notes = allNotes(score);
  const items = systems.flatMap(system => system.items);
  assert.equal(systems.length, layout.systems.length);
  assert.ok(systems.every(system => system.staff.length === 5));
  assert.equal(glyphs(items, 'gClef').length, layout.systems.length);
  assert.equal(noteheads(items).length, notes.length);
  assert.equal(stems(items, scale).length, notes.length);
  // One barline closes each measure; the last has a thick one beside it.
  assert.equal(uprights(items, 'thinBarline', scale).length, score.measures.length);
  assert.equal(uprights(items, 'thickBarline', scale).length, 1);
  assert.equal(glyphs(items, 'timeSig4').length, 2);
  // Nothing of a system is drawn outside it, and the time signature is at the
  // very start.
  const everything = pages.flatMap(page => page.items);
  assert.equal(noteheads(everything).length, notes.length);
  assert.equal(glyphs(systems[0].items, 'timeSig4').length, 2);
  // Systems after the first say which measure they start at, in order.
  assert.deepEqual(
    texts(items, 'Times-Italic').map(t => t.string),
    layout.systems.slice(1).map(system => String(system.measureNumber)));
}

// ---- Structure --------------------------------------------------------------

test('the two paper sizes are Letter and A4, in points', () => {
  assert.deepEqual(PAGE_SIZES, { letter: [612, 792], a4: [595.28, 841.89] });
});

test('a score exports as a well-formed PDF file', () => {
  for (const overrides of VARIED) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      const bytes = scoreToPdf(scoreWith(overrides, 3), { text: TEXT, pageSize });
      const pdf = assertWellFormed(bytes);
      // Only the built-in faces and the outlines: nothing is embedded.
      assert.ok(!/FontFile|FontDescriptor|\/Image/.test(pdf.file));
      assert.ok(count(pdf.file, /\/Subtype \/Form /g) <= Object.keys(OUTLINES).length);
    }
  }
});

test('the same score and text give byte-identical files', () => {
  for (const overrides of VARIED) {
    const bytes = scoreToPdf(scoreWith(overrides, 9), { text: TEXT, pageSize: 'a4' });
    assert.deepEqual(scoreToPdf(scoreWith(overrides, 9), { text: { ...TEXT }, pageSize: 'a4' }), bytes);
    assert.notDeepEqual(scoreToPdf(scoreWith(overrides, 10), { text: TEXT, pageSize: 'a4' }), bytes);
  }
  // Letter is the default size.
  const score = scoreWith({}, 1);
  assert.deepEqual(scoreToPdf(score, { text: TEXT }), scoreToPdf(score, { text: TEXT, pageSize: 'letter' }));
});

test('the file is titled with the name and number of the study', () => {
  const { pdf } = exportOf(scoreWith({}, 1));
  assert.equal(titleOf(pdf), 'Étude No. 417');
  assert.ok(!pdf.objects.get(3).body.includes('\n'));
});

test('a long title is written over several lines of the file, none too long, and still names it', () => {
  const title = 'Étude de concert pour la main gauche seule, d’après un prélude';
  for (const pageSize of PAGE_SIZE_NAMES) {
    for (const overrides of [{}, DENSE]) {
      const exported = exportOf(scoreWith(overrides, 1), { pageSize, text: { ...TEXT, title } });
      const pdf = assertWellFormed(exported.bytes);
      assert.equal(titleOf(pdf), `${title} ${TEXT.number}`);
      assert.ok(pdf.objects.get(3).body.includes('\n'));
      // On the page it is one line of capitals, set smaller to fit.
      const [page] = exported.pages;
      const drawn = page.items.find(item => item.kind === 'text' && item.string === title.toUpperCase());
      assert.ok(drawn && drawn.size < 22);
      assertInsideMargins(exported.pages);
    }
  }
});

test('an unknown paper size is refused', () => {
  const legal = () => scoreToPdf(scoreWith({}, 1), { text: TEXT, pageSize: 'legal' });
  assert.throws(legal, /Unknown page size "legal"/);
});

// ---- Pages ------------------------------------------------------------------

test('a study in quarter notes fits on one page, on Letter and on A4', () => {
  for (const pageSize of PAGE_SIZE_NAMES) {
    for (const seed of seeds(5)) {
      const { pages, systems } = exportOf(scoreWith({}, seed), { pageSize });
      assert.equal(pages.length, 1);
      assert.equal(systems.length, 4);
      assert.deepEqual([pages[0].width, pages[0].height], PAGE_SIZES[pageSize]);
    }
  }
});

test('systems that do not fit on a page go to the next, whole', () => {
  for (const pageSize of PAGE_SIZE_NAMES) {
    for (const seed of seeds(5)) {
      const score = scoreWith(DENSE, seed);
      const exported = exportOf(score, { pageSize });
      assert.ok(exported.pages.length > 1, `${exported.pages.length} page`);
      assert.ok(exported.systemsByPage.every(systems => systems.length >= 1), 'no page is empty');
      assert.ok(exported.pages.every(page => [page.width, page.height].join() === PAGE_SIZES[pageSize].join()));
      assertComplete(score, exported);
    }
  }
});

test('every system, measure and note is drawn exactly once across the pages', () => {
  for (const overrides of VARIED) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      for (const seed of seeds(4)) {
        const score = scoreWith(overrides, seed);
        assertComplete(score, exportOf(score, { pageSize }));
      }
    }
  }
});

test('systems keep the spacing of the screen, and later pages start at the top margin', () => {
  for (const overrides of VARIED) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      const { pages, scale, systemsByPage } = exportOf(scoreWith(overrides, 2), { pageSize });
      systemsByPage.forEach((systems, p) => {
        for (let i = 1; i < systems.length; i++) {
          assert.ok(near(systems[i - 1].staff[0].y1 - systems[i].staff[0].y1, PAGE.systemGap * scale));
        }
        const slotTop = systems[0].staff[0].y1 + PAGE.systemTop * scale;
        if (p > 0) assert.ok(near(slotTop, pages[p].height - MARGIN.top));
        // On the first page the slot begins under the last line of the title block.
        else assert.ok(slotTop < Math.min(...texts(pages[0].items, 'Times-Roman').map(t => t.y).slice(0, -1)));
      });
    }
  }
});

test('a page takes as many whole slots as fit above the plate line, and no more', () => {
  for (const overrides of VARIED) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      for (const seed of seeds(4)) {
        const { scale, systemsByPage } = exportOf(scoreWith(overrides, seed), { pageSize });
        const depth = SLOT_DEPTH * scale;
        systemsByPage.forEach((systems, p) => {
          for (const system of systems) {
            assert.ok(system.staff[0].y1 - depth >= FLOOR - 0.01, 'a slot passes the floor');
            assert.ok(lowestInk(system) >= FLOOR - 0.01, 'ink passes the floor');
          }
          if (p === 0) return;
          // The system that opens this page, hung one slot below the last one
          // of the page before, would have reached past the floor.
          const [first] = systems;
          const drop = Math.max(depth, first.staff[0].y1 - lowestInk(first));
          const before = systemsByPage[p - 1].at(-1).staff[0].y1;
          const lowest = before - PAGE.systemGap * scale - drop;
          assert.ok(lowest < FLOOR + 0.01, `page ${p} had room for another system`);
        });
      }
    }
  }
});

test('eight systems break five and three on both paper sizes, whatever the notes', () => {
  const low = { positions: [1], noteValues: ['eighth', 'sixteenth'], accidentals: true };
  for (const overrides of [DENSE, low]) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      for (const seed of seeds(25)) {
        const { systemsByPage } = exportOf(scoreWith(overrides, seed), { pageSize });
        assert.deepEqual(systemsByPage.map(systems => systems.length), [5, 3]);
      }
    }
  }
});

test('a system whose ink would hang past the foot of the page moves to the next one', () => {
  // Eleven systems of four measures: five on the first Letter page, and six
  // slots on the second with a little to spare under the last.
  const endingWith = bar => exportOf(handMade([...Array.from({ length: 43 }, () => PLAIN_BAR), bar]));
  const perPage = exported => exported.systemsByPage.map(systems => systems.length);
  // How far below the foot of its slot the last system's ink reaches.
  const hang = ({ systems, scale }, pick = () => true) => {
    const last = systems.at(-1);
    const lowest = Math.min(...last.items.filter(pick).map(item => inkBox(item)[1]));
    return last.staff[0].y1 - SLOT_DEPTH * scale - lowest;
  };

  const plain = endingWith(PLAIN_BAR);
  const spare = plain.systems.at(-1).staff[0].y1 - SLOT_DEPTH * plain.scale - FLOOR;
  assert.deepEqual(perPage(plain), [5, 6]);
  assert.ok(spare > 0 && hang(plain) < 0);

  // A3 beamed to three C6: the stem leaves the slot, but the page has room.
  const low = endingWith([[59, 4], [59, 4], [59, 4], [45, 1], [72, 1], [72, 1], [72, 1]]);
  assert.deepEqual(perPage(low), [5, 6]);
  assert.ok(hang(low) > 0 && hang(low) < spare, `hangs ${hang(low).toFixed(1)} of ${spare.toFixed(1)} spare`);

  // E3 beamed to three G6: the stem would pass the floor.
  const deepBar = [[59, 4], [59, 4], [59, 4], [40, 1], [79, 1], [79, 1], [79, 1]];
  const lower = endingWith(deepBar);
  assert.deepEqual(perPage(lower), [5, 5, 1]);
  assert.ok(hang(lower) > spare);

  // G2 on its sixth ledger line: the lines would fit, the notehead would not.
  const ledgered = endingWith([[59, 4], [59, 4], [59, 4], [31, 4]]);
  assert.deepEqual(perPage(ledgered), [5, 5, 1]);
  assert.ok(hang(ledgered, item => item.kind === 'line') < spare && hang(ledgered) > spare);

  // A taller A4 page has far more to spare under its sixth slot: it stays.
  const bars = [...Array.from({ length: 43 }, () => PLAIN_BAR), deepBar];
  const onA4 = exportOf(handMade(bars), { pageSize: 'a4' });
  assert.deepEqual(perPage(onA4), [5, 6]);
  assert.ok(hang(onA4) > 0);
  for (const exported of [plain, low, lower, ledgered, onA4]) {
    assertInsideMargins(exported.pages);
    const notes = exported.layout.systems.flatMap(layoutNotes).length;
    assert.equal(noteheads(exported.systems.flatMap(system => system.items)).length, notes);
  }
});

test('ink that rises out of the first slot of a page pushes that page\'s systems down', () => {
  // G7 on seven ledger lines, with the position mark above it.
  const high = [[91, 4], [91, 4], [91, 4], [91, 4]];
  const usual = exportOf(handMade(Array.from({ length: 24 }, () => PLAIN_BAR)));
  for (const at of [0, 20]) {
    const bars = Array.from({ length: 24 }, (_, i) => (i === at ? high : PLAIN_BAR));
    const score = handMade(bars);
    score.measures[at].position = 12; // a change of position, so a mark is drawn
    const raised = exportOf(score);
    assert.deepEqual(raised.systemsByPage.map(systems => systems.length), [5, 1]);
    assertInsideMargins(raised.pages);

    const p = at === 0 ? 0 : 1;
    const [system] = raised.systemsByPage[p];
    const mark = texts(system.items, 'Times-Bold').find(item => item.string === 'XII');
    assert.ok(mark, 'the mark over the high measure is missing');
    assert.ok(system.staff[0].y1 < usual.systemsByPage[p][0].staff[0].y1 - 5, 'the staff was not lowered');
    // The mark's capitals end where the slot would have begun.
    const slotTop = usual.systemsByPage[p][0].staff[0].y1 + PAGE.systemTop * usual.scale;
    assert.ok(near(mark.y + 0.7 * mark.size, slotTop, 0.01));
    // The systems under it keep their spacing.
    const tops = raised.systemsByPage[p].map(s => s.staff[0].y1);
    for (let i = 1; i < tops.length; i++) assert.ok(near(tops[i - 1] - tops[i], PAGE.systemGap * raised.scale));
  }
});

test('everything drawn stays inside the page margins', () => {
  const high = { positions: [12], noteValues: ['eighth', 'sixteenth'], accidentals: true };
  const low = { positions: [1], noteValues: ['eighth', 'sixteenth'], accidentals: true };
  for (const overrides of [...VARIED, high, low]) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      for (const seed of seeds(6)) {
        assertInsideMargins(exportOf(scoreWith(overrides, seed), { pageSize }).pages);
      }
    }
  }
});

test('every combination of settings exports whole, well formed and inside the page', () => {
  const scores = [];
  for (const seed of seeds(3)) {
    for (const melody of ['random', 'musical']) {
      for (const noteValues of NOTE_VALUE_SETS) {
        for (const accidentals of [false, true]) {
          scores.push(scoreWith({ noteValues, melody, accidentals }, seed));
        }
      }
      const rotating = { positions: ALL_POSITIONS, rotatePositions: true, melody };
      scores.push(scoreWith({ ...rotating, noteValues: NOTE_VALUE_SETS.at(-1), accidentals: true }, seed));
      for (const string of [1, 2, 3, 4, 5, 6]) {
        scores.push(scoreWith({ strings: [string], melody, noteValues: ['quarter', 'eighth'] }, seed));
        scores.push(scoreWith({ ...rotating, strings: [string], noteValues: ['eighth', 'sixteenth'] }, seed));
      }
    }
  }
  assert.equal(scores.length, 3 * 2 * (14 + 1 + 12));
  for (const score of scores) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      const exported = exportOf(score, { pageSize });
      assertWellFormed(exported.bytes);
      assertComplete(score, exported);
      assertInsideMargins(exported.pages);
    }
  }
});

// ---- Notation ---------------------------------------------------------------

test('each staff is five lines one space apart, top line first, the full width of the layout', () => {
  const { systems, scale, layout } = exportOf(scoreWith(VARIED[3], 4));
  systems.forEach((system, s) => {
    for (let i = 1; i < 5; i++) assert.ok(near(system.staff[i - 1].y1 - system.staff[i].y1, SPACE * scale));
    for (const line of system.staff) {
      assert.ok(near(line.x1, MARGIN.left + layout.systems[s].staffStart * scale));
      assert.ok(near(line.x2, MARGIN.left + layout.systems[s].staffEnd * scale));
    }
  });
});

test('glyphs are drawn upright, at four staff spaces to the em', () => {
  for (const pageSize of PAGE_SIZE_NAMES) {
    const { pages, scale } = exportOf(scoreWith(VARIED[3], 4), { pageSize });
    const drawn = pages.flatMap(page => glyphs(page.items, ...Object.keys(OUTLINES)));
    assert.ok(drawn.length > 100);
    assert.equal(GLYPH_SIZE, 4 * SPACE);
    // A positive, equal scale on both axes: not mirrored, not upside down.
    for (const glyph of drawn) assert.ok(near(glyph.scale, GLYPH_SIZE / UNITS_PER_EM * scale, 1e-6));
  }
});

test('the G clef sits on the second line from the bottom, and the time signature fills the staff', () => {
  const { systems, scale, layout } = exportOf(scoreWith({}, 1));
  systems.forEach((system, s) => {
    const [clef, ...others] = glyphs(system.items, 'gClef');
    assert.equal(others.length, 0);
    assert.ok(near(clef.y, system.staff[3].y1));
    assert.ok(near(clef.x, MARGIN.left + layout.systems[s].clefX * scale));
    // The curl goes round the G line and the tail hangs below the staff.
    const [, low, , high] = inkBox(clef);
    assert.ok(high > system.staff[0].y1 && low < system.staff[4].y1);
    assert.ok(high - clef.y > clef.y - low, 'the clef is taller above its line than below');

    const digits = glyphs(system.items, 'timeSig4');
    assert.equal(digits.length, s === 0 ? 2 : 0);
  });
  // Each 4 is two spaces tall, centred on its baseline: the lines next to the
  // top and to the bottom of the staff.
  const [upper, lower] = glyphs(systems[0].items, 'timeSig4');
  const advance = OUTLINES.timeSig4.advance * upper.scale;
  assert.ok(near(upper.y, systems[0].staff[1].y1));
  assert.ok(near(lower.y, systems[0].staff[3].y1));
  for (const digit of [upper, lower]) {
    assert.ok(near(digit.x + advance / 2, MARGIN.left + layout.systems[0].timeX * scale));
  }
});

test('each notehead sits on the line or space of its pitch, higher notes higher on the page', () => {
  for (const overrides of VARIED) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      const score = scoreWith(overrides, 6);
      const { systems, scale, layout } = exportOf(score, { pageSize });
      const notes = allNotes(score);
      let n = 0;
      systems.forEach((system, s) => {
        const placed = layoutNotes(layout.systems[s]);
        const heads = noteheads(system.items);
        assert.equal(heads.length, placed.length);
        heads.forEach((head, i) => {
          // From the pitch alone: half a space per step above the bottom line.
          const bottomLine = system.staff[4].y1;
          assert.ok(near(head.y, bottomLine + staffStep(notes[n++].pitch) * (SPACE / 2) * scale));
          // The left edge of the head is half a head left of the note's x.
          assert.ok(near(head.x, MARGIN.left + (placed[i].x - HEAD / 2) * scale));
        });
      });
      assert.equal(n, notes.length);
    }
  }
});

test('ledger lines are drawn for notes outside the staff, and only for them', () => {
  const score = scoreWith({ positions: [1, 12], rotatePositions: true, noteValues: ['quarter', 'eighth'] }, 3);
  const { systems, scale, layout } = exportOf(score);
  let total = 0;
  systems.forEach((system, s) => {
    const weight = METRICS.ledger * SPACE * scale;
    const ledgers = system.items.filter(i =>
      i.kind === 'line' && i.y1 === i.y2 && near(i.width, weight, 0.001));
    const expected = layoutNotes(layout.systems[s]).flatMap(note => note.ledgers.map(y => ({ note, y })));
    assert.equal(ledgers.length, expected.length);
    ledgers.forEach((ledger, i) => {
      // Outside the staff, on a line's place, and wider than the notehead.
      const { staff } = system;
      assert.ok(ledger.y1 > staff[0].y1 || ledger.y1 < staff[4].y1);
      assert.ok(near(ledger.y1, staff[0].y1 - (expected[i].y - layout.systems[s].top) * scale));
      const left = MARGIN.left + (expected[i].note.x - HEAD / 2) * scale;
      assert.ok(near(left - ledger.x1, METRICS.ledgerExtension * SPACE * scale));
      assert.ok(near(ledger.x2 - left - HEAD * scale, METRICS.ledgerExtension * SPACE * scale));
    });
    total += ledgers.length;
  });
  assert.ok(total > 10);
});

test('an accidental ends a quarter of a space before its notehead, at the same height', () => {
  // The signs drawn in each system, each checked against the notehead before it.
  const signsOf = ({ systems, scale }) => systems.map(system => {
    const signs = [];
    let head = null;
    for (const item of system.items) {
      if (item.kind !== 'glyph') continue;
      if (item.name === 'noteheadBlack') head = item;
      if (!['sharp', 'flat', 'natural'].includes(item.name)) continue;
      const advance = OUTLINES[item.name].advance * item.scale;
      assert.ok(near(item.x + advance, head.x - 0.25 * SPACE * scale));
      assert.equal(item.y, head.y);
      signs.push(item.name);
    }
    return signs;
  });

  // F sharp, F natural, B flat, B natural: one of each sign, two of the last.
  const bar = [[54, 4], [53, 4], [58, 4, 'flat'], [59, 4]];
  assert.deepEqual(signsOf(exportOf(handMade([bar]))), [['sharp', 'natural', 'flat', 'natural']]);

  let total = 0;
  for (const overrides of [DENSE, VARIED[3]]) {
    for (const seed of seeds(3)) {
      const exported = exportOf(scoreWith(overrides, seed));
      const expected = exported.layout.systems.map(system =>
        layoutNotes(system).map(note => note.accidental).filter(Boolean));
      assert.deepEqual(signsOf(exported), expected);
      total += expected.flat().length;
    }
  }
  assert.ok(total > 100);
});

test('a stem starts at its notehead: on the right going up, on the left going down', () => {
  for (const overrides of VARIED) {
    const score = scoreWith(overrides, 8);
    const { systems, scale } = exportOf(score);
    const notes = allNotes(score);
    const half = METRICS.stem * SPACE * scale / 2;
    let n = 0;
    for (const system of systems) {
      const heads = noteheads(system.items);
      const lines = stems(system.items, scale);
      assert.equal(lines.length, heads.length);
      heads.forEach((head, i) => {
        const stem = lines[i];
        const up = stem.y2 > stem.y1; // drawn from the notehead to the tip
        assert.ok(near(stem.x1, up ? head.x + HEAD * scale - half : head.x + half));
        assert.ok(near(stem.y1, head.y + (up ? 1 : -1) * METRICS.stemAttachY * SPACE * scale));
        assert.ok(Math.abs(stem.y2 - head.y) >= 3.2 * SPACE * scale - 0.002);
        // An unbeamed note below the middle line has its stem up.
        const note = notes[n++];
        if (note.dur === 4) assert.equal(up, staffStep(note.pitch) < 4);
      });
    }
  }
});

test('beams are the layout\'s quadrilaterals, and every beamed stem ends on one', () => {
  for (const overrides of VARIED.slice(1)) {
    const score = scoreWith(overrides, 5);
    const { systems, scale, layout } = exportOf(score);
    let beamed = 0;
    systems.forEach((system, s) => {
      const placed = layout.systems[s];
      const toPage = ([x, y]) => [MARGIN.left + x * scale, system.staff[0].y1 - (y - placed.top) * scale];
      const beams = polygons(system.items);
      const expected = placed.bars.flatMap(bar => bar.beams);
      assert.equal(beams.length, expected.length);
      beams.forEach(({ points }, i) => {
        const { x1, y1, x2, y2, thickness } = expected[i];
        const corners = [[x1, y1], [x2, y2], [x2, y2 + thickness], [x1, y1 + thickness]].map(toPage);
        assert.equal(points.length, 4);
        points.forEach(([x, y], k) => assert.ok(near(x, corners[k][0]) && near(y, corners[k][1])));
        assert.ok(near(Math.abs(points[3][1] - points[0][1]), METRICS.beam * SPACE * scale));
      });

      const lines = stems(system.items, scale);
      layoutNotes(placed).forEach((note, i) => {
        if (note.dur === 4) return;
        const { x1: x, y2: tip } = lines[i];
        // The first edge of a beam runs along the stem tips.
        const meets = beams.some(({ points: [a, b] }) =>
          x > a[0] - 0.002 && x < b[0] + 0.002 &&
          near(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]), tip, 0.01));
        assert.ok(meets, 'a beamed stem ends short of its beam, or past it');
        beamed++;
      });
    });
    assert.ok(beamed > 30);
  }
});

test('a barline closes each measure, and the last is thin then thick at the end of the staff', () => {
  for (const overrides of VARIED) {
    const { systems, scale, layout } = exportOf(scoreWith(overrides, 7));
    systems.forEach((system, s) => {
      const thin = uprights(system.items, 'thinBarline', scale);
      const { bars } = layout.systems[s];
      assert.equal(thin.length, bars.length);
      thin.forEach((line, i) => {
        assert.equal(line.y1, system.staff[0].y1);
        assert.equal(line.y2, system.staff[4].y1);
        if (!bars[i].final) assert.ok(near(line.x1, MARGIN.left + bars[i].x1 * scale));
      });
    });
    const last = systems.at(-1);
    const [thick, ...others] = systems.flatMap(system => uprights(system.items, 'thickBarline', scale));
    assert.equal(others.length, 0);
    assert.ok(uprights(last.items, 'thickBarline', scale).includes(thick));
    const thin = uprights(last.items, 'thinBarline', scale).at(-1);
    // The thick line's right edge is the end of the staff; the thin one
    // stands to its left, a gap away.
    assert.ok(near(thick.x1 + thick.width / 2, last.staff[0].x2));
    const gap = thick.x1 - thick.width / 2 - (thin.x1 + thin.width / 2);
    assert.ok(near(gap, METRICS.barlineGap * SPACE * scale));
    assert.equal(thick.y1, last.staff[0].y1);
    assert.equal(thick.y2, last.staff[4].y1);
  }
});

test('position marks are bold numerals centred over the first note, above everything in the system', () => {
  const rotating = { positions: ALL_POSITIONS, rotatePositions: true, noteValues: ['quarter', 'eighth'] };
  for (const overrides of [{ positions: [7] }, rotating]) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      const { systems, scale, layout } = exportOf(scoreWith(overrides, 3), { pageSize });
      const seen = [];
      systems.forEach((system, s) => {
        const placed = layout.systems[s];
        const expected = placed.bars.filter(bar => bar.showPosition);
        const marks = texts(system.items, 'Times-Bold');
        assert.deepEqual(marks.map(mark => mark.string), expected.map(bar => ROMAN[bar.position]));
        marks.forEach((mark, i) => {
          assert.ok(near(mark.size, 17 * scale));
          assert.ok(near(mark.x + mark.width / 2, MARGIN.left + expected[i].markX * scale, 0.01));
          assert.ok(near(mark.y, system.staff[0].y1 + (placed.top - placed.markY) * scale));
          assert.ok(mark.y >= system.staff[0].y1 + 2 * SPACE * scale - 0.002);
          for (const head of noteheads(system.items)) assert.ok(mark.y > head.y);
        });
        seen.push(...marks.map(mark => mark.string));
      });
      assert.equal(seen.length, overrides.rotatePositions ? 16 : 1);
      if (!overrides.rotatePositions) assert.deepEqual(seen, ['VII']);
    }
  }
});

test('systems after the first carry their measure number above the start of the staff', () => {
  const score = scoreWith({ noteValues: ['eighth', 'sixteenth'] }, 2);
  const { systems, scale, layout } = exportOf(score, { pageSize: 'a4' });
  assert.ok(systems.length > 4);
  systems.forEach((system, s) => {
    const numbers = texts(system.items, 'Times-Italic');
    if (s === 0) {
      assert.equal(numbers.length, 0);
      return;
    }
    assert.equal(numbers.length, 1);
    assert.equal(numbers[0].string, String(layout.systems[s].bars[0].number));
    assert.ok(near(numbers[0].size, 13 * scale));
    assert.ok(near(numbers[0].x, system.staff[0].x1));
    assert.ok(near(numbers[0].y, system.staff[0].y1 + 2 * SPACE * scale));
  });
});

// ---- Against the screen -----------------------------------------------------

// Enough of a DOM for src/render to build its SVG in Node: elements that
// remember their attributes, their children and their text.
class FakeElement {
  constructor(name) {
    this.name = name;
    this.attrs = {};
    this.children = [];
  }

  setAttribute(key, value) {
    this.attrs[key] = String(value);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener() {}
}

const GLYPH_OF_CHAR = new Map(Object.entries(GLYPH).map(([name, char]) => [char, name]));
const ANCHOR_SHIFT = { start: 0, middle: 0.5, end: 1 };

// What an SVG element draws, in layout units and in the terms of readPage.
// A glyph's x is where its outline starts, as the browser places it for the
// element's text-anchor.
function screenItems(node) {
  const number = key => Number(node.attrs[key]);
  if (node.name === 'g') return node.children.flatMap(screenItems);
  if (node.name === 'rect' && node.attrs.class === 'hit') return []; // for the pointer; nothing is drawn
  if (node.name === 'line') {
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(number);
    return [{ kind: 'line', x1, y1, x2, y2, width: number('stroke-width') }];
  }
  if (node.name === 'polygon') {
    return [{ kind: 'polygon', points: node.attrs.points.split(' ').map(pair => pair.split(',').map(Number)) }];
  }
  assert.equal(node.name, 'text', `the screen draws a <${node.name}> this test does not know`);
  const shift = ANCHOR_SHIFT[node.attrs['text-anchor'] ?? 'start'];
  if (!node.attrs['font-size']) {
    return [{ kind: 'text', string: String(node.textContent), x: number('x'), y: number('y'), shift }];
  }
  const name = GLYPH_OF_CHAR.get(node.textContent);
  const advance = OUTLINES[name].advance * number('font-size') / UNITS_PER_EM;
  return [{ kind: 'glyph', name, x: number('x') - shift * advance, y: number('y') }];
}

// The systems of a score as src/render/score.js draws them on screen.
async function onScreen(score) {
  globalThis.document = {
    createElementNS: (namespace, name) => new FakeElement(name),
    createElement: name => new FakeElement(name),
    getElementById: () => new FakeElement('div'),
    addEventListener() {}
  };
  globalThis.window = { addEventListener() {} };
  try {
    const { renderScore } = await import('../src/render/score.js');
    const container = new FakeElement('div');
    renderScore(score, container, PAGE.maxWidth);
    return container.children[0].children.map(svg => svg.children.flatMap(screenItems));
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
}

test('the PDF draws what the screen draws, element for element, in the same order', async () => {
  for (const overrides of VARIED) {
    for (const pageSize of PAGE_SIZE_NAMES) {
      const score = scoreWith(overrides, 4);
      const { systems, scale, layout } = exportOf(score, { pageSize });
      const screen = await onScreen(score);
      assert.equal(systems.length, screen.length);

      systems.forEach((system, s) => {
        const drawn = [...system.staff, ...system.items];
        // Back from points on the page to the layout's units.
        const x = px => (px - MARGIN.left) / scale;
        const y = py => layout.systems[s].top + (system.staff[0].y1 - py) / scale;
        const same = (a, b) => near(a, b, 0.01);
        assert.deepEqual(drawn.map(item => item.kind), screen[s].map(item => item.kind));

        drawn.forEach((item, i) => {
          const wanted = screen[s][i];
          const where = `system ${s + 1}, element ${i + 1} (${item.kind} ${item.name ?? item.string ?? ''})`;
          if (item.kind === 'line') {
            assert.ok(same(x(item.x1), wanted.x1) && same(y(item.y1), wanted.y1), where);
            assert.ok(same(x(item.x2), wanted.x2) && same(y(item.y2), wanted.y2), where);
            assert.ok(same(item.width / scale, wanted.width), where);
          } else if (item.kind === 'polygon') {
            assert.equal(item.points.length, wanted.points.length, where);
            item.points.forEach(([px, py], k) => {
              assert.ok(same(x(px), wanted.points[k][0]) && same(y(py), wanted.points[k][1]), where);
            });
          } else if (item.kind === 'glyph') {
            assert.equal(item.name, wanted.name, where);
            assert.ok(same(x(item.x), wanted.x) && same(y(item.y), wanted.y), where);
          } else {
            assert.equal(item.string, wanted.string, where);
            const anchor = item.x + wanted.shift * item.width;
            assert.ok(same(x(anchor), wanted.x) && same(y(item.y), wanted.y), where);
          }
        });
      });
    }
  }
});

// ---- Words ------------------------------------------------------------------

const titleBlockOf = page => {
  const firstStaff = page.items.findIndex(item => item.kind === 'line' && item.width !== 0.5);
  return page.items.slice(0, firstStaff);
};
const centreOf = page => (MARGIN.left + page.width - MARGIN.right) / 2;
const centred = (item, page) => near(item.x + item.width / 2, centreOf(page), 0.01);

test('the first page opens with the dedication, the title in capitals with its number, and three lines', () => {
  for (const pageSize of PAGE_SIZE_NAMES) {
    const { pages } = exportOf(scoreWith(DENSE, 1), { pageSize });
    const [page, ...later] = pages;
    const block = titleBlockOf(page);
    const find = string => {
      const found = block.filter(item => item.kind === 'text' && item.string === string);
      assert.equal(found.length, 1, `"${string}" is drawn once on the first page`);
      return found[0];
    };
    const dedication = find(TEXT.dedication);
    const title = find('ÉTUDE');
    const number = find(TEXT.number);
    const left = find(TEXT.left);
    const right = find(TEXT.right);
    const meta = find(TEXT.meta);
    assert.equal(block.filter(item => item.kind === 'text').length, 6);

    assert.deepEqual([dedication.font, dedication.size], ['Times-Italic', 10]);
    assert.deepEqual([title.font, title.size, title.spacing], ['Times-Roman', 22, 3]);
    assert.deepEqual([number.font, number.size, number.spacing], ['Times-Italic', 14, 0]);
    assert.deepEqual([left.font, left.size], ['Times-BoldItalic', 11]);
    assert.deepEqual([right.font, right.size], ['Times-Roman', 10]);
    assert.deepEqual([meta.font, meta.size], ['Times-Roman', 8.5]);

    assert.ok(centred(dedication, page));
    assert.ok(centred(meta, page));
    // The title and its number share a baseline and are centred as a pair.
    assert.equal(number.y, title.y);
    assert.ok(number.x > title.x + title.width + 5);
    assert.ok(near((title.x + number.x + number.width) / 2, centreOf(page), 0.01));
    assert.ok(near(left.x, MARGIN.left));
    assert.ok(near(right.x + right.width, page.width - MARGIN.right, 0.01));
    assert.equal(left.y, right.y);
    // From the top down, with room between the lines.
    const baselines = [page.height - MARGIN.top, dedication.y, title.y, left.y, meta.y];
    for (let i = 1; i < baselines.length; i++) assert.ok(baselines[i - 1] - baselines[i] > 7.99);

    // Later pages carry none of it.
    for (const other of later) {
      const strings = other.items.filter(item => item.kind === 'text').map(item => item.string);
      for (const string of ['ÉTUDE', TEXT.number, TEXT.left, TEXT.right, TEXT.meta, TEXT.dedication]) {
        assert.ok(!strings.includes(string));
      }
    }
  }
});

test('the ornament is a thin double rule with a diamond at its centre, between the title and the lines', () => {
  const { pages: [page] } = exportOf(scoreWith({}, 1));
  const block = titleBlockOf(page);
  const rules = block.filter(item => item.kind === 'line');
  const [diamond, ...others] = polygons(block);
  assert.equal(others.length, 0);
  assert.equal(rules.length, 4);
  assert.ok(rules.every(rule => rule.width === 0.5 && rule.y1 === rule.y2));

  const centre = centreOf(page);
  const xs = rules.flatMap(rule => [rule.x1, rule.x2]);
  assert.ok(near(Math.min(...xs) + Math.max(...xs), 2 * centre));
  assert.ok(near(Math.max(...xs) - Math.min(...xs), 180));
  const ys = [...new Set(rules.map(rule => rule.y1))];
  assert.equal(ys.length, 2);
  const [dx1, dy1, dx2, dy2] = inkBox(diamond);
  assert.ok(near((dx1 + dx2) / 2, centre) && near((dy1 + dy2) / 2, (ys[0] + ys[1]) / 2));
  assert.ok(near(dx2 - dx1, dy2 - dy1) && dx2 - dx1 < 8);
  // The rules stop short of the diamond on both sides.
  const inner = rule => Math.min(Math.abs(rule.x1 - centre), Math.abs(rule.x2 - centre));
  assert.ok(rules.every(rule => inner(rule) > (dx2 - dx1) / 2 + 2));

  const title = block.find(item => item.string === 'ÉTUDE');
  const left = block.find(item => item.string === TEXT.left);
  assert.ok(title.y > dy2 && dy1 > left.y + 0.7 * left.size);
});

test('a study without a number has its title centred alone', () => {
  for (const number of [undefined, '']) {
    const { pages: [page] } = exportOf(scoreWith({}, 1), { text: { ...TEXT, title: 'Notes', number } });
    const block = titleBlockOf(page);
    const title = block.find(item => item.string === 'NOTES');
    assert.ok(centred(title, page));
    assert.equal(texts(block, 'Times-Italic').length, 1); // the dedication only
  }
});

test('words that are missing are simply not drawn', () => {
  const score = scoreWith({}, 1);
  const { pages: [page] } = exportOf(score, { text: {} });
  assert.deepEqual(titleBlockOf(page).filter(item => item.kind === 'text'), []);
  assert.deepEqual(texts(page.items, 'Times-Roman'), []);
  assertWellFormed(scoreToPdf(score));
});

test('the plate line is at the foot of every page, with the page count once there are several', () => {
  for (const pageSize of PAGE_SIZE_NAMES) {
    const single = exportOf(scoreWith({}, 1), { pageSize });
    const several = exportOf(scoreWith(DENSE, 1), { pageSize });
    assert.ok(several.pages.length > 1);
    for (const { pages } of [single, several]) {
      pages.forEach((page, i) => {
        const footer = texts(page.items, 'Times-Roman').at(-1);
        const expected = pages.length > 1 ? `${TEXT.plate} · page ${i + 1} of ${pages.length}` : TEXT.plate;
        assert.equal(footer.string, expected);
        assert.deepEqual([footer.size, footer.spacing], [7, 1.5]);
        assert.ok(centred(footer, page));
        // Below all the music, and the last thing on the page.
        assert.equal(page.items.at(-1), footer);
        assert.ok(footer.y + 0.7 * footer.size < FLOOR);
        assert.ok(footer.y >= MARGIN.bottom);
      });
    }
  }
});

test('a long list of positions never runs into the line on its left', () => {
  const twelve = `Positions ${ROMAN.slice(1).join(' · ')}`;
  const cases = [
    { left: TEXT.left, right: twelve, shrunk: false },
    { left: 'Notes drawn at random', right: twelve, shrunk: false },
    { left: `${TEXT.left}, with a great many words after the name of its key`, right: twelve, shrunk: true },
    { left: TEXT.left, right: `${twelve} · ${twelve} · ${twelve}`, shrunk: true }
  ];
  for (const pageSize of PAGE_SIZE_NAMES) {
    for (const { left: leftText, right: rightText, shrunk } of cases) {
      const text = { ...TEXT, left: leftText, right: rightText };
      const { pages } = exportOf(scoreWith({}, 1), { pageSize, text });
      const [page] = pages;
      const [left] = texts(page.items, 'Times-BoldItalic');
      const right = texts(page.items, 'Times-Roman').find(item => item.y === left.y);
      assert.equal(left.string, leftText);
      assert.equal(right.string, rightText);
      const gap = right.x - (left.x + left.width);
      assert.ok(gap >= LINES_GAP - 0.01, `the lines are ${gap.toFixed(2)} pt apart`);
      assert.ok(near(left.x, MARGIN.left));
      assert.ok(near(right.x + right.width, page.width - MARGIN.right, 0.01));
      if (shrunk) {
        // Both by the same amount, and no more than it takes.
        assert.ok(left.size < 11 && right.size < 10);
        assert.ok(near(left.size / right.size, 11 / 10, 0.001));
        assert.ok(gap < LINES_GAP + 0.5);
      } else {
        assert.deepEqual([left.size, right.size], [11, 10]);
      }
      assertInsideMargins(pages);
    }
  }
});

test('a line too long for the page is set smaller, just enough to fit', () => {
  const long = `${TEXT.meta} · ${TEXT.meta}`;
  for (const pageSize of PAGE_SIZE_NAMES) {
    const longTitle = 'A very long title for a very short study of sixteen measures';
    const text = { ...TEXT, meta: long, title: longTitle, dedication: long };
    const { pages } = exportOf(scoreWith({}, 1), { pageSize, text });
    const [page] = pages;
    const room = page.width - MARGIN.left - MARGIN.right;
    const block = titleBlockOf(page);
    const meta = block.find(item => item.string === long && item.font === 'Times-Roman');
    const dedication = block.find(item => item.string === long && item.font === 'Times-Italic');
    for (const [line, natural] of [[meta, 8.5], [dedication, 10]]) {
      assert.ok(line.size < natural);
      assert.ok(line.width <= room + 0.001 && line.width > room - 0.5);
      assert.ok(centred(line, page));
    }
    // The title and its number shrink together and stay centred as a pair.
    const title = block.find(item => item.string === longTitle.toUpperCase());
    const number = block.find(item => item.string === TEXT.number);
    assert.ok(title.size < 22 && near(title.size / number.size, 22 / 14, 0.001));
    assert.ok(near(title.spacing / title.size, 3 / 22, 0.001));
    assert.ok(near(title.x, MARGIN.left, 0.25));
    assert.ok(near(number.x + number.width, page.width - MARGIN.right, 0.25));
    assertInsideMargins(pages);
  }
});
