import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Nest's DI resolves constructor params via emitDecoratorMetadata, which
  // esbuild (Vitest's default transform) doesn't produce. swc does, so tests
  // see real injected providers instead of `undefined`.
  plugins: [swc.vite()],
  test: {
    environment: "node",
    root: __dirname,
  },
});
