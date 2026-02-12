import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const isWatch = process.argv.includes("--watch");
const isProd = process.argv.includes("--prod");

const config = {
  bundle: true,
  define: isProd ? { "window.__TESCO_VALUE_SORT_TEST_MODE__": "false" } : {},
  entryPoints: ["src/content.ts"],
  format: "iife",
  logLevel: "info",
  minify: false,
  outfile: "dist/content.js",
  sourcemap: false,
  target: "chrome120",
};

function copyAssets() {
  mkdirSync("dist/icons", { recursive: true });
  cpSync("manifest.json", "dist/manifest.json");
  cpSync("icons", "dist/icons", { recursive: true });
}

if (isWatch) {
  const ctx = await context(config);
  copyAssets();
  await ctx.watch();
} else {
  await build(config);
  copyAssets();
}
