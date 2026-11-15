// A minimal writer for vector PDF files (PDF 1.4), enough to put a score on
// paper: lines, filled polygons, reusable filled outlines (the notation
// glyphs) and text in the four Times faces every PDF viewer has built in.
//
// Nothing is embedded or compressed, and nothing reads a clock or draws a
// random id, so the same calls always give the same bytes. There is no DOM and
// no Node API here: the module runs unchanged in a browser and in Node.
//
// Coordinates are PDF's own: points (1/72 inch), origin at the bottom-left
// corner of the page, y pointing up.
//
//   const doc = createPdf({ title });
//   doc.defineShape(name, d, bbox);          // a reusable filled outline
//   const page = doc.addPage(width, height);
//   page.line(x1, y1, x2, y2, lineWidth);
//   page.polygon([[x, y], ...]);
//   page.shape(name, x, y, scale);
//   page.text(string, x, y, { font, size, align, charSpacing });
//   const bytes = doc.toBytes();             // a Uint8Array, the whole file
import { FIRST_CODE, WIDTHS } from './times-metrics.js';

export const FONTS = ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'];

const PRODUCER = 'Guitar Reading Assistant';

// The second line is a comment of four bytes above 127, the conventional sign
// to file-transfer tools that a PDF is not plain text. Every other byte of the
// file is ASCII, so a position in the string is also a byte offset.
const HEADER = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';

// A shape is stored at a thousandth of its size and enlarged again where it is
// drawn. Glyph outlines come in font units, so a typical scale is near 0.02,
// and three decimals alone would get it wrong by up to 2.5 percent; multiplied
// by a thousand, the same three decimals are good to one part in 40 000.
const SHAPE_UNIT = 1000;

const ALIGN_SHIFT = { left: 0, center: 0.5, right: 1 };

// PDF 1.4 allows a line that is not stream data no more than 255 characters
// (section 3.4 of the reference). ISO 32000 dropped the rule and viewers do
// not hold a file to it, but this file says it is 1.4. Lines stop one
// character short, so the rule is kept whether or not the line end counts.
const LINE_LIMIT = 254;

// The most of a string that goes on one line, in characters of the file: in
// hex, fifty UTF-16 characters. It leaves room on the line for the string's
// key in front of it.
const STRING_RUN = 200;

// The parts of an object with spaces between them, on one line while they fit
// and on several when they do not. Any white space separates two tokens in
// PDF, so a line end serves as well as a space. A part is never broken, so
// none may be longer than a line.
function wrapped(parts) {
  const lines = [];
  for (const part of parts) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + part.length <= LINE_LIMIT) lines[last] += ` ${part}`;
    else lines.push(part);
  }
  return lines.join('\n');
}

// Delimiters stay with the first and the last of the parts they hold, of
// which there is at least one.
function enclosed(open, parts, close) {
  const inside = [...parts];
  inside[0] = open + inside[0];
  inside[inside.length - 1] += close;
  return inside;
}

// PDF has no exponent notation, and a thousandth of a point is finer than any
// printer. Trailing zeros are dropped and a value that rounds to zero loses
// its sign. Anything that is not a finite number is a bug in the caller, and
// is refused rather than written into a file no viewer could open.
export function formatNumber(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) {
    throw new RangeError(`Cannot write ${String(value)} as a PDF number`);
  }
  const text = value.toFixed(3).replace(/\.?0+$/, '');
  return text === '-0' ? '0' : text;
}

const num = formatNumber;
const hex = (value, digits) => value.toString(16).toUpperCase().padStart(digits, '0');

const QUESTION_MARK = 0x3F;
const NATURAL_SIGN = 0x266E;

// Unicode code points of the Windows-1252 bytes 0x80 to 0x9F, in order. A zero
// marks a byte the code page leaves unused.
const CP1252_SPECIALS = [
  0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
  0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0,
  0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178
];

// Characters that are written as some byte other than their own code point.
const SUBSTITUTES = new Map([
  [0x00A0, 0x20], // no-break space: nothing here breaks lines, so a plain space
  [0x266F, 0x23], // the Times faces have no musical sharp: #
  [0x266D, 0x62]  // ... and no musical flat: b
]);
CP1252_SPECIALS.forEach((codePoint, i) => {
  if (codePoint) SUBSTITUTES.set(codePoint, 0x80 + i);
});

const isLatin1 = codePoint =>
  (codePoint >= 0x20 && codePoint <= 0x7E) || (codePoint >= 0xA1 && codePoint <= 0xFF);

// The WinAnsi (Windows-1252) byte for each character of a string. The natural
// sign is dropped, since a note name without a sign already means natural, and
// a character the encoding cannot express becomes a question mark.
export function toWinAnsi(string) {
  const codes = [];
  // Composed form first, so that "e" and a combining accent make one byte.
  for (const char of String(string).normalize('NFC')) {
    const codePoint = char.codePointAt(0);
    if (codePoint === NATURAL_SIGN) continue;
    if (SUBSTITUTES.has(codePoint)) codes.push(SUBSTITUTES.get(codePoint));
    else codes.push(isLatin1(codePoint) ? codePoint : QUESTION_MARK);
  }
  return codes;
}

function advance(codes, font, size, charSpacing) {
  if (!FONTS.includes(font)) throw new Error(`Unknown font "${font}"`);
  const widths = WIDTHS[font];
  const units = codes.reduce((sum, code) => sum + widths[code - FIRST_CODE], 0);
  return units * size / 1000 + codes.length * charSpacing;
}

// How far a string moves the pen, in points. Character spacing follows every
// character, the last one included: that is what a PDF viewer does with it,
// and what a browser does with letter-spacing.
export function textWidth(string, font, size, charSpacing = 0) {
  return advance(toWinAnsi(string), font, size, charSpacing);
}

// Text shown on a page is written in hexadecimal, so that parentheses,
// backslashes and bytes above 127 need no escaping and the file stays ASCII.
const hexString = codes => `<${codes.map(code => hex(code, 2)).join('')}>`;

// Text outside a page (the title) is not in a font's encoding. It is either
// PDFDocEncoding, which agrees with printable ASCII, or UTF-16BE behind a
// byte-order mark, which can say anything.
//
// It is returned as parts for `wrapped`. A literal string is a single part,
// because white space inside it is text. White space between hex digits means
// nothing, so a hex string comes in runs that may go on separate lines, and a
// literal longer than a run is written in hex as well.
function textString(string) {
  const literal = `(${string.replace(/[\\()]/g, '\\$&')})`;
  if (/^[\x20-\x7E]*$/.test(string) && literal.length <= STRING_RUN) return [literal];
  let digits = 'FEFF';
  for (let i = 0; i < string.length; i++) digits += hex(string.charCodeAt(i), 4);
  const runs = [];
  for (let i = 0; i < digits.length; i += STRING_RUN) runs.push(digits.slice(i, i + STRING_RUN));
  return enclosed('<', runs, '>');
}

// A dictionary entry whose value is text. The key stays on the line where its
// value begins.
const textEntry = (key, string) => enclosed(`/${key} `, textString(string), '');

const PATH_TOKEN = /([A-Za-z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|[^\s,]/g;
const PATH_COMMANDS = {
  M: { arity: 2, operator: 'm' },
  L: { arity: 2, operator: 'l' },
  C: { arity: 6, operator: 'c' },
  Z: { arity: 0, operator: 'h' }
};

// Path data split into its commands: [{ command, numbers }].
function pathSegments(d) {
  const segments = [];
  for (const [token, letter, number] of String(d).matchAll(PATH_TOKEN)) {
    if (letter) segments.push({ command: letter === 'z' ? 'Z' : letter, numbers: [] });
    else if (number && segments.length) segments[segments.length - 1].numbers.push(Number(number));
    else throw new Error(`Unexpected "${token}" in path data`);
  }
  return segments;
}

function segmentOperators({ command, numbers }) {
  const rule = PATH_COMMANDS[command];
  // Relative (lower-case) commands, arcs and the rest are not needed for glyph
  // outlines, and guessing at them would draw the wrong shape.
  if (!rule) throw new Error(`Unsupported path command "${command}"`);
  const { arity, operator } = rule;
  const count = numbers.length;
  if (arity === 0 ? count > 0 : count === 0 || count % arity > 0) {
    throw new Error(`Path command ${command} takes ${arity} numbers at a time, not ${count}`);
  }
  if (arity === 0) return [operator];
  return Array.from({ length: count / arity }, (_, i) => {
    const args = numbers.slice(i * arity, (i + 1) * arity).map(num).join(' ');
    // As in SVG, coordinate pairs after the first pair of an M are line-tos.
    return `${args} ${command === 'M' && i > 0 ? 'l' : operator}`;
  });
}

// A form's box does nothing but clip it. A glyph touches its own bounding box,
// and a stem often runs along an edge of it; a viewer that antialiases the
// clip then thins exactly those edges on screen. So the box is written with
// half its longer side to spare all round: several pixels at any useful zoom.
function looseBox([x1, y1, x2, y2]) {
  const margin = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
  return [
    Math.min(x1, x2) - margin, Math.min(y1, y2) - margin,
    Math.max(x1, x2) + margin, Math.max(y1, y2) + margin
  ];
}

// PDF path operators for path data, one to a line.
function pathOperators(d) {
  const segments = pathSegments(d);
  const operators = segments.flatMap(segmentOperators);
  if (!segments.length || segments[0].command !== 'M') throw new Error('A path must start with M');
  return operators;
}

// A stream's /Length is exact, and does not count the line end before
// "endstream". The data is ASCII, so characters are bytes. The data is not
// held to the line limit, and the dictionary cannot reach it: its longest
// entry is a form's box, four numbers of twenty-two characters at most.
function streamObject(entries, lines) {
  const data = lines.join('\n');
  return `<< ${entries}/Length ${data.length} >>\nstream\n${data}\nendstream`;
}

// The built-in faces are only named: there is no font program to embed.
const fontObject = font =>
  `<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`;

const fontResource = font => `F${FONTS.indexOf(font) + 1}`;

// A shape is a Form XObject, filled with the non-zero winding rule. Its matrix
// undoes the enlargement that every drawing of it applies (see SHAPE_UNIT).
function formObject({ box, operators }) {
  const shrink = num(1 / SHAPE_UNIT);
  const entries = `/Type /XObject /Subtype /Form /BBox [${box}] ` +
    `/Matrix [${shrink} 0 0 ${shrink} 0 0] /Resources << >> `;
  return streamObject(entries, [...operators, 'f']);
}

function infoObject(title) {
  const entries = title ? textEntry('Title', title) : [];
  return wrapped(['<<', ...entries, ...textEntry('Producer', PRODUCER), '>>']);
}

// The page tree: every page in order, a reference to each being one part.
function pagesObject(pageRefs) {
  const kids = pageRefs.map(ref => `${ref} 0 R`);
  return wrapped(['<< /Type /Pages', ...enclosed('/Kids [', kids, ']'), `/Count ${kids.length}`, '>>']);
}

// One kind of resource (fonts or shapes) as the parts of a dictionary entry:
// the names a page uses and the objects they stand for. Nothing at all when
// none is used.
function resourceEntry(key, items) {
  if (!items.length) return [];
  return [`/${key} <<`, ...items.map(({ name, ref }) => `/${name} ${ref} 0 R`), '>>'];
}

function pageObject({ box }, { parent, contents, fonts, shapes }) {
  return wrapped([
    '<< /Type /Page', `/Parent ${parent} 0 R`, `/MediaBox [${box}]`,
    '/Resources <<', ...resourceEntry('Font', fonts), ...resourceEntry('XObject', shapes), '>>',
    `/Contents ${contents} 0 R`, '>>'
  ]);
}

// The file: header, the numbered objects, then a cross-reference table giving
// the byte offset of each object, in entries of exactly twenty bytes.
function assemble(objects, { root, info }) {
  let file = HEADER;
  const offsets = objects.map((body, i) => {
    const offset = file.length;
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = file.length;
  const size = objects.length + 1; // entry 0 heads the list of free objects
  file += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const offset of offsets) file += `${String(offset).padStart(10, '0')} 00000 n \n`;
  file += `trailer\n<< /Size ${size} /Root ${root} 0 R /Info ${info} 0 R >>\n`;
  file += `startxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i);
  return bytes;
}

// The drawing methods of one page. Each call appends to the page's content
// stream, in the order of the calls.
function pageMethods(page, shapes) {
  const emit = line => page.lines.push(line);

  return {
    // A stroked line. Black ink and butt caps are PDF's defaults and nothing
    // here changes them. A width stays in force until the next one, so a run
    // of equal lines (a staff) states it once.
    line(x1, y1, x2, y2, lineWidth) {
      // A width of zero is not "no line" in PDF but the thinnest line the
      // device can make, which all but vanishes on a good printer.
      if (!(lineWidth > 0)) throw new RangeError(`A line needs a width above zero, not ${lineWidth}`);
      const width = num(lineWidth);
      const path = `${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`;
      if (width !== page.lineWidth) emit(`${width} w`);
      page.lineWidth = width;
      emit(path);
    },

    // A closed polygon through [[x, y], ...], filled black.
    polygon(points) {
      if (points.length < 3) throw new Error('A polygon needs at least three points');
      const path = points.map(([x, y], i) => `${num(x)} ${num(y)} ${i ? 'l' : 'm'}`).join(' ');
      emit(`${path} h f`);
    },

    // A defined shape with its origin at (x, y), uniformly scaled.
    shape(name, x, y, scale) {
      const shape = shapes.get(name);
      if (!shape) throw new Error(`Unknown shape "${name}"`);
      const s = num(scale * SHAPE_UNIT);
      emit(`q ${s} 0 0 ${s} ${num(x)} ${num(y)} cm /${shape.resource} Do Q`);
      page.shapes.add(name);
    },

    // One line of text with its baseline at y, starting at x, centred on it
    // or ending at it. charSpacing is extra points after each character.
    text(string, x, y, { font = 'Times-Roman', size = 12, align = 'left', charSpacing = 0 } = {}) {
      if (!Object.hasOwn(ALIGN_SHIFT, align)) throw new Error(`Unknown alignment "${align}"`);
      const codes = toWinAnsi(string);
      const left = x - ALIGN_SHIFT[align] * advance(codes, font, size, charSpacing);
      if (!codes.length) return;
      // Character spacing outlives the text object that sets it, so it is
      // written whenever it changes - back to zero too.
      const spacing = num(charSpacing);
      const setSpacing = spacing === page.charSpacing ? '' : `${spacing} Tc `;
      emit(`BT /${fontResource(font)} ${num(size)} Tf ${setSpacing}` +
        `${num(left)} ${num(y)} Td ${hexString(codes)} Tj ET`);
      page.charSpacing = spacing;
      page.fonts.add(font);
    }
  };
}

export function createPdf({ title = '' } = {}) {
  const shapes = new Map(); // name -> { d, box, operators, resource }
  const pages = [];

  // Registers a reusable outline: path data with absolute M, L, C and Z in
  // the shape's own units, y up, and its bounding box [x1, y1, x2, y2].
  function defineShape(name, d, bbox) {
    if (bbox.length !== 4) throw new Error('A bounding box is [x1, y1, x2, y2]');
    const box = looseBox(bbox).map(num).join(' ');
    const known = shapes.get(name);
    if (!known) {
      shapes.set(name, { d, box, operators: pathOperators(d), resource: `S${shapes.size + 1}` });
      return;
    }
    // Defining a shape again is harmless. A different outline under a name
    // that is taken would change what the pages already drawn meant.
    if (known.d !== d || known.box !== box) {
      throw new Error(`Shape "${name}" is already defined differently`);
    }
  }

  function addPage(width, height) {
    if (!(width > 0 && height > 0)) throw new RangeError(`A page cannot measure ${width} by ${height}`);
    const page = {
      box: `0 0 ${num(width)} ${num(height)}`,
      lines: [],
      fonts: new Set(),
      shapes: new Set(),
      // What the viewer's graphics state holds as it reads the lines so far:
      // no line width has been chosen yet, and character spacing starts at 0.
      lineWidth: null,
      charSpacing: '0'
    };
    pages.push(page);
    return pageMethods(page, shapes);
  }

  // The complete file. Objects are numbered: catalog 1, page tree 2, info 3,
  // then the fonts and the shapes that some page uses, then a page object and
  // its content stream for each page.
  function toBytes() {
    if (!pages.length) throw new Error('A PDF needs at least one page');
    const usedOn = (key, item) => pages.some(page => page[key].has(item));
    const fonts = FONTS.filter(font => usedOn('fonts', font));
    const shapeNames = [...shapes.keys()].filter(name => usedOn('shapes', name));

    const firstFont = 4;
    const firstShape = firstFont + fonts.length;
    const firstPage = firstShape + shapeNames.length;
    const pageRef = i => firstPage + 2 * i;
    const fontRefs = fonts.map((font, i) =>
      ({ item: font, name: fontResource(font), ref: firstFont + i }));
    const shapeRefs = shapeNames.map((shape, i) =>
      ({ item: shape, name: shapes.get(shape).resource, ref: firstShape + i }));

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      pagesObject(pages.map((_, i) => pageRef(i))),
      infoObject(String(title ?? '')),
      ...fonts.map(fontObject),
      ...shapeNames.map(name => formObject(shapes.get(name))),
      ...pages.flatMap((page, i) => [
        pageObject(page, {
          parent: 2,
          contents: pageRef(i) + 1,
          fonts: fontRefs.filter(({ item }) => page.fonts.has(item)),
          shapes: shapeRefs.filter(({ item }) => page.shapes.has(item))
        }),
        streamObject('', page.lines)
      ])
    ];
    return assemble(objects, { root: 1, info: 3 });
  }

  return { defineShape, addPage, toBytes };
}
