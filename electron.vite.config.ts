import { fileURLToPath } from "node:url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: `${root}electron/main.ts` } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: `${root}electron/preload.ts` } } }
  },
  renderer: {
    root,
    resolve: { alias: { "@": `${root}src` } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: { index: `${root}index.html` } } },
    server: { host: "127.0.0.1", port: 5173, strictPort: true }
  }
});
