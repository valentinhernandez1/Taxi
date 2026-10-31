import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.wrangler/**", "**/node_modules/**", "prototipo/**", "apps/api/drizzle/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Código de la app: dinero siempre con los helpers de @taxis/shared, nada de parseFloat/toFixed sueltos.
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Number", property: "parseFloat", message: "Usá parsearImporte/desdeNumeric de @taxis/shared." },
        { property: "toFixed", message: "Usá formatearImporte/aNumeric de @taxis/shared." },
      ],
      "no-restricted-globals": ["error", { name: "parseFloat", message: "Usá parsearImporte/desdeNumeric de @taxis/shared." }],
    },
  },
  {
    files: ["apps/api/test/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
