/*
 * Copyright (C) 2025 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import js from "@eslint/js";
import * as tseslint from "typescript-eslint";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  // 1) Base JS recommended rules
  js.configs.recommended,

  // 2) TypeScript + Prettier
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "simple-import-sort": simpleImportSort,
      prettier: prettierPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      curly: ["error", "all"],
      "simple-import-sort/imports": "error",
      // Run Prettier as an ESLint rule
      "prettier/prettier": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^err",
        },
      ],
    },
  },

  // 3) JavaScript in the project root + Prettier
  {
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error",
    },
  },

  // Local tooling runs in Node; it never becomes a deployed browser resource.
  {
    files: ["scripts/**/*.js", "e2e/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        console: "readonly",
      },
    },
  },

  // 4) Turn off any ESLint rules that conflict with Prettier
  prettierConfig,

  // 5) Ignore build output and lockfiles
  {
    ignores: [
      "dist",
      "node_modules",
      "pnpm-lock.yaml",
      "playwright-report",
      "test-results",
    ],
  },
];
