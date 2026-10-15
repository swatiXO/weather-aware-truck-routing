import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { api, ApiError } from "./api/client";
import type { Checkpoint, PlanRequest } from "./api/types";
import { CheckpointList } from "./components/CheckpointList";
import { HourSlider } from "./components/HourSlider";
import { IntroPanel } from "./components/IntroPanel";
import { Legend } from "./components/Legend";
import { RecommendationBanner } from "./components/RecommendationBanner";
import { RouteCard } from "./components/RouteCard";
import { markTourSeen, Tour, tourSeen } from "./components/Tour";
import { TripForm } from "./components/TripForm";
import { TripSummary } from "./components/TripSummary";
import { floorHour, sliderMarks, truckStatus } from "./lib/timeline";
import { useServerWake } from "./lib/useServerWake";
import { MapView } from "./map/MapView";

export default function App() {
  const waking = useServerWake();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [focused, setFocused] = useState<Checkpoint | null>(null);
  const [editing, setEditing] = useState(true);
  const [touring, setTouring] = useState(false);
  const [runExample, setRunExample] = useState(0);

  const planMutation = useMutation({
    mutationFn: (req: PlanRequest) => api.plan(req),
    onSuccess: (plan) => {
      setSelectedId(plan.recommended_route_id ?? plan.routes[0]?.id ?? null);
      setHour(0);
      setPlaying(false);
      setFocused(null);
      setEditing(false);
    },
  });
  const plan = planMutation.data ?? null;
  const error = planMutation.error as ApiError | null;

  // First trip ever planned: start the tour once the results have rendered and the map has zoomed in.
  useEffect(() => {
    if (!plan || tourSeen()) return;
    const timer = window.setTimeout(() => setTouring(true), 1000);
    return () => window.clearTimeout(timer);
  }, [plan]);

  const closeTour = () => {
    markTourSeen();
    setTouring(false);
  };

  // The heatmap is heavier, so it loads after the routes are already on screen.
  const heatmap = useQuery({
    queryKey: ["heatmap", plan?.plan_id],
    queryFn: () => api.heatmap(plan!.plan_id),
    enabled: !!plan,
    staleTime: Infinity,
    retry: 1,
  });

  const selected = plan?.routes.find((r) => r.id === selectedId) ?? null;
  const sliderStart = useMemo(() => heatmap.data?.start ?? (plan ? floorHour(plan.departure) : new Date()), [heatmap.data, plan]);
  const marks = useMemo(() => (plan ? sliderMarks(sliderStart, plan.departure, selected?.arrival ?? null) : []), [plan, sliderStart, selected?.arrival]);
  const truckSeconds = plan ? (sliderStart.getTime() + hour * 3600_000 - new Date(plan.departure).getTime()) / 1000 : null;
  const showForm = editing || !plan;

  let sliderStatus: string | undefined;
  if (!plan) sliderStatus = "Plan a trip to see the forecast";
  else if (heatmap.isLoading) sliderStatus = "Loading 48-hour forecast grid…";
  else if (heatmap.isError) sliderStatus = `Heatmap unavailable: ${heatmap.error.message}`;

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <div className="brand">
            <svg className="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="18" r="2.5" />
              <circle cx="19" cy="6" r="2.5" />
              <path d="M7.5 18H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h6.5" />
            </svg>
            <h1>Weather-Aware Truck Routing</h1>
            {plan && (
              <button className="guide" onClick={() => setTouring(true)} title="Show the guided tour again">
                ? Guide
              </button>
            )}
          </div>
          <p className="muted small">Three truck routes, weather at each checkpoint's ETA, and the safest pick.</p>
        </header>

        {waking && <div className="banner info">Waking the server (free hosting tier). This can take up to a minute…</div>}

        {/* Hidden rather than unmounted, so "Edit trip" brings back what was typed. */}
        <div hidden={!showForm}>
          <TripForm
            loading={planMutation.isPending}
            fieldErrors={error?.fields}
            onSubmit={(req) => planMutation.mutate(req)}
            runExample={runExample}
          />
          {plan && (
            <button className="link cancel-edit" onClick={() => setEditing(false)}>
              Back to results
            </button>
          )}
        </div>
        {!showForm && plan && <TripSummary plan={plan} onEdit={() => setEditing(true)} />}

        {error && <div className="banner error">{error.fields ? "Please fix the highlighted fields." : error.message}</div>}

        {plan && (
          <section className="results">
            <RecommendationBanner plan={plan} onSelect={setSelectedId} />
            {plan.notes
              .filter((n) => !n.startsWith("No safe route")) // already said by the banner
              .map((n) => (
                <div key={n} className="banner warn">{n}</div>
              ))}
            <h2 className="section-title">All routes</h2>
            {plan.routes.map((r) => (
              <RouteCard key={r.id} route={r} selected={r.id === selectedId} onSelect={() => setSelectedId(r.id)} />
            ))}
            {selected && (
              <details className="cp-details" open>
                <summary>
                  Route {selected.id} checkpoints ({selected.checkpoints.length}, every {plan.interval_mi} mi)
                </summary>
                <CheckpointList checkpoints={selected.checkpoints} onFocus={setFocused} />
              </details>
            )}
          </section>
        )}
      </aside>

      <main className="map-wrap">
        <MapView
          plan={plan}
          selectedId={selectedId}
          onSelectRoute={setSelectedId}
          heatmap={heatmap.data ?? null}
          showHeatmap={showHeatmap}
          hour={hour}
          truckSeconds={truckSeconds}
          focused={focused}
          onFocus={setFocused}
        />
        <Legend showHeatmap={showHeatmap} onToggleHeatmap={setShowHeatmap} />
        <HourSlider
          start={sliderStart}
          hour={hour}
          playing={playing}
          disabled={!heatmap.data}
          status={sliderStatus}
          note={selected ? truckStatus(selected, new Date(sliderStart.getTime() + hour * 3600_000)) : undefined}
          marks={marks}
          onChange={setHour}
          onTogglePlay={() => setPlaying((p) => !p)}
        />
        {!plan && !planMutation.isPending && <IntroPanel onTryExample={() => setRunExample((n) => n + 1)} />}
        {planMutation.isPending && <div className="map-loading">Fetching routes and forecasts…</div>}
      </main>

      {touring && plan && <Tour onClose={closeTour} />}
    </div>
  );
}
