(function () {

    const SAVE_KEY = 'genshin_build_tab_v1';

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

        if (typeof GENSHIN_LEVEL_XP !== 'undefined') {
            const fromLvl = inputs.characterLevel.fromLevel;
            const toLvl = inputs.characterLevel.toLevel;
            const fromExp = (GENSHIN_LEVEL_XP[fromLvl] || {}).totalExp || 0;
            const toExp = (GENSHIN_LEVEL_XP[toLvl] || {}).totalExp || 0;
            const expNeeded = Math.max(0, toExp - fromExp);
            const bookCost = expToBookCost(expNeeded);
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
            ascension: { mora: ascensionTotals.mora, materials: materialsList(ascensionTotals) },
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
        const build = builds.find(b => b.id === buildId);
        if (!build) return;
        const cost = calculateBuildCost(build);
        if (!cost) return; // profile not loaded yet — full render will handle it

        const totalEl = document.getElementById(`costTotalMora_${buildId}`);
        if (totalEl) totalEl.textContent = `${formatMora(cost.totalMora)} Mora`;

        const ascMoraEl = document.getElementById(`ascMora_${buildId}`);
        if (ascMoraEl) ascMoraEl.textContent = `${formatMora(cost.ascension.mora)} Mora`;
        const ascMatsEl = document.getElementById(`ascMats_${buildId}`);
        if (ascMatsEl) ascMatsEl.innerHTML = materialsSummaryHtml(cost.ascension.materials);

        const talMoraEl = document.getElementById(`talMora_${buildId}`);
        if (talMoraEl) talMoraEl.textContent = `${formatMora(cost.talents.mora)} Mora`;
        const talMatsEl = document.getElementById(`talMats_${buildId}`);
        if (talMatsEl) talMatsEl.innerHTML = materialsSummaryHtml(cost.talents.materials);

        if (cost.weapon) {
            const weaponMoraEl = document.getElementById(`weaponMora_${buildId}`);
            if (weaponMoraEl) weaponMoraEl.textContent = `${formatMora(cost.weapon.mora)} Mora`;
            const weaponMatsEl = document.getElementById(`weaponMats_${buildId}`);
            if (weaponMatsEl) weaponMatsEl.innerHTML = materialsSummaryHtml(cost.weapon.materials);
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

    function materialsSummaryHtml(materials) {
        if (!materials.length) return '<span class="cost-placeholder">—</span>';
        const byCategory = {};
        materials.forEach(m => {
            const cat = materialCategory(m.id, m.rarity);
            (byCategory[cat] = byCategory[cat] || []).push(m);
        });
        return TYPE_ORDER.filter(cat => byCategory[cat]).map(cat => {
            const items = byCategory[cat].sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
            const rows = items.map(m => {
                const icon = m.icon
                    ? `<img class="cost-material-icon rarity-${m.rarity || 1}" src="${m.icon}" alt="">`
                    : `<div class="cost-material-icon cost-material-icon-placeholder rarity-${m.rarity || 1}">?</div>`;
                return `
                    <div class="cost-material-row">
                        ${icon}
                        <span class="cost-material-name">${m.name}</span>
                        <span class="cost-material-qty">×${formatMora(m.qty)}</span>
                    </div>`;
            }).join('');
            return `<div class="cost-material-tier"><div class="cost-material-tier-label">${cat}</div>${rows}</div>`;
        }).join('');
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

    function renderBuildCard(build) {
        if (!build.character) return renderBlankCard(build);

        const c = build.character;
        const elBadge = elementBadgeImg(c.element, 20);

        const weaponBlock = build.weapon ? `
            <div class="selected-asset-chip" style="margin-top:14px;">
                ${iconHtml(build.weapon)}
                <div class="sac-name" style="font-size:1.05rem;">${build.weapon.name} <span class="sac-sub">${starsHtml(build.weapon.rarity)}</span></div>
                <button type="button" class="sac-clear" data-clear-weapon="${build.id}" title="Remove weapon">&times;</button>
            </div>

            <div class="form-group" style="margin-top:16px; margin-bottom:0;">
                <label>Weapon level</label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                        <div class="range-sublabel">From</div>
                        <input type="number" class="level-input" data-build-id="${build.id}" data-range-dir="from" data-level-field="weaponLevel" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.weaponLevel.from)}">
                        <div class="ascension-note" id="ascensionNote_weaponLevel_${build.id}_from">${noteTextForLevelValue(build.weaponLevel.from)}</div>
                        <div class="ascension-clarify-slot" id="ascensionClarifySlot_weaponLevel_${build.id}_from">${clarifyHtml(build.id, 'from', build.weaponLevel.from, 'weaponLevel')}</div>
                    </div>
                    <div>
                        <div class="range-sublabel">To</div>
                        <input type="number" class="level-input" data-build-id="${build.id}" data-range-dir="to" data-level-field="weaponLevel" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.weaponLevel.to)}">
                        <div class="ascension-note" id="ascensionNote_weaponLevel_${build.id}_to">${noteTextForLevelValue(build.weaponLevel.to)}</div>
                        <div class="ascension-clarify-slot" id="ascensionClarifySlot_weaponLevel_${build.id}_to">${clarifyHtml(build.id, 'to', build.weaponLevel.to, 'weaponLevel')}</div>
                    </div>
                </div>
            </div>
        ` : `
            <div class="autocomplete-wrap" style="margin-top:14px;">
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
            const wMats = cost && cost.weapon ? materialsSummaryHtml(cost.weapon.materials) : '<span class="cost-placeholder">—</span>';
            return `
                <div class="cost-row" style="margin-top:14px;">
                    <span class="cost-row-label">Weapon <span class="cost-row-plan" id="planWeaponLevel_${build.id}">→ ${build.weaponLevel.to}</span></span>
                    <span class="cost-row-value" id="weaponMora_${build.id}">${wMora}</span>
                </div>
                <div class="cost-materials-panel" id="weaponMats_${build.id}">${wMats}</div>`;
        })() : '';

        const headerBlock = swapOpenIds.has(build.id) ? `
            <div style="display:flex; align-items:flex-start; gap:14px; margin-bottom:22px;">
                <span class="avatar-badge">
                    ${c.icon ? `<img src="${c.icon}" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);display:block;">` : `<div class="ac-icon-placeholder" style="width:52px;height:52px;">?</div>`}
                    ${elBadge}
                </span>
                <div style="flex:1;">
                    <div class="autocomplete-wrap">
                        <input type="text" class="build-char-input" data-build-id="${build.id}" placeholder="Swap character..." autocomplete="off">
                        <div class="autocomplete-list hidden" id="charList_${build.id}"></div>
                    </div>
                </div>
                <button type="button" class="build-remove-btn" data-remove-build="${build.id}" title="Remove character" aria-label="Remove character">&times;</button>
            </div>
        ` : `
            <div style="display:flex; align-items:center; gap:14px; margin-bottom:22px;">
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

        return `
        <div class="section-card build-card" data-build-id="${build.id}">
            ${headerBlock}

            <div class="form-group">
                <label>Level</label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                        <div class="range-sublabel">From</div>
                        <input type="number" class="level-input" data-build-id="${build.id}" data-range-dir="from" data-level-field="level" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.level.from)}">
                        <div class="ascension-note" id="ascensionNote_level_${build.id}_from">${noteTextForLevelValue(build.level.from)}</div>
                        <div class="ascension-clarify-slot" id="ascensionClarifySlot_level_${build.id}_from">${clarifyHtml(build.id, 'from', build.level.from, 'level')}</div>
                    </div>
                    <div>
                        <div class="range-sublabel">To</div>
                        <input type="number" class="level-input" data-build-id="${build.id}" data-range-dir="to" data-level-field="level" min="1" max="90" step="1" placeholder="1" value="${levelInputDisplayValue(build.level.to)}">
                        <div class="ascension-note" id="ascensionNote_level_${build.id}_to">${noteTextForLevelValue(build.level.to)}</div>
                        <div class="ascension-clarify-slot" id="ascensionClarifySlot_level_${build.id}_to">${clarifyHtml(build.id, 'to', build.level.to, 'level')}</div>
                    </div>
                </div>
            </div>

            <div class="form-group" style="margin-bottom:0;">
                <label>Talents <span style="color: var(--text-muted); font-weight:400; font-size:0.8rem;">— 1 to 10</span></label>
                <div class="talent-stack">
                    ${[
                        { key: 'basic', label: 'Basic Attack' },
                        { key: 'skill', label: 'Skill' },
                        { key: 'burst', label: 'Burst' },
                    ].map(({ key, label }) => `
                        <div class="talent-row">
                            <div class="talent-row-label">${label}</div>
                            <div class="talent-row-fields">
                                <div>
                                    <div class="range-sublabel">From</div>
                                    <input type="number" class="talent-input" data-build-id="${build.id}" data-talent="${key}" data-range-dir="from" min="1" max="10" step="1" placeholder="1" value="${build.talents[key].from}">
                                </div>
                                <div>
                                    <div class="range-sublabel">To</div>
                                    <input type="number" class="talent-input" data-build-id="${build.id}" data-talent="${key}" data-range-dir="to" min="1" max="10" step="1" placeholder="1" value="${build.talents[key].to}">
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div style="border-top:1px solid var(--border-color); margin:22px 0 0;"></div>
            ${weaponBlock}

            <div style="border-top:1px solid var(--border-color); margin:22px 0 0;"></div>
            ${(() => {
                const cost = calculateBuildCost(build);
                const totalMora = cost ? `${formatMora(cost.totalMora)} Mora` : `<span class="cost-placeholder">—</span> Mora`;
                const ascMora = cost ? `${formatMora(cost.ascension.mora)} Mora` : `<span class="cost-placeholder">—</span> Mora`;
                const ascMats = cost ? materialsSummaryHtml(cost.ascension.materials) : '<span class="cost-placeholder">—</span>';
                const talMora = cost ? `${formatMora(cost.talents.mora)} Mora` : `<span class="cost-placeholder">—</span> Mora`;
                const talMats = cost ? materialsSummaryHtml(cost.talents.materials) : '<span class="cost-placeholder">—</span>';
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

        if (!builds.length) {
            wrap.innerHTML = '';
            attachCardListeners();
            return;
        }
        wrap.innerHTML = builds.map(renderBuildCard).join('');
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
                    saveState();
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
                    saveState();
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
            });
        }
    }

    let initialized = false;

    window.activateBuildTab = function () {
        if (!initialized) {
            loadState();
            initGlobalHandlers();
            initialized = true;
        }
        renderBuilds();
    };

})();
