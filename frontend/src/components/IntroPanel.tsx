interface Props {
  onTryExample: () => void;
}

/** What a first-time visitor sees on the empty map. */
export function IntroPanel({ onTryExample }: Props) {
  return (
    <div className="intro">
      <h2>Pick the safest truck route, not just the fastest</h2>
      <p className="muted">Weather is checked at the time the truck actually reaches each point on the road, not just at departure.</p>
      <ol>
        <li>
          <strong>Enter a trip</strong> with the departure time and load weight.
        </li>
        <li>
          <strong>Compare three routes</strong> by wind, rain and snow risk along the way.
        </li>
        <li>
          <strong>Scrub the forecast</strong> for the whole trip and watch the truck move through it.
        </li>
      </ol>
      <button className="primary" onClick={onTryExample}>
        Try Dallas → Denver
      </button>
    </div>
  );
}
