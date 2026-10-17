// eslint.config.mjs
// Flat config (ESLint 9) enforcing the DOC3 §3.1 import matrix.
// Rule: core/ must not import infra/, express, mongoose, ioredis, socket.io, pino, or node:*

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "services/vision/**",
      "apps/web/**",
      "**/*.config.ts",
      "**/*.config.mjs",
      "apps/api/scripts/**",
    ],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["./apps/api/tsconfig.json", "./packages/shared/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  // ─── DOC3 §3.1 import matrix guard for core/ ─────────────────────────────
  // core/ must NEVER import: express, mongoose, ioredis, socket.io, pino, node:*
  // or anything from infra/ or modules/
  {
    files: ["apps/api/src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["express", "express/*"],
              message: "core/ must not import express. Move HTTP logic to routes/.",
            },
            {
              group: ["mongoose", "mongoose/*"],
              message: "core/ must not import mongoose. Use a repository port.",
            },
            {
              group: ["ioredis", "ioredis/*"],
              message: "core/ must not import ioredis. Use a store port.",
            },
            {
              group: ["socket.io", "socket.io/*"],
              message: "core/ must not import socket.io. Use the event bus.",
            },
            {
              group: ["pino", "pino/*"],
              message: "core/ must not import pino. Use a passed-in logger port.",
            },
            {
              group: ["node:*"],
              message: "core/ must not import node built-ins. Keep domain pure.",
            },
            {
              group: ["../infra/*", "../../infra/*"],
              message: "core/ must not import from infra/. Depend only on types.",
            },
            {
              group: ["../modules/*", "../../modules/*"],
              message: "core/ must not import from modules/.",
            },
          ],
        },
      ],
    },
  },
  // ─── modules/*/routes must not import repositories directly ───────────────
  {
    files: ["apps/api/src/modules/*/routes.ts", "apps/api/src/modules/**/*.routes.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*/infra/mongo/*", "../../infra/mongo/*", "../../../infra/mongo/*"],
              message: "Routes must not import repositories. Call a service method instead.",
            },
          ],
        },
      ],
    },
  },
];
