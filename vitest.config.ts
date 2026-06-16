import { defineConfig } from "vitest/config";
import path from "node:path";

// QUAL-01: unit-test runner. Tests live under tests/ (excluded from the Next
// build / tsconfig) and resolve the same "@/..." alias the app uses. Node
// environment — these are pure-logic tests with no DOM and no live database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
