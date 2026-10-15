// MapLibre 6 finds its web worker next to its own module file, which doesn't
// survive bundling. Let Vite bundle the worker and tell MapLibre where it is.
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
