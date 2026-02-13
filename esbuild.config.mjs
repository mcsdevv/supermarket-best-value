import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const isWatch = process.argv.includes("--watch");
const isProd = process.argv.includes("--prod");

const sharedOptions = {
  bundle: true,
  format: "iife",
  logLevel: "info",
  minify: isProd,
  pure: isProd ? ["console.log"] : [],
  sourcemap: false,
  target: "chrome120",
  treeShaking: isProd,
};

const configs = [
  {
    ...sharedOptions,
    define: isProd ? { "globalThis.__TESCO_VALUE_SORT_TEST_MODE__": "false" } : {},
    entryPoints: ["src/tesco-content.ts"],
    outfile: "dist/tesco-content.js",
  },
  {
    ...sharedOptions,
    define: isProd ? { "globalThis.__SAINSBURYS_VALUE_SORT_TEST_MODE__": "false" } : {},
    entryPoints: ["src/sainsburys-content.ts"],
    outfile: "dist/sainsburys-content.js",
  },
  {
    ...sharedOptions,
    define: isProd ? { "globalThis.__WAITROSE_VALUE_SORT_TEST_MODE__": "false" } : {},
    entryPoints: ["src/waitrose-content.ts"],
    outfile: "dist/waitrose-content.js",
  },
  {
    ...sharedOptions,
    entryPoints: ["src/popup.ts"],
    outfile: "dist/popup.js",
  },
];

function copyAssets() {
  mkdirSync("dist/icons", { recursive: true });
  cpSync("manifest.json", "dist/manifest.json");
  cpSync("icons", "dist/icons", { recursive: true });
  cpSync("src/popup.html", "dist/popup.html");
}

if (isWatch) {
  const contexts = await Promise.all(configs.map((config) => context(config)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  copyAssets();
} else {
  await Promise.all(configs.map((config) => build(config)));
  copyAssets();
}
