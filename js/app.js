function slugMapFor(tab) {
  if (tab === "weapon-info") return typeof GENSHIN_WEAPON_SLUGS !== "undefined" ? GENSHIN_WEAPON_SLUGS : {};
  return typeof GENSHIN_CHARACTER_SLUGS !== "undefined" ? GENSHIN_CHARACTER_SLUGS : {};
}
function idForSlug(tab, slug) {
  const map = slugMapFor(tab);
  for (const id in map) {
    if (map[id] === slug) return id;
  }
  return null;
}
function parsePathRoute() {
  const nested = location.pathname.match(/\/(character-info|weapon-info)\/([^/]+)\/?$/);
  if (nested) {
    const tab = nested[1];
    const slug = decodeURIComponent(nested[2]);
    const id = idForSlug(tab, slug);
    const params = new URLSearchParams();
    if (id) params.set(tab === "weapon-info" ? "weapon" : "character", id);
    return { tab, params };
  }
  const flat = location.pathname.match(/\/(simulator|build|4star|other|character-info|weapon-info)\/?$/);
  if (flat) return { tab: flat[1], params: new URLSearchParams() };
  return null;
}
function parseHashRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (!raw) {
    const pathRoute = parsePathRoute();
    if (pathRoute) return pathRoute;
  }
  const qIndex = raw.indexOf("?");
  const tab = (qIndex === -1 ? raw : raw.slice(0, qIndex)) || "5star";
  const params = new URLSearchParams(qIndex === -1 ? "" : raw.slice(qIndex + 1));
  return { tab, params };
}
window.parseHashRoute = parseHashRoute;
function debounce(fn, wait = 150) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
const TAB_ACTIVATORS = {
  simulator: "activateOddsTab",
  "4star": "activateFourStarTab",
  build: "activateBuildTab",
  other: "activateOtherTab",
  "character-info": "activateCharacterInfoTab",
  "weapon-info": "activateWeaponInfoTab"
};
const DEFAULT_LAZY_SRC = {
  simulator: "js/tab-simulator.js",
  "4star": "js/tab-4star.js",
  build: "js/tab-build.js",
  other: "js/tab-other.js",
  "character-info": "js/character-info-tab.js",
  "weapon-info": "js/weapon-info-tab.js"
};
const TAB_LOADING_CONTAINER = {
  simulator: "oddsPanel",
  "character-info": "characterInfoPanel",
  "weapon-info": "weaponInfoPanel",
  "4star": "tab4starContent",
  build: "buildCardsWrap",
  other: "tabOtherContent"
};
const loadedLazyTabs = /* @__PURE__ */ new Set();
const lazyTabPromises = {};
function ensureTabScriptLoaded(tab) {
  if (loadedLazyTabs.has(tab)) return Promise.resolve();
  const activatorName = TAB_ACTIVATORS[tab];
  if (activatorName && typeof window[activatorName] === "function") {
    loadedLazyTabs.add(tab);
    return Promise.resolve();
  }
  if (lazyTabPromises[tab]) return lazyTabPromises[tab];
  const containerId = TAB_LOADING_CONTAINER[tab];
  if (containerId) {
    const container = document.getElementById(containerId);
    if (container && !container.innerHTML) {
      container.innerHTML = '<div class="ci-item-desc ci-muted">Loading\u2026</div>';
    }
  }
  const manifestEntry = (window.__LAZY_TABS__ || {})[tab];
  const src = manifestEntry && manifestEntry.src || DEFAULT_LAZY_SRC[tab];
  lazyTabPromises[tab] = new Promise((resolve, reject) => {
    if (!src) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      loadedLazyTabs.add(tab);
      resolve();
    };
    script.onerror = () => {
      delete lazyTabPromises[tab];
      script.remove();
      reject(new Error("Failed to load tab script: " + src));
    };
    document.body.appendChild(script);
  });
  return lazyTabPromises[tab];
}
function setActiveRarityTab(tab, opts) {
  const skipHash = opts && opts.skipHash;
  const is5 = tab === "5star";
  const is4 = tab === "4star";
  const isSimulator = tab === "simulator";
  const isBuild = tab === "build";
  const isOther = tab === "other";
  const isCharacterInfo = tab === "character-info";
  const isWeaponInfo = tab === "weapon-info";
  document.documentElement.setAttribute("data-active-tab", tab);
  window.scrollTo(0, 0);
  const btn5 = document.getElementById("tab5starBtn");
  const btn4 = document.getElementById("tab4starBtn");
  const btnOdds = document.getElementById("tabOddsBtn");
  const btnBuild = document.getElementById("tabBuildBtn");
  const btnOther = document.getElementById("tabOtherBtn");
  const btnInfo = document.getElementById("tabInfoBtn");
  const btnWeaponInfo = document.getElementById("tabWeaponInfoBtn");
  [[btn5, is5], [btn4, is4], [btnOdds, isSimulator], [btnBuild, isBuild], [btnOther, isOther], [btnInfo, isCharacterInfo], [btnWeaponInfo, isWeaponInfo]].forEach(([btn, active]) => {
    if (btn) btn.classList.toggle("active", active);
  });
  const activatorName = TAB_ACTIVATORS[tab];
  if (activatorName) {
    ensureTabScriptLoaded(tab).then(() => {
      const fn = window[activatorName];
      if (typeof fn === "function") fn();
    }).catch((err) => {
      console.error(err);
      const containerId = TAB_LOADING_CONTAINER[tab];
      const container = containerId && document.getElementById(containerId);
      if (container) {
        container.innerHTML = '<div class="ci-item-desc ci-muted">Couldn\u2019t load this tab. <a href="#" id="tabRetryLink">Try again</a></div>';
        const retry = document.getElementById("tabRetryLink");
        if (retry) retry.addEventListener("click", (e) => {
          e.preventDefault();
          setActiveRarityTab(tab, { skipHash: true });
        });
      }
    });
  }
  const indicator = document.getElementById("mobileTabLabel");
  if (indicator) {
    const icons = { "5star": "icon_5star.webp", "4star": "icon_4star.webp", simulator: "icon_simulator.webp", build: "icon_build.webp", "character-info": "icon_character_info.webp", "weapon-info": "icon_weapon_info.webp", other: "icon_other.webp" };
    const labels = { "5star": "Wish Planner", "4star": "4\u2605 Odds", simulator: "Simulator", build: "Build", other: "Other", "character-info": "Characters", "weapon-info": "Weapons" };
    const iconFile = icons[tab];
    const iconHtml = iconFile ? `<img class="nav-link-icon nav-link-icon-img" src="assets/data/custom_icons/${iconFile}" alt="">` : "";
    indicator.innerHTML = iconHtml + (labels[tab] || "");
  }
  if (!skipHash) {
    const TAB_PATHS = {
      "5star": "",
      "4star": "4star/",
      simulator: "simulator/",
      build: "build/",
      other: "other/",
      "character-info": "character-info/",
      "weapon-info": "weapon-info/"
    };
    const root = window.__SITE_ROOT__ || "/";
    const newPath = root + (TAB_PATHS[tab] || "");
    if (location.pathname !== newPath || location.hash) {
      history.pushState({ tab }, "", newPath);
    }
  }
}
function bindTabBtn(id, tab) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", () => setActiveRarityTab(tab));
}
bindTabBtn("tab5starBtn", "5star");
bindTabBtn("tab4starBtn", "4star");
bindTabBtn("tabOddsBtn", "simulator");
bindTabBtn("tabBuildBtn", "build");
bindTabBtn("tabOtherBtn", "other");
bindTabBtn("tabInfoBtn", "character-info");
bindTabBtn("tabWeaponInfoBtn", "weapon-info");
(function() {
  const VALID_TABS = ["5star", "4star", "simulator", "build", "other", "character-info", "weapon-info"];
  const initialTab = parseHashRoute().tab;
  if (VALID_TABS.includes(initialTab)) setActiveRarityTab(initialTab, { skipHash: true });
  window.addEventListener("popstate", () => {
    const tab = parseHashRoute().tab;
    setActiveRarityTab(VALID_TABS.includes(tab) ? tab : "5star", { skipHash: true });
  });
})();
(function() {
  const toggleBtn = document.getElementById("navToggleBtn");
  const sidebar = document.querySelector(".sidebar");
  if (!toggleBtn || !sidebar) return;
  function closeNav() {
    sidebar.classList.remove("nav-open");
    toggleBtn.setAttribute("aria-expanded", "false");
  }
  toggleBtn.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("nav-open");
    toggleBtn.setAttribute("aria-expanded", String(isOpen));
  });
  document.querySelectorAll(".sidebar-nav .nav-link").forEach((btn) => {
    btn.addEventListener("click", closeNav);
  });
  document.addEventListener("click", (e) => {
    if (!sidebar.contains(e.target)) closeNav();
  });
})();
