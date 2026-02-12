import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const isWatch = process.argv.includes("--watch");
const isProd = process.argv.includes("--prod");

const sharedOptions = {
  bundle: true,
  format: "iife",
  logLevel: "info",
  minify: false,
  sourcemap: false,
  target: "chrome120",
};

const configs = [
  {
    ...sharedOptions,
    define: isProd ? { "window.__TESCO_VALUE_SORT_TEST_MODE__": "false" } : {},
    entryPoints: ["src/content.ts"],
    outfile: "dist/content.js",
  },
  {
    ...sharedOptions,
    define: isProd ? { "window.__SAINSBURYS_VALUE_SORT_TEST_MODE__": "false" } : {},
    entryPoints: ["src/sainsburys-content.ts"],
    outfile: "dist/sainsburys-content.js",
  },
  {
    ...sharedOptions,
    define: isProd ? { "window.__MORRISONS_VALUE_SORT_TEST_MODE__": "false" } : {},
    entryPoints: ["src/morrisons-content.ts"],
    outfile: "dist/morrisons-content.js",
  },
];

function copyAssets() {
  mkdirSync("dist/icons", { recursive: true });
  cpSync("manifest.json", "dist/manifest.json");
  cpSync("icons", "dist/icons", { recursive: true });
}

if (isWatch) {
  for (const config of configs) {
    const ctx = await context(config);
    await ctx.watch();
  }
  copyAssets();
} else {
  for (const config of configs) {
    await build(config);
  }
  copyAssets();
}
