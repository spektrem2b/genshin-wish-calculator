#!/usr/bin/env node
const esbuild = require("esbuild");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const ext = process.argv[2] || "js";
  try {
    const result = esbuild.transformSync(input, {
      loader: ext,
      minify: false,
      minifyWhitespace: false,
      minifyIdentifiers: false,
      minifySyntax: false
    });
    process.stdout.write(result.code);
  } catch (err) {
    process.stderr.write(`strip-comments: failed to process, passing through unchanged: ${err.message}
`);
    process.stdout.write(input);
  }
});
