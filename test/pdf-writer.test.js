import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FONTS, createPdf, formatNumber, textWidth, toWinAnsi } from '../src/export/pdf-writer.js';
import { FIRST_CODE, WIDTHS } from '../src/export/times-metrics.js';

const A4 = [595.276, 841.89];
const LETTER = [612, 792];
const WEDGE = 'M 0 0 L 1000 0 L 500 800 Z';
const DROP = 'M 0 0 C 300 0 300 400 0 400 C -300 400 -300 0 0 0 Z';

const latin1 = bytes => Buffer.from(bytes).toString('latin1');
const count = (text, pattern) => (text.match(pattern) || []).length;

// A stream object taken apart, trusting its /Length the way a viewer does.
function streamOf(body) {
  const head = /^<< (.*)\/Length (\d+) >>\nstream\n/.exec(body);
  if (!head) return null;
  const length = Number(head[2]);
  const start = head[0].length;
  return { dict: head[1], length, data: body.slice(start, start + length), rest: body.slice(start + length) };
}

// Reads a file back the way a viewer does: from the end, through the
// cross-reference table, to each object.
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

// Each page of a parsed file: its dictionary, its content stream and the
// resources it declares.
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

// The content stream of a one-page document drawn by `draw(page, doc)`.
function contentOf(draw) {
  const doc = createPdf();
  draw(doc.addPage(...A4), doc);
  return pagesOf(parsePdf(doc.toBytes()))[0].content.split('\n');
}

// The form stream that a shape's path data turns into.
function formOf(d, bbox = [0, 0, 1, 1]) {
  const doc = createPdf();
  doc.defineShape('shape', d, bbox);
  doc.addPage(...A4).shape('shape', 0, 0, 1);
  const objects = [...parsePdf(doc.toBytes()).objects.values()];
  return objects.find(object => object.body.includes('/Subtype /Form')).stream;
}

const boxOf = stream => /\/BBox \[([^\]]*)\]/.exec(stream.dict)[1].split(' ').map(Number);

// Two pages. The first uses Times-Bold, Times-Italic and the wedge; the second
// uses Times-Roman and the drop. Times-BoldItalic and one shape go unused.
function sampleDoc() {
  const doc = createPdf({ title: 'Study No. 3' });
  doc.defineShape('wedge', WEDGE, [0, 0, 1000, 800]);
  doc.defineShape('unused', 'M 0 0 L 1 0 L 0 1 Z', [0, 0, 1, 1]);
  doc.defineShape('drop', DROP, [-225, 0, 225, 400]);

  const first = doc.addPage(...A4);
  first.text('Étude', 297.638, 780, { font: 'Times-Bold', size: 18, align: 'center', charSpacing: 1.5 });
  first.text('Andante con moto', 50, 740, { font: 'Times-Italic', size: 11 });
  for (let i = 0; i < 5; i++) first.line(50, 700 - 5 * i, 545, 700 - 5 * i, 0.65);
  first.line(50, 680, 50, 700, 0.8);
  first.polygon([[60, 650], [120, 655], [120, 652.5], [60, 647.5]]);
  first.shape('wedge', 100, 600, 0.0196);
  first.shape('wedge', 140, 600, 0.0196);

  const second = doc.addPage(...LETTER);
  second.shape('drop', 306, 396, 1 / 3);
  second.text('2', 306, 40, { align: 'center' });
  return doc;
}

const streamsOf = pdf => [...pdf.objects.values()].filter(o => o.stream).map(o => o.stream);

// PDF 1.4 allows a line that is not stream data no more than 255 characters
// (section 3.4 of the reference). The line end is counted here, so that the
// file keeps the rule however a reader counts.
const LINE_LIMIT = 255;

// The lines of a file with the data of every stream taken out.
function linesOutsideStreams(pdf) {
  const emptied = streamsOf(pdf).reduce(
    (file, { data }) => file.replace(`stream\n${data}\nendstream`, 'stream\nendstream'), pdf.file);
  return emptied.split('\n');
}

const longestLine = pdf => Math.max(...linesOutsideStreams(pdf).map(line => line.length + 1));

// A file's title as a viewer reads it: a literal string with its escapes, or
// UTF-16BE in hex, where white space between the digits means nothing.
function titleOf(pdf) {
  const info = pdf.objects.get(3).body;
  const literal = /\/Title\s+\(((?:\\.|[^\\)])*)\)/.exec(info);
  if (literal) return literal[1].replace(/\\(.)/g, '$1');
  const digits = /\/Title\s+<FEFF([^>]*)>/.exec(info)[1].replace(/\s+/g, '');
  assert.match(digits, /^([0-9A-F]{4})*$/);
  return (digits.match(/.{4}/g) || []).map(unit => String.fromCharCode(parseInt(unit, 16))).join('');
}

// Every object is where the cross-reference table says, and every stream is
// as long as it says: the file can be read back whatever lines it was cut into.
function assertReadable(pdf) {
  for (const [number, object] of pdf.objects) {
    assert.ok(object.labelled, `entry ${number} does not point at "${number} 0 obj"`);
    if (!object.stream) continue;
    assert.equal(object.stream.rest, '\nendstream');
    assert.equal(object.stream.data.length, object.stream.length);
  }
}

// A document of `pages` pages, each showing its own number.
function numberedPages(pages, options) {
  const doc = createPdf(options);
  for (let i = 0; i < pages; i++) doc.addPage(...A4).text(String(i + 1), 50, 50);
  return doc;
}

// One page that uses all four fonts and `shapes` different shapes.
function crowdedPage(shapes) {
  const doc = createPdf();
  const page = doc.addPage(...A4);
  FONTS.forEach((font, i) => page.text(font, 50, 700 - 20 * i, { font }));
  for (let i = 1; i <= shapes; i++) {
    doc.defineShape(`shape${i}`, `M 0 0 L ${i} 0 L 0 ${i} Z`, [0, 0, i, i]);
    page.shape(`shape${i}`, 10 * i, 100, 1);
  }
  return doc;
}

// A page and a shape with the longest numbers the writer will write, for the
// dictionaries that are not wrapped: the boxes of a page and of a form.
function vastPage() {
  const doc = createPdf();
  doc.defineShape('vast', WEDGE, [-4e20, -4e20, 4e20, 4e20]);
  doc.addPage(9.9e20, 9.9e20).shape('vast', -9.9e20, -9.9e20, 1);
  return doc;
}

const ACCENTED_TITLE ='Étude de concert pour la main gauche seule, d’après un prélude';
const ASCII_TITLE = 'A study (the third) \\ in thirds, '.repeat(9);

test('the file opens with the PDF 1.4 header and a binary comment, and is otherwise ASCII', () => {
  const bytes = sampleDoc().toBytes();
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(latin1(bytes.subarray(0, 10)), '%PDF-1.4\n%');
  assert.ok([...bytes.subarray(10, 14)].every(byte => byte > 127));
  assert.equal(bytes[14], 0x0A);
  assert.ok(bytes.subarray(15).every(byte => byte < 128));
});

test('the file stays ASCII whatever the text and the title say', () => {
  const doc = createPdf({ title: 'Étude – ♯1 “très” (vite)' });
  doc.addPage(...A4).text('Ünïcödé – “♯♭♮” € … \u{1D11E} (a\\b)', 50, 700);
  assert.ok(doc.toBytes().subarray(15).every(byte => byte < 128));
});

test('every cross-reference entry is twenty bytes and points at its object', () => {
  const pdf = parsePdf(sampleDoc().toBytes());
  assert.ok(pdf.file.startsWith('xref\n', pdf.startxref));
  assert.equal(pdf.entries[0], '0000000000 65535 f \n');
  for (const entry of pdf.entries.slice(1)) assert.match(entry, /^\d{10} 00000 n \n$/);
  for (const [number, object] of pdf.objects) {
    assert.ok(object.labelled, `entry ${number} does not point at "${number} 0 obj"`);
  }
  // The table follows the last object directly and misses none.
  assert.equal(count(pdf.file, /^\d+ 0 obj$/gm), pdf.size - 1);
  assert.equal(pdf.file.lastIndexOf('\nendobj\n') + '\nendobj\n'.length, pdf.startxref);
});

test('the trailer gives the size, the catalog and the info dictionary, and ends the file', () => {
  const pdf = parsePdf(sampleDoc().toBytes());
  assert.equal(pdf.trailer,
    `trailer\n<< /Size ${pdf.size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${pdf.startxref}\n%%EOF\n`);
  assert.equal(pdf.objects.get(1).body, '<< /Type /Catalog /Pages 2 0 R >>');
  assert.match(pdf.objects.get(3).body, /\/Producer /);
});

test('each stream length equals the byte length of its data', () => {
  const pdf = parsePdf(sampleDoc().toBytes());
  const streams = streamsOf(pdf);
  assert.equal(streams.length, 4); // two shapes and two pages
  for (const stream of streams) {
    assert.equal(stream.rest, '\nendstream');
    assert.equal(stream.data.length, stream.length);
    assert.ok(!stream.data.includes('endstream'));
    assert.ok(!stream.dict.includes('/Filter'), 'streams are not compressed');
  }
  assert.equal(count(pdf.file, /^stream$/gm), 4);
});

test('an empty page has an empty content stream and no resources', () => {
  const doc = createPdf();
  doc.addPage(...A4);
  const pdf = parsePdf(doc.toBytes());
  const [page] = pagesOf(pdf);
  assert.equal(page.content, '');
  assert.match(page.body, /\/Resources << >>/);
  assert.equal(pdf.size - 1, 5); // catalog, page tree, info, page, content
});

test('there is one page object and one content stream per page', () => {
  const pdf = parsePdf(sampleDoc().toBytes());
  const pages = pagesOf(pdf);
  assert.equal(pages.length, 2);
  assert.match(pdf.objects.get(2).body, /^<< \/Type \/Pages \/Kids \[\d+ 0 R \d+ 0 R\] \/Count 2 >>$/);
  assert.equal(count(pdf.file, /\/Type \/Page /g), 2);
  assert.match(pages[0].body, /\/Parent 2 0 R \/MediaBox \[0 0 595\.276 841\.89\]/);
  assert.match(pages[1].body, /\/Parent 2 0 R \/MediaBox \[0 0 612 792\]/);
  assert.notEqual(pages[0].content, pages[1].content);

  const many = createPdf();
  for (let i = 0; i < 7; i++) many.addPage(...A4).text(String(i + 1), 50, 50);
  assert.equal(pagesOf(parsePdf(many.toBytes())).length, 7);
});

test('a page lists only the fonts and shapes it uses', () => {
  const pdf = parsePdf(sampleDoc().toBytes());
  const [first, second] = pagesOf(pdf);
  const baseFont = ({ ref }) => /\/BaseFont \/([\w-]+)/.exec(pdf.objects.get(ref).body)[1];
  assert.deepEqual(first.fonts.map(baseFont), ['Times-Bold', 'Times-Italic']);
  assert.deepEqual(second.fonts.map(baseFont), ['Times-Roman']);
  assert.equal(first.shapes.length, 1);
  assert.equal(second.shapes.length, 1);
  assert.notEqual(first.shapes[0].ref, second.shapes[0].ref);

  // What the content stream asks for is exactly what the page declares.
  for (const page of [first, second]) {
    const selected = new Set([...page.content.matchAll(/\/(\w+) [\d.]+ Tf/g)].map(m => m[1]));
    const drawn = new Set([...page.content.matchAll(/\/(\w+) Do/g)].map(m => m[1]));
    assert.deepEqual([...selected].sort(), page.fonts.map(f => f.name).sort());
    assert.deepEqual([...drawn].sort(), page.shapes.map(s => s.name).sort());
    for (const { ref } of page.shapes) assert.match(pdf.objects.get(ref).body, /\/Subtype \/Form/);
  }
});

test('fonts and shapes that no page uses are left out of the file', () => {
  const pdf = parsePdf(sampleDoc().toBytes());
  assert.equal(count(pdf.file, /\/Type \/Font /g), 3);
  assert.ok(!pdf.file.includes('Times-BoldItalic'));
  assert.equal(count(pdf.file, /\/Subtype \/Form /g), 2);
});

test('the fonts are the built-in Times faces, named and never embedded', () => {
  const doc = createPdf();
  const page = doc.addPage(...A4);
  FONTS.forEach((font, i) => page.text(font, 50, 700 - 20 * i, { font }));
  const pdf = parsePdf(doc.toBytes());
  const fonts = pagesOf(pdf)[0].fonts.map(({ ref }) => pdf.objects.get(ref).body);
  assert.deepEqual(fonts, FONTS.map(font =>
    `<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`));
  assert.deepEqual(FONTS, ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic']);
  assert.ok(!/FontFile|FontDescriptor/.test(pdf.file));
});

test('the info dictionary holds the title and the producer only', () => {
  const info = options => {
    const doc = createPdf(options);
    doc.addPage(...A4);
    return parsePdf(doc.toBytes()).objects.get(3).body;
  };
  assert.equal(info({ title: 'Study No. 3' }),
    '<< /Title (Study No. 3) /Producer (Guitar Reading Assistant) >>');
  assert.equal(info(), '<< /Producer (Guitar Reading Assistant) >>');
  // No dates and no ids: they would differ from one export to the next.
  assert.ok(!/CreationDate|ModDate|\/ID/.test(latin1(sampleDoc().toBytes())));
});

test('a title with parentheses, backslashes or accents is written safely', () => {
  const title = options => {
    const doc = createPdf(options);
    doc.addPage(...A4);
    return /\/Title (.*) \/Producer/.exec(parsePdf(doc.toBytes()).objects.get(3).body)[1];
  };
  assert.equal(title({ title: 'Study (No. 3) \\ draft' }), '(Study \\(No. 3\\) \\\\ draft)');
  // Anything beyond ASCII goes out as UTF-16BE behind a byte-order mark.
  const hex = title({ title: 'Étude – F♯' });
  assert.match(hex, /^<FEFF([0-9A-F]{4})+>$/);
  const units = hex.slice(5, -1).match(/.{4}/g).map(h => parseInt(h, 16));
  assert.equal(String.fromCharCode(...units), 'Étude – F♯');
});

test('no line outside a stream passes 255 characters, whatever the document holds', () => {
  const docs = [
    sampleDoc(),
    numberedPages(32),
    numberedPages(40, { title: ACCENTED_TITLE }),
    numberedPages(400),
    numberedPages(1, { title: 'é'.repeat(60) }),
    numberedPages(1, { title: ASCII_TITLE }),
    numberedPages(1, { title: '\u{1D11E}'.repeat(500) }),
    crowdedPage(12),
    crowdedPage(40),
    vastPage()
  ];
  // Titles of every length around the ones that no longer fit on a line:
  // plain letters, characters that are escaped, and letters written in hex.
  for (let length = 180; length <= 270; length++) {
    docs.push(numberedPages(1, { title: 'x'.repeat(length) }));
    docs.push(numberedPages(1, { title: '('.repeat(Math.floor(length / 2)) }));
    docs.push(numberedPages(1, { title: 'é'.repeat(Math.floor(length / 4)) }));
  }
  for (const doc of docs) {
    const pdf = parsePdf(doc.toBytes());
    assert.ok(longestLine(pdf) <= LINE_LIMIT, `a line of ${longestLine(pdf)} characters`);
    assertReadable(pdf);
  }
});

test('stream data is not held to the line limit: a long text stays one line', () => {
  const doc = createPdf();
  doc.addPage(...A4).text('x'.repeat(300), 50, 50);
  const pdf = parsePdf(doc.toBytes());
  assert.ok(pagesOf(pdf)[0].content.length > 600);
  assert.ok(!pagesOf(pdf)[0].content.includes('\n'));
  assert.ok(longestLine(pdf) <= LINE_LIMIT);
});

test('a page tree too long for one line is broken between references and lists every page in order', () => {
  for (const total of [32, 40, 400]) {
    const pdf = parsePdf(numberedPages(total).toBytes());
    const tree = pdf.objects.get(2).body;
    assert.ok(tree.includes('\n'), 'the page tree is still on one line');
    // With its line ends turned back into spaces it is the one-line form:
    // nothing was cut but the white space between two references.
    assert.match(tree.replace(/\n/g, ' '),
      new RegExp(`^<< /Type /Pages /Kids \\[(\\d+ 0 R ?){${total}}\\] /Count ${total} >>$`));
    const pages = pagesOf(pdf);
    assert.equal(pages.length, total);
    pages.forEach((page, i) => {
      const digits = [...String(i + 1)].map(digit => digit.charCodeAt(0).toString(16)).join('');
      assert.ok(page.content.endsWith(` <${digits}> Tj ET`), `page ${i + 1} is out of order`);
    });
    assert.equal(count(pdf.file, /\/Type \/Page /g), total);
  }
});

test('a title too long for one line is written in hex over several lines, and reads back whole', () => {
  const titles = [
    ACCENTED_TITLE, ASCII_TITLE, 'é'.repeat(50), 'é'.repeat(60), 'x'.repeat(199), 'x'.repeat(1000),
    `${'x'.repeat(300)} ♯ \u{1D11E} (a\\b)`
  ];
  for (const title of titles) {
    const pdf = parsePdf(numberedPages(1, { title }).toBytes());
    const info = pdf.objects.get(3).body;
    assert.ok(info.includes('\n'), 'the info dictionary is still on one line');
    assert.equal(titleOf(pdf), title);
    // Each key is on the line where its value begins, and there is still
    // nothing but the title and the producer.
    assert.match(info, /^<< \/Title <FEFF[0-9A-F\s]*>\s\/Producer \(Guitar Reading Assistant\)\s>>$/);
  }
});

test('a title that fits on one line is written on one, as before', () => {
  const short = ['Study No. 3', 'x'.repeat(198), 'Étude No. 417', 'é'.repeat(49), 'Étude – F♯', '(a\\b)'];
  for (const title of short) {
    const pdf = parsePdf(numberedPages(1, { title }).toBytes());
    assert.match(pdf.objects.get(3).body, /^<< \/Title [(<].*[)>] \/Producer \(Guitar Reading Assistant\) >>$/);
    assert.equal(titleOf(pdf), title);
  }
});

test('a page with more resources than fit on one line declares every one of them', () => {
  for (const shapes of [12, 40]) {
    const pdf = parsePdf(crowdedPage(shapes).toBytes());
    const [page] = pagesOf(pdf);
    assert.ok(page.body.includes('\n'), 'the page dictionary is still on one line');
    assert.deepEqual(page.fonts.map(font => font.name), ['F1', 'F2', 'F3', 'F4']);
    assert.equal(page.shapes.length, shapes);
    const drawn = [...page.content.matchAll(/\/(\w+) Do/g)].map(m => m[1]);
    assert.deepEqual(page.shapes.map(shape => shape.name), drawn);
    for (const { ref } of page.shapes) assert.match(pdf.objects.get(ref).body, /\/Subtype \/Form/);
    // Line ends fall only where a space was.
    assert.match(page.body.replace(/\n/g, ' '), new RegExp(
      '^<< /Type /Page /Parent 2 0 R /MediaBox \\[0 0 595\\.276 841\\.89\\] /Resources << ' +
      `/Font << (/F\\d \\d+ 0 R ){4}>> /XObject << (/S\\d+ \\d+ 0 R ){${shapes}}>> >> /Contents \\d+ 0 R >>$`));
  }
});

test('identical calls give byte-identical files', () => {
  const doc = sampleDoc();
  const bytes = doc.toBytes();
  assert.deepEqual(doc.toBytes(), bytes);
  assert.deepEqual(sampleDoc().toBytes(), bytes);
  assert.ok(bytes.length > 1000);
});

test('numbers have at most three decimals, no exponent and no negative zero', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(-0.0004), '0');
  assert.equal(formatNumber(1e-7), '0');
  assert.equal(formatNumber(12), '12');
  assert.equal(formatNumber(1200), '1200');
  assert.equal(formatNumber(12.5), '12.5');
  assert.equal(formatNumber(-12.3456), '-12.346');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(2 / 3), '0.667');
  assert.equal(formatNumber(-0.25), '-0.25');
  assert.equal(formatNumber(1e9), '1000000000');
  assert.equal(formatNumber(123456789.1234), '123456789.123');
  for (const bad of [NaN, Infinity, -Infinity, 1e21, undefined, null, '12']) {
    assert.throws(() => formatNumber(bad), RangeError);
  }
});

test('every number in the file is written in that plain form', () => {
  const doc = createPdf();
  const awkward = 'M 1e-7 -1e-7 L 0.33333 1e3 L -2.00049 6.02e2 C .5 .25 -.75 1.5e1 3.14159 2.71828 Z';
  doc.defineShape('awkward', awkward, [-1 / 3, 0, 1e3, 2e3]);
  const page = doc.addPage(100 / 3, 200 / 3);
  page.line(1 / 3, 2 / 3, 1e-7, -1e-7, 0.1 + 0.2);
  page.polygon([[-0, 0], [1e-9, -1e-9], [1 / 7, 22 / 7]]);
  page.shape('awkward', -1e-5, 1e5 / 3, 1 / 30);
  page.text('x', 1e-10, 2 / 3, { size: 12.34567, charSpacing: 1 / 3, align: 'right' });
  const pdf = parsePdf(doc.toBytes());

  const plain = /^-?(0|[1-9]\d*)(\.\d{0,2}[1-9])?$/;
  let checked = 0;
  for (const { data, dict } of streamsOf(pdf)) {
    for (const token of `${data} ${dict}`.split(/[\s[\]]+/)) {
      if (!/^[-+.\d]/.test(token)) continue; // an operator, a name or a string
      assert.match(token, plain);
      assert.notEqual(token, '-0');
      checked++;
    }
  }
  assert.ok(checked > 40);
  assert.ok(!/\d[eE][-+]?\d/.test(pdf.file.replace(/<[0-9A-F]*>/g, '')));
  assert.match(pagesOf(pdf)[0].body, /\/MediaBox \[0 0 33\.333 66\.667\]/);
});

test('the widths are the Adobe metrics, by WinAnsi code', () => {
  const units = (string, font = 'Times-Roman') => textWidth(string, font, 1000);
  assert.equal(units(' '), 250);
  assert.equal(units('A'), 722);
  assert.equal(units('a'), 444);
  assert.equal(units('0'), 500);
  assert.equal(units('É'), 611);
  assert.equal(units('–'), 500);
  assert.equal(units('—'), 1000);
  assert.equal(units('·'), 250);
  assert.equal(units('I', 'Times-Bold'), 389);
  assert.equal(units('V', 'Times-Bold'), 722);
  assert.equal(units('X', 'Times-Bold'), 722);
  // Where WinAnsi and the metrics files' own encoding disagree below 128.
  assert.equal(units("'"), 180);
  assert.equal(units('`'), 333);
  for (const font of FONTS) {
    assert.equal(WIDTHS[font].length, 256 - FIRST_CODE);
    assert.ok(WIDTHS[font].every(width => Number.isInteger(width) && width > 0 && width <= 1000));
    for (const digit of '0123456789') assert.equal(units(digit, font), 500);
  }
  assert.deepEqual(Object.keys(WIDTHS), FONTS);
});

test('text width adds up the characters and scales with the size', () => {
  assert.equal(textWidth('', 'Times-Roman', 12), 0);
  assert.equal(textWidth('A', 'Times-Roman', 10), 7.22);
  assert.equal(textWidth('ABC', 'Times-Roman', 10), 20.56); // 722 + 667 + 667
  assert.equal(textWidth('ABC', 'Times-Roman', 20), 41.12);
  assert.ok(textWidth('ABC', 'Times-Bold', 10) > textWidth('ABC', 'Times-Roman', 10));
  // Width is measured on what is written: a flat is a "b", a natural nothing.
  assert.equal(textWidth('B♭', 'Times-Roman', 10), textWidth('Bb', 'Times-Roman', 10));
  assert.equal(textWidth('B♮', 'Times-Roman', 10), textWidth('B', 'Times-Roman', 10));
  assert.throws(() => textWidth('A', 'Helvetica', 10), /Unknown font/);
});

test('character spacing is added after every character', () => {
  assert.equal(textWidth('ABC', 'Times-Roman', 10, 2), 26.56);
  assert.equal(textWidth('ABC', 'Times-Roman', 10, -0.5), 19.06);
  assert.equal(textWidth('', 'Times-Roman', 10, 2), 0);
});

test('text starts at x, is centred on x or ends at x', () => {
  const tdOf = options => {
    const [line] = contentOf(page => page.text('ABC', 100, 500, { size: 10, ...options }));
    return /Tf (?:[-\d.]+ Tc )?([-\d.]+) ([-\d.]+) Td/.exec(line).slice(1).map(Number);
  };
  assert.deepEqual(tdOf({}), [100, 500]);
  assert.deepEqual(tdOf({ align: 'left' }), [100, 500]);
  assert.deepEqual(tdOf({ align: 'center' }), [89.72, 500]);
  assert.deepEqual(tdOf({ align: 'right' }), [79.44, 500]);
  // Spacing widens the line, and the alignment follows.
  assert.deepEqual(tdOf({ align: 'left', charSpacing: 2 }), [100, 500]);
  assert.deepEqual(tdOf({ align: 'center', charSpacing: 2 }), [86.72, 500]);
  assert.deepEqual(tdOf({ align: 'right', charSpacing: 2 }), [73.44, 500]);
  const boldEnd = tdOf({ align: 'right', charSpacing: 2, font: 'Times-Bold' })[0];
  assert.ok(Math.abs(boldEnd + textWidth('ABC', 'Times-Bold', 10, 2) - 100) < 0.0006);
});

test('character spacing is written when it changes, and put back to zero', () => {
  const lines = contentOf(page => {
    page.text('a', 0, 0);
    page.text('b', 0, 0, { charSpacing: 1.5 });
    page.text('c', 0, 0, { charSpacing: 1.5 });
    page.text('d', 0, 0);
  });
  const spacings = lines.map(line => (/([-\d.]+) Tc/.exec(line) || [])[1]);
  assert.deepEqual(spacings, [undefined, '1.5', undefined, '0']);
});

test('text is written as one hex string in its font and size', () => {
  const lines = contentOf(page => {
    page.text('Hello', 72, 720);
    page.text('Hello', 72, 700, { font: 'Times-BoldItalic', size: 9.5 });
    page.text('', 72, 680, { font: 'Times-Bold' });
  });
  assert.deepEqual(lines, [
    'BT /F1 12 Tf 72 720 Td <48656C6C6F> Tj ET',
    'BT /F4 9.5 Tf 72 700 Td <48656C6C6F> Tj ET'
  ]);
});

test('an empty string draws nothing and claims no font', () => {
  const doc = createPdf();
  doc.addPage(...A4).text('♮', 72, 680, { font: 'Times-Bold' });
  const [page] = pagesOf(parsePdf(doc.toBytes()));
  assert.equal(page.content, '');
  assert.deepEqual(page.fonts, []);
});

test('parentheses, backslashes and high bytes in text need no escaping', () => {
  const [line] = contentOf(page => page.text('(a\\b) é – F♯', 0, 0));
  assert.ok(line.endsWith(' <28615C622920E92096204623> Tj ET'), line);
  assert.ok(!/[()\\]/.test(line));
});

test('Latin-1 characters keep their code, and a no-break space becomes a space', () => {
  assert.deepEqual(toWinAnsi('Az ~'), [0x41, 0x7A, 0x20, 0x7E]);
  assert.deepEqual(toWinAnsi('¡éÿ'), [0xA1, 0xE9, 0xFF]);
  assert.deepEqual(toWinAnsi('a b'), [0x61, 0x20, 0x62]);
  for (let code = 0x20; code <= 0xFF; code++) {
    if (code >= 0x7F && code <= 0xA0) continue;
    assert.deepEqual(toWinAnsi(String.fromCharCode(code)), [code]);
  }
});

test('the Windows-1252 specials map to their bytes', () => {
  assert.deepEqual(toWinAnsi('–—'), [0x96, 0x97]);
  assert.deepEqual(toWinAnsi('‘’“”'), [0x91, 0x92, 0x93, 0x94]);
  assert.deepEqual(toWinAnsi('•…€™'), [0x95, 0x85, 0x80, 0x99]);
  assert.deepEqual(toWinAnsi('‚ƒ„†‡ˆ'), [0x82, 0x83, 0x84, 0x86, 0x87, 0x88]);
  assert.deepEqual(toWinAnsi('‰Š‹ŒŽ'), [0x89, 0x8A, 0x8B, 0x8C, 0x8E]);
  assert.deepEqual(toWinAnsi('˜š›œžŸ'), [0x98, 0x9A, 0x9B, 0x9C, 0x9E, 0x9F]);
});

test('the mapping agrees with the platform\'s Windows-1252 decoder for every byte', () => {
  const decoder = new TextDecoder('windows-1252');
  const unused = [0x7F, 0x81, 0x8D, 0x8F, 0x90, 0x9D]; // decoded as control characters
  for (let byte = 0x20; byte <= 0xFF; byte++) {
    const char = decoder.decode(Uint8Array.of(byte));
    const expected = unused.includes(byte) ? 0x3F : byte === 0xA0 ? 0x20 : byte;
    assert.deepEqual(toWinAnsi(char), [expected], `byte 0x${byte.toString(16)}`);
  }
});

test('a sharp becomes #, a flat becomes b and a natural is dropped', () => {
  assert.deepEqual(toWinAnsi('F♯'), [0x46, 0x23]);
  assert.deepEqual(toWinAnsi('B♭'), [0x42, 0x62]);
  assert.deepEqual(toWinAnsi('C♮'), [0x43]);
  assert.deepEqual(toWinAnsi('♮'), []);
});

test('a character outside WinAnsi becomes a single question mark', () => {
  assert.deepEqual(toWinAnsi('λ'), [0x3F]);
  assert.deepEqual(toWinAnsi('a\tb\nc'), [0x61, 0x3F, 0x62, 0x3F, 0x63]);
  assert.deepEqual(toWinAnsi('\u0081\u009D'), [0x3F, 0x3F]);
  assert.deepEqual(toWinAnsi('\u{1D11E}'), [0x3F]); // one clef, two UTF-16 units
  assert.deepEqual(toWinAnsi('①'), [0x3F]);
  // A letter and its combining accent are one character when composed.
  assert.deepEqual(toWinAnsi('é'), [0xE9]);
});

test('a line is stroked at its width, which is stated once for a run of equal lines', () => {
  const lines = contentOf(page => {
    page.line(50, 700, 545, 700, 0.65);
    page.line(50, 695, 545, 695, 0.65);
    page.line(50, 680, 50, 700, 1.2);
    page.line(545, 680, 545, 700, 0.65);
  });
  assert.deepEqual(lines, [
    '0.65 w',
    '50 700 m 545 700 l S',
    '50 695 m 545 695 l S',
    '1.2 w',
    '50 680 m 50 700 l S',
    '0.65 w',
    '545 680 m 545 700 l S'
  ]);
  // Butt caps and black are the defaults; nothing may change them.
  assert.ok(!lines.some(line => /\b(J|j|d|RG|rg|G|g|K|k)$/.test(line)));
});

test('a polygon is closed and filled', () => {
  const lines = contentOf(page => page.polygon([[60, 650], [120, 655], [120, 652.5], [60, 647.5]]));
  assert.deepEqual(lines, ['60 650 m 120 655 l 120 652.5 l 60 647.5 l h f']);
});

test('a shape becomes a form holding its outline, filled non-zero', () => {
  const wedge = formOf(WEDGE, [0, 0, 1000, 800]);
  assert.match(wedge.dict, /^\/Type \/XObject \/Subtype \/Form \/BBox \[/);
  assert.deepEqual(wedge.data.split('\n'), ['0 0 m', '1000 0 l', '500 800 l', 'h', 'f']);
  const drop = formOf(DROP, [-225, 0, 225, 400]);
  assert.deepEqual(drop.data.split('\n'), [
    '0 0 m', '300 0 300 400 0 400 c', '-300 400 -300 0 0 0 c', 'h', 'f'
  ]);
  // "f" is the non-zero fill; "f*" would be even-odd.
  assert.ok(!/f\*|\bB\b|\bS\b/.test(wedge.data + drop.data));
});

test('a form\'s box leaves half its longer side to spare, so the clip never shaves an edge', () => {
  assert.deepEqual(boxOf(formOf(WEDGE, [0, 0, 1000, 800])), [-500, -500, 1500, 1300]);
  assert.deepEqual(boxOf(formOf(DROP, [-225, 0, 225, 400])), [-450, -225, 450, 625]);
  // Corners given the other way round mean the same box.
  assert.deepEqual(boxOf(formOf(WEDGE, [1000, 800, 0, 0])), [-500, -500, 1500, 1300]);
});

test('a shape is drawn at its origin and keeps its scale to six decimals', () => {
  for (const scale of [0.0196, 0.0234567, 1 / 48, 0.5, 1, 2.75]) {
    const doc = createPdf();
    doc.defineShape('wedge', WEDGE, [0, 0, 1000, 800]);
    doc.addPage(...A4).shape('wedge', 123.4, 567.8, scale);
    const pdf = parsePdf(doc.toBytes());
    const [page] = pagesOf(pdf);
    const drawn = /^q ([\d.]+) 0 0 ([\d.]+) 123\.4 567\.8 cm \/(\w+) Do Q$/.exec(page.content);
    assert.ok(drawn, page.content);
    assert.equal(drawn[3], page.shapes[0].name);
    // The form's own matrix and the one it is drawn with multiply to the scale.
    const form = pdf.objects.get(page.shapes[0].ref).body;
    const matrix = /\/Matrix \[([\d.]+) 0 0 ([\d.]+) 0 0\]/.exec(form);
    assert.ok(Math.abs(Number(drawn[1]) * Number(matrix[1]) - scale) < 1e-6);
    assert.ok(Math.abs(Number(drawn[2]) * Number(matrix[2]) - scale) < 1e-6);
  }
});

test('a shape drawn many times is stored once', () => {
  const doc = createPdf();
  doc.defineShape('wedge', WEDGE, [0, 0, 1000, 800]);
  doc.defineShape('wedge', WEDGE, [0, 0, 1000, 800]); // the same again is harmless
  const page = doc.addPage(...A4);
  for (let i = 0; i < 20; i++) page.shape('wedge', 50 + 10 * i, 600, 0.02);
  const other = doc.addPage(...A4);
  other.shape('wedge', 50, 600, 0.02);
  const pdf = parsePdf(doc.toBytes());
  assert.equal(count(pdf.file, /\/Subtype \/Form /g), 1);
  assert.equal(count(pdf.file, / Do Q$/gm), 21);
  const [first, second] = pagesOf(pdf);
  assert.deepEqual(first.shapes, second.shapes);
});

test('path data may be compact and may repeat coordinates after a command', () => {
  const ops = d => formOf(d).data.split('\n');
  assert.deepEqual(ops('M0,0L10,0 10,10Z'), ['0 0 m', '10 0 l', '10 10 l', 'h', 'f']);
  assert.deepEqual(ops('M 0 0 10 0 10 10 z'), ['0 0 m', '10 0 l', '10 10 l', 'h', 'f']);
  assert.deepEqual(ops('M1e1-5.5L.5.25'), ['10 -5.5 m', '0.5 0.25 l', 'f']);
  assert.deepEqual(ops('M0 0C1 2 3 4 5 6 7 8 9 10 11 12'), ['0 0 m', '1 2 3 4 5 6 c', '7 8 9 10 11 12 c', 'f']);
  assert.deepEqual(ops('M0 0L1 1ZM5 5L6 6Z'), ['0 0 m', '1 1 l', 'h', '5 5 m', '6 6 l', 'h', 'f']);
});

test('path data that cannot be drawn faithfully is refused', () => {
  const define = d => () => createPdf().defineShape('shape', d, [0, 0, 1, 1]);
  assert.throws(define('m 0 0 l 1 1'), /Unsupported path command "m"/);
  assert.throws(define('M 0 0 Q 1 1 2 2'), /Unsupported path command "Q"/);
  assert.throws(define('M 0 0 H 5'), /Unsupported path command "H"/);
  assert.throws(define('L 0 0 L 1 1'), /must start with M/);
  assert.throws(define(''), /must start with M/);
  assert.throws(define('5 5 M 0 0'), /Unexpected "5"/);
  assert.throws(define('M 0 0 L 1 1 # Z'), /Unexpected "#"/);
  assert.throws(define('M 0 0 L 1'), /takes 2 numbers/);
  assert.throws(define('M 0 0 C 1 2 3 4 5'), /takes 6 numbers/);
  assert.throws(define('M 0 0 L'), /takes 2 numbers/);
  assert.throws(define('M 0 0 Z 1 2'), /takes 0 numbers/);
});

test('q and Q, BT and ET are balanced in every stream', () => {
  const doc = sampleDoc();
  const extra = doc.addPage(...A4);
  for (let i = 0; i < 3; i++) {
    extra.shape('wedge', 50, 50, 0.01);
    extra.text('between', 50, 50, { charSpacing: i });
    extra.line(0, 0, 10, 10, 1);
  }
  const streams = streamsOf(parsePdf(doc.toBytes()));
  assert.equal(streams.length, 5);
  for (const { data } of streams) {
    let saved = 0;
    let inText = false;
    for (const token of data.split(/\s+/)) {
      if (token === 'q') saved++;
      if (token === 'Q') saved--;
      assert.ok(saved >= 0, 'Q without q');
      if (token === 'BT') {
        assert.ok(!inText, 'BT inside BT');
        inText = true;
      }
      if (token === 'ET') {
        assert.ok(inText, 'ET without BT');
        inText = false;
      }
      if (['Tf', 'Tc', 'Td', 'Tj'].includes(token)) assert.ok(inText, `${token} outside a text object`);
      if (token === 'Do') assert.equal(saved, 1, 'a shape is drawn inside q ... Q');
      if (['m', 'l', 'S', 'f', 'w'].includes(token)) assert.ok(!inText, `${token} inside a text object`);
    }
    assert.equal(saved, 0);
    assert.equal(inText, false);
  }
});

test('calls that would write a broken file are refused', () => {
  const doc = createPdf();
  doc.defineShape('wedge', WEDGE, [0, 0, 1000, 800]);
  const page = doc.addPage(...A4);
  assert.throws(() => page.shape('missing', 0, 0, 1), /Unknown shape "missing"/);
  assert.throws(() => page.text('x', 0, 0, { font: 'Helvetica' }), /Unknown font "Helvetica"/);
  assert.throws(() => page.text('x', 0, 0, { align: 'middle' }), /Unknown alignment "middle"/);
  assert.throws(() => page.text('x', NaN, 0), RangeError);
  assert.throws(() => page.line(0, 0, 10, 10, 0), RangeError);
  assert.throws(() => page.line(0, 0, 10, 10), RangeError);
  assert.throws(() => page.line(0, 0, 10, NaN, 1), RangeError);
  assert.throws(() => page.polygon([[0, 0], [1, 1]]), /at least three points/);
  assert.throws(() => page.polygon([[0, 0], [1, 1], [2, Infinity]]), RangeError);
  assert.throws(() => page.shape('wedge', 0, 0, undefined), RangeError);
  assert.throws(() => doc.addPage(0, 100), RangeError);
  assert.throws(() => doc.addPage(595), RangeError);
  assert.throws(() => doc.defineShape('wedge', DROP, [0, 0, 1000, 800]), /already defined differently/);
  assert.throws(() => doc.defineShape('box', WEDGE, [0, 0, 1000]), /bounding box/);
  assert.throws(() => createPdf().toBytes(), /at least one page/);
  // None of the refused calls left anything behind.
  assert.equal(pagesOf(parsePdf(doc.toBytes()))[0].content, '');
});
