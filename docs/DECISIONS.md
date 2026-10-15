# Weather-Aware Truck Routing — Delivery Decisions

Spotter AI Full Stack assessment · Budget: 16 hours over 4 days · Status: **Agreed scope**

This document fixes what we deliver, how we build it, and the assumptions we make where the spec leaves gaps. The README will draw its "Assumptions" and "Architecture" sections from here.

---

## 1. Goal

A React + Django web app where a truck driver enters origin, destination, departure time and load weight. The app returns **3 routes**, checks the weather **at the time the truck will reach each checkpoint**, classifies risk using the provided rules, **recommends the safest route** (balanced against travel time), and shows everything on a map with a **0–48h weather heatmap slider**.

Guiding rule from the brief: *correctness and clarity over extra features.*

---

## 2. Scope

### Committed (required by spec)
| # | Feature | Grading bucket |
|---|---|---|
| R1 | Form: origin, destination, departure date/time, load weight (lb), checkpoint interval | UI |
| R2 | 3 route options from a routing API (truck profile) | Logic 40% |
| R3 | Checkpoints every 10 / 25 / 50 mi (user-selectable, **default 25**), each with its own ETA | Logic 40% |
| R4 | Forecast weather at each checkpoint's ETA hour | Logic 40% |
| R5 | Risk classification (wind / rain / snow + load rules) | Logic 40% |
| R6 | Recommendation using the spec's priority order + an explanation for each route's rank | Logic 40% |
| R7 | Map: all routes, checkpoints (colored by risk), ETAs, route summaries | UI 35% |
| R8 | Weather heatmap along the corridor with a 0–48h slider | UI 35% |
| R9 | GitHub repo, hosted app, 5–10 min Loom | Docs 5% |

### Committed extras (chosen because they're cheap and support correctness)
| # | Extra | Why |
|---|---|---|
| X1 | **Truck marker on slider**: shows where the truck is on the selected route at slider hour *h* | Connects the heatmap to the trip. Very visual, about 1h of work. |
| X2 | **HOS rest breaks in ETAs**: 30-min break after every 8h of cumulative driving | Makes ETAs, and so the weather lookups, realistic for truckers. Toggle in the form, **on by default**. |

### Explicitly out of scope (listed in the README as "next steps")
- Full HOS model (11h driving limit / 14h window / 10h off-duty reset)
- "Best departure time" suggestion
- Location autocomplete (plain text with server-side geocoding instead)
- Auth, saved trips, traffic data, bridge/height restrictions beyond what the HGV profile does

---

## 3. Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + **TypeScript** + Vite, TanStack Query |
| Map | MapLibre GL (via `react-map-gl`) + deck.gl overlay; OpenFreeMap tiles (no key) |
| Backend | Django 5 + Django REST Framework, `httpx`, `polyline` |
| Routing + geocoding | **OpenRouteService** (`driving-hgv` profile, free key, no card) |
| Weather | **Open-Meteo** forecast API (no key) |
| Cache | Django cache (locmem; Redis only if Render provides it free) |
| Tests | `pytest` + `pytest-django`; Vitest only for the risk-color/format helpers |
| Hosting | **Vercel** (frontend) + **Render** free web service (backend) |

No card-required services anywhere.

---

## 4. Architecture

```
React (Vercel)
  TripForm ─POST /api/plan──────────► routes + checkpoints + risk + recommendation (~2–4s)
  MapView ◄─GET /api/heatmap/{id}──── 49-hour risk grid for the corridor (loaded after routes)

Django (Render)
  views.py            thin: validate → call services/domain → serialize
  services/           I/O only: geocoding.py, routing.py, weather.py (timeouts, retries, cache)
  domain/             pure, no Django/HTTP imports:
                        sampling.py   checkpoints + ETAs (+ HOS breaks)
                        risk.py       classification rules
                        recommend.py  segment miles, averages, ranking, rank reasons
                        corridor.py   heatmap grid points
  tests/              unit tests on domain/, API test with mocked HTTP
```

**Rule:** `domain/` never imports from `services/` or Django. Everything graded under "logic" is a pure function with tests.

---

## 5. API contract

### `POST /api/plan`
Request: `{ origin, destination, departure (ISO 8601 with offset), load_lb, interval_mi ∈ {10,25,50}, hos_breaks: bool }`

Validation:
- `load_lb` from 1 to 80,000
- departure no more than 1h in the past
- departure + trip duration within the forecast horizon (~14 days); otherwise return a 422 with a clear message

Response (abridged):
```json
{
  "plan_id": "…",
  "origin": {"label": "…", "lat": 0, "lon": 0},
  "destination": {"label": "…", "lat": 0, "lon": 0},
  "recommended_route_id": "r2",
  "routes": [{
    "id": "r1", "geometry": "<polyline>", "distance_mi": 0, "duration_h": 0, "arrival": "…",
    "summary": {"no_travel_mi": 0, "severe_mi": 0, "high_mi": 0, "moderate_mi": 0, "low_mi": 0,
                "avg_risk": 0.0, "max_risk": "HIGH"},
    "rank": 1, "rank_reason": "Fewest severe miles; 40 min slower than r3",
    "breaks": [{"mile": 0, "start": "…", "end": "…"}],
    "checkpoints": [{
      "mile": 25, "lat": 0, "lon": 0, "eta": "…",
      "weather": {"wind_mph": 0, "gust_mph": 0, "rain_in_hr": 0, "snow_in_hr": 0},
      "levels": {"wind": "LOW", "rain": "LOW", "snow": "LOW"},
      "risk": "LOW", "driver": "wind", "load_adjusted": false
    }]
  }]
}
```

### `GET /api/heatmap/{plan_id}`
```json
{ "start": "<departure rounded down to the hour, UTC>", "hours": 49,
  "points": [[lat, lon], …], "risk": "<base64 Uint8Array, 49 × N, values 0–4>" }
```
Slider hour 0 = departure hour.

---

## 6. Logic decisions & assumptions

These are the gaps in the spec and how we fill them. Each one goes in the README.

| # | Topic | Decision |
|---|---|---|
| A1 | Band edges | Bands include the lower bound and exclude the upper: wind 25 ≤ w < 35 → MODERATE, so values like 34.6 mph have a defined level. Rain and snow follow the PDF: No Travel is **strictly greater than** 1.00 in/hr and 3.0 in/hr. |
| A2 | Which wind | **Sustained** 10 m wind drives the rules. Gusts are shown in the popup only. |
| A3 | Rain value | `rain + showers` (in/hr) from Open-Meteo |
| A4 | Snow value | Hourly `snowfall` (in/hr), not snow depth |
| A5 | Checkpoint risk | Take the worst of wind, rain and snow, then apply the load rules. **Load rules can only increase risk, never lower it.** |
| A6 | Load rules | wind ≥ 55 → No Travel (any load) · 45–54 mph and load > 30,000 lb → No Travel · 35–44 mph and load > 40,000 lb → at least Severe |
| A7 | Forecast hour | Weather is **interpolated linearly** between the two forecast hours around the checkpoint's ETA |
| A8 | ETA | Based on ORS per-step durations, not an average speed, plus a 30-min break after every 8h of driving when HOS is on |
| A9 | Checkpoints | Origin, then every *I* miles, then the destination (the last segment may be shorter) |
| A10 | Risk miles | The stretch between two consecutive checkpoints gets the **worse** of their two risk levels (conservative, safety-first) |
| A11 | Average risk | Distance-weighted mean of level values 0–4 |
| A12 | Ranking | Sort by `(has any No-Travel miles, severe_mi, high_mi, avg_risk, duration)`. The first key is our addition, since the spec doesn't rank No Travel. A route with any No Travel segment is labeled "Not recommended" |
| A13 | All routes have No Travel | Still rank them, and show a banner: "No safe route at this departure time" |
| A14 | 3 routes | Ask ORS for 3 alternatives. If it returns fewer, use a **via-point fallback**: offset the route midpoint ±15% of trip distance to each side, route through it, and drop any route that overlaps an existing one by more than 85%. If 3 distinct routes still can't be found, show what we have along with a note. |
| A15 | Units | Request `wind_speed_unit=mph` and `precipitation_unit=inch`. Spike task S2 checks that snowfall really comes back in inches. |
| A16 | Time | UTC on the server; times shown in the browser's local timezone with an abbreviation label |
| A17 | Heatmap value | The same `classify()` function with the current load, so the heatmap and the checkpoints always agree |
| A18 | Heatmap grid | **0.5° cells (~30 mi)** across a corridor ~100 mi wide (route ±50 mi). Open-Meteo's free tier counts each location as one call (600/min, 5,000/h). A 0.2° grid used about 650 calls per trip and hit the rate limit during testing; 0.5° uses about 180. |
| A19 | Truck weight for routing | Gross weight sent to ORS = load + 35,000 lb tractor/trailer, capped at 80,000 lb |
| A20 | Truck ETAs | Keep ORS HGV durations as-is (≈41 mph average, conservative). Considered scaling to car time × 1.15 and rejected it, because it would be a made-up calibration. Documented as a known limitation. |
| A21 | Ranking order | Strict spec order, even when a tiny average-risk difference beats hours of travel time. The rank reason shows the time trade-off so the driver can see it. |
| A22 | Alternatives | ORS alternatives only work under 100 km. Long trips use via points, with out-and-back spurs removed (`domain/spur.py`) and every route checked for duplicates, including ORS's own alternatives. |

---

## 7. UI decisions

- **Layout:** sidebar on the left (form, then 3 route cards), map on the right, hour slider docked at the bottom of the map. On mobile, the sidebar stacks above the map.
- **Route cards:** duration, distance, arrival time, a stacked bar of risk miles, a "Recommended" badge, and the rank reason. Clicking a card selects the route.
- **Map layers** (bottom to top): heatmap → unselected routes (thin, grey) → selected route (thick, segments colored by risk) → checkpoints (colored by risk, click opens a popup) → truck marker.
- **Checkpoint popup:** ETA, wind/gust/rain/snow values, the level for each factor, overall risk, and a "load-adjusted" tag when a load rule raised the level.
- **Slider:** 0–48h, label like `Thu 14:00 (+8h)`, a play/pause button (one step every 300 ms), and the truck marker moving along with it.
- **One risk palette everywhere**, always with text labels next to the colors: Low (green) · Moderate (yellow) · High (orange) · Severe (red) · No Travel (dark purple).
- **States:** loading skeletons, "Waking server…" if the first request takes more than 5s, and a readable error for each failure (geocoding, routing, weather).

---

## 8. Performance plan (35% bucket)

- Weather is fetched in **batches** of about 100 coordinates per Open-Meteo call, with chunks running in parallel.
- Cache key `(lat 2dp, lon 2dp, hour)`. Geocoding and routing are cached by their inputs.
- The heatmap loads separately so routes appear first.
- The heatmap is sent once with all 49 hours. **Moving the slider makes zero network requests**: it only changes `hour`, which feeds deck.gl `updateTriggers`. Target: 60 fps.
- Corridor points are deduplicated on a 0.5° grid (about 150–250 points per trip; see A18).
- The heatmap is drawn as colored grid tiles (deck.gl `SolidPolygonLayer`) that fade over 250 ms between hours. The original plan was `HeatmapLayer` with MEAN aggregation, but it hid low-risk areas and produced blocky artifacts.

---

## 9. Testing

- `test_risk.py`: every band edge (24.9 / 25 / 34.9 / 35 / … / 55), rain/snow strict No Travel (1.00 vs 1.01, 3.0 vs 3.01), load rules at 30,000 vs 30,001 and 40,000 vs 40,001 lb, and that load rules never lower risk.
- `test_sampling.py`: checkpoint spacing, origin and destination always included, ETAs increase along the route, HOS break inserted at exactly 8h of driving.
- `test_recommend.py`: segment attribution, distance-weighted average, each ranking key breaking ties in order, No Travel always sorted last.
- `test_plan_api.py`: full request with ORS and Open-Meteo responses mocked.
- CI: GitHub Actions running `pytest` and `tsc --noEmit` on push.

---

## 10. Hosting

- **Render:** gunicorn, WhiteNoise, settings read from environment variables (`ORS_API_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`), `/api/health` endpoint.
- **Vercel:** `VITE_API_URL` points at the Render backend.
- **Cold starts:** the frontend calls `/api/health` as soon as the page loads, and the UI shows a "Waking server…" state. Before submitting, open the app once yourself so it's warm.
- Secrets live only in environment variables, never in the repo. Commit a `.env.example`.

---

## 11. Milestones (16h)

| Day | Hours | Work | Done when |
|---|---|---|---|
| 1 | 1 | **Spike:** S1 ORS alternatives on a long trip (Dallas → Denver); S2 Open-Meteo units and batch size | Fallback need confirmed, units confirmed |
| 1 | 3 | Django skeleton, geocoding, routing + fallback, `risk.py` + tests | `pytest` green, 3 routes returned |
| 2 | 3 | Sampling + ETAs + HOS, weather service, `recommend.py` + tests, `/api/plan` | Full plan JSON from curl |
| 2–3 | 4 | React app: form, route cards, map, checkpoints, popups | End-to-end in local dev |
| 3 | 2.5 | Corridor + `/api/heatmap`, heatmap layer, slider, play button, truck marker | Smooth slider |
| 4 | 1.5 | Deploy, CI, README (from this document), record the Loom | All 3 links working |

Buffer: none, so if something slips, cut X1 (truck marker) first, then X2 (HOS).

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| ORS returns fewer than 3 alternatives on long trips | Via-point fallback (A14), checked in the Day-1 spike |
| Open-Meteo rate limits during development | Aggressive caching, plus saved fixture responses for tests |
| Render cold start during review | Health ping + "Waking server…" UI; warm it up before sending |
| Heatmap looks blotchy (density artifacts) | **Happened.** Switched to grid tiles (see §8) |
| Open-Meteo rate limit | **Happened** with a 0.2° grid. Moved to 0.5° (A18), and every location is cached for 30 min |
| MapLibre 6 worker missing from the production bundle | **Happened.** Fixed by bundling the worker with Vite (`?worker&url`) and calling `setWorkerUrl` |
| Not enough time | Cut order: X1 → X2 → play button → per-segment route coloring |

---

## 13. Verification

After each milestone: run the test suite, exercise the app end-to-end against the live APIs, and re-check every decision in §6 against what the code actually does. Real trips (Dallas → Denver, Salt Lake City → Cheyenne, Los Angeles → Phoenix, Fort Worth → Dallas) are used alongside the mocked tests, because several issues (rate limits, via-point spurs, duplicate alternatives) only showed up with real data.

---

## 14. Final deliverables checklist

- [ ] Public GitHub repo with README (setup, architecture, assumptions §6, decisions, next steps)
- [ ] Hosted frontend URL + backend health URL
- [ ] Tests passing in CI
- [ ] 5–10 min Loom: demo, then why the recommended route won, then a live load change (29k → 41k lb), then the heatmap slider, then a code tour of `risk.py` and its tests, then assumptions and next steps
- [ ] Links submitted to Teamtailor before the 4-day deadline
