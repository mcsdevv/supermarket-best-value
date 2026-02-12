import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const isWatch = process.argv.includes("--watch");
const isProd = process.argv.includes("--prod");

const config = {
  entryPoints: ["src/content.ts"],
  bundle: true,
  outfile: "dist/content.js",
  format: "iife",
  target: "chrome120",
  minify: false,
  sourcemap: false,
  define: isProd
    ? { "window.__TESCO_VALUE_SORT_TEST_MODE__": "false" }
    : {},
  logLevel: "info",
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
