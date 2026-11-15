// The settings panel. Controls are native inputs (checkboxes, radios) styled
// as chips, switches and segments; each change mutates `settings` and calls
// `onChange` straight away - there is no Save step.
import { POSITION_NUMBERS, ROMAN } from '../music/fretboard.js';
import { GLYPH } from '../render/glyphs.js';
import { el as svgEl } from '../render/svg.js';

const STRINGS = [
  { value: 6, label: '6', sub: 'E' },
  { value: 5, label: '5', sub: 'A' },
  { value: 4, label: '4', sub: 'D' },
  { value: 3, label: '3', sub: 'G' },
  { value: 2, label: '2', sub: 'B' },
  { value: 1, label: '1', sub: 'E' }
];
const NOTE_VALUES = [
  { value: 'quarter', sub: 'Quarter', glyph: GLYPH.noteQuarterUp },
  { value: 'eighth', sub: 'Eighth', glyph: GLYPH.note8thUp },
  { value: 'sixteenth', sub: 'Sixteenth', glyph: GLYPH.note16thUp }
];

function noteIcon(glyph) {
  const svg = svgEl('svg', { class: 'chip__icon', viewBox: '0 0 22 34', 'aria-hidden': 'true' });
  svg.appendChild(svgEl('text', { x: 4, y: 29, 'font-size': 26 }, glyph));
  return svg;
}

// A group of chips bound to one array in `settings`. At least one stays on:
// the last checked chip is disabled until another is switched on.
function chipGroup(container, options, selected, onChange) {
  const inputs = options.map(option => {
    const label = document.createElement('label');
    label.className = 'chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(option.value);
    input.checked = selected().includes(option.value);
    input.setAttribute('aria-label', option.name);

    const face = document.createElement('span');
    face.className = 'chip__face';
    if (option.glyph) face.appendChild(noteIcon(option.glyph));
    if (option.label) face.append(option.label);
    if (option.sub) {
      const sub = document.createElement('span');
      sub.className = 'chip__sub';
      sub.textContent = option.sub;
      face.appendChild(sub);
    }
    label.append(input, face);
    container.appendChild(label);
    return input;
  });

  const lockLast = () => {
    const checked = inputs.filter(input => input.checked);
    for (const input of inputs) {
      input.disabled = checked.length === 1 && input.checked;
      input.parentElement.title = input.disabled ? 'At least one must stay on' : '';
    }
  };
  lockLast();

  for (const input of inputs) {
    input.addEventListener('change', () => {
      lockLast();
      onChange(options.filter((_, i) => inputs[i].checked).map(option => option.value));
    });
  }
}

export function initControls(settings, onChange) {
  const positionHint = document.getElementById('positionHint');
  const melodyHint = document.getElementById('melodyHint');
  const rotate = document.getElementById('rotate');
  const accidentals = document.getElementById('accidentals');
  const melodyInputs = [...document.querySelectorAll('input[name="melody"]')];

  const refreshHints = () => {
    const several = settings.positions.length > 1;
    positionHint.textContent = settings.rotatePositions
      ? (several
        ? 'A new position every measure; none repeats until all have appeared.'
        : 'Switch on two or more positions to rotate between them.')
      : (several
        ? 'Each new study draws one of these positions.'
        : 'The whole study stays in this position.');
    melodyHint.textContent = settings.melody === 'musical'
      ? 'Phrases, a key and cadences — still newly generated each time.'
      : 'Every note is left to chance.';
  };
  const changed = () => {
    refreshHints();
    onChange();
  };

  chipGroup(
    document.getElementById('positions'),
    POSITION_NUMBERS.map(n => ({ value: n, label: ROMAN[n], name: `Position ${ROMAN[n]}` })),
    () => settings.positions,
    values => {
      settings.positions = values;
      changed();
    });

  chipGroup(
    document.getElementById('strings'),
    STRINGS.map(s => ({ ...s, name: `String ${s.label}, ${s.sub}` })),
    () => settings.strings,
    values => {
      settings.strings = values;
      changed();
    });

  chipGroup(
    document.getElementById('noteValues'),
    NOTE_VALUES.map(v => ({ ...v, name: `${v.sub} notes` })),
    () => settings.noteValues,
    values => {
      settings.noteValues = values;
      changed();
    });

  rotate.checked = settings.rotatePositions;
  rotate.addEventListener('change', () => {
    settings.rotatePositions = rotate.checked;
    changed();
  });

  accidentals.checked = settings.accidentals;
  accidentals.addEventListener('change', () => {
    settings.accidentals = accidentals.checked;
    changed();
  });

  for (const input of melodyInputs) {
    input.checked = input.value === settings.melody;
    input.addEventListener('change', () => {
      if (input.checked) {
        settings.melody = input.value;
        changed();
      }
    });
  }

  refreshHints();
}

// On narrow screens the panel folds behind a button that shows a summary.
export function initPanelToggle() {
  const toggle = document.getElementById('panelToggle');
  const panel = document.getElementById('panel');
  toggle.addEventListener('click', () => {
    const open = panel.dataset.open !== 'true';
    panel.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  });
}
