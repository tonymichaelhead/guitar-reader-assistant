// The list of saved studies, in a native modal <dialog> (which brings focus
// trapping and Escape-to-close for free).
import { describeBriefly, studyName } from './describe.js';

const DISARM_AFTER = 4000; // ms a Delete button stays armed, waiting for the second press

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function button(label, className) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `button button--quiet ${className || ''}`.trim();
  node.textContent = label;
  return node;
}

// Deleting is permanent, so the button asks for a second press: the first
// arms it, and it disarms by itself after a moment or when focus moves on.
function deleteButton(name, onConfirm) {
  const node = button('Delete', 'button--danger');
  node.setAttribute('aria-label', `Delete ${name}`);
  let timer = null;
  const disarm = () => {
    clearTimeout(timer);
    node.dataset.armed = 'false';
    node.textContent = 'Delete';
    node.setAttribute('aria-label', `Delete ${name}`);
  };
  node.addEventListener('click', () => {
    if (node.dataset.armed === 'true') {
      clearTimeout(timer);
      onConfirm();
      return;
    }
    node.dataset.armed = 'true';
    node.textContent = 'Really delete?';
    node.setAttribute('aria-label', `Really delete ${name}? Press again to confirm.`);
    timer = setTimeout(disarm, DISARM_AFTER);
  });
  node.addEventListener('blur', disarm);
  return node;
}

export function initLibraryDialog({ onOpen, onDelete }) {
  const dialog = document.getElementById('library');
  const list = document.getElementById('libraryList');
  const empty = document.getElementById('libraryEmpty');
  const close = document.getElementById('libraryClose');

  close.addEventListener('click', () => dialog.close());
  // A click on the backdrop lands on the dialog element itself.
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  function render(entries, currentId) {
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
      actions.append(open, deleteButton(studyName(entry.score), () => onDelete(entry)));

      item.append(text, actions);
      return item;
    }));
  }

  return {
    show(entries, currentId) {
      render(entries, currentId);
      if (!dialog.open) dialog.showModal();
    },
    // Redraw after a change; keeps keyboard focus inside the dialog.
    update(entries, currentId) {
      render(entries, currentId);
      if (dialog.open) close.focus();
    },
    close() {
      if (dialog.open) dialog.close();
    }
  };
}
