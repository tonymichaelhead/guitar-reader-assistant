// The settings panel. Controls are native inputs (checkboxes, radios) styled
// as chips, switches and segments; each change mutates `settings` and calls
// `onChange` straight away - there is no Save step.
import { POSITION_NUMBERS, ROMAN } from '../music/fretboard.js';
import { KEYS, keyById } from '../music/theory.js';
import { GLYPH } from '../render/glyphs.js';
import { el as svgEl } from '../render/svg.js';
import { describeKey, spokenKey } from './describe.js';

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

// Major keys in one row and their relative minors under them, so that each
// column shares a key signature.
const KEY_ROWS = [
  { name: 'Major keys', keys: KEYS.filter(key => key.mode === 'major') },
  { name: 'Minor keys', keys: KEYS.filter(key => key.mode === 'minor') }
];
// "D" for D major, "F♯m" for F sharp minor.
const keyChipLabel = key => key.label.replace(' major', '').replace(' minor', 'm');

const ACCIDENTAL_HINTS = {
  none: 'Natural notes only.',
  sharps: 'Every note of the position, the black keys written as sharps.',
  flats: 'Every note of the position, the black keys written as flats.',
  inKey: 'Only the notes of the key; any sharps or flats are in the key signature.',
  chromatic: 'Passing notes from outside the key as well, written with their own signs.'
};

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

// One key out of all of them: radio buttons, drawn as chips. Returns nothing;
// the browser keeps exactly one checked.
function keyPicker(container, selected, onChange) {
  for (const row of KEY_ROWS) {
    const chips = document.createElement('div');
    chips.className = 'chips chips--keys';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', row.name);
    for (const key of row.keys) {
      const label = document.createElement('label');
      label.className = 'chip';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'key';
      input.value = key.id;
      input.checked = key.id === selected();
      input.setAttribute('aria-label', spokenKey(key.label));
      input.addEventListener('change', () => {
        if (input.checked) onChange(key.id);
      });
      const face = document.createElement('span');
      face.className = 'chip__face';
      face.textContent = keyChipLabel(key);
      label.append(input, face);
      chips.appendChild(label);
    }
    container.appendChild(chips);
  }
}

export function initControls(settings, onChange) {
  const positionHint = document.getElementById('positionHint');
  const melodyHint = document.getElementById('melodyHint');
  const keyHint = document.getElementById('keyHint');
  const accidentalsHint = document.getElementById('accidentalsHint');
  const rotate = document.getElementById('rotate');
  const chromatic = document.getElementById('chromatic');
  const accidentalInputs = [...document.querySelectorAll('input[name="accidentals"]')];
  const melodyInputs = [...document.querySelectorAll('input[name="melody"]')];
  // How the black keys were last written in Random mode. Musical mode only
  // switches accidentals off and on, and must hand this choice back unchanged.
  let spelling = settings.accidentals === 'flats' ? 'flats' : 'sharps';

  // Random mode has no key, so it chooses how to write the black keys;
  // Musical mode has one, which decides that, so its control is a switch.
  const showForMode = () => {
    const musical = settings.melody === 'musical';
    document.getElementById('keyGroup').hidden = !musical;
    document.getElementById('accidentals').hidden = musical;
    document.getElementById('chromaticSwitch').hidden = !musical;
    for (const input of accidentalInputs) input.checked = input.value === settings.accidentals;
    chromatic.checked = settings.accidentals !== 'none';
  };

  const refreshHints = () => {
    const several = settings.positions.length > 1;
    positionHint.textContent = settings.rotatePositions
      ? (several
        ? 'A new position every measure; none repeats until all have appeared.'
        : 'Switch on two or more positions to rotate between them.')
      : (several
        ? 'Each new study draws one of these positions.'
        : 'The whole study stays in this position.');
    const musical = settings.melody === 'musical';
    melodyHint.textContent = musical
      ? 'Phrases and cadences in the key chosen below, newly written each time.'
      : 'Every note is left to chance.';
    keyHint.textContent = describeKey(keyById(settings.key));
    accidentalsHint.textContent = musical
      ? ACCIDENTAL_HINTS[settings.accidentals === 'none' ? 'inKey' : 'chromatic']
      : ACCIDENTAL_HINTS[settings.accidentals];
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

  keyPicker(document.getElementById('keys'), () => settings.key, id => {
    settings.key = id;
    changed();
  });

  for (const input of accidentalInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      settings.accidentals = input.value;
      if (input.value !== 'none') spelling = input.value;
      changed();
    });
  }
  chromatic.addEventListener('change', () => {
    settings.accidentals = chromatic.checked ? spelling : 'none';
    showForMode();
    changed();
  });

  for (const input of melodyInputs) {
    input.checked = input.value === settings.melody;
    input.addEventListener('change', () => {
      if (input.checked) {
        settings.melody = input.value;
        showForMode();
        changed();
      }
    });
  }

  showForMode();
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
