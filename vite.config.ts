import { defineConfig } from "vite";
import logseqPlugin from "vite-plugin-logseq";

export default defineConfig({
  plugins: [logseqPlugin()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: {
    host: "127.0.0.1",
    // Several plugins in this workspace default to 8080 and vite falls back
    // silently when it is taken, which loads the wrong plugin into Logseq.
    // strictPort makes a collision fail loudly instead.
    port: 8090,
    strictPort: true,
    cors: true,
  },
});
