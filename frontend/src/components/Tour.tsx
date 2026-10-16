import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";

import { TOUR_STEPS as STEPS } from "./tourSteps";

interface Props {
  onClose: () => void;
}

// Remember that the tour was shown. Storage can be blocked (private mode), so failures are ignored.
const TOUR_KEY = "truck-routing-tour-seen";
export const tourSeen = () => {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return false;
  }
};
export const markTourSeen = () => {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* not important */
  }
};

const CARD_W = 300;
const GAP = 14;
const PAD = 6; // breathing room around the spotlight
const PHONE_MAX_W = 640;
const isPhone = () => window.innerWidth < PHONE_MAX_W;

type Box = { top: number; left: number; width: number; height: number };

/** Put the card beside the target if there's room, otherwise inside it (for big areas like the map). */
function placeCard(t: Box): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (isPhone()) {
    // Full width, docked to whichever edge is away from the target (the slider lives at the bottom).
    const targetBelowMiddle = t.top + t.height / 2 > vh / 2;
    return targetBelowMiddle ? { top: 12, left: 12, right: 12 } : { bottom: 12, left: 12, right: 12 };
  }
  let left: number;
  let top = t.top;
  if (t.left + t.width + GAP + CARD_W < vw) left = t.left + t.width + GAP;
  else if (t.left - GAP - CARD_W > 0) left = t.left - GAP - CARD_W;
  else {
    left = t.left + t.width / 2 - CARD_W / 2;
    top = t.top + t.height > vh - 200 ? t.top - 200 : t.top + 90; // above bottom bars, below the legend otherwise
  }
  return { top: Math.min(Math.max(top, 12), vh - 220), left: Math.min(Math.max(left, 12), vw - CARD_W - 12), width: CARD_W };
}

/** A small spotlight tour: dims the page, highlights one element, explains it in a sentence or two. */
export function Tour({ onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  // Measure the target (scrolling it into view first) and keep the spotlight on it as the window changes.
  useLayoutEffect(() => {
    const el = document.querySelector(step.target);
    if (!el) return setBox(null);
    // On phones the card covers the bottom of the screen, so centre the target above it.
    el.scrollIntoView({ block: isPhone() ? "center" : "nearest" });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") last ? onClose() : setIndex((i) => i + 1);
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, onClose]);

  if (!box) return null;
  const card = placeCard(box);

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Clicking outside the card closes the tour instead of reaching the page underneath. */}
      <div className="tour-blocker" onClick={onClose} />
      <div className="tour-spotlight" style={box} />
      <div className="tour-card" style={card}>
        <div className="tour-progress">
          Step {index + 1} of {STEPS.length}
        </div>
        <h3 id="tour-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="link" onClick={onClose}>
            Skip
          </button>
          <span className="spacer" />
          {index > 0 && (
            <button className="secondary" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button className="primary" onClick={() => (last ? onClose() : setIndex(index + 1))} autoFocus>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
