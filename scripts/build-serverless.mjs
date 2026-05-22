import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("infra/aws/dist", { recursive: true });

await build({
  entryPoints: ["serverless/sovereign-api/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "infra/aws/dist/index.js",
  sourcemap: false,
  minify: false,
});
