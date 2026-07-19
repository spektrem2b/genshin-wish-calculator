(function () {

    // Local fallback so this file never depends on script load order —
    // uses the shared debounce() from app.js if it's already loaded,
    // otherwise defines its own equivalent right here.
    const _debounce = typeof debounce === 'function' ? debounce : function (fn, wait = 150) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    };

    const SAVE_KEY = 'genshin_build_tab_v1';
    const KAMERA_SAVE_KEY = 'genshin_kamera_inventory_v1';
    const KAMERA_OVERRIDE_SAVE_KEY = 'genshin_kamera_manual_overrides_v1';
    let kameraInventory = null;
    let manualOverrides = {}; // { [GOOD key]: number } — user-entered counts for items InventoryKamera failed to scan

    // Some InventoryKamera versions have a known bug where scanning gets
    // interrupted (e.g. erroring on the Traveler) and silently reports
    // "done" without ever reaching these items, so they're just absent from
    // the export rather than genuinely zero. These are the only items we
    // let the user manually fill in, and ONLY when they're missing from the
    // import — if a future InventoryKamera version scans them correctly,
    // the override input for that item disappears on its own.
    const MANUAL_OVERRIDE_ITEMS = [
        { key: 'HerosWit', label: "Hero's Wit" },
        { key: 'AdventurersExperience', label: "Adventurer's Experience" },
        { key: 'WanderersAdvice', label: "Wanderer's Advice" },
        { key: 'MysticEnhancementOre', label: "Mystic Enhancement Ore" },
    ];

    function loadManualOverrides() {
        try {
            const raw = localStorage.getItem(KAMERA_OVERRIDE_SAVE_KEY);
            manualOverrides = raw ? JSON.parse(raw) : {};
        } catch (e) { manualOverrides = {}; }
    }

    function saveManualOverrides() {
        try { localStorage.setItem(KAMERA_OVERRIDE_SAVE_KEY, JSON.stringify(manualOverrides)); }
        catch (e) { /* ignore, non-critical */ }
    }

    // Keys missing from the current import — these are the only ones the
    // override panel should show inputs for.
    function missingOverrideItems() {
        const present = (kameraInventory && kameraInventory.materials) || {};
        return MANUAL_OVERRIDE_ITEMS.filter(item => !(item.key in present));
    }

    const LEVEL_STEPS = ['1', '20', '40', '50', '60', '70', '80', '90'];
    const SOFT_CAP = 10;
    const HARD_CAP = 99;

    const ASCENSION_RANGES = [
        { lower: 1, upper: 20, label: 'No Ascension' },
        { lower: 20, upper: 40, label: '1st Ascension' },
        { lower: 40, upper: 50, label: '2nd Ascension' },
        { lower: 50, upper: 60, label: '3rd Ascension' },
        { lower: 60, upper: 70, label: '4th Ascension' },
        { lower: 70, upper: 80, label: '5th Ascension' },
        { lower: 80, upper: 90, label: '6th Ascension' },
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
        return ASCENSION_RANGES.find(r => r.upper === v);
    }
    function rangeStartingAt(v) {
        return ASCENSION_RANGES.find(r => r.lower === v);
    }
    function nextBreakpointAfter(v) {
        const r = rangeStartingAt(v);
        return r ? r.upper : null;
    }

    // value may be a plain number string ("40") or a resolved compound ("40/50")
    function noteTextForLevelValue(value) {
        if (typeof value === 'string' && value.includes('/')) {
            const [a, b] = value.split('/');
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
        if (typeof value === 'string' && value.includes('/')) return value.split('/')[0];
        return value;
    }

    function clarifyHtml(buildId, dir, value, field) {
        field = field || 'level';
        if (typeof value === 'string' && value.includes('/')) return ''; // already resolved
        const v = parseInt(value, 10);
        if (!AMBIGUOUS_BREAKPOINTS.includes(v)) return '';
        const next = nextBreakpointAfter(v);
        const capLabel = rangeEndingAt(v) ? rangeEndingAt(v).label : '';
        const nextLabel = rangeStartingAt(v) ? rangeStartingAt(v).label : '';
        return `
            <div class="ascension-clarify" id="ascensionClarify_${field}_${buildId}_${dir}">
                <div class="ascension-clarify-prompt">${v} — which do you mean?</div>
                <button type="button" class="clarify-btn" data-build-id="${buildId}" data-range-dir="${dir}" data-level-field="${field}" data-clarify-val="${v}/${v}">${v}/${v} <span>(${capLabel})</span></button>
                <button type="button" class="clarify-btn" data-build-id="${buildId}" data-range-dir="${dir}" data-level-field="${field}" data-clarify-val="${v}/${next}">${v}/${next} <span>(${nextLabel})</span></button>
            </div>
        `;
    }

    // --- derived data for future Mora/XP math (kept separate from rendering) ---
    //
    // ASCENSION_RANGES index doubles as the "phase index": 0 = No Ascension,
    // 1 = 1st Ascension ... 6 = 6th Ascension. This is what the eventual
    // material/Mora calculator should key off of, not raw level numbers,
    // since two different phases can share the same level number (the
    // ambiguity this whole clarify UI exists to resolve).

    // Turns a stored level value ("12", "40", or a resolved "40/50") into
    // a clean { level, phaseIndex } point.
    function resolveLevelPoint(value) {
        if (typeof value === 'string' && value.includes('/')) {
            const [a, b] = value.split('/');
            const numA = parseInt(a, 10);
            if (a === b) {
                const r = rangeEndingAt(numA);
                return { level: numA, phaseIndex: r ? ASCENSION_RANGES.indexOf(r) : 0 };
            }
            const r = rangeStartingAt(numA);
            return { level: numA, phaseIndex: r ? ASCENSION_RANGES.indexOf(r) : 0 };
        }
        const level = parseInt(value, 10) || 1;
        const r = ascensionRangeFor(level);
        return { level, phaseIndex: ASCENSION_RANGES.indexOf(r) };
    }

    // Given a build's { from, to } level range, returns everything a cost
    // calculator would need: clean from/to levels, their phase indices and
    // labels, which ascension phases still need to be paid for, and the
    // raw level span (for per-level XP/Mora costs).
    //
    // e.g. levelPlanSummary({ from: '12', to: '88' }) =>
    // {
    //   fromLevel: 12, fromPhaseIndex: 0, fromPhaseLabel: 'No Ascension',
    //   toLevel: 88, toPhaseIndex: 6, toPhaseLabel: '6th Ascension',
    //   phasesToAscend: [1, 2, 3, 4, 5, 6],
    //   levelSpan: 76
    // }
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
            levelSpan: Math.max(0, to.level - from.level),
        };
    }

    // Same idea for a single talent's { from, to } (Basic/Skill/Burst),
    // no ascension ambiguity here — just the level span and the list of
    // individual talent levels being bought (for book/material lookups).
    function talentPlanSummary(talentRange) {
        const from = parseInt(talentRange.from, 10) || 1;
        const to = parseInt(talentRange.to, 10) || 1;
        const levelsToBuy = [];
        for (let lvl = from + 1; lvl <= to; lvl++) levelsToBuy.push(lvl);
        return { fromLevel: from, toLevel: to, levelsToBuy, levelSpan: Math.max(0, to - from) };
    }

    // Full per-build summary, handy for the eventual cost calculator to
    // pull everything it needs in one call.
    function buildCostInputs(build) {
        return {
            characterLevel: levelPlanSummary(build.level),
            talents: {
                basic: talentPlanSummary(build.talents.basic),
                skill: talentPlanSummary(build.talents.skill),
                burst: talentPlanSummary(build.talents.burst),
            },
            weaponLevel: build.weapon ? levelPlanSummary(build.weaponLevel) : null,
        };
    }

    window.GenshinBuildMath = { resolveLevelPoint, levelPlanSummary, talentPlanSummary, buildCostInputs, ASCENSION_RANGES };

    // Standard fixed EXP book denominations (never change across
    // patches). Greedy fill: as many Hero's Wit as fit, then
    // Adventurer's Experience for the remainder, then round up to a
    // whole Wanderer's Advice for whatever's left — matches how the
    // community actually buys these, minimal excess EXP wasted.
    const EXP_BOOKS = [
        { id: 104003, name: "Hero's Wit", exp: 20000, mora: 4000, rarity: 4 },
        { id: 104002, name: "Adventurer's Experience", exp: 5000, mora: 1000, rarity: 3 },
        { id: 104001, name: "Wanderer's Advice", exp: 1000, mora: 200, rarity: 2 },
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
                id: book.id, name: book.name,
                icon: `https://gi.yatta.moe/assets/UI/UI_ItemIcon_${book.id}.png`,
                rarity: book.rarity, qty: counts[i],
            });
        });
        return { mora, items };
    }

    const EXP_BOOK_IDS = new Set(EXP_BOOKS.map(b => b.id));

    // EXP books are fully fungible in-game — the character doesn't care
    // whether their EXP came from Hero's Wit, Adventurer's Experience, or
    // Wanderer's Advice, it's all just EXP. So checking each tier against
    // your owned count independently is wrong: someone with 0 Hero's Wit
    // but a huge stash of Adventurer's Experience is still completely
    // covered, not "short 418 Hero's Wit." This spends owned books
    // largest-tier-first (mirrors how expToBookCost prices a fresh
    // purchase), and only prices out a NEW purchase for whatever EXP is
    // still missing after every owned book of every tier has been used.
    function computeExpBookCoverage(expNeeded, pool) {
        if (expNeeded <= 0) return { rows: [] };

        if (!pool) {
            // No inventory imported — same plain shopping-list behavior as before,
            // but Adventurer's Experience always gets a row (even at 0) since
            // people track it specifically.
            const items = expToBookCost(expNeeded).items;
            const adventurersBook = EXP_BOOKS.find(b => b.id === 104002);
            if (!items.some(it => it.id === 104002)) {
                items.push({
                    id: adventurersBook.id, name: adventurersBook.name,
                    icon: `https://gi.yatta.moe/assets/UI/UI_ItemIcon_${adventurersBook.id}.png`,
                    rarity: adventurersBook.rarity, qty: 0,
                });
            }
            return { rows: items.map(it => ({ ...it, owned: null, need: it.qty })) };
        }

        let remaining = expNeeded;
        const usedByKey = {};
        EXP_BOOKS.forEach(book => {
            const key = normalizeGoodKey(book.name);
            const owned = typeof pool[key] === 'number' ? pool[key] : 0;
            let use = 0;
            if (remaining > 0 && owned > 0) {
                const neededCount = Math.ceil(remaining / book.exp);
                use = Math.min(owned, neededCount);
                remaining -= use * book.exp;
                pool[key] = owned - use;
            }
            usedByKey[key] = use;
        });

        // Still short after using everything you own? Price out the
        // cheapest fresh purchase for the leftover EXP, and fold those
        // counts back into the same tier rows so nothing gets listed twice.
        const purchase = remaining > 0 ? expToBookCost(remaining) : { items: [] };
        const purchaseByKey = {};
        purchase.items.forEach(it => { purchaseByKey[normalizeGoodKey(it.name)] = it.qty; });

        const rows = EXP_BOOKS.map(book => {
            const key = normalizeGoodKey(book.name);
            const used = usedByKey[key] || 0;
            const toBuy = purchaseByKey[key] || 0;
            // Adventurer's Experience always renders, even at 0 — people track
            // it specifically, unlike the other two tiers which only show up
            // when actually relevant.
            if (used === 0 && toBuy === 0 && book.id !== 104002) return null;
            return {
                id: book.id, name: book.name, rarity: book.rarity,
                icon: `https://gi.yatta.moe/assets/UI/UI_ItemIcon_${book.id}.png`,
                owned: used, need: used + toBuy,
            };
        }).filter(Boolean);

        return { rows };
    }


    // Weapons only ever use Mystic Enhancement Ore for EXP leveling
    // (10,000 EXP / 1,000 Mora each — a flat 0.1 Mora per EXP, unlike
    // characters' 3-tier book system). The game refunds excess EXP on
    // weapons, so no greedy-fill optimization is needed — just ceiling
    // division to the nearest whole Ore.
    const MYSTIC_ORE = { id: 104013, name: "Mystic Enhancement Ore", exp: 10000, mora: 1000, rarity: 3 };

    function weaponExpToOreCost(expNeeded) {
        if (expNeeded <= 0) return { mora: 0, items: [] };
        const oreCount = Math.ceil(expNeeded / MYSTIC_ORE.exp);
        return {
            mora: oreCount * MYSTIC_ORE.mora,
            items: [{
                id: MYSTIC_ORE.id, name: MYSTIC_ORE.name,
                icon: `https://gi.yatta.moe/assets/UI/UI_ItemIcon_${MYSTIC_ORE.id}.png`,
                rarity: MYSTIC_ORE.rarity, qty: oreCount,
            }],
        };
    }

    function weaponExpTableForRarity(rarity) {
        if (rarity <= 3 && typeof weapon3ExpTable !== 'undefined') return weapon3ExpTable;
        if (rarity === 4 && typeof weapon4ExpTable !== 'undefined') return weapon4ExpTable;
        if (typeof weapon5ExpTable !== 'undefined') return weapon5ExpTable;
        return null;
    }

    // Sums Mora + material quantities for a set of {moraCost, items} rows
    // (either promote phases or talent levelCosts) into a running total.
    function accumulateCost(rows, totals) {
        rows.forEach(row => {
            if (!row) return;
            totals.mora += row.moraCost || 0;
            (row.items || []).forEach(item => {
                if (!item.id) return;
                if (!totals.materials[item.id]) {
                    totals.materials[item.id] = { id: item.id, name: item.name, icon: item.icon, rarity: item.rarity, qty: 0 };
                }
                totals.materials[item.id].qty += item.qty || 0;
            });
        });
    }

    // Full cost breakdown for one build card: character ascension +
    // talents (+ weapon later). Returns null if the profile hasn't
    // loaded yet (or failed), so callers can fall back to placeholders.
    function calculateBuildCost(build) {
        if (!build.character || !build.profile) return null;
        const profile = build.profile;
        const inputs = buildCostInputs(build);

        const ascensionTotals = { mora: 0, materials: {} };
        const promotesByPhase = {};
        (profile.promotes || []).forEach(p => { promotesByPhase[p.promoteLevel] = p; });
        accumulateCost(inputs.characterLevel.phasesToAscend.map(i => promotesByPhase[i]), ascensionTotals);

        let charExpNeeded = 0;
        if (typeof GENSHIN_LEVEL_XP !== 'undefined') {
            const fromLvl = inputs.characterLevel.fromLevel;
            const toLvl = inputs.characterLevel.toLevel;
            const fromExp = (GENSHIN_LEVEL_XP[fromLvl] || {}).totalExp || 0;
            const toExp = (GENSHIN_LEVEL_XP[toLvl] || {}).totalExp || 0;
            charExpNeeded = Math.max(0, toExp - fromExp);
            const bookCost = expToBookCost(charExpNeeded);
            accumulateCost([{ moraCost: bookCost.mora, items: bookCost.items }], ascensionTotals);
        }

        const talentTotals = { mora: 0, materials: {} };
        // Burst is NOT always index 2 — some characters (Ayaka, Mona, etc.)
        // have a 4-entry activeTalents array with a non-upgradeable
        // Alternate Sprint sitting between Skill and Burst:
        //   [0] Normal Attack, [1] Skill, [2] Alt Sprint (levelCosts.length === 1), [3] Burst
        // Normal and Skill are reliably index 0/1; Burst is reliably the
        // LAST entry, so index off array length instead of a fixed "2".
        const activeTalents = profile.activeTalents || [];
        const talentByKey = { basic: 0, skill: 1, burst: activeTalents.length - 1 };
        Object.keys(talentByKey).forEach(key => {
            const talent = activeTalents[talentByKey[key]];
            if (!talent || !talent.levelCosts) return;
            const plan = inputs.talents[key];
            const costsByLevel = {};
            talent.levelCosts.forEach(lc => { costsByLevel[lc.level] = lc; });
            accumulateCost(plan.levelsToBuy.map(lvl => costsByLevel[lvl]), talentTotals);
        });

        const materialsList = (totals) => Object.values(totals.materials).sort((a, b) => (b.rarity || 0) - (a.rarity || 0));

        // Weapon ascension cost only (promotes phases). Weapon EXP/enhancement-ore
        // leveling isn't tracked — this is a resource manager, not a stat
        // calculator, and we deliberately didn't pull weapon base-stat/growth-curve
        // data, so there's no clean EXP-to-material conversion like characters have.
        let weaponTotals = null;
        if (build.weapon && build.profile !== undefined && inputs.weaponLevel && build.weaponProfile) {
            weaponTotals = { mora: 0, materials: {} };
            const weaponPromotesByPhase = {};
            (build.weaponProfile.promotes || []).forEach(p => { weaponPromotesByPhase[p.promoteLevel] = p; });
            accumulateCost(inputs.weaponLevel.phasesToAscend.map(i => weaponPromotesByPhase[i]), weaponTotals);

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
            weapon: weaponTotals ? { mora: weaponTotals.mora, materials: materialsList(weaponTotals) } : null,
        };
    }

    // Recompute + patch the cost block for one build in place, without a
    // full renderBuilds(). Needed because level/talent inputs only patch
    // their own label text on 'input' (to avoid blowing away focus/cursor
    // mid-keystroke) — nothing else was telling the Mora/materials numbers
    // to catch up, so they'd sit frozen at whatever they were on the last
    // full render (e.g. the 1/1/1 defaults right after adding a build).
    function refreshCostDisplay(buildId) {
        const idx = builds.findIndex(b => b.id === buildId);
        if (idx === -1) return;
        const build = builds[idx];
        const cost = calculateBuildCost(build);
        if (!cost) return; // profile not loaded yet — full render will handle it

        // Fast-forward the shared pool through every earlier card (in the
        // same order they're displayed) so this card's "have enough" check
        // reflects what's actually left, not the full stash all over again.
        const pool = freshInventoryPool();
        for (let i = 0; i < idx; i++) {
            depletePoolForCost(pool, calculateBuildCost(builds[i]));
        }

        const totalEl = document.getElementById(`costTotalMora_${buildId}`);
        if (totalEl) totalEl.textContent = `${formatMora(cost.totalMora)} Mora`;

        const ascMoraEl = document.getElementById(`ascMora_${buildId}`);
        if (ascMoraEl) ascMoraEl.textContent = `${formatMora(cost.ascension.mora)} Mora`;
        const ascMatsEl = document.getElementById(`ascMats_${buildId}`);
        if (ascMatsEl) ascMatsEl.innerHTML = materialsSummaryHtml(cost.ascension.materials, pool, cost.ascension.expNeeded);

        const talMoraEl = document.getElementById(`talMora_${buildId}`);
        if (talMoraEl) talMoraEl.textContent = `${formatMora(cost.talents.mora)} Mora`;
        const talMatsEl = document.getElementById(`talMats_${buildId}`);
        if (talMatsEl) talMatsEl.innerHTML = materialsSummaryHtml(cost.talents.materials, pool);

        if (cost.weapon) {
            const weaponMoraEl = document.getElementById(`weaponMora_${buildId}`);
            if (weaponMoraEl) weaponMoraEl.textContent = `${formatMora(cost.weapon.mora)} Mora`;
            const weaponMatsEl = document.getElementById(`weaponMats_${buildId}`);
            if (weaponMatsEl) weaponMatsEl.innerHTML = materialsSummaryHtml(cost.weapon.materials, pool);
        }
    }

    // Same basic/skill/burst indexing as calculateBuildCost (burst = last
    // entry, not a hardcoded "2") so the label always matches the numbers.
    function talentNamesLabel(profile) {
        const activeTalents = (profile && profile.activeTalents) || [];
        if (!activeTalents.length) return 'Talents';
        const basic = activeTalents[0];
        const skill = activeTalents[1];
        const burst = activeTalents[activeTalents.length - 1];
        if (!basic || !skill || !burst) return 'Talents';
        return `${basic.name}/${skill.name}/${burst.name}`;
    }

    function formatMora(n) {
        return n.toLocaleString('en-US');
    }

    // Human labels + display order for material categories. Some raw types
    // cover two real categories that only differ by rarity:
    //   characterLevelUpMaterial: rarity 5 = Weekly Boss Material, else Boss Material
    //   characterTalentMaterial:  rarity 5 = Special (Crown of Insight), else Talent Books
    // One master order list works for both the ascension and talent panels —
    // each only ever contains a subset, so filtering this list down to
    // what's present naturally produces the right order for either.
    const TYPE_ORDER = [
        'Weapon EXP', 'EXP Books', 'Weekly Boss Material', 'Boss Material', 'Talent Books',
        'Local Specialty', 'Gemstones', 'Special',
        'Weapon Material', 'Enemy Materials', 'Other',
    ];
    function materialCategory(materialId, rarity) {
        if (materialId === MYSTIC_ORE.id) return 'Weapon EXP';
        const type = typeof GENSHIN_MATERIAL_TYPES !== 'undefined' ? GENSHIN_MATERIAL_TYPES[materialId] : null;
        switch (type) {
            case 'characterEXPMaterial': return 'EXP Books';
            case 'characterLevelUpMaterial': return rarity === 5 ? 'Weekly Boss Material' : 'Boss Material';
            case 'characterTalentMaterial': return rarity === 5 ? 'Special' : 'Talent Books';
            case 'characterandWeaponEnhancementMaterial': return 'Enemy Materials';
            case 'characterAscensionMaterial': return 'Gemstones';
            case 'weaponAscensionMaterial': return 'Weapon Material';
            default:
                if (type && type.indexOf('localSpecialty') === 0) return 'Local Specialty';
                return 'Other';
        }
    }

    // Mirrors GOOD format's key convention (InventoryKamera export):
    // strip apostrophes (kept glued, e.g. "Hero's" -> "Heros"), then
    // PascalCase every remaining word — including lowercase joining
    // words like "of"/"to" which Ambr's names don't capitalize but
    // GOOD keys do ("Teachings of Freedom" -> "TeachingsOfFreedom").
    // Verified against a real export: 100% match including talent
    // books, EXP books, and all previously-working cases.
    function normalizeGoodKey(name) {
        return String(name || '')
            .replace(/'/g, '')
            .split(/[\s\-.]+/)
            .filter(Boolean)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join('');
    }

    function getOwnedQty(materialId, materialName) {
        if (!kameraInventory || !kameraInventory.materials) return null;
        if (materialId === 202) return kameraInventory.materials.Mora || 0; // Mora itself
        const key = normalizeGoodKey(materialName);
        const owned = kameraInventory.materials[key];
        if (typeof owned === 'number') return owned;
        return typeof manualOverrides[key] === 'number' ? manualOverrides[key] : 0;
    }

    // --- Shared inventory pool (fixes double-counting across build cards) ---
    // Most materials (character ascension gems, specific talent books, boss
    // drops) are only ever needed by ONE build card, so comparing that card's
    // need against your full stash "just works" by coincidence. But EXP books
    // (Hero's Wit/Adventurer's Experience/Wanderer's Advice) and Mystic
    // Enhancement Ore are needed by EVERY character/weapon card. Without a
    // shared pool, each card independently checks its need against your full
    // owned amount and would happily show "have enough" on 5 different cards
    // using the same 10 books. freshInventoryPool() makes a mutable copy of
    // owned quantities; claimFromPool() deducts what a card claims so the
    // NEXT card (in the same builds-array order) sees the true leftover.
    function freshInventoryPool() {
        if (!kameraInventory || !kameraInventory.materials) return null;
        const pool = Object.assign({}, kameraInventory.materials);
        // Only fill in an override for a key the import genuinely lacks —
        // never let a manual number override real scanned data.
        MANUAL_OVERRIDE_ITEMS.forEach(item => {
            if (!(item.key in pool) && typeof manualOverrides[item.key] === 'number') {
                pool[item.key] = manualOverrides[item.key];
            }
        });
        return pool;
    }

    function claimFromPool(pool, materialId, materialName, qtyNeeded) {
        if (!pool) return null;
        if (materialId === 202) return pool.Mora || 0; // Mora itself — not depleted here
        const key = normalizeGoodKey(materialName);
        const owned = typeof pool[key] === 'number' ? pool[key] : 0;
        pool[key] = Math.max(0, owned - Math.max(0, qtyNeeded));
        return owned;
    }

    // Depletes `pool` for a build's already-computed cost without rendering
    // anything — used to "fast-forward" through earlier build cards so a
    // single card's refresh still sees the correct leftover amounts.
    function depletePoolForCost(pool, cost) {
        if (!pool || !cost) return;
        const claimAll = (materials) => (materials || []).forEach(m => claimFromPool(pool, m.id, m.name, m.qty || 0));
        claimAll(cost.ascension && cost.ascension.materials);
        claimAll(cost.talents && cost.talents.materials);
        if (cost.weapon) claimAll(cost.weapon.materials);
    }

    function materialsSummaryHtml(materials, pool, expNeeded) {
        if (!materials.length) return '<span class="cost-placeholder">—</span>';

        // EXP books (Hero's Wit / Adventurer's Experience / Wanderer's
        // Advice) are fungible — swap the naive per-tier entries out for
        // substitution-aware rows before bucketing into categories. Other
        // material types (talent books, ascension gems, etc.) are NOT
        // interchangeable 1:1 like this, so they keep the normal per-id
        // ownership check below untouched.
        const nonBookMaterials = materials.filter(m => !EXP_BOOK_IDS.has(m.id));
        const hasBookItems = nonBookMaterials.length !== materials.length;
        const displayMaterials = hasBookItems
            ? nonBookMaterials.concat(computeExpBookCoverage(expNeeded || 0, pool).rows.map(r => ({ ...r, qty: r.need, _precomputedOwned: r.owned })))
            : materials;

        const byCategory = {};
        displayMaterials.forEach(m => {
            const cat = materialCategory(m.id, m.rarity);
            (byCategory[cat] = byCategory[cat] || []).push(m);
        });

        function rowsHtmlFor(cat) {
            const items = byCategory[cat].sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
            return items.map(m => {
                const icon = m.icon
                    ? `<img class="cost-material-icon rarity-${m.rarity || 1}" src="${m.icon}" alt="">`
                    : `<div class="cost-material-icon cost-material-icon-placeholder rarity-${m.rarity || 1}">?</div>`;

                const owned = Object.prototype.hasOwnProperty.call(m, '_precomputedOwned')
                    ? m._precomputedOwned
                    : (pool ? claimFromPool(pool, m.id, m.name, m.qty || 0) : getOwnedQty(m.id, m.name));
                let qtyHtml;
                if (owned === null) {
                    // No inventory imported — show plain total, as before.
                    qtyHtml = `<span class="cost-material-qty">×${formatMora(m.qty)}</span>`;
                } else if (owned >= m.qty) {
                    qtyHtml = `<span class="cost-material-qty cost-material-covered">✓ have enough</span>`;
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
            }).join('');
        }

        // Categories that are (in practice) always single-item and mutually
        // exclusive with their sibling — when both members of a pair show up
        // together, fold them into one narrower card with a divider instead
        // of two mostly-empty cards side by side.
        const MERGE_PAIRS = [
            ['Boss Material', 'Weekly Boss Material', 'Local Specialty'],
            ['Weekly Boss Material', 'Special'],
        ];

        const presentCats = TYPE_ORDER.filter(cat => byCategory[cat]);
        const consumed = new Set();
        const cards = [];
        presentCats.forEach(cat => {
            if (consumed.has(cat)) return;
            const pair = MERGE_PAIRS.find(group => group.includes(cat) && group.some(other => other !== cat && presentCats.includes(other) && !consumed.has(other)));
            if (pair) {
                const members = pair.filter(c => presentCats.includes(c));
                members.forEach(c => consumed.add(c));
                cards.push({ merged: true, label: members.join(' & '), members });
            } else {
                consumed.add(cat);
                cards.push({ merged: false, label: cat });
            }
        });

        const tiersHtml = cards.map(card => {
            if (card.merged) {
                const sections = card.members.map((cat, i) => `
                    ${i > 0 ? '<div class="cost-material-subdivider"></div>' : ''}
                    <div class="cost-material-tier-label">${cat}</div>${rowsHtmlFor(cat)}`).join('');
                return `<div class="cost-material-tier cost-material-tier-merged">${sections}</div>`;
            }
            return `<div class="cost-material-tier"><div class="cost-material-tier-label">${card.label}</div>${rowsHtmlFor(card.label)}</div>`;
        }).join('');
        return `<div class="cost-material-tier-grid">${tiersHtml}</div>`;
    }

    // Ascension breakpoints — which level unlocks which ascension phase (95/100 are weapon-only, ignored here)
    const ASCENSION_NOTES = {
        '1': { label: 'Freshly Pulled', stars: 0 },
        '20': { label: 'No', stars: 0 },
        '40': { label: '1st', stars: 1 },
        '50': { label: '2nd', stars: 2 },
        '60': { label: '3rd', stars: 3 },
        '70': { label: '4th', stars: 4 },
        '80': { label: '5th', stars: 5 },
        '90': { label: '6th', stars: 6 },
    };

    function levelStepNoteHtml(step) {
        const note = ASCENSION_NOTES[step];
        if (!note) return '';
        const stars = note.stars > 0 ? `<span class="level-item-stars">${'✦'.repeat(note.stars)}</span>` : '';
        return `<span class="level-item-note">${note.label}${step === '1' ? '' : ' ascension'}${stars ? ' ' + stars : ''}</span>`;
    }

    let builds = [];
    let swapOpenIds = new Set();
    let weaponSwapOpenIds = new Set();

    function uid() {
        return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function elementIconPath(element) {
        if (!element || element === 'None') return null;
        return `assets/data/element_icons/Element_${element}.svg`;
    }

    function elementBadgeImg(element, size) {
        const path = elementIconPath(element);
        if (!path) return '';
        return `<img class="el-badge-icon" src="${path}" alt="" style="width:${size}px;height:${size}px;">`;
    }

    function iconHtml(entry) {
        if (entry && entry.icon) return `<img src="${entry.icon}" alt="">`;
        return `<div class="ac-icon-placeholder">?</div>`;
    }

    function starsHtml(rarity) {
        const cls = rarity === 5 ? 'gold-star' : '';
        return `<span class="${cls}" style="${rarity === 4 ? 'color:#c39bf0;font-weight:700;' : ''}">${rarity || 5}★</span>`;
    }

    // --- search (characters can be 4* or 5*, so we search the full DB directly) ---

    function searchAllCharacters(query) {
        const pool = GENSHIN_CHARACTER_DB;
        const trimmed = (query || '').trim().toLowerCase();
        const chosen = new Set(builds.filter(b => b.character).map(b => b.character.name));
        const available = pool.filter(c => !chosen.has(c.name));
        if (!trimmed) return available.slice(0, 8);
        return available.filter(c => c.name.toLowerCase().includes(trimmed)).slice(0, 8);
    }

    function searchAllWeapons(query) {
        const pool = GENSHIN_WEAPON_DB;
        const trimmed = (query || '').trim().toLowerCase();
        if (!trimmed) return pool.slice(0, 8);
        return pool.filter(w => w.name.toLowerCase().includes(trimmed)).slice(0, 8);
    }

    // --- build lifecycle ---

    function addBlankBuild() {
        if (builds.length >= HARD_CAP) return;
        builds.push({
            id: uid(),
            character: null,
            level: { from: '1', to: '90' },
            talents: {
                basic: { from: '1', to: '1' },
                skill: { from: '1', to: '1' },
                burst: { from: '1', to: '1' },
            },
            weapon: null,
            weaponLevel: null,
        });
        renderBuilds();
        saveState();
    }

    const profileCache = {};

    function fetchCharacterProfile(id) {
        if (!id) return Promise.resolve(null);
        if (profileCache[id]) return Promise.resolve(profileCache[id]);
        return fetch(`assets/data/character-profiles/${id}.json`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                profileCache[id] = data;
                return data;
            })
            .catch(() => null);
    }

    const weaponProfileCache = {};

    function fetchWeaponProfile(id) {
        if (!id) return Promise.resolve(null);
        if (weaponProfileCache[id]) return Promise.resolve(weaponProfileCache[id]);
        return fetch(`assets/data/weapon-profiles/${id}.json`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                weaponProfileCache[id] = data;
                return data;
            })
            .catch(() => null);
    }

    function setBuildCharacter(buildId, characterEntry) {
        const build = builds.find(b => b.id === buildId);
        if (!build) return;
        if (builds.some(b => b.id !== buildId && b.character && b.character.name === characterEntry.name)) return;

        // GENSHIN_CHARACTER_DB (the autocomplete source) has no `id` field —
        // only GENSHIN_CHARACTER_PROFILE_INDEX does. Without this, id stays
        // undefined, fetchCharacterProfile bails out immediately, and the
        // cost block is stuck on "Loading build data…" forever.
        if (!characterEntry.id && typeof GENSHIN_CHARACTER_PROFILE_INDEX !== 'undefined') {
            const match = GENSHIN_CHARACTER_PROFILE_INDEX.find(p => p.name === characterEntry.name);
            if (match) characterEntry = { ...characterEntry, id: match.id };
        }

        build.character = characterEntry;
        build.profile = null;
        swapOpenIds.delete(buildId);
        renderBuilds();
        saveState();

        fetchCharacterProfile(characterEntry.id).then(profile => {
            if (build.character !== characterEntry) return; // swapped again before this resolved
            build.profile = profile;
            renderBuilds();
        });
    }

    function removeBuild(id) {
        builds = builds.filter(b => b.id !== id);
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

    // --- per-card character autocomplete (for blank cards) ---

    function renderCharListFor(buildId, query) {
        const list = document.getElementById(`charList_${buildId}`);
        if (!list) return;
        const results = searchAllCharacters(query);
        if (!results.length) {
            list.classList.add('hidden');
            list.innerHTML = '';
            return;
        }
        list.innerHTML = results.map(entry => `
            <div class="autocomplete-item" data-name="${entry.name.replace(/"/g, '&quot;')}">
                ${iconHtml(entry)}
                <span class="ac-name">${entry.name}</span>
                <span class="ac-sub">${entry.element ? `<img class="el-icon" src="${elementIconPath(entry.element)}" alt="">${entry.element} • ` : ''}${starsHtml(entry.rarity)}</span>
            </div>
        `).join('');
        list.classList.remove('hidden');
    }

    // --- per-card weapon autocomplete ---

    function renderWeaponList(buildId, query) {
        const list = document.getElementById(`weaponList_${buildId}`);
        if (!list) return;
        const results = searchAllWeapons(query);
        if (!results.length) {
            list.classList.add('hidden');
            list.innerHTML = '';
            return;
        }
        list.innerHTML = results.map(entry => `
            <div class="autocomplete-item" data-wname="${entry.name.replace(/"/g, '&quot;')}">
                ${iconHtml(entry)}
                <span class="ac-name">${entry.name}</span>
                <span class="ac-sub">${entry.weaponType ? `${entry.weaponType} • ` : ''}${starsHtml(entry.rarity)}</span>
            </div>
        `).join('');
        list.classList.remove('hidden');
    }

    function setBuildWeapon(buildId, weaponEntry) {
        const build = builds.find(b => b.id === buildId);
        if (!build) return;
        if (!weaponEntry.id && typeof GENSHIN_WEAPON_PROFILE_INDEX !== 'undefined') {
            const match = GENSHIN_WEAPON_PROFILE_INDEX.find(p => p.name === weaponEntry.name);
            if (match) weaponEntry = { ...weaponEntry, id: match.id };
        }
        build.weapon = weaponEntry;
        build.weaponLevel = { from: '1', to: '90' };
        build.weaponProfile = null;
        weaponSwapOpenIds.delete(buildId);
        renderBuilds();
        saveState();

        fetchWeaponProfile(weaponEntry.id).then(profile => {
            if (build.weapon !== weaponEntry) return; // swapped again before this resolved
            build.weaponProfile = profile;
            renderBuilds();
        });
    }

    function clearBuildWeapon(buildId) {
        const build = builds.find(b => b.id === buildId);
        if (!build) return;
        build.weapon = null;
        build.weaponLevel = null;
        build.weaponProfile = null;
        weaponSwapOpenIds.delete(buildId);
        renderBuilds();
        saveState();
    }

    // --- render ---

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

    // Populated fresh each render — abilitiesListHtml() fills this in, the
    // modal click handler reads out of it. Keyed by "buildId:group:index"
    // so we don't have to cram descriptions into data-attributes (they can
    // contain quotes/newlines that are awkward to HTML-escape safely).
    const skillModalData = {};

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function activeTalentTypeLabel(index, total) {
        if (index === 0) return 'Normal Attack';
        if (index === total - 1) return 'Elemental Burst';
        if (index === 1) return 'Elemental Skill';
        return 'Special Talent'; // e.g. Ayaka's Senho, cooking talents, etc.
    }

    // Abilities panel: lists the character's active talents (Normal Attack,
    // Elemental Skill, Elemental Burst, and any extra active abilities) and
    // passive talents as tappable rows, each tagged with its type so it's
    // clear what you're opening before you click. Informational only,
    // doesn't affect the plan.
    function abilitiesListHtml(build) {
        const profile = build.profile;
        if (!profile || !(profile.activeTalents || []).length) return '';

        const activeTalents = profile.activeTalents || [];
        const rows = activeTalents.map((t, i) => {
            const type = activeTalentTypeLabel(i, activeTalents.length);
            skillModalData[`${build.id}:active:${i}`] = { ...t, type };
            return { group: 'active', index: i, icon: t.icon, name: t.name, type };
        });
        (profile.passiveTalents || []).forEach((t, i) => {
            skillModalData[`${build.id}:passive:${i}`] = { ...t, type: 'Passive Talent' };
            rows.push({ group: 'passive', index: i, icon: t.icon, name: t.name, type: 'Passive Talent' });
        });
        if (!rows.length) return '';

        return `
            <div class="abilities-list">
                ${rows.map(r => `
                    <button type="button" class="skill-row" data-skill-open="${build.id}:${r.group}:${r.index}">
                        <span class="skill-row-text">
                            <span class="skill-row-type">${r.type}</span>
                            <span class="skill-row-name">${escapeHtml(r.name)}</span>
                        </span>
                        <span class="skill-row-chevron">›</span>
                    </button>
                `).join('')}
            </div>`;
    }

    function openSkillModal(key) {
        const t = skillModalData[key];
        if (!t) return;

        const existing = document.getElementById('skillModalOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'skillModalOverlay';
        overlay.className = 'skill-modal-overlay';
        overlay.innerHTML = `
            <div class="skill-modal-card">
                <div class="skill-modal-header">
                    ${t.icon
                        ? `<img class="skill-modal-icon" src="${t.icon}" alt="">`
                        : `<div class="skill-modal-icon skill-row-icon-placeholder">?</div>`}
                    <span class="skill-modal-titlewrap">
                        ${t.type ? `<span class="skill-modal-type">${escapeHtml(t.type)}</span>` : ''}
                        <span class="skill-modal-title">${escapeHtml(t.name)}</span>
                    </span>
                    <button type="button" class="skill-modal-close" aria-label="Close">✕</button>
                </div>
                <div class="skill-modal-body">${escapeHtml(t.description || 'No description available.')}</div>
            </div>`;

        function close() { overlay.remove(); }
        overlay.querySelector('.skill-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        document.body.appendChild(overlay);
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
                    <span class="talent-row-arrow">→</span>
                    <input type="number" class="level-input input-compact" data-build-id="${build.id}" data-range-dir="to" data-level-field="weaponLevel" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.weaponLevel.to)}" title="To">
                </div>
                <div class="ascension-note-pair">
                    <div class="ascension-note" id="ascensionNote_weaponLevel_${build.id}_from">${noteTextForLevelValue(build.weaponLevel.from)}</div>
                    <div class="ascension-note" id="ascensionNote_weaponLevel_${build.id}_to">${noteTextForLevelValue(build.weaponLevel.to)}</div>
                </div>
                <div class="ascension-clarify-slot" id="ascensionClarifySlot_weaponLevel_${build.id}_from">${clarifyHtml(build.id, 'from', build.weaponLevel.from, 'weaponLevel')}</div>
                <div class="ascension-clarify-slot" id="ascensionClarifySlot_weaponLevel_${build.id}_to">${clarifyHtml(build.id, 'to', build.weaponLevel.to, 'weaponLevel')}</div>
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
                <div class="cost-row" style="margin-top:14px;">
                    <span class="cost-row-label">Weapon <span class="cost-row-plan" id="planWeaponLevel_${build.id}">→ ${build.weaponLevel.to}</span></span>
                    <span class="cost-row-value"><span class="cost-placeholder">—</span> Mora</span>
                </div>`;
            }
            const wMora = cost && cost.weapon ? `${formatMora(cost.weapon.mora)} Mora` : `<span class="cost-placeholder">—</span> Mora`;
            const wMats = cost && cost.weapon ? materialsSummaryHtml(cost.weapon.materials, pool) : '<span class="cost-placeholder">—</span>';
            return `
                <div class="cost-row" style="margin-top:14px;">
                    <span class="cost-row-label">Weapon <span class="cost-row-plan" id="planWeaponLevel_${build.id}">→ ${build.weaponLevel.to}</span></span>
                    <span class="cost-row-value" id="weaponMora_${build.id}">${wMora}</span>
                </div>
                <div class="cost-materials-panel" id="weaponMats_${build.id}">${wMats}</div>`;
        })() : '';

        const headerBlock = swapOpenIds.has(build.id) ? `
            <div style="display:flex; align-items:flex-start; gap:14px; margin-bottom:22px; max-width:460px;">
                <span class="avatar-badge">
                    ${c.icon ? `<img src="${c.icon}" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);display:block;">` : `<div class="ac-icon-placeholder" style="width:52px;height:52px;">?</div>`}
                    ${elBadge}
                </span>
                <div style="flex:1; min-width:0;">
                    <div class="autocomplete-wrap">
                        <input type="text" class="build-char-input" data-build-id="${build.id}" placeholder="Swap character..." autocomplete="off">
                        <div class="autocomplete-list hidden" id="charList_${build.id}"></div>
                    </div>
                </div>
                <button type="button" class="build-remove-btn" data-remove-build="${build.id}" title="Remove character" aria-label="Remove character">&times;</button>
            </div>
        ` : `
            <div style="display:flex; align-items:center; gap:14px; margin-bottom:22px; max-width:460px;">
                <button type="button" class="char-header-swap" data-swap-toggle="${build.id}" title="Click to change character">
                    <span class="avatar-badge">
                        ${c.icon ? `<img src="${c.icon}" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);display:block;">` : `<div class="ac-icon-placeholder" style="width:52px;height:52px;">?</div>`}
                        ${elBadge}
                    </span>
                    <div style="flex:1; text-align:left;">
                        <div style="font-size:1.2rem; font-weight:700;">${c.name}</div>
                        <div style="font-size:0.9rem; color:var(--text-muted); display:flex; align-items:center; gap:5px; margin-top:2px;">
                            ${c.element ? `${c.element} • ` : ''}${starsHtml(c.rarity)}
                        </div>
                    </div>
                </button>
                <button type="button" class="build-remove-btn" data-remove-build="${build.id}" title="Remove character" aria-label="Remove character">&times;</button>
            </div>
        `;

        const abilitiesHtml = abilitiesListHtml(build);

        return `
        <div class="section-card build-card" data-build-id="${build.id}">
            <div class="top-layout">
                <div class="planner-col">
                    ${headerBlock}

                    <div class="form-group" style="margin-bottom:0;">
                        <label>Level &amp; Talents <span style="color: var(--text-muted); font-weight:400; font-size:0.8rem;">— Talents 1 to 10</span></label>
                        <div class="stat-cards-grid">
                            <div class="talent-row">
                                <div class="talent-row-label">Level</div>
                                <div class="talent-row-fields">
                                    <input type="number" class="level-input input-compact" data-build-id="${build.id}" data-range-dir="from" data-level-field="level" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.level.from)}" title="From">
                                    <span class="talent-row-arrow">→</span>
                                    <input type="number" class="level-input input-compact" data-build-id="${build.id}" data-range-dir="to" data-level-field="level" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.level.to)}" title="To">
                                </div>
                                <div class="ascension-note-pair">
                                    <div class="ascension-note" id="ascensionNote_level_${build.id}_from">${noteTextForLevelValue(build.level.from)}</div>
                                    <div class="ascension-note" id="ascensionNote_level_${build.id}_to">${noteTextForLevelValue(build.level.to)}</div>
                                </div>
                                <div class="ascension-clarify-slot" id="ascensionClarifySlot_level_${build.id}_from">${clarifyHtml(build.id, 'from', build.level.from, 'level')}</div>
                                <div class="ascension-clarify-slot" id="ascensionClarifySlot_level_${build.id}_to">${clarifyHtml(build.id, 'to', build.level.to, 'level')}</div>
                            </div>
                            ${[
                                { key: 'basic', label: 'Basic Attack' },
                                { key: 'skill', label: 'Skill' },
                                { key: 'burst', label: 'Burst' },
                            ].map(({ key, label }) => `
                                <div class="talent-row">
                                    <div class="talent-row-label">${label}</div>
                                    <div class="talent-row-fields">
                                        <input type="number" class="talent-input input-compact" data-build-id="${build.id}" data-talent="${key}" data-range-dir="from" min="1" max="10" step="1" placeholder="1" value="${build.talents[key].from}" title="From">
                                        <span class="talent-row-arrow">→</span>
                                        <input type="number" class="talent-input input-compact" data-build-id="${build.id}" data-talent="${key}" data-range-dir="to" min="1" max="10" step="1" placeholder="1" value="${build.talents[key].to}" title="To">
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="weapon-col">
                    ${weaponBlock}
                </div>

                ${abilitiesHtml ? `
                <aside class="abilities-panel">
                    <div class="abilities-panel-title">Abilities</div>
                    ${abilitiesHtml}
                </aside>` : ''}
            </div>

            <div style="border-top:1px solid var(--border-color); margin:22px 0 0;"></div>
            ${(() => {
                const cost = calculateBuildCost(build);
                const totalMora = cost ? `${formatMora(cost.totalMora)} Mora` : `<span class="cost-placeholder">—</span> Mora`;
                const ascMora = cost ? `${formatMora(cost.ascension.mora)} Mora` : `<span class="cost-placeholder">—</span> Mora`;
                const ascMats = cost ? materialsSummaryHtml(cost.ascension.materials, pool, cost.ascension.expNeeded) : '<span class="cost-placeholder">—</span>';
                const talMora = cost ? `${formatMora(cost.talents.mora)} Mora` : `<span class="cost-placeholder">—</span> Mora`;
                const talMats = cost ? materialsSummaryHtml(cost.talents.materials, pool) : '<span class="cost-placeholder">—</span>';
                const loadingNote = build.character && !build.profile
                    ? `<div class="explanation" style="margin:0 0 10px;">Loading build data…</div>` : '';
                return `
            <div class="cost-block">
                <div class="cost-block-title">Total Cost</div>
                ${loadingNote}

                <div class="cost-total-row">
                    <span class="cost-total-label">Total Mora</span>
                    <span class="cost-total-value" id="costTotalMora_${build.id}">${totalMora}</span>
                </div>

                <div class="cost-row" style="margin-top:14px;">
                    <span class="cost-row-label">Character level <span class="cost-row-plan" id="planLevel_${build.id}">→ ${build.level.to}</span></span>
                    <span class="cost-row-value" id="ascMora_${build.id}">${ascMora}</span>
                </div>
                <div class="cost-materials-panel" id="ascMats_${build.id}">${ascMats}</div>

                <div class="cost-row" style="margin-top:14px;">
                    <span class="cost-row-label">${build.profile ? talentNamesLabel(build.profile) : 'Talents'} <span class="cost-row-plan" id="planTalents_${build.id}">→ ${build.talents.basic.to}/${build.talents.skill.to}/${build.talents.burst.to}</span></span>
                    <span class="cost-row-value" id="talMora_${build.id}">${talMora}</span>
                </div>
                <div class="cost-materials-panel" id="talMats_${build.id}">${talMats}</div>
                ${weaponCostRows}
            </div>`;
            })()}
        </div>`;
    }

    function renderBuilds() {
        const wrap = document.getElementById('buildCardsWrap');
        const emptyHint = document.getElementById('buildEmptyHint');
        const softHint = document.getElementById('buildSoftCapHint');
        const addBtn = document.getElementById('buildAddBtn');

        if (emptyHint) emptyHint.classList.toggle('hidden', builds.length > 0);

        if (softHint) {
            if (builds.length >= HARD_CAP) {
                softHint.textContent = `You've hit the ${HARD_CAP}-build cap. Remove one to add another.`;
                softHint.classList.remove('hidden');
            } else if (builds.length >= SOFT_CAP) {
                softHint.textContent = `${builds.length} builds and counting — this is a resin-based game, maybe pace yourself.`;
                softHint.classList.remove('hidden');
            } else {
                softHint.classList.add('hidden');
            }
        }

        if (addBtn) addBtn.disabled = builds.length >= HARD_CAP;

        const buildResetBtn = document.getElementById('buildResetBtn');
        if (buildResetBtn) buildResetBtn.disabled = builds.length === 0;

        if (!builds.length) {
            wrap.innerHTML = '';
            attachCardListeners();
            return;
        }
        const pool = freshInventoryPool();
        wrap.innerHTML = builds.map(b => renderBuildCard(b, pool)).join('');
        attachCardListeners();
    }

    function attachCardListeners() {
        document.querySelectorAll('.level-input, .talent-input').forEach(input => {
            input.addEventListener('focus', () => input.select());
            input.addEventListener('mouseup', (e) => e.preventDefault());
        });

        document.querySelectorAll('[data-remove-build]').forEach(btn => {
            btn.addEventListener('click', () => removeBuild(btn.dataset.removeBuild));
        });

        document.querySelectorAll('[data-swap-toggle]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                swapOpenIds.add(btn.dataset.swapToggle);
                renderBuilds();
            });
        });

        document.querySelectorAll('[data-swap-weapon-toggle]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                weaponSwapOpenIds.add(btn.dataset.swapWeaponToggle);
                renderBuilds();
            });
        });

        document.querySelectorAll('.level-input').forEach(input => {
            const field = input.dataset.levelField || 'level';
            input.addEventListener('input', () => {
                if (input.value === '') return; // let it sit empty while typing/deleting
                let val = parseInt(input.value, 10);
                if (isNaN(val)) return;
                val = Math.max(1, Math.min(90, val));
                if (String(val) !== input.value) input.value = val;
                const build = builds.find(b => b.id === input.dataset.buildId);
                if (build && build[field]) {
                    const dir = input.dataset.rangeDir;
                    build[field][dir] = String(val);
                    saveStateDebounced();
                    const noteEl = document.getElementById(`ascensionNote_${field}_${build.id}_${dir}`);
                    if (noteEl) noteEl.textContent = noteTextForLevelValue(String(val));
                    const clarifySlot = document.getElementById(`ascensionClarifySlot_${field}_${build.id}_${dir}`);
                    if (clarifySlot) clarifySlot.innerHTML = clarifyHtml(build.id, dir, String(val), field);
                    if (dir === 'to') {
                        const planId = field === 'weaponLevel' ? `planWeaponLevel_${build.id}` : `planLevel_${build.id}`;
                        const planEl = document.getElementById(planId);
                        if (planEl) planEl.textContent = `→ ${build[field].to}`;
                    }
                    if (field === 'level') refreshCostDisplay(build.id);
                }
            });
            input.addEventListener('blur', () => {
                if (input.value === '' || isNaN(parseInt(input.value, 10))) {
                    input.value = 1;
                    const build = builds.find(b => b.id === input.dataset.buildId);
                    if (build && build[field]) {
                        build[field][input.dataset.rangeDir] = '1';
                        saveState();
                        renderBuilds();
                    }
                }
            });
        });

        document.querySelectorAll('.talent-input').forEach(input => {
            input.addEventListener('input', () => {
                if (input.value === '') return; // let it sit empty while typing/deleting
                let val = parseInt(input.value, 10);
                if (isNaN(val)) return;
                val = Math.max(1, Math.min(10, val));
                if (String(val) !== input.value) input.value = val;
                const build = builds.find(b => b.id === input.dataset.buildId);
                if (build) {
                    build.talents[input.dataset.talent][input.dataset.rangeDir] = String(val);
                    saveStateDebounced();
                    const planEl = document.getElementById(`planTalents_${build.id}`);
                    if (planEl) planEl.textContent = `→ ${build.talents.basic.to}/${build.talents.skill.to}/${build.talents.burst.to}`;
                    refreshCostDisplay(build.id);
                }
            });
            input.addEventListener('blur', () => {
                if (input.value === '' || isNaN(parseInt(input.value, 10))) {
                    input.value = 1;
                    const build = builds.find(b => b.id === input.dataset.buildId);
                    if (build) {
                        build.talents[input.dataset.talent][input.dataset.rangeDir] = '1';
                        saveState();
                        renderBuilds();
                    }
                }
            });
        });

        document.querySelectorAll('[data-clear-weapon]').forEach(btn => {
            btn.addEventListener('click', () => clearBuildWeapon(btn.dataset.clearWeapon));
        });

        attachWeaponInputListeners();
        attachCharInputListeners();
    }

    function closeAllLevelLists() {
        document.querySelectorAll('.updown-select-list').forEach(l => l.classList.add('hidden'));
        document.querySelectorAll('[data-level-toggle]').forEach(b => b.classList.remove('open'));
        document.querySelectorAll('.build-card.has-open-dropdown').forEach(c => c.classList.remove('has-open-dropdown'));
    }

    function attachCharInputListeners() {
        document.querySelectorAll('.build-char-input').forEach(input => {
            const buildId = input.dataset.buildId;
            input.addEventListener('input', (e) => renderCharListFor(buildId, e.target.value));
            input.addEventListener('focus', (e) => renderCharListFor(buildId, e.target.value));

            const list = document.getElementById(`charList_${buildId}`);
            if (list) {
                list.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const item = e.target.closest('.autocomplete-item');
                    if (!item) return;
                    const name = item.dataset.name;
                    const entry = GENSHIN_CHARACTER_DB.find(c => c.name === name);
                    if (entry) setBuildCharacter(buildId, entry);
                });
            }
        });
    }

    function attachWeaponInputListeners() {
        document.querySelectorAll('.build-weapon-input').forEach(input => {
            const buildId = input.dataset.buildId;
            input.addEventListener('input', (e) => renderWeaponList(buildId, e.target.value));
            input.addEventListener('focus', (e) => renderWeaponList(buildId, e.target.value));

            const list = document.getElementById(`weaponList_${buildId}`);
            if (list) {
                list.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const item = e.target.closest('.autocomplete-item');
                    if (!item) return;
                    const name = item.dataset.wname;
                    const entry = GENSHIN_WEAPON_DB.find(w => w.name === name);
                    if (entry) setBuildWeapon(buildId, entry);
                });
            }
        });
    }

    // --- migration for older saved data (pre from/to ranges) ---

    function migrateBuild(b) {
        if (b && typeof b.level === 'string') {
            b.level = { from: '1', to: b.level };
        }
        if (b && b.talents) {
            ['basic', 'skill', 'burst'].forEach(t => {
                if (typeof b.talents[t] === 'string') {
                    const v = b.talents[t] === '0' ? '1' : b.talents[t];
                    b.talents[t] = { from: '1', to: v };
                }
            });
        }
        if (b && b.character === undefined) b.character = null;
        if (b && b.weapon && !b.weaponLevel) {
            b.weaponLevel = { from: '1', to: '90' };
        }
        if (b && !b.weapon) {
            b.weaponLevel = null;
        }
        return b;
    }

    // --- Manual override panel ---
    // Keeps the "+ Add" button honest about what it'll do, and shows/hides
    // the Reset button depending on whether there's anything to reset.
    function syncKameraButtonsUI() {
        const kameraBtn = document.getElementById('kameraImportBtn');
        const resetBtn = document.getElementById('kameraResetBtn');
        if (kameraBtn) kameraBtn.textContent = kameraInventory ? '↻ Replace InventoryKamera .json' : '+ Add InventoryKamera .json';
        if (resetBtn) resetBtn.classList.toggle('hidden', !kameraInventory);
    }

    // Shows one number input per material InventoryKamera failed to include
    // in the import. Disappears entirely once nothing's missing (either
    // because the user filled everything in, or a future InventoryKamera
    // version scans it correctly on its own).
    function renderOverridePanel() {
        const panel = document.getElementById('kameraOverridePanel');
        if (!panel) return;

        if (!kameraInventory) {
            panel.classList.add('hidden');
            panel.innerHTML = '';
            return;
        }

        const missing = missingOverrideItems();
        if (!missing.length) {
            panel.classList.add('hidden');
            panel.innerHTML = '';
            return;
        }

        panel.classList.remove('hidden');
        panel.innerHTML = `
            <div style="color:var(--danger); font-size:0.85rem; margin-bottom:8px;">
                Your InventoryKamera export didn't include ${missing.length === 1 ? 'this item' : 'these items'}.
                Enter how many you actually own and they'll count toward your builds:
            </div>
            ${missing.map(item => `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                    <label style="flex:1; font-size:0.9rem;">${item.label}</label>
                    <input type="number" min="0" step="1" class="kamera-override-input" data-override-key="${item.key}"
                        placeholder="0" value="${typeof manualOverrides[item.key] === 'number' ? manualOverrides[item.key] : ''}"
                        style="width:100px;">
                </div>
            `).join('')}
        `;

        panel.querySelectorAll('.kamera-override-input').forEach(input => {
            input.addEventListener('input', _debounce(() => {
                const key = input.dataset.overrideKey;
                if (input.value === '') {
                    delete manualOverrides[key];
                } else {
                    const val = Math.max(0, parseInt(input.value, 10) || 0);
                    manualOverrides[key] = val;
                }
                saveManualOverrides();
                renderBuilds();
            }, 200));
        });
    }

    // --- InventoryKamera import ---

    function kameraStatusMessage(inv) {
        const matCount = Object.keys(inv.materials).length;
        if (!inv.characters.length && !inv.weapons.length) {
            return `Imported ${matCount} material types (materials-only scan — no character/weapon data included).`;
        }
        return `Imported ${inv.characters.length} characters, ${inv.weapons.length} weapons, ${matCount} material types.`;
    }

    function handleKameraImport(file) {
        const statusEl = document.getElementById('kameraImportStatus');
        const reader = new FileReader();
        reader.onload = (e) => {
            let parsed;
            try {
                parsed = JSON.parse(e.target.result);
            } catch (err) {
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--danger);">Couldn't read that file — not valid JSON.</span>`;
                return;
            }

            if (!parsed || parsed.format !== 'GOOD' || typeof parsed.materials !== 'object' || parsed.materials === null) {
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--danger);">That doesn't look like a GOOD-format InventoryKamera export — missing expected fields.</span>`;
                return;
            }

            // characters/weapons are optional — a scan with only "Materials"
            // and "Char Development Items" checked in InventoryKamera won't
            // include them at all, and that's a perfectly valid import for
            // this tab's purposes (it only needs materials to check coverage
            // against your existing build cards).
            const characters = Array.isArray(parsed.characters) ? parsed.characters : [];
            const weapons = Array.isArray(parsed.weapons) ? parsed.weapons : [];

            // Only keep what we actually use — characters, weapons, materials.
            // Anything else in the file (artifacts, etc.) is never read or stored.
            kameraInventory = {
                characters: characters,
                weapons: weapons,
                materials: parsed.materials,
                importedAt: Date.now(),
            };

            try {
                localStorage.setItem(KAMERA_SAVE_KEY, JSON.stringify(kameraInventory));
            } catch (err) { /* ignore, non-critical */ }

            if (statusEl) {
                statusEl.innerHTML = kameraStatusMessage(kameraInventory);
            }
            renderOverridePanel();
            syncKameraButtonsUI();
            renderBuilds();
        };
        reader.onerror = () => {
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--danger);">Couldn't read that file.</span>`;
        };
        reader.readAsText(file);
    }

    function loadKameraInventory() {
        try {
            const raw = localStorage.getItem(KAMERA_SAVE_KEY);
            if (!raw) return;
            kameraInventory = JSON.parse(raw);
            const statusEl = document.getElementById('kameraImportStatus');
            if (statusEl && kameraInventory) {
                statusEl.innerHTML = kameraStatusMessage(kameraInventory);
            }
        } catch (e) { kameraInventory = null; }
        loadManualOverrides();
        renderOverridePanel();
        syncKameraButtonsUI();
    }

    // Wipes the imported inventory AND any manual overrides — for when
    // someone's stuck with a stale/outdated scan and doesn't want to
    // re-run InventoryKamera right now, or just wants a clean slate.
    function resetKameraInventory() {
        kameraInventory = null;
        manualOverrides = {};
        try {
            localStorage.removeItem(KAMERA_SAVE_KEY);
            localStorage.removeItem(KAMERA_OVERRIDE_SAVE_KEY);
        } catch (e) { /* ignore, non-critical */ }
        const statusEl = document.getElementById('kameraImportStatus');
        if (statusEl) statusEl.textContent = '';
        renderOverridePanel();
        syncKameraButtonsUI();
        renderBuilds();
    }

    // --- persistence ---

    function saveState() {
        try {
            const toSave = builds.map(b => {
                const { profile, weaponProfile, ...rest } = b;
                return rest;
            });
            localStorage.setItem(SAVE_KEY, JSON.stringify(toSave));
        } catch (e) { /* ignore, non-critical */ }
    }

    // Debounced variant for use on hot paths like level/talent number inputs,
    // where every keystroke would otherwise re-stringify and write the whole
    // builds array to localStorage.
    const saveStateDebounced = _debounce(saveState, 300);

    function loadState() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                builds = parsed.map(migrateBuild);
                builds.forEach(b => {
                    if (b.character) {
                        if (!b.character.id && typeof GENSHIN_CHARACTER_PROFILE_INDEX !== 'undefined') {
                            const match = GENSHIN_CHARACTER_PROFILE_INDEX.find(p => p.name === b.character.name);
                            if (match) b.character.id = match.id;
                        }
                        if (b.character.id) {
                            fetchCharacterProfile(b.character.id).then(profile => {
                                b.profile = profile;
                                renderBuilds();
                            });
                        }
                    }
                    if (b.weapon) {
                        if (!b.weapon.id && typeof GENSHIN_WEAPON_PROFILE_INDEX !== 'undefined') {
                            const match = GENSHIN_WEAPON_PROFILE_INDEX.find(p => p.name === b.weapon.name);
                            if (match) b.weapon.id = match.id;
                        }
                        if (b.weapon.id) {
                            fetchWeaponProfile(b.weapon.id).then(profile => {
                                b.weaponProfile = profile;
                                renderBuilds();
                            });
                        }
                    }
                });
            }
        } catch (e) { builds = []; }
    }

    // --- global wiring ---

    function initGlobalHandlers() {
        const addBtn = document.getElementById('buildAddBtn');
        if (addBtn && !addBtn.dataset.wired) {
            addBtn.dataset.wired = '1';
            addBtn.addEventListener('click', addBlankBuild);
        }

        const kameraBtn = document.getElementById('kameraImportBtn');
        const kameraInput = document.getElementById('kameraFileInput');
        if (kameraBtn && kameraInput && !kameraBtn.dataset.wired) {
            kameraBtn.dataset.wired = '1';
            kameraBtn.addEventListener('click', () => kameraInput.click());
            kameraInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                kameraInput.value = ''; // allow re-selecting the same file later
                if (file) handleKameraImport(file);
            });
        }

        const kameraResetBtn = document.getElementById('kameraResetBtn');
        if (kameraResetBtn && !kameraResetBtn.dataset.wired) {
            kameraResetBtn.dataset.wired = '1';
            kameraResetBtn.addEventListener('click', () => {
                if (confirm('Clear your imported InventoryKamera data and any manual overrides? Your build cards will stay, but material coverage will show as unknown until you import again.')) {
                    resetKameraInventory();
                }
            });
        }

        const buildResetBtn = document.getElementById('buildResetBtn');
        if (buildResetBtn && !buildResetBtn.dataset.wired) {
            buildResetBtn.dataset.wired = '1';
            buildResetBtn.addEventListener('click', () => {
                if (!builds.length) return;
                resetAllBuilds();
            });
        }

        if (!document.body.dataset.skillModalWired) {
            document.body.dataset.skillModalWired = '1';
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-skill-open]');
                if (btn) openSkillModal(btn.dataset.skillOpen);
            });
        }

        if (!document.body.dataset.buildOutsideClickWired) {
            document.body.dataset.buildOutsideClickWired = '1';
            document.addEventListener('click', (e) => {
                const clarifyBtn = e.target.closest('.clarify-btn');
                if (clarifyBtn) {
                    const build = builds.find(b => b.id === clarifyBtn.dataset.buildId);
                    const field = clarifyBtn.dataset.levelField || 'level';
                    if (build && build[field]) {
                        build[field][clarifyBtn.dataset.rangeDir] = clarifyBtn.dataset.clarifyVal;
                        saveState();
                        renderBuilds();
                    }
                    return;
                }
                if (!e.target.closest('.autocomplete-wrap')) {
                    document.querySelectorAll('.autocomplete-list').forEach(l => {
                        l.classList.add('hidden');
                        l.innerHTML = '';
                    });
                }
                if (!e.target.closest('.updown-select')) {
                    closeAllLevelLists();
                }
                if (swapOpenIds.size && !e.target.closest('.build-card')) {
                    swapOpenIds.clear();
                    renderBuilds();
                }
                if (weaponSwapOpenIds.size && !e.target.closest('.build-card')) {
                    weaponSwapOpenIds.clear();
                    renderBuilds();
                }
            });
        }
    }

    let initialized = false;

    window.activateBuildTab = function () {
        if (!initialized) {
            loadState();
            loadKameraInventory();
            initGlobalHandlers();
            initialized = true;
        }
        renderBuilds();
    };

})();
