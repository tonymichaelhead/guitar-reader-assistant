// Writes the engraved-style title block above the score, the plate line
// beneath it, and the summary on the settings button. The wording itself
// comes from describe.js.
import { describeNoteMap, describeScore, summarizeSettings } from './describe.js';

const byId = id => document.getElementById(id);

export function updateTitleBlock({ view, score, settings }) {
  const text = view === 'score' ? describeScore(score) : describeNoteMap(settings);
  byId('dedication').textContent = text.dedication;

  const title = byId('pieceTitle');
  title.textContent = text.title;
  if (text.number) {
    const number = document.createElement('span');
    number.textContent = text.number;
    title.append(' ', number);
  }

  byId('lineLeft').textContent = text.left;
  byId('lineRight').textContent = text.right;
  const meta = byId('meta');
  meta.textContent = text.meta;
  if (text.hint) {
    // The separator sits inside the span, so that hiding the hint on paper
    // leaves no dot hanging at the end of the line.
    const hint = document.createElement('span');
    hint.className = 'screen-only';
    hint.textContent = ` · ${text.hint}`;
    meta.append(hint);
  }
  byId('plate').textContent = text.plate;
}

export function updateSummary(settings) {
  byId('summary').textContent = summarizeSettings(settings);
}
