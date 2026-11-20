import { defineConfig } from "vite";

export default defineConfig({
  configFile: false,
  build: {
    target: "chrome120",
    outDir: "tests/.playback-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "tests/playback-engine-entry.ts",
      output: { format: "es", entryFileNames: "playback-engine.js" }
    }
  }
});
