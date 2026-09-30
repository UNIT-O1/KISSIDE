// Wires UI to core. Whitepaper 6.5 states: empty, loading, error, partial, result.
import './styles.css';
import { absorbShortBlocks, mergeBlocks } from './core/merge';
import { segmentRoute } from './core/segment';
import { summarize } from './core/summary';
import { flattenAndTime } from './core/timeline';
import type { LatLon } from './core/types';
import { originLocalToUtc } from './core/tz';
import { verdictFor } from './core/verdict';
import { geocode, type GeocodeResult } from './services/geocode';
import { HttpError } from './services/http';
import { getRoute, RouteError } from './services/route';
import { initForm, type TripInput } from './ui/form';
import { renderMap } from './ui/map';
import { renderTimeline } from './ui/timeline';
import { renderVerdict } from './ui/verdict';

class PlaceNotFoundError extends Error {
  constructor(readonly place: string) {
    super(`Couldn't find "${place}"`);
  }
}

async function resolvePlace(
  name: string,
  picked: GeocodeResult | undefined,
): Promise<GeocodeResult> {
  if (picked) return picked;
  const found = await geocode(name);
  const first = found[0];
  if (!first) throw new PlaceNotFoundError(name);
  return first;
}

function buildLayout(app: HTMLElement) {
  app.replaceChildren();

  const wordmark = document.createElement('p');
  wordmark.className = 'wordmark';
  wordmark.textContent = 'SunSide';

  const formContainer = document.createElement('div');
  const status = document.createElement('p');
  status.className = 'status';
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;

  const result = document.createElement('div');
  result.className = 'result';
  result.hidden = true;

  app.append(wordmark, formContainer, status, result);
  return { formContainer, status, result };
}

function setStatus(status: HTMLElement, kind: 'loading' | 'error' | 'partial' | null, text = '') {
  if (!kind) {
    status.hidden = true;
    status.textContent = '';
    status.className = 'status';
    return;
  }
  status.hidden = false;
  status.className = `status status-${kind}`;
  status.textContent = text;
}

function main() {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('#app not found');
  const { formContainer, status, result } = buildLayout(app);

  const handle = initForm(formContainer, async (input: TripInput) => {
    result.hidden = true;
    result.classList.remove('fade-in');
    handle.setBusy(true);

    try {
      setStatus(status, 'loading', `Finding ${input.from}…`);
      const from = await resolvePlace(input.from, input.fromPlace);
      setStatus(status, 'loading', `Finding ${input.to}…`);
      const to = await resolvePlace(input.to, input.toPlace);

      setStatus(status, 'loading', 'Working out the route…');
      const departure = originLocalToUtc(from, input.departureLocal);
      const steps = await getRoute(from, to);

      setStatus(status, 'loading', 'Checking the sun…');
      const points = flattenAndTime(steps);
      const segments = segmentRoute(points);
      const verdicts = segments.map((s) => verdictFor(s, departure.utc));
      const blocks = absorbShortBlocks(mergeBlocks(segments, verdicts));
      const summary = summarize(blocks);
      const totalSec = blocks.reduce((a, b) => a + b.durationSec, 0);

      setStatus(status, null);
      result.hidden = false; // unhide before rendering: Leaflet needs a laid-out container
      renderResult(result, points, blocks, summary, totalSec, input.mode, departure.usedDeviceZone);
      result.classList.add('fade-in');
    } catch (err) {
      setStatus(status, ...describeError(err, input));
    } finally {
      handle.setBusy(false);
    }
  });
}

function describeError(err: unknown, input: TripInput): ['error' | 'partial', string] {
  if (err instanceof PlaceNotFoundError) {
    return ['partial', `Couldn't find "${err.place}". Try adding a city or country.`];
  }
  if (err instanceof RouteError && err.kind === 'no-route') {
    return ['error', `Couldn't find a driving route between ${input.from} and ${input.to}.`];
  }
  if (err instanceof HttpError || err instanceof RouteError) {
    return ['error', 'The map or routing service is unavailable right now. Try again in a moment.'];
  }
  return ['error', 'Something went wrong. Try again.'];
}

function renderResult(
  result: HTMLElement,
  points: LatLon[],
  blocks: Parameters<typeof renderTimeline>[1],
  summary: Parameters<typeof renderVerdict>[1],
  totalSec: number,
  mode: TripInput['mode'],
  usedDeviceZone: boolean,
) {
  result.replaceChildren();

  if (usedDeviceZone) {
    const notice = document.createElement('p');
    notice.className = 'notice';
    notice.textContent =
      "Couldn't find the time zone at the origin; using your device's time zone instead.";
    result.append(notice);
  }

  const verdictEl = document.createElement('div');
  const timelineEl = document.createElement('div');
  const mapEl = document.createElement('div');
  mapEl.className = 'map';
  const assumptions = document.createElement('p');
  assumptions.className = 'assumptions';
  assumptions.textContent =
    'Assumes free-flowing traffic and a car. Weather, tinted glass, buildings and trees are not modelled.';

  result.append(verdictEl, timelineEl, mapEl, assumptions);

  renderVerdict(verdictEl, summary, totalSec, mode);
  renderTimeline(timelineEl, blocks, mode);
  renderMap(mapEl, points, blocks);
}

main();
