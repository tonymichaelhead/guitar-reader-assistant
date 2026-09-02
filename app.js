// ---- Configuration (more of this will be exposed in the UI later) ---------
const CONFIG = {
  measures: 16,
  beatsPerMeasure: 4,
  measuresPerSystem: 4,
  position: 5,
  accidentals: false,
  strings: [6, 5, 4, 3, 2, 1],
  maxLeapSteps: 7 // limit diatonic leap between consecutive notes
};

// ---- Fretboard ------------------------------------------------------------
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// Chromatic pitch class -> [letter, alteration], spelled with sharps.
const SPELLING = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]
];
// Open strings as *written* pitch (guitar notation sounds an octave lower),
// 6th string first. Value = octave * 12 + pitch class.
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64]; // E3 A3 D4 G4 B4 E5

function pitchFromValue(value) {
  const [letter, alter] = SPELLING[value % 12];
  return { letter, octave: Math.floor(value / 12), alter, value };
}

// Every pitch reachable without shifting out of the given position, together
// with each string/fret that produces it.
function buildPosition(position) {
  const frets = position === 1 ? [0, 1, 2, 3, 4]
                              : [position, position + 1, position + 2, position + 3];
  const byValue = new Map();
  OPEN_STRINGS.forEach((open, i) => {
    const stringNumber = 6 - i;
    for (const fret of frets) {
      const value = open + fret;
      if (!byValue.has(value)) {
        byValue.set(value, { ...pitchFromValue(value), fingerings: [] });
      }
      byValue.get(value).fingerings.push({
        string: stringNumber,
        fret,
        finger: fret === 0 ? 0 : fret - position + 1
      });
    }
  });
  const all = [...byValue.values()].sort((a, b) => a.value - b.value);
  for (const p of all) p.fingerings.sort((a, b) => b.string - a.string);
  return { all, naturals: all.filter(p => p.alter === 0) };
}

const POSITIONS = {
  1: { label: '1st position', ...buildPosition(1) },
  5: { label: '5th position', ...buildPosition(5) },
  7: { label: '7th position', ...buildPosition(7) },
  12: { label: '12th position', ...buildPosition(12) }
};

// Notes playable in the current position on the currently enabled strings,
// with fingerings narrowed to those strings.
const currentPool = () => {
  const pos = POSITIONS[CONFIG.position];
  const base = CONFIG.accidentals ? pos.all : pos.naturals;
  if (CONFIG.strings.length === 6) return base;
  return base
    .map(p => ({ ...p, fingerings: p.fingerings.filter(f => CONFIG.strings.includes(f.string)) }))
    .filter(p => p.fingerings.length > 0);
};

const FINGERS = ['open', 'index (1)', 'middle (2)', 'ring (3)', 'pinky (4)'];
const fingerName = f => FINGERS[f.finger] || `finger ${f.finger}`;
const CIRCLED_STRING = ['', '\u2460', '\u2461', '\u2462', '\u2463', '\u2464', '\u2465'];
const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
const pitchName = p =>
  p.letter + (p.alter === 1 ? '\u266F' : p.alter === -1 ? '\u266D' : '') + p.octave;

// ---- Engraving constants --------------------------------------------------
const SPACE = 12;                 // distance between staff lines
const STAFF_H = SPACE * 4;
const SYSTEM_TOP = SPACE * 7;     // top of first staff (headroom for ledgers)
const SYSTEM_GAP = SPACE * 16;    // vertical distance between systems
const LEFT = 16;
const CLEF_W = 46;
const TIMESIG_W = 30;
const RIGHT = 16;
const VIEW_W = 960;

const diatonic = (letter, octave) => octave * 7 + LETTERS.indexOf(letter);
const E4 = diatonic('E', 4); // bottom line of the treble staff

// ---- Generation -----------------------------------------------------------
function generate() {
  const pool = currentPool();
  const total = CONFIG.measures * CONFIG.beatsPerMeasure;
  const notes = [];
  let prev = null;
  for (let i = 0; i < total; i++) {
    let pick, guard = 0;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)];
      guard++;
    } while (
      prev &&
      guard < 50 &&
      (Math.abs(diatonic(pick.letter, pick.octave) - diatonic(prev.letter, prev.octave)) >
         CONFIG.maxLeapSteps ||
        pick.value === prev.value)
    );
    notes.push(pick);
    prev = pick;
  }
  return notes;
}

// ---- Rendering ------------------------------------------------------------
const SVG_NS = 'http://www.w3.org/2000/svg';
function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function drawStaffLines(svg, top) {
  for (let i = 0; i < 5; i++) {
    svg.appendChild(el('line', {
      class: 'staff-line',
      x1: LEFT, x2: VIEW_W - RIGHT,
      y1: top + i * SPACE, y2: top + i * SPACE,
      'stroke-width': 1
    }));
  }
}

function drawClef(svg, bottom) {
  const clef = el('text', {
    class: 'clef',
    x: LEFT + 6,
    y: bottom,   // treble clef baseline sits on the bottom line region
    'font-size': STAFF_H * 2.1,
    'font-family': 'Bravura, "Segoe UI Symbol", "Noto Music", serif'
  });
  clef.textContent = '\uD834\uDD1E';
  svg.appendChild(clef);
}

function render(notes) {
  const systems = Math.ceil(CONFIG.measures / CONFIG.measuresPerSystem);
  const height = SYSTEM_TOP + (systems - 1) * SYSTEM_GAP + STAFF_H + SPACE * 7;
  const svg = el('svg', {
    viewBox: `0 0 ${VIEW_W} ${height}`,
    xmlns: SVG_NS
  });

  const perBar = CONFIG.beatsPerMeasure;
  let noteIndex = 0;

  for (let s = 0; s < systems; s++) {
    const top = SYSTEM_TOP + s * SYSTEM_GAP;
    const bottom = top + STAFF_H;

    drawStaffLines(svg, top);
    drawClef(svg, bottom);

    // time signature (first system only)
    const barsStart = LEFT + CLEF_W + (s === 0 ? TIMESIG_W : 8);
    if (s === 0) {
      const mk = (txt, y) => {
        const t = el('text', {
          class: 'timesig',
          x: LEFT + CLEF_W + 4, y,
          'font-size': SPACE * 2.4,
          'font-weight': '700',
          'font-family': 'Georgia, serif',
          'text-anchor': 'middle'
        });
        t.textContent = txt;
        return t;
      };
      svg.appendChild(mk('4', top + SPACE * 2 - 1));
      svg.appendChild(mk('4', top + SPACE * 4 - 1));
    }

    const barsEnd = VIEW_W - RIGHT;
    const barsInSystem = Math.min(
      CONFIG.measuresPerSystem,
      CONFIG.measures - s * CONFIG.measuresPerSystem
    );
    const barW = (barsEnd - barsStart) / barsInSystem;

    // opening barline
    svg.appendChild(el('line', {
      class: 'barline', x1: LEFT, x2: LEFT, y1: top, y2: bottom, 'stroke-width': 1
    }));

    for (let b = 0; b < barsInSystem; b++) {
      const x0 = barsStart + b * barW;
      const measureNumber = s * CONFIG.measuresPerSystem + b + 1;

      const num = el('text', { class: 'measure-num', x: x0 + 2, y: top - 8 });
      num.textContent = measureNumber;
      svg.appendChild(num);

      const barAlterations = new Map(); // accidentals stay in force for the measure
      for (let n = 0; n < perBar; n++) {
        const x = x0 + barW * (n + 0.5) / perBar;
        const note = notes[noteIndex++];
        const key = note.letter + note.octave;
        const inForce = barAlterations.get(key) || 0;
        let glyph = null;
        if (note.alter !== inForce) {
          glyph = note.alter === 1 ? '\u266F' : note.alter === -1 ? '\u266D' : '\u266E';
          barAlterations.set(key, note.alter);
        }
        drawQuarterNote(svg, x, bottom, note, glyph);
      }

      // barline at the end of the measure
      const bx = x0 + barW;
      const isLast = (measureNumber === CONFIG.measures);
      if (isLast) {
        svg.appendChild(el('line', {
          class: 'barline', x1: bx - 6, x2: bx - 6, y1: top, y2: bottom, 'stroke-width': 1
        }));
        svg.appendChild(el('line', {
          class: 'barline', x1: bx - 1.5, x2: bx - 1.5, y1: top, y2: bottom, 'stroke-width': 3
        }));
      } else {
        svg.appendChild(el('line', {
          class: 'barline', x1: bx, x2: bx, y1: top, y2: bottom, 'stroke-width': 1
        }));
      }
    }
  }

  const sheet = document.getElementById('sheet');
  sheet.replaceChildren(svg);
  hideTooltip();
}

function drawQuarterNote(parent, x, bottomLineY, note, accidentalGlyph) {
  const svg = el('g', { class: 'note' });
  parent.appendChild(svg);
  const { letter, octave } = note;
  const steps = diatonic(letter, octave) - E4;   // half-space steps above E4
  const y = bottomLineY - steps * (SPACE / 2);
  const rx = SPACE * 0.62, ry = SPACE * 0.46;

  // ledger lines
  const ledgerW = rx * 2.6;
  if (steps <= -2) {
    for (let sIdx = -2; sIdx >= steps; sIdx -= 2) {
      svg.appendChild(el('line', {
        class: 'ledger',
        x1: x - ledgerW, x2: x + ledgerW,
        y1: bottomLineY - sIdx * (SPACE / 2),
        y2: bottomLineY - sIdx * (SPACE / 2),
        'stroke-width': 1
      }));
    }
  } else if (steps >= 10) {
    for (let sIdx = 10; sIdx <= steps; sIdx += 2) {
      svg.appendChild(el('line', {
        class: 'ledger',
        x1: x - ledgerW, x2: x + ledgerW,
        y1: bottomLineY - sIdx * (SPACE / 2),
        y2: bottomLineY - sIdx * (SPACE / 2),
        'stroke-width': 1
      }));
    }
  }

  svg.appendChild(el('ellipse', {
    class: 'notehead',
    cx: x, cy: y, rx, ry,
    transform: `rotate(-20 ${x} ${y})`
  }));

  if (accidentalGlyph) {
    const acc = el('text', {
      class: 'accidental',
      x: x - rx - SPACE * 0.55,
      y: y + SPACE * 0.42,
      'font-size': SPACE * 2.6,
      'font-family': '"Bravura", "Segoe UI Symbol", "Noto Music", serif',
      'text-anchor': 'middle'
    });
    acc.textContent = accidentalGlyph;
    svg.appendChild(acc);
  }

  // stem: up below the middle line (steps < 4), down above it
  const stemUp = steps < 4;
  const stemLen = SPACE * 3.5;
  const sx = stemUp ? x + rx - 0.6 : x - rx + 0.6;
  svg.appendChild(el('line', {
    class: 'stem',
    x1: sx, x2: sx,
    y1: y + (stemUp ? -ry * 0.2 : ry * 0.2),
    y2: y + (stemUp ? -stemLen : stemLen),
    'stroke-width': 1.6
  }));

  const hit = el('rect', {
    class: 'hit',
    x: x - SPACE * 1.4, y: y - SPACE,
    width: SPACE * 2.8, height: SPACE * 2
  });
  svg.appendChild(hit);
  svg.addEventListener('mouseenter', e => showTooltip(e, note));
  svg.addEventListener('mousemove', moveTooltip);
  svg.addEventListener('mouseleave', hideTooltip);
}

// ---- Tooltip --------------------------------------------------------------
const tooltip = document.getElementById('tooltip');

function showTooltip(e, note) {
  const lines = note.fingerings
    .map(f => `${CIRCLED_STRING[f.string]} ${ORDINAL[f.string]} string \u00b7 fret ${f.fret} \u00b7 ${fingerName(f)}`)
    .join('<br>');
  tooltip.innerHTML = `<strong>${pitchName(note)}</strong><br>${lines}`;
  tooltip.hidden = false;
  moveTooltip(e);
}

function moveTooltip(e) {
  const pad = 14;
  const r = tooltip.getBoundingClientRect();
  let left = e.clientX + pad;
  let top = e.clientY + pad;
  if (left + r.width > window.innerWidth - 8) left = e.clientX - pad - r.width;
  if (top + r.height > window.innerHeight - 8) top = e.clientY - pad - r.height;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

function hideTooltip() {
  tooltip.hidden = true;
}

// ---- Note map -------------------------------------------------------------
function renderCheatSheet() {
  const pool = currentPool();
  const perRow = 9;
  const rows = Math.ceil(pool.length / perRow);
  const rowGap = SPACE * 16;
  const height = SYSTEM_TOP + (rows - 1) * rowGap + STAFF_H + SPACE * 8;
  const svg = el('svg', { viewBox: `0 0 ${VIEW_W} ${height}`, xmlns: SVG_NS });

  for (let r = 0; r < rows; r++) {
    const top = SYSTEM_TOP + r * rowGap;
    const bottom = top + STAFF_H;

    drawStaffLines(svg, top);
    drawClef(svg, bottom);

    const slice = pool.slice(r * perRow, (r + 1) * perRow);
    const start = LEFT + CLEF_W + 14;
    const colW = (VIEW_W - RIGHT - start) / perRow;

    slice.forEach((note, j) => {
      const x = start + colW * (j + 0.5);
      drawQuarterNote(svg, x, bottom, note, note.alter === 0 ? null : '\u266F');

      const steps = diatonic(note.letter, note.octave) - E4;
      const noteY = bottom - steps * (SPACE / 2);
      const stemUp = steps < 4;
      const fingers = [...new Set(note.fingerings.map(f => f.finger))].sort();
      const label = el('text', {
        class: 'cheat-finger',
        x,
        y: stemUp ? noteY + SPACE * 2 : noteY - SPACE * 1.6,
        'text-anchor': 'middle'
      });
      label.textContent = fingers.join('/');
      svg.appendChild(label);
    });
  }

  document.getElementById('sheet').replaceChildren(svg);
  hideTooltip();
}

// ---- Boot -----------------------------------------------------------------
const positionSelect = document.getElementById('position');
const accidentalsToggle = document.getElementById('accidentals');
const accidentalsLabel = document.getElementById('accidentalsLabel');
const stringToggles = [...document.querySelectorAll('.string-toggle')];
const cheatLink = document.getElementById('cheatLink');
const regenButton = document.getElementById('regen');
const metaEl = document.getElementById('meta');

let currentNotes = [];
let view = 'score';
let scoreSettings = null; // settings key the current score was generated with

function updateMeta() {
  const pos = POSITIONS[CONFIG.position];
  const pool = currentPool();
  const lo = pool[0], hi = pool[pool.length - 1];
  const strings = CONFIG.strings.length === 6
    ? 'all strings'
    : `string${CONFIG.strings.length > 1 ? 's' : ''} ${CONFIG.strings.join(', ')}`;
  const range = `${pos.label}, ${strings} (${pitchName(lo)}\u2013${pitchName(hi)} as written)`;
  metaEl.textContent = view === 'score'
    ? `${CONFIG.accidentals ? 'Chromatic' : 'C major'} \u00b7 4/4 \u00b7 ${CONFIG.measures} measures ` +
      `\u00b7 quarter notes \u00b7 ${range}`
    : `Note map \u00b7 ${pool.length} notes \u00b7 ${range} \u00b7 numbers are left-hand fingers`;
}

function draw() {
  updateMeta();
  if (view === 'score') render(currentNotes);
  else renderCheatSheet();
}

function setView(next) {
  view = next;
  cheatLink.textContent = view === 'score' ? 'Note map' : '\u2190 Back to score';
  regenButton.hidden = view !== 'score';
  accidentalsLabel.textContent = view === 'score' ? 'Random accidentals' : 'Show accidentals';
  if (view === 'score' && scoreSettings !== settingsKey()) {
    newExercise();
    return;
  }
  draw();
}

const settingsKey = () =>
  `${CONFIG.position}|${CONFIG.accidentals}|${CONFIG.strings.join('')}`;

function newExercise() {
  currentNotes = generate();
  scoreSettings = settingsKey();
  draw();
}

function settingsChanged() {
  if (view === 'score') newExercise();
  else draw();
}

positionSelect.value = String(CONFIG.position);
accidentalsToggle.checked = CONFIG.accidentals;
accidentalsToggle.addEventListener('change', () => {
  CONFIG.accidentals = accidentalsToggle.checked;
  settingsChanged();
});
positionSelect.addEventListener('change', () => {
  CONFIG.position = Number(positionSelect.value);
  settingsChanged();
});
for (const box of stringToggles) {
  box.addEventListener('change', () => {
    const chosen = stringToggles.filter(b => b.checked);
    if (chosen.length === 0) {
      box.checked = true; // keep at least one string playable
      return;
    }
    CONFIG.strings = chosen.map(b => Number(b.value)).sort((a, b) => b - a);
    settingsChanged();
  });
}
cheatLink.addEventListener('click', e => {
  e.preventDefault();
  setView(view === 'score' ? 'cheat' : 'score');
});
regenButton.addEventListener('click', newExercise);
newExercise();
