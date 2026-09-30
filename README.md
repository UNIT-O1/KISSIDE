# SunSide

Free, open-source, static web app that tells road passengers which side of
the vehicle to sit on to avoid the sun.

You enter a start, a destination and a departure time. SunSide fetches the
real road route, works out where the vehicle will be at each moment, computes
the sun's position along the way, and returns a plain verdict ("Sit LEFT")
plus a timeline of side changes.

There is no backend, no account and no tracking. Everything runs in your
browser; the only network calls are to the geocoding, routing and map-tile
services listed below.

## Using it

Open the app, enter where you're starting from and where you're going, pick
a departure date and time, and choose whether you want to avoid the sun or
sit in it. The departure time is interpreted as **local time at the
starting point**, not your device's time zone.

## Running it locally

Requires Node.js 20+.

```bash
npm install
npm run dev      # local dev server
npm test         # run the test suite (offline, no network needed)
npm run build    # production build to dist/
npm run lint     # ESLint
```

## How it works

```
Inputs (from, to, departure)
   -> Geocode -> coordinates              (Nominatim)
   -> Route -> steps with geometry+time   (OSRM)
   -> Flatten -> timed polyline
   -> Segment -> chunks of ~constant heading
   -> Sun position per segment midpoint
   -> Verdict per segment (which side is exposed, how strongly)
   -> Smooth & merge -> blocks
   -> Render: verdict, timeline, map
```

Each stage is a pure function in `src/core/`, unit-tested offline. Network
access is isolated to `src/services/`. See [CLAUDE.md](CLAUDE.md) and
[docs/sunside-whitepaper.md](docs/sunside-whitepaper.md) for the full design.

## Assumptions

The model is geometry only: it cannot know about clouds, tree cover, tall
buildings, tinted glass, or the vehicle's window layout. Every threshold
below is a **default**, not a measured truth, and lives in
[src/config.ts](src/config.ts) so it can be tuned.

| # | Assumption | Value | Risk if wrong |
|---|---|---|---|
| A1 | Heading-drift segment split | 18° | Too many or too few segments |
| A2 | Max segment distance | 20 km | Missed changes on curvy highways |
| A3 | Max segment time | 20 min | Missed changes on slow roads |
| A4 | Side-window cone (relative to heading) | 40°-140° | Mislabels near-front or near-rear sun |
| A5 | Overhead cutoff (roof blocks the sun) | 58° elevation | Real vehicles vary (roof, glass) |
| A6 | Strong-glare threshold | < 20° elevation | Subjective |
| A7 | Dominance ratio for a confident verdict | 1.3x | Too eager or too hedgy verdicts |
| A8 | Minimum block duration (shorter blocks are absorbed) | 5 min | Hides brief changes |
| A9 | Constant speed within one route step | - | Small timing error |
| A10 | Free-flowing traffic, car driving profile | - | Bus or heavy-traffic trips run longer, so the sun moves further than assumed |
| A11 | Forward-facing seat; the driver's seat isn't modelled | - | Rear-facing or sideways seats aren't covered |
| A12 | Nothing blocks the sun but the vehicle's roof | - | Clouds, trees, buildings and tinted glass aren't modelled |
| A13 | Departure time is local time at the origin | - | Wrong if you meant your own device's time zone |
| A14 | A straight-line bearing between nearby route points approximates the road heading | - | Small error over short spans |

## External services and their limits

| Service | Use | Limits |
|---|---|---|
| [Nominatim](https://nominatim.org/) | Geocoding (place name -> coordinates) | Public usage policy: roughly 1 request/second. The app debounces searches and caches results to stay within it. |
| [OSRM](http://project-osrm.org/) demo server | Driving route and step-by-step directions | No SLA; may be slow, rate-limited, or unavailable. Car profile only. |
| OpenStreetMap tiles | Map display | Usage policy requires attribution and no bulk loading; both are respected. |

If any of these becomes a bottleneck, only `src/services/*` needs to change
to point at a different provider or a caching proxy — the rest of the app is
unaffected.

## Privacy

No analytics, no cookies, no accounts, no server. Your trip only ever exists
in your browser's memory. The only outbound requests are to the three
services above.

## Limits

This models geometry only, once, for a single trip:

- No live traffic, GPS tracking, or turn-by-turn navigation.
- No weather or cloud cover.
- Flights, trains, ships and bikes are out of scope.
- Assumes a car and free-flowing traffic (see A10 above).

## Attribution

Route data © OpenStreetMap contributors, via OSRM. Geocoding via Nominatim.
Map tiles per the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## License

[MIT](LICENSE)
