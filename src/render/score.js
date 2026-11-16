// Draws a Score as SVG: one <svg> per system, stacked, so that a printed page
// can break between systems but never through one.
import { ROMAN } from '../music/fretboard.js';
import {
  drawBarline, drawBeam, drawClef, drawKeySignature, drawNote, drawStaff, drawTimeSignature
} from './draw.js';
import { SPACE as S } from './glyphs.js';
import { PAGE, layoutScore } from './layout.js';
import { el } from './svg.js';
import { attachTooltip, hideTooltip } from './tooltip.js';

// Said aloud, a key's sharp or flat sign is a word.
const spoken = label => label.replace('♯', ' sharp').replace('♭', ' flat');

function drawSystem(svg, system) {
  drawStaff(svg, system.staffStart, system.staffEnd, system.top);
  drawClef(svg, system.clefX, system.bottom);
  drawKeySignature(svg, system.keySignature);
  if (system.timeX !== null) drawTimeSignature(svg, system.timeX, system.top);
  if (system.measureNumber !== null) {
    svg.appendChild(el('text', {
      class: 'measure-num', x: system.staffStart, y: system.top - 2 * S
    }, system.measureNumber));
  }

  for (const bar of system.bars) {
    if (bar.showPosition) {
      svg.appendChild(el('text', {
        class: 'position-mark', x: bar.markX, y: system.markY, 'text-anchor': 'middle'
      }, ROMAN[bar.position]));
    }
    for (const beam of bar.beams) drawBeam(svg, beam);
    for (const note of bar.notes) attachTooltip(drawNote(svg, note), note.pitch);
    drawBarline(svg, bar.x1, system.top, system.bottom, bar.final);
  }
}

export function renderScore(score, container, viewWidth) {
  const layout = layoutScore(score, viewWidth);
  const wrapper = document.createElement('div');
  wrapper.className = 'score';
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute(
    'aria-label',
    `Sight-reading study number ${score.seed}, ${score.measures.length} measures in 4/4` +
      (score.tonality ? `, ${spoken(score.tonality)}` : ''));

  // Each system owns the slice of the drawing from its headroom down to the
  // next system's headroom; the last one runs to the bottom of the layout.
  layout.systems.forEach((system, i) => {
    const sliceTop = system.top - PAGE.systemTop;
    const next = layout.systems[i + 1];
    const sliceBottom = next ? next.top - PAGE.systemTop : layout.height;
    const svg = el('svg', {
      class: 'system',
      viewBox: `0 ${sliceTop} ${layout.width} ${sliceBottom - sliceTop}`,
      'aria-hidden': 'true'
    });
    drawSystem(svg, system);
    wrapper.appendChild(svg);
  });

  container.replaceChildren(wrapper);
  hideTooltip();
}
