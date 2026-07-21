let priorityPipeline = [];
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
const hasWelkinEl = document.getElementById("hasWelkin");
const hasBPEl = document.getElementById("hasBP");
const startPatchMajorEl = document.getElementById("startPatchMajor");
const startPatchMinorEl = document.getElementById("startPatchMinor");
function getStartPatch() {
  const major = parseInt(startPatchMajorEl?.value) || 1;
  let minor = parseInt(startPatchMinorEl?.value);
  if (isNaN(minor) || minor < 0) minor = 0;
  if (minor > 7) minor = 7;
  return { major, minor };
}
function patchVersionAt(offset) {
  const { major, minor } = getStartPatch();
  const total = minor + Math.max(0, offset);
  const bumpedMajor = major + Math.floor(total / 8);
  const bumpedMinor = total % 8;
  return `${bumpedMajor}.${bumpedMinor}`;
}
const _debounce = typeof debounce === "function" ? debounce : function(fn, wait = 150) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
};
const debouncedStartPatchUpdate = _debounce((el) => {
  renderPipeline();
  renderCustomIncomeRows();
  updateTargetPatchOptions();
  calculateForecast();
  saveState();
}, 150);
[startPatchMajorEl, startPatchMinorEl].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", () => {
    if (parseInt(el.value) > 7 && el === startPatchMinorEl) el.value = "7";
    if (parseInt(el.value) > 30 && el === startPatchMajorEl) el.value = "30";
    debouncedStartPatchUpdate(el);
  });
});
function updateStarglitterHint() {
  const sg = parseInt(currentStarglitterEl.value) || 0;
  const wishes = Math.floor(sg / 5);
  const hint = document.getElementById("starglitterWishCount");
  hint.textContent = wishes > 0 ? `\u2192 ${wishes} wish${wishes !== 1 ? "es" : ""} (+${sg % 5} leftover)` : "";
}
function updatePrimogemsHint() {
  const pg = parseInt(currentPrimogemsEl.value) || 0;
  const wishes = Math.floor(pg / 160);
  const hint = document.getElementById("primogemsWishCount");
  hint.textContent = wishes > 0 ? `\u2192 ${wishes} wish${wishes !== 1 ? "es" : ""} (+${pg % 160} leftover)` : "";
}
const debouncedCalculateForecast = _debounce(calculateForecast, 150);
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
  updateStarglitterHint();
  debouncedCalculateForecast();
});
updateStarglitterHint();
currentPrimogemsEl.addEventListener("input", () => {
  updatePrimogemsHint();
  debouncedCalculateForecast();
});
updatePrimogemsHint();
[currentWishesEl, wishesPerPatchEl, starglitterEl, charSoftPityEl, wepSoftPityEl, charPityEl, wepPityEl].forEach((el) => el.addEventListener("input", debouncedCalculateForecast));
[hasWelkinEl, hasBPEl].forEach((el) => el.addEventListener("change", calculateForecast));
function updateTargetPatchOptions(extendTo) {
  const patchSelect = document.getElementById("targetPatch");
  const totalPatches = parseInt(totalPatchesEl.value) || 0;
  const rangeMax = typeof extendTo === "number" ? Math.max(totalPatches, extendTo) : totalPatches;
  const currentValue = patchSelect.value;
  patchSelect.innerHTML = "";
  for (let i = 0; i <= rangeMax; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    if (i === 0) opt.innerText = `Current Patch (${patchVersionAt(0)})`;
    else if (i === 1) opt.innerText = `Next Patch (${patchVersionAt(1)})`;
    else if (i === 2) opt.innerText = `2 Patches Later (${patchVersionAt(2)})`;
    else opt.innerText = `${i} Patches Later (${patchVersionAt(i)})`;
    patchSelect.appendChild(opt);
  }
  if (currentValue && parseInt(currentValue) <= rangeMax) {
    patchSelect.value = currentValue;
  } else {
    patchSelect.value = "0";
  }
  updateTimelineExplanation();
  if (typeof syncTargetPatchUIFromValue === "function") syncTargetPatchUIFromValue();
}
const targetPatchSelect = document.getElementById("targetPatch");
const targetPatchCurrentEl = document.getElementById("targetPatchCurrent");
const targetPatchLaterEl = document.getElementById("targetPatchLater");
const targetPatchLaterGroup = document.getElementById("targetPatchLaterGroup");
const targetPatchLaterInput = document.getElementById("targetPatchLaterInput");
function applyTargetPatchValue(value) {
  const v = Math.min(8, Math.max(0, value));
  updateTargetPatchOptions(v);
  targetPatchSelect.value = String(v);
  syncTargetPatchUIFromValue();
  targetPatchSelect.dispatchEvent(new Event("change"));
  calculateForecast();
  saveState();
}
function syncTargetPatchUIFromValue() {
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
}
targetPatchCurrentEl.addEventListener("change", () => {
  if (targetPatchCurrentEl.checked) {
    targetPatchLaterGroup.classList.add("hidden");
    applyTargetPatchValue(0);
  }
});
targetPatchLaterEl.addEventListener("change", () => {
  if (targetPatchLaterEl.checked) {
    targetPatchLaterGroup.classList.remove("hidden");
    targetPatchLaterInput.focus();
    applyTargetPatchValue(parseInt(targetPatchLaterInput.value) || 1);
  }
});
targetPatchLaterInput.addEventListener("input", (e) => {
  const val = parseInt(e.target.value);
  if (e.target.value === "" || isNaN(val)) return;
  if (val > 8) e.target.value = 8;
  else if (val < 1) e.target.value = 1;
  applyTargetPatchValue(parseInt(e.target.value));
});
targetPatchLaterInput.addEventListener("blur", (e) => {
  if (e.target.value === "" || isNaN(parseInt(e.target.value))) {
    e.target.value = 1;
    applyTargetPatchValue(1);
  }
});
totalPatchesEl.addEventListener("input", (e) => {
  const val = parseInt(e.target.value);
  if (e.target.value === "" || isNaN(val)) return;
  if (val > 8) e.target.value = 8;
  else if (val < 0) e.target.value = 0;
  renderCustomIncomeRows();
  updateTargetPatchOptions();
  calculateForecast();
});
totalPatchesEl.addEventListener("blur", (e) => {
  if (e.target.value === "" || isNaN(parseInt(e.target.value))) {
    e.target.value = 0;
    renderCustomIncomeRows();
    updateTargetPatchOptions();
    calculateForecast();
  }
});
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
    calculateForecast();
  });
});
function renderCustomIncomeRows() {
  const total = parseInt(totalPatchesEl.value) || 0;
  const container = document.getElementById("customIncomeGroup");
  container.innerHTML = "<label>Custom Base Wishes Per Patch</label>";
  for (let i = 0; i <= total; i++) {
    let labelStr;
    if (i === 0) labelStr = `Current Patch (${patchVersionAt(0)})`;
    else if (i === 1) labelStr = `Next Patch (${patchVersionAt(1)})`;
    else if (i === 2) labelStr = `2 Patches Later (${patchVersionAt(2)})`;
    else labelStr = `${i} Patches Later (${patchVersionAt(i)})`;
    container.innerHTML += `
                <div class="custom-patch-row">
                    <div class="custom-patch-label">${labelStr}</div>
                    <input type="number" class="custom-val-input" data-index="${i}" value="80" min="0">
                </div>
            `;
  }
  document.querySelectorAll(".custom-val-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      if (inp.value.length > 5) inp.value = inp.value.slice(0, 5);
    });
    inp.addEventListener("input", _debounce(() => {
      calculateForecast();
      saveState();
    }, 150));
  });
}
renderCustomIncomeRows();
function getPatchIncome(index) {
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
}
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
    clearSelectedAsset();
    hideAssetList();
    updateStrategyAvailability();
  });
});
let selectedAsset = null;
function currentAssetType() {
  return document.querySelector('input[name="assetType"]:checked').value;
}
function dataAssetSrc(path) {
  if (!path) return null;
  if (/^(https?:)?\/\//.test(path) || path.startsWith("assets/data/")) return path;
  return `assets/data/${path}`;
}
function assetIconHtml(entry, sizeClass) {
  if (entry && entry.icon) {
    return `<img src="${dataAssetSrc(entry.icon)}" alt="">`;
  }
  return `<div class="ac-icon-placeholder">?</div>`;
}
function elementIconPath(element) {
  if (!element || element === "None") return null;
  return `assets/data/element_icons/Element_${element}.svg`;
}
function avatarBadgeHtml(iconUrl, elementPath, size, badgeSize) {
  const avatarHtml = iconUrl ? `<img src="${dataAssetSrc(iconUrl)}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);display:block;">` : `<div class="ac-icon-placeholder" style="width:${size}px;height:${size}px;">?</div>`;
  const badgeHtml = elementPath ? `<img class="el-badge-icon" src="${elementPath}" alt="" style="width:${badgeSize}px;height:${badgeSize}px;">` : "";
  return `<span class="avatar-badge">${avatarHtml}${badgeHtml}</span>`;
}
function assetSubLabel(entry) {
  if (!entry) return "";
  if (entry.isCustom) return "Custom \u2022 Unreleased";
  if (entry.element) {
    const iconPath = elementIconPath(entry.element);
    const iconHtml = iconPath ? `<img class="el-icon" src="${iconPath}" alt="">` : "";
    return `${iconHtml}${entry.element} \u2022 <span class="gold-star">5\u2605</span>`;
  }
  if (entry.weaponType) return `${entry.weaponType} \u2022 <span class="gold-star">5\u2605</span>`;
  return `<span class="gold-star">5\u2605</span>`;
}
function hideAssetList() {
  const list = document.getElementById("assetNameList");
  list.classList.add("hidden");
  list.innerHTML = "";
}
function renderAssetList(query) {
  const list = document.getElementById("assetNameList");
  const type = currentAssetType();
  const results = type === "character" ? searchGenshinCharacters(query) : searchGenshinWeapons(query);
  const trimmed = query.trim();
  const exactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());
  let html = results.slice(0, 8).map((entry) => `
            <div class="autocomplete-item" data-name="${entry.name.replace(/"/g, "&quot;")}">
                ${assetIconHtml(entry)}
                <span class="ac-name">${entry.name}</span>
                <span class="ac-sub">${assetSubLabel(entry)}</span>
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
    hideAssetList();
    return;
  }
  list.innerHTML = html;
  list.classList.remove("hidden");
}
function selectAssetByName(name) {
  const type = currentAssetType();
  const entry = type === "character" ? getGenshinCharacter(name) : getGenshinWeapon(name);
  applySelectedAsset(entry || (type === "character" ? makeCustomCharacter(name) : makeCustomWeapon(name)));
}
function selectCustomAsset(name) {
  const type = currentAssetType();
  applySelectedAsset(type === "character" ? makeCustomCharacter(name) : makeCustomWeapon(name));
}
function applySelectedAsset(entry) {
  selectedAsset = entry;
  document.getElementById("assetName").value = entry.name;
  renderSelectedAssetChip();
  hideAssetList();
}
function clearSelectedAsset() {
  selectedAsset = null;
  const chip = document.getElementById("selectedAssetChip");
  chip.classList.add("hidden");
  chip.innerHTML = "";
}
function assetNameLine(entry) {
  if (!entry) return "";
  if (entry.isCustom) return `${entry.name} <span style="color: var(--text-muted); font-weight:500; font-size:0.7em;">(Custom)</span>`;
  const iconPath = elementIconPath(entry.element);
  const icon = iconPath ? `<img class="el-icon" src="${iconPath}" alt="" style="width:22px;height:22px;margin:0 2px;">` : "";
  const wepType = !iconPath && entry.weaponType ? `<span style="color: var(--text-muted); font-weight:500; font-size:0.6em; vertical-align:2px; margin: 0 8px 0 6px;">(${entry.weaponType})</span>` : " ";
  return `${entry.name}${icon}${wepType}<span class="gold-star">5\u2605</span>`;
}
function renderSelectedAssetChip() {
  const chip = document.getElementById("selectedAssetChip");
  if (!selectedAsset) {
    chip.classList.add("hidden");
    chip.innerHTML = "";
    return;
  }
  chip.innerHTML = `
            ${assetIconHtml(selectedAsset)}
            <div class="sac-name">${assetNameLine(selectedAsset)}</div>
            <button type="button" class="sac-clear" id="sacClearBtn" title="Clear selection">&times;</button>
        `;
  chip.classList.remove("hidden");
  document.getElementById("sacClearBtn").addEventListener("click", () => {
    clearSelectedAsset();
    document.getElementById("assetName").value = "";
    document.getElementById("assetName").focus();
  });
}
const assetNameInput = document.getElementById("assetName");
assetNameInput.addEventListener("input", (e) => {
  if (selectedAsset && selectedAsset.name !== e.target.value) clearSelectedAsset();
  renderAssetList(e.target.value);
});
assetNameInput.addEventListener("focus", (e) => {
  renderAssetList(e.target.value);
});
document.getElementById("assetNameList").addEventListener("mousedown", (e) => {
  e.preventDefault();
  const item = e.target.closest(".autocomplete-item");
  if (!item) return;
  if (item.dataset.custom !== void 0) {
    selectCustomAsset(item.dataset.custom);
  } else if (item.dataset.name !== void 0) {
    selectAssetByName(item.dataset.name);
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete-wrap")) hideAssetList();
});
function updateTimelineExplanation() {
  const pSelect = document.getElementById("targetPatch");
  const hSelect = document.querySelector('input[name="bannerHalf"]:checked');
  const pacingEl = document.getElementById("applyPacing");
  const pacingWrap = document.getElementById("pacingCheckboxWrap");
  if (!pSelect || !hSelect) return;
  const val = parseInt(pSelect.value) || 0;
  let patchLabel;
  if (val === 0) patchLabel = `current patch (${patchVersionAt(0)})`;
  else if (val === 1) patchLabel = `next patch (${patchVersionAt(1)})`;
  else patchLabel = `${val} patches from now (${patchVersionAt(val)})`;
  let text = val === 0 ? "Allocating base wishes" : `Allocating base + income through ${patchLabel}`;
  const isFirst = hSelect.value === "first";
  if (pacingWrap) pacingWrap.classList.toggle("hidden", !isFirst);
  const usesPacing = isFirst && pacingEl && pacingEl.checked;
  text += usesPacing ? " + 65% of banner patch." : " + 100% of banner patch.";
  document.getElementById("timelineExplanation").innerText = text;
}
document.getElementById("targetPatch").addEventListener("change", updateTimelineExplanation);
document.querySelectorAll('input[name="bannerHalf"]').forEach((r) => r.addEventListener("change", updateTimelineExplanation));
document.getElementById("applyPacing").addEventListener("change", updateTimelineExplanation);
function enforceGoalFloor() {
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
}
function updateCopiesExplanation() {
  enforceGoalFloor();
  const charGoalEl = document.getElementById("charConst");
  const charCurEl = document.getElementById("charCurrentConst");
  if (charGoalEl && charCurEl) {
    const goal = parseInt(charGoalEl.value);
    const current = parseInt(charCurEl.value);
    const needed = Math.max(0, goal - current);
    const el = document.getElementById("charCopiesExplanation");
    if (el) el.innerText = needed === 0 ? "Goal already met \u2014 0 pulls needed." : `Need ${needed} more cop${needed === 1 ? "y" : "ies"} to go from C${current < 0 ? "(none)" : current} to C${goal}.`;
  }
  const wepGoalEl = document.getElementById("weaponRefinement");
  const wepCurEl = document.getElementById("weaponCurrentRefine");
  if (wepGoalEl && wepCurEl) {
    const goal = parseInt(wepGoalEl.value);
    const current = parseInt(wepCurEl.value);
    const needed = Math.max(0, goal - current);
    const el = document.getElementById("wepCopiesExplanation");
    if (el) el.innerText = needed === 0 ? "Goal already met \u2014 0 pulls needed." : `Need ${needed} more cop${needed === 1 ? "y" : "ies"} to go from R${current < 1 ? "(none)" : current} to R${goal}.`;
  }
  updateStrategyAvailability();
}
["charConst", "charCurrentConst", "weaponRefinement", "weaponCurrentRefine"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", updateCopiesExplanation);
});
function updateStrategyAvailability() {
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
}
function renderPipeline() {
  const container = document.getElementById("priorityContainer");
  container.innerHTML = "";
  priorityPipeline.forEach((item) => {
    const div = document.createElement("div");
    div.className = "priority-item";
    div.setAttribute("data-id", item.id);
    let strategyClass = item.strategy === "Hard Lock" ? "tag-hard-lock" : item.strategy === "One Shot" ? "tag-one-shot" : "tag-optional";
    const halfTag = item.bannerHalf === "first" ? item.applyPacing !== false ? "1st Half" : "1st Half, Instant" : "2nd Half";
    let meta = `${patchVersionAt(item.targetPatch)} \xB7 ${halfTag} \u2022 ${item.type === "character" ? item.constellation : "R" + (item.refinement || 1)}`;
    const isEnabled = item.enabled !== false;
    if (!isEnabled) div.classList.add("disabled-item");
    const iconHtml = avatarBadgeHtml(item.icon, elementIconPath(item.element), 52, 20);
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
}
function removePipelineItem(id) {
  priorityPipeline = priorityPipeline.filter((x) => x.id !== id);
  pipelineUpdated();
}
function movePipelineItem(id, direction) {
  const idx = priorityPipeline.findIndex((x) => x.id === id);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= priorityPipeline.length) return;
  const temp = priorityPipeline[idx];
  priorityPipeline.splice(idx, 1);
  priorityPipeline.splice(newIdx, 0, temp);
  pipelineUpdated();
}
function togglePipelineItem(id) {
  const item = priorityPipeline.find((x) => x.id === id);
  if (!item) return;
  item.enabled = item.enabled === false ? true : false;
  pipelineUpdated();
}
let editingId = null;
function editPipelineItem(id) {
  const item = priorityPipeline.find((x) => x.id === id);
  if (!item) return;
  editingId = id;
  updateTargetPatchOptions();
  document.querySelector(`input[name="assetType"][value="${item.type}"]`).checked = true;
  document.getElementById("charOptions").classList.toggle("hidden", item.type !== "character");
  document.getElementById("weaponOptions").classList.toggle("hidden", item.type !== "weapon");
  document.getElementById("assetName").placeholder = item.type === "character" ? "e.g. Sandrone" : "e.g. A Teaspoon of Transcendence";
  document.getElementById("assetName").value = item.name;
  hideAssetList();
  applySelectedAsset({
    name: item.name,
    rarity: 5,
    element: item.element || null,
    weaponType: item.weaponType || null,
    icon: item.icon || null,
    isCustom: item.isCustom !== false && !item.icon
  });
  document.getElementById("targetPatch").value = item.targetPatch;
  syncTargetPatchUIFromValue();
  document.querySelector(`input[name="bannerHalf"][value="${item.bannerHalf}"]`).checked = true;
  document.getElementById("applyPacing").checked = item.applyPacing !== false;
  updateTimelineExplanation();
  document.getElementById("strategyRule").value = item.strategy;
  if (item.type === "character") {
    document.getElementById("charConst").value = item.constellation.replace("C", "");
    document.getElementById("charCurrentConst").value = item.currentConst !== void 0 ? item.currentConst : -1;
    document.querySelector(`input[name="charGuar"][value="${item.guaranteed}"]`).checked = true;
  } else {
    document.getElementById("weaponRefinement").value = item.refinement || 1;
    document.getElementById("weaponCurrentRefine").value = item.currentRefine !== void 0 ? item.currentRefine : 0;
    document.querySelector(`input[name="wepGuar"][value="${item.guaranteed || "no"}"]`).checked = true;
  }
  updateTimelineExplanation();
  updateCopiesExplanation();
  document.getElementById("sec-creator").classList.remove("hidden");
  document.getElementById("openCreatorBtn").classList.add("hidden");
  document.getElementById("saveAsset").textContent = "Update";
  document.getElementById("sec-creator").scrollIntoView({ behavior: "smooth", block: "start" });
}
document.getElementById("openCreatorBtn").addEventListener("click", () => {
  updateTargetPatchOptions();
  updateStrategyAvailability();
  document.getElementById("sec-creator").classList.remove("hidden");
  document.getElementById("openCreatorBtn").classList.add("hidden");
  document.getElementById("sec-creator").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("cancelAsset").addEventListener("click", (e) => {
  e.preventDefault();
  closeCreator();
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
    renderCustomIncomeRows();
    updateTargetPatchOptions();
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
    item.guaranteed = document.querySelector('input[name="charGuar"]:checked').value;
  } else {
    const goal = parseInt(document.getElementById("weaponRefinement").value);
    const current = parseInt(document.getElementById("weaponCurrentRefine").value);
    item.refinement = goal;
    item.currentRefine = current;
    item.copies = Math.max(0, goal - current);
    item.guaranteed = document.querySelector('input[name="wepGuar"]:checked').value;
  }
  if (editingId) {
    const idx = priorityPipeline.findIndex((x) => x.id === editingId);
    if (idx !== -1) priorityPipeline[idx] = item;
  } else {
    priorityPipeline.push(item);
  }
  closeCreator();
  pipelineUpdated();
});
function closeCreator() {
  editingId = null;
  document.getElementById("sec-creator").classList.add("hidden");
  document.getElementById("openCreatorBtn").classList.remove("hidden");
  document.getElementById("assetName").value = "";
  document.getElementById("saveAsset").textContent = "Save";
  clearSelectedAsset();
  hideAssetList();
}
let wishTotalsExpanded = false;
function renderWishTotals() {
  const finalEl = document.getElementById("wishTotalsFinal");
  const bodyEl = document.getElementById("wishTotalsBody");
  if (!finalEl || !bodyEl) return;
  const baseWishes = (parseInt(currentWishesEl.value) || 0) + Math.floor((parseInt(currentStarglitterEl.value) || 0) / 5) + Math.floor((parseInt(currentPrimogemsEl.value) || 0) / 160);
  const totalPatches = Math.max(0, Math.min(8, parseInt(totalPatchesEl.value) || 0));
  let rows = "";
  let running = baseWishes;
  for (let i = 0; i <= totalPatches; i++) {
    const full = getPatchIncome(i);
    const firstHalf = Math.floor(full * 0.65);
    const firstHalfTotal = running + firstHalf;
    const fullTotal = running + full;
    const label = i === 0 ? `Current Patch (${patchVersionAt(0)})` : i === 1 ? `Next Patch (${patchVersionAt(1)})` : `${i} Patches Later (${patchVersionAt(i)})`;
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
}
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
function calculateForecast() {
  renderWishTotals();
  const baseWishes = (parseInt(currentWishesEl.value) || 0) + Math.floor((parseInt(currentStarglitterEl.value) || 0) / 5) + Math.floor((parseInt(currentPrimogemsEl.value) || 0) / 160);
  const sgRate = (parseInt(starglitterEl.value) || 8) / 100;
  const outputSpace = document.getElementById("outputLogSpace");
  if (priorityPipeline.length === 0 || priorityPipeline.every((x) => x.enabled === false)) {
    outputSpace.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px 0;">Add targets to see scenarios.</div>';
    return;
  }
  outputSpace.innerHTML = "";
  const scenarios = [
    { key: "best", title: "\u{1F7E2} BEST \u2014 everything wins" },
    { key: "ok", title: "\u{1F7E1} OK \u2014 mixed luck, no disasters" },
    { key: "worst", title: "\u{1F534} WORST \u2014 but Hard Locks always safe" }
  ];
  function getIncomeCeiling(item) {
    let income = baseWishes;
    for (let i = 0; i < item.targetPatch; i++) {
      income += getPatchIncome(i);
    }
    const patchIncome = getPatchIncome(item.targetPatch);
    const usesPacing = item.bannerHalf === "first" && item.applyPacing !== false;
    income += usesPacing ? Math.floor(patchIncome * 0.65) : patchIncome;
    return income;
  }
  function effectiveCost(rawCost) {
    const refund = Math.floor(rawCost * sgRate);
    return rawCost - refund;
  }
  function getRawCost(item, loses, isFirstChar, isFirstWep, enteringGuaranteed) {
    const copies = item.copies !== void 0 ? item.copies : 1;
    if (copies <= 0) return 0;
    const charWin = parseInt(charSoftPityEl.value) || 76;
    const wepWin = parseInt(wepSoftPityEl.value) || 65;
    if (item.type === "character") {
      const pitySaved = isFirstChar ? Math.min(parseInt(charPityEl.value) || 0, charWin - 1) : 0;
      if (enteringGuaranteed) return Math.max(1, charWin - pitySaved);
      if (item.strategy === "One Shot" || item.strategy === "Optional") {
        return Math.max(1, charWin - pitySaved);
      }
      const cost = charWin * (loses > 0 ? 2 : 1);
      return Math.max(1, cost - pitySaved);
    } else {
      const pitySaved = isFirstWep ? Math.min(parseInt(wepPityEl.value) || 0, wepWin - 1) : 0;
      if (item.strategy === "One Shot") return Math.max(1, wepWin - pitySaved);
      if (enteringGuaranteed) return Math.max(1, wepWin - pitySaved);
      const cost = wepWin * (loses > 0 ? 2 : 1);
      return Math.max(1, cost - pitySaved);
    }
  }
  function runScenario(losePattern) {
    let totalSpent = 0;
    let rows = [];
    let skipRemaining = false;
    let failed = false;
    let isFirstChar = true;
    let isFirstWep = true;
    let charGuarantee = false;
    const radianceIndices = losePattern.radianceIndices || /* @__PURE__ */ new Set();
    const enabledItems = expandPipeline(priorityPipeline.filter((x) => x.enabled !== false));
    enabledItems.forEach((item, idx) => {
      const incomeCeiling = getIncomeCeiling(item);
      const currentPool = incomeCeiling - totalSpent;
      const loses = losePattern[idx] || 0;
      const capturedRadiance = radianceIndices.has(idx);
      const label = item.type === "character" ? item.constellation : "R" + (item.refinement || 1);
      const patchLabel = patchVersionAt(item.targetPatch);
      const halfLabel = item.bannerHalf === "first" ? item.applyPacing !== false ? "1st Half" : "1st Half, Instant" : "2nd Half";
      const timing = `${patchLabel} \xB7 ${halfLabel}`;
      if (skipRemaining) {
        rows.push({ idx, type: "skip", itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, reason: "One Shot stopped here" });
        return;
      }
      if (loses === -1) {
        rows.push({ idx, type: "skip", itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, reason: "Skipped \u2014 Optional, deprioritized to protect Hard Lock targets", remaining: Math.max(0, currentPool) });
        return;
      }
      const enteringGuaranteed = item.type === "character" ? item.guaranteed === "yes" || charGuarantee : item.guaranteed === "yes";
      const rawCost = getRawCost(item, loses, isFirstChar, isFirstWep, enteringGuaranteed);
      if (item.type === "character") isFirstChar = false;
      else isFirstWep = false;
      const cost = effectiveCost(rawCost);
      const sgRefund = rawCost - cost;
      if (currentPool >= cost) {
        totalSpent += cost;
        const remaining = currentPool - cost;
        let rowType;
        if (item.type === "character") {
          if (enteringGuaranteed) {
            rowType = "lose-win";
          } else if (loses > 0) {
            rowType = item.strategy === "Hard Lock" ? "lose-win" : "lose";
          } else {
            rowType = "win";
          }
          charGuarantee = rowType === "lose";
        } else {
          if (item.strategy === "One Shot" && loses > 0 && !enteringGuaranteed) {
            rowType = "lose";
          } else {
            rowType = loses > 0 ? "lose-win" : "win";
          }
        }
        rows.push({ idx, type: rowType, itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, loses, capturedRadiance, rawCost, cost, sgRefund, remaining, enteringGuaranteed });
      } else {
        if (item.strategy === "Hard Lock") {
          totalSpent += cost;
          failed = true;
          const deficit = incomeCeiling - totalSpent;
          rows.push({ idx, type: "deficit", itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, loses, rawCost, cost, sgRefund, deficit, enteringGuaranteed });
        } else if (item.strategy === "One Shot") {
          rows.push({ idx, type: "skip", itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, reason: "Not enough wishes \u2014 One Shot skipped", remaining: Math.max(0, currentPool) });
          skipRemaining = true;
        } else {
          rows.push({ idx, type: "skip", itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, reason: "Not enough wishes \u2014 skipped (Optional)", remaining: Math.max(0, currentPool) });
        }
      }
    });
    return { rows, failed };
  }
  function strategyIcon(strategy) {
    if (strategy === "Hard Lock") return "\u{1F512}";
    if (strategy === "One Shot") return "\u{1F3AF}";
    return "\u{1F513}";
  }
  function abbrevTiming(timing) {
    return timing.replace("1st Half, Instant", "1H\u26A1").replace("1st Half", "1H").replace("2nd Half", "2H");
  }
  function metaLine(timing, strategyOrReasonHtml, strategy) {
    return `<div class="log-name-sub">
                <span class="log-meta-full">${timing} \xB7 ${strategyOrReasonHtml}</span>
                <span class="log-meta-mobile">${abbrevTiming(timing)} \xB7 ${strategyIcon(strategy)}</span>
            </div>`;
  }
  function sgHtmlFor(sgRefund) {
    if (!(sgRefund > 0)) return "";
    return `<div class="log-sg">
                <span class="log-sg-full">~${sgRefund} wishes back via Starglitter</span>
                <span class="log-sg-mobile">+${sgRefund} SG</span>
            </div>`;
  }
  function renderRow(row) {
    const rowIcon = avatarBadgeHtml(row.icon, elementIconPath(row.element), 44, 17);
    if (row.type === "skip") {
      return `<div class="log-row row-skip">
                    ${rowIcon}
                    <div>
                        <div class="log-name">${row.name} <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem;">${row.label}</span></div>
                        ${metaLine(row.timing, row.reason, row.strategy)}
                    </div>
                    <div class="log-outcome oc-skip">SKIPPED</div>
                    <div class="log-right">
                        ${row.remaining != null ? `<div class="log-remaining rem-ok">${row.remaining} left</div>` : ""}
                    </div>
                </div>`;
    }
    if (row.type === "deficit") {
      const outcomeText = row.loses > 0 ? row.itemType === "weapon" ? '<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Epitomized">Epitomized' : `<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Guaranteed">${row.enteringGuaranteed ? "Guaranteed (W)" : "Guaranteed (L/W)"}` : row.itemType === "weapon" ? "Won 75/25" : "Won 55/45";
      return `<div class="log-row row-deficit">
                    ${rowIcon}
                    <div>
                        <div class="log-name">${row.name} <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem;">${row.label}</span></div>
                        ${metaLine(row.timing, `${outcomeText} \xB7 ${row.strategy}`, row.strategy)}
                    </div>
                    <div class="log-outcome oc-deficit">DEFICIT</div>
                    <div class="log-right">
                        <div class="log-pulls">${row.rawCost} pulls</div>
                        ${row.cost < row.rawCost ? `<div class="log-net">${row.cost} net</div>` : ""}
                        <div class="log-remaining rem-deficit"><span class="log-rem-full">${row.deficit} wishes short</span><span class="log-rem-mobile">${row.deficit} short</span></div>
                        ${sgHtmlFor(row.sgRefund)}
                    </div>
                </div>`;
    }
    if (row.type === "lose") {
      const remClassLose = row.remaining > 50 ? "rem-ok" : row.remaining > 0 ? "rem-low" : "rem-deficit";
      const loseReason = row.itemType === "weapon" ? "Not obtained \u2014 One Shot, not chased" : "Not obtained \u2014 guarantee carries forward";
      return `<div class="log-row row-lose">
                    ${rowIcon}
                    <div>
                        <div class="log-name">${row.name} <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem;">${row.label}</span></div>
                        ${metaLine(row.timing, `${loseReason} \xB7 ${row.strategy}`, row.strategy)}
                    </div>
                    <div class="log-outcome oc-lose" style="color:var(--text-muted);">NOT OBTAINED</div>
                    <div class="log-right">
                        <div class="log-pulls">${row.rawCost} pulls</div>
                        ${row.cost < row.rawCost ? `<div class="log-net">${row.cost} net</div>` : ""}
                        <div class="log-remaining ${remClassLose}">${row.remaining} left</div>
                        ${sgHtmlFor(row.sgRefund)}
                    </div>
                </div>`;
    }
    const rowClass = row.type === "lose-win" ? "row-lose-win" : "row-win";
    const ocClass = row.type === "lose-win" ? "oc-guaranteed" : row.capturedRadiance ? "oc-radiance" : "oc-win";
    const isWep = row.itemType === "weapon";
    const radianceIconHtml = `<img class="radiance-icon" src="assets/data/custom_icons/Item_Intertwined_Fate.webp" alt="Capture Radiance" title="Capture Radiance \u2014 guaranteed win after 2 consecutive losses" style="width:15px;height:15px;vertical-align:-2px;margin-right:4px;">`;
    const guaranteedIconHtml = `<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Guaranteed" title="Lost the featured 50/50, then obtained it on the guaranteed next pull">`;
    const epitomizedIconHtml = `<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Epitomized" title="Missed the featured weapon, gained a Fate Point \u2014 the next 5\u2605 weapon is guaranteed to be your chosen one via Epitomized Path">`;
    let ocLabel;
    if (row.capturedRadiance) {
      ocLabel = `${radianceIconHtml}<span class="radiance-text">Capture Radiance</span>`;
    } else if (row.loses > 0 || row.enteringGuaranteed) {
      if (isWep) {
        ocLabel = row.enteringGuaranteed ? `${guaranteedIconHtml}Guaranteed` : `${epitomizedIconHtml}Epitomized`;
      } else if (row.enteringGuaranteed) {
        ocLabel = `${guaranteedIconHtml}Guaranteed (W)`;
      } else {
        ocLabel = `${guaranteedIconHtml}Guaranteed (L/W)`;
      }
    } else {
      ocLabel = isWep ? "Won 75/25" : "Won 55/45";
    }
    const remClass = row.remaining > 50 ? "rem-ok" : row.remaining > 0 ? "rem-low" : "rem-deficit";
    return `<div class="log-row ${rowClass}">
                ${rowIcon}
                <div>
                    <div class="log-name">${row.name} <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem;">${row.label}</span></div>
                    ${metaLine(row.timing, row.strategy, row.strategy)}
                </div>
                <div class="log-outcome ${ocClass}" style="${row.capturedRadiance ? "display:flex;align-items:center;" : ""}">${ocLabel}</div>
                <div class="log-right">
                    <div class="log-pulls">${row.rawCost} pulls</div>
                    ${row.cost < row.rawCost ? `<div class="log-net">${row.cost} net</div>` : ""}
                    <div class="log-remaining ${remClass}">${row.remaining} left</div>
                    ${sgHtmlFor(row.sgRefund)}
                </div>
            </div>`;
  }
  const n = priorityPipeline.length;
  const enabledPipeline = priorityPipeline.filter((x) => x.enabled !== false);
  const ne = enabledPipeline.length;
  const ep = expandPipeline(enabledPipeline);
  const nep = ep.length;
  const groups = enabledPipeline.map((item) => {
    const idxs = [];
    ep.forEach((e, i) => {
      if (e._sourceId === item.id) idxs.push(i);
    });
    return { item, idxs };
  }).filter((g) => g.idxs.length > 0);
  const bestPatternRaw = new Array(nep).fill(0);
  function solveWithReservation(rawPattern) {
    const raw = rawPattern.slice();
    let resolved = resolvePattern(raw, ep);
    for (let guard = 0; guard < nep + 1; guard++) {
      const trial = runScenario(resolved);
      let changed = false;
      trial.rows.forEach((r) => {
        if (r.type === "skip" && r.idx != null && raw[r.idx] !== -1) {
          raw[r.idx] = -1;
          changed = true;
        }
      });
      if (trial.failed) {
        const failIdx = trial.rows.findIndex((r) => r.type === "deficit");
        if (failIdx !== -1) {
          let pick = null;
          for (let i = 0; i < failIdx; i++) {
            const r = trial.rows[i];
            if (r.strategy === "Optional" && (r.type === "win" || r.type === "lose-win" || r.type === "lose") && r.idx != null) {
              if (!pick || r.cost > pick.cost) pick = r;
            }
          }
          if (pick) {
            raw[pick.idx] = -1;
            changed = true;
          }
        }
      }
      if (!changed) break;
      resolved = resolvePattern(raw, ep);
    }
    return resolved;
  }
  const worstPattern = solveWithReservation(ep.map(() => 1));
  const bestPattern = solveWithReservation(bestPatternRaw);
  const okScenarios = [];
  if (groups.length >= 2) {
    const p = new Array(nep).fill(0);
    p[groups[0].idxs[0]] = 1;
    okScenarios.push({ title: "\u{1F7E1} OK-A \u2014 first target loses once, rest win", short: "OK-A", pattern: solveWithReservation(p) });
  }
  if (groups.length >= 2) {
    const p = new Array(nep).fill(0);
    p[groups[groups.length - 1].idxs[0]] = 1;
    okScenarios.push({ title: "\u{1F7E1} OK-B \u2014 last target loses once, rest win", short: "OK-B", pattern: solveWithReservation(p) });
  }
  if (groups.length >= 3) {
    const p = new Array(nep).fill(0);
    groups.forEach((g, i) => {
      if (i % 2 === 1) p[g.idxs[0]] = 1;
    });
    okScenarios.push({ title: "\u{1F7E1} OK-C \u2014 alternating (every other loses once)", short: "OK-C", pattern: solveWithReservation(p) });
  }
  const hasWeapon = groups.some((g) => g.item.type === "weapon");
  if (hasWeapon && groups.length >= 2) {
    const p = new Array(nep).fill(0);
    groups.forEach((g) => {
      if (g.item.type === "weapon") g.idxs.forEach((i) => {
        p[i] = 1;
      });
    });
    okScenarios.push({ title: "\u{1F7E0} OK-D \u2014 weapon(s) hit fate point (lose\u2192guaranteed), chars win", short: "OK-D", pattern: solveWithReservation(p) });
  }
  {
    const eligibleGroups = groups.filter((g) => g.item.type === "character" && (g.item.strategy === "Hard Lock" || g.item.strategy === "One Shot"));
    if (eligibleGroups.length >= 2) {
      const p = new Array(nep).fill(0);
      const lastTwo = eligibleGroups.slice(-2);
      lastTwo.forEach((g) => {
        p[g.idxs[g.idxs.length - 1]] = 1;
      });
      okScenarios.push({
        title: "\u{1F7E3} OK-E \u2014 losses land at the very end (no target left for radiance to save)",
        short: "OK-E",
        pattern: solveWithReservation(p)
      });
    }
  }
  {
    const eligibleGroups = groups.filter((g) => g.item.type === "character" && (g.item.strategy === "Hard Lock" || g.item.strategy === "One Shot"));
    if (eligibleGroups.length >= 1) {
      const priciest = eligibleGroups.reduce((a, b) => (b.item.copies || 1) > (a.item.copies || 1) ? b : a, eligibleGroups[0]);
      const p = new Array(nep).fill(0);
      p[priciest.idxs[0]] = 1;
      okScenarios.push({
        title: `\u{1F535} OK-F \u2014 only your priciest target (${priciest.item.name}) loses, everything else clean`,
        short: "OK-F",
        pattern: solveWithReservation(p)
      });
    }
  }
  const allScenarios = [
    { title: "\u{1F7E2} BEST \u2014 everyone wins (55/45 chars, 75/25 weapons)", short: "Best", pattern: bestPattern },
    { title: "\u{1F534} WORST \u2014 everyone loses (55/45 chars, 75/25 weapons)", short: "Worst", pattern: worstPattern },
    ...okScenarios
  ];
  const results = allScenarios.map((scen) => {
    const { rows, failed } = runScenario(scen.pattern);
    let net = 0;
    if (failed) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].type === "deficit") {
          net = rows[i].deficit;
          break;
        }
      }
    } else {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].remaining != null) {
          net = rows[i].remaining;
          break;
        }
      }
    }
    return { ...scen, rows, failed, net };
  });
  const odds = computeScenarioOdds(ep, worstPattern);
  outputSpace.innerHTML += renderScenarioSummary(results, ep, odds);
  let gridHtml = '<div class="scenario-grid">';
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
}
function expandPipeline(pipeline) {
  const expanded = [];
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
        expanded.push({
          ...item,
          copies: 1,
          _sourceId: item.id,
          _copyIndex: i,
          _totalCopies: copies,
          constellation: "C" + (startConst + i + 1),
          // A pre-existing guarantee (player already lost a 50/50
          // before starting this plan) only ever applies to the
          // very first copy of a target — later copies get their
          // guarantee (if any) from the cascade rule below instead.
          guaranteed: i === 0 ? item.guaranteed : "no"
        });
      }
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
          guaranteed: i === 0 ? item.guaranteed : "no"
        });
      }
    }
  });
  return expanded;
}
function resolvePattern(rawPattern, expandedPipeline) {
  return applyCaptureRadiance(rawPattern, expandedPipeline);
}
function itemWinProb(item) {
  return item.type === "weapon" ? 0.75 : 0.55;
}
function applyCaptureRadiance(pattern, pipeline) {
  const result = [...pattern];
  const radianceIndices = /* @__PURE__ */ new Set();
  let consecutiveCharLosses = 0;
  let charGuarantee = false;
  for (let i = 0; i < pipeline.length; i++) {
    const item = pipeline[i];
    if (item.type !== "character") continue;
    if (result[i] === -1) continue;
    const enteringGuaranteed = item.guaranteed === "yes" || charGuarantee;
    if (enteringGuaranteed) {
      charGuarantee = false;
      continue;
    }
    if (consecutiveCharLosses >= 2) {
      result[i] = 0;
      radianceIndices.add(i);
      consecutiveCharLosses = 0;
      charGuarantee = false;
    } else if (result[i] > 0) {
      consecutiveCharLosses++;
      charGuarantee = item.strategy !== "Hard Lock";
    } else {
      consecutiveCharLosses = 0;
      charGuarantee = false;
    }
  }
  result.radianceIndices = radianceIndices;
  return result;
}
function computeScenarioOdds(ep, worstPattern) {
  const nep = ep.length;
  if (nep === 0) return { bestPct: 100, mixedPct: 0, worstPct: 0 };
  let best = 1;
  ep.forEach((item) => {
    best *= itemWinProb(item);
  });
  let worst = 1;
  ep.forEach((item, i) => {
    const p = itemWinProb(item);
    if (worstPattern[i] === -1) {
      worst *= 1;
    } else {
      worst *= worstPattern[i] > 0 ? 1 - p : p;
    }
  });
  const mixed = Math.max(0, 1 - best - worst);
  return { bestPct: best * 100, mixedPct: mixed * 100, worstPct: worst * 100 };
}
function formatChance(pct, showOneIn) {
  if (pct <= 0) return "0%";
  if (pct >= 99.995) return "100%";
  const str = pct >= 10 ? pct.toFixed(1) : pct.toFixed(2);
  if (!showOneIn || pct >= 20) return `${str}%`;
  const oneIn = Math.round(100 / pct);
  return oneIn > 1 ? `${str}% (1 in ${oneIn})` : `${str}%`;
}
function renderScenarioSummary(results, ep, odds) {
  const best = results.reduce((a, b) => b.net > a.net ? b : a, results[0]);
  const worst = results.reduce((a, b) => b.net < a.net ? b : a, results[0]);
  const bestLabel = best.net >= 0 ? `${best.net} wishes left` : `${Math.abs(best.net)} wishes short`;
  const worstLabel = worst.net >= 0 ? `${worst.net} wishes left` : `${Math.abs(worst.net)} wishes short`;
  const dotClass = { "Best": "scen-dot-best", "Worst": "scen-dot-worst" };
  const scenDot = (r) => dotClass[r.short] || (r.short === "OK-D" ? "scen-dot-okd" : r.short === "OK-E" ? "scen-dot-oke" : r.short === "OK-F" ? "scen-dot-okf" : "scen-dot-ok");
  const mobileHideClass = (r) => r.short === "OK-E" || r.short === "OK-F" ? " scen-col-mobile-hide" : "";
  const headerCells = results.map((r) => `
            <th class="scen-item-cell${mobileHideClass(r)}"><span class="scen-dot ${scenDot(r)}"></span>${r.short}</th>
        `).join("");
  const bodyRows = ep.map((item, idx) => {
    const label = item.type === "character" ? item.constellation : "R" + (item.refinement || 1);
    const cells = results.map((r) => {
      const row = r.rows[idx];
      const hideCls = mobileHideClass(r);
      if (!row) {
        return `<td class="scen-item-cell${hideCls}"><span class="scen-item-mark scen-item-na">\u2014</span></td>`;
      }
      if (row.type === "skip") {
        const isOneShotSkip = item.strategy === "One Shot";
        const isOptionalSkip = item.strategy === "Optional";
        const skipText = isOneShotSkip || isOptionalSkip ? "Skipped" : "\u2014";
        const skipTitle = row.reason ? ` title="${row.reason}"` : "";
        return `<td class="scen-item-cell${hideCls}"><span class="scen-item-mark scen-item-na"${skipTitle}>${skipText}</span></td>`;
      }
      if (row.type === "deficit") {
        return `<td class="scen-item-cell${hideCls}"><span class="scen-item-mark scen-item-short">\u26D4 Short</span></td>`;
      }
      if (row.type === "lose") {
        const onceLoseTitle = item.type === "weapon" ? "Missed the featured weapon \u2014 One Shot doesn't chase the Epitomized Path, so the copy was not obtained and the attempt ended there" : "Lost the featured 50/50 \u2014 this strategy doesn't chase the guarantee, so the copy was not obtained and the guarantee carries forward to the next character patch";
        return `<td class="scen-item-cell${hideCls}">
                        <span class="scen-item-mark scen-item-once-lose" style="color:var(--danger)" title="${onceLoseTitle}">
                            \u274C Once
                        </span>
                    </td>`;
      }
      const guaranteed = row.loses > 0 || row.enteringGuaranteed;
      if (row.capturedRadiance) {
        return `<td class="scen-item-cell${hideCls}">
                        <span class="scen-item-mark scen-item-radiance" style="display:inline-flex;align-items:center;gap:5px;" title="Capture Radiance \u2014 guaranteed win after 2 consecutive losses">
                            <img class="radiance-icon" src="assets/data/custom_icons/Item_Intertwined_Fate.webp" alt="Capture Radiance" style="width:14px;height:14px;">
                            <span class="radiance-text">Radiance</span>
                        </span>
                    </td>`;
      }
      if (guaranteed) {
        const isWepItem = item.type === "weapon";
        let guaranteedText, guaranteedTitle;
        if (isWepItem) {
          guaranteedText = row.enteringGuaranteed ? "Guaranteed" : "Epitomized";
          guaranteedTitle = row.enteringGuaranteed ? "Entered the patch already guaranteed via a pre-existing Fate Point \u2014 no roll this patch" : "Missed the featured weapon, gained a Fate Point \u2014 obtained via Epitomized Path on the next 5\u2605 weapon pull";
        } else {
          guaranteedText = row.enteringGuaranteed ? "Guaranteed (W)" : "Guaranteed (L/W)";
          guaranteedTitle = row.enteringGuaranteed ? "Entered the patch already guaranteed \u2014 no roll this patch" : "Lost the 50/50 this patch, then won on the guaranteed pull";
        }
        return `<td class="scen-item-cell${hideCls}">
                        <span class="scen-item-mark scen-item-guaranteed" title="${guaranteedTitle}">
                            <img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="${isWepItem ? guaranteedText : "Guaranteed"}">${guaranteedText}
                        </span>
                    </td>`;
      }
      const isSingleAttemptStrategy = item.type === "weapon" ? row.strategy === "One Shot" : row.strategy === "One Shot" || row.strategy === "Optional";
      return `<td class="scen-item-cell${hideCls}">
                    <span class="scen-item-mark scen-item-win">\u2705 ${isSingleAttemptStrategy ? "Once" : "Win"}</span>
                </td>`;
    }).join("");
    const prevItem = idx > 0 ? ep[idx - 1] : null;
    const isGroupContinuation = prevItem && item.type === prevItem.type && prevItem._sourceId !== void 0 && item._sourceId === prevItem._sourceId;
    const nameCell = isGroupContinuation ? `<td class="scen-name-cell scen-name-continuation" style="padding-left:0.6em;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f2c94c;margin-right:8px;vertical-align:middle;"></span>${item.name} <span class="scen-item-sub">${label}</span></td>` : `<td class="scen-name-cell">${item.name} <span class="scen-item-sub">${label}</span> <span class="scen-item-sub" style="opacity:0.6; font-size:0.85em;">${patchVersionAt(item.targetPatch)}</span></td>`;
    return `
                <tr${isGroupContinuation ? "" : ' style="border-top:0.5em solid transparent;"'}>
                    ${nameCell}
                    ${cells}
                </tr>
            `;
  }).join("");
  const resultCells = results.map((r) => {
    const resultText = r.failed ? `${Math.abs(r.net)} wishes short` : `${r.net} wishes left`;
    const resultClass = r.failed ? "scen-result-fail" : "scen-result-ok";
    return `<td class="scen-result-cell ${resultClass}${mobileHideClass(r)}">${resultText}</td>`;
  }).join("");
  return `
            <div class="scenario-summary-card">
                <div class="scen-sum-stats">
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">\u{1F7E2} Best<span class="scen-sum-stat-label-extra"> Case</span></span>
                        <span class="scen-sum-stat-val" style="color:var(--success)">${formatChance(odds.bestPct, true)}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">\u{1F7E1} Mixed<span class="scen-sum-stat-label-extra"> Outcomes</span></span>
                        <span class="scen-sum-stat-val" style="color:var(--warning, #d9a441)">${formatChance(odds.mixedPct, false)}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">\u{1F534} Worst<span class="scen-sum-stat-label-extra"> Case</span></span>
                        <span class="scen-sum-stat-val" style="color:var(--danger)">${formatChance(odds.worstPct, true)}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">Best<span class="scen-sum-stat-label-extra"> Outcome</span></span>
                        <span class="scen-sum-stat-val" style="color:${best.net >= 0 ? "var(--success)" : "var(--danger)"}">${bestLabel}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">Worst<span class="scen-sum-stat-label-extra"> Outcome</span></span>
                        <span class="scen-sum-stat-val" style="color:${worst.net >= 0 ? "var(--success)" : "var(--danger)"}">${worstLabel}</span>
                    </div>
                </div>
                <div class="scen-sum-divider"></div>
                <div class="scen-sum-title">Scenario Summary</div>
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
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-guaranteed"><img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Guaranteed">Guaranteed (W)</span><span class="scen-legend-desc">Entered the patch already guaranteed \u2014 no roll this patch.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-guaranteed"><img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Guaranteed">Guaranteed (L/W)</span><span class="scen-legend-desc">Lost the 50/50 this patch, then won on the guaranteed pull.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-once-lose" style="color:var(--danger)">\u274C Once</span><span class="scen-legend-desc">Lost, not chased (One Shot for weapons; One Shot/Optional for characters). Characters carry the guarantee forward; weapons don't.</span></span>
                    ${ep.some((item) => item.type === "weapon") ? `<span class="scen-legend-item"><span class="scen-item-mark scen-item-guaranteed"><img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Epitomized">Epitomized</span><span class="scen-legend-desc">Won via Fate Points after a miss.</span></span>` : ""}
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-radiance" style="display:inline-flex;align-items:center;gap:5px;"><img class="radiance-icon" src="assets/data/custom_icons/Item_Intertwined_Fate.webp" alt="Radiance" style="width:14px;height:14px;"><span class="radiance-text">Radiance</span></span><span class="scen-legend-desc">Capturing Radiance activated.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-short">\u26D4 Short</span><span class="scen-legend-desc">Ran out of wishes.</span></span>
                    <button type="button" class="scen-export-btn" onclick="exportScenarioSummaryPNG(this)">\u2B07 Save as Image</button>
                </div>
            </div>
        `;
}
const SAVE_KEY = "genshin_calculator_v1";
const banner = document.getElementById("failsafeBanner");
function showBanner(html) {
  banner.innerHTML = html;
  banner.classList.remove("hidden");
}
function hideBanner() {
  banner.classList.add("hidden");
}
function storageIsWorking() {
  try {
    const probe = "__calculator_probe__";
    localStorage.setItem(probe, "1");
    const ok = localStorage.getItem(probe) === "1";
    localStorage.removeItem(probe);
    return ok;
  } catch (e) {
    return false;
  }
}
function buildState() {
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
    startPatchMajor: startPatchMajorEl.value,
    startPatchMinor: startPatchMinorEl.value,
    incomeMode: document.querySelector('input[name="incomeMode"]:checked')?.value || "average",
    customPatches: Array.from(document.querySelectorAll(".custom-val-input")).map((inp) => inp.value)
  };
}
function saveState() {
  const state = buildState();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    if (!banner.dataset.userDismissed) hideBanner();
  } catch (e) {
    showBanner(
      '\u26A0\uFE0F Your browser is blocking saved data for this page, so your inputs will reset on reload. This usually means cookies/site data are blocked (check Brave Shields \u2192 this site \u2192 Cookies), or "Clear cookies and site data on exit" is enabled. Use <b>Export</b> below to save your plan to a file as a workaround.'
    );
  }
}
function applyState(s) {
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
  startPatchMajorEl.value = s.startPatchMajor ?? "1";
  startPatchMinorEl.value = s.startPatchMinor ?? "0";
  const modeEl = document.querySelector(`input[name="incomeMode"][value="${s.incomeMode || "average"}"]`);
  if (modeEl) {
    modeEl.checked = true;
    modeEl.dispatchEvent(new Event("change"));
  }
  updateStarglitterHint();
  updatePrimogemsHint();
  renderCustomIncomeRows();
  updateTargetPatchOptions();
  if (s.customPatches) {
    document.querySelectorAll(".custom-val-input").forEach((inp, idx) => {
      if (s.customPatches[idx] !== void 0) inp.value = s.customPatches[idx];
    });
  }
}
function loadState() {
  if (!storageIsWorking()) {
    showBanner(
      '\u26A0\uFE0F This browser/tab is blocking saved data, so nothing will persist between visits. Check Brave Shields (cookie/site-data blocking) or "Clear on exit" settings for this site. You can still use <b>Export</b>/<b>Import</b> below to save and reload your plan manually.'
    );
    return false;
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    applyState(JSON.parse(raw));
    return true;
  } catch (e) {
    return false;
  }
}
function exportState() {
  const blob = new Blob([JSON.stringify(buildState(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "genshin-wish-plan.json";
  a.click();
  URL.revokeObjectURL(url);
}
function importStateFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      applyState(JSON.parse(e.target.result));
      saveState();
      pipelineUpdated();
    } catch (err) {
      showBanner("\u26A0\uFE0F That file could not be read as a valid plan export.");
    }
  };
  reader.readAsText(file);
}
function pipelineUpdated() {
  renderPipeline();
  calculateForecast();
  saveState();
}
const debouncedSaveState = _debounce(saveState, 300);
[currentWishesEl, wishesPerPatchEl, starglitterEl, charSoftPityEl, wepSoftPityEl, charPityEl, wepPityEl, totalPatchesEl].forEach(
  (el) => el.addEventListener("input", debouncedSaveState)
);
currentStarglitterEl.addEventListener("input", debouncedSaveState);
currentPrimogemsEl.addEventListener("input", debouncedSaveState);
[hasWelkinEl, hasBPEl].forEach((el) => el.addEventListener("change", saveState));
document.querySelectorAll('input[name="incomeMode"]').forEach((r) => r.addEventListener("change", saveState));
document.getElementById("exportBtn").addEventListener("click", exportState);
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", (e) => {
  if (e.target.files[0]) importStateFromFile(e.target.files[0]);
  e.target.value = "";
});
document.getElementById("resetBtn").addEventListener("click", () => {
  try {
    localStorage.removeItem(SAVE_KEY);
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
  startPatchMajorEl.value = "";
  startPatchMinorEl.value = "";
  const avgMode = document.querySelector('input[name="incomeMode"][value="average"]');
  avgMode.checked = true;
  avgMode.dispatchEvent(new Event("change"));
  updateStarglitterHint();
  updatePrimogemsHint();
  renderCustomIncomeRows();
  updateTargetPatchOptions();
  pipelineUpdated();
});
loadState();
pipelineUpdated();
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
window.exportScenarioSummaryPNG = async function(btn) {
  const card = document.querySelector(".scenario-summary-card");
  if (!card) return;
  const originalLabel = btn.innerText;
  btn.disabled = true;
  btn.innerText = "Loading\u2026";
  try {
    await loadHtml2Canvas();
  } catch (e) {
    console.error("Failed to load html2canvas:", e);
    alert("Export failed to load \u2014 check your connection and try again.");
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
  }).then((canvas) => {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error("toBlob returned null"));
          return;
        }
        const file = new File([blob], "scenario-summary.png", { type: "image/png" });
        const isMobileDevice = /Android|iP(hone|ad|od)/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
        if (isMobileDevice && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "Scenario Summary" });
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
    });
  }).catch((err) => {
    console.error("PNG export failed:", err);
    alert("Export failed \u2014 check the console for details.");
  }).finally(() => {
    card.classList.remove("exporting-for-png");
    btn.disabled = false;
    btn.innerText = originalLabel;
  });
};
window.openScenarioSummaryModal = function(btn) {
  const wrap = document.querySelector(".scen-sum-table-wrap");
  if (!wrap) return;
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
  overlay.querySelector(".scen-sum-modal-body").appendChild(wrap.cloneNode(true));
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
