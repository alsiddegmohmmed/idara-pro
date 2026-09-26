// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

// docs/architecture/overview.md: a module under apps/api/src/modules/<name>/
// may only be imported from its index.ts — never reach into another
// module's http/application/domain/infrastructure directly.
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
  {
    files: ["apps/api/src/modules/**/*.ts"],
    plugins: { boundaries },
    settings: {
      // Without this, the plugin's default resolver (eslint-import-resolver-node)
      // can't resolve extension-less relative imports to .ts files, so every
      // cross-module import silently looks "unresolved" and the rule never fires.
      "import/resolver": { node: { extensions: [".js", ".ts"] } },
      // A **/ prefix so this matches regardless of whether eslint runs with
      // cwd=apps/api ("pnpm --filter api lint") or cwd=repo-root.
      "boundaries/elements": [{ type: "module", pattern: "**/src/modules/*", mode: "folder" }],
    },
    rules: {
      "boundaries/entry-point": [
        "error",
        {
          default: "disallow",
          rules: [{ target: "module", allow: "index.ts" }],
        },
      ],
    },
  },
);
