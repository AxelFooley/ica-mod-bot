const { defineConfig } = require("vite");
const { builtinModules } = require("node:module");

module.exports = defineConfig({
  build: {
    emptyOutDir: false,
    ssr: "index.ts",
    outDir: "../../dist/server",
    target: "node22",
    sourcemap: true,
    rollupOptions: {
      external: [...builtinModules, "express"],
      output: {
        format: "cjs",
        entryFileNames: "index.cjs",
        inlineDynamicImports: true,
      },
    },
  },
});
