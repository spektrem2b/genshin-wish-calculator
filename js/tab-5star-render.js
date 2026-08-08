function renderTab5starMarkup() {
  const container = document.getElementById("tab5starContent");
  if (!container) return;
  container.innerHTML = `
    <div class="section-card">
        <div class="section-title">Wish Income</div>

        <div class="wid-grid">

            <div class="wid-panel">
                <div class="wid-panel-title-row">
                    <div class="wid-panel-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                        Starting Conditions
                    </div>
                </div>
                <div class="wid-panel-body">
                    <div class="wid-stat-group">
                        <div class="wid-eyebrow muted">Planning Window</div>
                        <div class="wid-field-row">
                            <div class="form-group">
                                <label>Start Patch <span class="wid-label-hint">e.g. 5.7</span></label>
                                <div class="wid-patch-inputs">
                                    <input type="number" id="startPatchMajor" placeholder="5" min="1" max="30" required>
                                    <span class="wid-patch-dot">.</span>
                                    <input type="number" id="startPatchMinor" placeholder="7" min="0" max="7" required>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Plan Ahead <span class="wid-label-hint">max 8</span></label>
                                <input type="number" id="totalPatchesPlan" placeholder="0" min="0" max="8">
                            </div>
                        </div>
                    </div>

                    <div class="wid-divider"></div>

                    <div class="wid-stat-group">
                        <div class="wid-eyebrow muted">Current Resources</div>
                        <div class="wid-field-row wid-field-row-3">
                            <div class="form-group">
                                <label>Wishes on Hand</label>
                                <input type="number" id="currentWishes" placeholder="0" min="0">
                            </div>
                            <div class="form-group">
                                <label>Starglitter <span class="wid-label-hint">5 = 1 wish</span></label>
                                <input type="number" id="currentStarglitter" placeholder="0" min="0">
                                <div class="explanation" id="starglitterWishCount"></div>
                            </div>
                            <div class="form-group">
                                <label>Primogems <span class="wid-label-hint">160 = 1 wish</span></label>
                                <input type="number" id="currentPrimogems" placeholder="0" min="0">
                                <div class="explanation" id="primogemsWishCount"></div>
                            </div>
                        </div>
                    </div>

                    <div class="wid-divider"></div>

                    <div class="wid-stat-group">
                        <div class="wid-eyebrow muted">Current Guarantee? <span class="wid-label-hint">character banner only</span></div>
                        <div class="wid-toggle-rows">
                            <label class="wid-toggle-row">
                                <input type="checkbox" id="charGuarantee">
                                <span class="wid-toggle-text">
                                    <span class="wid-toggle-name">Guaranteed next</span>
                                    <span class="wid-toggle-sub" id="charGuaranteeSub">Your next featured 5\u2605 is guaranteed</span>
                                </span>
                            </label>
                        </div>
                        <div class="explanation">Only applies to your very first character target.</div>
                    </div>

                    <div class="wid-divider"></div>

                    <div class="wid-stat-group">
                        <div class="wid-eyebrow muted">Radiance Points <span class="wid-label-hint">consecutive 50/50 losses banked</span></div>
                        <div class="radio-group ct-segmented ct-segmented-3">
                            <div class="radio-btn">
                                <input type="radio" id="radiance0" name="charRadiance" value="0" checked="">
                                <label for="radiance0" class="radio-label">0</label>
                            </div>
                            <div class="radio-btn">
                                <input type="radio" id="radiance1" name="charRadiance" value="1">
                                <label for="radiance1" class="radio-label">1</label>
                            </div>
                            <div class="radio-btn">
                                <input type="radio" id="radiance2" name="charRadiance" value="2">
                                <label for="radiance2" class="radio-label">2</label>
                            </div>
                        </div>
                        <div class="explanation">How many featured 5\u2605 50/50s you've lost in a row right now. A 50/50 win brings this down by 1 (not straight to 0); Radiance brings it down to 1 (not 0); using a guarantee in between does not change it. This is independent from "Guaranteed next" any combination of the two is possible, since a loss at any Radiance count also puts you into an ordinary pity guarantee. You can verify your wish history on <a href="https://paimon.moe/wish" target="_blank" rel="noopener">paimon.moe/wish</a>.</div>
                    </div>
                </div>
            </div>

            <div class="wid-panel wid-panel-income">
                <div class="wid-panel-title-row">
                    <div class="wid-panel-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>
                        Wish Income
                    </div>
                    <div class="radio-group wid-mode-switch">
                        <div class="radio-btn">
                            <input type="radio" id="incAvg" name="incomeMode" value="average" checked="">
                            <label for="incAvg" class="radio-label">Average</label>
                        </div>
                        <div class="radio-btn">
                            <input type="radio" id="incCustom" name="incomeMode" value="custom">
                            <label for="incCustom" class="radio-label">Custom</label>
                        </div>
                    </div>
                </div>
                <div class="wid-panel-body">
                    <div class="wid-average" id="averageIncomeGroup">
                        <div class="form-group">
                            <label>Base F2P Wishes <span class="wid-label-hint">per patch</span></label>
                            <input type="number" id="wishesPerPatch" value="80" min="0">
                        </div>

                        <div class="wid-divider"></div>

                        <div id="subscriptionsGroup">
                            <div class="wid-eyebrow muted">Monthly Bonuses</div>
                            <div class="wid-label-hint wid-eyebrow-sub">Applies to every planned patch</div>
                            <div class="wid-toggle-rows">
                                <label class="wid-toggle-row">
                                    <input type="checkbox" id="hasWelkin">
                                    <span class="wid-toggle-text">
                                        <span class="wid-toggle-name">Welkin Moon</span>
                                        <span class="wid-toggle-sub">+23 wishes / patch</span>
                                    </span>
                                    <span class="wid-toggle-val">+23</span>
                                </label>
                                <label class="wid-toggle-row">
                                    <input type="checkbox" id="hasBP">
                                    <span class="wid-toggle-text">
                                        <span class="wid-toggle-name">Battle Pass</span>
                                        <span class="wid-toggle-sub">+9 wishes / patch</span>
                                    </span>
                                    <span class="wid-toggle-val">+9</span>
                                </label>
                            </div>
                        </div>

                        <div class="wid-divider"></div>

                        <div class="wid-breakdown">
                            <div class="wid-breakdown-title wid-eyebrow accent">Estimated Average Income</div>
                            <div class="wid-breakdown-total"><span id="avgIncomeTotal">80</span><small>wishes / patch</small></div>
                            <div class="wid-breakdown-rows" id="avgIncomeBreakdownRows"></div>
                        </div>
                    </div>

                    <div class="hidden" id="customIncomeGroup"></div>

                    <div class="wid-divider"></div>

                    <div class="wid-stat-group">
                        <div class="wid-eyebrow muted">Spending Outside This Plan?</div>
                        <div class="wid-toggle-rows">
                            <label class="wid-toggle-row">
                                <input type="checkbox" id="planSpendToggle">
                                <span class="wid-toggle-text">
                                    <span class="wid-toggle-name">Planning to spend wishes outside this plan</span>
                                    <span class="wid-toggle-sub">Regular banner pulls, events you're skipping, etc.</span>
                                </span>
                            </label>
                        </div>
                        <div class="explanation">Requires a start patch. Enter how many wishes per patch you expect to spend on things outside your priority pipeline, and it'll be subtracted from your projected income.</div>
                        <div class="hidden" id="plannedSpendGroup"></div>
                    </div>
                </div>
            </div>

            <div class="wid-panel">
                <div class="wid-panel-title-row">
                    <div class="wid-panel-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle></svg>
                        Banner Statistics
                    </div>
                </div>
                <div class="wid-panel-body">
                    <div class="wid-stat-group">
                        <div class="wid-eyebrow muted">Win Costs <span class="wid-label-hint">median pulls for a 5\u2605</span></div>
                        <div class="wid-field-row">
                            <div class="form-group">
                                <label>Character</label>
                                <input type="number" id="charSoftPity" placeholder="76" min="1" max="90">
                            </div>
                            <div class="form-group">
                                <label>Weapon</label>
                                <input type="number" id="wepSoftPity" placeholder="65" min="1" max="80">
                            </div>
                        </div>
                        <div class="explanation">Assumed pulls to win the 5\u2605 (not a guarantee).</div>
                    </div>

                    <div class="wid-divider"></div>

                    <div class="wid-stat-group">
                        <div class="wid-eyebrow muted">Banner Pity <span class="wid-label-hint">since your last 5\u2605</span></div>
                        <div class="wid-field-row">
                            <div class="form-group">
                                <label>Character</label>
                                <input type="number" id="charPity" min="0" max="89" placeholder="0">
                            </div>
                            <div class="form-group">
                                <label>Weapon</label>
                                <input type="number" id="wepPity" min="0" max="69" placeholder="0">
                            </div>
                        </div>
                        <div class="explanation">Your current pity count for each banner.</div>
                    </div>

                    <div class="wid-divider"></div>

                    <div class="wid-stat-group">
                        <div class="wid-eyebrow muted">Starglitter</div>
                        <div class="form-group">
                            <label>Recovery Rate <span class="wid-label-hint">% as pulls are spent</span></label>
                            <input type="number" id="starglitterRate" placeholder="8" min="0" max="100">
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <div class="wid-summary-wrap">
            <div class="wid-summary">
                <div class="wid-summary-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.97 6.62 7.03.8-5.28 4.87 1.46 7.21L12 17.9l-6.18 3.1 1.46-7.21L2 10.92l7.03-.8z"></path></svg>
                </div>
                <div class="wid-summary-main">
                    <div class="wid-summary-label">Projected Wishes</div>
                    <div class="wid-summary-value" id="wishTotalsFinal">0</div>
                    <div class="wid-summary-desc">Total wishes across your whole planning window.</div>
                </div>
                <button type="button" id="wishTotalsToggle" class="wid-summary-toggle">Show breakdown <span class="wish-totals-chevron">\u25BE</span></button>
            </div>
            <div id="wishTotalsBody" class="wish-totals-body hidden"></div>
        </div>
    </div>

    <div class="section-card">
        <div class="section-title">Calculator Priority</div>
        <div class="explanation explanation-tight-bottom">Use \u25B2\u25BC to reorder. Assessed top-to-bottom chronologically.</div>
        <div class="priority-list-wrap">
            <div id="priorityContainer"></div>
            <div class="priority-actions">
                <button class="btn-add" id="openCreatorBtn">+ Add Target</button>
                <button class="btn-reset btn-export-import" id="exportBtn">Export Plan (.json)</button>
                <button class="btn-reset btn-export-import" id="importBtn">Import Plan (.json)</button>
                <input type="file" id="importFile" accept="application/json" class="hidden">
                <button class="btn-reset" id="resetBtn">Reset Calculator</button>
            </div>
        </div>
    </div>

    
<div class="ct-overlay hidden" id="sec-creator">
    <div class="ct-modal">
        <div class="ct-modal-header">
            <div class="ct-modal-title">Configure Target</div>
            <button type="button" class="ct-close-btn" id="closeCreatorBtn" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>

        <div class="ct-body">
            <div class="ct-card">
                <div class="ct-grid-2">
                    <div class="form-group">
                        <label>Target Type</label>
                        <div class="radio-group ct-segmented">
                            <div class="radio-btn">
                                <input type="radio" id="typeChar" name="assetType" value="character" checked="">
                                <label for="typeChar" class="radio-label">Character</label>
                            </div>
                            <div class="radio-btn">
                                <input type="radio" id="typeWeapon" name="assetType" value="weapon">
                                <label for="typeWeapon" class="radio-label">Weapon</label>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Target Name</label>
                        <div class="autocomplete-wrap ct-search-wrap">
                            <svg class="ct-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input type="text" id="assetName" class="ct-search-input" placeholder="e.g. Sandrone" autocomplete="off" maxlength="40">
                            <div class="autocomplete-list hidden" id="assetNameList"></div>
                        </div>
                        <div class="selected-asset-chip hidden" id="selectedAssetChip"></div>
                    </div>

                    <div class="form-group">
                        <label>Banner Appears In</label>
                        <div class="radio-group ct-segmented">
                            <div class="radio-btn">
                                <input type="radio" id="targetPatchCurrent" name="targetPatchMode" value="current" checked="">
                                <label class="radio-label" for="targetPatchCurrent">Current</label>
                            </div>
                            <div class="radio-btn">
                                <input type="radio" id="targetPatchLater" name="targetPatchMode" value="later">
                                <label class="radio-label" for="targetPatchLater">Later</label>
                            </div>
                        </div>
                        <div class="form-group hidden ct-later-input" id="targetPatchLaterGroup">
                            <input type="number" id="targetPatchLaterInput" placeholder="e.g. 3" min="1" max="8">
                            <div class="explanation">Patches from now (max 8). Raises "Total Patches to Plan Ahead" to match once you hit Save.</div>
                        </div>
                        <select id="targetPatch" class="hidden"><option value="0">Current Patch</option><option value="1">Next Patch</option><option value="2">2 Patches Later</option><option value="3">3 Patches Later</option><option value="4">4 Patches Later</option><option value="5">5 Patches Later</option></select>
                    </div>

                    <div class="form-group">
                        <label>Banner Half</label>
                        <div class="radio-group ct-segmented">
                            <div class="radio-btn">
                                <input type="radio" id="halfFirst" name="bannerHalf" value="first" checked="">
                                <label for="halfFirst" class="radio-label">First Half</label>
                            </div>
                            <div class="radio-btn">
                                <input type="radio" id="halfSecond" name="bannerHalf" value="second">
                                <label for="halfSecond" class="radio-label">Second Half</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="wid-toggle-rows">
                    <label class="wid-toggle-row" id="pacingCheckboxWrap">
                        <input type="checkbox" id="applyPacing" checked="">
                        <span class="wid-toggle-text">
                            <span class="wid-toggle-name">Apply first-half pacing (65%)</span>
                            <span class="wid-toggle-sub">Uncheck if you're topping up on demand instead of waiting on drip income</span>
                        </span>
                    </label>
                </div>
                <div class="explanation ct-timeline-explanation" id="timelineExplanation">Allocating base wishes + 65% of banner patch.</div>
            </div>

            <div class="ct-card">
                <div class="ct-card-title">Ownership</div>

                <div id="charOptions" class="ct-grid-2">
                    <div class="form-group">
                        <label>Currently Own</label>
                        <select id="charCurrentConst">
                            <option value="-1" selected="">Don't Own Yet</option>
                            <option value="0">C0</option>
                            <option value="1">C1</option>
                            <option value="2">C2</option>
                            <option value="3">C3</option>
                            <option value="4">C4</option>
                            <option value="5">C5</option>
                        </select>
                        <div class="explanation" id="charCopiesExplanation"></div>
                    </div>
                    <div class="form-group">
                        <label>Constellation Goal</label>
                        <select id="charConst">
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

                <div id="weaponOptions" class="ct-grid-2 hidden">
                    <div class="form-group">
                        <label>Currently Own</label>
                        <select id="weaponCurrentRefine">
                            <option value="0" selected="">Don't Own Yet</option>
                            <option value="1">R1</option>
                            <option value="2">R2</option>
                            <option value="3">R3</option>
                            <option value="4">R4</option>
                        </select>
                        <div class="explanation" id="wepCopiesExplanation"></div>
                    </div>
                    <div class="form-group">
                        <label>Refinement Goal</label>
                        <select id="weaponRefinement">
                            <option value="1" selected="">R1 (1 copy)</option>
                            <option value="2">R2 (2 copies)</option>
                            <option value="3">R3 (3 copies)</option>
                            <option value="4">R4 (4 copies)</option>
                            <option value="5">R5 (5 copies)</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="ct-card">
                <div class="ct-card-title">Planning</div>

                <div class="form-group">
                    <label>Strategy Rule</label>
                    <select id="strategyRule">
                        <option value="Hard Lock" selected="">Hard Lock</option>
                        <option value="One Shot">One Shot</option>
                        <option value="Optional">Optional</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="ct-footer">
            <button type="button" class="ct-btn ct-btn-discard" id="cancelAsset">Discard</button>
            <button type="button" class="ct-btn ct-btn-save" id="saveAsset">Save</button>
        </div>
    </div>
</div>

    
    <div class="section-card" id="sec-results">
        <div class="section-title no-bar section-title-scenarios">Scenarios</div>
        <div id="scenariosPanel">
            <div id="outputLogSpace"></div>
        </div>
    </div>
  `;
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
    const outcomeText = row.loses > 0 ? row.itemType === "weapon" ? '<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.webp" alt="Epitomized">Epitomized' : `<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.webp" alt="Guaranteed">${row.enteringGuaranteed ? "Guaranteed (W)" : "Guaranteed (L/W)"}` : row.itemType === "weapon" ? "Won 75/25" : "Won 55/45";
    const chancePct = chanceOfGetting(row);
    const chanceHtml = chancePct != null ? `<div class="log-chance">${chancePct.toFixed(1)}% chance of getting</div>` : "";
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
                    ${chanceHtml}
                    ${sgHtmlFor(row.sgRefund)}
                </div>
            </div>`;
  }
  if (row.type === "lose") {
    const remClassLose = row.remaining > 50 ? "rem-ok" : row.remaining > 0 ? "rem-low" : "rem-deficit";
    const loseReason = row.itemType === "weapon" ? "Not obtained: One Shot, not chased" : "Not obtained: guarantee carries forward";
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
  const radianceIconHtml = (early) => `<img class="radiance-icon" src="assets/data/custom_icons/Item_Intertwined_Fate.webp" alt="${early ? "Early Radiance" : "Capture Radiance"}" title="${early ? "Early Radiance: guaranteed win after 2 consecutive losses" : "Capture Radiance: guaranteed win after 3 consecutive losses"}" style="width:15px;height:15px;vertical-align:-2px;margin-right:4px;">`;
  const guaranteedIconHtml = `<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.webp" alt="Guaranteed" title="Lost the featured 50/50, then obtained it on the guaranteed next pull">`;
  const epitomizedIconHtml = `<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.webp" alt="Epitomized" title="Missed the featured weapon, gained a Fate Point: the next 5\u2605 weapon is guaranteed to be your chosen one via Epitomized Path">`;
  let ocLabel;
  if (row.capturedRadiance) {
    const isEarly = row.radianceThreshold === 2;
    ocLabel = `${radianceIconHtml(isEarly)}<span class="radiance-text">${isEarly ? "Early Radiance" : "Capture Radiance"}</span>`;
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
