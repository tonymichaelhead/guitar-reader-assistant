// Development tool, not part of the app. It reads the outlines of the Bravura
// glyphs that the PDF exporter draws and writes them, as path data, to
// src/export/glyph-outlines.js, so the exporter needs no font at run time.
//
//   node scripts/extract-glyph-outlines.mjs <Bravura.otf> <Bravura.json>
//
// Both files are in https://github.com/steinbergmedia/bravura, as
// redist/otf/Bravura.otf and redist/Bravura.json. Nothing is written unless
// every outline agrees with the bounding box and the advance width that the
// metadata gives for it.
//
// The project takes no dependencies (docs/decisions/0001), so this is its own
// small reader of the formats involved: the OpenType tables head, cmap, hhea
// and hmtx, the CFF table (Adobe Technical Note 5176) and Type 2 charstrings
// (Technical Note 5177). Whatever it does not understand stops the run: a
// guess here would be a wrong shape on paper.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPH } from '../src/render/glyphs.js';

const SCRIPT = fileURLToPath(import.meta.url);
const OUTPUT = fileURLToPath(new URL('../src/export/glyph-outlines.js', import.meta.url));

// The glyphs to extract: their key in GLYPH, which holds the code point, and
// their SMuFL name, which is how Bravura's metadata refers to them.
const WANTED = {
  gClef: 'gClef',
  noteheadBlack: 'noteheadBlack',
  timeSig4: 'timeSig4',
  flat: 'accidentalFlat',
  natural: 'accidentalNatural',
  sharp: 'accidentalSharp'
};
const TOLERANCE = 1;   // font units allowed between an outline and the metadata

const fail = message => { throw new Error(message); };
const hex = codePoint => codePoint.toString(16).toUpperCase().padStart(4, '0');

// ---- OpenType container ----------------------------------------------------

// The table directory: tag -> DataView of that table. A DataView refuses to
// read past its end, so a truncated table throws instead of yielding garbage.
export function readTables(bytes) {
  const file = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (file.getUint32(0) !== 0x4F54544F) {
    fail('not an OpenType font with CFF outlines: the file does not start with OTTO');
  }
  const tables = new Map();
  for (let i = 0; i < file.getUint16(4); i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(record, record + 4));
    const offset = file.getUint32(record + 8);
    tables.set(tag, new DataView(bytes.buffer, bytes.byteOffset + offset, file.getUint32(record + 12)));
  }
  return tables;
}

function readHead(head) {
  if (head.getUint32(12) !== 0x5F0F3CF5) fail('head: wrong magic number');
  // fontRevision is a 16.16 fixed-point number; Bravura's versions have three decimals.
  return { version: (head.getInt32(4) / 65536).toFixed(3), unitsPerEm: head.getUint16(18) };
}

// ---- cmap: code point -> glyph id ------------------------------------------

// Format 4: segments of consecutive BMP code points. A segment either shifts
// its code points by idDelta or looks them up in glyphIdArray, which
// idRangeOffset addresses as a byte count from its own position. It has
// nothing to say (undefined) about a code point beyond the BMP.
function lookupSegments(cmap, at, codePoint) {
  if (codePoint > 0xFFFF) return undefined;
  const segCount = cmap.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const rangeOffsets = deltas + segCount * 2;
  for (let i = 0; i < segCount; i++) {
    if (cmap.getUint16(ends + i * 2) < codePoint) continue;
    const start = cmap.getUint16(starts + i * 2);
    if (start > codePoint) return 0;
    const delta = cmap.getUint16(deltas + i * 2);
    const rangeOffset = cmap.getUint16(rangeOffsets + i * 2);
    if (rangeOffset === 0) return (codePoint + delta) & 0xFFFF;
    const glyph = cmap.getUint16(rangeOffsets + i * 2 + rangeOffset + (codePoint - start) * 2);
    return glyph === 0 ? 0 : (glyph + delta) & 0xFFFF;
  }
  return 0;
}

// Format 12: groups of consecutive code points with consecutive glyph ids.
function lookupGroups(cmap, at, codePoint) {
  for (let i = 0; i < cmap.getUint32(at + 12); i++) {
    const group = at + 16 + i * 12;
    const start = cmap.getUint32(group);
    if (codePoint >= start && codePoint <= cmap.getUint32(group + 4)) {
      return cmap.getUint32(group + 8) + codePoint - start;
    }
  }
  return 0;
}

const CMAP_LOOKUPS = { 4: lookupSegments, 12: lookupGroups };
const isUnicode = (platform, encoding) =>
  platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));

// Returns codePoint => glyph id, 0 when the font lacks the character. Every
// Unicode subtable is asked, and they must agree: that checks both lookups
// against each other on every run.
function readCmap(cmap) {
  const lookups = [];
  for (let i = 0; i < cmap.getUint16(2); i++) {
    const record = 4 + i * 8;
    const offset = cmap.getUint32(record + 4);
    const lookup = CMAP_LOOKUPS[cmap.getUint16(offset)];
    if (lookup && isUnicode(cmap.getUint16(record), cmap.getUint16(record + 2))) {
      lookups.push(codePoint => lookup(cmap, offset, codePoint));
    }
  }
  if (lookups.length === 0) fail('cmap: no Unicode subtable in format 4 or 12');
  return codePoint => {
    const ids = new Set(lookups.map(lookup => lookup(codePoint)).filter(id => id !== undefined));
    if (ids.size > 1) fail(`cmap: the Unicode subtables disagree about U+${hex(codePoint)}`);
    return [...ids][0] ?? 0;
  };
}

// ---- hhea + hmtx: advance widths -------------------------------------------

// Returns glyph id => advance width. An hmtx record is an advance and a side
// bearing; glyphs past the last record share its advance.
function readAdvances(hhea, hmtx) {
  const recordCount = hhea.getUint16(34);   // numberOfHMetrics
  return glyphId => hmtx.getUint16(Math.min(glyphId, recordCount - 1) * 4);
}

// ---- CFF -------------------------------------------------------------------

// An INDEX is a list of byte strings: a count, the size of an offset,
// count + 1 offsets, then the data. The offsets count from the byte before the
// data. Returns the items and the position just past the INDEX.
function readIndex(cff, at) {
  if (at + 2 > cff.length) fail('CFF: an INDEX starts past the end of the table');
  const count = cff[at] << 8 | cff[at + 1];
  if (count === 0) return { items: [], end: at + 2 };
  const offSize = cff[at + 2];
  if (offSize < 1 || offSize > 4) fail(`CFF: an INDEX with offsets of ${offSize} bytes`);
  const base = at + 2 + (count + 1) * offSize;
  const offset = i => {
    let value = 0;
    for (let k = 0; k < offSize; k++) value = value * 256 + cff[at + 3 + i * offSize + k];
    return base + value;
  };
  const items = [];
  for (let i = 0; i < count; i++) {
    if (offset(i + 1) < offset(i) || offset(i + 1) > cff.length) {
      fail('CFF: an INDEX with offsets out of order or past the end of the table');
    }
    items.push(cff.subarray(offset(i), offset(i + 1)));
  }
  return { items, end: offset(count) };
}

// A real number in a DICT: decimal digits and signs, one per half byte.
const NIBBLES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'E', 'E-', null, '-'];

function readReal(next) {
  let text = '';
  for (;;) {
    const byte = next();
    for (const nibble of [byte >> 4, byte & 15]) {
      if (nibble === 15) return Number(text);
      if (nibble === 13) fail('CFF: reserved half byte in a real number');
      text += NIBBLES[nibble];
    }
  }
}

// A DICT is a run of "operands operator" entries. Returns operator -> operands,
// with the two-byte operators (12 n) keyed 1200 + n.
function readDict(data) {
  const dict = new Map();
  let operands = [];
  let i = 0;
  const next = () => (i < data.length ? data[i++] : fail('CFF: a DICT ends in the middle of an entry'));
  while (i < data.length) {
    const b0 = next();
    if (b0 <= 21) {
      dict.set(b0 === 12 ? 1200 + next() : b0, operands);
      operands = [];
    } else if (b0 === 28) operands.push((next() << 8 | next()) << 16 >> 16);
    else if (b0 === 29) operands.push(next() << 24 | next() << 16 | next() << 8 | next());
    else if (b0 === 30) operands.push(readReal(next));
    else if (b0 >= 32 && b0 <= 246) operands.push(b0 - 139);
    else if (b0 >= 247 && b0 <= 250) operands.push((b0 - 247) * 256 + next() + 108);
    else if (b0 >= 251 && b0 <= 254) operands.push(-(b0 - 251) * 256 - next() - 108);
    else fail(`CFF: reserved byte ${b0} in a DICT`);
  }
  if (operands.length > 0) fail('CFF: a DICT ends with operands and no operator');
  return dict;
}

// The Top DICT and Private DICT operators this reader looks at.
const DICT = {
  charStrings: 17,
  private: 18,
  subrs: 19,
  defaultWidthX: 20,
  nominalWidthX: 21,
  charstringType: 1206,
  fontMatrix: 1207,
  ros: 1230,
  fdArray: 1236,
  fdSelect: 1237
};

// Charstring coordinates are in em units only if the font matrix is the plain
// scale 1 / unitsPerEm, which is also its default.
function unitsPerEmOf(top) {
  const [a, b, c, d, tx, ty] = top.get(DICT.fontMatrix) ?? [0.001, 0, 0, 0.001, 0, 0];
  const plainScale = a === d && b === 0 && c === 0 && tx === 0 && ty === 0;
  if (!plainScale) fail('CFF: the FontMatrix is not a plain scale');
  return Math.round(1 / a);
}

export function readCff(cff) {
  if (cff[0] !== 1) fail(`CFF: major version ${cff[0]}, this reader knows version 1`);
  const names = readIndex(cff, cff[2]);            // cff[2] is the size of the header
  const topDicts = readIndex(cff, names.end);
  const strings = readIndex(cff, topDicts.end);    // read only to find what follows it
  const globalSubrs = readIndex(cff, strings.end);
  if (names.items.length !== 1 || topDicts.items.length !== 1) {
    fail('CFF: expected exactly one font in the table');
  }

  const top = readDict(topDicts.items[0]);
  if ([DICT.ros, DICT.fdArray, DICT.fdSelect].some(operator => top.has(operator))) {
    fail('CFF: the font is CID-keyed (ROS, FDArray or FDSelect); this reader handles name-keyed fonts only');
  }
  if ((top.get(DICT.charstringType)?.[0] ?? 2) !== 2) fail('CFF: the charstrings are not Type 2');
  if (!top.has(DICT.charStrings) || !top.has(DICT.private)) {
    fail('CFF: the Top DICT lacks CharStrings or Private');
  }

  const [privateSize, privateAt] = top.get(DICT.private);
  const priv = readDict(cff.subarray(privateAt, privateAt + privateSize));
  // The Subrs offset counts from the start of the Private DICT, not of the table.
  const localSubrs = priv.has(DICT.subrs) ? readIndex(cff, privateAt + priv.get(DICT.subrs)[0]).items : [];
  return {
    name: String.fromCharCode(...names.items[0]),
    unitsPerEm: unitsPerEmOf(top),
    charStrings: readIndex(cff, top.get(DICT.charStrings)[0]).items,
    globalSubrs: globalSubrs.items,
    localSubrs,
    defaultWidthX: priv.get(DICT.defaultWidthX)?.[0] ?? 0,
    nominalWidthX: priv.get(DICT.nominalWidthX)?.[0] ?? 0
  };
}

// ---- Type 2 charstrings ----------------------------------------------------

// Collects an outline as absolute commands: ['M', x, y], ['L', x, y],
// ['C', x1, y1, x2, y2, x, y] and ['Z']. A charstring only ever says how far
// to go from the current point, so the pen keeps that point.
function createPen() {
  const commands = [];
  let x = 0;
  let y = 0;
  let open = false;
  const drawing = () => open || fail('charstring: drawing before the first moveto');
  const pen = {
    commands,
    // Charstring subpaths are always closed, with a straight line if need be.
    // One that drew nothing leaves no mark, so its moveto is dropped.
    close() {
      if (open && commands.at(-1)[0] === 'M') commands.pop();
      else if (open) commands.push(['Z']);
      open = false;
    },
    move(dx, dy) {
      pen.close();
      x += dx;
      y += dy;
      commands.push(['M', x, y]);
      open = true;
    },
    line(dx, dy) {
      drawing();
      x += dx;
      y += dy;
      commands.push(['L', x, y]);
    },
    // Each control point is given relative to the point before it.
    curve(dx1, dy1, dx2, dy2, dx3, dy3) {
      drawing();
      const x1 = x + dx1;
      const y1 = y + dy1;
      const x2 = x1 + dx2;
      const y2 = y1 + dy2;
      x = x2 + dx3;
      y = y2 + dy3;
      commands.push(['C', x1, y1, x2, y2, x, y]);
    }
  };
  return pen;
}

// hlineto and vlineto: lines along one axis and then the other, turn about.
function alternatingLines(a, pen, horizontal) {
  for (const d of a) {
    if (horizontal) pen.line(d, 0);
    else pen.line(0, d);
    horizontal = !horizontal;
  }
}

// hvcurveto and vhcurveto: curves that leave along one axis and arrive along
// the other, turn about. A fifth argument on the last curve is the step its
// end point would otherwise lack, so that curve may arrive at any angle.
function alternatingCurves(a, pen, horizontal) {
  for (let k = 0; k + 4 <= a.length; k += 4) {
    const extra = a.length - k === 5 ? a[k + 4] : 0;
    if (horizontal) pen.curve(a[k], 0, a[k + 1], a[k + 2], extra, a[k + 3]);
    else pen.curve(0, a[k], a[k + 1], a[k + 2], a[k + 3], extra);
    horizontal = !horizontal;
  }
}

// The curve operators that leave one coordinate out take four arguments for
// each curve, and may take a fifth on the first or the last one.
const fourPerCurve = n => n >= 4 && n % 4 <= 1;

// Every path operator except the movetos (Technical Note 5177, section 4.1):
// its name, the argument counts it accepts and what it draws from its
// arguments `a`. Two-byte operators (12 n) are keyed 1200 + n.
const PATH_OPERATORS = {
  5: {
    name: 'rlineto',
    accepts: n => n >= 2 && n % 2 === 0,
    draw(a, pen) {
      for (let k = 0; k < a.length; k += 2) pen.line(a[k], a[k + 1]);
    }
  },
  6: { name: 'hlineto', accepts: n => n >= 1, draw: (a, pen) => alternatingLines(a, pen, true) },
  7: { name: 'vlineto', accepts: n => n >= 1, draw: (a, pen) => alternatingLines(a, pen, false) },
  8: {
    name: 'rrcurveto',
    accepts: n => n >= 6 && n % 6 === 0,
    draw(a, pen) {
      for (let k = 0; k < a.length; k += 6) pen.curve(...a.slice(k, k + 6));
    }
  },
  24: {
    name: 'rcurveline',
    accepts: n => n >= 8 && (n - 2) % 6 === 0,
    draw(a, pen) {
      for (let k = 0; k < a.length - 2; k += 6) pen.curve(...a.slice(k, k + 6));
      pen.line(...a.slice(-2));
    }
  },
  25: {
    name: 'rlinecurve',
    accepts: n => n >= 8 && n % 2 === 0,
    draw(a, pen) {
      for (let k = 0; k < a.length - 6; k += 2) pen.line(a[k], a[k + 1]);
      pen.curve(...a.slice(-6));
    }
  },
  26: {
    name: 'vvcurveto',
    accepts: fourPerCurve,
    // Each curve leaves and arrives vertically; an odd first argument is the
    // sideways step into the first one.
    draw(a, pen) {
      let dx1 = a.length % 4 === 1 ? a[0] : 0;
      for (let k = a.length % 4; k < a.length; k += 4) {
        pen.curve(dx1, a[k], a[k + 1], a[k + 2], 0, a[k + 3]);
        dx1 = 0;
      }
    }
  },
  27: {
    name: 'hhcurveto',
    accepts: fourPerCurve,
    draw(a, pen) {
      let dy1 = a.length % 4 === 1 ? a[0] : 0;
      for (let k = a.length % 4; k < a.length; k += 4) {
        pen.curve(a[k], dy1, a[k + 1], a[k + 2], a[k + 3], 0);
        dy1 = 0;
      }
    }
  },
  30: { name: 'vhcurveto', accepts: fourPerCurve, draw: (a, pen) => alternatingCurves(a, pen, false) },
  31: { name: 'hvcurveto', accepts: fourPerCurve, draw: (a, pen) => alternatingCurves(a, pen, true) },
  // The flex operators draw two curves that meet at a shallow bump. A
  // rasteriser may flatten them at small sizes; an outline keeps both.
  1234: {
    name: 'hflex',
    accepts: n => n === 7,
    draw([dx1, dx2, dy2, dx3, dx4, dx5, dx6], pen) {
      pen.curve(dx1, 0, dx2, dy2, dx3, 0);
      pen.curve(dx4, 0, dx5, -dy2, dx6, 0);
    }
  },
  1235: {
    name: 'flex',
    accepts: n => n === 13,
    // The thirteenth argument is the flex depth, which only a rasteriser uses.
    draw(a, pen) {
      pen.curve(...a.slice(0, 6));
      pen.curve(...a.slice(6, 12));
    }
  },
  1236: {
    name: 'hflex1',
    accepts: n => n === 9,
    draw([dx1, dy1, dx2, dy2, dx3, dx4, dx5, dy5, dx6], pen) {
      pen.curve(dx1, dy1, dx2, dy2, dx3, 0);
      pen.curve(dx4, 0, dx5, dy5, dx6, -(dy1 + dy2 + dy5));
    }
  },
  1237: {
    name: 'flex1',
    accepts: n => n === 11,
    // The last point returns to the starting x or y, whichever axis the two
    // curves travel less along; the eleventh argument is its other step.
    draw([dx1, dy1, dx2, dy2, dx3, dy3, dx4, dy4, dx5, dy5, d6], pen) {
      const dx = dx1 + dx2 + dx3 + dx4 + dx5;
      const dy = dy1 + dy2 + dy3 + dy4 + dy5;
      pen.curve(dx1, dy1, dx2, dy2, dx3, dy3);
      if (Math.abs(dx) > Math.abs(dy)) pen.curve(dx4, dy4, dx5, dy5, d6, -dy);
      else pen.curve(dx4, dy4, dx5, dy5, -dx, d6);
    }
  }
};

// The movetos: how many arguments each takes and the step they make.
const MOVES = {
  4: { name: 'vmoveto', count: 1, step: ([dy]) => [0, dy] },
  21: { name: 'rmoveto', count: 2, step: ([dx, dy]) => [dx, dy] },
  22: { name: 'hmoveto', count: 1, step: ([dx]) => [dx, 0] }
};
const STEMS = { 1: 'hstem', 3: 'vstem', 18: 'hstemhm', 23: 'vstemhm' };
const MASKS = { 19: 'hintmask', 20: 'cntrmask' };
const CALLSUBR = 10;
const RETURN = 11;
const ENDCHAR = 14;
const CALLGSUBR = 29;
const MAX_SUBR_DEPTH = 10;

// A number in a charstring: 28 opens a 16-bit integer, 255 a 16.16 fixed-point
// number, and any other byte from 32 up is, or opens, a compact integer.
function readNumber(b0, next) {
  if (b0 === 28) return (next() << 8 | next()) << 16 >> 16;
  if (b0 < 247) return b0 - 139;
  if (b0 < 251) return (b0 - 247) * 256 + next() + 108;
  if (b0 < 255) return -(b0 - 251) * 256 - next() - 108;
  return (next() << 24 | next() << 16 | next() << 8 | next()) / 65536;
}

// Subroutine numbers are stored less a bias that depends on how many
// subroutines there are, so that the most used ones fit in one byte.
const subrBias = count => (count < 1240 ? 107 : count < 33900 ? 1131 : 32768);

// Runs one glyph's charstring. Returns its outline and its width argument,
// which is null when the charstring gives none (the default width applies).
export function runCharstring(charstring, { globalSubrs, localSubrs }) {
  const pen = createPen();
  const stack = [];
  let stems = 0;
  let width = null;
  let widthSettled = false;
  let ended = false;

  // Only the first operator that clears the stack can carry the width: one
  // argument more than the operator needs, placed before the others.
  const takeWidth = hasExtra => {
    if (!widthSettled && hasExtra) width = stack.shift();
    widthSettled = true;
  };
  const wrongCount = name => fail(`charstring: ${name} with ${stack.length} arguments`);
  // Stem hints draw nothing but have to be counted, because a hint mask has
  // one bit for each stem declared so far.
  const countStems = name => {
    takeWidth(stack.length % 2 === 1);
    if (stack.length % 2 === 1) wrongCount(name);
    stems += stack.length / 2;
  };

  const run = (code, depth) => {
    if (depth > MAX_SUBR_DEPTH) fail(`charstring: subroutines nested more than ${MAX_SUBR_DEPTH} deep`);
    let i = 0;
    const next = () => (i < code.length ? code[i++] : fail('charstring: ends inside a number or an operator'));
    while (i < code.length && !ended) {
      const b0 = next();
      if (b0 === 28 || b0 >= 32) {
        stack.push(readNumber(b0, next));
        continue;
      }
      const op = b0 === 12 ? 1200 + next() : b0;
      if (op === CALLSUBR || op === CALLGSUBR) {
        const subrs = op === CALLSUBR ? localSubrs : globalSubrs;
        const subr = subrs[stack.pop() + subrBias(subrs.length)];
        if (!subr) fail('charstring: call to a subroutine that does not exist');
        run(subr, depth + 1);
        continue;   // the stack carries arguments into and out of a subroutine
      }
      if (op === RETURN) return;

      if (STEMS[op]) countStems(STEMS[op]);
      else if (MASKS[op]) {
        // Arguments in front of a mask are one more vstemhm, its operator left out.
        countStems(MASKS[op]);
        i += Math.ceil(stems / 8);
        if (i > code.length) fail(`charstring: ${MASKS[op]} runs past the end`);
      } else if (MOVES[op]) {
        const move = MOVES[op];
        takeWidth(stack.length > move.count);
        if (stack.length !== move.count) wrongCount(move.name);
        pen.move(...move.step(stack));
      } else if (op === ENDCHAR) {
        // Four arguments would compose an accented letter from two other
        // glyphs (the deprecated seac), which a music font has no use for.
        takeWidth(stack.length === 1 || stack.length === 5);
        if (stack.length !== 0) wrongCount('endchar');
        pen.close();
        ended = true;
      } else if (PATH_OPERATORS[op]) {
        const operator = PATH_OPERATORS[op];
        if (!operator.accepts(stack.length)) wrongCount(operator.name);
        operator.draw(stack, pen);
      } else fail(`charstring: operator ${op >= 1200 ? `12 ${op - 1200}` : op} is not supported`);
      stack.length = 0;
    }
  };

  run(charstring, 0);
  if (!ended) fail('charstring: no endchar');
  return { commands: pen.commands, width };
}

// ---- The font as this tool sees it -----------------------------------------

// Takes the bytes of an .otf file. glyphId maps a code point to a glyph,
// advance and outline take that glyph id; an outline is a list of pen commands
// in font units, y axis up.
export function readFont(bytes) {
  const tables = readTables(bytes);
  const table = tag => tables.get(tag) ?? fail(`the font has no ${tag.trim()} table`);
  const head = readHead(table('head'));
  const cffTable = table('CFF ');
  const cff = readCff(new Uint8Array(cffTable.buffer, cffTable.byteOffset, cffTable.byteLength));
  if (cff.unitsPerEm !== head.unitsPerEm) {
    fail(`head says ${head.unitsPerEm} units per em, the CFF FontMatrix ${cff.unitsPerEm}`);
  }
  const advance = readAdvances(table('hhea'), table('hmtx'));
  return {
    name: cff.name,
    version: head.version,
    unitsPerEm: head.unitsPerEm,
    glyphId: readCmap(table('cmap')),
    advance,
    outline(glyphId) {
      const charstring = cff.charStrings[glyphId] ?? fail(`glyph ${glyphId}: no charstring`);
      const { commands, width } = runCharstring(charstring, cff);
      // The charstring states the advance a second time. Agreeing with hmtx
      // shows that the arguments in front of the outline were read correctly.
      const stated = width === null ? cff.defaultWidthX : cff.nominalWidthX + width;
      if (stated !== advance(glyphId)) {
        fail(`glyph ${glyphId}: its charstring says width ${stated}, hmtx says ${advance(glyphId)}`);
      }
      return commands;
    }
  };
}

// ---- Outline -> path data and measurements ---------------------------------

// The output is in whole font units. Bravura is drawn on that grid already;
// were a later version not, the half unit lost would still be far less than a
// printer's dot at the size music is engraved.
export const roundOutline = commands =>
  commands.map(([letter, ...numbers]) => [letter, ...numbers.map(Math.round)]);

export const pathData = commands =>
  commands.map(([letter, ...numbers]) => letter + numbers.join(' ')).join(' ');

// Where one coordinate of a cubic Bezier turns round inside the curve: the
// values at the roots of its derivative, B'(t) / 3 = a t^2 + b t + c.
function cubicExtrema(p0, p1, p2, p3) {
  const a = p3 - 3 * p2 + 3 * p1 - p0;
  const b = 2 * (p2 - 2 * p1 + p0);
  const c = p1 - p0;
  const roots = [];
  if (a === 0) {
    if (b !== 0) roots.push(-c / b);
  } else if (b * b >= 4 * a * c) {
    const root = Math.sqrt(b * b - 4 * a * c);
    roots.push((-b + root) / (2 * a), (-b - root) / (2 * a));
  }
  return roots.filter(t => t > 0 && t < 1).map(t => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  });
}

// The true bounding box [x1, y1, x2, y2] of an outline. A curve can bulge
// past its end points and stays inside its control points, so neither set
// gives the box: the points where the curve turns round do.
export function boundingBox(commands) {
  const xs = [];
  const ys = [];
  let x = 0;
  let y = 0;
  for (const [letter, ...n] of commands) {
    if (letter === 'Z') continue;
    if (letter === 'C') {
      xs.push(...cubicExtrema(x, n[0], n[2], n[4]));
      ys.push(...cubicExtrema(y, n[1], n[3], n[5]));
    }
    [x, y] = n.slice(-2);
    xs.push(x);
    ys.push(y);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// ---- Extraction, the check against the metadata, and the output ------------

function extractGlyph(font, metadata, key) {
  const smuflName = WANTED[key];
  const codePoint = (GLYPH[key] ?? fail(`src/render/glyphs.js has no glyph called ${key}`)).codePointAt(0);
  const glyphId = font.glyphId(codePoint);
  if (glyphId === 0) fail(`the font has no glyph for ${key} (U+${hex(codePoint)})`);
  const box = metadata.glyphBBoxes?.[smuflName];
  const advance = metadata.glyphAdvanceWidths?.[smuflName];
  if (!box || advance === undefined) fail(`the metadata does not describe ${smuflName}`);
  // SMuFL: the em is four staff spaces, and the metadata counts in staff spaces.
  const space = font.unitsPerEm / 4;
  const commands = roundOutline(font.outline(glyphId));
  return {
    key,
    codePoint,
    glyphId,
    advance: font.advance(glyphId),
    bbox: boundingBox(commands),
    d: pathData(commands),
    expected: {
      advance: advance * space,
      bbox: [...box.bBoxSW, ...box.bBoxNE].map(v => v * space)
    }
  };
}

// The regression guard: what the outline measures against what Bravura's own
// metadata says of the glyph. Returns the disagreements, as sentences.
function disagreements({ key, advance, bbox, expected }) {
  const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
  const found = [];
  if (!near(advance, expected.advance)) {
    found.push(`${key}: advance ${advance}, metadata ${expected.advance}`);
  }
  if (!bbox.every((v, i) => near(v, expected.bbox[i]))) {
    found.push(`${key}: bounding box [${bbox.join(', ')}], metadata [${expected.bbox.join(', ')}]`);
  }
  return found;
}

const tidy = numbers => numbers.map(v => Number(v.toFixed(2))).join(', ');

const describe = ({ key, codePoint, glyphId, advance, bbox, expected }) =>
  `${key.padEnd(14)}U+${hex(codePoint)}  glyph ${String(glyphId).padEnd(5)}` +
  ` advance ${advance} (metadata ${tidy([expected.advance])})` +
  `  bbox [${tidy(bbox)}] (metadata [${tidy(expected.bbox)}])`;

const entrySource = ({ key, advance, bbox, d }) =>
  `  ${key}: { advance: ${advance}, bbox: [${bbox.map(Math.round).join(', ')}], d: "${d}" }`;

const moduleSource = (font, glyphs) => `\
// GENERATED by scripts/extract-glyph-outlines.mjs from Bravura ${font.version} (redist/otf/Bravura.otf). Do not edit by hand.
// Outlines (c) Steinberg Media Technologies GmbH, SIL Open Font License 1.1: see assets/fonts/licenses/Bravura-OFL.txt
export const UNITS_PER_EM = ${font.unitsPerEm};
// Font units, y axis up, origin on the baseline. d uses absolute M, L, C and Z commands only, every subpath closed.
export const OUTLINES = {
${glyphs.map(entrySource).join(',\n')}
};
`;

function main([fontPath, metadataPath]) {
  if (!fontPath || !metadataPath) {
    fail('usage: node scripts/extract-glyph-outlines.mjs <Bravura.otf> <Bravura.json>');
  }
  const font = readFont(new Uint8Array(readFileSync(fontPath)));
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (font.name !== 'Bravura' || metadata.fontName !== 'Bravura') {
    fail(`expected Bravura and its metadata, got the font ${font.name} and metadata for ${metadata.fontName}`);
  }
  if (Number(font.version) !== Number(metadata.fontVersion)) {
    fail(`the font is version ${font.version}, the metadata describes version ${metadata.fontVersion}`);
  }

  const glyphs = Object.keys(WANTED).map(key => extractGlyph(font, metadata, key));
  console.log(`${font.name} ${font.version}, ${font.unitsPerEm} units per em`);
  for (const glyph of glyphs) console.log(describe(glyph));
  const wrong = glyphs.flatMap(disagreements);
  if (wrong.length > 0) {
    const summary = `outlines and metadata disagree by more than ${TOLERANCE} unit, nothing written:`;
    fail([summary, ...wrong].join('\n  '));
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, moduleSource(font, glyphs));
  console.log(`Wrote ${OUTPUT}`);
}

// True when this file is the command being run, rather than a module that a
// test has imported for the readers above.
function isCommand() {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(SCRIPT);
  } catch {
    return false;
  }
}

if (isCommand()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`extract-glyph-outlines: ${error.message}`);
    process.exitCode = 1;
  }
}
