import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const amountSafety = {
  message:
    "Token amounts are bigint in base units. Parse decimals with parseAmount from src/shared/amount.ts.",
};

export default defineConfig(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js", "vitest.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", ...amountSafety },
        { name: "parseInt", ...amountSafety },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.name='Number']", ...amountSafety },
        {
          selector: "MemberExpression[object.name='Number'][property.name=/^parse(Float|Int)$/]",
          ...amountSafety,
        },
      ],
    },
  },
);
