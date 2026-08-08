renderTab5starMarkup();
const FORECAST_WORKER_URL = "https://wish-math.spektrem.workers.dev";
const FORECAST_ENGINE_VERSION = "7";
let forecastRequestToken = 0;
let lastForecastSignature = null;
let pendingForecastCtx = null;
const FORECAST_TIMEOUT_MS = 12000;
const FORECAST_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// A single fetch attempt, with a timeout. Throws a ForecastFetchError so the
// caller can decide (based on .kind) whether it's worth retrying.
class ForecastFetchError extends Error {
  constructor(message, kind, retryAfterSec) {
    super(message);
    this.kind = kind; // "timeout" | "network" | "rate_limited" | "server" | "client"
    this.retryAfterSec = retryAfterSec || null;
  }
}

async function fetchWorkerJsonOnce(url, ctx) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORECAST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ctx),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ForecastFetchError("Timed out waiting for the server.", "timeout");
    }
    throw new ForecastFetchError("Network error reaching the server.", "network");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) {
      const retryAfterSec = parseInt(res.headers.get("Retry-After"), 10) || null;
      throw new ForecastFetchError(body.error || "Too many requests.", "rate_limited", retryAfterSec);
    }
    const kind = FORECAST_RETRYABLE_STATUSES.has(res.status) ? "server" : "client";
    throw new ForecastFetchError(body.error || `Worker returned ${res.status}`, kind);
  }
  return res.json();
}

// One retry for transient failures (timeout/network/5xx). Not for
// rate_limited (respect Retry-After, don't hammer it) or client (a 400 will
// fail the same way again -- retrying just wastes a request).
async function fetchWorkerJson(url, ctx) {
  try {
    return await fetchWorkerJsonOnce(url, ctx);
  } catch (err) {
    if (err instanceof ForecastFetchError && (err.kind === "timeout" || err.kind === "network" || err.kind === "server")) {
      return await fetchWorkerJsonOnce(url, ctx);
    }
    throw err;
  }
}

async function fetchForecastFromWorker(ctx) {
  return fetchWorkerJson(FORECAST_WORKER_URL, ctx);
}

function forecastErrorMessage(err) {
  if (!(err instanceof ForecastFetchError)) return "Couldn\u2019t reach the forecast engine. Check your connection and try again.";
  switch (err.kind) {
    case "rate_limited":
      return err.retryAfterSec ? `Whoa, slow down \u2014 try again in ${err.retryAfterSec}s.` : "Whoa, slow down \u2014 try again in a moment.";
    case "timeout":
      return "The forecast engine took too long to respond. Try again?";
    case "client":
      return "Something about this plan couldn\u2019t be calculated. Try adjusting your inputs.";
    default:
      return "Couldn\u2019t reach the forecast engine. Check your connection and try again.";
  }
}
let priorityPipeline = [];
let activeScenarioTab = "baseline";
let scenarioDetailsExpanded = false;
let lastForecastData = null;
const TAB_DEFS = [
  { key: "baseline", label: "Baseline", tint: "var(--accent-blue)" },
  { key: "percentile", label: "Percentile", tint: "var(--accent-gray)" },
  { key: "narrative", label: "What If", tint: "var(--accent-purple)" }
];
const currentWishesEl = document.getElementById("currentWishes");
const currentStarglitterEl = document.getElementById("currentStarglitter");
const currentPrimogemsEl = document.getElementById("currentPrimogems");
const wishesPerPatchEl = document.getElementById("wishesPerPatch");
const totalPatchesEl = document.getElementById("totalPatchesPlan");
const starglitterEl = document.getElementById("starglitterRate");
const charSoftPityEl = document.getElementById("charSoftPity");
const wepSoftPityEl = document.getElementById("wepSoftPity");
const charPityEl = document.getElementById("charPity");
const wepPityEl = document.getElementById("wepPity");
const charRadianceRadios = document.querySelectorAll('input[name="charRadiance"]');
const charGuaranteeEl = document.getElementById("charGuarantee");
function getCharGuaranteeGlobal() {
  return charGuaranteeEl && charGuaranteeEl.checked ? "yes" : "no";
}
function getCharRadiancePoints() {
  const checked = document.querySelector('input[name="charRadiance"]:checked');
  return checked ? parseInt(checked.value) : 0;
}
function setCharRadiancePoints(points) {
  const target = document.querySelector(`input[name="charRadiance"][value="${points}"]`);
  if (target) target.checked = true;
}
function syncGuaranteeRadianceExclusivity() {
  const guaranteeSubEl = document.getElementById("charGuaranteeSub");
  if (guaranteeSubEl) {
    guaranteeSubEl.textContent = "Your next featured 5\u2605 is guaranteed";
  }
}
charGuaranteeEl.addEventListener("change", syncGuaranteeRadianceExclusivity);
charRadianceRadios.forEach((el) => el.addEventListener("change", syncGuaranteeRadianceExclusivity));
syncGuaranteeRadianceExclusivity();
const hasWelkinEl = document.getElementById("hasWelkin");
const hasBPEl = document.getElementById("hasBP");
const startPatchMajorEl = document.getElementById("startPatchMajor");
const startPatchMinorEl = document.getElementById("startPatchMinor");
const planSpendToggleEl = document.getElementById("planSpendToggle");
if (currentWishesEl) {
  let getStartPatch2 = function() {
    const major = parseInt(startPatchMajorEl?.value) || 1;
    let minor = parseInt(startPatchMinorEl?.value);
    if (isNaN(minor) || minor < 0) minor = 0;
    if (minor > 7) minor = 7;
    return {
      major,
      minor
    };
  }, patchVersionAt2 = function(offset) {
    const { major, minor } = getStartPatch2();
    const total = minor + Math.max(0, offset);
    const bumpedMajor = major + Math.floor(total / 8);
    const bumpedMinor = total % 8;
    return `${bumpedMajor}.${bumpedMinor}`;
  }, updateStarglitterHint2 = function() {
    const sg = parseInt(currentStarglitterEl.value) || 0;
    const wishes = Math.floor(sg / 5);
    const hint = document.getElementById("starglitterWishCount");
    hint.textContent = wishes > 0 ? `${wishes} wish${wishes !== 1 ? "es" : ""} (+${sg % 5} left)` : "";
  }, updatePrimogemsHint2 = function() {
    const pg = parseInt(currentPrimogemsEl.value) || 0;
    const wishes = Math.floor(pg / 160);
    const hint = document.getElementById("primogemsWishCount");
    hint.textContent = wishes > 0 ? `${wishes} wish${wishes !== 1 ? "es" : ""} (+${pg % 160} left)` : "";
  }, updateTargetPatchOptions2 = function(extendTo) {
    const patchSelect = document.getElementById("targetPatch");
    const totalPatches = parseInt(totalPatchesEl.value) || 0;
    const rangeMax = typeof extendTo === "number" ? Math.max(totalPatches, extendTo) : totalPatches;
    const currentValue = patchSelect.value;
    patchSelect.innerHTML = "";
    for (let i = 0; i <= rangeMax; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      if (i === 0) opt.innerText = `Current Patch (${patchVersionAt2(0)})`;
      else if (i === 1) opt.innerText = `Next Patch (${patchVersionAt2(1)})`;
      else if (i === 2) opt.innerText = `2 Patches Later (${patchVersionAt2(2)})`;
      else opt.innerText = `${i} Patches Later (${patchVersionAt2(i)})`;
      patchSelect.appendChild(opt);
    }
    if (currentValue && parseInt(currentValue) <= rangeMax) {
      patchSelect.value = currentValue;
    } else {
      patchSelect.value = "0";
    }
    updateTimelineExplanation2();
    if (typeof syncTargetPatchUIFromValue2 === "function") syncTargetPatchUIFromValue2();
  }, applyTargetPatchValue2 = function(value) {
    const v = Math.min(8, Math.max(0, value));
    updateTargetPatchOptions2(v);
    targetPatchSelect.value = String(v);
    syncTargetPatchUIFromValue2();
    targetPatchSelect.dispatchEvent(new Event("change"));
    calculateForecast2();
    saveState2();
  }, syncTargetPatchUIFromValue2 = function() {
    const v = parseInt(targetPatchSelect.value) || 0;
    if (v === 0) {
      targetPatchCurrentEl.checked = true;
      targetPatchLaterGroup.classList.add("hidden");
      targetPatchLaterInput.value = "";
    } else {
      targetPatchLaterEl.checked = true;
      targetPatchLaterGroup.classList.remove("hidden");
      targetPatchLaterInput.value = v;
    }
  }, renderCustomIncomeRows2 = function() {
    const total = parseInt(totalPatchesEl.value) || 0;
    const container = document.getElementById("customIncomeGroup");
    const existingValues = {};
    document.querySelectorAll(".custom-val-input").forEach((inp) => {
      existingValues[inp.dataset.index] = inp.value;
    });
    let rows = "";
    for (let i = 0; i <= total; i++) {
      const version = patchVersionAt2(i);
      let labelStr, fullLabel;
      if (i === 0) {
        labelStr = `${version} (Current)`;
        fullLabel = `Current Patch (${version})`;
      } else if (i === 1) {
        labelStr = `${version} (Next)`;
        fullLabel = `Next Patch (${version})`;
      } else {
        labelStr = `${version} (In ${i} Patches)`;
        fullLabel = `${i} Patches Later (${version})`;
      }
      const val = existingValues[i] !== void 0 ? existingValues[i] : 80;
      rows += `
                <div class="wid-timeline-row">
                    <div class="wid-timeline-track"><span class="wid-timeline-dot"></span></div>
                    <div class="wid-timeline-label" title="${fullLabel}">${labelStr}</div>
                    <input type="number" class="custom-val-input wid-timeline-input" data-index="${i}" value="${val}" min="0">
                </div>
            `;
    }
    container.innerHTML = `<div class="wid-eyebrow muted">Custom Income Timeline</div><div class="wid-custom-list">${rows}</div>`;
    document.querySelectorAll(".custom-val-input").forEach((inp) => {
      inp.addEventListener("input", () => {
        if (inp.value.length > 5) inp.value = inp.value.slice(0, 5);
      });
      inp.addEventListener("input", _debounce(() => {
        calculateForecast2();
        saveState2();
      }, 150));
    });
  }, renderPlannedSpendRows2 = function() {
    const container = document.getElementById("plannedSpendGroup");
    if (!container) return;
    if (!planSpendToggleEl || !planSpendToggleEl.checked) {
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");
    const total = parseInt(totalPatchesEl.value) || 0;
    const existingValues = {};
    document.querySelectorAll(".planned-val-input").forEach((inp) => {
      existingValues[inp.dataset.index] = inp.value;
    });
    const stockpileWasChecked = planSpendStockpileChecked2();
    const baseWishesNow = getBaseWishes2();
    let rows = "";
    for (let i = 0; i <= total; i++) {
      const version = patchVersionAt2(i);
      let labelStr, fullLabel;
      if (i === 0) {
        labelStr = `${version} (Current)`;
        fullLabel = `Current Patch (${version})`;
      } else if (i === 1) {
        labelStr = `${version} (Next)`;
        fullLabel = `Next Patch (${version})`;
      } else {
        labelStr = `${version} (In ${i} Patches)`;
        fullLabel = `${i} Patches Later (${version})`;
      }
      const val = existingValues[i] !== void 0 ? existingValues[i] : "";
      let cap = getPatchIncome2(i);
      if (i === 0 && stockpileWasChecked) cap += baseWishesNow;
      rows += `
                <div class="wid-timeline-row">
                    <div class="wid-timeline-track"><span class="wid-timeline-dot"></span></div>
                    <div class="wid-timeline-label" title="${fullLabel}">${labelStr}</div>
                    <input type="number" class="planned-val-input wid-timeline-input" data-index="${i}" data-cap="${cap}" value="${val}" placeholder="0" min="0" max="${cap}">
                </div>
            `;
    }
    container.innerHTML = `<div class="wid-eyebrow muted">Planned Spend by Patch</div><div class="wid-custom-list">${rows}</div><label class="wid-toggle-row wid-planspend-stockpile"><input type="checkbox" id="planSpendStockpileToggle"${stockpileWasChecked ? " checked" : ""}><span class="wid-toggle-text"><span class="wid-toggle-name">Also deduct from Wishes on Hand &amp; Primogems</span><span class="wid-toggle-sub">Only applies to the current patch (${patchVersionAt2(0)})</span></span></label>`;
    document.querySelectorAll(".planned-val-input").forEach((inp) => {
      inp.addEventListener("input", () => {
        if (inp.value.length > 5) inp.value = inp.value.slice(0, 5);
        const cap = parseInt(inp.dataset.cap) || 0;
        if (parseInt(inp.value) > cap) inp.value = String(cap);
      });
      inp.addEventListener("input", _debounce(() => {
        calculateForecast2();
        saveState2();
      }, 150));
    });
    const stockpileToggleEl = document.getElementById("planSpendStockpileToggle");
    if (stockpileToggleEl) {
      stockpileToggleEl.addEventListener("change", () => {
        refreshPlannedSpendCaps2();
        calculateForecast2();
        saveState2();
      });
    }
  }, getPlannedSpend2 = function(index) {
    if (!planSpendToggleEl || !planSpendToggleEl.checked) return 0;
    const el = document.querySelector(`.planned-val-input[data-index="${index}"]`);
    return el ? parseInt(el.value) || 0 : 0;
  }, getBaseWishes2 = function() {
    return (parseInt(currentWishesEl.value) || 0) + Math.floor((parseInt(currentStarglitterEl.value) || 0) / 5) + Math.floor((parseInt(currentPrimogemsEl.value) || 0) / 160);
  }, planSpendStockpileChecked2 = function() {
    const el = document.getElementById("planSpendStockpileToggle");
    return !!(el && el.checked);
  }, refreshPlannedSpendCaps2 = function() {
    if (!planSpendToggleEl || !planSpendToggleEl.checked) return;
    document.querySelectorAll(".planned-val-input").forEach((inp) => {
      const idx = parseInt(inp.dataset.index);
      let cap = getPatchIncome2(idx);
      if (idx === 0 && planSpendStockpileChecked2()) cap += getBaseWishes2();
      inp.dataset.cap = cap;
      inp.max = cap;
      if (parseInt(inp.value) > cap) inp.value = String(cap);
    });
  }, getPatchIncome2 = function(index) {
    let baseIncome = 0;
    const mode = document.querySelector('input[name="incomeMode"]:checked').value;
    if (mode === "average") {
      baseIncome = parseInt(wishesPerPatchEl.value) || 0;
    } else {
      const el = document.querySelector(`.custom-val-input[data-index="${index}"]`);
      baseIncome = el ? parseInt(el.value) || 0 : 0;
    }
    const welkinBonus = hasWelkinEl.checked ? 23 : 0;
    const bpBonus = hasBPEl.checked ? 9 : 0;
    return baseIncome + welkinBonus + bpBonus;
  }, currentAssetType2 = function() {
    return document.querySelector('input[name="assetType"]:checked').value;
  }, dataAssetSrc2 = function(path) {
    if (!path) return null;
    if (/^(https?:)?\/\//.test(path) || path.startsWith("assets/data/")) return path;
    return `assets/data/${path}`;
  }, assetIconHtml2 = function(entry, sizeClass) {
    if (entry && entry.icon) {
      return `<img src="${dataAssetSrc2(entry.icon)}" alt="">`;
    }
    return `<div class="ac-icon-placeholder">?</div>`;
  }, elementIconPath2 = function(element) {
    if (!element || element === "None") return null;
    return `assets/data/element_icons/Element_${element}.svg`;
  }, avatarBadgeHtml2 = function(iconUrl, elementPath, size, badgeSize) {
    const avatarHtml = iconUrl ? `<img src="${dataAssetSrc2(iconUrl)}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);display:block;">` : `<div class="ac-icon-placeholder" style="width:${size}px;height:${size}px;">?</div>`;
    const badgeHtml = elementPath ? `<img class="el-badge-icon" src="${elementPath}" alt="" style="width:${badgeSize}px;height:${badgeSize}px;">` : "";
    return `<span class="avatar-badge">${avatarHtml}${badgeHtml}</span>`;
  }, assetSubLabel2 = function(entry) {
    if (!entry) return "";
    if (entry.isCustom) return "Custom \u2022 Unreleased";
    if (entry.element) {
      const iconPath = elementIconPath2(entry.element);
      const iconHtml = iconPath ? `<img class="el-icon" src="${iconPath}" alt="">` : "";
      return `${iconHtml}${entry.element} \u2022 <span class="gold-star">5\u2605</span>`;
    }
    if (entry.weaponType) return `${entry.weaponType} \u2022 <span class="gold-star">5\u2605</span>`;
    return `<span class="gold-star">5\u2605</span>`;
  }, hideAssetList2 = function() {
    const list = document.getElementById("assetNameList");
    list.classList.add("hidden");
    list.innerHTML = "";
  }, renderAssetList2 = function(query) {
    const list = document.getElementById("assetNameList");
    const type = currentAssetType2();
    const results = type === "character" ? searchGenshinCharacters(query) : searchGenshinWeapons(query);
    const trimmed = query.trim();
    const exactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());
    let html = results.slice(0, 8).map((entry) => `
            <div class="autocomplete-item" data-name="${entry.name.replace(/"/g, "&quot;")}">
                ${assetIconHtml2(entry)}
                <span class="ac-name">${entry.name}</span>
                <span class="ac-sub">${assetSubLabel2(entry)}</span>
            </div>
        `).join("");
    if (trimmed && !exactMatch) {
      const customIcon = type === "character" ? "assets/data/custom_icons/Lumine_Placeholder_custom.webp" : "assets/data/custom_icons/Weapon_Dull_Blade_custom.webp";
      html += `
                <div class="autocomplete-item ac-custom" data-custom="${trimmed.replace(/"/g, "&quot;")}">
                    <img src="${customIcon}" alt="">
                    <span class="ac-name">Custom: "${trimmed}"</span>
                </div>
            `;
    }
    if (!html) {
      hideAssetList2();
      return;
    }
    list.innerHTML = html;
    list.classList.remove("hidden");
  }, selectAssetByName2 = function(name) {
    const type = currentAssetType2();
    const entry = type === "character" ? getGenshinCharacter(name) : getGenshinWeapon(name);
    applySelectedAsset2(entry || (type === "character" ? makeCustomCharacter(name) : makeCustomWeapon(name)));
  }, selectCustomAsset2 = function(name) {
    const type = currentAssetType2();
    applySelectedAsset2(type === "character" ? makeCustomCharacter(name) : makeCustomWeapon(name));
  }, applySelectedAsset2 = function(entry) {
    selectedAsset = entry;
    document.getElementById("assetName").value = entry.name;
    renderSelectedAssetChip2();
    hideAssetList2();
  }, clearSelectedAsset2 = function() {
    selectedAsset = null;
    const chip = document.getElementById("selectedAssetChip");
    chip.classList.add("hidden");
    chip.innerHTML = "";
  }, assetNameLine2 = function(entry) {
    if (!entry) return "";
    if (entry.isCustom) return `${entry.name} <span style="color: var(--text-muted); font-weight:500; font-size:0.7em;">(Custom)</span>`;
    const iconPath = elementIconPath2(entry.element);
    const icon = iconPath ? `<img class="el-icon" src="${iconPath}" alt="" style="width:22px;height:22px;margin:0 2px;">` : "";
    const wepType = !iconPath && entry.weaponType ? `<span style="color: var(--text-muted); font-weight:500; font-size:0.6em; vertical-align:2px; margin: 0 8px 0 6px;">(${entry.weaponType})</span>` : " ";
    return `${entry.name}${icon}${wepType}<span class="gold-star">5\u2605</span>`;
  }, renderSelectedAssetChip2 = function() {
    const chip = document.getElementById("selectedAssetChip");
    if (!selectedAsset) {
      chip.classList.add("hidden");
      chip.innerHTML = "";
      return;
    }
    chip.innerHTML = `
            ${assetIconHtml2(selectedAsset)}
            <div class="sac-name">${assetNameLine2(selectedAsset)}</div>
            <button type="button" class="sac-clear" id="sacClearBtn" title="Clear selection">&times;</button>
        `;
    chip.classList.remove("hidden");
    document.getElementById("sacClearBtn").addEventListener("click", () => {
      clearSelectedAsset2();
      document.getElementById("assetName").value = "";
      document.getElementById("assetName").focus();
    });
  }, updateTimelineExplanation2 = function() {
    const pSelect = document.getElementById("targetPatch");
    const hSelect = document.querySelector('input[name="bannerHalf"]:checked');
    const pacingEl = document.getElementById("applyPacing");
    const pacingWrap = document.getElementById("pacingCheckboxWrap");
    if (!pSelect || !hSelect) return;
    const val = parseInt(pSelect.value) || 0;
    let patchLabel;
    if (val === 0) patchLabel = `current patch (${patchVersionAt2(0)})`;
    else if (val === 1) patchLabel = `next patch (${patchVersionAt2(1)})`;
    else patchLabel = `${val} patches from now (${patchVersionAt2(val)})`;
    let text = val === 0 ? "Allocating base wishes" : `Allocating base + income through ${patchLabel}`;
    const isFirst = hSelect.value === "first";
    if (pacingWrap) pacingWrap.classList.toggle("hidden", !isFirst);
    const usesPacing = isFirst && pacingEl && pacingEl.checked;
    text += usesPacing ? " + 65% of banner patch." : " + 100% of banner patch.";
    document.getElementById("timelineExplanation").innerText = text;
  }, enforceGoalFloor2 = function() {
    const charCurEl = document.getElementById("charCurrentConst");
    const charGoalEl = document.getElementById("charConst");
    if (charCurEl && charGoalEl) {
      const current = parseInt(charCurEl.value);
      const floor = Math.max(0, current + 1);
      Array.from(charGoalEl.options).forEach((opt) => {
        opt.disabled = parseInt(opt.value) < floor;
      });
      if (parseInt(charGoalEl.value) < floor) charGoalEl.value = String(floor);
    }
    const wepCurEl = document.getElementById("weaponCurrentRefine");
    const wepGoalEl = document.getElementById("weaponRefinement");
    if (wepCurEl && wepGoalEl) {
      const current = parseInt(wepCurEl.value);
      const floor = Math.max(1, current + 1);
      Array.from(wepGoalEl.options).forEach((opt) => {
        opt.disabled = parseInt(opt.value) < floor;
      });
      if (parseInt(wepGoalEl.value) < floor) wepGoalEl.value = String(floor);
    }
  }, updateCopiesExplanation2 = function() {
    enforceGoalFloor2();
    const charGoalEl = document.getElementById("charConst");
    const charCurEl = document.getElementById("charCurrentConst");
    if (charGoalEl && charCurEl) {
      const goal = parseInt(charGoalEl.value);
      const current = parseInt(charCurEl.value);
      const needed = Math.max(0, goal - current);
      const el = document.getElementById("charCopiesExplanation");
      if (el) el.innerText = needed === 0 ? "Goal already met: 0 pulls needed." : `Need ${needed} more cop${needed === 1 ? "y" : "ies"} to go from C${current < 0 ? "(none)" : current} to C${goal}.`;
    }
    const wepGoalEl = document.getElementById("weaponRefinement");
    const wepCurEl = document.getElementById("weaponCurrentRefine");
    if (wepGoalEl && wepCurEl) {
      const goal = parseInt(wepGoalEl.value);
      const current = parseInt(wepCurEl.value);
      const needed = Math.max(0, goal - current);
      const el = document.getElementById("wepCopiesExplanation");
      if (el) el.innerText = needed === 0 ? "Goal already met: 0 pulls needed." : `Need ${needed} more cop${needed === 1 ? "y" : "ies"} to go from R${current < 1 ? "(none)" : current} to R${goal}.`;
    }
    updateStrategyAvailability2();
  }, updateStrategyAvailability2 = function() {
    const strategySelect = document.getElementById("strategyRule");
    if (!strategySelect) return;
    const typeEl = document.querySelector('input[name="assetType"]:checked');
    const type = typeEl ? typeEl.value : "character";
    let goal, current;
    if (type === "character") {
      goal = parseInt(document.getElementById("charConst")?.value);
      current = parseInt(document.getElementById("charCurrentConst")?.value);
    } else {
      goal = parseInt(document.getElementById("weaponRefinement")?.value);
      current = parseInt(document.getElementById("weaponCurrentRefine")?.value);
    }
    const copiesToAcquire = Math.max(0, (isNaN(goal) ? 1 : goal) - (isNaN(current) ? 0 : current));
    const restrictOneShot = copiesToAcquire > 1;
    let selectedWasDisabled = false;
    Array.from(strategySelect.options).forEach((opt) => {
      const label = opt.textContent.trim();
      opt.disabled = restrictOneShot && label === "One Shot";
      if (opt.disabled && opt.selected) selectedWasDisabled = true;
    });
    if (selectedWasDisabled) {
      const hardLockOpt = Array.from(strategySelect.options).find((o) => o.textContent.trim() === "Hard Lock");
      if (hardLockOpt) strategySelect.value = hardLockOpt.value;
    }
  }, renderPipeline2 = function() {
    const container = document.getElementById("priorityContainer");
    container.innerHTML = "";
    priorityPipeline.forEach((item) => {
      const div = document.createElement("div");
      div.className = "priority-item";
      div.setAttribute("data-id", item.id);
      let strategyClass = item.strategy === "Hard Lock" ? "tag-hard-lock" : item.strategy === "One Shot" ? "tag-one-shot" : "tag-optional";
      const halfTag = item.bannerHalf === "first" ? item.applyPacing !== false ? "1st Half" : "1st Half, Instant" : "2nd Half";
      let meta = `${patchVersionAt2(item.targetPatch)} \xB7 ${halfTag} \u2022 ${item.type === "character" ? item.constellation : "R" + (item.refinement || 1)}`;
      const isEnabled = item.enabled !== false;
      if (!isEnabled) div.classList.add("disabled-item");
      const iconHtml = avatarBadgeHtml2(item.icon, elementIconPath2(item.element), 52, 20);
      div.innerHTML = `
                <div class="reorder-btns">
                    <button class="reorder-btn" title="Move up" onclick="movePipelineItem('${item.id}', -1)">\u25B2</button>
                    <button class="reorder-btn" title="Move down" onclick="movePipelineItem('${item.id}', 1)">\u25BC</button>
                </div>
                ${iconHtml}
                <div class="item-details">
                    <div class="item-name">${item.name} <span class="item-tag ${strategyClass}">${item.strategy}</span></div>
                    <div class="item-meta">${meta}</div>
                </div>
                <div class="item-actions">
                    <button class="toggle-btn ${isEnabled ? "enabled" : ""}" title="${isEnabled ? "Disable" : "Enable"}" onclick="togglePipelineItem('${item.id}')">${isEnabled ? "\u25CF" : "\u25CB"}</button>
                    <button class="edit-btn" onclick="editPipelineItem('${item.id}')">\u270F\uFE0F</button>
                    <button class="delete-btn" onclick="removePipelineItem('${item.id}')">&times;</button>
                </div>
            `;
      container.appendChild(div);
    });
    const wrap = document.querySelector(".priority-list-wrap");
    if (wrap) wrap.classList.toggle("is-empty", priorityPipeline.length === 0);
  }, removePipelineItem2 = function(id) {
    priorityPipeline = priorityPipeline.filter((x) => x.id !== id);
    pipelineUpdated2();
  }, movePipelineItem2 = function(id, direction) {
    const idx = priorityPipeline.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= priorityPipeline.length) return;
    const temp = priorityPipeline[idx];
    priorityPipeline.splice(idx, 1);
    priorityPipeline.splice(newIdx, 0, temp);
    pipelineUpdated2();
  }, togglePipelineItem2 = function(id) {
    const item = priorityPipeline.find((x) => x.id === id);
    if (!item) return;
    item.enabled = item.enabled === false ? true : false;
    pipelineUpdated2();
  }, editPipelineItem2 = function(id) {
    const item = priorityPipeline.find((x) => x.id === id);
    if (!item) return;
    editingId = id;
    updateTargetPatchOptions2();
    document.querySelector(`input[name="assetType"][value="${item.type}"]`).checked = true;
    document.getElementById("charOptions").classList.toggle("hidden", item.type !== "character");
    document.getElementById("weaponOptions").classList.toggle("hidden", item.type !== "weapon");
    document.getElementById("assetName").placeholder = item.type === "character" ? "e.g. Sandrone" : "e.g. A Teaspoon of Transcendence";
    document.getElementById("assetName").value = item.name;
    hideAssetList2();
    applySelectedAsset2({
      name: item.name,
      rarity: 5,
      element: item.element || null,
      weaponType: item.weaponType || null,
      icon: item.icon || null,
      isCustom: item.isCustom !== false && !item.icon
    });
    document.getElementById("targetPatch").value = item.targetPatch;
    syncTargetPatchUIFromValue2();
    document.querySelector(`input[name="bannerHalf"][value="${item.bannerHalf}"]`).checked = true;
    document.getElementById("applyPacing").checked = item.applyPacing !== false;
    updateTimelineExplanation2();
    document.getElementById("strategyRule").value = item.strategy;
    if (item.type === "character") {
      document.getElementById("charConst").value = item.constellation.replace("C", "");
      document.getElementById("charCurrentConst").value = item.currentConst !== void 0 ? item.currentConst : -1;
    } else {
      document.getElementById("weaponRefinement").value = item.refinement || 1;
      document.getElementById("weaponCurrentRefine").value = item.currentRefine !== void 0 ? item.currentRefine : 0;
    }
    updateTimelineExplanation2();
    updateCopiesExplanation2();
    document.getElementById("sec-creator").classList.remove("hidden");
    document.getElementById("openCreatorBtn").classList.add("hidden");
    document.getElementById("saveAsset").textContent = "Update";
    document.body.classList.add("ct-modal-open");
  }, closeCreator2 = function() {
    editingId = null;
    document.getElementById("sec-creator").classList.add("hidden");
    document.getElementById("openCreatorBtn").classList.remove("hidden");
    document.body.classList.remove("ct-modal-open");
    document.getElementById("assetName").value = "";
    document.getElementById("saveAsset").textContent = "Save";
    clearSelectedAsset2();
    hideAssetList2();
  }, renderWishTotals2 = function() {
    const finalEl = document.getElementById("wishTotalsFinal");
    const bodyEl = document.getElementById("wishTotalsBody");
    if (!finalEl || !bodyEl) return;
    const baseWishes = getBaseWishes2();
    const totalPatches = Math.max(0, Math.min(8, parseInt(totalPatchesEl.value) || 0));
    let rows = "";
    let running = baseWishes;
    if (planSpendStockpileChecked2()) {
      const overflow = Math.max(0, getPlannedSpend2(0) - getPatchIncome2(0));
      running = Math.max(0, running - overflow);
    }
    for (let i = 0; i <= totalPatches; i++) {
      const full = Math.max(0, getPatchIncome2(i) - getPlannedSpend2(i));
      const firstHalf = Math.floor(full * 0.65);
      const firstHalfTotal = running + firstHalf;
      const fullTotal = running + full;
      const label = i === 0 ? `Current Patch (${patchVersionAt2(0)})` : i === 1 ? `Next Patch (${patchVersionAt2(1)})` : `${i} Patches Later (${patchVersionAt2(i)})`;
      rows += `
                <div class="wish-totals-row">
                    <div class="wish-totals-label">${label}</div>
                    <div class="wish-totals-vals">
                        <span>First Half: <strong>${firstHalfTotal}</strong></span>
                        <span>Total: <strong>${fullTotal}</strong></span>
                    </div>
                </div>
            `;
      running = fullTotal;
    }
    finalEl.textContent = running;
    bodyEl.innerHTML = rows;
    bodyEl.classList.toggle("hidden", !wishTotalsExpanded);
  }, updateAverageBreakdown2 = function() {
    const totalEl = document.getElementById("avgIncomeTotal");
    const rowsEl = document.getElementById("avgIncomeBreakdownRows");
    if (!totalEl || !rowsEl) return;
    const base = parseInt(wishesPerPatchEl.value) || 0;
    const welkinOn = hasWelkinEl.checked;
    const bpOn = hasBPEl.checked;
    totalEl.textContent = base + (welkinOn ? 23 : 0) + (bpOn ? 9 : 0);
    let rows = `<div class="wid-bd-row"><span>Base Income</span><span>${base}</span></div>`;
    if (welkinOn) rows += `<div class="wid-bd-row"><span>Welkin Moon</span><span>+23</span></div>`;
    if (bpOn) rows += `<div class="wid-bd-row"><span>Battle Pass</span><span>+9</span></div>`;
    rowsEl.innerHTML = rows;
  }, buildForecastCtx = function() {
    const baseWishes = getBaseWishes2();
    const sgRate = (parseInt(starglitterEl.value) || 8) / 100;
    const maxTargetPatch = priorityPipeline.reduce((max, item) => Math.max(max, item.targetPatch || 0), 0);
    const incomeSchedule = [];
    const plannedSpend = [];
    for (let i = 0; i <= maxTargetPatch; i++) {
      incomeSchedule.push(getPatchIncome2(i));
      plannedSpend.push(getPlannedSpend2(i));
    }
    const { major: startPatchMajor, minor: startPatchMinor } = getStartPatch2();
    return {
      baseWishes,
      sgRate,
      priorityPipeline,
      charSoftPity: parseInt(charSoftPityEl.value) || 76,
      wepSoftPity: parseInt(wepSoftPityEl.value) || 65,
      charPity: parseInt(charPityEl.value) || 0,
      wepPity: parseInt(wepPityEl.value) || 0,
      incomeSchedule,
      plannedSpend,
      plannedSpendStockpile: planSpendStockpileChecked2(),
      startPatchMajor,
      startPatchMinor,
      charGuaranteeGlobal: getCharGuaranteeGlobal(),
      charRadiancePoints: getCharRadiancePoints()
    };
  }, calculateForecast2 = function() {
    renderWishTotals2();
    updateAverageBreakdown2();
    refreshPlannedSpendCaps2();
    const outputSpace = document.getElementById("outputLogSpace");
    if (startPatchMajorEl.value === "" || startPatchMinorEl.value === "") {
      outputSpace.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px 0;">Enter your start patch above to see scenarios.</div>';
      lastForecastSignature = null;
      pendingForecastCtx = null;
      return;
    }
    if (priorityPipeline.length === 0 || priorityPipeline.every((x) => x.enabled === false)) {
      outputSpace.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px 0;">Add targets to see scenarios.</div>';
      lastForecastSignature = null;
      pendingForecastCtx = null;
      return;
    }
    const ctx = buildForecastCtx();
    const signature = FORECAST_ENGINE_VERSION + "|" + JSON.stringify(ctx);
    if (signature === lastForecastSignature) {
      return;
    }
    const cached = findCachedForecast2(signature);
    if (cached) {
      lastForecastSignature = signature;
      pendingForecastCtx = null;
      renderForecastResults2(cached.data);
      return;
    }
    pendingForecastCtx = ctx;
    outputSpace.innerHTML = `
      <div style="text-align:center; padding: 24px 0;">
        <button type="button" class="calculate-btn" id="runForecastBtn">Calculate</button>
        <div class="calculate-btn-hint">Inputs changed</div>
      </div>
    `;
    const btn = document.getElementById("runForecastBtn");
    if (btn) btn.addEventListener("click", runForecastCalculation);
  }, runForecastCalculation = async function() {
    const ctx = pendingForecastCtx;
    if (!ctx) return;
    const signature = FORECAST_ENGINE_VERSION + "|" + JSON.stringify(ctx);
    const outputSpace = document.getElementById("outputLogSpace");
    if (priorityPipeline.length === 0 || priorityPipeline.every((x) => x.enabled === false)) {
      outputSpace.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px 0;">Add targets to see scenarios.</div>';
      return;
    }
    const cachedHit = findCachedForecast2(signature);
    if (cachedHit) {
      lastForecastSignature = signature;
      renderForecastResults2(cachedHit.data);
      saveForecastCache2(signature, cachedHit.data);
      return;
    }
    const requestToken = ++forecastRequestToken;
    outputSpace.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px 0;">Calculating\u2026</div>';
    let data;
    try {
      data = await fetchForecastFromWorker(ctx);
    } catch (err) {
      if (requestToken !== forecastRequestToken) return;
      outputSpace.innerHTML = `<div style="color:var(--text-danger, #e05); text-align:center; padding: 20px 0;">${forecastErrorMessage(err)}</div>`;
      return;
    }
    if (requestToken !== forecastRequestToken) return;
    if (data.empty) {
      outputSpace.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px 0;">Add targets to see scenarios.</div>';
      return;
    }
    lastForecastSignature = signature;
    renderForecastResults2(data);
    saveForecastCache2(signature, data);
  }, renderForecastResults2 = function(data) {
    lastForecastData = data;
    const { results, odds, planOdds, ep } = data;
    const outputSpace = document.getElementById("outputLogSpace");
    outputSpace.innerHTML = "";
    outputSpace.innerHTML += renderScenarioSummary2(results, ep, odds, planOdds);
    // Collapsible toggle, shown/hidden via CSS class - content underneath is
    // ALL scenarios across every tab (not filtered to the active tab), since
    // the toggle already keeps things out of the way by default.
    const toggleLabel = scenarioDetailsExpanded ? "Hide Scenario Details" : "Show Scenario Details";
    let gridHtml = `<button type="button" class="scenario-toggle-btn" onclick="toggleScenarioDetails()">${toggleLabel}</button>`;
    gridHtml += `<div class="scenario-grid${scenarioDetailsExpanded ? "" : " scenario-grid-collapsed"}">`;
    results.forEach((res) => {
      const rowsHtml = res.rows.map(renderRow).join("");
      const summaryClass = res.failed ? "sum-fail" : "sum-ok";
      const summaryText = res.failed ? "\u274C Requires more wishes" : "\u2705 Plan is viable";
      gridHtml += `
                <div class="scenario-block">
                    <h4 class="scenario-title">${res.title}</h4>
                    <div class="scenario-log">
                        ${rowsHtml}
                        <div class="log-summary ${summaryClass}">${summaryText}</div>

                    </div>
                </div>
            `;
    });
    gridHtml += "</div>";
    outputSpace.innerHTML += gridHtml;
  }, saveForecastCache2 = function(signature, data) {
    try {
      const list = loadForecastCacheList2().filter((entry) => entry.signature !== signature);
      list.unshift({ signature, data, timestamp: Date.now() });
      localStorage.setItem(FORECAST_CACHE_KEY, JSON.stringify(list.slice(0, MAX_FORECAST_CACHE_ENTRIES)));
    } catch (e) {
    }
  }, loadForecastCacheList2 = function() {
    try {
      const raw = localStorage.getItem(FORECAST_CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }, findCachedForecast2 = function(signature) {
    return loadForecastCacheList2().find((entry) => entry.signature === signature) || null;
  }, expandPipeline2 = function(pipeline) {
    const expanded = [];
    let charGuaranteeAssigned = false;
    pipeline.forEach((item) => {
      if (item.type !== "character" && item.type !== "weapon") {
        expanded.push(item);
        return;
      }
      const copies = item.copies !== void 0 ? item.copies : 1;
      if (copies <= 0) return;
      if (item.type === "character") {
        const goalC = parseInt((item.constellation || "C0").replace("C", "")) || 0;
        const startConst = item.currentConst !== void 0 ? item.currentConst : goalC - copies;
        for (let i = 0; i < copies; i++) {
          const usesGlobalGuarantee = i === 0 && !charGuaranteeAssigned;
          expanded.push({
            ...item,
            copies: 1,
            _sourceId: item.id,
            _copyIndex: i,
            _totalCopies: copies,
            constellation: "C" + (startConst + i + 1),
            guaranteed: usesGlobalGuarantee ? getCharGuaranteeGlobal() : "no"
          });
        }
        charGuaranteeAssigned = true;
      } else {
        const goalR = parseInt(item.refinement) || 1;
        const startR = item.currentRefine !== void 0 ? item.currentRefine : goalR - copies;
        for (let i = 0; i < copies; i++) {
          expanded.push({
            ...item,
            copies: 1,
            _sourceId: item.id,
            _copyIndex: i,
            _totalCopies: copies,
            refinement: startR + i + 1,
            guaranteed: "no"
          });
        }
      }
    });
    return expanded;
  }, itemWinProb2 = function(item) {
    return item.type === "weapon" ? 0.75 : 0.55;
  }, computeScenarioOdds2 = function(ep, worstPattern) {
    const nep = ep.length;
    if (nep === 0) return {
      bestPct: 100,
      mixedPct: 0,
      worstPct: 0
    };
    let best = 1;
    ep.forEach((item) => {
      best *= itemWinProb2(item);
    });
    let worst = 1;
    ep.forEach((item, i) => {
      const p = itemWinProb2(item);
      if (worstPattern[i] === -1) {
        worst *= 1;
      } else {
        worst *= worstPattern[i] > 0 ? 1 - p : p;
      }
    });
    const mixed = Math.max(0, 1 - best - worst);
    return {
      bestPct: best * 100,
      mixedPct: mixed * 100,
      worstPct: worst * 100
    };
  }, formatChance2 = function(pct, showOneIn) {
    if (pct <= 0) return "0%";
    if (pct >= 99.995) return "100%";
    const str = pct >= 10 ? pct.toFixed(1) : pct.toFixed(2);
    return `${str}%`;
  }, chanceOfGetting2 = function(row) {
    if (!(row.available > 0)) return null;
    if (row.itemType === "character" && typeof getFeaturedCharacterChance === "function") {
      return getFeaturedCharacterChance(row.available);
    }
    if (row.itemType === "weapon" && typeof getTargetWeaponChance === "function") {
      return getTargetWeaponChance(row.available);
    }
    return null;
  }, renderScenarioSummary2 = function(results, ep, odds, planOdds) {
    const best = results.reduce((a, b) => b.net > a.net ? b : a, results[0]);
    const worst = results.reduce((a, b) => b.net < a.net ? b : a, results[0]);
    const bestLabel = best.net >= 0 ? `+${best.net}` : `-${Math.abs(best.net)}`;
    const worstLabel = worst.net >= 0 ? `+${worst.net}` : `-${Math.abs(worst.net)}`;
    const tabTint = {};
    TAB_DEFS.forEach((t) => { tabTint[t.key] = t.tint; });
    // Older cached/worker responses may not have `tier` on each row yet - fall
    // back to showing everything ungrouped rather than an empty table.
    const hasTierData = results.some((r) => r.tier);
    const visibleResults = hasTierData ? results.filter((r) => r.tier === activeScenarioTab) : results;
    const tabBarHtml = !hasTierData ? "" : `
            <div class="scen-tab-bar">
                ${TAB_DEFS.map((t) => {
                  const count = results.filter((r) => r.tier === t.key).length;
                  const isActive = t.key === activeScenarioTab;
                  return `<button type="button" class="scen-tab-btn${isActive ? " active" : ""}" style="--tab-tint:${t.tint}" onclick="setScenarioTab('${t.key}')">${t.label} <span class="scen-tab-count">${count} scenario${count === 1 ? "" : "s"}</span></button>`;
                }).join("")}
            </div>
        `;
    const scenDotColor = (r) => {
      if (r.short === "Best") return "var(--success)";
      if (r.short === "Worst" || r.short === "TrueWorst") return "var(--danger)";
      return tabTint[r.tier] || "var(--warning)";
    };
    const headerCells = visibleResults.map((r) => `
            <th class="scen-item-cell"><span class="scen-dot" style="background:${scenDotColor(r)}"></span>${r.short}</th>
        `).join("");
    const bodyRows = ep.map((item, idx) => {
      const label = item.type === "character" ? item.constellation : "R" + (item.refinement || 1);
      const cells = visibleResults.map((r) => {
        const row = r.rows[idx];
        if (!row) {
          return `<td class="scen-item-cell"><span class="scen-item-mark scen-item-na">\u2014</span></td>`;
        }
        if (row.type === "skip") {
          const isOneShotSkip = item.strategy === "One Shot";
          const isOptionalSkip = item.strategy === "Optional";
          const skipText = isOneShotSkip || isOptionalSkip ? "Skipped" : "\u2014";
          const skipTitle = row.reason ? ` title="${row.reason}"` : "";
          return `<td class="scen-item-cell"><span class="scen-item-mark scen-item-na"${skipTitle}>${skipText}</span></td>`;
        }
        if (row.type === "deficit") {
          const chancePct = chanceOfGetting2(row);
          const chanceHtml = chancePct != null ? `<span class="scen-item-chance">${chancePct.toFixed(1)}% chance</span>` : "";
          return `<td class="scen-item-cell"><span class="scen-item-mark scen-item-short">\u26D4 Short (${Math.abs(row.deficit)})</span>${chanceHtml}</td>`;
        }
        if (row.type === "lose") {
          const onceLoseTitle = item.type === "weapon" ? "Missed the featured weapon: One Shot doesn't chase the Epitomized Path, so the copy was not obtained and the attempt ended there" : "Lost the featured 50/50: this strategy doesn't chase the guarantee, so the copy was not obtained and the guarantee carries forward to the next character patch";
          return `<td class="scen-item-cell">
                        <span class="scen-item-mark scen-item-once-lose" style="color:var(--danger)" title="${onceLoseTitle}">
                            \u274C Once
                        </span>
                    </td>`;
        }
        const guaranteed = row.loses > 0 || row.enteringGuaranteed;
        if (row.capturedRadiance) {
          const isEarly = row.radianceThreshold === 2;
          const rTitle = isEarly ? "Early Radiance: guaranteed win after 2 consecutive losses" : "Capture Radiance: guaranteed win after 3 consecutive losses";
          const rText = isEarly ? "Early Radiance" : "Radiance";
          return `<td class="scen-item-cell">
                        <span class="scen-item-mark scen-item-radiance" style="display:inline-flex;align-items:center;gap:5px;" title="${rTitle}">
                            <img class="radiance-icon" src="assets/data/custom_icons/Item_Intertwined_Fate.webp" alt="${rText}" style="width:14px;height:14px;">
                            <span class="radiance-text">${rText}</span>
                        </span>
                    </td>`;
        }
        if (guaranteed) {
          const isWepItem = item.type === "weapon";
          let guaranteedText, guaranteedTitle;
          if (isWepItem) {
            guaranteedText = row.enteringGuaranteed ? "Guaranteed" : "Epitomized";
            guaranteedTitle = row.enteringGuaranteed ? "Entered the patch already guaranteed via a pre-existing Fate Point: no roll this patch" : "Missed the featured weapon, gained a Fate Point: obtained via Epitomized Path on the next 5\u2605 weapon pull";
          } else {
            guaranteedText = row.enteringGuaranteed ? "Guaranteed (W)" : "Guaranteed (L/W)";
            guaranteedTitle = row.enteringGuaranteed ? "Entered the patch already guaranteed: no roll this patch" : "Lost the 50/50 this patch, then won on the guaranteed pull";
          }
          return `<td class="scen-item-cell">
                        <span class="scen-item-mark scen-item-guaranteed" title="${guaranteedTitle}">
                            <img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.webp" alt="${isWepItem ? guaranteedText : "Guaranteed"}">${guaranteedText}
                        </span>
                    </td>`;
        }
        const isSingleAttemptStrategy = item.type === "weapon" ? row.strategy === "One Shot" : row.strategy === "One Shot" || row.strategy === "Optional";
        return `<td class="scen-item-cell">
                    <span class="scen-item-mark scen-item-win">\u2705 ${isSingleAttemptStrategy ? "Once" : "Win"}</span>
                </td>`;
      }).join("");
      const prevItem = idx > 0 ? ep[idx - 1] : null;
      const isGroupContinuation = prevItem && item.type === prevItem.type && prevItem._sourceId !== void 0 && item._sourceId === prevItem._sourceId;
      const displayName = item.name.length > 12 ? item.name.slice(0, 12) + "\u2026" : item.name;
      const nameCell = isGroupContinuation ? `<td class="scen-name-cell scen-name-continuation" style="padding-left:0.6em;" title="${item.name}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f2c94c;margin-right:8px;vertical-align:middle;"></span>${displayName} <span class="scen-item-sub">${label}</span></td>` : `<td class="scen-name-cell" title="${item.name}">${displayName} <span class="scen-item-sub">${label}</span> <span class="scen-item-sub" style="opacity:0.6; font-size:0.85em;">${patchVersionAt2(item.targetPatch)}</span></td>`;
      return `
                <tr${isGroupContinuation ? "" : ' style="border-top:0.5em solid transparent;"'}>
                    ${nameCell}
                    ${cells}
                </tr>
            `;
    }).join("");
    const resultCells = visibleResults.map((r) => {
      const resultText = r.failed ? `${Math.abs(r.net)} wishes short` : `${r.net} wishes left`;
      const resultClass = r.failed ? "scen-result-fail" : "scen-result-ok";
      return `<td class="scen-result-cell ${resultClass}">${resultText}</td>`;
    }).join("");
    return `
            <div class="scenario-summary-card">
                <div class="scen-sum-stats">
                    <div class="scen-sum-stats-row">
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">Best<span class="scen-sum-stat-label-extra"> Case</span></span>
                        <span class="scen-sum-stat-val" style="color:var(--success)">${formatChance2(odds.bestPct, true)}</span>
                    </div>
                    <div class="scen-sum-stat" title="Chance that your plan finishes without running out of wishes. Optional targets may be dropped to protect this.${planOdds.exact ? "" : " (Estimated from 20,000 simulated trials.)"}">
                        <span class="scen-sum-stat-label">Budget</span>
                        <span class="scen-sum-stat-val" style="color:var(--success)">${formatChance2(planOdds.budget.succeedPct, false)}${planOdds.exact ? "" : "*"}</span>
                    </div>
                    <div class="scen-sum-stat" title="Chance that every target in your plan is obtained, including One Shot and Optional targets.${planOdds.exact ? "" : " (Estimated from 20,000 simulated trials.)"}">
                        <span class="scen-sum-stat-label">Perfect</span>
                        <span class="scen-sum-stat-val" style="color:var(--accent-purple)">${formatChance2(planOdds.perfect.succeedPct, false)}${planOdds.exact ? "" : "*"}</span>
                    </div>
                    <div class="scen-sum-stat" title="Share of scenarios that ended with a Hard Lock target short (couldn't be afforded).${planOdds.exact ? "" : " (Estimated from 20,000 simulated trials.)"}">
                        <span class="scen-sum-stat-label">Deficit</span>
                        <span class="scen-sum-stat-val" style="color:var(--danger)">${formatChance2(planOdds.budget.deficitPct, false)}${planOdds.exact ? "" : "*"}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">Worst<span class="scen-sum-stat-label-extra"> Case</span></span>
                        <span class="scen-sum-stat-val" style="color:var(--danger)">${formatChance2(odds.worstPct, true)}</span>
                    </div>
                    </div>
                    <div class="scen-sum-stats-row">
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">Best<span class="scen-sum-stat-label-extra"> Outcome</span></span>
                        <span class="scen-sum-stat-val" style="color:${best.net >= 0 ? "var(--success)" : "var(--danger)"}">${bestLabel}</span>
                    </div>
                    <div class="scen-sum-stat" title="Average leftover wishes across every outcome where the Hard Lock budget was met, weighted by probability.${planOdds.exact ? "" : " (Estimated from 20,000 simulated trials.)"}">
                        <span class="scen-sum-stat-label">Avg.<span class="scen-sum-stat-label-extra"> Surplus</span></span>
                        <span class="scen-sum-stat-val" style="color:var(--success)">${planOdds.budget.avgSurplus != null ? `+${Math.round(planOdds.budget.avgSurplus)}` : "\u2014"}${planOdds.budget.avgSurplus != null && !planOdds.exact ? "*" : ""}</span>
                    </div>
                    <div class="scen-sum-stat" title="Chance that at least one One Shot or Optional target gets skipped: unaffordable on its own, or dropped to protect a Hard Lock target.${planOdds.exact ? "" : " (Estimated from 20,000 simulated trials.)"}">
                        <span class="scen-sum-stat-label">Skips</span>
                        <span class="scen-sum-stat-val" style="color:var(--text-muted)">${formatChance2(planOdds.skipPct, false)}${planOdds.exact ? "" : "*"}</span>
                    </div>
                    <div class="scen-sum-stat" title="Average shortfall across every outcome where a Hard Lock target couldn't be afforded, weighted by probability.${planOdds.exact ? "" : " (Estimated from 20,000 simulated trials.)"}">
                        <span class="scen-sum-stat-label">Avg.<span class="scen-sum-stat-label-extra"> Deficit</span></span>
                        <span class="scen-sum-stat-val" style="color:var(--danger)">${planOdds.budget.avgDeficit != null ? `-${Math.round(Math.abs(planOdds.budget.avgDeficit))}` : "\u2014"}${planOdds.budget.avgDeficit != null && !planOdds.exact ? "*" : ""}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">Worst<span class="scen-sum-stat-label-extra"> Outcome</span></span>
                        <span class="scen-sum-stat-val" style="color:${worst.net >= 0 ? "var(--success)" : "var(--danger)"}">${worstLabel}</span>
                    </div>
                    </div>
                </div>
                <div class="scen-sum-divider"></div>
                <div class="scen-sum-title-row">
                    <div class="scen-sum-title scen-sum-title-lg">Scenario Summary</div>
                    ${tabBarHtml}
                    <div class="scen-sum-title-spacer" aria-hidden="true"></div>
                </div>
                <div class="scen-mobile-hint">\u{1F4F1} This table reads best on a tablet or desktop. On phones, use <strong>View Full Table</strong> or <strong>Save as Image</strong> below.</div>
                <div class="scen-sum-table-wrap">
                    <table class="scen-sum-table-full">
                        <thead>
                            <tr>
                                <th class="scen-name-cell">Target</th>
                                ${headerCells}
                            </tr>
                        </thead>
                        <tbody>
                            ${bodyRows}
                            <tr class="scen-result-row">
                                <td class="scen-name-cell">Result</td>
                                ${resultCells}
                            </tr>
                        </tbody>
                    </table>
                </div>
                <button type="button" class="scen-mobile-expand-btn" onclick="openScenarioSummaryModal(this)">
                    \u26F6 View Full Table
                </button>
                <div class="scen-legend">
                    <span class="scen-legend-title">Legend</span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-win">\u2705 Win</span><span class="scen-legend-desc">Won the 50/50.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-guaranteed"><img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.webp" alt="Guaranteed">Guaranteed (W)</span><span class="scen-legend-desc">Started guaranteed.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-guaranteed"><img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.webp" alt="Guaranteed">Guaranteed (L/W)</span><span class="scen-legend-desc">Lost the 50/50, won guaranteed.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-once-lose" style="color:var(--danger)">\u274C Once</span><span class="scen-legend-desc">Lost and stopped pulling.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-win">\u2705 Once</span><span class="scen-legend-desc">Won.</span></span>
                    ${ep.some((item) => item.type === "weapon") ? `<span class="scen-legend-item"><span class="scen-item-mark scen-item-guaranteed"><img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.webp" alt="Epitomized">Epitomized</span><span class="scen-legend-desc">Won via Fate Points.</span></span>` : ""}
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-radiance" style="display:inline-flex;align-items:center;gap:5px;"><img class="radiance-icon" src="assets/data/custom_icons/Item_Intertwined_Fate.webp" alt="Radiance" style="width:14px;height:14px;"><span class="radiance-text">Radiance</span></span><span class="scen-legend-desc">Capturing Radiance activated.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-short">\u26D4 Short</span><span class="scen-legend-desc">Ran out of wishes: % is the odds of still guaranteeing with what's left.</span></span>
                    <button type="button" class="scen-export-btn" onclick="exportScenarioSummaryPNG(this)">Save as Image</button>
                </div>
            </div>
        `;
  }, showBanner2 = function(html) {
    banner.innerHTML = html;
    banner.classList.remove("hidden");
  }, hideBanner2 = function() {
    banner.classList.add("hidden");
  }, storageIsWorking2 = function() {
    try {
      const probe = "__calculator_probe__";
      localStorage.setItem(probe, "1");
      const ok = localStorage.getItem(probe) === "1";
      localStorage.removeItem(probe);
      return ok;
    } catch (e) {
      return false;
    }
  }, buildState2 = function() {
    return {
      pipeline: priorityPipeline,
      wishes: currentWishesEl.value,
      starglitter: currentStarglitterEl.value,
      primogems: currentPrimogemsEl.value,
      wishesPerPatch: wishesPerPatchEl.value,
      totalPatches: totalPatchesEl.value,
      sgRate: starglitterEl.value,
      charSoftPity: charSoftPityEl.value,
      wepSoftPity: wepSoftPityEl.value,
      charPity: charPityEl.value,
      wepPity: wepPityEl.value,
      welkin: hasWelkinEl.checked,
      bp: hasBPEl.checked,
      charGuarantee: getCharGuaranteeGlobal(),
      charRadiancePoints: getCharRadiancePoints(),
      startPatchMajor: startPatchMajorEl.value,
      startPatchMinor: startPatchMinorEl.value,
      incomeMode: document.querySelector('input[name="incomeMode"]:checked')?.value || "average",
      customPatches: Array.from(document.querySelectorAll(".custom-val-input")).map((inp) => inp.value),
      planSpendEnabled: !!(planSpendToggleEl && planSpendToggleEl.checked),
      plannedSpendPatches: Array.from(document.querySelectorAll(".planned-val-input")).map((inp) => inp.value),
      planSpendStockpile: planSpendStockpileChecked2()
    };
  }, saveState2 = function() {
    const state = buildState2();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      if (!banner.dataset.userDismissed) hideBanner2();
    } catch (e) {
      showBanner2('\u26A0\uFE0F Your browser is blocking saved data for this page, so your inputs will reset on reload. This usually means cookies/site data are blocked (check Brave Shields \u2192 this site \u2192 Cookies), or "Clear cookies and site data on exit" is enabled. Use <b>Export</b> below to save your plan to a file as a workaround.');
    }
  }, applyState2 = function(s) {
    priorityPipeline = (s.pipeline || []).map((item) => ({
      ...item,
      name: String(item.name || "").trim().slice(0, 40)
    }));
    currentWishesEl.value = s.wishes ?? "";
    currentStarglitterEl.value = s.starglitter ?? "";
    currentPrimogemsEl.value = s.primogems ?? "";
    wishesPerPatchEl.value = s.wishesPerPatch ?? "80";
    totalPatchesEl.value = s.totalPatches ?? "0";
    starglitterEl.value = s.sgRate ?? "8";
    charSoftPityEl.value = s.charSoftPity ?? "76";
    wepSoftPityEl.value = s.wepSoftPity ?? "65";
    charPityEl.value = s.charPity ?? "0";
    wepPityEl.value = s.wepPity ?? "0";
    hasWelkinEl.checked = s.welkin || false;
    hasBPEl.checked = s.bp || false;
    charGuaranteeEl.checked = s.charGuarantee === "yes";
    setCharRadiancePoints(s.charRadiancePoints || 0);
    syncGuaranteeRadianceExclusivity();
    startPatchMajorEl.value = s.startPatchMajor ?? "1";
    startPatchMinorEl.value = s.startPatchMinor ?? "0";
    const modeEl = document.querySelector(`input[name="incomeMode"][value="${s.incomeMode || "average"}"]`);
    if (modeEl) {
      modeEl.checked = true;
      modeEl.dispatchEvent(new Event("change"));
    }
    updateStarglitterHint2();
    updatePrimogemsHint2();
    renderCustomIncomeRows2();
    updateTargetPatchOptions2();
    if (s.customPatches) {
      document.querySelectorAll(".custom-val-input").forEach((inp, idx) => {
        if (s.customPatches[idx] !== void 0) inp.value = s.customPatches[idx];
      });
    }
    if (planSpendToggleEl) planSpendToggleEl.checked = !!s.planSpendEnabled;
    renderPlannedSpendRows2();
    if (s.plannedSpendPatches) {
      document.querySelectorAll(".planned-val-input").forEach((inp, idx) => {
        if (s.plannedSpendPatches[idx] !== void 0) inp.value = s.plannedSpendPatches[idx];
      });
    }
    const stockpileToggleEl = document.getElementById("planSpendStockpileToggle");
    if (stockpileToggleEl) stockpileToggleEl.checked = !!s.planSpendStockpile;
    refreshPlannedSpendCaps2();
  }, loadState2 = function() {
    if (!storageIsWorking2()) {
      showBanner2('\u26A0\uFE0F This browser/tab is blocking saved data, so nothing will persist between visits. Check Brave Shields (cookie/site-data blocking) or "Clear on exit" settings for this site. You can still use <b>Export</b>/<b>Import</b> below to save and reload your plan manually.');
      return false;
    }
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      applyState2(JSON.parse(raw));
      return true;
    } catch (e) {
      return false;
    }
  }, exportState2 = function() {
    const blob = new Blob([JSON.stringify(buildState2(), null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "genshin-wish-plan.json";
    a.click();
    URL.revokeObjectURL(url);
  }, importStateFromFile2 = function(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        applyState2(JSON.parse(e.target.result));
        saveState2();
        pipelineUpdated2();
      } catch (err) {
        showBanner2("\u26A0\uFE0F That file could not be read as a valid plan export.");
      }
    };
    reader.readAsText(file);
  }, pipelineUpdated2 = function() {
    renderPipeline2();
    calculateForecast2();
    saveState2();
  }, loadHtml2Canvas2 = function() {
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
  };
  var getStartPatch = getStartPatch2, patchVersionAt = patchVersionAt2, updateStarglitterHint = updateStarglitterHint2, updatePrimogemsHint = updatePrimogemsHint2, updateTargetPatchOptions = updateTargetPatchOptions2, applyTargetPatchValue = applyTargetPatchValue2, syncTargetPatchUIFromValue = syncTargetPatchUIFromValue2, renderCustomIncomeRows = renderCustomIncomeRows2, renderPlannedSpendRows = renderPlannedSpendRows2, getPatchIncome = getPatchIncome2, currentAssetType = currentAssetType2, dataAssetSrc = dataAssetSrc2, assetIconHtml = assetIconHtml2, elementIconPath = elementIconPath2, avatarBadgeHtml = avatarBadgeHtml2, assetSubLabel = assetSubLabel2, hideAssetList = hideAssetList2, renderAssetList = renderAssetList2, selectAssetByName = selectAssetByName2, selectCustomAsset = selectCustomAsset2, applySelectedAsset = applySelectedAsset2, clearSelectedAsset = clearSelectedAsset2, assetNameLine = assetNameLine2, renderSelectedAssetChip = renderSelectedAssetChip2, updateTimelineExplanation = updateTimelineExplanation2, enforceGoalFloor = enforceGoalFloor2, updateCopiesExplanation = updateCopiesExplanation2, updateStrategyAvailability = updateStrategyAvailability2, renderPipeline = renderPipeline2, removePipelineItem = removePipelineItem2, movePipelineItem = movePipelineItem2, togglePipelineItem = togglePipelineItem2, editPipelineItem = editPipelineItem2, closeCreator = closeCreator2, renderWishTotals = renderWishTotals2, updateAverageBreakdown = updateAverageBreakdown2, calculateForecast = calculateForecast2, expandPipeline = expandPipeline2, itemWinProb = itemWinProb2, computeScenarioOdds = computeScenarioOdds2, formatChance = formatChance2, chanceOfGetting = chanceOfGetting2, renderScenarioSummary = renderScenarioSummary2, showBanner = showBanner2, hideBanner = hideBanner2, storageIsWorking = storageIsWorking2, buildState = buildState2, saveState = saveState2, applyState = applyState2, loadState = loadState2, exportState = exportState2, importStateFromFile = importStateFromFile2, pipelineUpdated = pipelineUpdated2, loadHtml2Canvas = loadHtml2Canvas2;
  const _debounce = typeof debounce === "function" ? debounce : function(fn, wait = 150) {
    let t;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };
  const debouncedStartPatchUpdate = _debounce((el) => {
    renderPipeline2();
    renderCustomIncomeRows2();
    renderPlannedSpendRows2();
    updateTargetPatchOptions2();
    calculateForecast2();
    saveState2();
  }, 150);
  [startPatchMajorEl, startPatchMinorEl].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      if (parseInt(el.value) > 7 && el === startPatchMinorEl) el.value = "7";
      if (parseInt(el.value) > 30 && el === startPatchMajorEl) el.value = "30";
      debouncedStartPatchUpdate(el);
    });
  });
  const debouncedCalculateForecast = _debounce(calculateForecast2, 150);
  currentWishesEl.addEventListener("input", () => {
    if (currentWishesEl.value.length > 5) currentWishesEl.value = currentWishesEl.value.slice(0, 5);
  });
  currentStarglitterEl.addEventListener("input", () => {
    if (currentStarglitterEl.value.length > 4) currentStarglitterEl.value = currentStarglitterEl.value.slice(0, 4);
  });
  currentPrimogemsEl.addEventListener("input", () => {
    if (currentPrimogemsEl.value.length > 6) currentPrimogemsEl.value = currentPrimogemsEl.value.slice(0, 6);
  });
  [starglitterEl, charSoftPityEl, wepSoftPityEl, charPityEl, wepPityEl].forEach((el) => {
    el.addEventListener("input", () => {
      if (el.value.length > 2) el.value = el.value.slice(0, 2);
    });
  });
  wishesPerPatchEl.addEventListener("input", () => {
    if (wishesPerPatchEl.value.length > 5) wishesPerPatchEl.value = wishesPerPatchEl.value.slice(0, 5);
  });
  currentStarglitterEl.addEventListener("input", () => {
    updateStarglitterHint2();
    debouncedCalculateForecast();
  });
  updateStarglitterHint2();
  currentPrimogemsEl.addEventListener("input", () => {
    updatePrimogemsHint2();
    debouncedCalculateForecast();
  });
  updatePrimogemsHint2();
  [currentWishesEl, wishesPerPatchEl, starglitterEl, charSoftPityEl, wepSoftPityEl, charPityEl, wepPityEl].forEach((el) => el.addEventListener("input", debouncedCalculateForecast));
  [hasWelkinEl, hasBPEl, charGuaranteeEl, ...charRadianceRadios].forEach((el) => el.addEventListener("change", calculateForecast2));
  const targetPatchSelect = document.getElementById("targetPatch");
  const targetPatchCurrentEl = document.getElementById("targetPatchCurrent");
  const targetPatchLaterEl = document.getElementById("targetPatchLater");
  const targetPatchLaterGroup = document.getElementById("targetPatchLaterGroup");
  const targetPatchLaterInput = document.getElementById("targetPatchLaterInput");
  targetPatchCurrentEl.addEventListener("change", () => {
    if (targetPatchCurrentEl.checked) {
      targetPatchLaterGroup.classList.add("hidden");
      applyTargetPatchValue2(0);
    }
  });
  targetPatchLaterEl.addEventListener("change", () => {
    if (targetPatchLaterEl.checked) {
      targetPatchLaterGroup.classList.remove("hidden");
      targetPatchLaterInput.focus();
      applyTargetPatchValue2(parseInt(targetPatchLaterInput.value) || 1);
    }
  });
  targetPatchLaterInput.addEventListener("input", (e) => {
    const val = parseInt(e.target.value);
    if (e.target.value === "" || isNaN(val)) return;
    if (val > 8) e.target.value = 8;
    else if (val < 1) e.target.value = 1;
    applyTargetPatchValue2(parseInt(e.target.value));
  });
  targetPatchLaterInput.addEventListener("blur", (e) => {
    if (e.target.value === "" || isNaN(parseInt(e.target.value))) {
      e.target.value = 1;
      applyTargetPatchValue2(1);
    }
  });
  totalPatchesEl.addEventListener("input", (e) => {
    const val = parseInt(e.target.value);
    if (e.target.value === "" || isNaN(val)) return;
    if (val > 8) e.target.value = 8;
    else if (val < 0) e.target.value = 0;
    renderCustomIncomeRows2();
    renderPlannedSpendRows2();
    updateTargetPatchOptions2();
    calculateForecast2();
  });
  totalPatchesEl.addEventListener("blur", (e) => {
    if (e.target.value === "" || isNaN(parseInt(e.target.value))) {
      e.target.value = 0;
      renderCustomIncomeRows2();
      renderPlannedSpendRows2();
      updateTargetPatchOptions2();
      calculateForecast2();
    }
  });
  if (planSpendToggleEl) {
    planSpendToggleEl.addEventListener("change", () => {
      renderPlannedSpendRows2();
      calculateForecast2();
      saveState2();
    });
  }
  document.querySelectorAll('input[name="incomeMode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "average") {
        document.getElementById("averageIncomeGroup").classList.remove("hidden");
        document.getElementById("customIncomeGroup").classList.add("hidden");
        document.getElementById("subscriptionsGroup").classList.remove("hidden");
      } else {
        document.getElementById("averageIncomeGroup").classList.add("hidden");
        document.getElementById("customIncomeGroup").classList.remove("hidden");
        document.getElementById("subscriptionsGroup").classList.add("hidden");
        hasWelkinEl.checked = false;
        hasBPEl.checked = false;
      }
      calculateForecast2();
    });
  });
  renderCustomIncomeRows2();
  renderPlannedSpendRows2();
  document.querySelectorAll('input[name="assetType"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const nameInput = document.getElementById("assetName");
      if (e.target.value === "character") {
        document.getElementById("charOptions").classList.remove("hidden");
        document.getElementById("weaponOptions").classList.add("hidden");
        nameInput.placeholder = "e.g. Sandrone";
      } else {
        document.getElementById("charOptions").classList.add("hidden");
        document.getElementById("weaponOptions").classList.remove("hidden");
        nameInput.placeholder = "e.g. A Teaspoon of Transcendence";
      }
      clearSelectedAsset2();
      hideAssetList2();
      updateStrategyAvailability2();
    });
  });
  let selectedAsset = null;
  const assetNameInput = document.getElementById("assetName");
  assetNameInput.addEventListener("input", (e) => {
    if (selectedAsset && selectedAsset.name !== e.target.value) clearSelectedAsset2();
    renderAssetList2(e.target.value);
  });
  assetNameInput.addEventListener("focus", (e) => {
    renderAssetList2(e.target.value);
  });
  document.getElementById("assetNameList").addEventListener("mousedown", (e) => {
    e.preventDefault();
    const item = e.target.closest(".autocomplete-item");
    if (!item) return;
    if (item.dataset.custom !== void 0) {
      selectCustomAsset2(item.dataset.custom);
    } else if (item.dataset.name !== void 0) {
      selectAssetByName2(item.dataset.name);
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-wrap")) hideAssetList2();
  });
  document.getElementById("targetPatch").addEventListener("change", updateTimelineExplanation2);
  document.querySelectorAll('input[name="bannerHalf"]').forEach((r) => r.addEventListener("change", updateTimelineExplanation2));
  document.getElementById("applyPacing").addEventListener("change", updateTimelineExplanation2);
  ["charConst", "charCurrentConst", "weaponRefinement", "weaponCurrentRefine"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", updateCopiesExplanation2);
  });
  let editingId = null;
  document.getElementById("openCreatorBtn").addEventListener("click", () => {
    updateTargetPatchOptions2();
    updateStrategyAvailability2();
    document.getElementById("sec-creator").classList.remove("hidden");
    document.getElementById("openCreatorBtn").classList.add("hidden");
    document.body.classList.add("ct-modal-open");
  });
  document.getElementById("cancelAsset").addEventListener("click", (e) => {
    e.preventDefault();
    closeCreator2();
  });
  document.getElementById("closeCreatorBtn").addEventListener("click", (e) => {
    e.preventDefault();
    closeCreator2();
  });
  document.getElementById("sec-creator").addEventListener("mousedown", (e) => {
    if (e.target === document.getElementById("sec-creator")) closeCreator2();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("sec-creator").classList.contains("hidden")) closeCreator2();
  });
  document.getElementById("saveAsset").addEventListener("click", (e) => {
    e.preventDefault();
    const type = document.querySelector('input[name="assetType"]:checked').value;
    const typedName = document.getElementById("assetName").value.trim() || (type === "character" ? "Sandrone" : "A Teaspoon of Transcendence");
    let resolved = selectedAsset && selectedAsset.name === typedName ? selectedAsset : null;
    if (!resolved) {
      resolved = type === "character" ? getGenshinCharacter(typedName) : getGenshinWeapon(typedName);
      if (!resolved) resolved = type === "character" ? makeCustomCharacter(typedName) : makeCustomWeapon(typedName);
    }
    const name = resolved.name;
    const strategy = document.getElementById("strategyRule").value;
    const chosenTargetPatch = parseInt(document.getElementById("targetPatch").value) || 0;
    if (chosenTargetPatch > (parseInt(totalPatchesEl.value) || 0)) {
      totalPatchesEl.value = chosenTargetPatch;
      renderCustomIncomeRows2();
      updateTargetPatchOptions2();
    }
    let item = {
      id: editingId || Date.now().toString(),
      type,
      name,
      strategy,
      icon: resolved.icon || null,
      element: resolved.element || null,
      weaponType: resolved.weaponType || null,
      isCustom: !!resolved.isCustom,
      targetPatch: chosenTargetPatch,
      bannerHalf: document.querySelector('input[name="bannerHalf"]:checked').value,
      applyPacing: document.getElementById("applyPacing").checked
    };
    if (type === "character") {
      const goal = parseInt(document.getElementById("charConst").value);
      const current = parseInt(document.getElementById("charCurrentConst").value);
      item.constellation = "C" + goal;
      item.currentConst = current;
      item.copies = Math.max(0, goal - current);
    } else {
      const goal = parseInt(document.getElementById("weaponRefinement").value);
      const current = parseInt(document.getElementById("weaponCurrentRefine").value);
      item.refinement = goal;
      item.currentRefine = current;
      item.copies = Math.max(0, goal - current);
    }
    if (editingId) {
      const idx = priorityPipeline.findIndex((x) => x.id === editingId);
      if (idx !== -1) priorityPipeline[idx] = item;
    } else {
      priorityPipeline.push(item);
    }
    closeCreator2();
    pipelineUpdated2();
  });
  let wishTotalsExpanded = false;
  const wishTotalsToggleEl = document.getElementById("wishTotalsToggle");
  if (wishTotalsToggleEl) {
    const wishTotalsToggleLabel = wishTotalsToggleEl.firstChild;
    wishTotalsToggleEl.addEventListener("click", () => {
      wishTotalsExpanded = !wishTotalsExpanded;
      wishTotalsToggleEl.classList.toggle("expanded", wishTotalsExpanded);
      wishTotalsToggleLabel.textContent = wishTotalsExpanded ? "Hide breakdown " : "Show breakdown ";
      document.getElementById("wishTotalsBody").classList.toggle("hidden", !wishTotalsExpanded);
    });
  }
  const SAVE_KEY = "genshin_calculator_v1";
  const FORECAST_CACHE_KEY = "genshin_calculator_forecast_v1";
  const MAX_FORECAST_CACHE_ENTRIES = 4;
  const banner = document.getElementById("failsafeBanner");
  const debouncedSaveState = _debounce(saveState2, 300);
  [currentWishesEl, wishesPerPatchEl, starglitterEl, charSoftPityEl, wepSoftPityEl, charPityEl, wepPityEl, totalPatchesEl].forEach((el) => el.addEventListener("input", debouncedSaveState));
  currentStarglitterEl.addEventListener("input", debouncedSaveState);
  currentPrimogemsEl.addEventListener("input", debouncedSaveState);
  [hasWelkinEl, hasBPEl, charGuaranteeEl, ...charRadianceRadios].forEach((el) => el.addEventListener("change", saveState2));
  document.querySelectorAll('input[name="incomeMode"]').forEach((r) => r.addEventListener("change", saveState2));
  document.getElementById("exportBtn").addEventListener("click", exportState2);
  document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
  document.getElementById("importFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importStateFromFile2(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("resetBtn").addEventListener("click", () => {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(FORECAST_CACHE_KEY);
    } catch (e) {
    }
    priorityPipeline = [];
    currentWishesEl.value = "";
    currentStarglitterEl.value = "";
    currentPrimogemsEl.value = "";
    wishesPerPatchEl.value = "80";
    totalPatchesEl.value = "0";
    starglitterEl.value = "8";
    charSoftPityEl.value = "76";
    wepSoftPityEl.value = "65";
    charPityEl.value = "0";
    wepPityEl.value = "0";
    hasWelkinEl.checked = false;
    hasBPEl.checked = false;
    charGuaranteeEl.checked = false;
    setCharRadiancePoints(0);
    syncGuaranteeRadianceExclusivity();
    startPatchMajorEl.value = "";
    startPatchMinorEl.value = "";
    const avgMode = document.querySelector('input[name="incomeMode"][value="average"]');
    avgMode.checked = true;
    avgMode.dispatchEvent(new Event("change"));
    if (planSpendToggleEl) planSpendToggleEl.checked = false;
    const plannedSpendGroupEl = document.getElementById("plannedSpendGroup");
    if (plannedSpendGroupEl) plannedSpendGroupEl.innerHTML = "";
    updateStarglitterHint2();
    updatePrimogemsHint2();
    renderCustomIncomeRows2();
    renderPlannedSpendRows2();
    updateTargetPatchOptions2();
    pipelineUpdated2();
  });
  loadState2();
  pipelineUpdated2();
  let html2canvasLoadPromise = null;
  window.exportScenarioSummaryPNG = async function(btn) {
    const card = document.querySelector(".scenario-summary-card");
    if (!card) return;
    const originalLabel = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Loading\u2026";
    try {
      await loadHtml2Canvas2();
    } catch (e) {
      console.error("Failed to load html2canvas:", e);
      alert("Export failed to load: check your connection and try again.");
      btn.disabled = false;
      btn.innerText = originalLabel;
      return;
    }
    btn.innerText = "Exporting\u2026";
    card.classList.add("exporting-for-png");
    html2canvas(card, {
      backgroundColor: "#0f0e1e",
      scale: 2,
      useCORS: true
    }).then((canvas) => new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error("toBlob returned null"));
          return;
        }
        const file = new File([blob], "scenario-summary.png", {
          type: "image/png"
        });
        const isMobileDevice = /Android|iP(hone|ad|od)/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
        if (isMobileDevice && navigator.canShare && navigator.canShare({
          files: [file]
        })) {
          try {
            await navigator.share({
              files: [file],
              title: "Scenario Summary"
            });
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
          link.download = "scenario-summary.png";
          link.href = canvas.toDataURL("image/png");
          link.click();
        }
        resolve();
      }, "image/png");
    })).catch((err) => {
      console.error("PNG export failed:", err);
      alert("Export failed: check the console for details.");
    }).finally(() => {
      card.classList.remove("exporting-for-png");
      btn.disabled = false;
      btn.innerText = originalLabel;
    });
  };
  window.toggleScenarioDetails = function() {
    scenarioDetailsExpanded = !scenarioDetailsExpanded;
    if (lastForecastData) renderForecastResults2(lastForecastData);
  };
  window.setScenarioTab = function(tab) {
    if (tab === activeScenarioTab || !lastForecastData) return;
    activeScenarioTab = tab;
    renderForecastResults2(lastForecastData);
  };
  window.openScenarioSummaryModal = function(btn) {
    const wrap = document.querySelector(".scen-sum-table-wrap");
    if (!wrap) return;
    const statsEl = document.querySelector(".scen-sum-stats");
    const dividerEl = document.querySelector(".scen-sum-divider");
    const titleRowEl = document.querySelector(".scen-sum-title-row");
    const legendEl = document.querySelector(".scen-legend");
    const existing = document.getElementById("scenSumModalOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "scenSumModalOverlay";
    overlay.className = "scen-sum-modal-overlay";
    overlay.innerHTML = `
            <div class="scen-sum-modal-rotate">
                <div class="scen-sum-modal-header">
                    <span class="scen-sum-modal-title">Scenario Summary</span>
                    <button type="button" class="scen-sum-modal-close" aria-label="Close">\u2715</button>
                </div>
                <div class="scen-sum-modal-body"></div>
            </div>
        `;
    const body = overlay.querySelector(".scen-sum-modal-body");
    if (statsEl) body.appendChild(statsEl.cloneNode(true));
    if (dividerEl) body.appendChild(dividerEl.cloneNode(true));
    if (titleRowEl) body.appendChild(titleRowEl.cloneNode(true));
    body.appendChild(wrap.cloneNode(true));
    if (legendEl) body.appendChild(legendEl.cloneNode(true));
    function close() {
      overlay.remove();
      document.body.classList.remove("scen-modal-open");
    }
    overlay.querySelector(".scen-sum-modal-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.body.appendChild(overlay);
    document.body.classList.add("scen-modal-open");
  };
}
