import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("infra/aws/dist", { recursive: true });

await build({
  entryPoints: ["serverless/sovereign-api/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "infra/aws/dist/index.mjs",
  sourcemap: false,
  minify: false,
});
