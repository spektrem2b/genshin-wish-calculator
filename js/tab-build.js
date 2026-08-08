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
  const ASCENSION_RANGES = [{
    lower: 1,
    upper: 20,
    label: "No Ascension"
  }, {
    lower: 20,
    upper: 40,
    label: "1st Ascension"
  }, {
    lower: 40,
    upper: 50,
    label: "2nd Ascension"
  }, {
    lower: 50,
    upper: 60,
    label: "3rd Ascension"
  }, {
    lower: 60,
    upper: 70,
    label: "4th Ascension"
  }, {
    lower: 70,
    upper: 80,
    label: "5th Ascension"
  }, {
    lower: 80,
    upper: 90,
    label: "6th Ascension"
  }];
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
    return `${r.lower}\u2013${r.upper}`;
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
        if (r) return `${r.lower}\u2013${r.upper}`;
      } else {
        const r = rangeStartingAt(numA);
        if (r) return `${r.lower}\u2013${r.upper}`;
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
        return {
          level: numA,
          phaseIndex: r3 ? ASCENSION_RANGES.indexOf(r3) : 0
        };
      }
      const r2 = rangeStartingAt(numA);
      return {
        level: numA,
        phaseIndex: r2 ? ASCENSION_RANGES.indexOf(r2) : 0
      };
    }
    const level = parseInt(value, 10) || 1;
    const r = ascensionRangeFor(level);
    return {
      level,
      phaseIndex: ASCENSION_RANGES.indexOf(r)
    };
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
    return {
      fromLevel: from,
      toLevel: to,
      levelsToBuy,
      levelSpan: Math.max(0, to - from)
    };
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
  window.GenshinBuildMath = {
    resolveLevelPoint,
    levelPlanSummary,
    talentPlanSummary,
    buildCostInputs,
    ASCENSION_RANGES
  };
  const EXP_BOOKS = [{
    id: 104003,
    name: "Hero's Wit",
    exp: 2e4,
    mora: 4e3,
    rarity: 4
  }, {
    id: 104002,
    name: "Adventurer's Experience",
    exp: 5e3,
    mora: 1e3,
    rarity: 3
  }, {
    id: 104001,
    name: "Wanderer's Advice",
    exp: 1e3,
    mora: 200,
    rarity: 2
  }];
  function expToBookCost(expNeeded) {
    if (expNeeded <= 0) return {
      mora: 0,
      items: []
    };
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
    return {
      mora,
      items
    };
  }
  const EXP_BOOK_IDS = new Set(EXP_BOOKS.map((b) => b.id));
  function computeExpBookCoverage(expNeeded, pool) {
    if (expNeeded <= 0) return {
      rows: []
    };
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
      return {
        rows: items.map((it) => ({
          ...it,
          owned: null,
          need: it.qty
        }))
      };
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
    const purchase = remaining > 0 ? expToBookCost(remaining) : {
      items: []
    };
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
    return {
      rows
    };
  }
  const MYSTIC_ORE = {
    id: 104013,
    name: "Mystic Enhancement Ore",
    exp: 1e4,
    mora: 1e3,
    rarity: 3
  };
  function weaponExpToOreCost(expNeeded) {
    if (expNeeded <= 0) return {
      mora: 0,
      items: []
    };
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
          totals.materials[item.id] = {
            id: item.id,
            name: item.name,
            icon: item.icon,
            rarity: item.rarity,
            qty: 0
          };
        }
        totals.materials[item.id].qty += item.qty || 0;
      });
    });
  }
  function calculateBuildCost(build) {
    if (!build.weapon && (!build.character || !build.profile)) return null;
    const profile = build.profile;
    const inputs = buildCostInputs(build);
    const ascensionTotals = {
      mora: 0,
      materials: {}
    };
    const talentTotals = {
      mora: 0,
      materials: {}
    };
    let charExpNeeded = 0;
    if (build.character && profile) {
      const promotesByPhase = {};
      (profile.promotes || []).forEach((p) => {
        promotesByPhase[p.promoteLevel] = p;
      });
      accumulateCost(inputs.characterLevel.phasesToAscend.map((i) => promotesByPhase[i]), ascensionTotals);
      if (typeof GENSHIN_LEVEL_XP !== "undefined") {
        const fromLvl = inputs.characterLevel.fromLevel;
        const toLvl = inputs.characterLevel.toLevel;
        const fromExp = (GENSHIN_LEVEL_XP[fromLvl] || {}).totalExp || 0;
        const toExp = (GENSHIN_LEVEL_XP[toLvl] || {}).totalExp || 0;
        charExpNeeded = Math.max(0, toExp - fromExp);
        const bookCost = expToBookCost(charExpNeeded);
        accumulateCost([{
          moraCost: bookCost.mora,
          items: bookCost.items
        }], ascensionTotals);
      }
      const talentTypeByKey = {
        basic: "normal_attack",
        skill: "skill",
        burst: "burst"
      };
      Object.keys(talentTypeByKey).forEach((key) => {
        const talent = (profile.talents || []).find((t) => t.type === talentTypeByKey[key]);
        if (!talent || !talent.levels) return;
        const plan = inputs.talents[key];
        const costsByLevel = {};
        talent.levels.forEach((lv) => {
          costsByLevel[lv.level] = lv;
        });
        accumulateCost(plan.levelsToBuy.map((lvl) => costsByLevel[lvl]), talentTotals);
      });
    }
    const materialsList = (totals) => Object.values(totals.materials).sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
    let weaponTotals = null;
    if (build.weapon && inputs.weaponLevel && build.weaponProfile) {
      weaponTotals = {
        mora: 0,
        materials: {}
      };
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
        accumulateCost([{
          moraCost: oreCost.mora,
          items: oreCost.items
        }], weaponTotals);
      }
    }
    return {
      totalMora: ascensionTotals.mora + talentTotals.mora + (weaponTotals ? weaponTotals.mora : 0),
      ascension: {
        mora: ascensionTotals.mora,
        materials: materialsList(ascensionTotals),
        expNeeded: charExpNeeded
      },
      talents: {
        mora: talentTotals.mora,
        materials: materialsList(talentTotals)
      },
      weapon: weaponTotals ? {
        mora: weaponTotals.mora,
        materials: materialsList(weaponTotals)
      } : null
    };
  }
  function costPartIsEmpty(part) {
    return !part || (part.materials || []).length === 0 && !(typeof part.mora === "number" && part.mora > 0);
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
    const ascSectionEl = document.getElementById(`ascSection_${buildId}`);
    if (ascSectionEl) ascSectionEl.classList.toggle("cost-section-hidden", costPartIsEmpty(cost.ascension));
    const talMatsEl = document.getElementById(`talMats_${buildId}`);
    if (talMatsEl) talMatsEl.innerHTML = materialsSummaryHtml(cost.talents.materials, pool, null, cost.talents.mora);
    const talSectionEl = document.getElementById(`talSection_${buildId}`);
    if (talSectionEl) talSectionEl.classList.toggle("cost-section-hidden", costPartIsEmpty(cost.talents));
    if (cost.weapon) {
      const weaponMatsEl = document.getElementById(`weaponMats_${buildId}`);
      if (weaponMatsEl) weaponMatsEl.innerHTML = materialsSummaryHtml(cost.weapon.materials, pool, null, cost.weapon.mora);
      const weaponSectionEl = document.getElementById(`weaponAscSection_${buildId}`);
      if (weaponSectionEl) weaponSectionEl.classList.toggle("cost-section-hidden", costPartIsEmpty(cost.weapon));
    }
    const charStatEl = document.getElementById(`charStatPreview_${buildId}`);
    if (charStatEl) charStatEl.innerHTML = characterStatPreviewHtml(build);
    const weaponStatEl = document.getElementById(`weaponStatPreview_${buildId}`);
    if (weaponStatEl) weaponStatEl.innerHTML = weaponStatPreviewHtml(build);
  }
  function talentNamesLabel(profile) {
    const talents = profile && profile.talents || [];
    const basic = talents.find((t) => t.type === "normal_attack");
    const skill = talents.find((t) => t.type === "skill");
    const burst = talents.find((t) => t.type === "burst");
    if (!basic || !skill || !burst) return "Talents";
    return `${basic.name}/${skill.name}/${burst.name}`;
  }
  function formatMora(n) {
    return n.toLocaleString("en-US");
  }
  const TYPE_ORDER = ["Weapon EXP", "EXP Books", "Weekly Boss Material", "Boss Material", "Talent Books", "Local Specialty", "Gemstones", "Special", "Weapon Material", "Enemy Materials", "Other", "Mora"];
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
    const sourceMaterials = hasMora ? materials.concat([{
      id: "mora",
      name: "Mora",
      icon: MORA_ICON,
      rarity: 5,
      qty: moraAmount
    }]) : materials;
    const nonBookMaterials = sourceMaterials.filter((m) => !EXP_BOOK_IDS.has(m.id));
    const hasBookItems = nonBookMaterials.length !== sourceMaterials.length;
    const displayMaterials = hasBookItems ? nonBookMaterials.concat(computeExpBookCoverage(expNeeded || 0, pool).rows.map((r) => ({
      ...r,
      qty: r.need,
      _precomputedOwned: r.owned
    }))) : sourceMaterials;
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
      if (families.length !== 2) return {
        html: rowsHtmlFor("Enemy Materials"),
        wide: false
      };
      const col = (fam) => fam.slice().sort((a, b) => (b.rarity || 0) - (a.rarity || 0)).map(rowHtmlFor).join("");
      const html = `<div class="cost-material-family-cols">
                <div class="cost-material-family-col">${col(families[0])}</div>
                <div class="cost-material-family-col">${col(families[1])}</div>
            </div>`;
      return {
        html,
        wide: true
      };
    }
    const MERGE_PAIRS = [["Boss Material", "Weekly Boss Material", "Local Specialty"], ["Weekly Boss Material", "Special", "Mora"], ["Weapon EXP", "Mora"], ["EXP Books", "Mora"]];
    const presentCats = TYPE_ORDER.filter((cat) => byCategory[cat]);
    const consumed = /* @__PURE__ */ new Set();
    const cards = [];
    presentCats.forEach((cat) => {
      if (consumed.has(cat)) return;
      const pair = MERGE_PAIRS.find((group) => group.includes(cat) && group.some((other) => other !== cat && presentCats.includes(other) && !consumed.has(other)));
      if (pair) {
        const members = pair.filter((c) => presentCats.includes(c));
        members.forEach((c) => consumed.add(c));
        cards.push({
          merged: true,
          label: members.join(" & "),
          members
        });
      } else {
        consumed.add(cat);
        cards.push({
          merged: false,
          label: cat
        });
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
    1: {
      label: "Freshly Pulled",
      stars: 0
    },
    20: {
      label: "No",
      stars: 0
    },
    40: {
      label: "1st",
      stars: 1
    },
    50: {
      label: "2nd",
      stars: 2
    },
    60: {
      label: "3rd",
      stars: 3
    },
    70: {
      label: "4th",
      stars: 4
    },
    80: {
      label: "5th",
      stars: 5
    },
    90: {
      label: "6th",
      stars: 6
    }
  };
  function levelStepNoteHtml(step) {
    const note = ASCENSION_NOTES[step];
    if (!note) return "";
    const stars = note.stars > 0 ? `<span class="level-item-stars">${"\u2726".repeat(note.stars)}</span>` : "";
    return `<span class="level-item-note">${note.label}${step === "1" ? "" : " ascension"}${stars ? " " + stars : ""}</span>`;
  }
  const LEVEL_SLIDER_MIN = 1;
  const LEVEL_SLIDER_MAX = 90;
  const LEVEL_SLIDER_SPAN = LEVEL_SLIDER_MAX - LEVEL_SLIDER_MIN;
  function levelValueToPct(v) {
    const n = Math.max(LEVEL_SLIDER_MIN, Math.min(LEVEL_SLIDER_MAX, parseInt(v, 10) || LEVEL_SLIDER_MIN));
    return (n - LEVEL_SLIDER_MIN) / LEVEL_SLIDER_SPAN * 100;
  }
  function levelPctToValue(pct) {
    const clamped = Math.max(0, Math.min(100, pct));
    return Math.round(LEVEL_SLIDER_MIN + clamped / 100 * LEVEL_SLIDER_SPAN);
  }
  function levelAscProgressHtml(range) {
    const summary = levelPlanSummary(range);
    const totalAsc = ASCENSION_RANGES.length - 1;
    return `<span class="bd-asc-diamond">\u2726</span> Ascension Progress: ${summary.phasesToAscend.length}/${totalAsc}`;
  }
  function levelRangeSliderHtml(buildId, field, range) {
    const fromDisplay = levelInputDisplayValue(range.from);
    const toDisplay = levelInputDisplayValue(range.to);
    const fromNum = parseInt(fromDisplay, 10) || LEVEL_SLIDER_MIN;
    const toNum = parseInt(toDisplay, 10) || LEVEL_SLIDER_MAX;
    const fromPct = levelValueToPct(fromNum);
    const toPct = levelValueToPct(toNum);
    return `
            <div class="bd-level-slider bd-level-inputs" data-build-id="${buildId}" data-level-field="${field}">
                <div class="bd-level-slider-top">
                    <span class="bd-level-slider-label">Lv.</span>
                    <div class="level-row-fields">
                        <input type="number" inputmode="numeric" class="level-input input-compact" id="levelInput_${field}_${buildId}_from" data-build-id="${buildId}" data-level-field="${field}" data-range-dir="from" min="${LEVEL_SLIDER_MIN}" max="${LEVEL_SLIDER_MAX}" step="1" placeholder="1" value="${fromNum}" title="Start level">
                        <span class="talent-row-arrow bd-level-arrow">\u2192</span>
                        <input type="number" inputmode="numeric" class="level-input input-compact" id="levelInput_${field}_${buildId}_to" data-build-id="${buildId}" data-level-field="${field}" data-range-dir="to" min="${LEVEL_SLIDER_MIN}" max="${LEVEL_SLIDER_MAX}" step="1" placeholder="90" value="${toNum}" title="Target level">
                    </div>
                </div>
                <div class="bd-level-asc-progress" id="levelAscProgress_${field}_${buildId}">${levelAscProgressHtml(range)}</div>
                <div class="ascension-clarify-slot" id="ascensionClarifySlot_${field}_${buildId}_from">${clarifyHtml(buildId, "from", range.from, field)}</div>
                <div class="ascension-clarify-slot" id="ascensionClarifySlot_${field}_${buildId}_to">${clarifyHtml(buildId, "to", range.to, field)}</div>
            </div>
        `;
  }
  let builds = [];
  let swapOpenIds = /* @__PURE__ */ new Set();
  let weaponSwapOpenIds = /* @__PURE__ */ new Set();
  let entryModeIds = /* @__PURE__ */ new Map();
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
  function starsRowHtml(rarity) {
    const n = Math.max(0, Math.min(5, parseInt(rarity, 10) || 5));
    const cls = rarity === 4 ? "bd-stars-purple" : "";
    return `<div class="bd-stars-row ${cls}">${"\u2605".repeat(n)}</div>`;
  }
  const BD_STAT_ICONS = [
    { match: /^(max )?hp$|^hp%$/i, icon: "\u2764" },
    { match: /^atk$|^atk%$|^base atk$/i, icon: "\u2694" },
    { match: /^def$|^def%$/i, icon: "\u{1F6E1}" },
    { match: /^crit rate$/i, icon: "\u273A" },
    { match: /^crit dmg$/i, icon: "\u2739" },
    { match: /^energy recharge$/i, icon: "\u26A1" },
    { match: /^elemental mastery$/i, icon: "\u2726" },
    { match: /^healing bonus$/i, icon: "\u271A" },
    { match: /dmg%$|dmg bonus$/i, icon: "\u{1F525}" },
    { match: /^ascension stat$/i, icon: "\u2726" }
  ];
  function bdStatIcon(label) {
    const found = BD_STAT_ICONS.find((e) => e.match.test(String(label || "").trim()));
    return `<span class="bd-stat-icon">${found ? found.icon : "\u25C6"}</span>`;
  }
  let charCurveDataCache = null;
  let weaponCurveDataCache = null;
  (function loadCurves() {
    fetch("assets/data/curves/character_curve.json").then((r) => r.ok ? r.json() : {}).catch(() => ({})).then((d) => {
      charCurveDataCache = d || {};
      renderBuilds();
    });
    fetch("assets/data/curves/weapon_curve.json").then((r) => r.ok ? r.json() : {}).catch(() => ({})).then((d) => {
      weaponCurveDataCache = d || {};
      renderBuilds();
    });
  })();
  function curveMul(curveData, level, growthType) {
    const row = curveData && curveData[String(level)];
    const val = row && row.curveInfos && row.curveInfos[growthType];
    return typeof val === "number" ? val : 1;
  }
  function statAtLevel(curveData, stat, level) {
    return stat.initValue * curveMul(curveData, level, stat.growthType);
  }
  const weaponGrowthTypeCache = {};
  function allWeaponCurveTypes(namePart) {
    const sample = weaponCurveDataCache && weaponCurveDataCache["1"] && weaponCurveDataCache["1"].curveInfos;
    if (!sample) return [];
    return Object.keys(sample).filter((k) => k.includes(namePart));
  }
  function bestWeaponGrowthType(lvl1, lvl90, namePart) {
    if (!weaponCurveDataCache || !lvl1 || !lvl90) return null;
    const targetRatio = lvl90 / lvl1;
    let best = null, bestDiff = Infinity;
    allWeaponCurveTypes(namePart).forEach((type) => {
      const diff = Math.abs(curveMul(weaponCurveDataCache, 90, type) - targetRatio);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = type;
      }
    });
    return bestDiff < 0.05 ? best : null;
  }
  function resolveWeaponGrowthTypes(profile) {
    const id = profile.id || profile.name || "?";
    if (weaponGrowthTypeCache[id]) return weaponGrowthTypeCache[id];
    const result = {
      atk: bestWeaponGrowthType(profile.base_atk_lvl1, profile.base_atk_lvl90, "ATTACK"),
      sub: bestWeaponGrowthType(profile.substat_lvl1, profile.substat_lvl90, "CRITICAL")
    };
    weaponGrowthTypeCache[id] = result;
    return result;
  }
  function weaponStatAtLevel(profile, level, kind) {
    const lvl1 = kind === "atk" ? profile.base_atk_lvl1 : profile.substat_lvl1;
    const lvl90 = kind === "atk" ? profile.base_atk_lvl90 : profile.substat_lvl90;
    if (lvl1 === void 0 || lvl90 === void 0) return void 0;
    if (level <= 1) return lvl1;
    if (level >= 90) return lvl90;
    const types = resolveWeaponGrowthTypes(profile);
    const growthType = kind === "atk" ? types.atk : types.sub;
    if (growthType && weaponCurveDataCache) return lvl1 * curveMul(weaponCurveDataCache, level, growthType);
    return lvl1 + (lvl90 - lvl1) * (level - 1) / 89;
  }
  const BUILD_BASE_STAT_LABELS = {
    FIGHT_PROP_BASE_HP: "HP",
    FIGHT_PROP_BASE_ATTACK: "ATK",
    FIGHT_PROP_BASE_DEFENSE: "DEF"
  };
  const BUILD_SPECIAL_STAT_LABELS = {
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
  const BUILD_SPECIAL_STAT_IS_FLAT = /* @__PURE__ */ new Set(["FIGHT_PROP_ELEMENT_MASTERY"]);
  function buildSpecialStatLabel(key) {
    if (!key) return null;
    if (BUILD_SPECIAL_STAT_LABELS[key]) return BUILD_SPECIAL_STAT_LABELS[key];
    const words = String(key).replace(/^FIGHT_PROP_/, "").split("_");
    return words.map((w) => w[0] + w.slice(1).toLowerCase()).join(" ") || key;
  }
  function formatStatNum(value) {
    if (value === null || value === void 0 || isNaN(value)) return "\u2014";
    return Math.round(value).toLocaleString("en-US");
  }
  function formatSpecialStatValue(value, key) {
    if (value === null || value === void 0 || isNaN(value)) return "\u2014";
    if (BUILD_SPECIAL_STAT_IS_FLAT.has(key)) return Math.round(value).toString();
    return `${(value * 100).toFixed(1)}%`;
  }
  function bdStatRowHtml(label, fromVal, toVal) {
    return `<div class="bd-stat-row">${bdStatIcon(label)}<span class="bd-stat-label">${label}</span><span class="bd-stat-value">${fromVal} <span class="bd-stat-arrow">\u2192</span> <span class="bd-stat-highlight">${toVal}</span></span></div>`;
  }
  function bdStatSingleRowHtml(label, val) {
    return `<div class="bd-stat-row bd-stat-row-single">${bdStatIcon(label)}<span class="bd-stat-label">${label}</span><span class="bd-stat-value">${val}</span></div>`;
  }
  function characterStatPreviewHtml(build) {
    const profile = build.profile;
    if (build.character && !profile) return '<div class="bd-stat-placeholder">Loading stats\u2026</div>';
    if (!profile || !profile.baseStats || !profile.baseStats.length) return '<div class="bd-stat-placeholder">No stat data.</div>';
    if (!charCurveDataCache) return '<div class="bd-stat-placeholder">Loading stats\u2026</div>';
    try {
      const fromLvl = Math.max(1, Math.min(90, parseInt(levelInputDisplayValue(build.level.from), 10) || 1));
      const toLvl = Math.max(1, Math.min(90, parseInt(levelInputDisplayValue(build.level.to), 10) || 90));
      const rows = [];
      ["FIGHT_PROP_BASE_HP", "FIGHT_PROP_BASE_ATTACK", "FIGHT_PROP_BASE_DEFENSE"].forEach((prop) => {
        const stat = profile.baseStats.find((s) => s.propType === prop);
        if (!stat) return;
        rows.push(bdStatRowHtml(BUILD_BASE_STAT_LABELS[prop], formatStatNum(statAtLevel(charCurveDataCache, stat, fromLvl)), formatStatNum(statAtLevel(charCurveDataCache, stat, toLvl))));
      });
      if (profile.specialStat) {
        const label = buildSpecialStatLabel(profile.specialStat);
        const bonus = formatSpecialStatValue(profile.ascensionStatBonus, profile.specialStat);
        rows.push(bdStatSingleRowHtml(label, bonus !== "\u2014" ? `+${bonus}` : "\u2014"));
      }
      return rows.join("") || '<div class="bd-stat-placeholder">No stat data.</div>';
    } catch (e) {
      return '<div class="bd-stat-placeholder">No stat data.</div>';
    }
  }
  function weaponStatPreviewHtml(build) {
    if (!build.weapon) return "";
    const profile = build.weaponProfile;
    if (!profile) return '<div class="bd-stat-placeholder">Loading stats\u2026</div>';
    try {
      const fromLvl = Math.max(1, Math.min(90, parseInt(levelInputDisplayValue(build.weaponLevel.from), 10) || 1));
      const toLvl = Math.max(1, Math.min(90, parseInt(levelInputDisplayValue(build.weaponLevel.to), 10) || 90));
      const rows = [];
      if (profile.base_atk_lvl1 !== void 0 && profile.base_atk_lvl90 !== void 0) {
        rows.push(bdStatRowHtml("Base ATK", formatStatNum(weaponStatAtLevel(profile, fromLvl, "atk")), formatStatNum(weaponStatAtLevel(profile, toLvl, "atk"))));
      }
      if (profile.substat_type) {
        const label = buildSpecialStatLabel(profile.substat_type);
        const isPct = !BUILD_SPECIAL_STAT_IS_FLAT.has(profile.substat_type);
        const fmt = (v) => isPct ? formatSpecialStatValue(v, profile.substat_type) : formatStatNum(v);
        rows.push(bdStatRowHtml(label, fmt(weaponStatAtLevel(profile, fromLvl, "sub")), fmt(weaponStatAtLevel(profile, toLvl, "sub"))));
      }
      if (!rows.length) return '<div class="bd-stat-placeholder">No stat data.</div>';
      const r1 = profile.refinement && (profile.refinement.levels || []).find((lvl) => lvl.refinement === 1);
      const passiveHtml = r1 ? `
                <div class="bd-weapon-passive">
                    <div class="bd-weapon-passive-name">${escapeHtml(profile.refinement.name || "Passive")}</div>
                    <div class="bd-weapon-passive-desc">${escapeHtml(r1.description)}</div>
                </div>` : "";
      return rows.join("") + passiveHtml;
    } catch (e) {
      return '<div class="bd-stat-placeholder">No stat data.</div>';
    }
  }
  function searchAllCharacters(query) {
    const pool = GENSHIN_CHARACTER_DB;
    const trimmed = (query || "").trim().toLowerCase();
    if (!trimmed) return pool.slice(0, 8);
    return pool.filter((c) => c.name.toLowerCase().includes(trimmed)).slice(0, 8);
  }
  function searchAllWeapons(query) {
    const pool = GENSHIN_WEAPON_DB;
    const trimmed = (query || "").trim().toLowerCase();
    if (!trimmed) return pool.slice(0, 8);
    return pool.filter((w) => w.name.toLowerCase().includes(trimmed)).slice(0, 8);
  }
  function blankBuild() {
    return {
      id: uid(),
      character: null,
      level: {
        from: "1",
        to: "90"
      },
      talents: {
        basic: {
          from: "1",
          to: "1"
        },
        skill: {
          from: "1",
          to: "1"
        },
        burst: {
          from: "1",
          to: "1"
        }
      },
      weapon: null,
      weaponLevel: null,
      mode: null
    };
  }
  function ensurePlanner() {
    if (!builds.length) builds.push(blankBuild());
  }
  const profileCache = {};
  function fetchCharacterProfile(id) {
    if (!id) return Promise.resolve(null);
    if (profileCache[id]) return Promise.resolve(profileCache[id]);
    const base = `assets/data/character-profiles/${id}`;
    const getJson = (url) => fetch(url).then((res) => res.ok ? res.json() : null).catch(() => null);
    return Promise.all([getJson(`${base}/info.json`), getJson(`${base}/skills/talents.json`), getJson(`${base}/constellations/constellations.json`), getJson(`${base}/materials/materials.json`)]).then(([profile, talents, constellations, materials]) => {
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
    return Promise.all([getJson(`${base}/info.json`), getJson(`${base}/materials/materials.json`), getJson(`${base}/refinements/refinements.json`)]).then(([profile, materials, refinement]) => {
      if (!profile) return null;
      const merged = {
        ...profile,
        ...materials || {},
        refinement: refinement || null
      };
      weaponProfileCache[id] = merged;
      return merged;
    });
  }
  function setBuildCharacter(buildId, characterEntry) {
    const build = builds.find((b) => b.id === buildId);
    if (!build) return;
    if (!characterEntry.id && typeof GENSHIN_CHARACTER_PROFILE_INDEX !== "undefined") {
      const match = GENSHIN_CHARACTER_PROFILE_INDEX.find((p) => p.name === characterEntry.name);
      if (match) characterEntry = {
        ...characterEntry,
        id: match.id
      };
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
      if (match) weaponEntry = {
        ...weaponEntry,
        id: match.id
      };
    }
    build.weapon = weaponEntry;
    build.weaponLevel = {
      from: "1",
      to: "90"
    };
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
  function clearBuild(buildId) {
    const build = builds.find((b) => b.id === buildId);
    if (!build) return;
    build.character = null;
    build.profile = null;
    build.level = {
      from: "1",
      to: "90"
    };
    build.talents = {
      basic: { from: "1", to: "1" },
      skill: { from: "1", to: "1" },
      burst: { from: "1", to: "1" }
    };
    build.weapon = null;
    build.weaponLevel = null;
    build.weaponProfile = null;
    build.mode = null;
    swapOpenIds.delete(buildId);
    weaponSwapOpenIds.delete(buildId);
    entryModeIds.delete(buildId);
    renderBuilds();
    saveState();
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
  function clearBuildCharacter(buildId) {
    const build = builds.find((b) => b.id === buildId);
    if (!build) return;
    build.character = null;
    build.profile = null;
    build.level = {
      from: "1",
      to: "90"
    };
    build.talents = {
      basic: {
        from: "1",
        to: "1"
      },
      skill: {
        from: "1",
        to: "1"
      },
      burst: {
        from: "1",
        to: "1"
      }
    };
    swapOpenIds.delete(buildId);
    renderBuilds();
    saveState();
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function icyVeinsSlug(name) {
    return String(name || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
  }
  function genshinBuildsSlug(c) {
    if (!c) return "";
    if (/traveler/i.test(c.name || "")) {
      const el = String(c.element || "").toLowerCase();
      return el ? `${el}-traveler` : "traveler";
    }
    return icyVeinsSlug(c.name);
  }
  function renderBuildCard(build, pool) {
    const c = build.character;
    const weaponBlock = build.weapon ? `
            <div class="weapon-card bd-weapon-card">
                <button type="button" class="weapon-card-remove" data-clear-weapon="${build.id}" title="Remove weapon">&times;</button>
                ${weaponSwapOpenIds.has(build.id) ? `
                <div class="bd-weapon-top">
                    <div class="bd-weapon-artwork">
                        ${iconHtml(build.weapon)}
                    </div>
                    <div class="bd-weapon-identity">
                        <div class="autocomplete-wrap">
                            <input type="text" class="build-weapon-input" data-build-id="${build.id}" placeholder="Swap weapon..." autocomplete="off">
                            <div class="autocomplete-list hidden" id="weaponList_${build.id}"></div>
                        </div>
                    </div>
                </div>
                ` : `
                <div class="bd-weapon-top">
                    <div class="bd-weapon-artwork" data-swap-weapon-toggle="${build.id}" title="Click to change weapon" role="button" tabindex="0">
                        ${iconHtml(build.weapon)}
                    </div>
                    <div class="bd-weapon-identity">
                        <div class="bd-weapon-trigger" data-swap-weapon-toggle="${build.id}" title="Click to change weapon" role="button" tabindex="0">
                            <div class="sac-name bd-weapon-name">${build.weapon.name}</div>
                            ${starsRowHtml(build.weapon.rarity)}
                        </div>
                        <div class="bd-weapon-progress">${levelRangeSliderHtml(build.id, "weaponLevel", build.weaponLevel)}</div>
                    </div>
                </div>
                `}
                <div class="bd-divider-h"></div>
                <div class="bd-stat-preview" id="weaponStatPreview_${build.id}">${weaponStatPreviewHtml(build)}</div>
            </div>
        ` : `
            <div class="autocomplete-wrap bd-weapon-empty">
                <label class="bd-weapon-empty-label">Weapon</label>
                <input type="text" class="build-weapon-input" data-build-id="${build.id}" placeholder="Choose a weapon..." autocomplete="off">
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
      const wEmpty = !cost || costPartIsEmpty(cost.weapon);
      return `
                <div id="weaponAscSection_${build.id}" class="${wEmpty ? "cost-section-hidden" : ""}">
                    <div class="cost-section-title" style="margin-top:16px;">Weapon Ascension <span class="cost-row-plan" id="planWeaponLevel_${build.id}">\u2192 ${build.weaponLevel.to}</span></div>
                    <div class="cost-materials-panel" id="weaponMats_${build.id}">${wMats}</div>
                </div>`;
    })() : "";
    if (!c) {
      const charFieldHtml = `
                <div class="form-group bd-setup-field">
                    <label>Character</label>
                    <div class="autocomplete-wrap">
                        <input type="text" class="build-char-input" data-build-id="${build.id}" placeholder="Choose a character..." autocomplete="off">
                        <div class="autocomplete-list hidden" id="charList_${build.id}"></div>
                    </div>
                </div>`;
      const mode = entryModeIds.get(build.id);
      if (mode === "full") {
        return `
        <div class="section-card build-card bd-card bd-card-empty" data-build-id="${build.id}">
            <div class="bd-header">
                <div class="section-title">Character Builder</div>
                <div class="bd-subtitle">Select a character or a weapon to start building.</div>
                <button type="button" class="bd-setup-back bd-discard-build" data-build-mode-back="${build.id}">Discard</button>
            </div>
            <div class="bd-grid">
                <div class="bd-panel bd-char-panel bd-char-panel-empty">${charFieldHtml}</div>
                <div class="bd-panel bd-weapon-panel">${weaponBlock}</div>
            </div>
            ${weaponCostRows ? `<div class="cost-block">
                <div class="bd-panel-title">Detailed Material Breakdown</div>
                ${weaponCostRows}
            </div>` : ""}
        </div>`;
      }
      if (mode === "character") {
        return `
        <div class="section-card build-card bd-card bd-card-empty" data-build-id="${build.id}">
            <div class="bd-header">
                <div class="section-title">Character Builder</div>
                <div class="bd-subtitle">Select a character to start building.</div>
                <button type="button" class="bd-setup-back bd-discard-build" data-build-mode-back="${build.id}">Discard</button>
            </div>
            <div class="bd-grid bd-grid-solo">
                <div class="bd-panel bd-char-panel bd-char-panel-empty">${charFieldHtml}</div>
            </div>
        </div>`;
      }
      if (mode === "weapon") {
        const dashClass = build.weapon ? "bd-card" : "bd-card bd-card-empty";
        const gridInner = build.weapon ? `
            <div class="bd-dash-grid bd-dash-grid-weapon">
                <div class="bd-panel bd-weapon-panel bd-sidebar">${weaponBlock}</div>
                <div class="bd-materials-col">
                    <div class="cost-block bd-cost-dashboard">
                        <div class="bd-cost-section bd-weapon-mats-solo">
                            ${weaponCostRows || `<div class="cost-materials-panel"><span class="cost-placeholder">\u2014</span></div>`}
                        </div>
                    </div>
                </div>
            </div>
        ` : `
            <div class="bd-grid bd-grid-solo">
                <div class="bd-panel bd-weapon-panel">${weaponBlock}</div>
            </div>
        `;
        return `
        <div class="section-card build-card ${dashClass}" data-build-id="${build.id}">
            <div class="bd-header">
                <div class="section-title">Character Builder</div>
                <div class="bd-subtitle">Select a weapon to start building.</div>
                <button type="button" class="bd-setup-back bd-discard-build" data-build-mode-back="${build.id}">Discard</button>
            </div>
            ${gridInner}
        </div>`;
      }
      return `
        <div class="section-card build-card bd-card bd-card-empty" data-build-id="${build.id}">
            <div class="bd-header">
                <div class="section-title">Character Builder</div>
                <div class="bd-subtitle">Select a character or a weapon to start building.</div>
            </div>
            <div class="bd-grid bd-grid-empty">
                <div class="bd-panel bd-char-panel bd-char-panel-empty bd-setup-panel">
                    <div class="bd-setup-title">Build Setup</div>
                    <div class="bd-divider-h"></div>
                    <div class="bd-mode-choice">
                        <button type="button" class="bd-mode-btn" data-build-mode="full" data-build-id="${build.id}">
                            <div class="bd-mode-btn-title">Full build</div>
                            <div class="bd-mode-btn-sub">Character + weapon together</div>
                        </button>
                        <button type="button" class="bd-mode-btn" data-build-mode="character" data-build-id="${build.id}">
                            <div class="bd-mode-btn-title">Character only</div>
                            <div class="bd-mode-btn-sub">Just the character</div>
                        </button>
                        <button type="button" class="bd-mode-btn" data-build-mode="weapon" data-build-id="${build.id}">
                            <div class="bd-mode-btn-title">Weapon only</div>
                            <div class="bd-mode-btn-sub">Just the weapon</div>
                        </button>
                    </div>
                </div>
                <div class="bd-panel bd-preview-panel">
                    <div class="bd-preview-placeholder">
                        <div class="bd-preview-title">Select a build to begin</div>
                        <div class="bd-preview-sub">Your build information, materials, and recommendations will appear here.</div>
                    </div>
                </div>
            </div>
            ${weaponCostRows ? `<div class="cost-block">
                <div class="bd-panel-title">Detailed Material Breakdown</div>
                ${weaponCostRows}
            </div>` : ""}
        </div>`;
    }
    const elBadge = elementBadgeImg(c.element, 16);
    const charHeaderInner = c.icon ? `<img src="${dataAssetSrc(c.icon)}" alt="" class="bd-portrait">` : `<div class="ac-icon-placeholder bd-portrait">?</div>`;
    const guidesHtml = `
            <div class="bd-guides-block">
                <div class="resources-row bd-guides-row">
                    <a class="resource-btn" href="https://genshin-impact-helper-team.github.io/genshin-builds/en/${genshinBuildsSlug(c)}" target="_blank" rel="noopener noreferrer">
                        <img class="resource-btn-icon" src="assets/data/custom_icons/genshin-builds-guide.webp" alt="">
                        Genshin Builds
                    </a>
                    <a class="resource-btn" href="https://www.icy-veins.com/genshin-impact/${icyVeinsSlug(c.name)}-guide-best-builds" target="_blank" rel="noopener noreferrer">
                        <img class="resource-btn-icon" src="assets/data/custom_icons/icy-veins-guide.webp" alt="">
                        Icy Veins
                    </a>
                    <a class="resource-btn" href="https://keqingmains.com/#search" target="_blank" rel="noopener noreferrer">
                        <img class="resource-btn-icon" src="assets/data/custom_icons/KQM-guide.webp" alt="">
                        KQM
                    </a>
                </div>
            </div>`;
    const headerBlock = swapOpenIds.has(build.id) ? `
            <div class="bd-char-top">
                <span class="avatar-badge bd-avatar-badge bd-char-artwork">${charHeaderInner}${elBadge}</span>
                <div class="bd-char-identity">
                    <div class="autocomplete-wrap">
                        <input type="text" class="build-char-input" data-build-id="${build.id}" placeholder="Swap character..." autocomplete="off">
                        <div class="autocomplete-list hidden" id="charList_${build.id}"></div>
                    </div>
                </div>
            </div>
        ` : `
            <div class="bd-char-top">
                <div class="bd-char-artwork" data-swap-toggle="${build.id}" title="Click to change character" role="button" tabindex="0">
                    <span class="avatar-badge bd-avatar-badge">${charHeaderInner}${elBadge}</span>
                </div>
                <div class="bd-char-identity">
                    <button type="button" class="bd-char-trigger" data-swap-toggle="${build.id}" title="Click to change character">
                        <div class="bd-char-name">${c.name}</div>
                        ${starsRowHtml(c.rarity)}
                    </button>
                    <div class="bd-char-progress-row">
                        <div class="bd-char-progress">${levelRangeSliderHtml(build.id, "level", build.level)}</div>
                    </div>
                </div>
            </div>
            ${guidesHtml}
        `;
    const TALENT_TYPE_BY_KEY = {
      basic: "normal_attack",
      skill: "skill",
      burst: "burst"
    };
    const TALENT_FALLBACK_LABEL = {
      basic: "Normal Attack",
      skill: "Elemental Skill",
      burst: "Elemental Burst"
    };
    const talentsHtml = ["basic", "skill", "burst"].map((key) => {
      const t = build.profile && (build.profile.talents || []).find((t2) => t2.type === TALENT_TYPE_BY_KEY[key]);
      const icon = t && t.icon ? `<img class="bd-talent-icon" src="${dataAssetSrc(t.icon)}" alt="">` : `<div class="bd-talent-icon bd-talent-icon-placeholder"></div>`;
      return `
                <div class="bd-talent-row">
                    ${icon}
                    <div class="bd-talent-text">
                        <div class="bd-talent-name">${TALENT_FALLBACK_LABEL[key]}</div>
                    </div>
                    <div class="talent-row-fields bd-talent-fields">
                        <input type="number" class="talent-input input-compact" data-build-id="${build.id}" data-talent="${key}" data-range-dir="from" min="1" max="10" step="1" placeholder="1" value="${build.talents[key].from}" title="From">
                        <span class="talent-row-arrow">\u2192</span>
                        <input type="number" class="talent-input input-compact" data-build-id="${build.id}" data-talent="${key}" data-range-dir="to" min="1" max="10" step="1" placeholder="1" value="${build.talents[key].to}" title="To">
                    </div>
                </div>
            `;
    }).join("");
    if (build.mode !== "character") {
      return `
        <div class="section-card build-card bd-card" data-build-id="${build.id}">
            <div class="bd-header">
                <div class="section-title">Character Builder</div>
                <button type="button" class="bd-setup-back bd-discard-build" data-discard-build="${build.id}">Discard</button>
            </div>
            <div class="bd-grid">
                <div class="bd-panel bd-char-panel">
                    <button type="button" class="char-card-remove" data-clear-character="${build.id}" title="Remove character">&times;</button>
                    ${headerBlock}
                    <div class="bd-divider-h"></div>
                    <div class="bd-progression-grid">
                        <div class="bd-progression-col bd-progression-stats">
                            <div class="bd-panel-title bd-stats-title">Base Stats</div>
                            <div class="bd-stat-preview" id="charStatPreview_${build.id}">${characterStatPreviewHtml(build)}</div>
                        </div>
                        <div class="bd-progression-col bd-progression-talents">
                            <div class="bd-panel-title bd-talents-title">Talents</div>
                            <div class="bd-talents bd-talents-compact">${talentsHtml}</div>
                        </div>
                    </div>
                </div>

                <div class="bd-panel bd-weapon-panel">
                    ${weaponBlock}
                </div>
            </div>

            ${(() => {
        const cost = calculateBuildCost(build);
        const ascMats = cost ? materialsSummaryHtml(cost.ascension.materials, pool, cost.ascension.expNeeded, cost.ascension.mora) : '<span class="cost-placeholder">\u2014</span>';
        const talMats = cost ? materialsSummaryHtml(cost.talents.materials, pool, null, cost.talents.mora) : '<span class="cost-placeholder">\u2014</span>';
        const ascEmpty = !cost || costPartIsEmpty(cost.ascension);
        const talEmpty = !cost || costPartIsEmpty(cost.talents);
        const loadingNote = build.character && !build.profile ? `<div class="explanation" style="margin:0 0 10px;">Loading build data\u2026</div>` : "";
        return `
            <div class="cost-block">
                <div class="bd-panel-title">Detailed Material Breakdown</div>
                ${loadingNote}

                <div id="ascSection_${build.id}" class="${ascEmpty ? "cost-section-hidden" : ""}">
                    <div class="cost-section-title">Character Ascension <span class="cost-row-plan" id="planLevel_${build.id}">\u2192 ${build.level.to}</span></div>
                    <div class="cost-materials-panel" id="ascMats_${build.id}">${ascMats}</div>
                </div>

                <div id="talSection_${build.id}" class="${talEmpty ? "cost-section-hidden" : ""}">
                    <div class="cost-section-title" style="margin-top:16px;">Talent Ascension <span class="cost-row-plan" id="planTalents_${build.id}">\u2192 ${build.talents.basic.to}/${build.talents.skill.to}/${build.talents.burst.to}</span></div>
                    <div class="cost-materials-panel" id="talMats_${build.id}">${talMats}</div>
                </div>
                ${weaponCostRows}
            </div>`;
      })()}
        </div>`;
    }
    return `
        <div class="section-card build-card bd-card" data-build-id="${build.id}">
            <div class="bd-header">
                <div class="section-title">Character Builder</div>
                <button type="button" class="bd-setup-back bd-discard-build" data-discard-build="${build.id}">Discard</button>
            </div>
            <div class="bd-dash-grid">
                <div class="bd-panel bd-char-panel bd-sidebar">
                    <button type="button" class="char-card-remove" data-clear-character="${build.id}" title="Remove character">&times;</button>
                    ${headerBlock}
                    <div class="bd-divider-h"></div>
                    <div class="bd-progression-grid bd-progression-stacked">
                        <div class="bd-progression-col bd-progression-stats">
                            <div class="bd-panel-title bd-stats-title">Base Stats</div>
                            <div class="bd-stat-preview" id="charStatPreview_${build.id}">${characterStatPreviewHtml(build)}</div>
                        </div>
                        <div class="bd-divider-h bd-progression-divider"></div>
                        <div class="bd-progression-col bd-progression-talents">
                            <div class="bd-panel-title bd-talents-title">Talents</div>
                            <div class="bd-talents bd-talents-compact">${talentsHtml}</div>
                        </div>
                    </div>
                </div>

                <div class="bd-materials-col">
                    ${(() => {
      const cost = calculateBuildCost(build);
      const ascMats = cost ? materialsSummaryHtml(cost.ascension.materials, pool, cost.ascension.expNeeded, cost.ascension.mora) : '<span class="cost-placeholder">\u2014</span>';
      const talMats = cost ? materialsSummaryHtml(cost.talents.materials, pool, null, cost.talents.mora) : '<span class="cost-placeholder">\u2014</span>';
      const ascEmpty = !cost || costPartIsEmpty(cost.ascension);
      const talEmpty = !cost || costPartIsEmpty(cost.talents);
      const loadingNote = build.character && !build.profile ? `<div class="explanation" style="margin:0 0 10px;">Loading build data\u2026</div>` : "";
      return `
                    <div class="cost-block bd-cost-dashboard">
                        ${loadingNote}

                        <div id="ascSection_${build.id}" class="bd-cost-section ${ascEmpty ? "cost-section-hidden" : ""}">
                            <div class="cost-section-title bd-section-heading">Character Ascension <span class="cost-row-plan" id="planLevel_${build.id}">\u2192 ${build.level.to}</span></div>
                            <div class="cost-materials-panel" id="ascMats_${build.id}">${ascMats}</div>
                        </div>

                        <div id="talSection_${build.id}" class="bd-cost-section ${talEmpty ? "cost-section-hidden" : ""}" style="margin-top:20px;">
                            <div class="cost-section-title bd-section-heading">Talent Ascension <span class="cost-row-plan" id="planTalents_${build.id}">\u2192 ${build.talents.basic.to}/${build.talents.skill.to}/${build.talents.burst.to}</span></div>
                            <div class="cost-materials-panel" id="talMats_${build.id}">${talMats}</div>
                        </div>
                    </div>`;
    })()}
                </div>
            </div>
        </div>`;
  }
  function renderBuilds() {
    const wrap = document.getElementById("buildCardsWrap");
    ensurePlanner();
    const pool = freshInventoryPool();
    wrap.innerHTML = builds.map((b) => renderBuildCard(b, pool)).join("");
    attachCardListeners();
  }
  function attachCardListeners() {
    document.querySelectorAll(".talent-input").forEach((input) => {
      input.addEventListener("focus", () => input.select());
      input.addEventListener("mouseup", (e) => e.preventDefault());
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
      if (btn.getAttribute("role") === "button") {
        btn.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            btn.click();
          }
        });
      }
    });
    attachLevelInputListeners();
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
    document.querySelectorAll("[data-build-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        entryModeIds.set(btn.dataset.buildId, btn.dataset.buildMode);
        const build = builds.find((b) => b.id === btn.dataset.buildId);
        if (build) build.mode = btn.dataset.buildMode;
        renderBuilds();
      });
    });
    document.querySelectorAll("[data-build-mode-back]").forEach((btn) => {
      btn.addEventListener("click", () => clearBuild(btn.dataset.buildModeBack));
    });
    document.querySelectorAll("[data-discard-build]").forEach((btn) => {
      btn.addEventListener("click", () => clearBuild(btn.dataset.discardBuild));
    });
    document.querySelectorAll("[data-clear-weapon]").forEach((btn) => {
      btn.addEventListener("click", () => clearBuildWeapon(btn.dataset.clearWeapon));
    });
    document.querySelectorAll("[data-clear-character]").forEach((btn) => {
      btn.addEventListener("click", () => clearBuildCharacter(btn.dataset.clearCharacter));
    });
    attachWeaponInputListeners();
    attachCharInputListeners();
  }
  function levelSliderWrapEl(buildId, field) {
    return document.querySelector(`.bd-level-slider[data-build-id="${buildId}"][data-level-field="${field}"]`);
  }
  function otherLevelDirValue(build, field, dir) {
    const otherDir = dir === "from" ? "to" : "from";
    const fallback = dir === "from" ? LEVEL_SLIDER_MAX : LEVEL_SLIDER_MIN;
    return parseInt(levelInputDisplayValue(build[field][otherDir]), 10) || fallback;
  }
  function liveUpdateLevelSliderVisual(buildId, field, dir, val) {
    const build = builds.find((b) => b.id === buildId);
    if (!build || !build[field]) return;
    const otherVal = otherLevelDirValue(build, field, dir);
    const fromVal = dir === "from" ? val : otherVal;
    const toVal = dir === "to" ? val : otherVal;
    const wrap = levelSliderWrapEl(buildId, field);
    if (!wrap) return;
    const fromInput = document.getElementById(`levelInput_${field}_${buildId}_from`);
    const toInput = document.getElementById(`levelInput_${field}_${buildId}_to`);
    const fill = wrap.querySelector(".bd-level-track-fill");
    const fromPct = levelValueToPct(fromVal);
    const toPct = levelValueToPct(toVal);
    if (fromInput && document.activeElement !== fromInput) fromInput.value = fromVal;
    if (toInput && document.activeElement !== toInput) toInput.value = toVal;
    if (fill) {
      fill.style.left = fromPct + "%";
      fill.style.width = Math.max(0, toPct - fromPct) + "%";
    }
  }
  function commitLevelSelection(buildId, field, dir, val) {
    const build = builds.find((b) => b.id === buildId);
    if (!build || !build[field]) return;
    val = String(val);
    build[field][dir] = val;
    saveStateDebounced();
    liveUpdateLevelSliderVisual(buildId, field, dir, parseInt(val, 10));
    const noteEl = document.getElementById(`ascensionNote_${field}_${buildId}_${dir}`);
    if (noteEl) noteEl.textContent = noteTextForLevelValue(val);
    const clarifySlot = document.getElementById(`ascensionClarifySlot_${field}_${buildId}_${dir}`);
    if (clarifySlot) clarifySlot.innerHTML = clarifyHtml(buildId, dir, val, field);
    const progressEl = document.getElementById(`levelAscProgress_${field}_${buildId}`);
    if (progressEl) progressEl.innerHTML = levelAscProgressHtml(build[field]);
    if (dir === "to") {
      const planId = field === "weaponLevel" ? `planWeaponLevel_${buildId}` : `planLevel_${buildId}`;
      const planEl = document.getElementById(planId);
      if (planEl) planEl.textContent = `\u2192 ${build[field].to}`;
    }
    if (field === "level" || field === "weaponLevel") refreshCostDisplay(buildId);
  }
  function clampLevelDirValue(build, field, dir, val) {
    const otherVal = otherLevelDirValue(build, field, dir);
    val = Math.max(LEVEL_SLIDER_MIN, Math.min(LEVEL_SLIDER_MAX, val));
    return dir === "from" ? Math.min(val, otherVal) : Math.max(val, otherVal);
  }
  function attachLevelInputListeners() {
    document.querySelectorAll(".level-input").forEach((input) => {
      if (input.dataset.wired) return;
      input.dataset.wired = "1";
      const buildId = input.dataset.buildId;
      const field = input.dataset.levelField;
      const dir = input.dataset.rangeDir;
      input.addEventListener("focus", () => input.select());
      input.addEventListener("mouseup", (e) => e.preventDefault());
      input.addEventListener("input", () => {
        if (input.value === "") return;
        let val = parseInt(input.value, 10);
        if (isNaN(val)) return;
        const build = builds.find((b) => b.id === buildId);
        if (!build || !build[field]) return;
        val = clampLevelDirValue(build, field, dir, val);
        if (String(val) !== input.value) input.value = val;
        commitLevelSelection(buildId, field, dir, val);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
      input.addEventListener("blur", () => {
        if (input.value === "" || isNaN(parseInt(input.value, 10))) {
          const build = builds.find((b) => b.id === buildId);
          if (!build || !build[field]) return;
          const fallback = dir === "from" ? LEVEL_SLIDER_MIN : LEVEL_SLIDER_MAX;
          const val = clampLevelDirValue(build, field, dir, fallback);
          input.value = val;
          commitLevelSelection(buildId, field, dir, val);
        }
      });
    });
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
      b.level = {
        from: "1",
        to: b.level
      };
    }
    if (b && b.talents) {
      ["basic", "skill", "burst"].forEach((t) => {
        if (typeof b.talents[t] === "string") {
          const v = b.talents[t] === "0" ? "1" : b.talents[t];
          b.talents[t] = {
            from: "1",
            to: v
          };
        }
      });
    }
    if (b && b.character === void 0) b.character = null;
    if (b && b.mode === void 0) b.mode = b.character || b.weapon ? "full" : null;
    if (b && b.weapon && !b.weaponLevel) {
      b.weaponLevel = {
        from: "1",
        to: "90"
      };
    }
    if (b && !b.weapon) {
      b.weaponLevel = null;
    }
    return b;
  }
  function saveState() {
    try {
      ensurePlanner();
      const { id, profile, weaponProfile, ...toSave } = builds[0];
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
      const planner = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!planner) return;
      const b = migrateBuild({
        id: uid(),
        ...planner
      });
      builds = [b];
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
    } catch (e) {
      builds = [];
    }
  }
  function initGlobalHandlers() {
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
      ensurePlanner();
      initGlobalHandlers();
      initialized = true;
    }
    renderBuilds();
  };
})();
