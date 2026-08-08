function renderTab4starMarkup() {
  const container = document.getElementById("tab4starContent");
  if (!container) return;
  container.innerHTML = `
        <div class="section-card">
            <div class="fs4-layout">
                <div class="fs4-left">
                    <div class="section-title">4 Stars Odds Simulator</div>
                    <p class="explanation explanation-tight-top">
                        Pure RNG, no reliable pity plan here.
                    </p>

                    <div class="fs4-input-grid">
                        <div class="form-group">
                            <label>Character</label>
                            <div class="autocomplete-wrap">
                                <div class="ac-input-inner">
                                    <input type="text" id="fs4AssetName" placeholder="e.g. Bennett" autocomplete="off" maxlength="40">
                                    <button type="button" class="ac-clear-btn hidden" id="fs4AssetClearBtn" title="Clear selection">&times;</button>
                                </div>
                                <div class="autocomplete-list hidden" id="fs4AssetNameList"></div>
                            </div>
                            <div class="fs4-field-error hidden" id="fs4CharError">Please pick a character first.</div>
                        </div>

                        <div class="form-group">
                            <label>Wishes Available</label>
                            <input type="number" id="fs4WishesAvailable" placeholder="0" min="0" max="999">
                        </div>

                        <div class="form-group">
                            <label>Currently Own</label>
                            <select id="fs4CurrentConst">
                                <option value="-1" selected="">Don't Own Yet</option>
                                <option value="0">C0</option>
                                <option value="1">C1</option>
                                <option value="2">C2</option>
                                <option value="3">C3</option>
                                <option value="4">C4</option>
                                <option value="5">C5</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Constellation Goal</label>
                            <select id="fs4Const">
                                <option value="0" selected="">C0</option>
                                <option value="1">C1</option>
                                <option value="2">C2</option>
                                <option value="3">C3</option>
                                <option value="4">C4</option>
                                <option value="5">C5</option>
                                <option value="6">C6</option>
                            </select>
                        </div>
                    </div>

                    <button type="button" class="btn-add fs4-calc-btn" id="fs4CalcBtn">Crush My Hopes</button>
                </div>

                <div class="fs4-result-panel">
                    <div class="fs4-empty-state" id="fs4EmptyState">
                        <div class="fs4-empty-title">Your Chances</div>
                        <p class="fs4-empty-sub">Select a character and configure your goal.</p>
                        <div class="fs4-empty-divider"><span>&#10022;</span></div>
                        <p class="fs4-empty-instruction">Press &ldquo;<span class="fs4-empty-cta">Crush My Hopes</span>&rdquo; to calculate.</p>
                    </div>

                    <div class="fs4-result hidden" id="fs4Result">
                        <div class="fs4-result-header">
                            <div class="fs4-result-avatar" id="fs4ResultAvatar"></div>
                            <div class="fs4-result-name" id="fs4ResultName"></div>
                        </div>
                        <div class="fs4-percent" id="fs4PercentValue">0%</div>
                        <div class="fs4-percent-label" id="fs4PercentLabel"></div>
                        <div class="explanation" id="fs4RangeText"></div>
                    </div>
                </div>
            </div>
        </div>
  `;
}
renderTab4starMarkup();
(function() {
  let fs4SelectedAsset = null;
  const fs4NameInput = document.getElementById("fs4AssetName");
  const fs4CurrentEl = document.getElementById("fs4CurrentConst");
  const fs4GoalEl = document.getElementById("fs4Const");
  const fs4WishesEl = document.getElementById("fs4WishesAvailable");
  if (!fs4NameInput) return;
  const fs4EmptyStateEl = document.getElementById("fs4EmptyState");
  if (fs4EmptyStateEl && !fs4EmptyStateEl.querySelector(".fs4-empty-art")) {
    const fs4EmptyArt = document.createElement("img");
    fs4EmptyArt.className = "fs4-empty-art";
    fs4EmptyArt.src = "assets/data/design_elements/4-star-background-orbit-design.webp";
    fs4EmptyArt.alt = "";
    fs4EmptyStateEl.prepend(fs4EmptyArt);
  }
  fs4WishesEl.addEventListener("input", () => {
    if (fs4WishesEl.value.length > 5) fs4WishesEl.value = fs4WishesEl.value.slice(0, 5);
  });
  function fs4ResolveWishBudget() {
    return Math.min(999, Math.max(0, parseInt(fs4WishesEl.value) || 0));
  }
  function fs4RenderAssetList(query) {
    const list = document.getElementById("fs4AssetNameList");
    const results = searchGenshinCharacters(query, 4);
    const trimmed = query.trim();
    const exactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());
    let html = results.slice(0, 8).map((entry) => `
            <div class="autocomplete-item" data-name="${entry.name.replace(/"/g, "&quot;")}">
                ${assetIconHtml(entry)}
                <span class="ac-name">${entry.name}</span>
                <span class="ac-sub">${fs4AssetSubLabel(entry)}</span>
            </div>
        `).join("");
    if (trimmed && !exactMatch) {
      html += `
                <div class="autocomplete-item ac-custom" data-custom="${trimmed.replace(/"/g, "&quot;")}">
                    <img src="assets/data/custom_icons/Lumine_Placeholder_custom.webp" alt="">
                    <span class="ac-name">Custom: "${trimmed}"</span>
                </div>
            `;
    }
    if (!html) {
      fs4HideAssetList();
      return;
    }
    list.innerHTML = html;
    list.classList.remove("hidden");
  }
  function fs4AssetSubLabel(entry) {
    if (!entry) return "";
    if (entry.isCustom) return "Custom \u2022 Unreleased";
    if (entry.element) {
      const iconPath = elementIconPath(entry.element);
      const iconHtml = iconPath ? `<img class="el-icon" src="${iconPath}" alt="">` : "";
      return `${iconHtml}${entry.element} \u2022 <span style="color:var(--text-muted);">4\u2605</span>`;
    }
    return `<span style="color:var(--text-muted);">4\u2605</span>`;
  }
  function fs4HideAssetList() {
    const list = document.getElementById("fs4AssetNameList");
    list.classList.add("hidden");
    list.innerHTML = "";
  }
  function fs4SelectAssetByName(name) {
    const entry = getGenshinCharacter(name, 4);
    fs4ApplySelectedAsset(entry || makeCustomCharacter(name, 4));
  }
  function fs4SelectCustomAsset(name) {
    fs4ApplySelectedAsset(makeCustomCharacter(name, 4));
  }
  const fs4ClearBtn = document.getElementById("fs4AssetClearBtn");
  function fs4ApplySelectedAsset(entry) {
    fs4SelectedAsset = entry;
    fs4NameInput.value = entry.name;
    fs4HideAssetList();
    document.getElementById("fs4CharError").classList.add("hidden");
    fs4NameInput.classList.remove("fs4-input-invalid");
    fs4ClearBtn.classList.remove("hidden");
  }
  function fs4ClearSelectedAsset() {
    fs4SelectedAsset = null;
    fs4ClearBtn.classList.add("hidden");
    document.getElementById("fs4Result").classList.add("hidden");
    document.getElementById("fs4EmptyState").classList.remove("hidden");
  }
  fs4ClearBtn.addEventListener("click", () => {
    fs4ClearSelectedAsset();
    fs4NameInput.value = "";
    fs4NameInput.focus();
  });
  fs4NameInput.addEventListener("input", (e) => {
    if (fs4SelectedAsset && fs4SelectedAsset.name !== e.target.value) fs4ClearSelectedAsset();
    fs4RenderAssetList(e.target.value);
  });
  fs4NameInput.addEventListener("focus", (e) => fs4RenderAssetList(e.target.value));
  fs4NameInput.addEventListener("click", (e) => fs4RenderAssetList(e.target.value));
  document.getElementById("fs4AssetNameList").addEventListener("mousedown", (e) => {
    e.preventDefault();
    const item = e.target.closest(".autocomplete-item");
    if (!item) return;
    if (item.dataset.custom !== void 0) fs4SelectCustomAsset(item.dataset.custom);
    else if (item.dataset.name !== void 0) fs4SelectAssetByName(item.dataset.name);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#fs4AssetName") && !e.target.closest("#fs4AssetNameList")) fs4HideAssetList();
  });
  function fs4EnforceGoalFloor() {
    const current = parseInt(fs4CurrentEl.value);
    const floor = Math.max(0, current + 1);
    Array.from(fs4GoalEl.options).forEach((opt) => {
      opt.disabled = parseInt(opt.value) < floor;
    });
    if (parseInt(fs4GoalEl.value) < floor) fs4GoalEl.value = String(floor);
    fs4UpdateCopiesExplanation();
  }
  function fs4UpdateCopiesExplanation() {
    const goal = parseInt(fs4GoalEl.value);
    const current = parseInt(fs4CurrentEl.value);
    const needed = Math.max(0, goal - current);
    const el = document.getElementById("fs4CopiesExplanation");
    if (el) el.innerText = needed === 0 ? "Goal already met: 0 pulls needed." : `Need ${needed} more cop${needed === 1 ? "y" : "ies"} to go from C${current < 0 ? "(none)" : current} to C${goal}.`;
  }
  fs4CurrentEl.addEventListener("change", fs4EnforceGoalFloor);
  fs4GoalEl.addEventListener("change", fs4UpdateCopiesExplanation);
  fs4EnforceGoalFloor();
  function fs4SimulateOnePull(state) {
    state.pos++;
    const chance = state.pos <= 8 ? 0.05 : state.pos === 9 ? 0.25 : 1;
    if (Math.random() < chance) {
      state.pos = 0;
      let gotRateup;
      if (state.guaranteedRateup) {
        gotRateup = true;
        state.guaranteedRateup = false;
      } else {
        gotRateup = Math.random() < 0.5;
        if (!gotRateup) state.guaranteedRateup = true;
      }
      if (gotRateup && Math.random() < 1 / 3) state.copies++;
    }
  }
  function fs4SimulateMilestones(copiesNeeded, trials, cap) {
    const results = new Array(trials);
    for (let t = 0; t < trials; t++) {
      const state = {
        pos: 0,
        guaranteedRateup: false,
        copies: 0
      };
      let pulls = 0;
      while (pulls < cap && state.copies < copiesNeeded) {
        fs4SimulateOnePull(state);
        pulls++;
      }
      results[t] = state.copies >= copiesNeeded ? pulls : cap + 1;
    }
    results.sort((a, b) => a - b);
    return results;
  }
  function fs4Percentile(sortedResults, p) {
    const idx = Math.min(sortedResults.length - 1, Math.floor(p * sortedResults.length));
    return sortedResults[idx];
  }
  document.getElementById("fs4CalcBtn").addEventListener("click", () => {
    const charError = document.getElementById("fs4CharError");
    if (!fs4SelectedAsset) {
      charError.classList.remove("hidden");
      fs4NameInput.classList.add("fs4-input-invalid");
      fs4NameInput.focus();
      return;
    }
    charError.classList.add("hidden");
    fs4NameInput.classList.remove("fs4-input-invalid");
    const current = parseInt(fs4CurrentEl.value);
    const goal = parseInt(fs4GoalEl.value);
    const copiesNeeded = Math.max(0, goal - current);
    const wishes = fs4ResolveWishBudget();
    const resultEl = document.getElementById("fs4Result");
    const emptyStateEl = document.getElementById("fs4EmptyState");
    if (emptyStateEl) emptyStateEl.classList.add("hidden");
    const percentEl = document.getElementById("fs4PercentValue");
    const labelEl = document.getElementById("fs4PercentLabel");
    const rangeEl = document.getElementById("fs4RangeText");
    const targetLabel = fs4SelectedAsset ? fs4SelectedAsset.name : fs4NameInput.value.trim() || "this character";
    const avatarEl = document.getElementById("fs4ResultAvatar");
    const nameEl = document.getElementById("fs4ResultName");
    if (avatarEl && nameEl) {
      avatarEl.innerHTML = fs4SelectedAsset ? assetIconHtml(fs4SelectedAsset) : "";
      nameEl.textContent = targetLabel;
    }
    if (copiesNeeded === 0) {
      resultEl.classList.remove("hidden");
      percentEl.style.color = "var(--success)";
      percentEl.textContent = "100%";
      labelEl.textContent = `You already own C${goal} ${targetLabel}: nothing to pull for.`;
      rangeEl.textContent = "";
      return;
    }
    const CAP = 1e3;
    const TRIALS = 6e3;
    const milestones = fs4SimulateMilestones(copiesNeeded, TRIALS, CAP);
    const successCount = milestones.filter((m) => m <= wishes).length;
    const chance = successCount / TRIALS;
    const lucky = fs4Percentile(milestones, 0.1);
    const average = Math.round(milestones.reduce((a, b) => a + b, 0) / milestones.length);
    const unlucky = fs4Percentile(milestones, 0.9);
    percentEl.textContent = `${Math.round(chance * 100)}%`;
    percentEl.style.color = chance >= 0.66 ? "var(--success)" : chance >= 0.33 ? "var(--warning)" : "var(--danger)";
    labelEl.textContent = `chance to hit C${goal} ${targetLabel} with ${wishes} wish${wishes === 1 ? "" : "es"}`;
    const luckyText = lucky > CAP ? `${CAP}+` : lucky;
    const unluckyText = unlucky > CAP ? `${CAP}+` : unlucky;
    rangeEl.innerHTML = `Typical cost for ${copiesNeeded} cop${copiesNeeded === 1 ? "y" : "ies"}: lucky players get there in ~${luckyText} pulls, unlucky ones need ~${unluckyText}+. Average is ~${average} pulls.`;
    resultEl.classList.remove("hidden");
  });
  window.activateFourStarTab = function() {
  };
})();
