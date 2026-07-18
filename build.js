const esbuild = require('esbuild');
const JavaScriptObfuscator = require('javascript-obfuscator');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const JS_ORDER = [
  'app.js',
  'tab-5star.js',
  'tab-5star-odds.js',
  'tab-4star.js',
  'tab-other.js',
  'tab-build.js',
];
const jsDir = path.join(__dirname, 'js');
for (const file of JS_ORDER) {
  const filePath = path.join(jsDir, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing JS file: ${file}`);
  }
}
const concatenated = JS_ORDER
  .map(file => fs.readFileSync(path.join(jsDir, file), 'utf8'))
  .join('\n;\n');
const { code: minified } = esbuild.transformSync(concatenated, {
  loader: 'js',
  minify: true,
  target: 'es2019',
});
const obfuscated = JavaScriptObfuscator.obfuscate(minified, {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.35,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  numbersToExpressions: false,
  simplify: true,
}).getObfuscatedCode();
const hash = crypto.createHash('sha256').update(obfuscated).digest('hex').slice(0, 8);
fs.writeFileSync(path.join(jsDir, 'bundle.js'), obfuscated);
console.log(`built js/bundle.js (${JS_ORDER.length} files -> 1, v=${hash})`);
for (const file of JS_ORDER) {
  const filePath = path.join(jsDir, file);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
const indexPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const scriptBlockPattern = new RegExp(
  JS_ORDER.map(f => `\\s*<script src="js\\/${f.replace('.', '\\.')}(?:\\?[^"]*)?"><\\/script>`).join('')
);
const newHtml = html.replace(scriptBlockPattern, `\n    <script src="js/bundle.js?v=${hash}"></script>`);
if (newHtml === html) {
  throw new Error('Failed to replace script tags in index.html — scriptBlockPattern did not match. Check that the <script> tags for JS_ORDER files are present and in the expected format.');
}
fs.writeFileSync(indexPath, newHtml);
console.log('rewrote index.html script tags to point at js/bundle.js');
const cssPath = path.join(__dirname, 'css', 'styles.css');
const cssSource = fs.readFileSync(cssPath, 'utf8');
const cssResult = esbuild.transformSync(cssSource, {
  loader: 'css',
  minify: true,
});
fs.writeFileSync(cssPath, cssResult.code);
console.log('minified css/styles.css');
