import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Allow intentional empty catch blocks (used as fallback for localStorage errors)
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Downgrade from error — pre-existing usages; tighten over time
      "@typescript-eslint/no-explicit-any": "warn",
      // Respect the _prefix convention for intentionally unused identifiers
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  { ignores: ["dist/**", "coverage/**"] }
);
