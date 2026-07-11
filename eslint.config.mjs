import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Serwist service worker bundle.
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker-*.js",
  ]),
  {
    rules: {
      // Data-fetching effects legitimately setState to track loading/results;
      // this MVP uses effect-based fetching rather than an external store.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
