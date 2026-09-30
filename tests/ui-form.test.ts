import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GEOCODE_DEBOUNCE_MS, NOMINATIM_MIN_INTERVAL_MS } from '../src/config';
import { clearGeocodeCache } from '../src/services/geocode';
import { clearHttpCache } from '../src/services/http';
import { initForm, type TripInput } from '../src/ui/form';
import ZARAGOZA from './fixtures/nominatim-zaragoza.json';
import { mockFetch } from './mockFetch';

function setup() {
  const container = document.createElement('div');
  document.body.append(container);
  const onSubmit = vi.fn<(input: TripInput) => void>();
  const handle = initForm(container, onSubmit);
  return {
    container,
    onSubmit,
    handle,
    from: container.querySelector<HTMLInputElement>('[aria-label="From"]')!,
    to: container.querySelector<HTMLInputElement>('[aria-label="To"]')!,
    when: container.querySelector<HTMLInputElement>('#sunside-when')!,
    swap: container.querySelector<HTMLButtonElement>('.swap-button')!,
    submit: container.querySelector<HTMLButtonElement>('button[type="submit"]')!,
    form: container.querySelector('form')!,
  };
}

function fillAndSubmit(ui: ReturnType<typeof setup>, from: string, to: string, when: string) {
  ui.from.value = from;
  ui.to.value = to;
  ui.when.value = when;
  ui.form.dispatchEvent(new Event('submit', { cancelable: true }));
}

/** Simulates typing: real input events only fire debounced searches while the field is focused. */
function type(input: HTMLInputElement, value: string) {
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

beforeEach(() => {
  clearGeocodeCache();
  clearHttpCache();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('initForm layout and labels (whitepaper 6.6: labels bound to inputs)', () => {
  test('From, To and When each have a bound, accessible label', () => {
    const ui = setup();
    const whenLabel = ui.container.querySelector('label[for="sunside-when"]');
    expect(whenLabel?.textContent).toBe('When');
    expect(ui.from.getAttribute('role')).toBe('combobox');
    expect(ui.to.getAttribute('role')).toBe('combobox');
  });

  test('Avoid sun is the default mode', () => {
    const ui = setup();
    const avoid = ui.container.querySelector<HTMLInputElement>('input[value="avoid"]')!;
    expect(avoid.checked).toBe(true);
  });
});

describe('submitting', () => {
  test('reports the typed values and mode, with no resolved place yet', () => {
    const ui = setup();
    fillAndSubmit(ui, 'Madrid', 'Zaragoza', '2026-06-21T09:00');
    expect(ui.onSubmit).toHaveBeenCalledWith({
      from: 'Madrid',
      to: 'Zaragoza',
      fromPlace: undefined,
      toPlace: undefined,
      departureLocal: '2026-06-21T09:00',
      mode: 'avoid',
    });
  });

  test('does not reload the page', () => {
    const ui = setup();
    const event = new Event('submit', { cancelable: true });
    ui.from.value = 'A';
    ui.to.value = 'B';
    ui.when.value = '2026-01-01T00:00';
    ui.form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  test('seek sun is reported when selected', () => {
    const ui = setup();
    ui.container.querySelector<HTMLInputElement>('input[value="seek"]')!.click();
    fillAndSubmit(ui, 'A', 'B', '2026-01-01T00:00');
    expect(ui.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'seek' }));
  });
});

describe('setBusy', () => {
  test('disables the fields and relabels the submit button', () => {
    const ui = setup();
    ui.handle.setBusy(true);
    expect(ui.from.disabled).toBe(true);
    expect(ui.to.disabled).toBe(true);
    expect(ui.when.disabled).toBe(true);
    expect(ui.submit.disabled).toBe(true);
    expect(ui.submit.textContent).toBe('Checking…');

    ui.handle.setBusy(false);
    expect(ui.from.disabled).toBe(false);
    expect(ui.submit.textContent).toBe('Check');
  });
});

describe('swap button', () => {
  test('swaps the text between From and To', () => {
    const ui = setup();
    ui.from.value = 'Madrid';
    ui.to.value = 'Zaragoza';
    ui.swap.click();
    expect(ui.from.value).toBe('Zaragoza');
    expect(ui.to.value).toBe('Madrid');
  });

  test('is reachable by keyboard and has an accessible label', () => {
    const ui = setup();
    expect(ui.swap.getAttribute('aria-label')).toBe('Swap from and to');
    expect(ui.swap.type).toBe('button'); // does not submit the form
  });

  test('swaps the resolved place along with the text', async () => {
    mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS + NOMINATIM_MIN_INTERVAL_MS);
    ui.container
      .querySelector('[role="option"]')!
      .dispatchEvent(new Event('click', { bubbles: true }));

    ui.to.value = 'Madrid';
    ui.swap.click();
    fillAndSubmit(ui, ui.from.value, ui.to.value, '2026-06-21T09:00');
    const call = ui.onSubmit.mock.calls[0]![0];
    expect(call.to).toContain('Zaragoza');
    expect(call.toPlace).toBeDefined();
    expect(call.fromPlace).toBeUndefined();
  });
});

describe('location suggestions (whitepaper 6.6: full keyboard operation of suggestion lists)', () => {
  test('typing debounces before searching, and shows results as options', async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zaragoza');

    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS - 1);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    const options = ui.container.querySelectorAll('[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    expect(ui.from.getAttribute('aria-expanded')).toBe('true');
  });

  test('fewer than 4 characters never opens the list', async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zar');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS * 3);
    expect(fetch).not.toHaveBeenCalled();
    expect(ui.from.getAttribute('aria-expanded')).toBe('false');
  });

  test('ArrowDown/ArrowUp move the active option, wrapping at the ends', async () => {
    mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS);

    const options = [...ui.container.querySelectorAll('[role="option"]')];
    const down = () => ui.from.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const up = () => ui.from.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));

    down();
    expect(options[0]!.classList.contains('active')).toBe(true);
    expect(ui.from.getAttribute('aria-activedescendant')).toBe(options[0]!.id);

    up(); // from option 0, wraps to the last option
    expect(options.at(-1)!.classList.contains('active')).toBe(true);
    expect(ui.from.getAttribute('aria-activedescendant')).toBe(options.at(-1)!.id);
  });

  test('Enter on a highlighted option selects it and closes the list', async () => {
    mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS);

    const firstOption = ui.container.querySelector('[role="option"]')!;
    const expectedName = firstOption.textContent;
    ui.from.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    ui.from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));

    expect(ui.from.value).toBe(expectedName);
    expect(ui.from.getAttribute('aria-expanded')).toBe('false');
    expect(ui.container.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  test('Escape closes the list without changing the typed text', async () => {
    mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS);

    ui.from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ui.from.value).toBe('Zaragoza');
    expect(ui.from.getAttribute('aria-expanded')).toBe('false');
  });

  test('clicking an option selects it', async () => {
    mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS);

    const option = ui.container.querySelector('[role="option"]')!;
    const name = option.textContent;
    option.dispatchEvent(new Event('click', { bubbles: true }));
    expect(ui.from.value).toBe(name);
  });

  test('typing after selecting clears the resolved place, requiring re-resolution', async () => {
    mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS);
    ui.container
      .querySelector('[role="option"]')!
      .dispatchEvent(new Event('click', { bubbles: true }));

    ui.to.value = 'Madrid';
    fillAndSubmit(ui, ui.from.value, ui.to.value, '2026-06-21T09:00');
    expect(ui.onSubmit.mock.calls[0]![0].fromPlace).toBeDefined();

    ui.onSubmit.mockClear();
    type(ui.from, ui.from.value + 'x');
    fillAndSubmit(ui, ui.from.value, ui.to.value, '2026-06-21T09:00');
    expect(ui.onSubmit.mock.calls[0]![0].fromPlace).toBeUndefined();
  });

  test('moving focus away from the field closes the list', async () => {
    mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS);
    expect(ui.from.getAttribute('aria-expanded')).toBe('true');

    ui.from.dispatchEvent(new FocusEvent('focusout', { relatedTarget: ui.to, bubbles: true }));
    expect(ui.from.getAttribute('aria-expanded')).toBe('false');
  });

  test('a search that resolves after focus has moved on does not reopen the list', async () => {
    mockFetch({ body: ZARAGOZA });
    const ui = setup();
    type(ui.from, 'Zaragoza');
    ui.from.dispatchEvent(new FocusEvent('focusout', { relatedTarget: ui.submit, bubbles: true }));
    ui.submit.focus();

    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS + NOMINATIM_MIN_INTERVAL_MS);

    expect(ui.from.getAttribute('aria-expanded')).toBe('false');
    expect(ui.container.querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});
