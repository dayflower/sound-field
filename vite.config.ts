import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    outDir: "docs",
    rollupOptions: {
      input: {
        index: `${root}index.html`,
        noiseField: `${root}noise-field.html`,
        spectrumField: `${root}spectrum-field.html`,
        modulateField: `${root}modulate-field.html`,
      },
    },
  },
});
