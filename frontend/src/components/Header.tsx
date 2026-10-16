interface Props {
  onGuide?: () => void; // shown once there are results to tour
}

export function Header({ onGuide }: Props) {
  return (
    <header>
      <div className="brand">
        <svg className="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="18" r="2.5" />
          <circle cx="19" cy="6" r="2.5" />
          <path d="M7.5 18H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h6.5" />
        </svg>
        <h1>Weather-Aware Truck Routing</h1>
        {onGuide && (
          <button className="guide" onClick={onGuide} title="Show the guided tour again">
            ? Guide
          </button>
        )}
      </div>
      <p className="muted small">Three truck routes, weather at each checkpoint's ETA, and the safest pick.</p>
    </header>
  );
}
