(function() {
  "use strict";
  function getJson(url) {
    return fetch(url).then((res) => res.ok ? res.json() : null).catch(() => null);
  }
  function dataAssetSrc(path) {
    if (!path) return null;
    if (/^(https?:)?\/\//.test(path) || path.startsWith("assets/data/")) return path;
    return `assets/data/${path}`;
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function weaponTypeIconSrc(type) {
    return type ? dataAssetSrc(`weapon_types_icons/Icon_${type}_type.webp`) : null;
  }
  function fetchWeaponProfile(id) {
    const base = `assets/data/weapon-profiles/${id}`;
    return Promise.all([getJson(`${base}/info.json`), getJson(`${base}/refinements/refinements.json`), getJson(`${base}/materials/materials.json`)]).then(([info, refinement, materials]) => {
      if (!info) return null;
      return {
        ...info,
        refinement: refinement || null,
        promotes: materials && materials.promotes || [],
        weaponMaterials: materials && materials.weaponMaterials || [],
        enemyDrops: materials && materials.enemyDrops || []
      };
    });
  }
  function weaponRoster() {
    const roster = typeof GENSHIN_WEAPON_PROFILE_INDEX !== "undefined" ? GENSHIN_WEAPON_PROFILE_INDEX : [];
    return roster.slice().sort((a, b) => (b.rarity || 0) - (a.rarity || 0) || a.name.localeCompare(b.name));
  }
  const WEAPON_TYPE_ORDER = ["Sword", "Claymore", "Polearm", "Bow", "Catalyst"];
  const RARITY_ORDER = [5, 4, 3];
  function filterBarHtml() {
    const typeChips = WEAPON_TYPE_ORDER.map((t) => `
            <button type="button" class="ci-filter-chip" data-filter-group="type" data-filter-value="${t}">
                <img src="${weaponTypeIconSrc(t)}" alt="">${t}
            </button>`).join("");
    const rarityChips = RARITY_ORDER.map((r) => `
            <button type="button" class="ci-filter-chip ci-filter-chip-rarity rarity-${r}" data-filter-group="rarity" data-filter-value="${r}">${r}\u2605</button>`).join("");
    return `
            <div class="ci-filter-bar">
                <input type="text" class="ci-filter-search" id="wiGridSearch" placeholder="Search name\u2026" autocomplete="off">
                <div class="ci-filter-group">${typeChips}</div>
                <div class="ci-filter-group">${rarityChips}</div>
            </div>`;
  }
  function weaponCardHref(w) {
    const slugs = typeof GENSHIN_WEAPON_SLUGS !== "undefined" ? GENSHIN_WEAPON_SLUGS : {};
    const slug = slugs[w.id];
    return slug ? `weapon-info/${slug}/` : `#/weapon-info?weapon=${encodeURIComponent(w.id)}`;
  }
  function weaponCardHtml(w) {
    return `
            <a class="ci-grid-card" href="${weaponCardHref(w)}" data-weapon-id="${escapeHtml(w.id)}" data-type="${escapeHtml(w.type || "")}" data-rarity="${w.rarity || ""}" data-name="${escapeHtml(w.name.toLowerCase())}">
                <img class="ci-grid-icon rarity-${w.rarity || 3}" src="${dataAssetSrc(w.icon)}" alt="" loading="lazy">
                <span class="ci-grid-name">${escapeHtml(w.name)}</span>
            </a>`;
  }
  function bindGridNav(container) {
    container.querySelectorAll(".ci-grid-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigateWeaponInfo(card.dataset.weaponId);
      });
    });
  }
  function weaponGridHtml(roster) {
    if (!roster.length) return '<div class="ci-item-desc ci-muted">No weapons found.</div>';
    return `<div class="ci-grid">${roster.map(weaponCardHtml).join("")}</div>`;
  }
  function bindGridFilters(root) {
    const chips = root.querySelectorAll(".ci-filter-chip");
    const cards = root.querySelectorAll(".ci-grid-card");
    const searchInput = root.querySelector("#wiGridSearch");
    const active = {
      type: /* @__PURE__ */ new Set(),
      rarity: /* @__PURE__ */ new Set()
    };
    let searchTerm = "";
    function applyFilters() {
      cards.forEach((card) => {
        const typeOk = active.type.size === 0 || active.type.has(card.dataset.type);
        const rarityOk = active.rarity.size === 0 || active.rarity.has(card.dataset.rarity);
        const searchOk = !searchTerm || card.dataset.name.includes(searchTerm);
        card.style.display = typeOk && rarityOk && searchOk ? "" : "none";
      });
    }
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const group = chip.dataset.filterGroup;
        const value = chip.dataset.filterValue;
        chip.classList.toggle("active");
        if (chip.classList.contains("active")) active[group].add(value);
        else active[group].delete(value);
        applyFilters();
      });
    });
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        applyFilters();
      });
    }
  }
  function renderWeaponBrowse(root) {
    const roster = weaponRoster();
    root.innerHTML = `${filterBarHtml()}${weaponGridHtml(roster)}`;
    bindGridFilters(root);
    bindGridNav(root);
  }
  const SUBSTAT_LABELS = {
    FIGHT_PROP_HP_PERCENT: {
      label: "HP%",
      percent: true
    },
    FIGHT_PROP_ATTACK_PERCENT: {
      label: "ATK%",
      percent: true
    },
    FIGHT_PROP_DEFENSE_PERCENT: {
      label: "DEF%",
      percent: true
    },
    FIGHT_PROP_CRITICAL: {
      label: "CRIT Rate",
      percent: true
    },
    FIGHT_PROP_CRITICAL_HURT: {
      label: "CRIT DMG",
      percent: true
    },
    FIGHT_PROP_CHARGE_EFFICIENCY: {
      label: "Energy Recharge",
      percent: true
    },
    FIGHT_PROP_ELEMENT_MASTERY: {
      label: "Elemental Mastery",
      percent: false
    },
    FIGHT_PROP_HEAL_ADD: {
      label: "Healing Bonus",
      percent: true
    },
    FIGHT_PROP_PHYSICAL_ADD_HURT: {
      label: "Physical DMG%",
      percent: true
    },
    FIGHT_PROP_FIRE_ADD_HURT: {
      label: "Pyro DMG%",
      percent: true
    },
    FIGHT_PROP_WATER_ADD_HURT: {
      label: "Hydro DMG%",
      percent: true
    },
    FIGHT_PROP_ELEC_ADD_HURT: {
      label: "Electro DMG%",
      percent: true
    },
    FIGHT_PROP_GRASS_ADD_HURT: {
      label: "Dendro DMG%",
      percent: true
    },
    FIGHT_PROP_WIND_ADD_HURT: {
      label: "Anemo DMG%",
      percent: true
    },
    FIGHT_PROP_ROCK_ADD_HURT: {
      label: "Geo DMG%",
      percent: true
    },
    FIGHT_PROP_ICE_ADD_HURT: {
      label: "Cryo DMG%",
      percent: true
    }
  };
  function substatMeta(key) {
    if (SUBSTAT_LABELS[key]) return SUBSTAT_LABELS[key];
    const words = String(key || "").replace(/^FIGHT_PROP_/, "").split("_");
    return {
      label: words.map((w) => w[0] + w.slice(1).toLowerCase()).join(" ") || "Substat",
      percent: true
    };
  }
  function formatStatValue(value, percent) {
    if (value === null || value === void 0) return "\u2014";
    return percent ? `${(value * 100).toFixed(1)}%` : Math.round(value).toString();
  }
  function statItemsHtml(w) {
    const items = [];
    if (w.base_atk_lvl1 !== void 0 && w.base_atk_lvl90 !== void 0) {
      items.push(["Base ATK", formatStatValue(w.base_atk_lvl1, false), formatStatValue(w.base_atk_lvl90, false)]);
    }
    if (w.substat_type) {
      const meta = substatMeta(w.substat_type);
      items.push([meta.label, formatStatValue(w.substat_lvl1, meta.percent), formatStatValue(w.substat_lvl90, meta.percent)]);
    }
    return items.map(([label, v1, v90]) => `
            <div class="wi-stat-item">
                <div class="wi-stat-label">${escapeHtml(label)}</div>
                <div class="wi-stat-values">
                    <div class="wi-stat-value-col">
                        <span class="wi-stat-value">${escapeHtml(v1)}</span>
                        <span class="wi-level-chip">Lv. 1</span>
                    </div>
                    <span class="wi-stat-arrow">\u2192</span>
                    <div class="wi-stat-value-col">
                        <span class="wi-stat-value">${escapeHtml(v90)}</span>
                        <span class="wi-level-chip">Lv. 90</span>
                    </div>
                </div>
            </div>`);
  }
  function heroTypeCaptionHtml(w) {
    const parts = [];
    if (w.rarity) parts.push(`<span class="wi-hero-type-star">${"\u2605".repeat(w.rarity)}</span>`);
    if (w.type) parts.push(escapeHtml(w.type));
    if (!parts.length) return "";
    return `<div class="wi-hero-type-caption">${parts.join(" ")}</div>`;
  }
  function statBlockHtml(w) {
    const stats = statItemsHtml(w);
    if (!stats.length) return '<div class="ci-item-desc ci-muted">No stat data.</div>';
    return `<div class="wi-stat-block">${stats.join("")}</div>`;
  }
  function weaponPassiveMiniHtml(w) {
    const r = w.refinement;
    const r1 = r && (r.levels || []).find((lvl) => lvl.refinement === 1);
    if (!r1) return "";
    return `
            <div class="wi-passive-mini">
                <div class="wi-desc-header">Weapon Passive</div>
                <div class="wi-passive-mini-name">${escapeHtml(r.name || "Passive")}</div>
                <div class="wi-passive-mini-desc">${escapeHtml(r1.description)}</div>
            </div>`;
  }
  function weaponHeaderHtml(w) {
    return `
            <div class="wi-hero">
                <div class="wi-hero-image-wrap">
                    <div class="wi-hero-image-col">
                        <img class="wi-hero-portrait" src="${dataAssetSrc(w.icon)}" alt="">
                    </div>
                    ${heroTypeCaptionHtml(w)}
                </div>
                <div class="wi-hero-primary-col">
                    <div class="ci-hero-name">${escapeHtml(w.name)}</div>
                    ${statBlockHtml(w)}
                </div>
                <div class="wi-hero-secondary-col">
                    ${weaponPassiveMiniHtml(w)}
                </div>
            </div>`;
  }
  function descriptionSectionHtml(w) {
    return `
            <section class="ci-panel">
                <h2 class="ci-panel-title">Description</h2>
                ${w.description ? `<p class="wi-description">${escapeHtml(w.description)}</p>` : '<div class="ci-item-desc ci-muted">No description available.</div>'}
            </section>`;
  }
  function refinementHtml(w) {
    const r = w.refinement;
    if (!r || !(r.levels || []).length) return '<div class="ci-item-desc ci-muted">No refinement data.</div>';
    const tabs = r.levels.map((lvl) => `
            <button type="button" class="wi-refine-tab${lvl.refinement === 1 ? " wi-refine-tab--active" : ""}" data-refine-tab="${lvl.refinement}">R${lvl.refinement}</button>`).join("");
    const panels = r.levels.map((lvl) => `
            <div class="ci-passive-card wi-refine-panel${lvl.refinement === 1 ? " wi-refine-panel--active" : ""}" data-refine-panel="${lvl.refinement}">
                <div class="ci-passive-body">
                    <div class="ci-passive-name">${escapeHtml(r.name || "Refinement")} \u2014 R${lvl.refinement}</div>
                    <div class="ci-passive-desc">${escapeHtml(lvl.description)}</div>
                </div>
            </div>`).join("");
    return `
            <div class="wi-refine-tablist" role="tablist">${tabs}</div>
            <div class="wi-refine-panels">${panels}</div>`;
  }
  function wireRefinementTabs(root) {
    const tabs = root.querySelectorAll("[data-refine-tab]");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-refine-tab");
        root.querySelectorAll("[data-refine-tab]").forEach((t) => t.classList.toggle("wi-refine-tab--active", t === tab));
        root.querySelectorAll("[data-refine-panel]").forEach((p) => p.classList.toggle("wi-refine-panel--active", p.getAttribute("data-refine-panel") === target));
      });
    });
  }
  function computeMaterialTotals(w) {
    const qtyById = {};
    (w.promotes || []).forEach((p) => {
      (p.items || []).forEach((it) => {
        qtyById[it.id] = (qtyById[it.id] || 0) + (it.qty || 0);
      });
    });
    return {
      qtyById
    };
  }
  function materialTileHtml(item, qtyById, rowId, isSelected) {
    const qty = qtyById[item.id] || 0;
    return `
            <button type="button" class="wi-mat-tile${isSelected ? " wi-mat-tile--selected" : ""}" data-row="${rowId}" data-name="${escapeHtml(item.name)}" title="${escapeHtml(item.name)} \xD7${qty}">
                <img class="wi-mat-tile-icon rarity-${item.rarity || 3}" src="${dataAssetSrc(item.icon)}" alt="" loading="lazy">
                <span class="wi-mat-tile-qty">\xD7${qty}</span>
            </button>`;
  }
  function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }
  function materialTileRowHtml(items, qtyById, rowId) {
    if (!items.length) return "";
    const maxRarity = Math.max(...items.map((it) => it.rarity || 0));
    const defaultIndex = items.findIndex((it) => (it.rarity || 0) === maxRarity);
    const tiles = items.map((item, i) => materialTileHtml(item, qtyById, rowId, i === defaultIndex)).join("");
    return `
            <div class="wi-mat-tile-row">
                <div class="wi-mat-tiles">${tiles}</div>
                <div class="wi-mat-tile-name" data-row-name="${rowId}">${escapeHtml(items[defaultIndex].name)}</div>
            </div>`;
  }
  function slugify(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function materialGroupHtml(title, items, qtyById, rowSize) {
    if (!items || !items.length) return "";
    const rows = rowSize ? chunk(items, rowSize) : [items];
    const slug = slugify(title);
    const rowsHtml = rows.map((row, i) => materialTileRowHtml(row, qtyById, `${slug}-${i}`)).join("");
    return `
            <div class="wi-mat-group">
                <div class="wi-mat-group-title">${escapeHtml(title)}</div>
                ${rowsHtml}
            </div>`;
  }
  function wireMaterialTileRows(root) {
    root.querySelectorAll(".wi-mat-tile-row").forEach((rowEl) => {
      const nameEl = rowEl.querySelector(".wi-mat-tile-name");
      const tiles = rowEl.querySelectorAll(".wi-mat-tile");
      tiles.forEach((tile) => {
        tile.addEventListener("click", () => {
          tiles.forEach((t) => t.classList.toggle("wi-mat-tile--selected", t === tile));
          if (nameEl) nameEl.textContent = tile.dataset.name;
        });
      });
    });
  }
  function materialsHtml(w) {
    const { qtyById } = computeMaterialTotals(w);
    const hasAny = (w.weaponMaterials || []).length || (w.enemyDrops || []).length;
    if (!hasAny) return '<div class="ci-item-desc ci-muted">No ascension material data.</div>';
    return `
            <div class="wi-mat-dashboard">
                ${materialGroupHtml("Weapon Materials", w.weaponMaterials, qtyById)}
                ${materialGroupHtml("Enemy Materials", w.enemyDrops, qtyById, 3)}
            </div>`;
  }
  function weaponSwitchHtml() {
    return `
            <div class="ci-switch-wrap">
                <input type="text" class="ci-filter-search ci-switch-search" id="wiWeaponSwitch" placeholder="Search name\u2026" autocomplete="off">
                <div class="ci-switch-results" id="wiWeaponSwitchResults" hidden></div>
            </div>`;
  }
  function bindWeaponSwitch(root, roster) {
    const input = root.querySelector("#wiWeaponSwitch");
    const results = root.querySelector("#wiWeaponSwitchResults");
    if (!input || !results) return;
    const MAX_RESULTS = 8;
    function renderResults(term) {
      if (!term) {
        results.hidden = true;
        results.innerHTML = "";
        return;
      }
      const matches = roster.filter((w) => w.name.toLowerCase().includes(term)).slice(0, MAX_RESULTS);
      if (!matches.length) {
        results.innerHTML = '<div class="ci-switch-empty">No matches</div>';
        results.hidden = false;
        return;
      }
      results.innerHTML = matches.map((w) => `
                <button type="button" class="ci-switch-result" data-weapon-id="${escapeHtml(w.id)}">
                    <img class="ci-switch-result-icon rarity-${w.rarity || 3}" src="${dataAssetSrc(w.icon)}" alt="" loading="lazy">
                    <span>${escapeHtml(w.name)}</span>
                </button>`).join("");
      results.hidden = false;
    }
    input.addEventListener("input", () => renderResults(input.value.trim().toLowerCase()));
    input.addEventListener("focus", () => {
      if (input.value.trim()) renderResults(input.value.trim().toLowerCase());
    });
    results.addEventListener("click", (e) => {
      const btn = e.target.closest(".ci-switch-result");
      if (!btn) return;
      input.value = "";
      results.hidden = true;
      results.innerHTML = "";
      navigateWeaponInfo(btn.dataset.weaponId);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = results.querySelector(".ci-switch-result");
        if (first) {
          e.preventDefault();
          input.value = "";
          results.hidden = true;
          results.innerHTML = "";
          navigateWeaponInfo(first.dataset.weaponId);
        }
      } else if (e.key === "Escape") {
        results.hidden = true;
        results.innerHTML = "";
        input.blur();
      }
    });
    document.addEventListener("click", (e) => {
      if (!root.contains(e.target)) return;
      if (e.target === input || results.contains(e.target)) return;
      results.hidden = true;
    });
  }
  function renderWeaponDetail(root, id) {
    root.innerHTML = `
            <div class="ci-detail-topbar">
                ${weaponSwitchHtml()}
            </div>
            <div id="wiContent" class="ci-item-desc ci-muted">Loading\u2026</div>`;
    bindWeaponSwitch(root, weaponRoster());
    const content = root.querySelector("#wiContent");
    fetchWeaponProfile(id).then((w) => {
      if (!w) {
        content.innerHTML = '<div class="ci-item-desc ci-muted">Weapon data not found.</div>';
        return;
      }
      content.className = "";
      content.innerHTML = `
                ${weaponHeaderHtml(w)}
                <div class="ci-layout">
                    <div class="ci-split-row wi-split-row">
                        <section class="ci-panel wi-area-refine">
                            <h2 class="ci-panel-title">Refinement</h2>
                            ${refinementHtml(w)}
                        </section>
                        <section class="ci-panel wi-area-mats">
                            <h2 class="ci-panel-title">Ascension Materials</h2>
                            ${materialsHtml(w)}
                        </section>
                        <div class="wi-area-desc">${descriptionSectionHtml(w)}</div>
                    </div>
                </div>`;
      wireRefinementTabs(content);
      wireMaterialTileRows(content);
    });
  }
  function navigateWeaponInfo(id) {
    const slugs = typeof GENSHIN_WEAPON_SLUGS !== "undefined" ? GENSHIN_WEAPON_SLUGS : {};
    const slug = id ? slugs[id] : null;
    const root = typeof window !== "undefined" && window.__SITE_ROOT__ || "/";
    const newPath = slug ? `${root}weapon-info/${slug}/` : `${root}weapon-info/`;
    if (location.pathname !== newPath || location.hash) {
      history.pushState({
        tab: "weapon-info",
        weapon: id || null
      }, "", newPath);
    }
    renderWeaponInfoTab();
  }
  function renderWeaponInfoTab() {
    const root = document.getElementById("weaponInfoPanel");
    if (!root) return;
    const requestedId = (window.parseHashRoute ? window.parseHashRoute().params : new URLSearchParams()).get("weapon");
    if (!requestedId) {
      renderWeaponBrowse(root);
      return;
    }
    renderWeaponDetail(root, requestedId);
  }
  window.activateWeaponInfoTab = renderWeaponInfoTab;
})();
