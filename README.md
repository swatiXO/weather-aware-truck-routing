# Weather-Aware Truck Routing

A React + Django app that helps a truck driver pick the safest route. Enter an origin, destination, departure time and load weight. The app finds up to three truck routes, checks the forecast **at the time the truck will reach each checkpoint**, classifies risk with the assessment's wind/rain/snow and load rules, and recommends the best route. Everything is shown on a map with a 0–48 hour weather heatmap slider.

- **Live app:** https://weather-aware-truck-routing-beta.vercel.app
- **API health:** https://truck-routing-api-9oh0.onrender.com/api/health
- **Walkthrough:** _Loom link coming soon_

> The API runs on Render's free tier, which sleeps when idle. The first request after a quiet period can take up to a minute while it wakes up; the app shows a notice while that happens.

## Features

- **3 truck routes** from OpenRouteService's `driving-hgv` profile, with a fallback that generates alternatives when the API returns fewer than three.
- **Checkpoints every 10, 25 or 50 miles** (you choose), each with its own ETA based on per-step travel times from the router.
- **Time-aware weather.** Each checkpoint uses the forecast for its ETA, interpolated between the two surrounding forecast hours.
- **Risk classification** using the brief's thresholds plus the load-weight rules, with a per-factor breakdown (wind, rain, snow) and a "load-adjusted" flag.
- **Recommendation** in the brief's priority order, with a one-line explanation of why each route ranks where it does.
- **Map:** the selected route is colored by risk segment. Click a checkpoint for details, or click a grey route to select it.
- **Weather heatmap** over the trip corridor with a 0–48h slider and play button. All 49 hours load in one request, so dragging the slider never hits the network.
- **Truck marker** that follows the slider along the selected route.
- **HOS breaks (optional, on by default):** a 30-minute break after every 8 hours of driving, included in all ETAs.

## How the logic works

```
geocode → route (ORS HGV) → checkpoints + ETAs → batch forecast (Open-Meteo) → classify → summarize → rank
```

### Risk per checkpoint (`backend/planner/domain/risk.py`)

| Level | Wind (mph) | Rain (in/hr) | Snow (in/hr) |
|---|---|---|---|
| Low | < 25 | < 0.10 | < 0.5 |
| Moderate | 25 – < 35 | 0.10 – < 0.25 | 0.5 – < 1.0 |
| High | 35 – < 45 | 0.25 – < 0.50 | 1.0 – < 2.0 |
| Severe | 45 – < 55 | 0.50 – 1.00 | 2.0 – 3.0 |
| No Travel | ≥ 55 | > 1.00 | > 3.0 |

A checkpoint's risk is the worst of the three factors. The load rules are applied afterwards and can only raise it:
- wind ≥ 55 mph → No Travel, for any load
- wind 45–54 mph and load > 30,000 lb → No Travel
- wind 35–44 mph and load > 40,000 lb → at least Severe

### Route summary and ranking (`backend/planner/domain/recommend.py`)

- Each stretch between two consecutive checkpoints takes the **worse** of their two risks. This is the conservative, safety-first choice. Miles are then totaled per risk level.
- Average risk is the distance-weighted mean of the levels (0 = Low … 4 = No Travel).
- Routes are ranked by: **any No Travel miles** (these go last) → fewest Severe miles → fewest High miles → lowest average risk → shortest travel time.

## Assumptions

The brief leaves some gaps. These are the choices made, and the full reasoning is in [docs/DECISIONS.md](docs/DECISIONS.md).

1. Bands include the lower bound and exclude the upper (34.6 mph is Moderate). Rain and snow No Travel use the brief's strict `>`.
2. **Sustained** 10 m wind drives the rules. Gusts are shown, but not used for classification.
3. Rain = Open-Meteo `rain + showers`. Snow = hourly `snowfall` (not snow depth). Units requested in mph and inches.
4. The brief doesn't rank No Travel. Any route with No Travel miles is marked *Not recommended* and sorted last. If every route has No Travel, the app still ranks them and shows a warning.
5. ETAs come from the router's per-step durations, not an average speed. Gross weight sent to the router = load + 35,000 lb tractor/trailer, capped at 80,000 lb.
   **Known limitation:** ORS's truck profile uses European-style truck speed caps and averages about 41 mph on US interstates (Dallas → Denver is about 19h of driving, versus about 14–15h for a real truck). Its `maximum_speed` option can't raise this. These ETAs are kept as-is and treated as conservative rather than adjusted with a made-up factor.
6. Departure must be within 14 days, and the trip must end within the forecast horizon.
7. **Heatmap grid:** 0.5° cells (~30 mi) across a corridor ~100 mi wide. Open-Meteo's free tier counts every location as one call (600/min, 5,000/h), so a finer grid would hit the limit after a few trips. The heatmap uses the same classifier and load as the checkpoints, so the two always agree.
8. The public ORS API only computes alternative routes for trips under 100 km. For longer trips (or when ORS returns near-duplicates), the app routes through via points offset to each side of the main route's midpoint. It cuts out the dead-end detour a via point can create on a side road, and keeps only routes that overlap existing ones by less than 85%.

## Project layout

```
backend/
  config/                 Django settings (env-driven), URLs
  planner/
    domain/               Pure logic, no I/O: risk, sampling (ETAs/HOS), recommend, corridor, forecast, geo
    services/             Third-party APIs: geocoding, routing, weather (cached, timeouts, readable errors)
    pipeline.py           Orchestrates services + domain for /plan and /heatmap
    views.py              Thin DRF views
    tests/                pytest: domain unit tests, routing fallback, full API flow with mocked HTTP
frontend/
  src/api/                Typed API client mirroring the backend contract (decodes the heatmap)
  src/components/         Sidebar UI: form, recommendation, route cards, checkpoint table, slider, legend
  src/map/                MapLibre map, deck.gl layers, checkpoint popup
  src/lib/                Pure helpers: geometry, weather summaries, slider timeline, formatting, risk palette
```

`domain/` never imports Django or HTTP code. Everything that affects the recommendation can be tested in isolation.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness, and whether the routing key is configured |
| `POST` | `/api/plan` | `{origin, destination, departure, load_lb, interval_mi, hos_breaks}` → ranked routes with checkpoints |
| `GET` | `/api/heatmap/<plan_id>` | 49-hour risk grid for the plan's corridor (base64 `Uint8Array`, hours × points) |

## Running locally

**Backend** (Python 3.12+):
```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add your free ORS key: https://openrouteservice.org/dev/#/signup
python manage.py runserver
```

**Frontend** (Node 20+):
```bash
cd frontend
npm install
cp .env.example .env
npm run dev                   # http://localhost:5173
```

**Tests:**
```bash
cd backend && pytest
cd frontend && npm test && npm run typecheck
```

## Deployment

- **Backend → Render** (`render.yaml`). Set `ORS_API_KEY`, `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` in the dashboard.
- **Frontend → Vercel** (root directory `frontend`). Set `VITE_API_URL` to the Render URL.
- Render's free tier sleeps when idle. The frontend pings `/api/health` on load and shows a "waking the server" notice if it's slow.

## Next steps

- Full HOS model (11-hour driving limit, 14-hour window, 10-hour reset)
- Suggest a safer departure time when every route has No Travel segments
- Location autocomplete
- Use gusts as a secondary signal, and model crosswind relative to road heading
- Shared cache (Redis) across instances; a paid Open-Meteo plan for a finer heatmap
