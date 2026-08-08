function dataAssetSrc(path) {
  if (!path) return null;
  if (/^(https?:)?\/\//.test(path) || path.startsWith("assets/data/")) return path;
  return `assets/data/${path}`;
}
const oddsEmptyNotes = {
  character: `Average 5\u2605 win: wish <strong>76</strong>.`,
  weapon: `5\u2605 weapon pull: <strong>37.5%</strong> target, <strong>37.5%</strong> other featured, <strong>25%</strong> standard \u2014 a loss banks a Fate Point for next pull.`
};
function renderOddsEmptyState(mode) {
  const resultEl = document.getElementById("oddsResultShared");
  if (!resultEl) return;
  const note = oddsEmptyNotes[mode] || oddsEmptyNotes.character;
  resultEl.innerHTML = `
        <div class="fs4-result-panel odds-empty-panel">
            <div class="fs4-empty-state" id="oddsEmptyState">
                <img class="fs4-empty-art" src="assets/data/design_elements/5-star-background-orbit-design.webp" alt="">
                <div class="fs4-empty-title">Wish Simulation</div>
                <p class="fs4-empty-sub">Configure your banner state, then press Simulate to roll.</p>
                <div class="fs4-empty-divider"><span>&#10022;</span></div>
                <div class="odds-empty-note">${note}</div>
            </div>
        </div>
    `;
}
function activateOddsTab() {
  initOddsPanel();
  const charInput = document.getElementById("oddsCharInput");
  if (charInput) {
    selectedOddsChar = null;
    charInput.value = "";
    charInput.classList.remove("fs4-input-invalid");
  }
  const wepInput = document.getElementById("oddsWepInput");
  if (wepInput) {
    selectedOddsWeapon = null;
    wepInput.value = "";
    wepInput.classList.remove("fs4-input-invalid");
  }
  const charError = document.getElementById("oddsCharError");
  if (charError) charError.classList.add("hidden");
  const wepError = document.getElementById("oddsWepError");
  if (wepError) wepError.classList.add("hidden");
  const charClearBtn = document.getElementById("oddsCharClearBtn");
  if (charClearBtn) charClearBtn.classList.add("hidden");
  const wepClearBtn = document.getElementById("oddsWepClearBtn");
  if (wepClearBtn) wepClearBtn.classList.add("hidden");
  renderOddsEmptyState("character");
}
let guaranteedCumulative = null;
function getGuaranteedCumulative() {
  if (guaranteedCumulative) return guaranteedCumulative;
  const arr = new Array(91).fill(0);
  let survival = 1;
  for (let n = 1; n <= 90; n++) {
    let p = n < 74 ? 6e-3 : n < 90 ? 6e-3 + (n - 73) * 0.06 : 1;
    p = Math.min(p, 1);
    survival *= 1 - p;
    arr[n] = (1 - survival) * 100;
  }
  return guaranteedCumulative = arr;
}
const noGuaranteeCumulativeCache = {};
function getNoGuaranteeCumulative(winProb) {
  if (noGuaranteeCumulativeCache[winProb]) return noGuaranteeCumulativeCache[winProb];
  const pmf = new Array(91).fill(0);
  let survival = 1;
  for (let n = 1; n <= 90; n++) {
    let p = n < 74 ? 6e-3 : n < 90 ? 6e-3 + (n - 73) * 0.06 : 1;
    p = Math.min(p, 1);
    pmf[n] = survival * p;
    survival *= 1 - p;
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
  return noGuaranteeCumulativeCache[winProb] = arr;
}
let guaranteedCumulativeWeapon = null;
function getGuaranteedCumulativeWeapon() {
  if (guaranteedCumulativeWeapon) return guaranteedCumulativeWeapon;
  const arr = new Array(78).fill(0);
  let survival = 1;
  for (let n = 1; n <= 77; n++) {
    let p = n < 63 ? 7e-3 : n < 77 ? 7e-3 + (n - 62) * 0.07 : 1;
    p = Math.min(p, 1);
    survival *= 1 - p;
    arr[n] = (1 - survival) * 100;
  }
  return guaranteedCumulativeWeapon = arr;
}
const noGuaranteeCumulativeWeaponCache = {};
function getNoGuaranteeCumulativeWeapon(winProb) {
  if (noGuaranteeCumulativeWeaponCache[winProb]) return noGuaranteeCumulativeWeaponCache[winProb];
  const pmf = new Array(78).fill(0);
  let survival = 1;
  for (let n = 1; n <= 77; n++) {
    let p = n < 63 ? 7e-3 : n < 77 ? 7e-3 + (n - 62) * 0.07 : 1;
    p = Math.min(p, 1);
    pmf[n] = survival * p;
    survival *= 1 - p;
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
  return noGuaranteeCumulativeWeaponCache[winProb] = arr;
}
let oddsInitialized = false;
let selectedOddsChar = null;
let selectedOddsWeapon = null;
function initOddsPanel() {
  const container = document.getElementById("tabOddsContent");
  if (oddsInitialized) return;
  oddsInitialized = true;
  container.innerHTML = `<div class="section-card"><div id="oddsPanel"></div></div>`;
  const panel = document.getElementById("oddsPanel");
  panel.innerHTML = `
        <div class="odds-outer-layout">
            <div class="odds-outer-left">
                <div class="section-title">5 Star Odds Simulator</div>
                <p class="explanation" style="margin-top:0;">
                    Hope for the best. Simulate the worst.
                </p>
                <div class="odds-subtab-buttons">
                    <button type="button" id="oddsSubTabCharBtn" class="btn-roll">Character</button>
                    <button type="button" id="oddsSubTabWepBtn" class="btn-roll btn-roll-secondary">Weapon</button>
                </div>
                <div id="oddsCharacterPane"></div>
                <div id="oddsWeaponPane" class="hidden"></div>
            </div>
            <div class="odds-outer-right">
                <div id="oddsResultShared"></div>
            </div>
        </div>
    `;
  const charBtn = document.getElementById("oddsSubTabCharBtn");
  const wepBtn = document.getElementById("oddsSubTabWepBtn");
  const charPane = document.getElementById("oddsCharacterPane");
  const wepPane = document.getElementById("oddsWeaponPane");
  const setOddsSubTab = (tab) => {
    const isChar = tab === "character";
    charPane.classList.toggle("hidden", !isChar);
    wepPane.classList.toggle("hidden", isChar);
    charBtn.classList.toggle("btn-roll-secondary", !isChar);
    wepBtn.classList.toggle("btn-roll-secondary", isChar);
    if (isChar) {
      if (selectedOddsChar) rollOdds();
      else renderOddsEmptyState("character");
    } else {
      if (selectedOddsWeapon) rollOddsWeapon();
      else renderOddsEmptyState("weapon");
    }
  };
  charBtn.addEventListener("click", () => setOddsSubTab("character"));
  wepBtn.addEventListener("click", () => setOddsSubTab("weapon"));
  initOddsCharacterPane(charPane);
  initOddsWeaponPane(wepPane);
}
function initOddsCharacterPane(panel) {
  const fiveStars = GENSHIN_CHARACTER_DB.filter((c) => c.rarity === 5).slice().sort((a, b) => a.name.localeCompare(b.name));
  const defaultBudget = 0;
  const defaultPity = 0;
  panel.innerHTML = `
        <div class="form-group autocomplete-wrap">
            <label>Character</label>
            <div class="ac-input-inner">
                <input type="text" id="oddsCharInput" placeholder="e.g. Sandrone" autocomplete="off">
                <button type="button" class="ac-clear-btn hidden" id="oddsCharClearBtn" title="Clear selection">&times;</button>
            </div>
            <div id="oddsCharList" class="autocomplete-list hidden"></div>
            <div class="fs4-field-error hidden" id="oddsCharError">Please pick a character first.</div>
        </div>

        <div class="odds-input-row">
            <div class="form-group">
                <label>Wishes</label>
                <input type="number" id="oddsBudget" min="0" max="9999" placeholder="0" value="${Math.min(defaultBudget, 9999) || ""}">
            </div>
            <div class="form-group">
                <label>Pity</label>
                <input type="number" id="oddsPity" min="0" max="89" placeholder="0" value="${defaultPity || ""}">
            </div>
        </div>

        <div class="form-group">
            <div class="wid-eyebrow muted">Current Guarantee? <span class="wid-label-hint">character banner only</span></div>
            <div class="wid-toggle-rows">
                <label class="wid-toggle-row">
                    <input type="checkbox" id="oddsGuarantee">
                    <span class="wid-toggle-text">
                        <span class="wid-toggle-name">Guaranteed next</span>
                        <span class="wid-toggle-sub">Your next featured 5\u2605 is guaranteed</span>
                    </span>
                </label>
            </div>
        </div>

        <div class="odds-sim-buttons">
            <button type="button" id="oddsRollBtn" class="btn-roll">Simulate</button>
            <button type="button" id="oddsBatchBtn" class="btn-roll btn-roll-secondary">Simulate 10k</button>
        </div>
    `;
  document.getElementById("oddsRollBtn").addEventListener("click", rollOdds);
  document.getElementById("oddsBatchBtn").addEventListener("click", runBatchSim);
  document.getElementById("oddsBudget").addEventListener("input", (e) => {
    if (e.target.value.length > 4) e.target.value = e.target.value.slice(0, 4);
  });
  document.getElementById("oddsBudget").addEventListener("focus", (e) => {
    e.target.select();
  });
  const input = document.getElementById("oddsCharInput");
  const list = document.getElementById("oddsCharList");
  function renderOddsCharList(query) {
    const q = (query || "").trim().toLowerCase();
    const results = q ? fiveStars.filter((c) => c.name.toLowerCase().includes(q)) : fiveStars;
    if (!results.length) {
      list.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    list.innerHTML = results.slice(0, 8).map((c) => `
            <div class="autocomplete-item" data-name="${c.name.replace(/"/g, "&quot;")}">
                ${assetIconHtml(c)}
                <span class="ac-name">${c.name}</span>
                <span class="ac-sub">${assetSubLabel(c)}</span>
            </div>
        `).join("");
    list.classList.remove("hidden");
  }
  function pickOddsChar(entry) {
    selectedOddsChar = entry;
    input.value = entry.name;
    list.classList.add("hidden");
    list.innerHTML = "";
    document.getElementById("oddsCharError").classList.add("hidden");
    input.classList.remove("fs4-input-invalid");
    clearBtn.classList.remove("hidden");
  }
  const clearBtn = document.getElementById("oddsCharClearBtn");
  clearBtn.addEventListener("click", () => {
    selectedOddsChar = null;
    input.value = "";
    clearBtn.classList.add("hidden");
    input.focus();
    renderOddsEmptyState("character");
  });
  input.addEventListener("focus", () => renderOddsCharList(input.value));
  input.addEventListener("click", () => renderOddsCharList(input.value));
  input.addEventListener("input", () => {
    selectedOddsChar = null;
    clearBtn.classList.add("hidden");
    renderOddsCharList(input.value);
  });
  list.addEventListener("click", (e) => {
    const item = e.target.closest(".autocomplete-item");
    if (!item) return;
    const entry = fiveStars.find((c) => c.name === item.dataset.name);
    if (entry) pickOddsChar(entry);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#oddsCharInput") && !e.target.closest("#oddsCharList")) {
      list.classList.add("hidden");
    }
  });
  if (fiveStars.length) pickOddsChar(fiveStars[0]);
  rollOdds();
}
function initOddsWeaponPane(panel) {
  const fiveStars = GENSHIN_WEAPON_DB.filter((w) => w.rarity === 5).slice().sort((a, b) => a.name.localeCompare(b.name));
  const defaultBudget = 0;
  const defaultPity = 0;
  panel.innerHTML = `
        <div class="form-group autocomplete-wrap">
            <label>Weapon</label>
            <div class="ac-input-inner">
                <input type="text" id="oddsWepInput" placeholder="e.g. Verdict" autocomplete="off">
                <button type="button" class="ac-clear-btn hidden" id="oddsWepClearBtn" title="Clear selection">&times;</button>
            </div>
            <div id="oddsWepList" class="autocomplete-list hidden"></div>
            <div class="fs4-field-error hidden" id="oddsWepError">Please pick a weapon first.</div>
        </div>

        <div class="odds-input-row">
            <div class="form-group">
                <label>Wishes</label>
                <input type="number" id="oddsBudgetWep" min="0" max="9999" placeholder="0" value="${Math.min(defaultBudget, 9999) || ""}">
            </div>
            <div class="form-group">
                <label>Pity</label>
                <input type="number" id="oddsPityWep" min="0" max="76" placeholder="0" value="${defaultPity || ""}">
            </div>
        </div>

        <div class="form-group">
            <div class="wid-eyebrow muted">Current Guarantee? <span class="wid-label-hint">weapon banner only</span></div>
            <div class="wid-toggle-rows">
                <label class="wid-toggle-row">
                    <input type="checkbox" id="oddsGuaranteeWep">
                    <span class="wid-toggle-text">
                        <span class="wid-toggle-name">Fate Point banked</span>
                        <span class="wid-toggle-sub">Your next 5\u2605 is guaranteed to be the featured weapon</span>
                    </span>
                </label>
            </div>
        </div>

        <div class="odds-sim-buttons">
            <button type="button" id="oddsRollBtnWep" class="btn-roll">Simulate</button>
            <button type="button" id="oddsBatchBtnWep" class="btn-roll btn-roll-secondary">Simulate 10k</button>
        </div>
    `;
  document.getElementById("oddsRollBtnWep").addEventListener("click", rollOddsWeapon);
  document.getElementById("oddsBatchBtnWep").addEventListener("click", runBatchSimWeapon);
  document.getElementById("oddsBudgetWep").addEventListener("input", (e) => {
    if (e.target.value.length > 4) e.target.value = e.target.value.slice(0, 4);
  });
  document.getElementById("oddsBudgetWep").addEventListener("focus", (e) => {
    e.target.select();
  });
  const input = document.getElementById("oddsWepInput");
  const list = document.getElementById("oddsWepList");
  function renderOddsWepList(query) {
    const q = (query || "").trim().toLowerCase();
    const results = q ? fiveStars.filter((w) => w.name.toLowerCase().includes(q)) : fiveStars;
    if (!results.length) {
      list.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    list.innerHTML = results.slice(0, 8).map((w) => `
            <div class="autocomplete-item" data-name="${w.name.replace(/"/g, "&quot;")}">
                ${assetIconHtml(w)}
                <span class="ac-name">${w.name}</span>
                <span class="ac-sub">${assetSubLabel(w)}</span>
            </div>
        `).join("");
    list.classList.remove("hidden");
  }
  function pickOddsWep(entry) {
    selectedOddsWeapon = entry;
    input.value = entry.name;
    list.classList.add("hidden");
    list.innerHTML = "";
    document.getElementById("oddsWepError").classList.add("hidden");
    input.classList.remove("fs4-input-invalid");
    clearBtn.classList.remove("hidden");
  }
  const clearBtn = document.getElementById("oddsWepClearBtn");
  clearBtn.addEventListener("click", () => {
    selectedOddsWeapon = null;
    input.value = "";
    clearBtn.classList.add("hidden");
    input.focus();
    renderOddsEmptyState("weapon");
  });
  input.addEventListener("focus", () => renderOddsWepList(input.value));
  input.addEventListener("click", () => renderOddsWepList(input.value));
  input.addEventListener("input", () => {
    selectedOddsWeapon = null;
    clearBtn.classList.add("hidden");
    renderOddsWepList(input.value);
  });
  list.addEventListener("click", (e) => {
    const item = e.target.closest(".autocomplete-item");
    if (!item) return;
    const entry = fiveStars.find((w) => w.name === item.dataset.name);
    if (entry) pickOddsWep(entry);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#oddsWepInput") && !e.target.closest("#oddsWepList")) {
      list.classList.add("hidden");
    }
  });
  if (fiveStars.length) pickOddsWep(fiveStars[0]);
}
function rollOddsWeapon() {
  const resultEl = document.getElementById("oddsResultShared");
  const wepError = document.getElementById("oddsWepError");
  const wepInput = document.getElementById("oddsWepInput");
  if (!selectedOddsWeapon) {
    renderOddsEmptyState("weapon");
    wepError.classList.remove("hidden");
    wepInput.classList.add("fs4-input-invalid");
    wepInput.focus();
    return;
  }
  wepError.classList.add("hidden");
  wepInput.classList.remove("fs4-input-invalid");
  const entry = selectedOddsWeapon;
  const budget = Math.max(0, parseInt(document.getElementById("oddsBudgetWep").value) || 0);
  const pity = Math.max(0, Math.min(76, parseInt(document.getElementById("oddsPityWep").value) || 0));
  const guaranteed = document.getElementById("oddsGuaranteeWep").checked;
  const curve = guaranteed ? getGuaranteedCumulativeWeapon() : getNoGuaranteeCumulativeWeapon(0.375);
  const maxIdx = curve.length - 1;
  const clamp = (n) => Math.max(0, Math.min(maxIdx, Math.round(n)));
  const floor = curve[clamp(pity)];
  const ceiling = curve[clamp(pity + budget)];
  const winChance = floor >= 100 ? 100 : (ceiling - floor) / (100 - floor) * 100;
  const landedIdx = simulateOneRoll(curve, maxIdx, pity);
  const wishesNeeded = landedIdx - pity;
  const won = wishesNeeded <= budget;
  const iconHtml = entry.icon ? `<img src="${dataAssetSrc(entry.icon)}" alt="" class="odds-result-icon">` : `<div class="ac-icon-placeholder odds-result-icon">?</div>`;
  const rollIconSrc = won ? "assets/data/custom_icons/icon_pull_tab_win.webp" : "assets/data/custom_icons/icon_pull_tab_loss.webp";
  resultEl.innerHTML = `
        <div class="odds-result-card ${won ? "odds-result-win" : "odds-result-lose"}">
            <div class="odds-result-top">
                ${iconHtml}
                <div class="odds-result-info">
                    <div class="odds-result-name">${entry.name}</div>
                    <div class="odds-result-chance">Chance to win: <strong>${winChance.toFixed(1)}%</strong></div>
                </div>
                <img src="${rollIconSrc}" alt="" class="odds-result-roll-icon">
            </div>
            <div class="odds-result-roll-text">
                ${won ? `Rolled: won it on wish ${wishesNeeded === 0 ? pity : pity + wishesNeeded}` : `Rolled: would've needed ${pity + wishesNeeded} wishes \u2014 you only had ${budget}`}
            </div>
        </div>
        ${buildOddsChart(curve, pity, budget, landedIdx, maxIdx, [63, 140])}
    `;
}
function runBatchSimWeapon() {
  const resultEl = document.getElementById("oddsResultShared");
  const wepError = document.getElementById("oddsWepError");
  const wepInput = document.getElementById("oddsWepInput");
  if (!selectedOddsWeapon) {
    renderOddsEmptyState("weapon");
    wepError.classList.remove("hidden");
    wepInput.classList.add("fs4-input-invalid");
    wepInput.focus();
    return;
  }
  wepError.classList.add("hidden");
  wepInput.classList.remove("fs4-input-invalid");
  const entry = selectedOddsWeapon;
  const budget = Math.max(0, parseInt(document.getElementById("oddsBudgetWep").value) || 0);
  const pity = Math.max(0, Math.min(76, parseInt(document.getElementById("oddsPityWep").value) || 0));
  const guaranteed = document.getElementById("oddsGuaranteeWep").checked;
  const curve = guaranteed ? getGuaranteedCumulativeWeapon() : getNoGuaranteeCumulativeWeapon(0.375);
  const maxIdx = curve.length - 1;
  const trials = 1e4;
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
  const winRate = wins / trials * 100;
  const best = wishesArr[0];
  const worst = wishesArr[trials - 1];
  const iconHtml = entry.icon ? `<img src="${dataAssetSrc(entry.icon)}" alt="" class="odds-result-icon">` : `<div class="ac-icon-placeholder odds-result-icon">?</div>`;
  resultEl.innerHTML = `
        <div class="odds-result-card odds-result-batch">
            <div class="odds-result-top">
                ${iconHtml}
                <div class="odds-result-info">
                    <div class="odds-result-name">${entry.name} \u2014 ${trials.toLocaleString()} simulated pulls</div>
                </div>
            </div>
            <div class="odds-result-stats">
                <div class="odds-result-chance">Median: <strong>${median}</strong> wishes &nbsp;\xB7&nbsp; Mean: <strong>${mean.toFixed(1)}</strong> wishes</div>
                <div class="odds-result-chance" style="margin-top: 4px;">Best: <strong style="color: var(--success);">${best}</strong> wishes &nbsp;\xB7&nbsp; Worst: <strong style="color: var(--danger);">${worst}</strong> wishes</div>
            </div>
            <div class="odds-result-roll-text" style="color: var(--text-muted);">
                With ${budget} wishes on hand, you'd have won in <strong style="color: ${winRate >= 50 ? "var(--success)" : "var(--danger)"}">${winRate.toFixed(1)}%</strong> of these runs.
            </div>
        </div>
        ${buildOddsChart(curve, pity, budget, pity + median, maxIdx, [63, 140])}
    `;
}
function simulateOneRoll(curve, maxIdx, pity) {
  const clamp = (n) => Math.max(0, Math.min(maxIdx, Math.round(n)));
  const floor = curve[clamp(pity)];
  const roll = floor + Math.random() * (100 - floor);
  let landedIdx = maxIdx;
  for (let i = pity; i <= maxIdx; i++) {
    if (curve[i] >= roll) {
      landedIdx = i;
      break;
    }
  }
  return landedIdx;
}
function rollOdds() {
  const resultEl = document.getElementById("oddsResultShared");
  const charError = document.getElementById("oddsCharError");
  const charInput = document.getElementById("oddsCharInput");
  if (!selectedOddsChar) {
    renderOddsEmptyState("character");
    charError.classList.remove("hidden");
    charInput.classList.add("fs4-input-invalid");
    charInput.focus();
    return;
  }
  charError.classList.add("hidden");
  charInput.classList.remove("fs4-input-invalid");
  const entry = selectedOddsChar;
  const budget = Math.max(0, parseInt(document.getElementById("oddsBudget").value) || 0);
  const pity = Math.max(0, Math.min(89, parseInt(document.getElementById("oddsPity").value) || 0));
  const guaranteed = document.getElementById("oddsGuarantee").checked;
  const curve = guaranteed ? getGuaranteedCumulative() : getNoGuaranteeCumulative(0.5);
  const maxIdx = curve.length - 1;
  const clamp = (n) => Math.max(0, Math.min(maxIdx, Math.round(n)));
  const floor = curve[clamp(pity)];
  const ceiling = curve[clamp(pity + budget)];
  const winChance = floor >= 100 ? 100 : (ceiling - floor) / (100 - floor) * 100;
  const landedIdx = simulateOneRoll(curve, maxIdx, pity);
  const wishesNeeded = landedIdx - pity;
  const won = wishesNeeded <= budget;
  const iconHtml = entry.icon ? `<img src="${dataAssetSrc(entry.icon)}" alt="" class="odds-result-icon">` : `<div class="ac-icon-placeholder odds-result-icon">?</div>`;
  const rollIconSrc = won ? "assets/data/custom_icons/icon_pull_tab_win.webp" : "assets/data/custom_icons/icon_pull_tab_loss.webp";
  resultEl.innerHTML = `
        <div class="odds-result-card ${won ? "odds-result-win" : "odds-result-lose"}">
            <div class="odds-result-top">
                ${iconHtml}
                <div class="odds-result-info">
                    <div class="odds-result-name">${entry.name}</div>
                    <div class="odds-result-chance">Chance to win: <strong>${winChance.toFixed(1)}%</strong></div>
                </div>
                <img src="${rollIconSrc}" alt="" class="odds-result-roll-icon">
            </div>
            <div class="odds-result-roll-text">
                ${won ? `Rolled: won it on wish ${wishesNeeded === 0 ? pity : pity + wishesNeeded}` : `Rolled: would've needed ${pity + wishesNeeded} wishes \u2014 you only had ${budget}`}
            </div>
        </div>
        ${buildOddsChart(curve, pity, budget, landedIdx, maxIdx)}
    `;
}
function runBatchSim() {
  const resultEl = document.getElementById("oddsResultShared");
  const charError = document.getElementById("oddsCharError");
  const charInput = document.getElementById("oddsCharInput");
  if (!selectedOddsChar) {
    renderOddsEmptyState("character");
    charError.classList.remove("hidden");
    charInput.classList.add("fs4-input-invalid");
    charInput.focus();
    return;
  }
  charError.classList.add("hidden");
  charInput.classList.remove("fs4-input-invalid");
  const entry = selectedOddsChar;
  const budget = Math.max(0, parseInt(document.getElementById("oddsBudget").value) || 0);
  const pity = Math.max(0, Math.min(89, parseInt(document.getElementById("oddsPity").value) || 0));
  const guaranteed = document.getElementById("oddsGuarantee").checked;
  const curve = guaranteed ? getGuaranteedCumulative() : getNoGuaranteeCumulative(0.5);
  const maxIdx = curve.length - 1;
  const trials = 1e4;
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
  const winRate = wins / trials * 100;
  const best = wishesArr[0];
  const worst = wishesArr[trials - 1];
  const iconHtml = entry.icon ? `<img src="${dataAssetSrc(entry.icon)}" alt="" class="odds-result-icon">` : `<div class="ac-icon-placeholder odds-result-icon">?</div>`;
  resultEl.innerHTML = `
        <div class="odds-result-card odds-result-batch">
            <div class="odds-result-top">
                ${iconHtml}
                <div class="odds-result-info">
                    <div class="odds-result-name">${entry.name} \u2014 ${trials.toLocaleString()} simulated pulls</div>
                </div>
            </div>
            <div class="odds-result-stats">
                <div class="odds-result-chance">Median: <strong>${median}</strong> wishes &nbsp;\xB7&nbsp; Mean: <strong>${mean.toFixed(1)}</strong> wishes</div>
                <div class="odds-result-chance" style="margin-top: 4px;">Best: <strong style="color: var(--success);">${best}</strong> wishes &nbsp;\xB7&nbsp; Worst: <strong style="color: var(--danger);">${worst}</strong> wishes</div>
            </div>
            <div class="odds-result-roll-text" style="color: var(--text-muted);">
                With ${budget} wishes on hand, you'd have won in <strong style="color: ${winRate >= 50 ? "var(--success)" : "var(--danger)"}">${winRate.toFixed(1)}%</strong> of these runs.
            </div>
        </div>
        ${buildOddsChart(curve, pity, budget, pity + median, maxIdx)}
    `;
}
function buildOddsChart(curve, pity, budget, landedIdx, maxIdx, softPityStarts) {
  const w = 760, h = 320, padL = 50, padR = 20, padT = 20, padB = 44;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const xMax = maxIdx;
  const x = (n) => padL + n / xMax * plotW;
  const y = (pct) => padT + plotH - pct / 100 * plotH;
  let path = `M ${x(0)} ${y(curve[0])}`;
  for (let i = 1; i <= xMax; i++) path += ` L ${x(i)} ${y(curve[i])}`;
  const budgetEndIdx = Math.min(xMax, pity + budget);
  const gridLines = [0, 25, 50, 75, 100].map((p) => `
        <line x1="${padL}" y1="${y(p)}" x2="${w - padR}" y2="${y(p)}" stroke="var(--border-color)" stroke-width="1"/>
        <text x="${padL - 10}" y="${y(p) + 4}" text-anchor="end" font-size="12" fill="var(--text-muted)">${p}%</text>
    `).join("");
  const xStep = xMax > 90 ? 20 : 10;
  const xTicks = [];
  for (let i = 0; i <= xMax; i += xStep) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== xMax) xTicks.push(xMax);
  const xAxisLabels = xTicks.map((n) => `
        <line x1="${x(n)}" y1="${padT + plotH}" x2="${x(n)}" y2="${padT + plotH + 5}" stroke="var(--text-muted)" stroke-width="1"/>
        <text x="${x(n)}" y="${padT + plotH + 20}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${n}</text>
    `).join("");
  const knownSoftStarts = (softPityStarts || [75, 152]).filter((n) => n <= xMax);
  const hardCaps = [];
  for (let i = 1; i <= xMax; i++) {
    if (curve[i] >= 99.95 && curve[i - 1] < 99.95) hardCaps.push(i);
  }
  if (!hardCaps.length) hardCaps.push(xMax);
  let pityMarkers = knownSoftStarts.map((softX) => `
        <line x1="${x(softX)}" y1="${padT}" x2="${x(softX)}" y2="${padT + plotH}" stroke="var(--success)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
        <text x="${x(softX)}" y="${padT - 6}" text-anchor="middle" font-size="10" fill="var(--success)">soft pity</text>
    `).join("");
  hardCaps.forEach((hardX) => {
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
                <circle cx="${x(landedIdx)}" cy="${y(curve[landedIdx])}" r="6" fill="${landedIdx <= budgetEndIdx ? "var(--success)" : "var(--danger)"}"/>
                ${xAxisLabels}
            </svg>
            <div class="odds-chart-legend">Dashed white lines mark your pity \u2192 budget window. Green/red dot shows where the simulated roll landed.</div>
        </div>
    `;
}
