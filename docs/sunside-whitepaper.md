# SunSide: Whitepaper

**Version:** 0.1 (pre-build) · **License intent:** MIT, free, open source · **Audience:** the author, contributors, and Claude Code (as the build brief)

---

## 1. Summary

SunSide is a free, open-source, static web app that answers one question for ground travel:

> **Which side of the vehicle should I sit on, and when should I switch, so the sun stays out of my face?**

The user enters a start, a destination and a departure time. SunSide fetches the real road route, works out where the vehicle will be at each moment, computes the sun's position along the way, and returns a plain verdict ("Sit left") plus a timeline of side changes.

There is no backend, no account and no tracking. All computation happens in the browser, and trip data never leaves the device except for the calls to public geocoding and routing services.

---

## 2. Problem and positioning

### 2.1 The problem
Sun glare and heat in a moving vehicle depend on three things that change continuously: the vehicle's heading, the sun's azimuth, and the sun's elevation. People handle this with rules of thumb ("sit on the right going west"), and those rules fail on real roads, where the heading keeps changing.

### 2.2 What already exists (and what doesn't)
| Mode | Status | Decision |
|---|---|---|
| **Flights** | Solved. SunFlight (2011) and many blog how-tos cover it; there is also a strong rule of thumb for great-circle routes. Preferences are split (some want the sun), and window dimming complicates it. | Out of scope |
| **Trains** | Large windows and shades make it a minor issue. Only niche value for scenic routes. | Out of scope |
| **Road (car, bus, shared ride)** | No known tool that follows the actual road geometry and time. Windows are large, shades are rare, and heading changes constantly. | **The niche** |

### 2.3 Why it's worth building
- It fills a real gap rather than duplicating SunFlight.
- The math is well understood and fits in a few hundred lines.
- A free, private, no-signup tool is a coherent identity.
- Secondary value: warning **drivers** when low sun is directly ahead (a safety issue, not just comfort).

### 2.4 Honest limits of the idea
- It's a low-frequency tool: used once per trip. Success means being useful and easy to find, not retention.
- It models geometry only. It cannot know about clouds, tree cover, tall buildings, tinted glass, or the vehicle's window layout.

---

## 3. Goals and non-goals

**Goals**
1. Correct side recommendation for a single road trip, with side changes over time.
2. Zero cost to host and zero backend for v1.
3. Fast: result in under ~3 seconds on a normal connection.
4. Private by design: no analytics, no stored trips.
5. Minimal, clean, accessible UI.
6. Readable, well-tested code that others can contribute to.

**Non-goals (v1)**
- Flights, trains, ships, or bikes.
- Live traffic, live GPS tracking, or turn-by-turn navigation.
- Weather or cloud cover.
- Accounts, history, or social features.
- Native apps.

---

## 4. Core model

### 4.1 Pipeline

```
Inputs (from, to, departure)
   ↓
Geocode → coordinates              (Nominatim)
   ↓
Route → steps with geometry+time   (OSRM)
   ↓
Flatten → timed polyline           (cumulative time & distance per point)
   ↓
Segment → chunks of ~constant heading
   ↓
Sun position per segment midpoint  (azimuth, elevation at that place and time)
   ↓
Verdict per segment                (which side is exposed, how strongly)
   ↓
Smooth & merge → blocks
   ↓
Render: verdict, timeline, map
```

Each stage is a pure function with a defined input and output, in its own module, so it can be unit-tested with no network.

### 4.2 Timing the route
OSRM returns durations per step, not per point. Time at a point is **linearly interpolated by distance within its step**:

`t(point) = t(step start) + (distance into step / step length) × step duration`

*Assumption:* speed is constant within a step. This is reasonable because OSRM steps are short (a manoeuvre to the next manoeuvre) except on long highway stretches, where constant speed is also a fair approximation.

### 4.3 Segmentation
A new segment starts when **any** of the following is exceeded since the segment began:

| Rule | Value | Why this value |
|---|---|---|
| Heading drift | **> 18°** | Heading is measured as the bearing from the segment's start to the current point, compared with the segment's initial bearing. 18° is small enough that the sun's relative angle can't cross a verdict boundary unnoticed, but large enough not to split on every gentle curve. |
| Distance | **> 20 km** | Sun position (~15°/hour in azimuth on average) changes little over 20 km, and it caps the error on long straight roads. At highway speed, 20 km is about 12 minutes. |
| Time | **> 20 min** | Guards slow or long segments (rural roads, mountain roads) where distance alone would allow a long window. Over 20 minutes the sun moves roughly 5° in azimuth on average, well under the 40° boundary tolerance. |

*Tradeoff:* these are heuristics, not derived optima. Smaller values are more precise but produce more segments (and more noise). Larger values are smoother but miss short changes. They should be **constants in one config file**, and the test suite should confirm the verdict is stable when they vary by ±25%.

*Alternative considered:* sampling at fixed time intervals (e.g. every 5 minutes) with a heading computed over a sliding window. This is simpler and more uniform, and is a reasonable v2 refactor. The hybrid is kept in v1 because it works in the prototype and yields fewer, more meaningful segments.

*Minimum movement:* the initial bearing isn't set until the vehicle has moved more than **10 m**, which avoids noisy bearings from near-identical points.

### 4.4 Sun position
A self-contained implementation of a simplified NOAA/Meeus-style algorithm (~50 lines):

- Julian day → mean longitude and anomaly → ecliptic longitude → right ascension and declination.
- Greenwich mean sidereal time + longitude → hour angle.
- Convert to **elevation** and **azimuth** (0° = north, clockwise).

*Accuracy:* well within a degree for years around the present, far tighter than the ±40° decision boundaries. *Choice:* own module over SunCalc to keep zero dependencies, but **validate against SunCalc/NOAA values in tests** (the SunCalc library is an acceptable swap if maintenance becomes a burden).

*Not modelled:* atmospheric refraction (matters only near the horizon, and we treat elevation ≤ 0° as "dark" anyway).

### 4.5 Verdict per segment
Let `rel = normalize(sunAzimuth − heading)` into (−180°, 180°]. **Positive means the sun is to the right of the direction of travel.**

| Condition | Meaning | Why |
|---|---|---|
| elevation ≤ 0° | Dark. No recommendation. | No direct sun. |
| elevation > **58°** | "Overhead". No recommendation. | The roof blocks nearly all direct sun reaching seated passengers. Typical car roof and window geometry cuts off somewhere in the 55–65° range; 58° is a mid-range assumption. |
| 40° ≤ rel ≤ 140° | Sun on the **right** | Side windows exposed. |
| −140° ≤ rel ≤ −40° | Sun on the **left** | Side windows exposed. |
| otherwise | Sun ahead or behind. No side preference. | Ahead is a driver issue (see 4.8). Behind is harmless. |
| elevation < **20°** | **Strong** glare flag | Low sun enters windows and eyes at a shallow angle; above 20° it's still noticeable but the roof and pillars block more. |

*Tradeoffs:* the ±40° "ahead/behind" cone is a judgment call. A narrower cone treats more of the trip as "side sun", a wider one treats more as "doesn't matter". 40° corresponds roughly to the edge of what a passenger's side window can receive from a forward-facing seat. All thresholds live in the config file.

### 4.6 Sign convention: **fixing the prototype's bug**
The prototype labelled a block "right" when the sun was on the right, and then told the user to "sit right". **That is inverted.** The user wants the shaded side.

**Decision:** the model works in *sun side*. The **recommendation is the opposite side.** A user toggle, **"Avoid the sun / Seek the sun"**, flips the recommendation, because some passengers want the sun (photography, warmth). Default is *avoid*. The toggle is a pure view-layer flip; it needs no recomputation.

### 4.7 Merging and smoothing
1. Consecutive segments with the same sun side merge into one block.
2. **New:** blocks shorter than **5 minutes** are absorbed into their neighbours (the longer neighbour wins). Without this, the count of "seat switches" is dominated by noise: nobody moves seats for 90 seconds of sun.
3. Consecutive "no preference" blocks merge.

*Assumption:* 5 minutes is the shortest interval for which a seat change is worth mentioning.

### 4.8 Overall recommendation
- Total exposed time for each side is summed across blocks.
- If one side has at least **1.3×** the exposure of the other (or the other is zero), recommend the opposite of the more-exposed side ("Sit left").
- If neither side dominates, say **"It's close: plan to switch"** and rely on the timeline.
- If there is no side exposure, say **"Doesn't matter"**.

*The 1.3× ratio* is a judgment call. It stops a 55/45 split from producing a confident "sit left". It's a config constant.

*Driver mode (v1.1):* when the sun is **ahead** (|rel| < 40°) and elevation is **< 20°**, flag "low sun ahead" for drivers. This is a warning, not a seating recommendation.

### 4.9 Time zones (a known prototype weakness)
The prototype reads `datetime-local` in the **device's** time zone and applies it to the whole trip. That's wrong if the user is planning a trip somewhere else.

**Decision (v1):** interpret the departure time as **local time at the origin**, resolved with a small, offline lat/lon→IANA-zone lookup (e.g. `tz-lookup`, ~50 KB) plus `Intl.DateTimeFormat`. The sun calculation itself uses absolute UTC time, so once the departure instant is right, the rest of the trip is correct even across zones. If the lookup fails, fall back to the device zone and show a small notice.

*Tradeoff:* adds one dependency. Alternatives (asking the user to pick a zone, or a public timezone API) are worse on UX or on privacy.

---

## 5. Architecture

### 5.1 Principles
1. **Static first, proxy-ready.** No server in v1, but every network call goes through one module so a proxy can be added with a one-line change.
2. **Pure core, thin shell.** The `core/` modules have no DOM and no network. The UI just calls them.
3. **Config over magic numbers.** Every threshold in section 4 lives in `config.ts`.
4. **Small dependency budget.** Leaflet and one timezone lookup. Nothing else at runtime.

### 5.2 Stack and choices

| Concern | Choice | Alternatives | Tradeoff |
|---|---|---|---|
| Language | **TypeScript** | Plain JS | Types catch the sign and unit errors this app is prone to (degrees vs radians, left vs right). Slight build overhead. |
| Build | **Vite** | None, or webpack | Fast, near-zero config, static output. |
| UI | **Vanilla TS + small render functions** | React/Svelte | The UI is one form and one result view. A framework isn't worth its size or contributor onboarding cost. |
| Map | **Leaflet** with grayscale tile filter | MapLibre GL | Leaflet is small and simple. MapLibre gives prettier vector styling but is heavier and needs a style and tile source. Leaflet plus a CSS filter meets the minimal look. |
| Tests | **Vitest** | Jest | Native to Vite. |
| Hosting | **GitHub Pages** or Cloudflare Pages | Netlify, Vercel | Free and static. |
| Lint/format | ESLint + Prettier | none | Contributor consistency. |

### 5.3 Repository layout

```
sunside/
├─ index.html
├─ src/
│  ├─ main.ts                 # wires UI to core
│  ├─ config.ts               # ALL thresholds & constants (section 4)
│  ├─ core/
│  │  ├─ geo.ts               # toRad, bearing, haversine, angle helpers
│  │  ├─ sun.ts               # sunPosition(lat, lon, date)
│  │  ├─ timeline.ts          # flattenAndTime(steps)
│  │  ├─ segment.ts           # segmentRoute(points)
│  │  ├─ verdict.ts           # verdictFor(segment, date)
│  │  ├─ merge.ts             # mergeBlocks + short-block absorption
│  │  ├─ summary.ts           # overall recommendation, switch count
│  │  └─ tz.ts                # origin-local time → UTC instant
│  ├─ services/               # ALL network access lives here
│  │  ├─ geocode.ts           # Nominatim (swappable)
│  │  ├─ route.ts             # OSRM (swappable)
│  │  └─ http.ts              # fetch wrapper: timeout, retry, base URLs
│  ├─ ui/
│  │  ├─ form.ts
│  │  ├─ verdict.ts
│  │  ├─ timeline.ts
│  │  ├─ map.ts
│  │  └─ share.ts             # URL-hash state
│  └─ styles.css
├─ tests/
│  ├─ sun.test.ts
│  ├─ verdict.test.ts
│  ├─ segment.test.ts
│  └─ fixtures/               # saved OSRM responses for offline tests
├─ README.md
├─ LICENSE
└─ vite.config.ts
```

### 5.4 Key interfaces (contract for Claude Code)

```ts
type LatLon = { lat: number; lon: number };
type TimedPoint = LatLon & { cumTime: number; cumDist: number }; // s, m
type Segment = { points: TimedPoint[]; startTime: number; endTime: number;
                 durationSec: number; bearing: number };
type SunSide = 'left' | 'right' | 'none' | 'dark';
type Verdict = { sunSide: SunSide; strong: boolean; reason: string };
type Block = { sunSide: SunSide; durationSec: number; startSec: number;
               points: LatLon[]; strong: boolean };
type Summary = { avoidSide: 'left'|'right'|'either'|'switch';
                 leftSec: number; rightSec: number; switches: number };
```

`services/*` return plain data. `core/*` never import from `services/` or `ui/`.

### 5.5 External services and their limits

| Service | Use | Limits and risk | Mitigation |
|---|---|---|---|
| **Nominatim** (public) | Geocode place → lat/lon | Usage policy discourages heavy or autocomplete-style use and requires an identifying `Referer`/attribution and roughly ≤1 req/s. | **Search on submit or on an explicit "search" action, or debounce at ≥ 800 ms with a min of 4 chars.** Cache results in memory. Photon or Geoapify as fallback providers. |
| **OSRM demo** | Driving route + steps | No SLA, may rate-limit or go down, car profile only, long routes may be slow. | One retry with backoff. Clear error message. Swap `services/route.ts` to OpenRouteService or self-hosted OSRM if needed. |
| **OSM tiles** | Map | Also has a tile usage policy. | Attribution, no bulk loading. Switch to Carto or MapTiler free tier if traffic grows. |

**Static-first decision:** all three are called directly from the browser (they support CORS). When any of them becomes the bottleneck, a tiny caching proxy (Cloudflare Worker) sits in front, and only `http.ts` base URLs change.

### 5.6 Privacy
- No analytics, cookies, or accounts.
- Trips exist only in memory and (optionally) in the shareable URL hash, which stays on the client.
- The only outbound requests are to the three services above. The README states this plainly.

### 5.7 Shareable links
Encode the trip in the URL hash: `#f=lat,lon&t=lat,lon&d=ISO&m=avoid`. Opening it rebuilds the result.

*Tradeoff:* coordinates in a URL reveal the trip to whoever the user shares it with, which is the point, and it's opt-in via a "Copy link" button.

---

## 6. UI and design direction

### 6.1 Intent
Calm, typographic, and instrument-like, closer to a well-made utility than to a typical AI-generated app. **Explicitly avoid:** dark-navy gradients, glowing accents, rounded "cards in cards", ticket-stub motifs, emoji, and decorative eyebrows or badges.

### 6.2 Principles
1. **One idea per screen:** the verdict is the hero.
2. **Type does the work.** No icons except a small map marker and a swap button.
3. **Monochrome plus one accent.** Colour is never the only carrier of meaning.
4. **Hairlines, not shadows.** 1px borders, no gradients, no blur.
5. **Generous whitespace,** single column, max width ~560 px.

### 6.3 Tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#FAFAF8` | `#111111` |
| `--ink` | `#151515` | `#EDEDEA` |
| `--muted` | `#6B6B66` | `#8E8E88` |
| `--line` | `#DEDED8` | `#2A2A28` |
| `--accent` | `#D9480F` (burnt orange) | `#FF7A3D` |

- **Type:** system UI stack (`ui-sans-serif, system-ui, …`) for text; `ui-monospace` only for times and durations. No web fonts (faster, private, no external requests).
- **Scale:** 13 / 15 / 20 / 64 px (labels, body, section heads, verdict).
- **Radius:** 2 px. **Spacing:** 4 px base grid. **Motion:** none beyond a 120 ms colour transition and a fade on the result.
- Dark mode via `prefers-color-scheme`, no toggle.

### 6.4 Layout

```
SunSide                                     (wordmark, small, left)

From  [ ______________________ ]
To    [ ______________________ ]
When  [ 2026-09-28  14:30 ]     ○ Avoid sun  ○ Seek sun
[ Check ]                                   (solid ink button, square)

────────────────────────────────────────────
Sit LEFT                                    (64px verdict)
Sun hits the right side for 2h 10m of 3h 05m.

Timeline
[■■■■■■■□□□□■■■■■]   L = sit left   R = sit right   – = either
 0:00   L   1:05                                    (rows below)
 1:05   –   0:20
 1:25   R   0:40

Route
[ grayscale map, route in ink, "sit-here" segments in accent ]
────────────────────────────────────────────
Assumes free-flowing traffic ... (small, muted)
```

- The verdict word is the only large element. The timeline uses **letters (L / R / –) plus fill pattern** (solid, hatched, empty) so it works without colour.
- Route line: ink for neutral, accent for stretches where a specific side matters. Two-colour left/right coding is deliberately dropped.
- Map: raster tiles with `filter: grayscale(1) contrast(.9)`, tiny attribution.

### 6.5 States
Empty, loading (single-line status text, `aria-live="polite"`), error (plain sentence, muted, no red banners), result, partial ("couldn't find that place, try adding a city").

### 6.6 Accessibility
Labels bound to inputs, full keyboard operation of suggestion lists, focus rings, AA contrast in both themes, verdict announced via live region, no meaning by colour alone.

---

## 7. Assumptions register

| # | Assumption | Value | Risk if wrong | Where it lives |
|---|---|---|---|---|
| A1 | Heading-drift split | 18° | Too many or too few segments | `config.ts` |
| A2 | Max segment distance | 20 km | Missed changes on curvy highways | `config.ts` |
| A3 | Max segment time | 20 min | Same, on slow roads | `config.ts` |
| A4 | Side-window cone | 40°–140° relative | Mislabels near-front or near-rear sun | `config.ts` |
| A5 | Overhead cutoff | 58° elevation | Real vehicles vary (roof, glass) | `config.ts` |
| A6 | Strong glare | < 20° elevation | Subjective | `config.ts` |
| A7 | Dominance ratio | 1.3× | Too eager or too hedgy verdicts | `config.ts` |
| A8 | Minimum block | 5 min | Hides brief changes | `config.ts` |
| A9 | Constant speed within a step | n/a | Small timing error | `timeline.ts` |
| A10 | Free-flowing traffic, car profile | n/a | Bus/traffic trips run longer, so the sun moves | README limits note |
| A11 | Forward-facing seat, driver seat ignored | n/a | Rear-facing seats, sideways seats | README |
| A12 | Sun blocked by nothing but roof | n/a | Clouds, trees, buildings, tint | README |
| A13 | Departure time = origin local time | n/a | Wrong if the user meant device time | UI helper text |
| A14 | Great-circle bearing between nearby points ≈ road heading | n/a | Tiny error over short spans | `geo.ts` |

Every value in A1–A8 is a **default**, not a truth. The README should say so.

---

## 8. Tradeoffs and decisions log

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Scope | Road only | Flights, trains | Others solved or low-value |
| Backend | None (proxy-ready) | Server with cache | Free, private, simple; proxy if traffic demands |
| Framework | None | React/Svelte | UI is small; fewer deps |
| Language | TypeScript | JS | Unit and sign errors |
| Sun math | Own module, tested vs reference | SunCalc | Zero-dep; swap allowed |
| Map | Leaflet + gray filter | MapLibre | Simplicity and bundle size |
| Segmentation | Hybrid (heading / 20 km / 20 min) | Fixed 5 min sampling | Fewer, meaningful segments; revisit in v2 |
| Recommendation | Opposite of sun side, with a "seek sun" toggle | Show sun side only | Users want an action, not a diagram |
| Time zone | Origin-local via tz lookup | Device zone | Correctness for trips elsewhere |
| Fonts | System stack | Web fonts | Speed, privacy, no requests |
| Colour | Monochrome + 1 accent, letters and patterns | Left/right hue coding | Accessibility, minimal look |
| Autocomplete | Debounced, ≥ 4 chars, cached | Instant per-keystroke | Respect Nominatim policy |
| Analytics | None | Any | Privacy is a feature |

---

## 9. Testing strategy

**Unit (offline, deterministic):**
- `sun.ts`: compare against reference values (e.g. equinox solar noon at the equator ≈ 90° elevation; sunrise azimuth near 90° at equinox on the equator; a few known city/time pairs from NOAA).
- `verdict.ts` golden cases:
  - Heading north, sun in the east at 30° elevation → sun on **right** → recommend **left**.
  - Heading east at sunrise → sun **ahead** → no side preference.
  - Heading west, afternoon at 40° → sun **ahead**; heading south, afternoon west → sun on **right**.
  - Elevation 70° → "overhead", none. Elevation −5° → dark.
- `segment.ts`: a straight line yields segments limited only by the distance and time caps. A 90° turn splits.
- `merge.ts`: a 2-minute flip inside a long block disappears. Switch count matches expectations.
- Stability: verdict for a fixture route unchanged when A1–A3 vary ±25%.

**Integration:** saved OSRM fixtures (a short city trip, a long highway trip, a winding mountain road) run end to end with the network mocked.

**Manual:** compare against a real trip at least once at sunrise and once at sunset.

---

## 10. Risks

| Risk | Likelihood | Impact | Response |
|---|---|---|---|
| Public OSRM/Nominatim throttling or outage | Medium | High | Provider module, retry, proxy path, clear errors |
| User distrust after one wrong call (clouds, tint) | Medium | Medium | Honest limits copy; show reasoning ("sun on the right, 22° high") |
| Sign confusion (left/right) | High if untested | High | Golden tests, plain-language explanation, "why?" line |
| Time-zone errors | Medium | Medium | Origin-local input, visible confirmation of zone |
| Thresholds feel wrong to some | High | Low | Config constants, documented, easy to tune |

---

## 11. Roadmap

**v1.0 (this build):** road route, correct sign, origin-local time, block smoothing, minimal UI, share link, "seek sun" toggle, tests, GitHub Pages deploy.

**v1.1:** driver low-sun-ahead warning, mid-trip departure ("I'm here now"), print-friendly view.

**v1.2:** alternative routes side by side, optional bus/slow-traffic pace factor.

**v2:** fixed-interval segmentation refactor, optional cloud-cover layer (open weather data), embeddable widget, proxy for caching.

---

## 12. Build brief for Claude Code

**Working rules**
1. Follow the repository layout in 5.3. `core/` stays pure (no DOM, no fetch).
2. All numbers from section 4 and 7 go in `config.ts` with comments.
3. All network access goes through `services/`. Never call `fetch` elsewhere.
4. Use the sign convention in 4.6. The verdict shows the **recommended** side; internals track **sun side**.
5. Follow the UI section literally: no gradients, shadows, emoji, or new colours.
6. Keep runtime dependencies to Leaflet and the timezone lookup. Ask before adding more.

**Milestones (each with acceptance criteria)**
1. **Scaffold:** Vite + TS + Vitest + lint. `npm run dev`, `test` and `build` succeed.
2. **Core math:** `geo`, `sun`, `timeline`, `segment`, `verdict`, `merge`, `summary`, `tz` with the tests in section 9 passing offline.
3. **Services:** geocode and route with timeouts, one retry, caching, and fixture-backed tests.
4. **UI:** form, verdict, timeline, map per section 6, all states, dark mode, keyboard support.
5. **Share and polish:** URL-hash state, error copy, README (usage, limits, privacy, assumptions table), LICENSE.
6. **Deploy:** GitHub Pages workflow, Lighthouse accessibility ≥ 95.

**Definition of done for v1:** all tests pass, the prototype's inverted-side bug is covered by a regression test, a sample sunrise trip and a sample sunset trip give sensible answers, and the README states every assumption in section 7.

---

## 13. Attribution and data notes
Route data © OpenStreetMap contributors via OSRM; geocoding via Nominatim; map tiles per the OSM tile usage policy. SunFlight is referenced only as prior art for the flight case.
