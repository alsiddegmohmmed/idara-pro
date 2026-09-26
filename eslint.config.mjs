// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

// TODO(module-boundaries): once real modules exist under apps/api/src/modules/
// (Stage 4+), add eslint-plugin-boundaries here to enforce that a module is
// only imported via its index.ts and that domain/ stays framework-free, per
// docs/architecture/overview.md. Nothing to bound yet with only `health`.
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/build/**", "**/.turbo/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
);
