import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  {
    rules: {
      // The app intentionally loads external data in effects (repository indexes, source
      // documents) and renders plain <img> tags for archived photos on a static export.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "test-output/**", "image-search/**", "next-env.d.ts"]),
]);
