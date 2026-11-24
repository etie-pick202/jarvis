import { defineConfig } from "tsup";

// Un seul fichier autonome : l'image Docker n'a besoin que de Node et de dist/server.js.
export default defineConfig({
  entry: ["src/server.ts", "src/migrate.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  noExternal: [/.*/],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
