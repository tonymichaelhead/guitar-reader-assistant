// Boot and orchestration: settings -> score -> page. The only place that
// picks seeds, so everything under src/music stays deterministic.
import { downloadBytes, preferredPageSize } from './export/download.js';
import { scoreToPdf } from './export/score-pdf.js';
import { generateScore } from './music/generate.js';
import { GLYPH, GLYPH_SIZE, MUSIC_FONT } from './render/glyphs.js';
import { PAGE, viewWidthFor } from './render/layout.js';
import { renderNoteMap } from './render/note-map.js';
import { renderScore } from './render/score.js';
import { LIBRARY_KEY, addToLibrary, loadLibrary, removeFromLibrary } from './state/library.js';
import { loadSettings, saveSettings } from './state/settings.js';
import { initControls, initPanelToggle } from './ui/controls.js';
import { describeScore, fileStem, studyName } from './ui/describe.js';
import { initLibraryDialog } from './ui/library-dialog.js';
import { updateSummary, updateTitleBlock } from './ui/title-block.js';

const byId = id => document.getElementById(id);
const sheet = byId('sheet');
const status = byId('status');
const saveButton = byId('saveButton');
const pdfButton = byId('pdfButton');
const libraryCount = byId('libraryCount');
const viewInputs = [...document.querySelectorAll('input[name="view"]')];

const settings = loadSettings();
let score = null;
let view = 'score';       // 'score' | 'map'
let scoreIsStale = false; // settings changed while the note map was showing
let viewWidth = 0;
let printing = false;
let saved = loadLibrary(); // saved studies, newest first
let savedId = null;        // library id of the study on screen, if it is a saved one

const announce = message => {
  status.textContent = message;
};

// ---- Drawing -------------------------------------------------------------
function refreshTools() {
  const onScore = view === 'score';
  saveButton.hidden = !onScore;
  pdfButton.hidden = !onScore;
  saveButton.disabled = savedId !== null;
  saveButton.textContent = savedId === null ? 'Save' : 'Saved';
  libraryCount.textContent = String(saved.length);
  libraryCount.hidden = saved.length === 0;
  byId('libraryButton').setAttribute(
    'aria-label',
    `Library: ${saved.length} saved ${saved.length === 1 ? 'étude' : 'études'}`);
}

function draw() {
  // Paper is always laid out at full width, whatever the window happens to be.
  viewWidth = printing ? PAGE.maxWidth : viewWidthFor(sheet.clientWidth);
  updateTitleBlock({ view, score, settings });
  if (view === 'score') renderScore(score, sheet, viewWidth);
  else renderNoteMap(settings, sheet, viewWidth);
  refreshTools();
}

function showScore(next, id = null) {
  score = next;
  savedId = id;
  scoreIsStale = false;
  draw();
}

function newEtude() {
  announce('');
  showScore(generateScore(settings, 1 + Math.floor(Math.random() * 9999)));
}

function settingsChanged() {
  saveSettings(settings);
  updateSummary(settings);
  if (view === 'score') {
    newEtude();
  } else {
    scoreIsStale = true;
    draw();
  }
}

function setView(next) {
  view = next;
  for (const input of viewInputs) input.checked = input.value === view;
  if (view === 'score' && scoreIsStale) newEtude();
  else draw();
}

// "New étude" always works: from the note map it returns to the score.
function requestNewEtude() {
  if (view === 'score') {
    newEtude();
  } else {
    scoreIsStale = true;
    setView('score');
  }
}

// ---- Saved studies -------------------------------------------------------
const STORAGE_PROBLEM = {
  quota: 'Not saved: this browser’s storage for the site is full. Delete a saved étude and try again.',
  unavailable: 'Not saved: this browser is not letting the site store anything.'
};

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

function saveCurrent() {
  if (savedId !== null) return;
  const id = newId();
  const result = addToLibrary(score, { id, savedAt: Date.now() });
  if (result.ok) {
    saved = result.entries;
    savedId = id;
    announce(`${studyName(score)} saved to the library.`);
  } else {
    announce(STORAGE_PROBLEM[result.reason] || STORAGE_PROBLEM.unavailable);
  }
  refreshTools();
}

const library = initLibraryDialog({
  onOpen(entry) {
    library.close();
    view = 'score';
    for (const input of viewInputs) input.checked = input.value === view;
    showScore(entry.score, entry.id);
    announce(`${studyName(entry.score)} opened from the library.`);
  },
  onDelete(entry) {
    const result = removeFromLibrary(entry.id);
    if (!result.ok) {
      announce('Not deleted: this browser is not letting the site change its storage.');
      return;
    }
    saved = result.entries;
    if (savedId === entry.id) savedId = null; // still on screen, and can be saved again
    library.update(saved, savedId);
    announce(`${studyName(entry.score)} deleted from the library.`);
    refreshTools();
  }
});

// Another tab of the app saved or deleted something (a null key means the
// whole storage was cleared). Take the list as it now is, so that "Saved" and
// the count never describe a study that is no longer there.
window.addEventListener('storage', event => {
  if (event.key !== null && event.key !== LIBRARY_KEY) return;
  saved = loadLibrary();
  if (savedId !== null && !saved.some(entry => entry.id === savedId)) savedId = null;
  refreshTools();
  library.refresh(saved, savedId);
});

// ---- Export --------------------------------------------------------------
function exportPdf() {
  try {
    const bytes = scoreToPdf(score, { text: describeScore(score), pageSize: preferredPageSize() });
    downloadBytes(bytes, `${fileStem(score)}.pdf`, 'application/pdf');
    announce(`${studyName(score)} downloaded as a PDF.`);
  } catch (error) {
    console.error(error);
    announce('The PDF could not be made. Print, then choose “Save as PDF”, works as a fallback.');
  }
}

// ---- Wiring --------------------------------------------------------------
initControls(settings, settingsChanged);
initPanelToggle();
updateSummary(settings);

for (const input of viewInputs) {
  input.addEventListener('change', () => {
    if (input.checked) setView(input.value);
  });
}
byId('regen').addEventListener('click', requestNewEtude);
saveButton.addEventListener('click', saveCurrent);
pdfButton.addEventListener('click', exportPdf);
byId('printButton').addEventListener('click', () => window.print());
byId('libraryButton').addEventListener('click', () => {
  saved = loadLibrary(); // another tab may have changed it
  refreshTools();
  library.show(saved, savedId);
});

document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  requestNewEtude();
});

// The layout depends on the width available, so re-lay out when it changes.
new ResizeObserver(() => {
  if (score && !printing && viewWidthFor(sheet.clientWidth) !== viewWidth) draw();
}).observe(sheet);

window.addEventListener('beforeprint', () => {
  printing = true;
  if (score) draw();
});
window.addEventListener('afterprint', () => {
  printing = false;
  if (score) draw();
});

// The notation is drawn with font glyphs, so wait for the fonts; if they fail
// to load, draw anyway rather than show nothing.
const fonts = [
  document.fonts.load(`${GLYPH_SIZE}px ${MUSIC_FONT}`, GLYPH.noteheadBlack),
  document.fonts.load('600 17px "Playfair Display"'),
  document.fonts.load('17px "EB Garamond"')
];
Promise.allSettled(fonts).then(newEtude);
