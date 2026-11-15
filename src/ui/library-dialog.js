// The list of saved studies, in a native modal <dialog> (which brings focus
// trapping and Escape-to-close for free).
import { describeBriefly, studyName } from './describe.js';

// The least time between two presses that each count: the press that arms a
// Delete button and the one that confirms it, and a confirmed delete and the
// arming of the next row. A double-click, a double-tap or a bounced key is
// one gesture, not two decisions.
const CONFIRM_GAP = 500; // ms

// How long after the dialog opens the rest of a double-click is ignored. The
// press that opened it may be the first half of one, and its second half
// lands on whatever the dialog put under the pointer: Close, on a phone.
const OPENING_GAP = 1000; // ms

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function button(label, className) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `button button--quiet ${className || ''}`.trim();
  node.textContent = label;
  return node;
}

// The one Delete button that is waiting for its second press, if any.
let armed = null; // { node, disarm }
// When the last delete was confirmed, on the clock of event.timeStamp.
let deletedAt = -Infinity;

// Deleting is permanent, so the button asks for a second press: the first
// arms it, and it stays armed until the reader does something else. There is
// no timer: nobody should lose a confirmation for being slow.
function deleteButton(name, onConfirm) {
  const node = button('Delete', 'button--danger');
  node.setAttribute('aria-label', `Delete ${name}`);
  let armedAt = 0;
  const disarm = () => {
    if (armed?.node === node) armed = null;
    node.dataset.armed = 'false';
    node.textContent = 'Delete';
    node.setAttribute('aria-label', `Delete ${name}`);
  };
  node.addEventListener('click', event => {
    // The tail of the gesture that just deleted the row above: focus is on
    // this button now, and the pointer may be too.
    if (event.timeStamp - deletedAt < CONFIRM_GAP) return;
    if (node.dataset.armed === 'true') {
      // A second click counts only as a press of its own. The time alone
      // would let through a slow double-click, which the system still
      // reports as one (detail 2); a keyboard press reports 0.
      if (event.detail > 1 || event.timeStamp - armedAt < CONFIRM_GAP) return;
      // Disarmed first, so that a delete which fails leaves a plain button.
      disarm();
      deletedAt = event.timeStamp;
      onConfirm();
      return;
    }
    armed?.disarm();
    armed = { node, disarm };
    armedAt = event.timeStamp;
    node.dataset.armed = 'true';
    node.textContent = 'Really delete?';
    node.setAttribute('aria-label', `Really delete ${name}? Press again to confirm.`);
  });
  // A held key repeats, and every repeat would count as a press.
  node.addEventListener('keydown', event => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  });
  node.addEventListener('blur', disarm);
  return node;
}

export function initLibraryDialog({ onOpen, onDelete }) {
  const dialog = document.getElementById('library');
  const list = document.getElementById('libraryList');
  const empty = document.getElementById('libraryEmpty');
  const close = document.getElementById('libraryClose');
  const status = document.getElementById('libraryStatus');

  const outside = event => {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom;
  };

  close.addEventListener('click', () => dialog.close());

  // A press on the backdrop closes the dialog. The backdrop belongs to the
  // dialog element, and so do the margins inside its box, so the press must
  // both start and end outside the box: a click in a margin, or a text
  // selection dragged out of the box, is not a wish to close. Nor is the
  // second half of a double-click on the button that opened the dialog.
  let pressedOutside = false;
  let shownAt = -Infinity;
  // Swallow the rest of a double-click that began on the button which opened
  // the dialog, whatever it lands on.
  dialog.addEventListener('click', event => {
    if (event.detail > 1 && event.timeStamp - shownAt < OPENING_GAP) {
      event.stopPropagation();
      event.preventDefault();
    }
  }, true);
  // A double-click on the backdrop or in a margin would otherwise highlight
  // the nearest word inside the dialog.
  dialog.addEventListener('mousedown', event => {
    if (event.detail > 1 && event.target === dialog) event.preventDefault();
  });
  dialog.addEventListener('pointerdown', event => {
    pressedOutside = event.target === dialog && outside(event);
    // Safari does not focus a button on a click, so blur alone would leave a
    // Delete button armed while the reader went on to something else.
    if (armed && !armed.node.contains(event.target)) armed.disarm();
  });
  dialog.addEventListener('click', event => {
    const onBackdrop = pressedOutside && event.target === dialog && outside(event) && event.detail <= 1;
    pressedOutside = false;
    if (onBackdrop) dialog.close();
  });

  function render(entries, currentId) {
    armed = null;
    empty.hidden = entries.length > 0;
    list.replaceChildren(...entries.map(entry => {
      const item = document.createElement('li');
      item.className = 'library__item';
      if (entry.id === currentId) item.dataset.current = 'true';

      const text = document.createElement('div');
      text.className = 'library__text';
      const name = document.createElement('p');
      name.className = 'library__name';
      name.textContent = studyName(entry.score);
      if (entry.id === currentId) {
        const mark = document.createElement('span');
        mark.textContent = 'open now';
        name.append(' ', mark);
      }
      const detail = document.createElement('p');
      detail.className = 'library__detail';
      detail.textContent = describeBriefly(entry.score);
      const date = document.createElement('p');
      date.className = 'library__date';
      date.textContent = `Saved ${dateFormat.format(new Date(entry.savedAt))}`;
      text.append(name, detail, date);

      const actions = document.createElement('div');
      actions.className = 'library__actions';
      const open = button('Open');
      open.setAttribute('aria-label', `Open ${studyName(entry.score)}`);
      open.addEventListener('click', () => onOpen(entry));
      const remove = deleteButton(studyName(entry.score), () => onDelete(entry));
      // Two studies can share a number, so a button is known by its entry
      // and its job, never by its label.
      for (const [node, action] of [[open, 'open'], [remove, 'delete']]) {
        node.dataset.id = entry.id;
        node.dataset.action = action;
      }
      actions.append(open, remove);

      item.append(text, actions);
      return item;
    }));
  }

  const rowOfFocus = () => [...list.children].findIndex(item => item.contains(document.activeElement));

  return {
    show(entries, currentId) {
      status.textContent = '';
      render(entries, currentId);
      if (!dialog.open) {
        dialog.showModal();
        shownAt = performance.now();
      }
    },
    // Redraw after a delete made here. Focus goes to the Delete button of the
    // row that took the deleted one's place (the one before it at the end of
    // the list), so that a keyboard user stays where they were working; to
    // Close when nothing is left.
    update(entries, currentId) {
      const row = rowOfFocus();
      render(entries, currentId);
      if (!dialog.open) return;
      const items = [...list.children];
      const next = row < 0 ? null : items[Math.min(row, items.length - 1)];
      (next?.querySelector('[data-action="delete"]') || close).focus();
    },
    // Redraw because the list changed elsewhere (another tab). Nothing here
    // was pressed, so an open dialog keeps focus on the button that had it,
    // or on Close if that row is gone.
    refresh(entries, currentId) {
      if (!dialog.open) return;
      const { id, action } = document.activeElement?.dataset ?? {};
      render(entries, currentId);
      const again = id && [...list.querySelectorAll('button')]
        .find(node => node.dataset.id === id && node.dataset.action === action);
      (again || close).focus();
    },
    // What just happened, said inside the dialog: while it is open the page
    // behind it is inert, and a status line there would reach nobody.
    say(message) {
      status.textContent = message;
    },
    isOpen: () => dialog.open,
    close() {
      if (dialog.open) dialog.close();
    }
  };
}
