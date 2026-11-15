// Fingering tooltip: hover with a mouse, tap on a touch screen.
import { pitchName } from '../music/pitch.js';

const FINGERS = ['open', 'index (1)', 'middle (2)', 'ring (3)', 'pinky (4)'];
const CIRCLED_STRING = ['', '①', '②', '③', '④', '⑤', '⑥'];
const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

const tooltip = document.getElementById('tooltip');

function fill(pitch) {
  const name = document.createElement('strong');
  name.textContent = pitchName(pitch);
  const lines = pitch.fingerings.map(f => {
    const row = document.createElement('div');
    row.textContent =
      `${CIRCLED_STRING[f.string]} ${ORDINAL[f.string]} string · fret ${f.fret} · ${FINGERS[f.finger]}`;
    return row;
  });
  tooltip.replaceChildren(name, ...lines);
}

function moveTo(event) {
  const pad = 14;
  const box = tooltip.getBoundingClientRect();
  let left = event.clientX + pad;
  let top = event.clientY + pad;
  if (left + box.width > window.innerWidth - 8) left = event.clientX - pad - box.width;
  if (top + box.height > window.innerHeight - 8) top = event.clientY - pad - box.height;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function show(event, pitch) {
  fill(pitch);
  tooltip.hidden = false;
  moveTo(event);
}

export function hideTooltip() {
  tooltip.hidden = true;
}

export function attachTooltip(target, pitch) {
  target.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') show(event, pitch);
  });
  target.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse' && !tooltip.hidden) moveTo(event);
  });
  target.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') hideTooltip();
  });
  // Touch and pen have no hover: a tap shows the tooltip until the next tap elsewhere.
  target.addEventListener('click', event => show(event, pitch));
}

document.addEventListener('pointerdown', event => {
  if (!(event.target instanceof Element) || !event.target.closest('.note')) hideTooltip();
});
window.addEventListener('scroll', hideTooltip, { passive: true });
