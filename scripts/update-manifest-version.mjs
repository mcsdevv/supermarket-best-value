import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node update-manifest-version.mjs <version>");
  process.exit(1);
}

const manifestPath = "manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Updated manifest.json version to ${version}`);
