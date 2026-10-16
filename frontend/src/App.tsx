import { useEffect, useState } from "react";

import { Header } from "./components/Header";
import { HourSlider } from "./components/HourSlider";
import { IntroPanel } from "./components/IntroPanel";
import { Legend } from "./components/Legend";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { RecommendationBanner } from "./components/RecommendationBanner";
import { RouteComparison } from "./components/RouteComparison";
import { RouteDetails } from "./components/RouteDetails";
import { markTourSeen, Tour, tourSeen } from "./components/Tour";
import { TripForm } from "./components/TripForm";
import { TripSummary } from "./components/TripSummary";
import { usePlanner } from "./hooks/usePlanner";
import { useServerWake } from "./hooks/useServerWake";
import { useTimeline } from "./hooks/useTimeline";
import { MapView } from "./map/MapView";

export default function App() {
  const waking = useServerWake();
  const p = usePlanner();
  const t = useTimeline(p.plan, p.selected, p.heatmap);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [touring, setTouring] = useState(false);
  const [runExample, setRunExample] = useState(0);

  // First trip ever planned: start the tour once the results have rendered and the map has zoomed in.
  useEffect(() => {
    if (!p.plan || tourSeen()) return;
    const timer = window.setTimeout(() => setTouring(true), 1000);
    return () => window.clearTimeout(timer);
  }, [p.plan]);

  return (
    <div className="app">
      <aside className="sidebar">
        <Header onGuide={p.plan ? () => setTouring(true) : undefined} />
        {waking && <div className="banner info">Waking the server (free hosting tier). This can take up to a minute…</div>}

        {/* Hidden rather than unmounted, so "Edit trip" brings back what was typed. */}
        <div hidden={!p.editing}>
          <TripForm loading={p.pending} fieldErrors={p.error?.fields} onSubmit={p.submit} runExample={runExample} />
          {p.plan && (
            <button className="link cancel-edit" onClick={() => p.setEditing(false)}>
              Back to results
            </button>
          )}
        </div>
        {!p.editing && p.plan && <TripSummary plan={p.plan} onEdit={() => p.setEditing(true)} />}
        {p.error && <div className="banner error">{p.error.fields ? "Please fix the highlighted fields." : p.error.message}</div>}

        {p.plan && (
          <section className="results">
            <RecommendationBanner plan={p.plan} onSelect={p.selectRoute} />
            {p.plan.notes
              .filter((n) => !n.startsWith("No safe route")) // already said by the banner
              .map((n) => (
                <div key={n} className="banner warn">
                  {n}
                </div>
              ))}
            <h2 className="section-title">Compare routes</h2>
            <RouteComparison routes={p.plan.routes} selectedId={p.selected?.id ?? null} onSelect={p.selectRoute} />
            {p.selected && (
              <RouteDetails route={p.selected} intervalMi={p.plan.interval_mi} highlight={p.highlight} onHighlight={p.setHighlight} onFocus={p.setFocused} />
            )}
          </section>
        )}
      </aside>

      <main className="map-wrap">
        <MapView
          plan={p.plan}
          selectedId={p.selected?.id ?? null}
          onSelectRoute={p.selectRoute}
          heatmap={p.heatmap.data ?? null}
          showHeatmap={showHeatmap}
          hour={t.hour}
          truckSeconds={t.truckSeconds}
          focused={p.focused}
          onFocus={p.setFocused}
          highlight={p.highlight}
          onHighlight={p.setHighlight}
        />
        <Legend showHeatmap={showHeatmap} onToggleHeatmap={setShowHeatmap} />
        <HourSlider
          start={t.start}
          hour={t.hour}
          maxHour={t.maxHour}
          marks={t.marks}
          bands={t.bands}
          ready={t.ready}
          status={t.status}
          note={t.truckNote}
          playing={t.playing}
          fullWindow={t.fullWindow}
          onChange={t.setHour}
          onTogglePlay={t.togglePlay}
        />
        {!p.plan && !p.pending && <IntroPanel onTryExample={() => setRunExample((n) => n + 1)} />}
        {p.pending && <LoadingOverlay />}
      </main>

      {touring && p.plan && (
        <Tour
          onClose={() => {
            markTourSeen();
            setTouring(false);
          }}
        />
      )}
    </div>
  );
}
