(function() {
  "use strict";
  const CHARACTER_ID = "10000002";
  function getJson(url) {
    return fetch(url).then((res) => res.ok ? res.json() : null).catch(() => null);
  }
  function fetchFullCharacterProfile(id) {
    const base = `assets/data/character-profiles/${id}`;
    return Promise.all([
      getJson(`${base}/info.json`),
      getJson(`${base}/skills/talents.json`),
      getJson(`${base}/constellations/constellations.json`),
      getJson(`${base}/materials/materials.json`)
    ]).then(([info, talents, constellations, materials]) => {
      if (!info) return null;
      return {
        ...info,
        talents: (Array.isArray(talents) ? talents : talents && talents.talents) || [],
        constellations: (Array.isArray(constellations) ? constellations : constellations && constellations.constellations) || [],
        promotes: materials && materials.promotes || []
      };
    });
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
  function titleCase(str) {
    return String(str || "").replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }
  function birthdayLabel(b) {
    if (!b) return null;
    const months = [
      "",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    return `${months[b.month] || ""} ${b.day}`.trim();
  }
  function releaseLabel(release) {
    if (!release) return null;
    return new Date(release).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
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
    return { label, value: renderTemplate(template, params) };
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
    const isFirst = talentAccordionIdx === 0;
    talentAccordionIdx++;
    return `
            <details class="ci-talent-accordion" ${isFirst ? "open" : ""}>
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
    return dataAssetSrc(`character-profiles/${charId}/constellations/${n}_const.png`);
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
      const entry = byId.get(item.id) || { item, phaseIdxs: [] };
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
    return { localSpecialty, gemstone, bossDrop, weeklyBoss, enemyDrop };
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
    const chips = [
      materialCategoryChipHtml("Local Specialty", localSpecialty),
      materialCategoryChipHtml("Boss Drop", bossDrop),
      materialCategoryChipHtml("Gemstone (5\u2605)", gemstone),
      materialCategoryChipHtml("Talent Book", talentBook),
      materialCategoryChipHtml("Weekly Boss Material", weeklyBoss),
      materialCategoryChipHtml("Enemy Drop", enemyDrop)
    ].filter(Boolean);
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
    const vaLine = (c.cv || []).map((v) => `${v.lang}: ${v.va}`).join("   \xB7   ");
    const metaBits = [];
    if (c.constellationName) metaBits.push(`<span class="ci-hero-meta-label">Constellation</span> ${escapeHtml(c.constellationName)}`);
    if (c.native) metaBits.push(`<span class="ci-hero-meta-label">Affiliation</span> ${escapeHtml(c.native)}`);
    return `
            <div class="ci-hero">
                <img class="ci-hero-portrait" src="${dataAssetSrc(c.icon)}" alt="">
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
                    <section id="ci-sec-const" class="ci-panel">
                        <h2 class="ci-panel-title">Constellations</h2>
                        <div class="ci-const-list">
                            ${(c.constellations || []).map((con, i) => constellationCardHtml(con, i, c.id)).join("") || '<div class="ci-item-desc ci-muted">None</div>'}
                        </div>
                    </section>
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
    wireInteractions(root);
  }
  function wireInteractions(root) {
    const accordions = Array.from(root.querySelectorAll(".ci-talent-accordion"));
    accordions.forEach((acc) => {
      acc.addEventListener("toggle", () => {
        if (acc.open) accordions.forEach((other) => {
          if (other !== acc) other.open = false;
        });
      });
    });
  }
  let initialized = false;
  window.activateCharacterInfoTab = function() {
    const root = document.getElementById("characterInfoPanel");
    if (!root) return;
    if (initialized) return;
    initialized = true;
    fetchFullCharacterProfile(CHARACTER_ID).then((profile) => {
      if (!profile) {
        root.innerHTML = '<div class="ci-item-desc ci-muted">Character data not found.</div>';
        return;
      }
      renderCharacterInfo(profile, root);
    });
  };
})();
