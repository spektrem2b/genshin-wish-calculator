// testlol
// Local icon paths from assets/data/** (characters.js/weapons.js) resolve
// against assets/data/, not the page root — see tab-build.js's
// fetchCharacterProfile comment for the full story.
function dataAssetSrc(path) {
    if (!path) return null;
    if (/^(https?:)?\/\//.test(path) || path.startsWith('assets/data/')) return path;
    return `assets/data/${path}`;
}

function activateOddsTab() {
    initOddsPanel();
    const charInput = document.getElementById('oddsCharInput');
    if (charInput) {
        selectedOddsChar = null;
        charInput.value = '';
    }
    const wepInput = document.getElementById('oddsWepInput');
    if (wepInput) {
        selectedOddsWeapon = null;
        wepInput.value = '';
    }
}

let guaranteedCumulative = null;
function getGuaranteedCumulative() {
    if (guaranteedCumulative) return guaranteedCumulative;
    const arr = new Array(91).fill(0);
    let survival = 1;
    for (let n = 1; n <= 90; n++) {
        let p = n < 74 ? 0.006 : (n < 90 ? 0.006 + (n - 73) * 0.06 : 1);
        p = Math.min(p, 1);
        survival *= (1 - p);
        arr[n] = (1 - survival) * 100;
    }
    return (guaranteedCumulative = arr);
}

const noGuaranteeCumulativeCache = {};
function getNoGuaranteeCumulative(winProb) {
    if (noGuaranteeCumulativeCache[winProb]) return noGuaranteeCumulativeCache[winProb];

    const pmf = new Array(91).fill(0);
    let survival = 1;
    for (let n = 1; n <= 90; n++) {
        let p = n < 74 ? 0.006 : (n < 90 ? 0.006 + (n - 73) * 0.06 : 1);
        p = Math.min(p, 1);
        pmf[n] = survival * p;
        survival *= (1 - p);
    }

    const selfConv = new Array(181).fill(0);
    for (let i = 1; i <= 90; i++) {
        if (pmf[i] === 0) continue;
        for (let j = 1; j <= 90; j++) {
            if (pmf[j] === 0) continue;
            selfConv[i + j] += pmf[i] * pmf[j];
        }
    }

    const arr = new Array(181).fill(0);
    let g = 0, c2 = 0;
    for (let n = 1; n <= 180; n++) {
        if (n <= 90) g += pmf[n];
        c2 += selfConv[n];
        arr[n] = (winProb * g + (1 - winProb) * c2) * 100;
    }
    return (noGuaranteeCumulativeCache[winProb] = arr);
}
// Weapon banner: 0.7% base, soft pity starts at wish 63, hard pity at 77.
// Epitomized Path (post-5.0): losing a 5★ roll (whether it's the OTHER featured
// weapon at 37.5% or a standard weapon at 25%, i.e. 62.5% combined) banks a single
// Fate Point that guarantees your chosen target on the very next 5★ weapon pull.
// So structurally this is identical to the character 50/50 — just 37.5/62.5 odds,
// a 77-pull hard pity, and soft pity kicking in earlier at 63.
let guaranteedCumulativeWeapon = null;
function getGuaranteedCumulativeWeapon() {
    if (guaranteedCumulativeWeapon) return guaranteedCumulativeWeapon;
    const arr = new Array(78).fill(0);
    let survival = 1;
    for (let n = 1; n <= 77; n++) {
        let p = n < 63 ? 0.007 : (n < 77 ? 0.007 + (n - 62) * 0.07 : 1);
        p = Math.min(p, 1);
        survival *= (1 - p);
        arr[n] = (1 - survival) * 100;
    }
    return (guaranteedCumulativeWeapon = arr);
}

const noGuaranteeCumulativeWeaponCache = {};
function getNoGuaranteeCumulativeWeapon(winProb) {
    if (noGuaranteeCumulativeWeaponCache[winProb]) return noGuaranteeCumulativeWeaponCache[winProb];

    const pmf = new Array(78).fill(0);
    let survival = 1;
    for (let n = 1; n <= 77; n++) {
        let p = n < 63 ? 0.007 : (n < 77 ? 0.007 + (n - 62) * 0.07 : 1);
        p = Math.min(p, 1);
        pmf[n] = survival * p;
        survival *= (1 - p);
    }

    const selfConv = new Array(155).fill(0);
    for (let i = 1; i <= 77; i++) {
        if (pmf[i] === 0) continue;
        for (let j = 1; j <= 77; j++) {
            if (pmf[j] === 0) continue;
            selfConv[i + j] += pmf[i] * pmf[j];
        }
    }

    const arr = new Array(155).fill(0);
    let g = 0, c2 = 0;
    for (let n = 1; n <= 154; n++) {
        if (n <= 77) g += pmf[n];
        c2 += selfConv[n];
        arr[n] = (winProb * g + (1 - winProb) * c2) * 100;
    }
    return (noGuaranteeCumulativeWeaponCache[winProb] = arr);
}

let oddsInitialized = false;
let selectedOddsChar = null;
let selectedOddsWeapon = null;

function initOddsPanel() {
    const panel = document.getElementById('oddsPanel');
    if (oddsInitialized) return;
    oddsInitialized = true;

    panel.innerHTML = `
        <div class="odds-sim-buttons" style="margin-bottom: 20px;">
            <button type="button" id="oddsSubTabCharBtn" class="btn-roll">Character</button>
            <button type="button" id="oddsSubTabWepBtn" class="btn-roll btn-roll-secondary">Weapon</button>
        </div>
        <div id="oddsCharacterPane"></div>
        <div id="oddsWeaponPane" class="hidden"></div>
    `;

    const charBtn = document.getElementById('oddsSubTabCharBtn');
    const wepBtn = document.getElementById('oddsSubTabWepBtn');
    const charPane = document.getElementById('oddsCharacterPane');
    const wepPane = document.getElementById('oddsWeaponPane');

    const setOddsSubTab = (tab) => {
        const isChar = tab === 'character';
        charPane.classList.toggle('hidden', !isChar);
        wepPane.classList.toggle('hidden', isChar);
        charBtn.classList.toggle('btn-roll-secondary', !isChar);
        wepBtn.classList.toggle('btn-roll-secondary', isChar);
    };
    charBtn.addEventListener('click', () => setOddsSubTab('character'));
    wepBtn.addEventListener('click', () => setOddsSubTab('weapon'));

    initOddsCharacterPane(charPane);
    initOddsWeaponPane(wepPane);
}

function initOddsCharacterPane(panel) {
    const fiveStars = GENSHIN_CHARACTER_DB.filter(c => c.rarity === 5).slice().sort((a, b) => a.name.localeCompare(b.name));
    const defaultBudget = Math.max(0, (parseInt(currentWishesEl.value) || 0) + Math.floor((parseInt(currentStarglitterEl.value) || 0) / 5));
    const defaultPity = Math.max(0, parseInt(charPityEl.value) || 0);

    panel.innerHTML = `
        <div class="odds-intro">Pick one 5★ and see if today's wishes have a shot. This is a single random roll each time you press the button — not a prediction.</div>

        <div class="odds-empty-note" style="margin-bottom: 12px;">On average, players win a 5★ around wish <strong>76</strong>.</div>

        <div class="form-group autocomplete-wrap">
            <label>Character</label>
            <input type="text" id="oddsCharInput" placeholder="e.g. Sandrone" autocomplete="off">
            <div id="oddsCharList" class="autocomplete-list hidden"></div>
        </div>

        <div class="odds-input-row">
            <div class="form-group">
                <label>Wishes Available</label>
                <input type="number" id="oddsBudget" min="0" max="9999" placeholder="0" value="${Math.min(defaultBudget, 9999) || ''}">
            </div>
            <div class="form-group">
                <label>Current Pity</label>
                <input type="number" id="oddsPity" min="0" max="89" placeholder="0" value="${defaultPity || ''}">
            </div>
        </div>

        <div class="form-group">
            <label class="checkbox-label">
                <input type="checkbox" id="oddsGuarantee">
                Guaranteed (lost last 50/50 — next 5★ is featured for sure)
            </label>
        </div>

        <div class="form-group" id="oddsStreakGroup">
            <label>Consecutive 50/50 Losses So Far <span style="color: var(--text-muted); font-weight: normal;">(Capturing Radiance, 5.0+)</span></label>
            <select id="oddsStreak">
                <option value="0">0 — no active streak</option>
                <option value="1">1 — lost your last 50/50</option>
                <option value="2">2 — lost your last two in a row (next 50/50 is a guaranteed win)</option>
            </select>
        </div>

        <div class="odds-sim-buttons">
            <button type="button" id="oddsRollBtn" class="btn-roll">Simulate</button>
            <button type="button" id="oddsBatchBtn" class="btn-roll btn-roll-secondary">Simulate ×10000</button>
        </div>

        <div id="oddsResult"></div>
    `;

    document.getElementById('oddsRollBtn').addEventListener('click', rollOdds);
    document.getElementById('oddsBatchBtn').addEventListener('click', runBatchSim);

    const guaranteeEl = document.getElementById('oddsGuarantee');
    const streakGroupEl = document.getElementById('oddsStreakGroup');
    const toggleStreakVisibility = () => {
        streakGroupEl.style.display = guaranteeEl.checked ? 'none' : '';
    };
    guaranteeEl.addEventListener('change', toggleStreakVisibility);
    toggleStreakVisibility();

    document.getElementById('oddsBudget').addEventListener('input', (e) => {
        if (e.target.value.length > 4) e.target.value = e.target.value.slice(0, 4);
    });

    document.getElementById('oddsBudget').addEventListener('focus', (e) => {
        e.target.select();
    });

    const input = document.getElementById('oddsCharInput');
    const list = document.getElementById('oddsCharList');

    function renderOddsCharList(query) {
        const q = (query || '').trim().toLowerCase();
        const results = q ? fiveStars.filter(c => c.name.toLowerCase().includes(q)) : fiveStars;
        if (!results.length) { list.classList.add('hidden'); list.innerHTML = ''; return; }
        list.innerHTML = results.slice(0, 8).map(c => `
            <div class="autocomplete-item" data-name="${c.name.replace(/"/g, '&quot;')}">
                ${assetIconHtml(c)}
                <span class="ac-name">${c.name}</span>
                <span class="ac-sub">${assetSubLabel(c)}</span>
            </div>
        `).join('');
        list.classList.remove('hidden');
    }

    function pickOddsChar(entry) {
        selectedOddsChar = entry;
        input.value = entry.name;
        list.classList.add('hidden');
        list.innerHTML = '';
    }

    input.addEventListener('focus', () => renderOddsCharList(input.value));
    input.addEventListener('input', () => {
        selectedOddsChar = null;
        renderOddsCharList(input.value);
    });
    list.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (!item) return;
        const entry = fiveStars.find(c => c.name === item.dataset.name);
        if (entry) pickOddsChar(entry);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#oddsCharInput') && !e.target.closest('#oddsCharList')) {
            list.classList.add('hidden');
        }
    });

    if (fiveStars.length) pickOddsChar(fiveStars[0]);
}

function initOddsWeaponPane(panel) {
    const fiveStars = GENSHIN_WEAPON_DB.filter(w => w.rarity === 5).slice().sort((a, b) => a.name.localeCompare(b.name));
    const defaultBudget = Math.max(0, (parseInt(currentWishesEl.value) || 0) + Math.floor((parseInt(currentStarglitterEl.value) || 0) / 5));
    const defaultPity = Math.max(0, parseInt(wepPityEl.value) || 0);

    panel.innerHTML = `
        <div class="odds-intro">Pick your Epitomized Path target and see if today's wishes have a shot. This is a single random roll each time you press the button — not a prediction.</div>

        <div class="odds-empty-note" style="margin-bottom: 12px;">Every 5★ weapon pull is <strong>37.5%</strong> your chosen target, <strong>62.5%</strong> not (37.5% the other featured weapon, 25% a standard weapon). Any loss banks a Fate Point that guarantees your target on the very next 5★ weapon pull.</div>

        <div class="form-group autocomplete-wrap">
            <label>Epitomized Path Target</label>
            <input type="text" id="oddsWepInput" placeholder="e.g. Verdict" autocomplete="off">
            <div id="oddsWepList" class="autocomplete-list hidden"></div>
        </div>

        <div class="odds-input-row">
            <div class="form-group">
                <label>Wishes Available</label>
                <input type="number" id="oddsBudgetWep" min="0" max="9999" placeholder="0" value="${Math.min(defaultBudget, 9999) || ''}">
            </div>
            <div class="form-group">
                <label>Current Pity</label>
                <input type="number" id="oddsPityWep" min="0" max="76" placeholder="0" value="${defaultPity || ''}">
            </div>
        </div>

        <div class="form-group">
            <label class="checkbox-label">
                <input type="checkbox" id="oddsGuaranteeWep">
                Fate Point banked (lost your last 5★ weapon — next one is guaranteed target)
            </label>
        </div>

        <div class="odds-sim-buttons">
            <button type="button" id="oddsRollBtnWep" class="btn-roll">Simulate</button>
            <button type="button" id="oddsBatchBtnWep" class="btn-roll btn-roll-secondary">Simulate ×10000</button>
        </div>

        <div id="oddsResultWep"></div>
    `;

    document.getElementById('oddsRollBtnWep').addEventListener('click', rollOddsWeapon);
    document.getElementById('oddsBatchBtnWep').addEventListener('click', runBatchSimWeapon);

    document.getElementById('oddsBudgetWep').addEventListener('input', (e) => {
        if (e.target.value.length > 4) e.target.value = e.target.value.slice(0, 4);
    });

    document.getElementById('oddsBudgetWep').addEventListener('focus', (e) => {
        e.target.select();
    });

    const input = document.getElementById('oddsWepInput');
    const list = document.getElementById('oddsWepList');

    function renderOddsWepList(query) {
        const q = (query || '').trim().toLowerCase();
        const results = q ? fiveStars.filter(w => w.name.toLowerCase().includes(q)) : fiveStars;
        if (!results.length) { list.classList.add('hidden'); list.innerHTML = ''; return; }
        list.innerHTML = results.slice(0, 8).map(w => `
            <div class="autocomplete-item" data-name="${w.name.replace(/"/g, '&quot;')}">
                ${assetIconHtml(w)}
                <span class="ac-name">${w.name}</span>
                <span class="ac-sub">${assetSubLabel(w)}</span>
            </div>
        `).join('');
        list.classList.remove('hidden');
    }

    function pickOddsWep(entry) {
        selectedOddsWeapon = entry;
        input.value = entry.name;
        list.classList.add('hidden');
        list.innerHTML = '';
    }

    input.addEventListener('focus', () => renderOddsWepList(input.value));
    input.addEventListener('input', () => {
        selectedOddsWeapon = null;
        renderOddsWepList(input.value);
    });
    list.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (!item) return;
        const entry = fiveStars.find(w => w.name === item.dataset.name);
        if (entry) pickOddsWep(entry);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#oddsWepInput') && !e.target.closest('#oddsWepList')) {
            list.classList.add('hidden');
        }
    });

    if (fiveStars.length) pickOddsWep(fiveStars[0]);
}

function rollOddsWeapon() {
    const resultEl = document.getElementById('oddsResultWep');
    if (!selectedOddsWeapon) {
        resultEl.innerHTML = `<div class="odds-empty-note">Pick a weapon first.</div>`;
        return;
    }
    const entry = selectedOddsWeapon;
    const budget = Math.max(0, parseInt(document.getElementById('oddsBudgetWep').value) || 0);
    const pity = Math.max(0, Math.min(76, parseInt(document.getElementById('oddsPityWep').value) || 0));
    const guaranteed = document.getElementById('oddsGuaranteeWep').checked;

    const curve = guaranteed ? getGuaranteedCumulativeWeapon() : getNoGuaranteeCumulativeWeapon(0.375);
    const maxIdx = curve.length - 1;
    const clamp = n => Math.max(0, Math.min(maxIdx, Math.round(n)));

    const floor = curve[clamp(pity)];
    const ceiling = curve[clamp(pity + budget)];
    const winChance = floor >= 100 ? 100 : ((ceiling - floor) / (100 - floor)) * 100;

    const landedIdx = simulateOneRoll(curve, maxIdx, pity);
    const wishesNeeded = landedIdx - pity;
    const won = wishesNeeded <= budget;

    const iconHtml = entry.icon
        ? `<img src="${dataAssetSrc(entry.icon)}" alt="" class="odds-result-icon">`
        : `<div class="ac-icon-placeholder odds-result-icon">?</div>`;
    const rollIconSrc = won
        ? 'assets/data/custom_icons/icon_pull_tab_win.webp'
        : 'assets/data/custom_icons/icon_pull_tab_loss.webp';

    resultEl.innerHTML = `
        <div class="odds-result-card ${won ? 'odds-result-win' : 'odds-result-lose'}">
            ${iconHtml}
            <div class="odds-result-info">
                <div class="odds-result-name">${entry.name}</div>
                <div class="odds-result-chance">Chance to win: <strong>${winChance.toFixed(1)}%</strong></div>
                <div class="odds-result-roll-text">
                    ${won
                        ? `Rolled: won it on wish ${wishesNeeded === 0 ? pity : pity + wishesNeeded}`
                        : `Rolled: would've needed ${pity + wishesNeeded} wishes — you only had ${budget}`}
                </div>
            </div>
            <img src="${rollIconSrc}" alt="" class="odds-result-roll-icon">
        </div>
        ${buildOddsChart(curve, pity, budget, landedIdx, maxIdx, [63, 140])}
    `;
}

function runBatchSimWeapon() {
    const resultEl = document.getElementById('oddsResultWep');
    if (!selectedOddsWeapon) {
        resultEl.innerHTML = `<div class="odds-empty-note">Pick a weapon first.</div>`;
        return;
    }
    const entry = selectedOddsWeapon;
    const budget = Math.max(0, parseInt(document.getElementById('oddsBudgetWep').value) || 0);
    const pity = Math.max(0, Math.min(76, parseInt(document.getElementById('oddsPityWep').value) || 0));
    const guaranteed = document.getElementById('oddsGuaranteeWep').checked;

    const curve = guaranteed ? getGuaranteedCumulativeWeapon() : getNoGuaranteeCumulativeWeapon(0.375);
    const maxIdx = curve.length - 1;

    const trials = 10000;
    const wishesArr = new Array(trials);
    let wins = 0;
    for (let t = 0; t < trials; t++) {
        const landedIdx = simulateOneRoll(curve, maxIdx, pity);
        const wishesNeeded = landedIdx - pity;
        wishesArr[t] = wishesNeeded;
        if (wishesNeeded <= budget) wins++;
    }
    wishesArr.sort((a, b) => a - b);
    const median = wishesArr[Math.floor(trials / 2)];
    const mean = wishesArr.reduce((s, v) => s + v, 0) / trials;
    const winRate = (wins / trials) * 100;
    const best = wishesArr[0];
    const worst = wishesArr[trials - 1];

    const iconHtml = entry.icon
        ? `<img src="${dataAssetSrc(entry.icon)}" alt="" class="odds-result-icon">`
        : `<div class="ac-icon-placeholder odds-result-icon">?</div>`;

    resultEl.innerHTML = `
        <div class="odds-result-card odds-result-batch">
            ${iconHtml}
            <div class="odds-result-info">
                <div class="odds-result-name">${entry.name} — ${trials.toLocaleString()} simulated pulls${trials > 9000 ? " <span style=\"color: var(--accent-gold);\">(it's over 9000!)</span>" : ''}</div>
                <div class="odds-result-chance">Median: <strong>${median}</strong> wishes &nbsp;·&nbsp; Mean: <strong>${mean.toFixed(1)}</strong> wishes</div>
                <div class="odds-result-chance" style="margin-top: 4px;">Best: <strong style="color: var(--success);">${best}</strong> wishes &nbsp;·&nbsp; Worst: <strong style="color: var(--danger);">${worst}</strong> wishes</div>
                <div class="odds-result-roll-text" style="color: var(--text-muted);">
                    With ${budget} wishes on hand, you'd have won in <strong style="color: ${winRate >= 50 ? 'var(--success)' : 'var(--danger)'}">${winRate.toFixed(1)}%</strong> of these runs.
                </div>
            </div>
        </div>
        ${buildOddsChart(curve, pity, budget, pity + median, maxIdx, [63, 140])}
    `;
}

function simulateOneRoll(curve, maxIdx, pity) {
    const clamp = n => Math.max(0, Math.min(maxIdx, Math.round(n)));
    const floor = curve[clamp(pity)];
    const roll = floor + Math.random() * (100 - floor);
    let landedIdx = maxIdx;
    for (let i = pity; i <= maxIdx; i++) {
        if (curve[i] >= roll) { landedIdx = i; break; }
    }
    return landedIdx;
}

function rollOdds() {
    const resultEl = document.getElementById('oddsResult');
    if (!selectedOddsChar) {
        resultEl.innerHTML = `<div class="odds-empty-note">Pick a character first.</div>`;
        return;
    }
    const entry = selectedOddsChar;
    const budget = Math.max(0, parseInt(document.getElementById('oddsBudget').value) || 0);
    const pity = Math.max(0, Math.min(89, parseInt(document.getElementById('oddsPity').value) || 0));
    const guaranteed = document.getElementById('oddsGuarantee').checked;
    const streak = guaranteed ? 0 : parseInt(document.getElementById('oddsStreak').value) || 0;

    const curve = guaranteed || streak === 2
        ? getGuaranteedCumulative()
        : getNoGuaranteeCumulative(streak === 1 ? 0.55 : 0.5);
    const maxIdx = curve.length - 1;
    const clamp = n => Math.max(0, Math.min(maxIdx, Math.round(n)));

    const floor = curve[clamp(pity)];
    const ceiling = curve[clamp(pity + budget)];
    const winChance = floor >= 100 ? 100 : ((ceiling - floor) / (100 - floor)) * 100;

    const landedIdx = simulateOneRoll(curve, maxIdx, pity);
    const wishesNeeded = landedIdx - pity;
    const won = wishesNeeded <= budget;

    const iconHtml = entry.icon
        ? `<img src="${dataAssetSrc(entry.icon)}" alt="" class="odds-result-icon">`
        : `<div class="ac-icon-placeholder odds-result-icon">?</div>`;
    const rollIconSrc = won
        ? 'assets/data/custom_icons/icon_pull_tab_win.webp'
        : 'assets/data/custom_icons/icon_pull_tab_loss.webp';

    resultEl.innerHTML = `
        <div class="odds-result-card ${won ? 'odds-result-win' : 'odds-result-lose'}">
            ${iconHtml}
            <div class="odds-result-info">
                <div class="odds-result-name">${entry.name}</div>
                <div class="odds-result-chance">Chance to win: <strong>${winChance.toFixed(1)}%</strong></div>
                <div class="odds-result-roll-text">
                    ${won
                        ? `Rolled: won it on wish ${wishesNeeded === 0 ? pity : pity + wishesNeeded}`
                        : `Rolled: would've needed ${pity + wishesNeeded} wishes — you only had ${budget}`}
                </div>
            </div>
            <img src="${rollIconSrc}" alt="" class="odds-result-roll-icon">
        </div>
        ${buildOddsChart(curve, pity, budget, landedIdx, maxIdx)}
    `;
}

function runBatchSim() {
    const resultEl = document.getElementById('oddsResult');
    if (!selectedOddsChar) {
        resultEl.innerHTML = `<div class="odds-empty-note">Pick a character first.</div>`;
        return;
    }
    const entry = selectedOddsChar;
    const budget = Math.max(0, parseInt(document.getElementById('oddsBudget').value) || 0);
    const pity = Math.max(0, Math.min(89, parseInt(document.getElementById('oddsPity').value) || 0));
    const guaranteed = document.getElementById('oddsGuarantee').checked;
    const streak = guaranteed ? 0 : parseInt(document.getElementById('oddsStreak').value) || 0;

    const curve = guaranteed || streak === 2
        ? getGuaranteedCumulative()
        : getNoGuaranteeCumulative(streak === 1 ? 0.55 : 0.5);
    const maxIdx = curve.length - 1;

    const trials = 10000;
    const wishesArr = new Array(trials);
    let wins = 0;
    for (let t = 0; t < trials; t++) {
        const landedIdx = simulateOneRoll(curve, maxIdx, pity);
        const wishesNeeded = landedIdx - pity;
        wishesArr[t] = wishesNeeded;
        if (wishesNeeded <= budget) wins++;
    }
    wishesArr.sort((a, b) => a - b);
    const median = wishesArr[Math.floor(trials / 2)];
    const mean = wishesArr.reduce((s, v) => s + v, 0) / trials;
    const winRate = (wins / trials) * 100;
    const best = wishesArr[0];
    const worst = wishesArr[trials - 1];

    const iconHtml = entry.icon
        ? `<img src="${dataAssetSrc(entry.icon)}" alt="" class="odds-result-icon">`
        : `<div class="ac-icon-placeholder odds-result-icon">?</div>`;

    resultEl.innerHTML = `
        <div class="odds-result-card odds-result-batch">
            ${iconHtml}
            <div class="odds-result-info">
                <div class="odds-result-name">${entry.name} — ${trials.toLocaleString()} simulated pulls${trials > 9000 ? " <span style=\"color: var(--accent-gold);\">(it's over 9000!)</span>" : ''}</div>
                <div class="odds-result-chance">Median: <strong>${median}</strong> wishes &nbsp;·&nbsp; Mean: <strong>${mean.toFixed(1)}</strong> wishes</div>
                <div class="odds-result-chance" style="margin-top: 4px;">Best: <strong style="color: var(--success);">${best}</strong> wishes &nbsp;·&nbsp; Worst: <strong style="color: var(--danger);">${worst}</strong> wishes</div>
                <div class="odds-result-roll-text" style="color: var(--text-muted);">
                    With ${budget} wishes on hand, you'd have won in <strong style="color: ${winRate >= 50 ? 'var(--success)' : 'var(--danger)'}">${winRate.toFixed(1)}%</strong> of these runs.
                </div>
            </div>
        </div>
        ${buildOddsChart(curve, pity, budget, pity + median, maxIdx)}
    `;
}

function buildOddsChart(curve, pity, budget, landedIdx, maxIdx, softPityStarts) {
    const w = 760, h = 320, padL = 50, padR = 20, padT = 20, padB = 44;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const xMax = maxIdx;
    const x = n => padL + (n / xMax) * plotW;
    const y = pct => padT + plotH - (pct / 100) * plotH;

    let path = `M ${x(0)} ${y(curve[0])}`;
    for (let i = 1; i <= xMax; i++) path += ` L ${x(i)} ${y(curve[i])}`;

    const budgetEndIdx = Math.min(xMax, pity + budget);
    const gridLines = [0, 25, 50, 75, 100].map(p => `
        <line x1="${padL}" y1="${y(p)}" x2="${w - padR}" y2="${y(p)}" stroke="var(--border-color)" stroke-width="1"/>
        <text x="${padL - 10}" y="${y(p) + 4}" text-anchor="end" font-size="12" fill="var(--text-muted)">${p}%</text>
    `).join('');

    const xStep = xMax > 90 ? 20 : 10;
    const xTicks = [];
    for (let i = 0; i <= xMax; i += xStep) xTicks.push(i);
    if (xTicks[xTicks.length - 1] !== xMax) xTicks.push(xMax);
    const xAxisLabels = xTicks.map(n => `
        <line x1="${x(n)}" y1="${padT + plotH}" x2="${x(n)}" y2="${padT + plotH + 5}" stroke="var(--text-muted)" stroke-width="1"/>
        <text x="${x(n)}" y="${padT + plotH + 20}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${n}</text>
    `).join('');

    const knownSoftStarts = (softPityStarts || [75, 152]).filter(n => n <= xMax);
    const hardCaps = [];
    for (let i = 1; i <= xMax; i++) {
        if (curve[i] >= 99.95 && curve[i - 1] < 99.95) hardCaps.push(i);
    }
    if (!hardCaps.length) hardCaps.push(xMax);

    let pityMarkers = knownSoftStarts.map(softX => `
        <line x1="${x(softX)}" y1="${padT}" x2="${x(softX)}" y2="${padT + plotH}" stroke="var(--success)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
        <text x="${x(softX)}" y="${padT - 6}" text-anchor="middle" font-size="10" fill="var(--success)">soft pity</text>
    `).join('');

    hardCaps.forEach(hardX => {
        pityMarkers += `
            <line x1="${x(hardX)}" y1="${padT}" x2="${x(hardX)}" y2="${padT + plotH}" stroke="var(--danger)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
            <text x="${x(hardX)}" y="${padT - 6}" text-anchor="middle" font-size="10" fill="var(--danger)">hard pity</text>
        `;
    });

    return `
        <div class="odds-chart-wrap">
            <div class="odds-chart-label">Cumulative chance to win by wish count</div>
            <svg viewBox="0 0 ${w} ${h}" class="odds-chart-svg">
                ${gridLines}
                ${pityMarkers}
                <rect x="${x(pity)}" y="${padT}" width="${x(budgetEndIdx) - x(pity)}" height="${plotH}" fill="var(--accent-purple)" opacity="0.12"/>
                <path d="${path}" fill="none" stroke="var(--accent-purple)" stroke-width="3"/>
                <line x1="${x(pity)}" y1="${padT}" x2="${x(pity)}" y2="${padT + plotH}" stroke="var(--text-main)" stroke-width="1" stroke-dasharray="4,4"/>
                <line x1="${x(budgetEndIdx)}" y1="${padT}" x2="${x(budgetEndIdx)}" y2="${padT + plotH}" stroke="var(--text-main)" stroke-width="1" stroke-dasharray="4,4"/>
                <circle cx="${x(landedIdx)}" cy="${y(curve[landedIdx])}" r="6" fill="${landedIdx <= budgetEndIdx ? 'var(--success)' : 'var(--danger)'}"/>
                ${xAxisLabels}
            </svg>
            <div class="odds-chart-legend">Dashed white lines mark your pity → budget window. Green/red dot shows where the simulated roll landed.</div>
        </div>
    `;
}
