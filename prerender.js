"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const SITE_BASE_URL = "https://spektrem2b.github.io/genshin-wish-calculator/";
function slugify(name) {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
function buildSlugMap(roster, idKey) {
  const used = /* @__PURE__ */ new Set();
  const map = {};
  roster.forEach((entry) => {
    let slug = slugify(entry.name);
    if (used.has(slug)) slug = `${slug}-${entry[idKey]}`;
    used.add(slug);
    map[entry[idKey]] = slug;
  });
  return map;
}
function loadRosterConst(rootDir, relPath) {
  const code = fs.readFileSync(path.join(rootDir, relPath), "utf8");
  const match = code.match(/const\s+([A-Z0-9_]+)\s*=/);
  if (!match) {
    throw new Error(`prerender.js: no top-level const found in ${relPath}`);
  }
  const varName = match[1];
  const fn = new Function(`${code}
return ${varName};`);
  return fn();
}
function createRenderWindow(rootDir) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>
       <div id="characterInfoPanel"></div>
       <div id="weaponInfoPanel"></div>
     </body></html>`,
    { runScripts: "dangerously", url: "https://prerender.local/" }
  );
  const { window } = dom;
  window.fetch = function(url) {
    const clean = String(url).split("?")[0];
    const filePath = path.join(rootDir, clean);
    return new Promise((resolve) => {
      let ok = false;
      let data = null;
      try {
        data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        ok = true;
      } catch (e) {
      }
      resolve({ ok, json: () => Promise.resolve(data) });
    });
  };
  const scriptFiles = [
    "assets/data/character-profiles/index.js",
    "assets/data/weapon-profiles/index.js",
    "js/character-info-tab.js",
    "js/weapon-info-tab.js"
  ];
  const combined = scriptFiles.map((f) => fs.readFileSync(path.join(rootDir, f), "utf8")).join("\n;\n");
  window.eval(combined);
  return window;
}
async function flushAsync(times = 8) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
async function renderCharacterPanel(window, id) {
  window.parseHashRoute = () => ({
    tab: "character-info",
    params: new window.URLSearchParams(id ? `character=${encodeURIComponent(id)}` : "")
  });
  window.activateCharacterInfoTab();
  await flushAsync();
  return window.document.getElementById("characterInfoPanel").innerHTML;
}
async function renderWeaponPanel(window, id) {
  window.parseHashRoute = () => ({
    tab: "weapon-info",
    params: new window.URLSearchParams(id ? `weapon=${encodeURIComponent(id)}` : "")
  });
  window.activateWeaponInfoTab();
  await flushAsync();
  return window.document.getElementById("weaponInfoPanel").innerHTML;
}
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function injectPage(shellHtml, opts) {
  const { title, description, canonicalUrl, activeTab, activeNavBtnId, panelId, panelHtml } = opts;
  let html = shellHtml;
  if (!/<base\s/i.test(html)) {
    html = html.replace("<head>", `<head>
<base href="${SITE_BASE_URL}">`);
  }
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeHtml(title)}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeHtml(description)}$2`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonicalUrl}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonicalUrl}$2`);
  html = html.replace('<html lang="en">', `<html lang="en" data-active-tab="${activeTab}">`);
  html = html.replace('id="tab5starBtn" class="nav-link active"', 'id="tab5starBtn" class="nav-link"');
  html = html.replace(`id="${activeNavBtnId}" class="nav-link"`, `id="${activeNavBtnId}" class="nav-link active"`);
  if (panelId) {
    const emptyPanelRe = new RegExp(`(<div class="char-info-page[^"]*" id="${panelId}">)</div>`);
    if (!emptyPanelRe.test(html)) {
      throw new Error(`prerender.js: could not find empty #${panelId} div to inject into \u2014 did index.html markup change?`);
    }
    html = html.replace(emptyPanelRe, `$1${panelHtml}</div>`);
  }
  return html;
}
function writeSlugScript(distDir, fileBase, varName, map) {
  const dir = path.join(distDir, "assets", "data");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${fileBase}.js`), `const ${varName} = ${JSON.stringify(map)};
`);
}
function sampleRoster(roster, idKey, { limit, pinIds } = {}) {
  if (limit == null) return roster;
  const pinned = new Set((pinIds || []).map(String));
  const picked = roster.filter((e) => pinned.has(String(e[idKey])));
  for (const entry of roster) {
    if (picked.length >= limit) break;
    if (pinned.has(String(entry[idKey]))) continue;
    picked.push(entry);
  }
  return picked;
}
async function prerenderProfilePages({ rootDir, distDir, shellHtml, sample }) {
  const charRoster = loadRosterConst(rootDir, "assets/data/character-profiles/index.js");
  const weaponRoster = loadRosterConst(rootDir, "assets/data/weapon-profiles/index.js");
  const charSlugs = buildSlugMap(charRoster, "id");
  const weaponSlugs = buildSlugMap(weaponRoster, "id");
  writeSlugScript(distDir, "character-slugs", "GENSHIN_CHARACTER_SLUGS", charSlugs);
  writeSlugScript(distDir, "weapon-slugs", "GENSHIN_WEAPON_SLUGS", weaponSlugs);
  const window = createRenderWindow(rootDir);
  window.eval(
    `const GENSHIN_CHARACTER_SLUGS = ${JSON.stringify(charSlugs)};
const GENSHIN_WEAPON_SLUGS = ${JSON.stringify(weaponSlugs)};`
  );
  const sitemapUrls = [];
  const charsToRender = sampleRoster(charRoster, "id", { limit: sample?.maxChars, pinIds: sample?.pinCharIds });
  const weaponsToRender = sampleRoster(weaponRoster, "id", { limit: sample?.maxWeapons, pinIds: sample?.pinWeaponIds });
  console.log(`  Rendering ${charsToRender.length} character page(s)${sample?.maxChars != null ? ` (sampled from ${charRoster.length})` : ""}...`);
  for (const entry of charsToRender) {
    const slug = charSlugs[entry.id];
    const panelHtml = await renderCharacterPanel(window, entry.id);
    const outHtml = injectPage(shellHtml, {
      title: `${entry.name} Build, Talents & Materials: Genshin Wish Calculator`,
      description: `${entry.name} talents, constellations, ascension materials, and base stats for Genshin Impact.`,
      canonicalUrl: `${SITE_BASE_URL}character-info/${slug}/`,
      activeTab: "character-info",
      activeNavBtnId: "tabInfoBtn",
      panelId: "characterInfoPanel",
      panelHtml
    });
    const outDir = path.join(distDir, "character-info", slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), outHtml);
    sitemapUrls.push(`${SITE_BASE_URL}character-info/${slug}/`);
  }
  console.log(`  Rendering ${weaponsToRender.length} weapon page(s)${sample?.maxWeapons != null ? ` (sampled from ${weaponRoster.length})` : ""}...`);
  for (const entry of weaponsToRender) {
    const slug = weaponSlugs[entry.id];
    const panelHtml = await renderWeaponPanel(window, entry.id);
    const outHtml = injectPage(shellHtml, {
      title: `${entry.name} Refinement & Materials: Genshin Wish Calculator`,
      description: `${entry.name} refinement effects and ascension materials for Genshin Impact.`,
      canonicalUrl: `${SITE_BASE_URL}weapon-info/${slug}/`,
      activeTab: "weapon-info",
      activeNavBtnId: "tabWeaponInfoBtn",
      panelId: "weaponInfoPanel",
      panelHtml
    });
    const outDir = path.join(distDir, "weapon-info", slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), outHtml);
    sitemapUrls.push(`${SITE_BASE_URL}weapon-info/${slug}/`);
  }
  console.log("  Rendering grid/listing pages...");
  const charGridHtml = await renderCharacterPanel(window, null);
  fs.writeFileSync(
    path.join(distDir, "character-info", "index.html"),
    injectPage(shellHtml, {
      title: "All Characters: Genshin Wish Calculator",
      description: "Browse every Genshin Impact character's build, talents, and ascension materials.",
      canonicalUrl: `${SITE_BASE_URL}character-info/`,
      activeTab: "character-info",
      activeNavBtnId: "tabInfoBtn",
      panelId: "characterInfoPanel",
      panelHtml: charGridHtml
    })
  );
  sitemapUrls.push(`${SITE_BASE_URL}character-info/`);
  const weaponGridHtml = await renderWeaponPanel(window, null);
  fs.writeFileSync(
    path.join(distDir, "weapon-info", "index.html"),
    injectPage(shellHtml, {
      title: "All Weapons: Genshin Wish Calculator",
      description: "Browse every Genshin Impact weapon's refinement effects and ascension materials.",
      canonicalUrl: `${SITE_BASE_URL}weapon-info/`,
      activeTab: "weapon-info",
      activeNavBtnId: "tabWeaponInfoBtn",
      panelId: "weaponInfoPanel",
      panelHtml: weaponGridHtml
    })
  );
  sitemapUrls.push(`${SITE_BASE_URL}weapon-info/`);
  return { sitemapUrls, charCount: charsToRender.length, weaponCount: weaponsToRender.length };
}
const FLAT_TABS = [
  {
    tab: "4star",
    dir: "4star",
    navBtnId: "tab4starBtn",
    title: "4\u2605 Odds: Genshin Wish Calculator",
    description: "Calculate your odds of pulling 4-star characters and weapons in Genshin Impact."
  },
  {
    tab: "simulator",
    dir: "simulator",
    navBtnId: "tabOddsBtn",
    title: "Wish Simulator: Genshin Wish Calculator",
    description: "Simulate Genshin Impact wishes and see realistic pull outcomes."
  },
  {
    tab: "build",
    dir: "build",
    navBtnId: "tabBuildBtn",
    title: "Build Planner: Genshin Wish Calculator",
    description: "Plan Genshin Impact character builds and wishes together."
  },
  {
    tab: "other",
    dir: "other",
    navBtnId: "tabOtherBtn",
    title: "Other: Genshin Wish Calculator",
    description: "Additional Genshin Impact wish planning tools."
  }
];
function prerenderStaticTabPages({ distDir, shellHtml }) {
  const sitemapUrls = [];
  for (const { tab, dir, navBtnId, title, description } of FLAT_TABS) {
    const outHtml = injectPage(shellHtml, {
      title,
      description,
      canonicalUrl: `${SITE_BASE_URL}${dir}/`,
      activeTab: tab,
      activeNavBtnId: navBtnId
    });
    const outDir = path.join(distDir, dir);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), outHtml);
    sitemapUrls.push(`${SITE_BASE_URL}${dir}/`);
  }
  return sitemapUrls;
}
function appendSitemapEntries(distDir, urls) {
  const sitemapPath = path.join(distDir, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) {
    console.log("  (skipping sitemap update: dist/sitemap.xml not found)");
    return;
  }
  let xml = fs.readFileSync(sitemapPath, "utf8");
  if (!/<\/urlset>/.test(xml)) {
    console.log("  (skipping sitemap update: no </urlset> found in sitemap.xml)");
    return;
  }
  const entries = urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n");
  xml = xml.replace("</urlset>", `${entries}
</urlset>`);
  fs.writeFileSync(sitemapPath, xml);
}
module.exports = { prerenderProfilePages, prerenderStaticTabPages, appendSitemapEntries, slugify };
