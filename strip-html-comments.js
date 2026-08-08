#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const stripped = input.replace(/<!--[\s\S]*?-->/g, "");
  process.stdout.write(stripped);
});
