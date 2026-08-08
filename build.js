const esbuild = require("esbuild");
const JavaScriptObfuscator = require("javascript-obfuscator");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const ALL_JS_ORDER = ["tab-5star-render.js", "tab-5star.js", "tab-simulator.js", "tab-4star.js", "tab-other.js", "tab-build.js", "character-info-tab.js", "weapon-info-tab.js", "app.js"];
const CORE_JS = ["tab-5star-render.js", "tab-5star.js", "app.js"];
const LAZY_TABS = [{
  tab: "simulator",
  file: "tab-simulator.js"
}, {
  tab: "4star",
  file: "tab-4star.js"
}, {
  tab: "build",
  file: "tab-build.js"
}, {
  tab: "other",
  file: "tab-other.js"
}, {
  tab: "character-info",
  file: "character-info-tab.js"
}, {
  tab: "weapon-info",
  file: "weapon-info-tab.js"
}];
const STATIC_PAGES = ["contact.html", "privacy.html", "terms.html", "credits.html", "404.html", "robots.txt", "sitemap.xml", "google3909e9d7cbd5f292.html"];
const JS_SRC = path.join(ROOT, "js");
const CSS_SRC = path.join(ROOT, "css");
const ASSETS_SRC = path.join(ROOT, "assets");
const BUNDLED_HTML_PAGES = ["index.html"];
const DIST_JS = path.join(DIST, "js");
const DIST_CSS = path.join(DIST, "css");
const DIST_ASSETS = path.join(DIST, "assets");
function assertSafeToWipe(dir) {
  if (path.basename(dir) !== "dist") {
    throw new Error(`Refusing to wipe non-dist path: ${dir}`);
  }
  if (path.dirname(dir) !== ROOT) {
    throw new Error(`Refusing to wipe dist outside project root: ${dir}`);
  }
}
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, {
    recursive: true
  });
  for (const entry of fs.readdirSync(src, {
    withFileTypes: true
  })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
console.log("Cleaning dist...");
assertSafeToWipe(DIST);
fs.rmSync(DIST, {
  recursive: true,
  force: true
});
fs.mkdirSync(DIST, {
  recursive: true
});
console.log("Copying assets...");
copyRecursive(ASSETS_SRC, DIST_ASSETS);
fs.mkdirSync(DIST_JS, {
  recursive: true
});
fs.mkdirSync(DIST_CSS, {
  recursive: true
});
console.log("Building JavaScript...");
for (const file of ALL_JS_ORDER) {
  const p = path.join(JS_SRC, file);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing JS file: ${file}`);
  }
}
function minifyAndObfuscate(source) {
  const { code: minified } = esbuild.transformSync(source, {
    loader: "js",
    minify: true,
    target: "es2019"
  });
  return JavaScriptObfuscator.obfuscate(minified, {
    compact: true,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    stringArray: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 0.35,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    selfDefending: false,
    numbersToExpressions: false,
    simplify: true
  }).getObfuscatedCode();
}
function hashOf(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
}
const coreConcatenated = CORE_JS.map((file) => fs.readFileSync(path.join(JS_SRC, file), "utf8")).join("\n;\n");
const coreObfuscated = minifyAndObfuscate(coreConcatenated);
const bundleName = `bundle.${hashOf(coreObfuscated)}.js`;
fs.writeFileSync(path.join(DIST_JS, bundleName), coreObfuscated);
console.log(`\u2713 js/${bundleName}  (core: ${CORE_JS.join(", ")})`);
const lazyManifest = {};
for (const { tab, file } of LAZY_TABS) {
  const source = fs.readFileSync(path.join(JS_SRC, file), "utf8");
  const obfuscated = minifyAndObfuscate(source);
  const base = file.replace(/\.js$/, "");
  const chunkName = `${base}.${hashOf(obfuscated)}.js`;
  fs.writeFileSync(path.join(DIST_JS, chunkName), obfuscated);
  lazyManifest[tab] = {
    src: `js/${chunkName}`
  };
  console.log(`\u2713 js/${chunkName}  (lazy: ${tab})`);
}
console.log("Building CSS...");
if (!fs.existsSync(path.join(CSS_SRC, "styles.css"))) {
  throw new Error("Missing css/styles.css");
}
const cssEntry = path.join(CSS_SRC, "styles.css");
const cssBuildResult = esbuild.buildSync({
  entryPoints: [cssEntry],
  bundle: true,
  minify: true,
  write: false,
  loader: {
    ".css": "css"
  },
  external: ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.svg", "*.webp"]
});
const cssOutputFile = cssBuildResult.outputFiles[0];
if (!cssOutputFile) {
  throw new Error("esbuild did not produce a CSS output file \u2014 check css/styles.css and its @imports.");
}
const cssFileName = `styles.${hashOf(cssOutputFile.text)}.css`;
fs.writeFileSync(path.join(DIST_CSS, cssFileName), cssOutputFile.text);
console.log(`\u2713 css/${cssFileName}`);

const cssLinkPattern = /<link rel="stylesheet" href="css\/styles(?:\.[a-f0-9]{8})?\.css(?:\?[^"]*)?">/;
console.log("Copying static pages...");
for (const file of STATIC_PAGES) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) {
    console.log(`  (skip, not found: ${file})`);
    continue;
  }
  if (file.endsWith(".html")) {
    let html = fs.readFileSync(src, "utf8");
    html = html.replace(cssLinkPattern, `<link rel="stylesheet" href="css/${cssFileName}">`);
    fs.writeFileSync(path.join(DIST, file), html);
  } else {
    fs.copyFileSync(src, path.join(DIST, file));
  }
  console.log(`  \u2713 ${file}`);
}

console.log("Building HTML...");
const scriptBlockPattern = new RegExp(ALL_JS_ORDER.map((file) => `\\s*<script src="js\\/${file.replace(".", "\\.")}(?:\\?[^"]*)?"><\\/script>`).join(""));
const lazyManifestScript = `
    <script>window.__LAZY_TABS__ = ${JSON.stringify(lazyManifest)};<\/script>
    <script src="js/${bundleName}"><\/script>`;
for (const page of BUNDLED_HTML_PAGES) {
  const src = path.join(ROOT, page);
  const dist = path.join(DIST, page);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing ${page}`);
  }
  let html = fs.readFileSync(src, "utf8");
  if (!scriptBlockPattern.test(html)) {
    throw new Error(`Could not find the expected <script> block in ${page} \u2014 check that ALL_JS_ORDER matches the tags in the file.`);
  }
  html = html.replace(scriptBlockPattern, lazyManifestScript);
  html = html.replace(/((?:css|assets\/data)\/[^"']*?)\?v=[^"']*/g, "$1");
  html = html.replace(cssLinkPattern, `<link rel="stylesheet" href="css/${cssFileName}">`);
  fs.writeFileSync(dist, html);
  console.log(`\u2713 ${page}`);
}
console.log("Pre-rendering character & weapon pages...");
const { prerenderProfilePages, prerenderStaticTabPages, appendSitemapEntries } = require("./prerender.js");
const indexDistHtml = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
let prerenderResult = { sitemapUrls: [], charCount: 0, weaponCount: 0 };
prerenderProfilePages({ rootDir: ROOT, distDir: DIST, shellHtml: indexDistHtml }).then((result) => {
  prerenderResult = result;
  const flatTabUrls = prerenderStaticTabPages({ distDir: DIST, shellHtml: indexDistHtml });
  console.log(`\u2713 ${flatTabUrls.length} static tab page(s) (simulator/build/4star/other)`);
  appendSitemapEntries(DIST, result.sitemapUrls.concat(flatTabUrls));
  console.log(`\u2713 ${result.charCount} character page(s), ${result.weaponCount} weapon page(s)`);
  finishBuild();
}).catch((err) => {
  console.error("Pre-render step failed:", err);
  process.exitCode = 1;
});
function finishBuild() {
  console.log("");
  console.log("=================================");
  console.log(" Build complete");
  console.log(` Core: js/${bundleName}`);
  console.log(` Lazy: ${LAZY_TABS.length} chunk(s) in js/`);
  console.log(` CSS : css/${cssFileName}`);
  console.log(` Pages: ${prerenderResult.charCount} character, ${prerenderResult.weaponCount} weapon`);
  console.log(` Dist: ${DIST}`);
  console.log("=================================");
}
