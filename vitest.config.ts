import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Edge functions (Deno) import dependencies with the npm: prefix. Strip it so Vitest resolves them from node_modules.
// If hono is not in node_modules, set EDGE_HONO_DIR to a directory containing node_modules/hono to run the app tests.
const honoDir = process.env.EDGE_HONO_DIR;
const edgeAliases = [
  ...(honoDir
    ? [
        {
          find: /^(?:npm:)?hono\/logger$/,
          replacement: path.resolve(honoDir, "node_modules/hono/dist/middleware/logger/index.js"),
        },
        { find: /^(?:npm:)?hono$/, replacement: path.resolve(honoDir, "node_modules/hono/dist/index.js") },
      ]
    : []),
  { find: /^npm:(.+)$/, replacement: "$1" },
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(import.meta.dirname, "./src") }, ...edgeAliases],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/**/*.test.ts"],
    exclude: ["node_modules", "dist", "e2e"],
    passWithNoTests: true,
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/domain/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}"],
      exclude: ["**/*.test.*", "**/*.spec.*", "**/*.d.ts", "**/index.ts"],
      thresholds: {
        lines: 85,
        branches: 75,
        functions: 81,
        statements: 83,
      },
    },
  },
});
