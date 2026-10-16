export interface TourStep {
  target: string; // CSS selector of the element to spotlight
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: ".recommendation",
    title: "The recommendation",
    body: "Routes are ranked by the brief's rules: avoid No Travel, then fewest Severe and High miles, then lowest average risk, then travel time. The tags show the worst wind, rain and snow; the lines below say where and why.",
  },
  {
    target: ".comparison",
    title: "Compare the three routes",
    body: "One column per route, with the best value in each row highlighted. Click a column to show that route on the map; its explanation and checkpoint table are underneath.",
  },
  {
    target: ".map-wrap",
    title: "The map",
    body: "Every route is coloured by risk. The selected one is bold with all its checkpoints; the others are thinner, with dots only where they turn risky. Hover a dot for its weather at the truck's ETA; hover a table row to find it on the map.",
  },
  {
    target: ".hour-slider",
    title: "Weather over the trip",
    body: "The coloured strip and the route's dots are the weather the truck itself meets, each at the moment it gets there. The tiles are different: a snapshot of risk across the whole area at the slider's hour. Drag or press play (or Space); the white ring shows where the truck is. Short trips can widen the view to the full 48 hours.",
  },
  {
    target: ".trip-summary",
    title: "Try your own trip",
    body: "Edit the trip to change places, departure or load. Compare 40,000 and 41,000 lb on a windy day: the load rules can push a checkpoint from High to Severe.",
  },
];
