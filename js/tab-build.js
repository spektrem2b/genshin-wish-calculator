(function() {
  const _debounce = typeof debounce === "function" ? debounce : function(fn, wait = 150) {
    let t;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };
  const SAVE_KEY = "genshin_build_tab_v1";
  const LEVEL_STEPS = ["1", "20", "40", "50", "60", "70", "80", "90"];
  const SOFT_CAP = 10;
  const HARD_CAP = 99;
  const ASCENSION_RANGES = [
    { lower: 1, upper: 20, label: "No Ascension" },
    { lower: 20, upper: 40, label: "1st Ascension" },
    { lower: 40, upper: 50, label: "2nd Ascension" },
    { lower: 50, upper: 60, label: "3rd Ascension" },
    { lower: 60, upper: 70, label: "4th Ascension" },
    { lower: 70, upper: 80, label: "5th Ascension" },
    { lower: 80, upper: 90, label: "6th Ascension" }
  ];
  function ascensionRangeFor(level) {
    const lvl = parseInt(level, 10);
    if (isNaN(lvl) || lvl <= 20) return ASCENSION_RANGES[0];
    for (let i = 1; i < ASCENSION_RANGES.length; i++) {
      const r = ASCENSION_RANGES[i];
      if (lvl > r.lower && lvl <= r.upper) return r;
    }
    return ASCENSION_RANGES[ASCENSION_RANGES.length - 1];
  }
  function ascensionNoteHtml(level) {
    const r = ascensionRangeFor(level);
    return `${r.lower}-${r.upper} ${r.label}`;
  }
  const AMBIGUOUS_BREAKPOINTS = [20, 40, 50, 60, 70, 80];
  function rangeEndingAt(v) {
    return ASCENSION_RANGES.find((r) => r.upper === v);
  }
  function rangeStartingAt(v) {
    return ASCENSION_RANGES.find((r) => r.lower === v);
  }
  function nextBreakpointAfter(v) {
    const r = rangeStartingAt(v);
    return r ? r.upper : null;
  }
  function noteTextForLevelValue(value) {
    if (typeof value === "string" && value.includes("/")) {
      const [a, b] = value.split("/");
      const numA = parseInt(a, 10);
      if (a === b) {
        const r = rangeEndingAt(numA);
        if (r) return `${r.lower}-${r.upper} ${r.label}`;
      } else {
        const r = rangeStartingAt(numA);
        if (r) return `${r.lower}-${r.upper} ${r.label}`;
      }
    }
    return ascensionNoteHtml(value);
  }
  function levelInputDisplayValue(value) {
    if (typeof value === "string" && value.includes("/")) return value.split("/")[0];
    return value;
  }
  function clarifyHtml(buildId, dir, value, field) {
    field = field || "level";
    if (typeof value === "string" && value.includes("/")) return "";
    const v = parseInt(value, 10);
    if (!AMBIGUOUS_BREAKPOINTS.includes(v)) return "";
    const next = nextBreakpointAfter(v);
    const capLabel = rangeEndingAt(v) ? rangeEndingAt(v).label : "";
    const nextLabel = rangeStartingAt(v) ? rangeStartingAt(v).label : "";
    return `
            <div class="ascension-clarify" id="ascensionClarify_${field}_${buildId}_${dir}">
                <div class="ascension-clarify-prompt">${v} \u2014 which do you mean?</div>
                <button type="button" class="clarify-btn" data-build-id="${buildId}" data-range-dir="${dir}" data-level-field="${field}" data-clarify-val="${v}/${v}">${v}/${v} <span>(${capLabel})</span></button>
                <button type="button" class="clarify-btn" data-build-id="${buildId}" data-range-dir="${dir}" data-level-field="${field}" data-clarify-val="${v}/${next}">${v}/${next} <span>(${nextLabel})</span></button>
            </div>
        `;
  }
  function resolveLevelPoint(value) {
    if (typeof value === "string" && value.includes("/")) {
      const [a, b] = value.split("/");
      const numA = parseInt(a, 10);
      if (a === b) {
        const r3 = rangeEndingAt(numA);
        return { level: numA, phaseIndex: r3 ? ASCENSION_RANGES.indexOf(r3) : 0 };
      }
      const r2 = rangeStartingAt(numA);
      return { level: numA, phaseIndex: r2 ? ASCENSION_RANGES.indexOf(r2) : 0 };
    }
    const level = parseInt(value, 10) || 1;
    const r = ascensionRangeFor(level);
    return { level, phaseIndex: ASCENSION_RANGES.indexOf(r) };
  }
  function levelPlanSummary(levelRange) {
    const from = resolveLevelPoint(levelRange.from);
    const to = resolveLevelPoint(levelRange.to);
    const phasesToAscend = [];
    for (let i = from.phaseIndex + 1; i <= to.phaseIndex; i++) phasesToAscend.push(i);
    return {
      fromLevel: from.level,
      fromPhaseIndex: from.phaseIndex,
      fromPhaseLabel: ASCENSION_RANGES[from.phaseIndex].label,
      toLevel: to.level,
      toPhaseIndex: to.phaseIndex,
      toPhaseLabel: ASCENSION_RANGES[to.phaseIndex].label,
      phasesToAscend,
      levelSpan: Math.max(0, to.level - from.level)
    };
  }
  function talentPlanSummary(talentRange) {
    const from = parseInt(talentRange.from, 10) || 1;
    const to = parseInt(talentRange.to, 10) || 1;
    const levelsToBuy = [];
    for (let lvl = from + 1; lvl <= to; lvl++) levelsToBuy.push(lvl);
    return { fromLevel: from, toLevel: to, levelsToBuy, levelSpan: Math.max(0, to - from) };
  }
  function buildCostInputs(build) {
    return {
      characterLevel: levelPlanSummary(build.level),
      talents: {
        basic: talentPlanSummary(build.talents.basic),
        skill: talentPlanSummary(build.talents.skill),
        burst: talentPlanSummary(build.talents.burst)
      },
      weaponLevel: build.weapon ? levelPlanSummary(build.weaponLevel) : null
    };
  }
  window.GenshinBuildMath = { resolveLevelPoint, levelPlanSummary, talentPlanSummary, buildCostInputs, ASCENSION_RANGES };
  const EXP_BOOKS = [
    { id: 104003, name: "Hero's Wit", exp: 2e4, mora: 4e3, rarity: 4 },
    { id: 104002, name: "Adventurer's Experience", exp: 5e3, mora: 1e3, rarity: 3 },
    { id: 104001, name: "Wanderer's Advice", exp: 1e3, mora: 200, rarity: 2 }
  ];
  function expToBookCost(expNeeded) {
    if (expNeeded <= 0) return { mora: 0, items: [] };
    let remaining = expNeeded;
    const counts = [0, 0, 0];
    counts[0] = Math.floor(remaining / EXP_BOOKS[0].exp);
    remaining -= counts[0] * EXP_BOOKS[0].exp;
    counts[1] = Math.floor(remaining / EXP_BOOKS[1].exp);
    remaining -= counts[1] * EXP_BOOKS[1].exp;
    counts[2] = remaining > 0 ? Math.ceil(remaining / EXP_BOOKS[2].exp) : 0;
    let mora = 0;
    const items = [];
    EXP_BOOKS.forEach((book, i) => {
      if (counts[i] <= 0) return;
      mora += counts[i] * book.mora;
      items.push({
        id: book.id,
        name: book.name,
        icon: `https://gi.yatta.moe/assets/UI/UI_ItemIcon_${book.id}.png`,
        rarity: book.rarity,
        qty: counts[i]
      });
    });
    return { mora, items };
  }
  const EXP_BOOK_IDS = new Set(EXP_BOOKS.map((b) => b.id));
  function computeExpBookCoverage(expNeeded, pool) {
    if (expNeeded <= 0) return { rows: [] };
    if (!pool) {
      const items = expToBookCost(expNeeded).items;
      const adventurersBook = EXP_BOOKS.find((b) => b.id === 104002);
      if (!items.some((it) => it.id === 104002)) {
        items.push({
          id: adventurersBook.id,
          name: adventurersBook.name,
          icon: `https://gi.yatta.moe/assets/UI/UI_ItemIcon_${adventurersBook.id}.png`,
          rarity: adventurersBook.rarity,
          qty: 0
        });
      }
      return { rows: items.map((it) => ({ ...it, owned: null, need: it.qty })) };
    }
    let remaining = expNeeded;
    const usedByKey = {};
    EXP_BOOKS.forEach((book) => {
      const key = normalizeGoodKey(book.name);
      const owned = typeof pool[key] === "number" ? pool[key] : 0;
      let use = 0;
      if (remaining > 0 && owned > 0) {
        const neededCount = Math.ceil(remaining / book.exp);
        use = Math.min(owned, neededCount);
        remaining -= use * book.exp;
        pool[key] = owned - use;
      }
      usedByKey[key] = use;
    });
    const purchase = remaining > 0 ? expToBookCost(remaining) : { items: [] };
    const purchaseByKey = {};
    purchase.items.forEach((it) => {
      purchaseByKey[normalizeGoodKey(it.name)] = it.qty;
    });
    const rows = EXP_BOOKS.map((book) => {
      const key = normalizeGoodKey(book.name);
      const used = usedByKey[key] || 0;
      const toBuy = purchaseByKey[key] || 0;
      if (used === 0 && toBuy === 0 && book.id !== 104002) return null;
      return {
        id: book.id,
        name: book.name,
        rarity: book.rarity,
        icon: `https://gi.yatta.moe/assets/UI/UI_ItemIcon_${book.id}.png`,
        owned: used,
        need: used + toBuy
      };
    }).filter(Boolean);
    return { rows };
  }
  const MYSTIC_ORE = { id: 104013, name: "Mystic Enhancement Ore", exp: 1e4, mora: 1e3, rarity: 3 };
  function weaponExpToOreCost(expNeeded) {
    if (expNeeded <= 0) return { mora: 0, items: [] };
    const oreCount = Math.ceil(expNeeded / MYSTIC_ORE.exp);
    return {
      mora: oreCount * MYSTIC_ORE.mora,
      items: [{
        id: MYSTIC_ORE.id,
        name: MYSTIC_ORE.name,
        icon: `https://gi.yatta.moe/assets/UI/UI_ItemIcon_${MYSTIC_ORE.id}.png`,
        rarity: MYSTIC_ORE.rarity,
        qty: oreCount
      }]
    };
  }
  function weaponExpTableForRarity(rarity) {
    if (rarity <= 3 && typeof weapon3ExpTable !== "undefined") return weapon3ExpTable;
    if (rarity === 4 && typeof weapon4ExpTable !== "undefined") return weapon4ExpTable;
    if (typeof weapon5ExpTable !== "undefined") return weapon5ExpTable;
    return null;
  }
  function accumulateCost(rows, totals) {
    rows.forEach((row) => {
      if (!row) return;
      totals.mora += row.moraCost || 0;
      (row.items || []).forEach((item) => {
        if (!item.id) return;
        if (!totals.materials[item.id]) {
          totals.materials[item.id] = { id: item.id, name: item.name, icon: item.icon, rarity: item.rarity, qty: 0 };
        }
        totals.materials[item.id].qty += item.qty || 0;
      });
    });
  }
  function calculateBuildCost(build) {
    if (!build.character || !build.profile) return null;
    const profile = build.profile;
    const inputs = buildCostInputs(build);
    const ascensionTotals = { mora: 0, materials: {} };
    const promotesByPhase = {};
    (profile.promotes || []).forEach((p) => {
      promotesByPhase[p.promoteLevel] = p;
    });
    accumulateCost(inputs.characterLevel.phasesToAscend.map((i) => promotesByPhase[i]), ascensionTotals);
    let charExpNeeded = 0;
    if (typeof GENSHIN_LEVEL_XP !== "undefined") {
      const fromLvl = inputs.characterLevel.fromLevel;
      const toLvl = inputs.characterLevel.toLevel;
      const fromExp = (GENSHIN_LEVEL_XP[fromLvl] || {}).totalExp || 0;
      const toExp = (GENSHIN_LEVEL_XP[toLvl] || {}).totalExp || 0;
      charExpNeeded = Math.max(0, toExp - fromExp);
      const bookCost = expToBookCost(charExpNeeded);
      accumulateCost([{ moraCost: bookCost.mora, items: bookCost.items }], ascensionTotals);
    }
    const talentTotals = { mora: 0, materials: {} };
    const activeTalents = (profile.talents || []).filter((t) => t.levels && t.levels.length);
    const talentByKey = { basic: 0, skill: 1, burst: activeTalents.length - 1 };
    Object.keys(talentByKey).forEach((key) => {
      const talent = activeTalents[talentByKey[key]];
      if (!talent || !talent.levels) return;
      const plan = inputs.talents[key];
      const costsByLevel = {};
      talent.levels.forEach((lv) => {
        costsByLevel[lv.level] = lv;
      });
      accumulateCost(plan.levelsToBuy.map((lvl) => costsByLevel[lvl]), talentTotals);
    });
    const materialsList = (totals) => Object.values(totals.materials).sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
    let weaponTotals = null;
    if (build.weapon && build.profile !== void 0 && inputs.weaponLevel && build.weaponProfile) {
      weaponTotals = { mora: 0, materials: {} };
      const weaponPromotesByPhase = {};
      (build.weaponProfile.promotes || []).forEach((p) => {
        weaponPromotesByPhase[p.promoteLevel] = p;
      });
      accumulateCost(inputs.weaponLevel.phasesToAscend.map((i) => weaponPromotesByPhase[i]), weaponTotals);
      const expTable = weaponExpTableForRarity(build.weapon.rarity);
      if (expTable) {
        const fromLvl = inputs.weaponLevel.fromLevel;
        const toLvl = inputs.weaponLevel.toLevel;
        const fromExp = (expTable[fromLvl - 1] || {}).total || 0;
        const toExp = (expTable[toLvl - 1] || {}).total || 0;
        const expNeeded = Math.max(0, toExp - fromExp);
        const oreCost = weaponExpToOreCost(expNeeded);
        accumulateCost([{ moraCost: oreCost.mora, items: oreCost.items }], weaponTotals);
      }
    }
    return {
      totalMora: ascensionTotals.mora + talentTotals.mora + (weaponTotals ? weaponTotals.mora : 0),
      ascension: { mora: ascensionTotals.mora, materials: materialsList(ascensionTotals), expNeeded: charExpNeeded },
      talents: { mora: talentTotals.mora, materials: materialsList(talentTotals) },
      weapon: weaponTotals ? { mora: weaponTotals.mora, materials: materialsList(weaponTotals) } : null
    };
  }
  function refreshCostDisplay(buildId) {
    const idx = builds.findIndex((b) => b.id === buildId);
    if (idx === -1) return;
    const build = builds[idx];
    const cost = calculateBuildCost(build);
    if (!cost) return;
    const pool = freshInventoryPool();
    for (let i = 0; i < idx; i++) {
      depletePoolForCost(pool, calculateBuildCost(builds[i]));
    }
    const ascMatsEl = document.getElementById(`ascMats_${buildId}`);
    if (ascMatsEl) ascMatsEl.innerHTML = materialsSummaryHtml(cost.ascension.materials, pool, cost.ascension.expNeeded, cost.ascension.mora);
    const talMatsEl = document.getElementById(`talMats_${buildId}`);
    if (talMatsEl) talMatsEl.innerHTML = materialsSummaryHtml(cost.talents.materials, pool, null, cost.talents.mora);
    if (cost.weapon) {
      const weaponMatsEl = document.getElementById(`weaponMats_${buildId}`);
      if (weaponMatsEl) weaponMatsEl.innerHTML = materialsSummaryHtml(cost.weapon.materials, pool, null, cost.weapon.mora);
    }
  }
  function talentNamesLabel(profile) {
    const activeTalents = (profile && profile.talents || []).filter((t) => t.levels && t.levels.length);
    if (!activeTalents.length) return "Talents";
    const basic = activeTalents[0];
    const skill = activeTalents[1];
    const burst = activeTalents[activeTalents.length - 1];
    if (!basic || !skill || !burst) return "Talents";
    return `${basic.name}/${skill.name}/${burst.name}`;
  }
  function formatMora(n) {
    return n.toLocaleString("en-US");
  }
  const TYPE_ORDER = [
    "Weapon EXP",
    "EXP Books",
    "Weekly Boss Material",
    "Boss Material",
    "Talent Books",
    "Local Specialty",
    "Gemstones",
    "Special",
    "Weapon Material",
    "Enemy Materials",
    "Other",
    "Mora"
  ];
  const MORA_ICON = "assets/data/local_icons/Item_Mora.webp";
  function materialCategory(materialId, rarity) {
    if (materialId === "mora") return "Mora";
    if (materialId === MYSTIC_ORE.id) return "Weapon EXP";
    const type = typeof GENSHIN_MATERIAL_TYPES !== "undefined" ? GENSHIN_MATERIAL_TYPES[materialId] : null;
    switch (type) {
      case "characterEXPMaterial":
        return "EXP Books";
      case "characterLevelUpMaterial":
        return rarity === 5 ? "Weekly Boss Material" : "Boss Material";
      case "characterTalentMaterial":
        return rarity === 5 ? "Special" : "Talent Books";
      case "characterandWeaponEnhancementMaterial":
        return "Enemy Materials";
      case "characterAscensionMaterial":
        return "Gemstones";
      case "weaponAscensionMaterial":
        return "Weapon Material";
      default:
        if (type && type.indexOf("localSpecialty") === 0) return "Local Specialty";
        return "Other";
    }
  }
  function normalizeGoodKey(name) {
    return String(name || "").replace(/'/g, "").split(/[\s\-.]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }
  function getOwnedQty(materialId, materialName) {
    return null;
  }
  function freshInventoryPool() {
    return null;
  }
  function claimFromPool(pool, materialId, materialName, qtyNeeded) {
    return null;
  }
  function depletePoolForCost(pool, cost) {
    if (!pool || !cost) return;
    const claimAll = (materials) => (materials || []).forEach((m) => claimFromPool(pool, m.id, m.name, m.qty || 0));
    claimAll(cost.ascension && cost.ascension.materials);
    claimAll(cost.talents && cost.talents.materials);
    if (cost.weapon) claimAll(cost.weapon.materials);
  }
  function materialsSummaryHtml(materials, pool, expNeeded, moraAmount) {
    const hasMora = typeof moraAmount === "number";
    if (!materials.length && !hasMora) return '<span class="cost-placeholder">\u2014</span>';
    const sourceMaterials = hasMora ? materials.concat([{ id: "mora", name: "Mora", icon: MORA_ICON, rarity: 5, qty: moraAmount }]) : materials;
    const nonBookMaterials = sourceMaterials.filter((m) => !EXP_BOOK_IDS.has(m.id));
    const hasBookItems = nonBookMaterials.length !== sourceMaterials.length;
    const displayMaterials = hasBookItems ? nonBookMaterials.concat(computeExpBookCoverage(expNeeded || 0, pool).rows.map((r) => ({ ...r, qty: r.need, _precomputedOwned: r.owned }))) : sourceMaterials;
    const byCategory = {};
    displayMaterials.forEach((m) => {
      const cat = materialCategory(m.id, m.rarity);
      (byCategory[cat] = byCategory[cat] || []).push(m);
    });
    function rowHtmlFor(m) {
      const icon = m.icon ? `<img class="cost-material-icon rarity-${m.rarity || 1}" src="${dataAssetSrc(m.icon)}" alt="">` : `<div class="cost-material-icon cost-material-icon-placeholder rarity-${m.rarity || 1}">?</div>`;
      const owned = Object.prototype.hasOwnProperty.call(m, "_precomputedOwned") ? m._precomputedOwned : pool ? claimFromPool(pool, m.id, m.name, m.qty || 0) : getOwnedQty(m.id, m.name);
      let qtyHtml;
      if (owned === null) {
        qtyHtml = m.id === "mora" ? `<span class="cost-material-qty">${formatMora(m.qty)}</span>` : `<span class="cost-material-qty">\xD7${formatMora(m.qty)}</span>`;
      } else if (owned >= m.qty) {
        qtyHtml = `<span class="cost-material-qty cost-material-covered">\u2713 have enough</span>`;
      } else {
        const remaining = m.qty - owned;
        qtyHtml = `<span class="cost-material-qty cost-material-shortfall">${formatMora(remaining)} more <span class="cost-material-owned-note">(${formatMora(owned)}/${formatMora(m.qty)})</span></span>`;
      }
      return `
                <div class="cost-material-row">
                    ${icon}
                    <span class="cost-material-name">${m.name}</span>
                    ${qtyHtml}
                </div>`;
    }
    function rowsHtmlFor(cat) {
      const items = byCategory[cat].sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
      return items.map(rowHtmlFor).join("");
    }
    function familyWords(name) {
      return (name || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    }
    function clusterByFamily(items) {
      const wordSets = items.map((it) => new Set(familyWords(it.name)));
      const parent = items.map((_, i) => i);
      function find(i) {
        while (parent[i] !== i) {
          parent[i] = parent[parent[i]];
          i = parent[i];
        }
        return i;
      }
      function union(a, b) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
      }
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          let shared = false;
          for (const w of wordSets[i]) {
            if (wordSets[j].has(w)) {
              shared = true;
              break;
            }
          }
          if (shared) union(i, j);
        }
      }
      const groups = {};
      items.forEach((it, i) => {
        const r = find(i);
        (groups[r] = groups[r] || []).push(it);
      });
      return Object.values(groups);
    }
    function enemyMaterialsHtml() {
      const items = (byCategory["Enemy Materials"] || []).slice().sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
      const families = clusterByFamily(items);
      if (families.length !== 2) return { html: rowsHtmlFor("Enemy Materials"), wide: false };
      const col = (fam) => fam.slice().sort((a, b) => (b.rarity || 0) - (a.rarity || 0)).map(rowHtmlFor).join("");
      const html = `<div class="cost-material-family-cols">
                <div class="cost-material-family-col">${col(families[0])}</div>
                <div class="cost-material-family-col">${col(families[1])}</div>
            </div>`;
      return { html, wide: true };
    }
    const MERGE_PAIRS = [
      ["Boss Material", "Weekly Boss Material", "Local Specialty"],
      ["Weekly Boss Material", "Special", "Mora"],
      ["Weapon EXP", "Mora"],
      ["EXP Books", "Mora"]
    ];
    const presentCats = TYPE_ORDER.filter((cat) => byCategory[cat]);
    const consumed = /* @__PURE__ */ new Set();
    const cards = [];
    presentCats.forEach((cat) => {
      if (consumed.has(cat)) return;
      const pair = MERGE_PAIRS.find((group) => group.includes(cat) && group.some((other) => other !== cat && presentCats.includes(other) && !consumed.has(other)));
      if (pair) {
        const members = pair.filter((c) => presentCats.includes(c));
        members.forEach((c) => consumed.add(c));
        cards.push({ merged: true, label: members.join(" & "), members });
      } else {
        consumed.add(cat);
        cards.push({ merged: false, label: cat });
      }
    });
    const tiersHtml = cards.map((card) => {
      if (card.merged) {
        const sections = card.members.map((cat, i) => {
          const body = cat === "Enemy Materials" ? enemyMaterialsHtml().html : rowsHtmlFor(cat);
          return `
                    ${i > 0 ? '<div class="cost-material-subdivider"></div>' : ""}
                    <div class="cost-material-tier-label">${cat}</div>${body}`;
        }).join("");
        return `<div class="cost-material-tier cost-material-tier-merged">${sections}</div>`;
      }
      if (card.label === "Enemy Materials") {
        const { html, wide } = enemyMaterialsHtml();
        return `<div class="cost-material-tier${wide ? " cost-material-tier-wide" : ""}"><div class="cost-material-tier-label">Enemy Materials</div>${html}</div>`;
      }
      return `<div class="cost-material-tier"><div class="cost-material-tier-label">${card.label}</div>${rowsHtmlFor(card.label)}</div>`;
    }).join("");
    return `<div class="cost-material-tier-grid">${tiersHtml}</div>`;
  }
  const ASCENSION_NOTES = {
    "1": { label: "Freshly Pulled", stars: 0 },
    "20": { label: "No", stars: 0 },
    "40": { label: "1st", stars: 1 },
    "50": { label: "2nd", stars: 2 },
    "60": { label: "3rd", stars: 3 },
    "70": { label: "4th", stars: 4 },
    "80": { label: "5th", stars: 5 },
    "90": { label: "6th", stars: 6 }
  };
  function levelStepNoteHtml(step) {
    const note = ASCENSION_NOTES[step];
    if (!note) return "";
    const stars = note.stars > 0 ? `<span class="level-item-stars">${"\u2726".repeat(note.stars)}</span>` : "";
    return `<span class="level-item-note">${note.label}${step === "1" ? "" : " ascension"}${stars ? " " + stars : ""}</span>`;
  }
  let builds = [];
  let swapOpenIds = /* @__PURE__ */ new Set();
  let weaponSwapOpenIds = /* @__PURE__ */ new Set();
  function uid() {
    return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function elementIconPath(element) {
    if (!element || element === "None") return null;
    return `assets/data/element_icons/Element_${element}.svg`;
  }
  function elementBadgeImg(element, size) {
    const path = elementIconPath(element);
    if (!path) return "";
    return `<img class="el-badge-icon" src="${path}" alt="" style="width:${size}px;height:${size}px;">`;
  }
  function dataAssetSrc(path) {
    if (!path) return null;
    if (/^(https?:)?\/\//.test(path) || path.startsWith("assets/data/")) return path;
    return `assets/data/${path}`;
  }
  function iconHtml(entry) {
    if (entry && entry.icon) return `<img src="${dataAssetSrc(entry.icon)}" alt="">`;
    return `<div class="ac-icon-placeholder">?</div>`;
  }
  function starsHtml(rarity) {
    const cls = rarity === 5 ? "gold-star" : "";
    return `<span class="${cls}" style="${rarity === 4 ? "color:#c39bf0;font-weight:700;" : ""}">${rarity || 5}\u2605</span>`;
  }
  function searchAllCharacters(query) {
    const pool = GENSHIN_CHARACTER_DB;
    const trimmed = (query || "").trim().toLowerCase();
    const chosen = new Set(builds.filter((b) => b.character).map((b) => b.character.name));
    const available = pool.filter((c) => !chosen.has(c.name));
    if (!trimmed) return available.slice(0, 8);
    return available.filter((c) => c.name.toLowerCase().includes(trimmed)).slice(0, 8);
  }
  function searchAllWeapons(query) {
    const pool = GENSHIN_WEAPON_DB;
    const trimmed = (query || "").trim().toLowerCase();
    if (!trimmed) return pool.slice(0, 8);
    return pool.filter((w) => w.name.toLowerCase().includes(trimmed)).slice(0, 8);
  }
  function addBlankBuild() {
    if (builds.length >= HARD_CAP) return;
    builds.push({
      id: uid(),
      character: null,
      level: { from: "1", to: "90" },
      talents: {
        basic: { from: "1", to: "1" },
        skill: { from: "1", to: "1" },
        burst: { from: "1", to: "1" }
      },
      weapon: null,
      weaponLevel: null
    });
    renderBuilds();
    saveState();
  }
  const profileCache = {};
  function fetchCharacterProfile(id) {
    if (!id) return Promise.resolve(null);
    if (profileCache[id]) return Promise.resolve(profileCache[id]);
    const base = `assets/data/character-profiles/${id}`;
    const getJson = (url) => fetch(url).then((res) => res.ok ? res.json() : null).catch(() => null);
    return Promise.all([
      getJson(`${base}/info.json`),
      getJson(`${base}/skills/talents.json`),
      getJson(`${base}/constellations/constellations.json`),
      getJson(`${base}/materials/materials.json`)
    ]).then(([profile, talents, constellations, materials]) => {
      if (!profile) return null;
      const merged = {
        ...profile,
        ...materials || {},
        talents: talents || [],
        constellations: constellations || []
      };
      profileCache[id] = merged;
      return merged;
    });
  }
  const weaponProfileCache = {};
  function fetchWeaponProfile(id) {
    if (!id) return Promise.resolve(null);
    if (weaponProfileCache[id]) return Promise.resolve(weaponProfileCache[id]);
    const base = `assets/data/weapon-profiles/${id}`;
    const getJson = (url) => fetch(url).then((res) => res.ok ? res.json() : null).catch(() => null);
    return Promise.all([
      getJson(`${base}/info.json`),
      getJson(`${base}/materials/materials.json`)
    ]).then(([profile, materials]) => {
      if (!profile) return null;
      const merged = { ...profile, ...materials || {} };
      weaponProfileCache[id] = merged;
      return merged;
    });
  }
  function setBuildCharacter(buildId, characterEntry) {
    const build = builds.find((b) => b.id === buildId);
    if (!build) return;
    if (builds.some((b) => b.id !== buildId && b.character && b.character.name === characterEntry.name)) return;
    if (!characterEntry.id && typeof GENSHIN_CHARACTER_PROFILE_INDEX !== "undefined") {
      const match = GENSHIN_CHARACTER_PROFILE_INDEX.find((p) => p.name === characterEntry.name);
      if (match) characterEntry = { ...characterEntry, id: match.id };
    }
    build.character = characterEntry;
    build.profile = null;
    swapOpenIds.delete(buildId);
    renderBuilds();
    saveState();
    fetchCharacterProfile(characterEntry.id).then((profile) => {
      if (build.character !== characterEntry) return;
      build.profile = profile;
      renderBuilds();
    });
  }
  function removeBuild(id) {
    builds = builds.filter((b) => b.id !== id);
    renderBuilds();
    saveState();
  }
  function resetAllBuilds() {
    builds = [];
    swapOpenIds.clear();
    weaponSwapOpenIds.clear();
    renderBuilds();
    saveState();
  }
  function renderCharListFor(buildId, query) {
    const list = document.getElementById(`charList_${buildId}`);
    if (!list) return;
    const results = searchAllCharacters(query);
    if (!results.length) {
      list.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    list.innerHTML = results.map((entry) => `
            <div class="autocomplete-item" data-name="${entry.name.replace(/"/g, "&quot;")}">
                ${iconHtml(entry)}
                <span class="ac-name">${entry.name}</span>
                <span class="ac-sub">${entry.element ? `<img class="el-icon" src="${elementIconPath(entry.element)}" alt="">${entry.element} \u2022 ` : ""}${starsHtml(entry.rarity)}</span>
            </div>
        `).join("");
    list.classList.remove("hidden");
  }
  function renderWeaponList(buildId, query) {
    const list = document.getElementById(`weaponList_${buildId}`);
    if (!list) return;
    const results = searchAllWeapons(query);
    if (!results.length) {
      list.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    list.innerHTML = results.map((entry) => `
            <div class="autocomplete-item" data-wname="${entry.name.replace(/"/g, "&quot;")}">
                ${iconHtml(entry)}
                <span class="ac-name">${entry.name}</span>
                <span class="ac-sub">${entry.weaponType ? `${entry.weaponType} \u2022 ` : ""}${starsHtml(entry.rarity)}</span>
            </div>
        `).join("");
    list.classList.remove("hidden");
  }
  function setBuildWeapon(buildId, weaponEntry) {
    const build = builds.find((b) => b.id === buildId);
    if (!build) return;
    if (!weaponEntry.id && typeof GENSHIN_WEAPON_PROFILE_INDEX !== "undefined") {
      const match = GENSHIN_WEAPON_PROFILE_INDEX.find((p) => p.name === weaponEntry.name);
      if (match) weaponEntry = { ...weaponEntry, id: match.id };
    }
    build.weapon = weaponEntry;
    build.weaponLevel = { from: "1", to: "90" };
    build.weaponProfile = null;
    weaponSwapOpenIds.delete(buildId);
    renderBuilds();
    saveState();
    fetchWeaponProfile(weaponEntry.id).then((profile) => {
      if (build.weapon !== weaponEntry) return;
      build.weaponProfile = profile;
      renderBuilds();
    });
  }
  function clearBuildWeapon(buildId) {
    const build = builds.find((b) => b.id === buildId);
    if (!build) return;
    build.weapon = null;
    build.weaponLevel = null;
    build.weaponProfile = null;
    weaponSwapOpenIds.delete(buildId);
    renderBuilds();
    saveState();
  }
  function renderBlankCard(build) {
    return `
        <div class="section-card build-card" data-build-id="${build.id}">
            <div style="display:flex; align-items:center; gap:14px; margin-bottom:6px;">
                <div style="flex:1;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Choose a character</label>
                        <div class="autocomplete-wrap">
                            <input type="text" class="build-char-input" data-build-id="${build.id}" placeholder="e.g. Sandrone" autocomplete="off">
                            <div class="autocomplete-list hidden" id="charList_${build.id}"></div>
                        </div>
                    </div>
                </div>
                <button type="button" class="build-remove-btn" data-remove-build="${build.id}" title="Remove" aria-label="Remove" style="margin-top:26px;">&times;</button>
            </div>
        </div>`;
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function icyVeinsSlug(name) {
    return String(name || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
  }
  function renderBuildCard(build, pool) {
    if (!build.character) return renderBlankCard(build);
    const c = build.character;
    const elBadge = elementBadgeImg(c.element, 20);
    const weaponBlock = build.weapon ? `
            <div class="weapon-card">
                <button type="button" class="weapon-card-remove" data-clear-weapon="${build.id}" title="Remove weapon">&times;</button>
                ${weaponSwapOpenIds.has(build.id) ? `
                <div class="autocomplete-wrap">
                    <input type="text" class="build-weapon-input" data-build-id="${build.id}" placeholder="Swap weapon..." autocomplete="off">
                    <div class="autocomplete-list hidden" id="weaponList_${build.id}"></div>
                </div>
                ` : `
                <button type="button" class="weapon-selector-btn" data-swap-weapon-toggle="${build.id}" title="Click to change weapon">
                    ${iconHtml(build.weapon)}
                    <div style="flex:1; min-width:0; text-align:left;">
                        <div class="sac-name">${build.weapon.name}</div>
                        <div class="sac-sub">${starsHtml(build.weapon.rarity)}</div>
                    </div>
                </button>
                `}
                <div class="weapon-card-level">
                    <span class="weapon-card-level-label">Level</span>
                    <input type="number" class="level-input input-compact" data-build-id="${build.id}" data-range-dir="from" data-level-field="weaponLevel" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.weaponLevel.from)}" title="From">
                    <span class="talent-row-arrow">\u2192</span>
                    <input type="number" class="level-input input-compact" data-build-id="${build.id}" data-range-dir="to" data-level-field="weaponLevel" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.weaponLevel.to)}" title="To">
                </div>
                <div class="ascension-note-pair">
                    <div class="ascension-note" id="ascensionNote_weaponLevel_${build.id}_from">${noteTextForLevelValue(build.weaponLevel.from)}</div>
                    <div class="ascension-note" id="ascensionNote_weaponLevel_${build.id}_to">${noteTextForLevelValue(build.weaponLevel.to)}</div>
                </div>
                <div class="ascension-clarify-slot" id="ascensionClarifySlot_weaponLevel_${build.id}_from">${clarifyHtml(build.id, "from", build.weaponLevel.from, "weaponLevel")}</div>
                <div class="ascension-clarify-slot" id="ascensionClarifySlot_weaponLevel_${build.id}_to">${clarifyHtml(build.id, "to", build.weaponLevel.to, "weaponLevel")}</div>
            </div>
        ` : `
            <div class="autocomplete-wrap" style="max-width:340px;">
                <input type="text" class="build-weapon-input" data-build-id="${build.id}" placeholder="Add weapon" autocomplete="off">
                <div class="autocomplete-list hidden" id="weaponList_${build.id}"></div>
            </div>
        `;
    const weaponCostRows = build.weapon ? (() => {
      const cost = calculateBuildCost(build);
      if (build.weapon && !build.weaponProfile) {
        return `
                <div class="cost-section-title" style="margin-top:16px;">Weapon Ascension <span class="cost-row-plan" id="planWeaponLevel_${build.id}">\u2192 ${build.weaponLevel.to}</span></div>
                <div class="cost-materials-panel"><span class="cost-placeholder">\u2014</span></div>`;
      }
      const wMats = cost && cost.weapon ? materialsSummaryHtml(cost.weapon.materials, pool, null, cost.weapon.mora) : '<span class="cost-placeholder">\u2014</span>';
      return `
                <div class="cost-section-title" style="margin-top:16px;">Weapon Ascension <span class="cost-row-plan" id="planWeaponLevel_${build.id}">\u2192 ${build.weaponLevel.to}</span></div>
                <div class="cost-materials-panel" id="weaponMats_${build.id}">${wMats}</div>`;
    })() : "";
    const headerBlock = swapOpenIds.has(build.id) ? `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px; max-width:460px;">
                <span class="avatar-badge">
                    ${c.icon ? `<img src="${dataAssetSrc(c.icon)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);display:block;">` : `<div class="ac-icon-placeholder" style="width:44px;height:44px;">?</div>`}
                    ${elBadge}
                </span>
                <div style="flex:1; min-width:0; max-width:340px;">
                    <div class="autocomplete-wrap">
                        <input type="text" class="build-char-input" data-build-id="${build.id}" placeholder="Swap character..." autocomplete="off">
                        <div class="autocomplete-list hidden" id="charList_${build.id}"></div>
                    </div>
                </div>
            </div>
        ` : `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px; max-width:460px;">
                <button type="button" class="char-header-swap" data-swap-toggle="${build.id}" title="Click to change character">
                    <span class="avatar-badge">
                        ${c.icon ? `<img src="${dataAssetSrc(c.icon)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);display:block;">` : `<div class="ac-icon-placeholder" style="width:44px;height:44px;">?</div>`}
                        ${elBadge}
                    </span>
                    <div style="flex:1; text-align:left;">
                        <div style="font-size:1.15rem; font-weight:700; line-height:1.25;">${c.name}</div>
                        <div style="font-size:0.88rem; color:var(--text-muted); display:flex; align-items:center; gap:5px; line-height:1.2; margin-top:1px;">
                            ${c.element ? `${c.element} \u2022 ` : ""}${starsHtml(c.rarity)}
                        </div>
                    </div>
                </button>
            </div>
        `;
    return `
        <div class="section-card build-card" data-build-id="${build.id}">
            <button type="button" class="build-card-save-png" onclick="exportBuildCardPNG(this, '${build.id}')" title="Save as PNG" aria-label="Save build as PNG">\u2B07</button>
            <button type="button" class="build-card-remove" data-remove-build="${build.id}" title="Remove character" aria-label="Remove character">&times;</button>
            <div class="top-layout">
                <div class="planner-col">
                    ${headerBlock}

                    <div class="form-group" style="margin-bottom:14px;">
                        <label>Level &amp; Talents <span style="color: var(--text-muted); font-weight:400; font-size:0.8rem;">\u2014 Talents 1 to 10</span></label>
                        <div class="stat-cards-grid">
                            <div class="talent-row">
                                <div class="talent-row-label">Level</div>
                                <div class="talent-row-fields">
                                    <input type="number" class="level-input input-compact" data-build-id="${build.id}" data-range-dir="from" data-level-field="level" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.level.from)}" title="From">
                                    <span class="talent-row-arrow">\u2192</span>
                                    <input type="number" class="level-input input-compact" data-build-id="${build.id}" data-range-dir="to" data-level-field="level" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.level.to)}" title="To">
                                </div>
                                <div class="ascension-note-pair">
                                    <div class="ascension-note" id="ascensionNote_level_${build.id}_from">${noteTextForLevelValue(build.level.from)}</div>
                                    <div class="ascension-note" id="ascensionNote_level_${build.id}_to">${noteTextForLevelValue(build.level.to)}</div>
                                </div>
                                <div class="ascension-clarify-slot" id="ascensionClarifySlot_level_${build.id}_from">${clarifyHtml(build.id, "from", build.level.from, "level")}</div>
                                <div class="ascension-clarify-slot" id="ascensionClarifySlot_level_${build.id}_to">${clarifyHtml(build.id, "to", build.level.to, "level")}</div>
                            </div>
                            ${[
      { key: "basic", label: "Basic Attack" },
      { key: "skill", label: "Skill" },
      { key: "burst", label: "Burst" }
    ].map(({ key, label }) => `
                                <div class="talent-row">
                                    <div class="talent-row-label">${label}</div>
                                    <div class="talent-row-fields">
                                        <input type="number" class="talent-input input-compact" data-build-id="${build.id}" data-talent="${key}" data-range-dir="from" min="1" max="10" step="1" placeholder="1" value="${build.talents[key].from}" title="From">
                                        <span class="talent-row-arrow">\u2192</span>
                                        <input type="number" class="talent-input input-compact" data-build-id="${build.id}" data-talent="${key}" data-range-dir="to" min="1" max="10" step="1" placeholder="1" value="${build.talents[key].to}" title="To">
                                    </div>
                                </div>
                            `).join("")}
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom:0;">
                        <label>Guides</label>
                        <div class="resources-row">
                            <a class="resource-btn" href="https://www.icy-veins.com/genshin-impact/${icyVeinsSlug(c.name)}-guide-best-builds" target="_blank" rel="noopener noreferrer">
                                <img class="resource-btn-icon" src="assets/data/custom_icons/icy-veins-guide.png" alt="">
                                Icy Veins Guide
                            </a>
                            <a class="resource-btn" href="https://keqingmains.com/#search" target="_blank" rel="noopener noreferrer">
                                <img class="resource-btn-icon" src="assets/data/custom_icons/KQM-guide.png" alt="">
                                KQM Search
                            </a>
                        </div>
                        <div class="resources-disclaimer">Not affiliated.</div>
                    </div>
                </div>

                <div class="weapon-col">
                    ${weaponBlock}
                </div>
            </div>

            <div style="border-top:1px solid var(--border-color); margin:22px 0 0;"></div>
            ${(() => {
      const cost = calculateBuildCost(build);
      const ascMats = cost ? materialsSummaryHtml(cost.ascension.materials, pool, cost.ascension.expNeeded, cost.ascension.mora) : '<span class="cost-placeholder">\u2014</span>';
      const talMats = cost ? materialsSummaryHtml(cost.talents.materials, pool, null, cost.talents.mora) : '<span class="cost-placeholder">\u2014</span>';
      const loadingNote = build.character && !build.profile ? `<div class="explanation" style="margin:0 0 10px;">Loading build data\u2026</div>` : "";
      return `
            <div class="cost-block">
                ${loadingNote}

                <div class="cost-section-title">Character Ascension <span class="cost-row-plan" id="planLevel_${build.id}">\u2192 ${build.level.to}</span></div>
                <div class="cost-materials-panel" id="ascMats_${build.id}">${ascMats}</div>

                <div class="cost-section-title" style="margin-top:16px;">Talent Ascension <span class="cost-row-plan" id="planTalents_${build.id}">\u2192 ${build.talents.basic.to}/${build.talents.skill.to}/${build.talents.burst.to}</span></div>
                <div class="cost-materials-panel" id="talMats_${build.id}">${talMats}</div>
                ${weaponCostRows}
            </div>`;
    })()}
        </div>`;
  }
  function renderBuilds() {
    const wrap = document.getElementById("buildCardsWrap");
    const emptyHint = document.getElementById("buildEmptyHint");
    const softHint = document.getElementById("buildSoftCapHint");
    const addBtn = document.getElementById("buildAddBtn");
    if (emptyHint) emptyHint.classList.toggle("hidden", builds.length > 0);
    if (softHint) {
      if (builds.length >= HARD_CAP) {
        softHint.textContent = `You've hit the ${HARD_CAP}-build cap. Remove one to add another.`;
        softHint.classList.remove("hidden");
      } else if (builds.length >= SOFT_CAP) {
        softHint.textContent = `${builds.length} builds and counting \u2014 this is a resin-based game, maybe pace yourself.`;
        softHint.classList.remove("hidden");
      } else {
        softHint.classList.add("hidden");
      }
    }
    if (addBtn) addBtn.disabled = builds.length >= HARD_CAP;
    const buildResetBtn = document.getElementById("buildResetBtn");
    if (buildResetBtn) buildResetBtn.disabled = builds.length === 0;
    if (!builds.length) {
      wrap.innerHTML = "";
      attachCardListeners();
      return;
    }
    const pool = freshInventoryPool();
    wrap.innerHTML = builds.map((b) => renderBuildCard(b, pool)).join("");
    attachCardListeners();
  }
  function attachCardListeners() {
    document.querySelectorAll(".level-input, .talent-input").forEach((input) => {
      input.addEventListener("focus", () => input.select());
      input.addEventListener("mouseup", (e) => e.preventDefault());
    });
    document.querySelectorAll("[data-remove-build]").forEach((btn) => {
      btn.addEventListener("click", () => removeBuild(btn.dataset.removeBuild));
    });
    document.querySelectorAll("[data-swap-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        swapOpenIds.add(btn.dataset.swapToggle);
        renderBuilds();
      });
    });
    document.querySelectorAll("[data-swap-weapon-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        weaponSwapOpenIds.add(btn.dataset.swapWeaponToggle);
        renderBuilds();
      });
    });
    document.querySelectorAll(".level-input").forEach((input) => {
      const field = input.dataset.levelField || "level";
      input.addEventListener("input", () => {
        if (input.value === "") return;
        let val = parseInt(input.value, 10);
        if (isNaN(val)) return;
        val = Math.max(1, Math.min(90, val));
        if (String(val) !== input.value) input.value = val;
        const build = builds.find((b) => b.id === input.dataset.buildId);
        if (build && build[field]) {
          const dir = input.dataset.rangeDir;
          build[field][dir] = String(val);
          saveStateDebounced();
          const noteEl = document.getElementById(`ascensionNote_${field}_${build.id}_${dir}`);
          if (noteEl) noteEl.textContent = noteTextForLevelValue(String(val));
          const clarifySlot = document.getElementById(`ascensionClarifySlot_${field}_${build.id}_${dir}`);
          if (clarifySlot) clarifySlot.innerHTML = clarifyHtml(build.id, dir, String(val), field);
          if (dir === "to") {
            const planId = field === "weaponLevel" ? `planWeaponLevel_${build.id}` : `planLevel_${build.id}`;
            const planEl = document.getElementById(planId);
            if (planEl) planEl.textContent = `\u2192 ${build[field].to}`;
          }
          if (field === "level") refreshCostDisplay(build.id);
        }
      });
      input.addEventListener("blur", () => {
        if (input.value === "" || isNaN(parseInt(input.value, 10))) {
          input.value = 1;
          const build = builds.find((b) => b.id === input.dataset.buildId);
          if (build && build[field]) {
            build[field][input.dataset.rangeDir] = "1";
            saveState();
            renderBuilds();
          }
        }
      });
    });
    document.querySelectorAll(".talent-input").forEach((input) => {
      input.addEventListener("input", () => {
        if (input.value === "") return;
        let val = parseInt(input.value, 10);
        if (isNaN(val)) return;
        val = Math.max(1, Math.min(10, val));
        if (String(val) !== input.value) input.value = val;
        const build = builds.find((b) => b.id === input.dataset.buildId);
        if (build) {
          build.talents[input.dataset.talent][input.dataset.rangeDir] = String(val);
          saveStateDebounced();
          const planEl = document.getElementById(`planTalents_${build.id}`);
          if (planEl) planEl.textContent = `\u2192 ${build.talents.basic.to}/${build.talents.skill.to}/${build.talents.burst.to}`;
          refreshCostDisplay(build.id);
        }
      });
      input.addEventListener("blur", () => {
        if (input.value === "" || isNaN(parseInt(input.value, 10))) {
          input.value = 1;
          const build = builds.find((b) => b.id === input.dataset.buildId);
          if (build) {
            build.talents[input.dataset.talent][input.dataset.rangeDir] = "1";
            saveState();
            renderBuilds();
          }
        }
      });
    });
    document.querySelectorAll("[data-clear-weapon]").forEach((btn) => {
      btn.addEventListener("click", () => clearBuildWeapon(btn.dataset.clearWeapon));
    });
    attachWeaponInputListeners();
    attachCharInputListeners();
  }
  function closeAllLevelLists() {
    document.querySelectorAll(".updown-select-list").forEach((l) => l.classList.add("hidden"));
    document.querySelectorAll("[data-level-toggle]").forEach((b) => b.classList.remove("open"));
    document.querySelectorAll(".build-card.has-open-dropdown").forEach((c) => c.classList.remove("has-open-dropdown"));
  }
  function attachCharInputListeners() {
    document.querySelectorAll(".build-char-input").forEach((input) => {
      const buildId = input.dataset.buildId;
      input.addEventListener("input", (e) => renderCharListFor(buildId, e.target.value));
      input.addEventListener("focus", (e) => renderCharListFor(buildId, e.target.value));
      const list = document.getElementById(`charList_${buildId}`);
      if (list) {
        list.addEventListener("mousedown", (e) => {
          e.preventDefault();
          const item = e.target.closest(".autocomplete-item");
          if (!item) return;
          const name = item.dataset.name;
          const entry = GENSHIN_CHARACTER_DB.find((c) => c.name === name);
          if (entry) setBuildCharacter(buildId, entry);
        });
      }
    });
  }
  function attachWeaponInputListeners() {
    document.querySelectorAll(".build-weapon-input").forEach((input) => {
      const buildId = input.dataset.buildId;
      input.addEventListener("input", (e) => renderWeaponList(buildId, e.target.value));
      input.addEventListener("focus", (e) => renderWeaponList(buildId, e.target.value));
      const list = document.getElementById(`weaponList_${buildId}`);
      if (list) {
        list.addEventListener("mousedown", (e) => {
          e.preventDefault();
          const item = e.target.closest(".autocomplete-item");
          if (!item) return;
          const name = item.dataset.wname;
          const entry = GENSHIN_WEAPON_DB.find((w) => w.name === name);
          if (entry) setBuildWeapon(buildId, entry);
        });
      }
    });
  }
  function migrateBuild(b) {
    if (b && typeof b.level === "string") {
      b.level = { from: "1", to: b.level };
    }
    if (b && b.talents) {
      ["basic", "skill", "burst"].forEach((t) => {
        if (typeof b.talents[t] === "string") {
          const v = b.talents[t] === "0" ? "1" : b.talents[t];
          b.talents[t] = { from: "1", to: v };
        }
      });
    }
    if (b && b.character === void 0) b.character = null;
    if (b && b.weapon && !b.weaponLevel) {
      b.weaponLevel = { from: "1", to: "90" };
    }
    if (b && !b.weapon) {
      b.weaponLevel = null;
    }
    return b;
  }
  function saveState() {
    try {
      const toSave = builds.map((b) => {
        const { profile, weaponProfile, ...rest } = b;
        return rest;
      });
      localStorage.setItem(SAVE_KEY, JSON.stringify(toSave));
    } catch (e) {
    }
  }
  const saveStateDebounced = _debounce(saveState, 300);
  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        builds = parsed.map(migrateBuild);
        builds.forEach((b) => {
          if (b.character) {
            if (!b.character.id && typeof GENSHIN_CHARACTER_PROFILE_INDEX !== "undefined") {
              const match = GENSHIN_CHARACTER_PROFILE_INDEX.find((p) => p.name === b.character.name);
              if (match) b.character.id = match.id;
            }
            if (b.character.id) {
              fetchCharacterProfile(b.character.id).then((profile) => {
                b.profile = profile;
                renderBuilds();
              });
            }
          }
          if (b.weapon) {
            if (!b.weapon.id && typeof GENSHIN_WEAPON_PROFILE_INDEX !== "undefined") {
              const match = GENSHIN_WEAPON_PROFILE_INDEX.find((p) => p.name === b.weapon.name);
              if (match) b.weapon.id = match.id;
            }
            if (b.weapon.id) {
              fetchWeaponProfile(b.weapon.id).then((profile) => {
                b.weaponProfile = profile;
                renderBuilds();
              });
            }
          }
        });
      }
    } catch (e) {
      builds = [];
    }
  }
  function initGlobalHandlers() {
    const addBtn = document.getElementById("buildAddBtn");
    if (addBtn && !addBtn.dataset.wired) {
      addBtn.dataset.wired = "1";
      addBtn.addEventListener("click", addBlankBuild);
    }
    const buildResetBtn = document.getElementById("buildResetBtn");
    if (buildResetBtn && !buildResetBtn.dataset.wired) {
      buildResetBtn.dataset.wired = "1";
      buildResetBtn.addEventListener("click", () => {
        if (!builds.length) return;
        resetAllBuilds();
      });
    }
    if (!document.body.dataset.buildOutsideClickWired) {
      document.body.dataset.buildOutsideClickWired = "1";
      document.addEventListener("click", (e) => {
        const clarifyBtn = e.target.closest(".clarify-btn");
        if (clarifyBtn) {
          const build = builds.find((b) => b.id === clarifyBtn.dataset.buildId);
          const field = clarifyBtn.dataset.levelField || "level";
          if (build && build[field]) {
            build[field][clarifyBtn.dataset.rangeDir] = clarifyBtn.dataset.clarifyVal;
            saveState();
            renderBuilds();
          }
          return;
        }
        if (!e.target.closest(".autocomplete-wrap")) {
          document.querySelectorAll(".autocomplete-list").forEach((l) => {
            l.classList.add("hidden");
            l.innerHTML = "";
          });
        }
        if (!e.target.closest(".updown-select")) {
          closeAllLevelLists();
        }
        if (swapOpenIds.size && !e.target.closest(".autocomplete-wrap")) {
          swapOpenIds.clear();
          renderBuilds();
        }
        if (weaponSwapOpenIds.size && !e.target.closest(".autocomplete-wrap")) {
          weaponSwapOpenIds.clear();
          renderBuilds();
        }
      });
    }
  }
  let initialized = false;
  window.activateBuildTab = function() {
    if (!initialized) {
      loadState();
      initGlobalHandlers();
      initialized = true;
    }
    renderBuilds();
  };
  let html2canvasLoadPromise = null;
  function loadHtml2Canvas() {
    if (typeof html2canvas !== "undefined") return Promise.resolve();
    if (html2canvasLoadPromise) return html2canvasLoadPromise;
    html2canvasLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return html2canvasLoadPromise;
  }
  window.exportBuildCardPNG = async function(btn, buildId) {
    const card = document.querySelector(`.build-card[data-build-id="${buildId}"]`);
    if (!card) return;
    const build = builds.find((b) => b.id === buildId);
    const fileName = build && build.character ? `${icyVeinsSlug(build.character.name)}-build.png` : "build.png";
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "\u2026";
    try {
      await loadHtml2Canvas();
    } catch (e) {
      console.error("Failed to load html2canvas:", e);
      alert("Export failed to load \u2014 check your connection and try again.");
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      return;
    }
    card.classList.add("exporting-for-png");
    html2canvas(card, {
      backgroundColor: "#0f0e1e",
      scale: 2,
      useCORS: true
    }).then((canvas) => {
      return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error("toBlob returned null"));
            return;
          }
          const file = new File([blob], fileName, { type: "image/png" });
          const isMobileDevice = /Android|iP(hone|ad|od)/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
          if (isMobileDevice && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: fileName });
              resolve();
              return;
            } catch (shareErr) {
              if (shareErr && shareErr.name === "AbortError") {
                resolve();
                return;
              }
            }
          }
          const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
          if (isIOS) {
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, "_blank");
            setTimeout(() => URL.revokeObjectURL(blobUrl), 3e4);
          } else {
            const link = document.createElement("a");
            link.download = fileName;
            link.href = canvas.toDataURL("image/png");
            link.click();
          }
          resolve();
        }, "image/png");
      });
    }).catch((err) => {
      console.error("PNG export failed:", err);
      alert("Export failed \u2014 check the console for details.");
    }).finally(() => {
      card.classList.remove("exporting-for-png");
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    });
  };
})();
