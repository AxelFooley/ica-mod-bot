import { defineConfig } from "vite";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  ssr: {
    noExternal: true,
  },
  build: {
    emptyOutDir: false,
    outDir: resolve(__dirname, "../../dist/server"),
    target: "node22",
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, "index.ts"),
      external: [...builtinModules, "express"],
      output: {
        format: "cjs",
        entryFileNames: "index.cjs",
      },
    },
  },
});
