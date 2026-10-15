import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // MapLibre 6 loads its worker from a file next to its own module; pre-bundling breaks that path.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: { chunkSizeWarningLimit: 1500 },
});
