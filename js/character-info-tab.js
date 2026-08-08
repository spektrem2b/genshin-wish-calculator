(function() {
  "use strict";
  const DEFAULT_CHARACTER_ID = "10000002";
  function getJson(url) {
    return fetch(url).then((res) => res.ok ? res.json() : null).catch(() => null);
  }
  const CHARACTER_DATA_OVERRIDES = {
    traveler: {
      region: "Main Character"
    },
    zibai: {
      region: "Liyue"
    }
  };
  function applyCharacterOverrides(info) {
    if (!info) return info;
    const key = String(info.name || "").trim().toLowerCase();
    const override = CHARACTER_DATA_OVERRIDES[key];
    return override ? {
      ...info,
      ...override
    } : info;
  }
  const TRAVELER_VARIANT_RE = /^(\d+)-(anemo|geo|electro|dendro|hydro|pyro|cryo)$/i;
  function fetchFullCharacterProfile(id) {
    const travelerVariant = id.match(TRAVELER_VARIANT_RE);
    const fetchId = travelerVariant ? `${travelerVariant[1]}-pyro` : id;
    const base = `assets/data/character-profiles/${fetchId}`;
    return Promise.all([getJson(`${base}/info.json`), getJson(`${base}/skills/talents.json`), getJson(`${base}/constellations/constellations.json`), getJson(`${base}/materials/materials.json`), getCharacterCurve()]).then(([info, talents, constellations, materials, curveData]) => {
      info = applyCharacterOverrides(info);
      if (!info) return null;
      if (travelerVariant) {
        const element = titleCase(travelerVariant[2]);
        info = {
          ...info,
          element,
          name: `${info.name} (${element})`
        };
      }
      return {
        ...info,
        talents: (Array.isArray(talents) ? talents : talents && talents.talents) || [],
        constellations: (Array.isArray(constellations) ? constellations : constellations && constellations.constellations) || [],
        promotes: materials && materials.promotes || [],
        baseStatsComputed: computeBaseStats(info.baseStats, curveData),
        specialStat: info.specialStat,
        specialStatLabelText: specialStatLabel(info.specialStat),
        ascensionStatBonus: (materials && materials.ascensionStatBonus) ?? null
      };
    });
  }
  const STAT_CURVE_LEVELS = [1, 90, 95, 100];
  let selectedStatLevel = 90;
  let characterCurvePromise = null;
  function getCharacterCurve() {
    if (!characterCurvePromise) {
      characterCurvePromise = getJson("assets/data/curves/character_curve.json").then((data) => data || {});
    }
    return characterCurvePromise;
  }
  function curveMultiplier(curveData, level, growthType) {
    const row = curveData && curveData[String(level)];
    const val = row && row.curveInfos && row.curveInfos[growthType];
    return typeof val === "number" ? val : 1;
  }
  function statValueAtLevel(curveData, stat, level) {
    return stat.initValue * curveMultiplier(curveData, level, stat.growthType);
  }
  const BASE_STAT_PROP_LABELS = {
    FIGHT_PROP_BASE_HP: "HP",
    FIGHT_PROP_BASE_ATTACK: "ATK",
    FIGHT_PROP_BASE_DEFENSE: "DEF"
  };
  function computeBaseStats(baseStats, curveData) {
    if (!baseStats || !baseStats.length) return null;
    const out = {};
    baseStats.forEach((stat) => {
      const label = BASE_STAT_PROP_LABELS[stat.propType];
      if (!label) return;
      const byLevel = {};
      STAT_CURVE_LEVELS.forEach((level) => {
        byLevel[level] = statValueAtLevel(curveData, stat, level);
      });
      out[label] = byLevel;
    });
    return out;
  }
  const SPECIAL_STAT_LABELS = {
    FIGHT_PROP_HP_PERCENT: "HP%",
    FIGHT_PROP_ATTACK_PERCENT: "ATK%",
    FIGHT_PROP_DEFENSE_PERCENT: "DEF%",
    FIGHT_PROP_CRITICAL: "CRIT Rate",
    FIGHT_PROP_CRITICAL_HURT: "CRIT DMG",
    FIGHT_PROP_CHARGE_EFFICIENCY: "Energy Recharge",
    FIGHT_PROP_ELEMENT_MASTERY: "Elemental Mastery",
    FIGHT_PROP_HEAL_ADD: "Healing Bonus",
    FIGHT_PROP_PHYSICAL_ADD_HURT: "Physical DMG%",
    FIGHT_PROP_FIRE_ADD_HURT: "Pyro DMG%",
    FIGHT_PROP_WATER_ADD_HURT: "Hydro DMG%",
    FIGHT_PROP_ELEC_ADD_HURT: "Electro DMG%",
    FIGHT_PROP_GRASS_ADD_HURT: "Dendro DMG%",
    FIGHT_PROP_WIND_ADD_HURT: "Anemo DMG%",
    FIGHT_PROP_ROCK_ADD_HURT: "Geo DMG%",
    FIGHT_PROP_ICE_ADD_HURT: "Cryo DMG%"
  };
  function specialStatLabel(key) {
    if (!key) return null;
    if (SPECIAL_STAT_LABELS[key]) return SPECIAL_STAT_LABELS[key];
    const words = String(key).replace(/^FIGHT_PROP_/, "").split("_");
    return words.map((w) => w[0] + w.slice(1).toLowerCase()).join(" ") || key;
  }
  function formatStatNumber(value) {
    if (value === null || value === void 0) return "\u2014";
    return Math.round(value).toLocaleString("en-US");
  }
  const SPECIAL_STAT_IS_FLAT = /* @__PURE__ */ new Set(["FIGHT_PROP_ELEMENT_MASTERY"]);
  function formatAscensionStatBonus(value, key) {
    if (value === null || value === void 0) return null;
    if (SPECIAL_STAT_IS_FLAT.has(key)) return Math.round(value).toString();
    return `${(value * 100).toFixed(1)}%`;
  }
  const BASE_STAT_ROW_ORDER = ["HP", "ATK", "DEF"];
  const STAT_LEVEL_TOGGLE_LEVELS = STAT_CURVE_LEVELS.filter((l) => l !== 1);
  function statLevelToggleHtml(level) {
    const buttons = STAT_LEVEL_TOGGLE_LEVELS.map((l) => `<button type="button" class="ci-stat-level-btn${l === level ? " active" : ""}" data-stat-level="${l}">${l}</button>`).join("");
    return `<div class="ci-stat-level-toggle" role="group" aria-label="Comparison level">${buttons}</div>`;
  }
  function statsRowsHtml(c, level) {
    level = STAT_LEVEL_TOGGLE_LEVELS.includes(level) ? level : selectedStatLevel;
    const stats = c.baseStatsComputed;
    if (!stats) return '<div class="ci-item-desc ci-muted">No base stat data.</div>';
    const rows = BASE_STAT_ROW_ORDER.filter((k) => stats[k]).map((k) => `
            <div class="ci-stats-row"><span>${escapeHtml(k)}</span><span>${formatStatNumber(stats[k][1])} \u2192 ${formatStatNumber(stats[k][level])}</span></div>`);
    if (c.specialStatLabelText) {
      const bonus = formatAscensionStatBonus(c.ascensionStatBonus, c.specialStat);
      const value = bonus ? `${escapeHtml(c.specialStatLabelText)} +${bonus}` : escapeHtml(c.specialStatLabelText);
      rows.push(`
            <div class="ci-stats-row"><span>Ascension Stat</span><span>${value}</span></div>`);
    }
    if (!rows.length) return '<div class="ci-item-desc ci-muted">No base stat data.</div>';
    return `<div class="ci-stats">${rows.join("")}</div>`;
  }
  function dataAssetSrc(path) {
    if (!path) return null;
    if (/^(https?:)?\/\//.test(path) || path.startsWith("assets/data/")) return path;
    return `assets/data/${path}`;
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function starsHtml(rarity) {
    return "\u2605".repeat(rarity || 0);
  }
  function elementIconSrc(element) {
    return element ? dataAssetSrc(`element_icons/Element_${element}.svg`) : null;
  }
  function weaponIconSrc(weaponType) {
    return weaponType ? dataAssetSrc(`weapon_types_icons/Icon_${weaponType}_type.webp`) : null;
  }
  const REGION_ICON_FALLBACK = dataAssetSrc("region_icons/unknown-region.webp");
  function regionIconSrc(region) {
    return region ? dataAssetSrc(`region_icons/${region.toLowerCase()}.webp`) : REGION_ICON_FALLBACK;
  }
  function icyVeinsSlug(name) {
    return String(name || "").toLowerCase().replace(/['\u2019]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
  }
  function genshinBuildsSlug(c) {
    if (!c) return "";
    if (/traveler/i.test(c.name || "")) {
      const el = String(c.element || "").toLowerCase();
      return el ? `${el}-traveler` : "traveler";
    }
    return icyVeinsSlug(c.name);
  }
  function guidesHtml(c) {
    return `
            <div class="ci-hero-guides">
                <a class="resource-btn ci-hero-guide-btn ci-hero-guide-primary" href="https://genshin-impact-helper-team.github.io/genshin-builds/en/${genshinBuildsSlug(c)}" target="_blank" rel="noopener noreferrer">
                    <img class="resource-btn-icon" src="assets/data/custom_icons/genshin-builds-guide.webp" alt="">
                    Genshin Builds
                </a>
                <div class="ci-hero-guides-row">
                    <a class="resource-btn ci-hero-guide-btn" href="https://www.icy-veins.com/genshin-impact/${icyVeinsSlug(c.name)}-guide-best-builds" target="_blank" rel="noopener noreferrer" title="Icy Veins">
                        <img class="resource-btn-icon" src="assets/data/custom_icons/icy-veins-guide.webp" alt="">
                    </a>
                    <a class="resource-btn ci-hero-guide-btn" href="https://keqingmains.com/#search" target="_blank" rel="noopener noreferrer" title="KQM">
                        <img class="resource-btn-icon" src="assets/data/custom_icons/KQM-guide.webp" alt="">
                    </a>
                </div>
            </div>`;
  }
  function titleCase(str) {
    return String(str || "").replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }
  function applyElementTheme(page, element) {
    if (!element) {
      page.removeAttribute("data-element");
      return;
    }
    page.setAttribute("data-element", String(element).toLowerCase());
  }
  function birthdayLabel(b) {
    if (!b) return null;
    const months = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[b.month] || ""} ${b.day}`.trim();
  }
  function releaseLabel(release) {
    if (!release) return null;
    return new Date(release).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }
  function formatParamToken(token, params) {
    const m = token.match(/^param(\d+):([A-Za-z0-9]+)$/);
    if (!m) return token;
    const idx = parseInt(m[1], 10) - 1;
    const fmt = m[2];
    const raw = params[idx];
    if (raw === void 0) return "";
    const isPercent = fmt.endsWith("P");
    const decimalsMatch = fmt.match(/F(\d)/);
    const decimals = decimalsMatch ? parseInt(decimalsMatch[1], 10) : isPercent ? 1 : 0;
    const value = isPercent ? raw * 100 : raw;
    return value.toFixed(decimals) + (isPercent ? "%" : "");
  }
  function renderTemplate(template, params) {
    return template.replace(/\{([^}]+)\}/g, (_, inner) => formatParamToken(inner, params));
  }
  function parseDescRow(raw, params) {
    if (!raw) return null;
    const pipeIdx = raw.indexOf("|");
    if (pipeIdx === -1) return null;
    const label = raw.slice(0, pipeIdx);
    const template = raw.slice(pipeIdx + 1);
    if (!label) return null;
    return {
      label,
      value: renderTemplate(template, params)
    };
  }
  function scalingTableHtml(levels, uid) {
    const rows = (levels || []).filter((l) => l.level && l.description && l.description.length).sort((a, b) => a.level - b.level);
    if (!rows.length) return "";
    const labels = (rows[0].description || []).map((raw) => parseDescRow(raw, rows[0].params)).filter(Boolean).map((r) => r.label);
    if (!labels.length) return "";
    const parsedByLevel = rows.map((l) => (l.description || []).map((raw) => parseDescRow(raw, l.params)).filter(Boolean));
    const colCls = (l) => l.level === 10 ? ' class="ci-level-10-col"' : "";
    const headerCells = rows.map((l) => `<th${colCls(l)}>${l.level}</th>`).join("");
    const bodyRows = labels.map((label, labelIdx) => {
      const cells = rows.map((l, li) => {
        const parsed = parsedByLevel[li];
        const value = escapeHtml(parsed[labelIdx] && parsed[labelIdx].value || "\u2014");
        return `<td${colCls(l)}>${value}</td>`;
      }).join("");
      return `<tr><td class="ci-scaling-rowlabel">${escapeHtml(label)}</td>${cells}</tr>`;
    }).join("");
    return `
            <div class="ci-scaling-wrap">
                <table class="ci-scaling" id="${uid}">
                    <thead><tr><th class="ci-scaling-corner">Lv.</th>${headerCells}</tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>`;
  }
  function quickStatsHtml(t) {
    const stats = [];
    if (t.cooldown !== null && t.cooldown !== void 0 && t.cooldown > 0) {
      stats.push(["Cooldown", `${t.cooldown}s`]);
    }
    if (t.cost !== null && t.cost !== void 0 && t.cost > 0) {
      stats.push(["Energy Cost", t.cost]);
    }
    const first = t.levels && t.levels[0] || null;
    if (first) {
      const parsed = (first.description || []).map((raw) => parseDescRow(raw, first.params)).filter(Boolean);
      ["Duration", "Particles", "ICD"].forEach((want) => {
        const hit = parsed.find((r) => r.label.toLowerCase().includes(want.toLowerCase()));
        if (hit && !stats.some((s) => s[0] === want)) stats.push([want, hit.value]);
      });
    }
    if (!stats.length) return "";
    return `<div class="ci-quickstats">${stats.map(([k, v]) => `
            <div class="ci-quickstat"><span class="ci-quickstat-label">${escapeHtml(k)}</span><span class="ci-quickstat-value">${escapeHtml(v)}</span></div>`).join("")}</div>`;
  }
  const TALENT_TYPE_LABELS = {
    normal_attack: "Normal Attack",
    skill: "Elemental Skill",
    alt_sprint: "Alternate Sprint",
    burst: "Elemental Burst",
    passive: "Passive Talent",
    unknown: "Unknown"
  };
  function normalizeTalentType(rawType) {
    if (typeof rawType === "string" && rawType.startsWith("DISAGREEMENT")) return "unknown";
    return rawType || "unknown";
  }
  function talentTypeLabel(rawType) {
    const normalized = normalizeTalentType(rawType);
    return TALENT_TYPE_LABELS[normalized] || normalized;
  }
  function isActiveTalent(t) {
    return normalizeTalentType(t.type) !== "passive";
  }
  let talentAccordionIdx = 0;
  function talentSummaryStatsHtml(t) {
    const bits = [];
    if (t.cooldown) bits.push(`${t.cooldown}s CD`);
    if (t.cost) bits.push(`${t.cost} Energy`);
    if (!bits.length) return "";
    return `<span class="ci-talent-summary-stats">${escapeHtml(bits.join(" \xB7 "))}</span>`;
  }
  function talentBlockHtml(t) {
    const uid = `ci-scaling-${talentAccordionIdx}`;
    const table = scalingTableHtml(t.levels, uid);
    talentAccordionIdx++;
    return `
            <details class="ci-talent-accordion">
                <summary>
                    <img class="ci-talent-icon" src="${dataAssetSrc(t.icon)}" alt="">
                    <span class="ci-talent-summary-name">${escapeHtml(t.name)}</span>
                    <span class="ci-talent-summary-type">${escapeHtml(talentTypeLabel(t.type))}</span>
                    ${talentSummaryStatsHtml(t)}
                </summary>
                <div class="ci-talent-accordion-body">
                    ${t.description ? `<div class="ci-talent-flavor">${escapeHtml(t.description)}</div>` : ""}
                    ${quickStatsHtml(t)}
                    ${table || '<div class="ci-talent-desc ci-muted">No scaling data.</div>'}
                </div>
            </details>`;
  }
  function passiveEffectHtml(t, uid) {
    if (t.description) {
      return `<div class="ci-passive-desc">${escapeHtml(t.description)}</div>`;
    }
    const rows = (t.levels || []).filter((l) => l.description && l.description.length);
    if (!rows.length) return '<div class="ci-item-desc ci-muted">No effect data.</div>';
    if (rows.length > 1) return scalingTableHtml(t.levels, uid);
    const parsed = (rows[0].description || []).map((raw) => parseDescRow(raw, rows[0].params)).filter(Boolean);
    if (!parsed.length) return '<div class="ci-item-desc ci-muted">No effect data.</div>';
    return `<div class="ci-passive-desc">${parsed.map((r) => `
            <div class="ci-passive-desc-row"><span class="ci-passive-desc-label">${escapeHtml(r.label)}</span><span class="ci-passive-desc-value">${escapeHtml(r.value)}</span></div>`).join("")}</div>`;
  }
  let passiveUidIdx = 0;
  function passiveCardHtml(t) {
    const uid = `ci-passive-scaling-${passiveUidIdx++}`;
    return `
            <div class="ci-passive-card">
                <img class="ci-passive-icon" src="${dataAssetSrc(t.icon)}" alt="">
                <div class="ci-passive-body">
                    <div class="ci-passive-name">${escapeHtml(t.name)}</div>
                    ${passiveEffectHtml(t, uid)}
                </div>
            </div>`;
  }
  function constellationIconSrc(con, charId, i) {
    if (con.icon) return dataAssetSrc(con.icon);
    const n = String(i).padStart(2, "0");
    return dataAssetSrc(`character-profiles/${charId}/constellations/${n}_const.webp`);
  }
  function constellationCardHtml(con, i, charId) {
    return `
            <div class="ci-const-card">
                <img class="ci-const-icon" src="${constellationIconSrc(con, charId, i)}" alt="" onerror="this.style.visibility='hidden'">
                <div class="ci-const-body">
                    <div class="ci-const-tier">Constellation ${i + 1}</div>
                    <div class="ci-const-name">${escapeHtml(con.name)}</div>
                    <div class="ci-const-desc">${escapeHtml(con.description)}</div>
                </div>
            </div>`;
  }
  function materialCategory(item) {
    const cat = (typeof GENSHIN_MATERIAL_TYPES !== "undefined" ? GENSHIN_MATERIAL_TYPES : {})[String(item.id)];
    if (cat && cat.startsWith("localSpecialty")) return "local_specialty";
    if (cat === "characterTalentMaterial") return "talent_book";
    return "other";
  }
  const GEM_NAME_RE = /\b(Sliver|Fragment|Chunk|Gemstone)\b/;
  function classifyPromoteItems(promotes) {
    const phases = (promotes || []).filter((p) => p.items && p.items.length);
    const lastPhaseIdx = phases.length - 1;
    let localSpecialty = null;
    const byId = /* @__PURE__ */ new Map();
    phases.forEach((p, pIdx) => (p.items || []).forEach((item) => {
      const cat = materialCategory(item);
      if (cat === "local_specialty") {
        localSpecialty = localSpecialty || item;
        return;
      }
      if (cat === "talent_book") return;
      const entry = byId.get(item.id) || {
        item,
        phaseIdxs: []
      };
      entry.phaseIdxs.push(pIdx);
      byId.set(item.id, entry);
    }));
    let gemstone = null;
    const nonGem = [];
    byId.forEach((entry) => {
      if (GEM_NAME_RE.test(entry.item.name)) {
        if (!gemstone || entry.item.rarity > gemstone.rarity) gemstone = entry.item;
      } else {
        nonGem.push(entry);
      }
    });
    let weeklyBoss = null;
    const remaining = [];
    nonGem.forEach((entry) => {
      const onlyLast = entry.phaseIdxs.length === 1 && entry.phaseIdxs[0] === lastPhaseIdx && lastPhaseIdx > 0;
      if (onlyLast) {
        if (!weeklyBoss || entry.item.rarity > weeklyBoss.rarity) weeklyBoss = entry.item;
      } else {
        remaining.push(entry);
      }
    });
    let bossDrop = null, enemyDrop = null;
    if (remaining.length) {
      remaining.sort((a, b) => b.phaseIdxs.length - a.phaseIdxs.length);
      bossDrop = remaining[0].item;
      remaining.slice(1).forEach(({ item }) => {
        if (!enemyDrop || item.rarity > enemyDrop.rarity) enemyDrop = item;
      });
    }
    return {
      localSpecialty,
      gemstone,
      bossDrop,
      weeklyBoss,
      enemyDrop
    };
  }
  const TALENT_BOOK_NAME_RE = /^(Teachings of|Guide to|Philosophies of)\b/;
  function highestRarityTalentBook(talents) {
    let best = null;
    (talents || []).forEach((t) => (t.levels || []).forEach((lvl) => (lvl.items || []).forEach((item) => {
      if (materialCategory(item) !== "talent_book") return;
      if (!TALENT_BOOK_NAME_RE.test(item.name)) return;
      if (!best || item.rarity > best.rarity) best = item;
    })));
    return best;
  }
  function materialCategoryChipHtml(label, item) {
    if (!item) return "";
    return `
            <div class="ci-mat-chip" title="${escapeHtml(item.name)}">
                <img src="${dataAssetSrc(item.icon)}" alt="">
                <div class="ci-mat-chip-body">
                    <span class="ci-mat-chip-label">${escapeHtml(label)}</span>
                    <span class="ci-mat-chip-name">${escapeHtml(item.name)}</span>
                </div>
            </div>`;
  }
  function materialsHtml(c) {
    const { localSpecialty, gemstone, bossDrop, weeklyBoss, enemyDrop } = classifyPromoteItems(c.promotes);
    const talentBook = highestRarityTalentBook(c.talents);
    const chips = [materialCategoryChipHtml("Local Specialty", localSpecialty), materialCategoryChipHtml("Boss Drop", bossDrop), materialCategoryChipHtml("Gemstone (5\u2605)", gemstone), materialCategoryChipHtml("Talent Book", talentBook), materialCategoryChipHtml("Weekly Boss Material", weeklyBoss), materialCategoryChipHtml("Enemy Drop", enemyDrop)].filter(Boolean);
    if (!chips.length) return '<div class="ci-item-desc ci-muted">No ascension material data.</div>';
    return `<div class="ci-mat-condensed">${chips.join("")}</div>`;
  }
  function iconFactHtml(src, fallbackSrc, value) {
    const onerror = fallbackSrc ? ` onerror="this.onerror=null;this.src='${fallbackSrc}';"` : ` onerror="this.style.display='none';"`;
    return `
            <div class="ci-hero-fact">
                <img class="ci-hero-fact-icon" src="${src}" alt=""${onerror}>
                <span class="ci-hero-fact-value">${escapeHtml(value)}</span>
            </div>`;
  }
  function textFactHtml(label, value) {
    return `
            <div class="ci-hero-fact ci-hero-fact-text">
                <span class="ci-hero-fact-label">${escapeHtml(label)}</span><span class="ci-hero-fact-bullet">\u2022</span><span class="ci-hero-fact-value">${escapeHtml(value)}</span>
            </div>`;
  }
  function profileHeaderHtml(c) {
    const facts = [];
    if (c.element) facts.push(iconFactHtml(elementIconSrc(c.element), null, c.element));
    if (c.weapon_type) facts.push(iconFactHtml(weaponIconSrc(c.weapon_type), null, c.weapon_type));
    if (c.region) facts.push(iconFactHtml(regionIconSrc(c.region), REGION_ICON_FALLBACK, titleCase(c.region)));
    const bday = birthdayLabel(c.birthday);
    if (bday) facts.push(textFactHtml("Birthday", bday));
    const release = releaseLabel(c.release);
    if (release) facts.push(textFactHtml("Released", release));
    const VA_LANG_LABELS = {
      CHS: "CN"
    };
    const vaLine = (c.cv || []).map((v) => `${VA_LANG_LABELS[v.lang] || v.lang}: ${v.va}`).join("   \xB7   ");
    const metaBits = [];
    if (c.constellationName) metaBits.push(`<span class="ci-hero-meta-label">Constellation</span> ${escapeHtml(c.constellationName)}`);
    if (c.native) metaBits.push(`<span class="ci-hero-meta-label">Affiliation</span> ${escapeHtml(c.native)}`);
    return `
            <div class="ci-hero">
                <div class="ci-hero-portrait-wrap">
                    <img class="ci-hero-portrait" src="${dataAssetSrc(c.icon)}" alt="">
                    ${guidesHtml(c)}
                </div>
                <div class="ci-hero-info">
                    <div class="ci-hero-name">${escapeHtml(c.name)}</div>
                    ${c.title ? `<div class="ci-hero-title">"${escapeHtml(c.title)}"</div>` : ""}
                    <div class="ci-hero-stars">${starsHtml(c.rarity)}</div>
                    <div class="ci-hero-facts">
                        ${facts.join("")}
                    </div>
                    ${c.description ? `<p class="ci-hero-desc">${escapeHtml(c.description)}</p>` : ""}
                    ${metaBits.length ? `<div class="ci-hero-meta-line">${metaBits.join(" &nbsp;\u2022&nbsp; ")}</div>` : ""}
                    ${vaLine ? `<div class="ci-hero-meta-line"><span class="ci-hero-meta-label">Voice Actors</span> ${escapeHtml(vaLine)}</div>` : ""}
                </div>
                <div class="ci-hero-stats">
                    <div class="ci-hero-stats-head">
                        <div class="ci-hero-stats-title">Base Stats</div>
                        ${statLevelToggleHtml(selectedStatLevel)}
                    </div>
                    <div id="ciBaseStatsBody">${statsRowsHtml(c, selectedStatLevel)}</div>
                </div>
            </div>`;
  }
  function renderCharacterInfo(c, root) {
    talentAccordionIdx = 0;
    const activeTalents = (c.talents || []).filter(isActiveTalent);
    const passiveTalents = (c.talents || []).filter((t) => !isActiveTalent(t));
    root.innerHTML = `
            ${profileHeaderHtml(c)}
            <div class="ci-layout">
                <section id="ci-sec-talents" class="ci-panel">
                    <h2 class="ci-panel-title">Talents</h2>
                    <div class="ci-talent-list">
                        ${activeTalents.map(talentBlockHtml).join("") || '<div class="ci-item-desc ci-muted">No talent data.</div>'}
                    </div>
                </section>

                <div class="ci-split-row">
                    <div class="ci-split-row-side">
                        <section id="ci-sec-const" class="ci-panel">
                            <h2 class="ci-panel-title">Constellations</h2>
                            <div class="ci-const-list">
                                ${(c.constellations || []).map((con, i) => constellationCardHtml(con, i, c.id)).join("") || '<div class="ci-item-desc ci-muted">None</div>'}
                            </div>
                        </section>
                    </div>
                    <div class="ci-split-row-side">
                        <section id="ci-sec-passives" class="ci-panel">
                            <h2 class="ci-panel-title">Passives</h2>
                            <div class="ci-passive-list">
                                ${passiveTalents.map(passiveCardHtml).join("") || '<div class="ci-item-desc ci-muted">None</div>'}
                            </div>
                        </section>
                        <section id="ci-sec-materials" class="ci-panel">
                            <h2 class="ci-panel-title">Ascension Materials</h2>
                            ${materialsHtml(c)}
                        </section>
                    </div>
                </div>
            </div>`;
    wireInteractions(root, c);
  }
  function wireInteractions(root, c) {
    const accordions = Array.from(root.querySelectorAll(".ci-talent-accordion"));
    accordions.forEach((acc) => {
      acc.addEventListener("toggle", () => {
        if (acc.open) accordions.forEach((other) => {
          if (other !== acc) other.open = false;
        });
      });
    });
    const statsHead = root.querySelector(".ci-hero-stats-head");
    const statsBody = root.querySelector("#ciBaseStatsBody");
    if (statsHead && statsBody) {
      statsHead.addEventListener("click", (e) => {
        const btn = e.target.closest(".ci-stat-level-btn");
        if (!btn) return;
        const level = Number(btn.dataset.statLevel);
        if (!STAT_LEVEL_TOGGLE_LEVELS.includes(level) || level === selectedStatLevel) return;
        selectedStatLevel = level;
        statsHead.querySelectorAll(".ci-stat-level-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.statLevel) === level));
        statsBody.innerHTML = statsRowsHtml(c, selectedStatLevel);
      });
    }
  }
  function characterRoster() {
    const roster = typeof GENSHIN_CHARACTER_PROFILE_INDEX !== "undefined" ? GENSHIN_CHARACTER_PROFILE_INDEX : [];
    return roster.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  const ELEMENT_ORDER = ["Pyro", "Hydro", "Anemo", "Electro", "Dendro", "Cryo", "Geo"];
  function filterBarHtml(roster) {
    const present = new Set(roster.map((c) => c.element).filter(Boolean));
    const elementChips = ELEMENT_ORDER.filter((el) => present.has(el)).map((el) => `
            <button type="button" class="ci-filter-chip" data-filter-group="element" data-filter-value="${escapeHtml(el)}">
                <img src="${elementIconSrc(el)}" alt="">${escapeHtml(el)}
            </button>`).join("");
    const rarityChips = [5, 4].map((r) => `
            <button type="button" class="ci-filter-chip ci-filter-chip-rarity rarity-${r}" data-filter-group="rarity" data-filter-value="${r}">${r}\u2605</button>`).join("");
    return `
            <div class="ci-filter-bar">
                <input type="text" class="ci-filter-search" id="ciGridSearch" placeholder="Search name\u2026" autocomplete="off">
                <div class="ci-filter-group">${elementChips}</div>
                <div class="ci-filter-group">${rarityChips}</div>
            </div>`;
  }
  function characterCardHref(c) {
    const slugs = typeof GENSHIN_CHARACTER_SLUGS !== "undefined" ? GENSHIN_CHARACTER_SLUGS : {};
    const slug = slugs[c.id];
    return slug ? `character-info/${slug}/` : `#/character-info?character=${encodeURIComponent(c.id)}`;
  }
  function characterGridHtml() {
    const roster = characterRoster();
    if (!roster.length) return '<div class="ci-item-desc ci-muted">No characters found.</div>';
    const cards = roster.map((c) => `
            <a class="ci-grid-card" href="${characterCardHref(c)}" data-character-id="${escapeHtml(c.id)}" data-element="${escapeHtml(c.element || "")}" data-rarity="${c.rarity || ""}" data-name="${escapeHtml(c.name.toLowerCase())}">
                <img class="ci-grid-icon rarity-${c.rarity || 4}" src="${dataAssetSrc(c.icon)}" alt="" loading="lazy">
                <span class="ci-grid-name">${escapeHtml(c.name)}${c.name === "Traveler" && c.element ? ` (${escapeHtml(c.element)})` : ""}</span>
            </a>`).join("");
    return `${filterBarHtml(roster)}<div class="ci-grid">${cards}</div>`;
  }
  function bindGridNav(root) {
    root.querySelectorAll(".ci-grid-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigateCharacterInfo(card.dataset.characterId);
      });
    });
  }
  function bindGridFilters(root) {
    const chips = root.querySelectorAll(".ci-filter-chip");
    const cards = root.querySelectorAll(".ci-grid-card");
    const searchInput = root.querySelector("#ciGridSearch");
    const active = {
      element: /* @__PURE__ */ new Set(),
      rarity: /* @__PURE__ */ new Set()
    };
    let searchTerm = "";
    function applyFilters() {
      cards.forEach((card) => {
        const elOk = active.element.size === 0 || active.element.has(card.dataset.element);
        const rOk = active.rarity.size === 0 || active.rarity.has(card.dataset.rarity);
        const searchOk = !searchTerm || card.dataset.name.includes(searchTerm);
        card.style.display = elOk && rOk && searchOk ? "" : "none";
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
  function loadCharacter(root, id) {
    const content = root.querySelector("#ciContent") || root;
    content.innerHTML = '<div class="ci-item-desc ci-muted">Loading\u2026</div>';
    fetchFullCharacterProfile(id).then((profile) => {
      if (!profile) {
        applyElementTheme(root, null);
        content.innerHTML = '<div class="ci-item-desc ci-muted">Character data not found.</div>';
        return;
      }
      applyElementTheme(root, profile.element);
      renderCharacterInfo(profile, content);
    });
  }
  function navigateCharacterInfo(id) {
    const slugs = typeof GENSHIN_CHARACTER_SLUGS !== "undefined" ? GENSHIN_CHARACTER_SLUGS : {};
    const slug = id ? slugs[id] : null;
    const root = typeof window !== "undefined" && window.__SITE_ROOT__ || "/";
    const newPath = slug ? `${root}character-info/${slug}/` : `${root}character-info/`;
    if (location.pathname !== newPath || location.hash) {
      history.pushState({
        tab: "character-info",
        character: id || null
      }, "", newPath);
    }
    renderCharacterInfoTab();
  }
  function characterSwitchHtml() {
    return `
            <div class="ci-switch-wrap">
                <input type="text" class="ci-filter-search ci-switch-search" id="ciCharacterSwitch" placeholder="Search name\u2026" autocomplete="off">
                <div class="ci-switch-results" id="ciCharacterSwitchResults" hidden></div>
            </div>`;
  }
  function bindCharacterSwitch(root, roster) {
    const input = root.querySelector("#ciCharacterSwitch");
    const results = root.querySelector("#ciCharacterSwitchResults");
    if (!input || !results) return;
    const MAX_RESULTS = 8;
    function renderResults(term) {
      if (!term) {
        results.hidden = true;
        results.innerHTML = "";
        return;
      }
      const matches = roster.filter((c) => c.name.toLowerCase().includes(term)).slice(0, MAX_RESULTS);
      if (!matches.length) {
        results.innerHTML = '<div class="ci-switch-empty">No matches</div>';
        results.hidden = false;
        return;
      }
      results.innerHTML = matches.map((c) => `
                <button type="button" class="ci-switch-result" data-character-id="${escapeHtml(c.id)}">
                    <img class="ci-switch-result-icon rarity-${c.rarity || 4}" src="${dataAssetSrc(c.icon)}" alt="" loading="lazy">
                    <span>${escapeHtml(c.name)}${c.name === "Traveler" && c.element ? ` (${escapeHtml(c.element)})` : ""}</span>
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
      navigateCharacterInfo(btn.dataset.characterId);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = results.querySelector(".ci-switch-result");
        if (first) {
          e.preventDefault();
          input.value = "";
          results.hidden = true;
          results.innerHTML = "";
          navigateCharacterInfo(first.dataset.characterId);
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
  function renderCharacterInfoTab() {
    const root = document.getElementById("characterInfoPanel");
    if (!root) return;
    const roster = characterRoster();
    const requestedId = (window.parseHashRoute ? window.parseHashRoute().params : new URLSearchParams()).get("character");
    if (!requestedId) {
      root.innerHTML = characterGridHtml();
      bindGridFilters(root);
      bindGridNav(root);
      return;
    }
    const defaultEntry = roster.find((c) => c.id === requestedId) || roster[0];
    const defaultId = requestedId || (defaultEntry ? defaultEntry.id : DEFAULT_CHARACTER_ID);
    root.innerHTML = `
            <div class="ci-detail-topbar">
                ${characterSwitchHtml()}
            </div>
            <div id="ciContent"></div>`;
    bindCharacterSwitch(root, roster);
    loadCharacter(root, defaultId);
  }
  window.activateCharacterInfoTab = renderCharacterInfoTab;
})();
