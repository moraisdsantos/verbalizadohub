import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Caminhos relativos permitem publicar em qualquer subdiretÃ³rio do GitHub Pages.
  base: "./",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
