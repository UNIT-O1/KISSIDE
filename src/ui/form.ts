// Trip input form. Whitepaper 6.4, 6.6.
import { createSuggester, type GeocodeResult } from '../services/geocode';

export type TripInput = {
  from: string;
  to: string;
  fromPlace: GeocodeResult | undefined;
  toPlace: GeocodeResult | undefined;
  departureLocal: string;
  mode: 'avoid' | 'seek';
};

export type FormHandle = {
  setBusy(busy: boolean): void;
};

type LocationField = {
  wrapper: HTMLElement;
  input: HTMLInputElement;
  getValue(): string;
  getResolved(): GeocodeResult | undefined;
  setValue(value: string, resolved: GeocodeResult | undefined): void;
};

let nextId = 0;

/** An accessible combobox: free text with a debounced, keyboard-navigable place list. */
function createLocationField(labelText: string): LocationField {
  const id = `sunside-loc-${nextId++}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'location-field';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.autocomplete = 'off';
  input.required = true;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-listbox`);
  input.setAttribute('aria-label', labelText);

  const listbox = document.createElement('ul');
  listbox.id = `${id}-listbox`;
  listbox.className = 'listbox';
  listbox.role = 'listbox';
  listbox.hidden = true;

  wrapper.append(input, listbox);

  let results: GeocodeResult[] = [];
  let activeIndex = -1;
  let resolved: GeocodeResult | undefined;

  const closeList = () => {
    listbox.hidden = true;
    listbox.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  };

  const setActive = (index: number) => {
    activeIndex = index;
    [...listbox.children].forEach((li, i) => li.classList.toggle('active', i === index));
    if (index >= 0) input.setAttribute('aria-activedescendant', `${id}-opt-${index}`);
    else input.removeAttribute('aria-activedescendant');
  };

  const select = (index: number) => {
    const place = results[index];
    if (!place) return;
    resolved = place;
    input.value = place.displayName;
    closeList();
  };

  const openList = (found: GeocodeResult[]) => {
    // A debounced search can resolve after the user has already moved on (e.g. clicked
    // Check); don't pop the list open over content that's no longer related to this field.
    if (document.activeElement !== input) return;
    results = found;
    listbox.replaceChildren();
    if (found.length === 0) {
      closeList();
      return;
    }
    found.forEach((place, i) => {
      const li = document.createElement('li');
      li.id = `${id}-opt-${i}`;
      li.role = 'option';
      li.textContent = place.displayName;
      li.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus on input
      li.addEventListener('click', () => select(i));
      listbox.append(li);
    });
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  };

  const suggester = createSuggester(
    (_query, found) => openList(found),
    () => closeList(),
  );

  input.addEventListener('input', () => {
    resolved = undefined;
    suggester.input(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (listbox.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((activeIndex + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      select(activeIndex);
    } else if (e.key === 'Escape') {
      closeList();
    }
  });

  wrapper.addEventListener('focusout', (e) => {
    if (!wrapper.contains(e.relatedTarget as Node | null)) closeList();
  });

  return {
    wrapper,
    input,
    getValue: () => input.value.trim(),
    getResolved: () => resolved,
    setValue(value, place) {
      input.value = value;
      resolved = place;
    },
  };
}

export function initForm(container: HTMLElement, onSubmit: (input: TripInput) => void): FormHandle {
  const form = document.createElement('form');

  const fromField = createLocationField('From');
  const fromRow = document.createElement('div');
  fromRow.className = 'field';
  const fromLabel = document.createElement('label');
  fromLabel.htmlFor = fromField.input.id;
  fromLabel.textContent = 'From';
  fromRow.append(fromLabel, fromField.wrapper);

  const toField = createLocationField('To');
  const toRow = document.createElement('div');
  toRow.className = 'field';
  const toLabel = document.createElement('label');
  toLabel.htmlFor = toField.input.id;
  toLabel.textContent = 'To';
  toRow.append(toLabel, toField.wrapper);

  const swapButton = document.createElement('button');
  swapButton.type = 'button';
  swapButton.className = 'swap-button';
  swapButton.textContent = '⇆'; // ⇆, whitepaper 6.2's one allowed non-marker icon
  swapButton.setAttribute('aria-label', 'Swap from and to');
  swapButton.addEventListener('click', () => {
    const fromValue = fromField.getValue();
    const fromPlace = fromField.getResolved();
    fromField.setValue(toField.getValue(), toField.getResolved());
    toField.setValue(fromValue, fromPlace);
  });

  const whenRow = document.createElement('div');
  whenRow.className = 'field';
  const whenLabel = document.createElement('label');
  const whenInput = document.createElement('input');
  whenInput.type = 'datetime-local';
  whenInput.id = 'sunside-when';
  whenInput.required = true;
  whenLabel.htmlFor = whenInput.id;
  whenLabel.textContent = 'When';

  const modeGroup = document.createElement('div');
  modeGroup.className = 'mode-group';
  const avoidLabel = document.createElement('label');
  const avoidInput = document.createElement('input');
  avoidInput.type = 'radio';
  avoidInput.name = 'sunside-mode';
  avoidInput.value = 'avoid';
  avoidInput.checked = true;
  avoidLabel.append(avoidInput, document.createTextNode('Avoid sun'));
  const seekLabel = document.createElement('label');
  const seekInput = document.createElement('input');
  seekInput.type = 'radio';
  seekInput.name = 'sunside-mode';
  seekInput.value = 'seek';
  seekLabel.append(seekInput, document.createTextNode('Seek sun'));
  modeGroup.append(avoidLabel, seekLabel);

  const whenControls = document.createElement('div');
  whenControls.className = 'when-row';
  whenControls.append(whenInput, modeGroup);
  whenRow.append(whenLabel, whenControls);

  const submitRow = document.createElement('div');
  submitRow.className = 'submit-row';
  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Check';
  submitRow.append(submitButton);

  form.append(fromRow, swapButton, toRow, whenRow, submitRow);
  container.append(form);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const mode = (form.querySelector('input[name="sunside-mode"]:checked') as HTMLInputElement)
      .value;
    onSubmit({
      from: fromField.getValue(),
      to: toField.getValue(),
      fromPlace: fromField.getResolved(),
      toPlace: toField.getResolved(),
      departureLocal: whenInput.value,
      mode: mode === 'seek' ? 'seek' : 'avoid',
    });
  });

  return {
    setBusy(busy) {
      [
        fromField.input,
        toField.input,
        whenInput,
        avoidInput,
        seekInput,
        submitButton,
        swapButton,
      ].forEach((el) => (el.disabled = busy));
      submitButton.textContent = busy ? 'Checking…' : 'Check';
    },
  };
}
