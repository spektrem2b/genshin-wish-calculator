
let priorityPipeline = [];
    let draggedElementId = null;

    const currentWishesEl = document.getElementById('currentWishes');
    const currentStarglitterEl = document.getElementById('currentStarglitter');
    const wishesPerPatchEl = document.getElementById('wishesPerPatch');
    const totalPatchesEl = document.getElementById('totalPatchesPlan');
    const starglitterEl = document.getElementById('starglitterRate');
    const charSoftPityEl = document.getElementById('charSoftPity');
    const wepSoftPityEl = document.getElementById('wepSoftPity');
    const charPityEl = document.getElementById('charPity');
    const wepPityEl = document.getElementById('wepPity');

    const hasWelkinEl = document.getElementById('hasWelkin');
    const hasBPEl = document.getElementById('hasBP');

    const startPatchMajorEl = document.getElementById('startPatchMajor');
    const startPatchMinorEl = document.getElementById('startPatchMinor');

    // Genshin patch numbering: X.0 through X.7 (8 minor versions), then
    // rolls over to (X+1).0. Given a "Start Patch" (major.minor) and an
    // offset in patches-from-now, returns the resulting "major.minor"
    // string — e.g. start 7.0 + offset 2 = "7.2"; start 5.7 + offset 1 = "6.0".
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

    const debouncedStartPatchUpdate = debounce((el) => {
        renderPipeline();
        renderCustomIncomeRows();
        updateTargetPatchOptions();
        calculateForecast();
        saveState();
    }, 150);
    [startPatchMajorEl, startPatchMinorEl].forEach(el => {
        if (!el) return;
        el.addEventListener('input', () => {
            if (parseInt(el.value) > 7 && el === startPatchMinorEl) el.value = '7';
            if (parseInt(el.value) > 30 && el === startPatchMajorEl) el.value = '30';
            debouncedStartPatchUpdate(el);
        });
    });

    function updateStarglitterHint() {
        const sg = parseInt(currentStarglitterEl.value) || 0;
        const wishes = Math.floor(sg / 5);
        const hint = document.getElementById('starglitterWishCount');
        hint.textContent = wishes > 0 ? `→ ${wishes} wish${wishes !== 1 ? 'es' : ''} (+${sg % 5} leftover)` : '';
    }

    const debouncedCalculateForecast = debounce(calculateForecast, 150);

    currentStarglitterEl.addEventListener('input', () => { updateStarglitterHint(); debouncedCalculateForecast(); });
    updateStarglitterHint();

    [currentWishesEl, wishesPerPatchEl, starglitterEl, charSoftPityEl, wepSoftPityEl, charPityEl, wepPityEl].forEach(el => el.addEventListener('input', debouncedCalculateForecast));
    [hasWelkinEl, hasBPEl].forEach(el => el.addEventListener('change', calculateForecast));

    function updateTargetPatchOptions(extendTo) {
        const patchSelect = document.getElementById('targetPatch');
        const totalPatches = parseInt(totalPatchesEl.value) || 0;
        const rangeMax = typeof extendTo === 'number' ? Math.max(totalPatches, extendTo) : totalPatches;
        const currentValue = patchSelect.value;

        patchSelect.innerHTML = '';
        for(let i = 0; i <= rangeMax; i++) {
            const opt = document.createElement('option');
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
        if (typeof syncTargetPatchUIFromValue === 'function') syncTargetPatchUIFromValue();
    }

    const targetPatchSelect = document.getElementById('targetPatch');
    const targetPatchCurrentEl = document.getElementById('targetPatchCurrent');
    const targetPatchLaterEl = document.getElementById('targetPatchLater');
    const targetPatchLaterGroup = document.getElementById('targetPatchLaterGroup');
    const targetPatchLaterInput = document.getElementById('targetPatchLaterInput');

    function applyTargetPatchValue(value) {
        const v = Math.min(8, Math.max(0, value));
        updateTargetPatchOptions(v);
        targetPatchSelect.value = String(v);
        syncTargetPatchUIFromValue();
        targetPatchSelect.dispatchEvent(new Event('change'));
        calculateForecast();
        saveState();
    }

    function syncTargetPatchUIFromValue() {
        const v = parseInt(targetPatchSelect.value) || 0;
        if (v === 0) {
            targetPatchCurrentEl.checked = true;
            targetPatchLaterGroup.classList.add('hidden');
            targetPatchLaterInput.value = '';
        } else {
            targetPatchLaterEl.checked = true;
            targetPatchLaterGroup.classList.remove('hidden');
            targetPatchLaterInput.value = v;
        }
    }

    targetPatchCurrentEl.addEventListener('change', () => {
        if (targetPatchCurrentEl.checked) {
            targetPatchLaterGroup.classList.add('hidden');
            applyTargetPatchValue(0);
        }
    });

    targetPatchLaterEl.addEventListener('change', () => {
        if (targetPatchLaterEl.checked) {
            targetPatchLaterGroup.classList.remove('hidden');
            targetPatchLaterInput.focus();
            applyTargetPatchValue(parseInt(targetPatchLaterInput.value) || 1);
        }
    });

    targetPatchLaterInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (e.target.value === '' || isNaN(val)) return;
        if (val > 8) e.target.value = 8;
        else if (val < 1) e.target.value = 1;
        applyTargetPatchValue(parseInt(e.target.value));
    });

    targetPatchLaterInput.addEventListener('blur', (e) => {
        if (e.target.value === '' || isNaN(parseInt(e.target.value))) {
            e.target.value = 1;
            applyTargetPatchValue(1);
        }
    });

    totalPatchesEl.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (e.target.value === '' || isNaN(val)) return;
        if (val > 8) e.target.value = 8;
        else if (val < 0) e.target.value = 0;
        renderCustomIncomeRows();
        updateTargetPatchOptions();
        calculateForecast();
    });

    totalPatchesEl.addEventListener('blur', (e) => {
        if (e.target.value === '' || isNaN(parseInt(e.target.value))) {
            e.target.value = 0;
            renderCustomIncomeRows();
            updateTargetPatchOptions();
            calculateForecast();
        }
    });

    document.querySelectorAll('input[name="incomeMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'average') {
                document.getElementById('averageIncomeGroup').classList.remove('hidden');
                document.getElementById('customIncomeGroup').classList.add('hidden');
                document.getElementById('subscriptionsGroup').classList.remove('hidden');
            } else {
                document.getElementById('averageIncomeGroup').classList.add('hidden');
                document.getElementById('customIncomeGroup').classList.remove('hidden');
                document.getElementById('subscriptionsGroup').classList.add('hidden');
                hasWelkinEl.checked = false;
                hasBPEl.checked = false;
            }
            calculateForecast();
        });
    });

    function renderCustomIncomeRows() {
        const total = parseInt(totalPatchesEl.value) || 0;
        const container = document.getElementById('customIncomeGroup');
        container.innerHTML = '<label>Custom Base Wishes Per Patch</label>';
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
        document.querySelectorAll('.custom-val-input').forEach(inp => {
            inp.addEventListener('input', debounce(() => { calculateForecast(); saveState(); }, 150));
        });
    }
    renderCustomIncomeRows();

    function getPatchIncome(index) {
        let baseIncome = 0;
        const mode = document.querySelector('input[name="incomeMode"]:checked').value;
        if (mode === 'average') {
            baseIncome = parseInt(wishesPerPatchEl.value) || 0;
        } else {
            const el = document.querySelector(`.custom-val-input[data-index="${index}"]`);
            baseIncome = el ? parseInt(el.value) || 0 : 0;
        }
        const welkinBonus = hasWelkinEl.checked ? 23 : 0;
        const bpBonus = hasBPEl.checked ? 9 : 0;
        return baseIncome + welkinBonus + bpBonus;
    }

    document.querySelectorAll('input[name="assetType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const nameInput = document.getElementById('assetName');
            if (e.target.value === 'character') {
                document.getElementById('charOptions').classList.remove('hidden');
                document.getElementById('weaponOptions').classList.add('hidden');
                nameInput.placeholder = 'e.g. Sandrone';
            } else {
                document.getElementById('charOptions').classList.add('hidden');
                document.getElementById('weaponOptions').classList.remove('hidden');
                nameInput.placeholder = 'e.g. A Teaspoon of Transcendence';
            }
            clearSelectedAsset();
            hideAssetList();
        });
    });

    let selectedAsset = null;

    function currentAssetType() {
        return document.querySelector('input[name="assetType"]:checked').value;
    }

    function assetIconHtml(entry, sizeClass) {
        if (entry && entry.icon) {
            return `<img src="${entry.icon}" alt="">`;
        }
        return `<div class="ac-icon-placeholder">?</div>`;
    }

    function elementIconPath(element) {
        if (!element || element === 'None') return null;
        return `assets/data/element_icons/Element_${element}.svg`;
    }

    function avatarBadgeHtml(iconUrl, elementPath, size, badgeSize) {
        const avatarHtml = iconUrl
            ? `<img src="${iconUrl}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1px solid var(--border-color);display:block;">`
            : `<div class="ac-icon-placeholder" style="width:${size}px;height:${size}px;">?</div>`;
        const badgeHtml = elementPath
            ? `<img class="el-badge-icon" src="${elementPath}" alt="" style="width:${badgeSize}px;height:${badgeSize}px;">`
            : '';
        return `<span class="avatar-badge">${avatarHtml}${badgeHtml}</span>`;
    }

    function assetSubLabel(entry) {
        if (!entry) return '';
        if (entry.isCustom) return 'Custom • Unreleased';
        if (entry.element) {
            const iconPath = elementIconPath(entry.element);
            const iconHtml = iconPath ? `<img class="el-icon" src="${iconPath}" alt="">` : '';
            return `${iconHtml}${entry.element} • <span class="gold-star">5★</span>`;
        }
        if (entry.weaponType) return `${entry.weaponType} • <span class="gold-star">5★</span>`;
        return `<span class="gold-star">5★</span>`;
    }

    function hideAssetList() {
        const list = document.getElementById('assetNameList');
        list.classList.add('hidden');
        list.innerHTML = '';
    }

    function renderAssetList(query) {
        const list = document.getElementById('assetNameList');
        const type = currentAssetType();
        const results = type === 'character' ? searchGenshinCharacters(query) : searchGenshinWeapons(query);
        const trimmed = query.trim();
        const exactMatch = results.some(r => r.name.toLowerCase() === trimmed.toLowerCase());

        let html = results.slice(0, 8).map(entry => `
            <div class="autocomplete-item" data-name="${entry.name.replace(/"/g, '&quot;')}">
                ${assetIconHtml(entry)}
                <span class="ac-name">${entry.name}</span>
                <span class="ac-sub">${assetSubLabel(entry)}</span>
            </div>
        `).join('');

        if (trimmed && !exactMatch) {
            const customIcon = type === 'character'
                ? 'assets/data/custom_icons/Lumine_Placeholder_custom.webp'
                : 'assets/data/custom_icons/Weapon_Dull_Blade_custom.webp';
            html += `
                <div class="autocomplete-item ac-custom" data-custom="${trimmed.replace(/"/g, '&quot;')}">
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
        list.classList.remove('hidden');
    }

    function selectAssetByName(name) {
        const type = currentAssetType();
        const entry = type === 'character' ? getGenshinCharacter(name) : getGenshinWeapon(name);
        applySelectedAsset(entry || (type === 'character' ? makeCustomCharacter(name) : makeCustomWeapon(name)));
    }

    function selectCustomAsset(name) {
        const type = currentAssetType();
        applySelectedAsset(type === 'character' ? makeCustomCharacter(name) : makeCustomWeapon(name));
    }

    function applySelectedAsset(entry) {
        selectedAsset = entry;
        document.getElementById('assetName').value = entry.name;
        renderSelectedAssetChip();
        hideAssetList();
    }

    function clearSelectedAsset() {
        selectedAsset = null;
        const chip = document.getElementById('selectedAssetChip');
        chip.classList.add('hidden');
        chip.innerHTML = '';
    }

    function assetNameLine(entry) {
        if (!entry) return '';
        if (entry.isCustom) return `${entry.name} <span style="color: var(--text-muted); font-weight:500; font-size:0.7em;">(Custom)</span>`;
        const iconPath = elementIconPath(entry.element);
        const icon = iconPath ? `<img class="el-icon" src="${iconPath}" alt="" style="width:22px;height:22px;margin:0 2px;">` : '';
        const wepType = (!iconPath && entry.weaponType) ? `<span style="color: var(--text-muted); font-weight:500; font-size:0.6em; vertical-align:2px; margin: 0 8px 0 6px;">(${entry.weaponType})</span>` : ' ';
        return `${entry.name}${icon}${wepType}<span class="gold-star">5★</span>`;
    }

    function renderSelectedAssetChip() {
        const chip = document.getElementById('selectedAssetChip');
        if (!selectedAsset) { chip.classList.add('hidden'); chip.innerHTML = ''; return; }
        chip.innerHTML = `
            ${assetIconHtml(selectedAsset)}
            <div class="sac-name">${assetNameLine(selectedAsset)}</div>
            <button type="button" class="sac-clear" id="sacClearBtn" title="Clear selection">&times;</button>
        `;
        chip.classList.remove('hidden');
        document.getElementById('sacClearBtn').addEventListener('click', () => {
            clearSelectedAsset();
            document.getElementById('assetName').value = '';
            document.getElementById('assetName').focus();
        });
    }

    const assetNameInput = document.getElementById('assetName');

    assetNameInput.addEventListener('input', (e) => {
        if (selectedAsset && selectedAsset.name !== e.target.value) clearSelectedAsset();
        renderAssetList(e.target.value);
    });

    assetNameInput.addEventListener('focus', (e) => {
        renderAssetList(e.target.value);
    });

    document.getElementById('assetNameList').addEventListener('mousedown', (e) => {

        e.preventDefault();
        const item = e.target.closest('.autocomplete-item');
        if (!item) return;
        if (item.dataset.custom !== undefined) {
            selectCustomAsset(item.dataset.custom);
        } else if (item.dataset.name !== undefined) {
            selectAssetByName(item.dataset.name);
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrap')) hideAssetList();
    });

    function updateTimelineExplanation() {
        const pSelect = document.getElementById('targetPatch');
        const hSelect = document.querySelector('input[name="bannerHalf"]:checked');
        const pacingEl = document.getElementById('applyPacing');
        const pacingWrap = document.getElementById('pacingCheckboxWrap');
        if(!pSelect || !hSelect) return;
        const val = parseInt(pSelect.value) || 0;
        let patchLabel;
        if (val === 0) patchLabel = `current patch (${patchVersionAt(0)})`;
        else if (val === 1) patchLabel = `next patch (${patchVersionAt(1)})`;
        else patchLabel = `${val} patches from now (${patchVersionAt(val)})`;
        let text = val === 0 ? "Allocating base wishes" : `Allocating base + income through ${patchLabel}`;

        const isFirst = hSelect.value === 'first';
        if (pacingWrap) pacingWrap.classList.toggle('hidden', !isFirst);
        const usesPacing = isFirst && pacingEl && pacingEl.checked;
        text += usesPacing ? " + 65% of banner patch." : " + 100% of banner patch.";
        document.getElementById('timelineExplanation').innerText = text;
    }

    document.getElementById('targetPatch').addEventListener('change', updateTimelineExplanation);
    document.querySelectorAll('input[name="bannerHalf"]').forEach(r => r.addEventListener('change', updateTimelineExplanation));
    document.getElementById('applyPacing').addEventListener('change', updateTimelineExplanation);

    function enforceGoalFloor() {
        const charCurEl = document.getElementById('charCurrentConst');
        const charGoalEl = document.getElementById('charConst');
        if (charCurEl && charGoalEl) {
            const current = parseInt(charCurEl.value);
            const floor = Math.max(0, current + 1);
            Array.from(charGoalEl.options).forEach(opt => {
                opt.disabled = parseInt(opt.value) < floor;
            });
            if (parseInt(charGoalEl.value) < floor) charGoalEl.value = String(floor);
        }
        const wepCurEl = document.getElementById('weaponCurrentRefine');
        const wepGoalEl = document.getElementById('weaponRefinement');
        if (wepCurEl && wepGoalEl) {
            const current = parseInt(wepCurEl.value);
            const floor = Math.max(1, current + 1);
            Array.from(wepGoalEl.options).forEach(opt => {
                opt.disabled = parseInt(opt.value) < floor;
            });
            if (parseInt(wepGoalEl.value) < floor) wepGoalEl.value = String(floor);
        }
    }

    function updateCopiesExplanation() {
        enforceGoalFloor();
        const charGoalEl = document.getElementById('charConst');
        const charCurEl = document.getElementById('charCurrentConst');
        if (charGoalEl && charCurEl) {
            const goal = parseInt(charGoalEl.value);
            const current = parseInt(charCurEl.value);
            const needed = Math.max(0, goal - current);
            const el = document.getElementById('charCopiesExplanation');
            if (el) el.innerText = needed === 0 ? "Goal already met — 0 pulls needed." : `Need ${needed} more cop${needed === 1 ? 'y' : 'ies'} to go from C${current < 0 ? '(none)' : current} to C${goal}.`;
        }
        const wepGoalEl = document.getElementById('weaponRefinement');
        const wepCurEl = document.getElementById('weaponCurrentRefine');
        if (wepGoalEl && wepCurEl) {
            const goal = parseInt(wepGoalEl.value);
            const current = parseInt(wepCurEl.value);
            const needed = Math.max(0, goal - current);
            const el = document.getElementById('wepCopiesExplanation');
            if (el) el.innerText = needed === 0 ? "Goal already met — 0 pulls needed." : `Need ${needed} more cop${needed === 1 ? 'y' : 'ies'} to go from R${current < 1 ? '(none)' : current} to R${goal}.`;
        }
    }
    ['charConst', 'charCurrentConst', 'weaponRefinement', 'weaponCurrentRefine'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateCopiesExplanation);
    });

    function renderPipeline() {
        const container = document.getElementById('priorityContainer');
        container.innerHTML = '';
        priorityPipeline.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'priority-item';
            div.draggable = true;
            div.setAttribute('data-id', item.id);
            let strategyClass = item.strategy === 'Hard Lock' ? 'tag-hard-lock' : (item.strategy === 'One Shot' ? 'tag-one-shot' : 'tag-optional');
            const halfTag = item.bannerHalf === 'first' ? (item.applyPacing !== false ? '1st Half' : '1st Half, Instant') : '2nd Half';
            let meta = `${patchVersionAt(item.targetPatch)} · ${halfTag} • ${item.type === 'character' ? item.constellation : 'R' + (item.refinement || 1)}`;
            const isEnabled = item.enabled !== false;
            if (!isEnabled) div.classList.add('disabled-item');
            const iconHtml = avatarBadgeHtml(item.icon, elementIconPath(item.element), 52, 20);
            div.innerHTML = `
                <div class="drag-handle">⋮⋮</div>
                ${iconHtml}
                <div class="item-details">
                    <div class="item-name">${item.name} <span class="item-tag ${strategyClass}">${item.strategy}</span></div>
                    <div class="item-meta">${meta}</div>
                </div>
                <div class="item-actions">
                    <div class="reorder-btns">
                        <button class="reorder-btn" title="Move up" onclick="movePipelineItem('${item.id}', -1)">▲</button>
                        <button class="reorder-btn" title="Move down" onclick="movePipelineItem('${item.id}', 1)">▼</button>
                    </div>
                    <button class="toggle-btn ${isEnabled ? 'enabled' : ''}" title="${isEnabled ? 'Disable' : 'Enable'}" onclick="togglePipelineItem('${item.id}')">${isEnabled ? '●' : '○'}</button>
                    <button class="edit-btn" onclick="editPipelineItem('${item.id}')">✏️</button>
                    <button class="delete-btn" onclick="removePipelineItem('${item.id}')">&times;</button>
                </div>
            `;
            div.addEventListener('dragstart', (e) => { draggedElementId = item.id; });
            div.addEventListener('dragover', (e) => e.preventDefault());
            div.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetId = div.getAttribute('data-id');
                if (draggedElementId !== targetId) {
                    const dragIdx = priorityPipeline.findIndex(x => x.id === draggedElementId);
                    const dropIdx = priorityPipeline.findIndex(x => x.id === targetId);
                    const temp = priorityPipeline[dragIdx];
                    priorityPipeline.splice(dragIdx, 1);
                    priorityPipeline.splice(dropIdx, 0, temp);
                    pipelineUpdated();
                }
            });
            container.appendChild(div);
        });
    }

    function removePipelineItem(id) {
        priorityPipeline = priorityPipeline.filter(x => x.id !== id);
        pipelineUpdated();
    }

    function movePipelineItem(id, direction) {
        const idx = priorityPipeline.findIndex(x => x.id === id);
        if (idx === -1) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= priorityPipeline.length) return;
        const temp = priorityPipeline[idx];
        priorityPipeline.splice(idx, 1);
        priorityPipeline.splice(newIdx, 0, temp);
        pipelineUpdated();
    }

    function togglePipelineItem(id) {
        const item = priorityPipeline.find(x => x.id === id);
        if (!item) return;
        item.enabled = item.enabled === false ? true : false;
        pipelineUpdated();
    }

    let editingId = null;

    function editPipelineItem(id) {
        const item = priorityPipeline.find(x => x.id === id);
        if (!item) return;
        editingId = id;
        updateTargetPatchOptions();

        document.querySelector(`input[name="assetType"][value="${item.type}"]`).checked = true;
        document.getElementById('charOptions').classList.toggle('hidden', item.type !== 'character');
        document.getElementById('weaponOptions').classList.toggle('hidden', item.type !== 'weapon');
        document.getElementById('assetName').placeholder = item.type === 'character' ? 'e.g. Sandrone' : 'e.g. A Teaspoon of Transcendence';

        document.getElementById('assetName').value = item.name;
        hideAssetList();
        applySelectedAsset({
            name: item.name,
            rarity: 5,
            element: item.element || null,
            weaponType: item.weaponType || null,
            icon: item.icon || null,
            isCustom: item.isCustom !== false && !item.icon
        });

        document.getElementById('targetPatch').value = item.targetPatch;
        syncTargetPatchUIFromValue();

        document.querySelector(`input[name="bannerHalf"][value="${item.bannerHalf}"]`).checked = true;
        document.getElementById('applyPacing').checked = item.applyPacing !== false;
        updateTimelineExplanation();

        document.getElementById('strategyRule').value = item.strategy;

        if (item.type === 'character') {
            document.getElementById('charConst').value = item.constellation.replace('C', '');
            document.getElementById('charCurrentConst').value = (item.currentConst !== undefined) ? item.currentConst : -1;
            document.querySelector(`input[name="charGuar"][value="${item.guaranteed}"]`).checked = true;
        } else {
            document.getElementById('weaponRefinement').value = item.refinement || 1;
            document.getElementById('weaponCurrentRefine').value = (item.currentRefine !== undefined) ? item.currentRefine : 0;
            document.querySelector(`input[name="wepGuar"][value="${item.guaranteed || 'no'}"]`).checked = true;
        }

        updateTimelineExplanation();
        updateCopiesExplanation();
        document.getElementById('sec-creator').classList.remove('hidden');
        document.getElementById('openCreatorBtn').classList.add('hidden');
        document.getElementById('saveAsset').textContent = 'Update';
        document.getElementById('sec-creator').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('openCreatorBtn').addEventListener('click', () => {
        updateTargetPatchOptions();
        document.getElementById('sec-creator').classList.remove('hidden');
        document.getElementById('openCreatorBtn').classList.add('hidden');
        document.getElementById('sec-creator').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('cancelAsset').addEventListener('click', (e) => { e.preventDefault(); closeCreator(); });

    document.getElementById('saveAsset').addEventListener('click', (e) => {
        e.preventDefault();
        const type = document.querySelector('input[name="assetType"]:checked').value;
        const typedName = document.getElementById('assetName').value.trim() || (type === 'character' ? 'Sandrone' : 'A Teaspoon of Transcendence');

        let resolved = (selectedAsset && selectedAsset.name === typedName) ? selectedAsset : null;
        if (!resolved) {
            resolved = type === 'character' ? getGenshinCharacter(typedName) : getGenshinWeapon(typedName);
            if (!resolved) resolved = type === 'character' ? makeCustomCharacter(typedName) : makeCustomWeapon(typedName);
        }
        const name = resolved.name;
        const strategy = document.getElementById('strategyRule').value;
        const chosenTargetPatch = parseInt(document.getElementById('targetPatch').value) || 0;
        if (chosenTargetPatch > (parseInt(totalPatchesEl.value) || 0)) {
            totalPatchesEl.value = chosenTargetPatch;
            renderCustomIncomeRows();
            updateTargetPatchOptions();
        }
        let item = {
            id: editingId || Date.now().toString(), type, name, strategy,
            icon: resolved.icon || null,
            element: resolved.element || null,
            weaponType: resolved.weaponType || null,
            isCustom: !!resolved.isCustom,
            targetPatch: chosenTargetPatch,
            bannerHalf: document.querySelector('input[name="bannerHalf"]:checked').value,
            applyPacing: document.getElementById('applyPacing').checked
        };
        if (type === 'character') {
            const goal = parseInt(document.getElementById('charConst').value);
            const current = parseInt(document.getElementById('charCurrentConst').value);
            item.constellation = 'C' + goal;
            item.currentConst = current;
            item.copies = Math.max(0, goal - current);
            item.guaranteed = document.querySelector('input[name="charGuar"]:checked').value;
        } else {
            const goal = parseInt(document.getElementById('weaponRefinement').value);
            const current = parseInt(document.getElementById('weaponCurrentRefine').value);
            item.refinement = goal;
            item.currentRefine = current;
            item.copies = Math.max(0, goal - current);
            item.guaranteed = document.querySelector('input[name="wepGuar"]:checked').value;
        }
        if (editingId) {
            const idx = priorityPipeline.findIndex(x => x.id === editingId);
            if (idx !== -1) priorityPipeline[idx] = item;
        } else {
            priorityPipeline.push(item);
        }
        closeCreator();
        pipelineUpdated();
    });

    function closeCreator() {
        editingId = null;
        document.getElementById('sec-creator').classList.add('hidden');
        document.getElementById('openCreatorBtn').classList.remove('hidden');
        document.getElementById('assetName').value = '';
        document.getElementById('saveAsset').textContent = 'Save';
        clearSelectedAsset();
        hideAssetList();
    }

    let wishTotalsExpanded = false;
    function renderWishTotals() {
        const finalEl = document.getElementById('wishTotalsFinal');
        const bodyEl = document.getElementById('wishTotalsBody');
        if (!finalEl || !bodyEl) return;
        const baseWishes = (parseInt(currentWishesEl.value) || 0) + Math.floor((parseInt(currentStarglitterEl.value) || 0) / 5);
        const totalPatches = Math.max(0, Math.min(8, parseInt(totalPatchesEl.value) || 0));

        let rows = '';

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
        bodyEl.classList.toggle('hidden', !wishTotalsExpanded);
    }

    const wishTotalsToggleEl = document.getElementById('wishTotalsToggle');
    if (wishTotalsToggleEl) {
        const wishTotalsToggleLabel = wishTotalsToggleEl.firstChild;
        wishTotalsToggleEl.addEventListener('click', () => {
            wishTotalsExpanded = !wishTotalsExpanded;
            wishTotalsToggleEl.classList.toggle('expanded', wishTotalsExpanded);
            wishTotalsToggleLabel.textContent = wishTotalsExpanded ? 'Hide breakdown ' : 'Show breakdown ';
            document.getElementById('wishTotalsBody').classList.toggle('hidden', !wishTotalsExpanded);
        });
    }

    function calculateForecast() {
        renderWishTotals();
        const baseWishes = (parseInt(currentWishesEl.value) || 0) + Math.floor((parseInt(currentStarglitterEl.value) || 0) / 5);
        const sgRate = (parseInt(starglitterEl.value) || 8) / 100;
        const outputSpace = document.getElementById('outputLogSpace');
        if (priorityPipeline.length === 0 || priorityPipeline.every(x => x.enabled === false)) {
            outputSpace.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px 0;">Add targets to see scenarios.</div>';
            return;
        }

        outputSpace.innerHTML = '';
        const scenarios = [
            { key: 'best', title: '🟢 BEST — everything wins' },
            { key: 'ok', title: '🟡 OK — mixed luck, no disasters' },
            { key: 'worst', title: '🔴 WORST — but Hard Locks always safe' }
        ];

        function getIncomeCeiling(item) {
            let income = baseWishes;
            for (let i = 0; i < item.targetPatch; i++) { income += getPatchIncome(i); }
            const patchIncome = getPatchIncome(item.targetPatch);
            const usesPacing = item.bannerHalf === 'first' && item.applyPacing !== false;
            income += usesPacing ? Math.floor(patchIncome * 0.65) : patchIncome;
            return income;
        }

        function effectiveCost(rawCost) {
            const refund = Math.floor(rawCost * sgRate);
            return rawCost - refund;
        }

        function getRawCost(item, loses, isFirstChar, isFirstWep) {
            const copies = item.copies !== undefined ? item.copies : 1;
            if (copies <= 0) return 0;
            const charWin = parseInt(charSoftPityEl.value) || 76;
            const wepWin = parseInt(wepSoftPityEl.value) || 65;
            if (item.type === 'character') {
                // Post-expansion, a character entry is always exactly one
                // copy/pull. A guaranteed win only comes from a pre-existing
                // guarantee (item.guaranteed === 'yes', first copy only) —
                // base pity cost, no doubling. Every other copy is its own
                // independent 50/50, loss or no loss.
                const pitySaved = isFirstChar ? Math.min(parseInt(charPityEl.value) || 0, charWin - 1) : 0;
                if (item.strategy === 'One Shot') return Math.max(1, charWin - pitySaved);

                const guaranteed = item.guaranteed === 'yes';
                const cost = guaranteed ? charWin : charWin * (loses > 0 ? 2 : 1);
                return Math.max(1, cost - pitySaved);
            } else {
                const pitySaved = isFirstWep ? Math.min(parseInt(wepPityEl.value) || 0, wepWin - 1) : 0;
                if (item.strategy === 'One Shot') return Math.max(1, wepWin - pitySaved);

                const loseCount = Math.min(loses, 1);
                const firstCopyCost = (item.guaranteed === 'yes') ? wepWin : wepWin * (loseCount + 1);
                const firstCopy = firstCopyCost - pitySaved;
                const restCopyCost = loseCount > 0 ? wepWin * (loseCount + 1) : wepWin;
                return firstCopy + (copies - 1) * restCopyCost;
            }
        }

        function getOutcome(item, loses) {
            const label = item.type === 'character' ? item.constellation : 'R' + (item.refinement || 1);
            if (item.strategy === 'One Shot') return loses > 0 ? 'lose (stop)' : `win ${label}`;
            return loses > 0 ? `lose→win ${label}` : `win ${label}`;
        }

        function runScenario(losePattern) {
            let totalSpent = 0;
            let rows = [];
            let skipRemaining = false;
            let failed = false;
            let isFirstChar = true;
            let isFirstWep = true;
            const radianceIndices = losePattern.radianceIndices || new Set();
            const enabledItems = expandPipeline(priorityPipeline.filter(x => x.enabled !== false));

            enabledItems.forEach((item, idx) => {
                const incomeCeiling = getIncomeCeiling(item);
                const currentPool = incomeCeiling - totalSpent;
                const loses = losePattern[idx] || 0;
                const capturedRadiance = radianceIndices.has(idx);
                const label = item.type === 'character' ? item.constellation : 'R' + (item.refinement || 1);
                const patchLabel = patchVersionAt(item.targetPatch);
                const halfLabel = item.bannerHalf === 'first' ? (item.applyPacing !== false ? '1st Half' : '1st Half, Instant') : '2nd Half';
                const timing = `${patchLabel} · ${halfLabel}`;

                if (skipRemaining) {
                    rows.push({ type: 'skip', itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, reason: 'One Shot stopped here' });
                    return;
                }

                if (loses === -1) {
                    // Optional target deprioritized in this scenario's story —
                    // not attempted at all, no wishes spent.
                    rows.push({ type: 'skip', itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, reason: 'Skipped — Optional, deprioritized to protect Hard Lock targets', remaining: Math.max(0, currentPool) });
                    return;
                }

                const rawCost = getRawCost(item, loses, isFirstChar, isFirstWep);
                if (item.type === 'character') isFirstChar = false;
                else isFirstWep = false;
                const cost = effectiveCost(rawCost);
                const sgRefund = rawCost - cost;

                if (currentPool >= cost) {
                    totalSpent += cost;
                    const remaining = currentPool - cost;
                    rows.push({ type: loses > 0 ? 'lose-win' : 'win', itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, loses, capturedRadiance, rawCost, cost, sgRefund, remaining });
                } else {
                    if (item.strategy === 'Hard Lock') {
                        // Must-have target that can't be afforded — this really is a
                        // failure. Record the deficit and fail the scenario.
                        totalSpent += cost;
                        failed = true;
                        const deficit = incomeCeiling - totalSpent;
                        rows.push({ type: 'deficit', itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, loses, rawCost, cost, sgRefund, deficit });
                    } else if (item.strategy === 'One Shot') {
                        rows.push({ type: 'skip', itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, reason: 'Not enough wishes — One Shot skipped', remaining: Math.max(0, currentPool) });
                        skipRemaining = true;
                    } else {
                        // Optional target — by design, dropping it isn't a failure.
                        rows.push({ type: 'skip', itemType: item.type, name: item.name, icon: item.icon, element: item.element, label, timing, strategy: item.strategy, reason: 'Not enough wishes — skipped (Optional)', remaining: Math.max(0, currentPool) });
                    }
                }
            });

            return { rows, failed };
        }

        function renderRow(row) {
            const rowIcon = avatarBadgeHtml(row.icon, elementIconPath(row.element), 44, 17);
            if (row.type === 'skip') {
                return `<div class="log-row row-skip">
                    ${rowIcon}
                    <div>
                        <div class="log-name">${row.name} <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem;">${row.label}</span></div>
                        <div class="log-name-sub">${row.timing} · ${row.reason}</div>
                    </div>
                    <div class="log-outcome oc-skip">SKIPPED</div>
                    <div class="log-right">
                        ${row.remaining != null ? `<div class="log-remaining rem-ok">${row.remaining} left</div>` : ''}
                    </div>
                </div>`;
            }
            if (row.type === 'deficit') {
                const sgHtml = (row.sgRefund > 0) ? `<div class="log-sg">~${row.sgRefund} wishes back via Starglitter</div>` : '';
                return `<div class="log-row row-deficit">
                    ${rowIcon}
                    <div>
                        <div class="log-name">${row.name} <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem;">${row.label}</span></div>
                        <div class="log-name-sub">${row.timing} · ${row.loses > 0 ? '<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Guaranteed">Guaranteed' : (row.itemType === 'weapon' ? 'Won 75/25' : 'Won 55/45')} · ${row.strategy}</div>
                    </div>
                    <div class="log-outcome oc-deficit">DEFICIT</div>
                    <div class="log-right">
                        <div class="log-pulls">${row.rawCost} pulls${row.cost < row.rawCost ? ` · ${row.cost} net` : ''}</div>
                        ${sgHtml}
                        <div class="log-remaining rem-deficit">${row.deficit} wishes short</div>
                    </div>
                </div>`;
            }

            const rowClass = row.type === 'lose-win' ? 'row-lose-win' : 'row-win';
            const ocClass = row.type === 'lose-win' ? 'oc-guaranteed' : (row.capturedRadiance ? 'oc-radiance' : 'oc-win');
            const isWep = row.itemType === 'weapon';
            const radianceIconHtml = `<img class="radiance-icon" src="assets/data/custom_icons/Item_Intertwined_Fate.webp" alt="Capture Radiance" title="Capture Radiance — guaranteed win after 2 consecutive losses" style="width:15px;height:15px;vertical-align:-2px;margin-right:4px;">`;
            const guaranteedIconHtml = `<img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Guaranteed" title="Lost the featured 50/50, then obtained it on the guaranteed next pull">`;
            let ocLabel;
            if (row.capturedRadiance) {
                ocLabel = `${radianceIconHtml}<span class="radiance-text">Capture Radiance</span>`;
            } else if (row.loses > 0) {
                // Not a real loss — the featured item still ends up in your
                // inventory, just via the guaranteed-next-pull mechanic
                // after losing the coin flip once.
                ocLabel = `${guaranteedIconHtml}Guaranteed`;
            } else {
                ocLabel = isWep ? 'Won 75/25' : 'Won 55/45';

            }
            const sgHtml = (row.sgRefund > 0) ? `<div class="log-sg">~${row.sgRefund} wishes back via Starglitter</div>` : '';
            const remClass = row.remaining > 50 ? 'rem-ok' : row.remaining > 0 ? 'rem-low' : 'rem-deficit';
            return `<div class="log-row ${rowClass}">
                ${rowIcon}
                <div>
                    <div class="log-name">${row.name} <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem;">${row.label}</span></div>
                    <div class="log-name-sub">${row.timing} · ${row.strategy}</div>
                </div>
                <div class="log-outcome ${ocClass}" style="${row.capturedRadiance ? 'display:flex;align-items:center;' : ''}">${ocLabel}</div>
                <div class="log-right">
                    <div class="log-pulls">${row.rawCost} pulls${row.cost < row.rawCost ? ` · ${row.cost} net` : ''}</div>
                    ${sgHtml}
                    <div class="log-remaining ${remClass}">${row.remaining} left</div>
                </div>
            </div>`;
        }

        const n = priorityPipeline.length;
        const enabledPipeline = priorityPipeline.filter(x => x.enabled !== false);
        const ne = enabledPipeline.length;

        // ep = the per-copy expanded pipeline. Every scenario pattern below
        // is an array over ep (not enabledPipeline) — a C2 target occupies
        // TWO slots ("Tsaritsa C1", "Tsaritsa C2"), each with its own
        // genuine win/lose roll and Capture Radiance eligibility, instead
        // of one shared flag for the target.
        const ep = expandPipeline(enabledPipeline);
        const nep = ep.length;

        // groups: maps each ORIGINAL pipeline item back to the indices it
        // occupies in ep, so the scenario-picking logic below ("first
        // target", "last target", "priciest target"...) can still reason at
        // target granularity while the pattern itself operates per copy.
        const groups = enabledPipeline.map(item => {
            const idxs = [];
            ep.forEach((e, i) => {
                if (item.type === 'character' ? e._sourceId === item.id : e === item) idxs.push(i);
            });
            return { item, idxs };
        }).filter(g => g.idxs.length > 0); // drop targets already at goal (0 copies needed)

        const bestPattern = new Array(nep).fill(0);

        // Worst Case story: Hard Lock and One Shot targets are things you're
        // always actually pulling for, so they genuinely can lose. Optional
        // targets are discretionary — a player already having bad luck on
        // their real priorities would rationally skip an Optional pull
        // rather than gamble away wishes needed for what's actually locked
        // in. So Optional items get a skip sentinel (-1) here instead of a
        // forced loss (1): they're left alone entirely, not attempted.
        // Marking EVERY copy of a Hard Lock/One Shot target as "attempted
        // loss" is intentional here too — Capture Radiance below can still
        // force a win on the banner-wide 3-in-a-row streak, but each copy
        // is otherwise its own independent 50/50, loss or no loss.
        const worstPattern = resolvePattern(
            ep.map(item => {
                if (item.type === 'character' && item.strategy !== 'Hard Lock' && item.strategy !== 'One Shot') {
                    return -1; // skip sentinel — Optional, not attempted in Worst Case
                }
                return 1;
            }),
            ep
        );

        const okScenarios = [];

        if (groups.length >= 2) {
            const p = new Array(nep).fill(0);
            p[groups[0].idxs[0]] = 1;
            okScenarios.push({ title: '🟡 OK-A — first target loses once, rest win', short: 'OK-A', pattern: resolvePattern(p, ep) });
        }

        if (groups.length >= 2) {
            const p = new Array(nep).fill(0);
            p[groups[groups.length - 1].idxs[0]] = 1;
            okScenarios.push({ title: '🟡 OK-B — last target loses once, rest win', short: 'OK-B', pattern: resolvePattern(p, ep) });
        }

        if (groups.length >= 3) {
            const p = new Array(nep).fill(0);
            groups.forEach((g, i) => { if (i % 2 === 1) p[g.idxs[0]] = 1; });
            okScenarios.push({ title: '🟡 OK-C — alternating (every other loses once)', short: 'OK-C', pattern: resolvePattern(p, ep) });
        }

        const hasWeapon = groups.some(g => g.item.type === 'weapon');
        if (hasWeapon && groups.length >= 2) {
            const p = new Array(nep).fill(0);
            groups.forEach(g => { if (g.item.type === 'weapon') g.idxs.forEach(i => { p[i] = 1; }); });
            okScenarios.push({ title: '🟠 OK-D — weapon(s) hit fate point (lose→guaranteed), chars win', short: 'OK-D', pattern: resolvePattern(p, ep) });
        }

        // OK-E: losses cluster at the tail of the pipeline instead of the
        // start. Capture Radiance only ever saves the NEXT eligible pull
        // after 2 consecutive losses — if those 2 losses are your last two
        // real (Hard Lock / One Shot) targets' FINAL copy, there's no
        // later item left in this plan to receive the guaranteed win (and
        // no next copy of that same target either, so the guarantee
        // cascade can't save it here either — this is the genuinely worst
        // possible timing). It doesn't vanish (it'll trigger on some future
        // pull outside this plan), but within THIS plan you eat the full
        // double cost on both with no offsetting save.
        {
            const eligibleGroups = groups.filter(g => g.item.type === 'character' && (g.item.strategy === 'Hard Lock' || g.item.strategy === 'One Shot'));
            if (eligibleGroups.length >= 2) {
                const p = new Array(nep).fill(0);
                const lastTwo = eligibleGroups.slice(-2);
                lastTwo.forEach(g => { p[g.idxs[g.idxs.length - 1]] = 1; });
                okScenarios.push({
                    title: '🟣 OK-E — losses land at the very end (no target left for radiance to save)',
                    short: 'OK-E',
                    pattern: resolvePattern(p, ep)
                });
            }
        }

        // OK-F: isolate the single most expensive real target — now judged
        // directly by how many copies it needs (item.copies), not a regex
        // guess at constellation depth — losing its FIRST copy's 50/50,
        // with everything else in the plan winning clean. This answers a
        // different question than OK-E: not "what if bad luck clusters",
        // but "how much does just my single biggest gamble hurt on its own."
        {
            const eligibleGroups = groups.filter(g => g.item.type === 'character' && (g.item.strategy === 'Hard Lock' || g.item.strategy === 'One Shot'));
            if (eligibleGroups.length >= 1) {
                const priciest = eligibleGroups.reduce((a, b) => ((b.item.copies || 1) > (a.item.copies || 1) ? b : a), eligibleGroups[0]);
                const p = new Array(nep).fill(0);
                p[priciest.idxs[0]] = 1;
                okScenarios.push({
                    title: `🔵 OK-F — only your priciest target (${priciest.item.name}) loses, everything else clean`,
                    short: 'OK-F',
                    pattern: resolvePattern(p, ep)
                });
            }
        }

        const allScenarios = [
            { title: '🟢 BEST — everyone wins (55/45 chars, 75/25 weapons)', short: 'Best', pattern: bestPattern },
            { title: '🔴 WORST — everyone loses (55/45 chars, 75/25 weapons)', short: 'Worst', pattern: worstPattern },
            ...okScenarios,
        ];

        // Run every scenario once, keep both the detail rows and a compact summary.
        const results = allScenarios.map(scen => {
            const { rows, failed } = runScenario(scen.pattern);
            let net = 0;
            if (failed) {
                // Use the LAST deficit row: the sim keeps running after a Hard Lock
                // comes up short, so later items can look "fine" again even though
                // the plan already failed. The last deficit is the true final shortfall.
                for (let i = rows.length - 1; i >= 0; i--) {
                    if (rows[i].type === 'deficit') { net = rows[i].deficit; break; }
                }
            } else {
                for (let i = rows.length - 1; i >= 0; i--) {
                    if (rows[i].remaining != null) { net = rows[i].remaining; break; }
                }
            }
            return { ...scen, rows, failed, net };
        });

        const odds = computeScenarioOdds(ep);

        outputSpace.innerHTML += renderScenarioSummary(results, ep, odds);

        let gridHtml = '<div class="scenario-grid">';
        results.forEach(res => {
            const rowsHtml = res.rows.map(renderRow).join('');
            const summaryClass = res.failed ? 'sum-fail' : 'sum-ok';
            const summaryText = res.failed ? '❌ Requires more wishes' : '✅ Plan is viable';
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
        gridHtml += '</div>';
        outputSpace.innerHTML += gridHtml;
    }

    // Real per-target win probability the rest of the tool already assumes:
    // characters resolve their 50/50 (or lose→guaranteed) at 55/45, weapons'
    // Epitomized Path resolves at 75/25. This is the same constant already
    // shown in the scenario labels ("Won 55/45", "Lost 75/25", "Guaranteed" etc).
    // Capture Radiance: on the character (limited) banner, you cannot lose
    // your 50/50 three times in a row — after 2 consecutive losses, the
    // next character 50/50 is a guaranteed win. This does NOT apply to
    // weapons (Epitomized Path is a separate fate-point system already
    // handled via item.guaranteed), so only character-type slots are
    // capped here.
    //
    // Transparency to the streak is decided per-scenario, not by strategy
    // label: a target is only skipped over if THIS scenario's pattern
    // actually didn't attempt it (-1) — e.g. an Optional target dropped in
    // Worst Case. If a target WAS attempted, win or lose, it's a real pull
    // with a real outcome and counts fully toward the streak, whether it's
    // Hard Lock, One Shot, or Optional — the game's pity system doesn't
    // know or care about your planning labels, only whether a pull
    // actually happened.
    // Splits a multi-copy character target (e.g. "Tsaritsa C2" with 2 copies
    // needed) into one entry per copy — "Tsaritsa C1", "Tsaritsa C2" — each
    // getting its own genuine 50/50 roll and its own Capture Radiance
    // eligibility, instead of one shared win/lose flag standing in for the
    // whole target. Weapon copies stay bundled: Epitomized Path's fate-point
    // system and Capture Radiance are character-only mechanics, so splitting
    // weapon copies wouldn't add accuracy.
    function expandPipeline(pipeline) {
        const expanded = [];
        pipeline.forEach(item => {
            if (item.type !== 'character') { expanded.push(item); return; }
            const copies = item.copies !== undefined ? item.copies : 1;
            if (copies <= 0) return; // already at goal — nothing to pull
            const goalC = parseInt((item.constellation || 'C0').replace('C', '')) || 0;
            const startConst = item.currentConst !== undefined ? item.currentConst : (goalC - copies);
            for (let i = 0; i < copies; i++) {
                expanded.push({
                    ...item,
                    copies: 1,
                    _sourceId: item.id,
                    _copyIndex: i,
                    _totalCopies: copies,
                    constellation: 'C' + (startConst + i + 1),
                    // A pre-existing guarantee (player already lost a 50/50
                    // before starting this plan) only ever applies to the
                    // very first copy of a target — later copies get their
                    // guarantee (if any) from the cascade rule below instead.
                    guaranteed: i === 0 ? item.guaranteed : 'no'
                });
            }
        });
        return expanded;
    }

    // Resolves a raw "attempted loss" pattern (over the expanded, per-copy
    // pipeline) into what actually happens: banner-wide Capture Radiance
    // applied to whatever the pattern says.
    function resolvePattern(rawPattern, expandedPipeline) {
        return applyCaptureRadiance(rawPattern, expandedPipeline);
    }

    function applyCaptureRadiance(pattern, pipeline) {
        const result = [...pattern];
        const radianceIndices = new Set();
        let consecutiveCharLosses = 0;
        for (let i = 0; i < pipeline.length; i++) {
            const item = pipeline[i];
            if (item.type !== 'character') continue;

            // Only a target genuinely NOT attempted this scenario (-1) is
            // transparent to the streak — that's a real "no pull happened,"
            // so it can neither build nor break the streak, and can't
            // receive a forced win it was never in line for. A target that
            // WAS attempted — win or lose, Optional or not — is a real
            // pull with a real outcome in this story, so it counts fully:
            // a win here resets the streak exactly like a Hard Lock win
            // would, and a loss builds it. Strategy label is a planning
            // concept, not something the game's pity system knows about.
            if (result[i] === -1) continue;

            if (consecutiveCharLosses >= 2) {
                // Forced win: Capture Radiance overrides whatever the
                // pattern said for this slot.
                result[i] = 0;
                radianceIndices.add(i);
                consecutiveCharLosses = 0;
            } else if (result[i] > 0) {
                consecutiveCharLosses++;
            } else {
                consecutiveCharLosses = 0;
            }
        }
        result.radianceIndices = radianceIndices;
        return result;
    }

    function itemWinProb(item) {
        return item.type === 'weapon' ? 0.75 : 0.55;
    }

    // Best  = probability of the single "everyone wins clean" branch.
    // Worst = probability of the single "everyone loses their 50/50" branch.
    // Mixed = everything in between (some win, some lose) — the detailed
    // combinations of that live in the OK-A/B/C/D scenario cards and table
    // below, so this stat just needs to say how likely "some mix" is overall.
    function computeScenarioOdds(ep) {
        const nep = ep.length;
        if (nep === 0) return { bestPct: 100, mixedPct: 0, worstPct: 0 };

        // Best-case probability is unaffected: everyone winning their first
        // 50/50 doesn't touch Capture Radiance at all. ep is already
        // per-copy, so a C2 target correctly contributes two independent
        // rolls here instead of being counted once.
        let best = 1;
        ep.forEach(item => {
            best *= itemWinProb(item);
        });

        // Worst-case probability must follow the actual Capture-Radiance-
        // capped, Optional-skipping pattern used in the scenario cards
        // themselves:
        // - Hard Lock / One Shot copies can genuinely lose: probability (1 - p).
        // - Optional items are skipped entirely in this story: no coin flip
        //   happens, so they contribute probability 1 (certainty), not (1-p).
        // - A forced win (banner-wide Capture Radiance) also contributes
        //   probability p (its normal win chance), not (1-p), since it
        //   isn't a real flip.
        const worstRawPattern = ep.map(item => {
            if (item.type === 'character' && item.strategy !== 'Hard Lock' && item.strategy !== 'One Shot') {
                return -1;
            }
            return 1;
        });
        const worstPattern = resolvePattern(worstRawPattern, ep);
        let worst = 1;
        ep.forEach((item, i) => {
            const p = itemWinProb(item);
            if (worstPattern[i] === -1) {
                worst *= 1; // skipped — not a coin flip, certain by construction
            } else {
                worst *= worstPattern[i] > 0 ? (1 - p) : p;
            }
        });

        const mixed = Math.max(0, 1 - best - worst);
        return { bestPct: best * 100, mixedPct: mixed * 100, worstPct: worst * 100 };
    }

    function formatChance(pct, showOneIn) {
        if (pct <= 0) return '0%';
        if (pct >= 99.995) return '100%';
        const str = pct >= 10 ? pct.toFixed(1) : pct.toFixed(2);
        // "1 in N" only reads naturally for rare-ish events — above that it's
        // just a confusing way to say "roughly half" or "roughly a third".
        if (!showOneIn || pct >= 20) return `${str}%`;
        const oneIn = Math.round(100 / pct);
        return oneIn > 1 ? `${str}% (1 in ${oneIn})` : `${str}%`;
    }

    function renderScenarioSummary(results, ep, odds) {
        const best = results.reduce((a, b) => (b.net > a.net ? b : a), results[0]);
        const worst = results.reduce((a, b) => (b.net < a.net ? b : a), results[0]);

        const bestLabel = best.net >= 0 ? `${best.net} wishes left` : `${Math.abs(best.net)} wishes short`;
        const worstLabel = worst.net >= 0 ? `${worst.net} wishes left` : `${Math.abs(worst.net)} wishes short`;

        const dotClass = { 'Best': 'scen-dot-best', 'Worst': 'scen-dot-worst' };
        const scenDot = r => dotClass[r.short] || (r.short === 'OK-D' ? 'scen-dot-okd' : (r.short === 'OK-E' ? 'scen-dot-oke' : (r.short === 'OK-F' ? 'scen-dot-okf' : 'scen-dot-ok')));

        const headerCells = results.map(r => `
            <th class="scen-item-cell"><span class="scen-dot ${scenDot(r)}"></span>${r.short}</th>
        `).join('');

        const bodyRows = ep.map((item, idx) => {
            const label = item.type === 'character' ? item.constellation : 'R' + (item.refinement || 1);
            const cells = results.map(r => {
                const row = r.rows[idx];
                if (!row || row.type === 'skip') {
                    return `<td class="scen-item-cell"><span class="scen-item-mark scen-item-na">—</span></td>`;
                }
                if (row.type === 'deficit') {
                    return `<td class="scen-item-cell"><span class="scen-item-mark scen-item-short">⛔ Short</span></td>`;
                }
                const guaranteed = row.loses > 0;
                if (row.capturedRadiance) {
                    return `<td class="scen-item-cell">
                        <span class="scen-item-mark scen-item-radiance" style="display:inline-flex;align-items:center;gap:5px;" title="Capture Radiance — guaranteed win after 2 consecutive losses">
                            <img class="radiance-icon" src="assets/data/custom_icons/Item_Intertwined_Fate.webp" alt="Capture Radiance" style="width:14px;height:14px;">
                            <span class="radiance-text">Radiance</span>
                        </span>
                    </td>`;
                }
                if (guaranteed) {
                    return `<td class="scen-item-cell">
                        <span class="scen-item-mark scen-item-guaranteed" title="Lost the featured 50/50, then obtained it on the guaranteed next pull">
                            <img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Guaranteed">Guaranteed
                        </span>
                    </td>`;
                }
                return `<td class="scen-item-cell">
                    <span class="scen-item-mark scen-item-win">✅ Win</span>
                </td>`;
            }).join('');

            // Consecutive copies of the same character target (same
            // _sourceId, produced back-to-back by expandPipeline) are
            // grouped under one name+patch header row — only the
            // constellation label repeats on the follow-up rows, with a
            // touch of extra spacing above the group to separate it from
            // the previous target.
            const prevItem = idx > 0 ? ep[idx - 1] : null;
            const isGroupContinuation = item.type === 'character' && prevItem &&
                prevItem.type === 'character' && prevItem._sourceId !== undefined &&
                item._sourceId === prevItem._sourceId;

            const nameCell = isGroupContinuation
                ? `<td class="scen-name-cell scen-name-continuation" style="padding-left:0.6em;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f2c94c;margin-right:8px;vertical-align:middle;"></span>${item.name} <span class="scen-item-sub">${label}</span></td>`
                : `<td class="scen-name-cell">${item.name} <span class="scen-item-sub">${label}</span> <span class="scen-item-sub" style="opacity:0.6; font-size:0.85em;">${patchVersionAt(item.targetPatch)}</span></td>`;

            return `
                <tr${isGroupContinuation ? '' : ' style="border-top:0.5em solid transparent;"'}>
                    ${nameCell}
                    ${cells}
                </tr>
            `;
        }).join('');

        const resultCells = results.map(r => {
            const resultText = r.failed ? `${Math.abs(r.net)} wishes short` : `${r.net} wishes left`;
            const resultClass = r.failed ? 'scen-result-fail' : 'scen-result-ok';
            return `<td class="scen-result-cell ${resultClass}">${resultText}</td>`;
        }).join('');

        return `
            <div class="scenario-summary-card">
                <div class="scen-sum-stats">
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">🟢 Best Case</span>
                        <span class="scen-sum-stat-val" style="color:var(--success)">${formatChance(odds.bestPct, true)}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">🟡 Mixed Outcomes</span>
                        <span class="scen-sum-stat-val" style="color:var(--warning, #d9a441)">${formatChance(odds.mixedPct, false)}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">🔴 Worst Case</span>
                        <span class="scen-sum-stat-val" style="color:var(--danger)">${formatChance(odds.worstPct, true)}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">Best Outcome</span>
                        <span class="scen-sum-stat-val" style="color:${best.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${bestLabel}</span>
                    </div>
                    <div class="scen-sum-stat">
                        <span class="scen-sum-stat-label">Worst Outcome</span>
                        <span class="scen-sum-stat-val" style="color:${worst.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${worstLabel}</span>
                    </div>
                </div>
                <div class="scen-sum-divider"></div>
                <div class="scen-sum-title">Scenario Summary</div>
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
                <div class="scen-legend">
                    <span class="scen-legend-title">Legend</span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-win">✅ Win</span><span class="scen-legend-desc">Won the featured 50/50.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-guaranteed"><img class="guaranteed-icon" src="assets/data/custom_icons/lost_5050.png" alt="Guaranteed">Guaranteed</span><span class="scen-legend-desc">Obtained on guarantee after losing a 50/50.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-radiance" style="display:inline-flex;align-items:center;gap:5px;"><img class="radiance-icon" src="assets/data/custom_icons/Item_Intertwined_Fate.webp" alt="Radiance" style="width:14px;height:14px;"><span class="radiance-text">Radiance</span></span><span class="scen-legend-desc">Capturing Radiance activated.</span></span>
                    <span class="scen-legend-item"><span class="scen-item-mark scen-item-short">⛔ Short</span><span class="scen-legend-desc">Ran out of wishes.</span></span>
                    <button type="button" class="scen-export-btn" onclick="exportScenarioSummaryPNG(this)">⬇ Export as PNG</button>
                </div>
            </div>
        `;
    }

    const SAVE_KEY = 'genshin_calculator_v1';
    const banner = document.getElementById('failsafeBanner');

    function showBanner(html) {
        banner.innerHTML = html;
        banner.classList.remove('hidden');
    }
    function hideBanner() {
        banner.classList.add('hidden');
    }

    function storageIsWorking() {
        try {
            const probe = '__calculator_probe__';
            localStorage.setItem(probe, '1');
            const ok = localStorage.getItem(probe) === '1';
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
            incomeMode: document.querySelector('input[name="incomeMode"]:checked')?.value || 'average',

            customPatches: Array.from(document.querySelectorAll('.custom-val-input')).map(inp => inp.value),
        };
    }

    function saveState() {
        const state = buildState();
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(state));
            if (!banner.dataset.userDismissed) hideBanner();
        } catch (e) {
            showBanner(
                '⚠️ Your browser is blocking saved data for this page, so your inputs will reset on reload. ' +
                'This usually means cookies/site data are blocked (check Brave Shields → this site → Cookies), ' +
                'or "Clear cookies and site data on exit" is enabled. ' +
                'Use <b>Export</b> below to save your plan to a file as a workaround.'
            );
        }
    }

    function applyState(s) {
        priorityPipeline = (s.pipeline || []).map(item => ({
            ...item,
            name: String(item.name || '').trim().slice(0, 40),
        }));
        currentWishesEl.value = s.wishes ?? '';
        currentStarglitterEl.value = s.starglitter ?? '';
        wishesPerPatchEl.value = s.wishesPerPatch ?? '80';
        totalPatchesEl.value = s.totalPatches ?? '0';
        starglitterEl.value = s.sgRate ?? '8';
        charSoftPityEl.value = s.charSoftPity ?? '76';
        wepSoftPityEl.value = s.wepSoftPity ?? '65';
        charPityEl.value = s.charPity ?? '0';
        wepPityEl.value = s.wepPity ?? '0';
        hasWelkinEl.checked = s.welkin || false;
        hasBPEl.checked = s.bp || false;
        startPatchMajorEl.value = s.startPatchMajor ?? '1';
        startPatchMinorEl.value = s.startPatchMinor ?? '0';
        const modeEl = document.querySelector(`input[name="incomeMode"][value="${s.incomeMode || 'average'}"]`);
        if (modeEl) { modeEl.checked = true; modeEl.dispatchEvent(new Event('change')); }
        updateStarglitterHint();
        renderCustomIncomeRows();
        updateTargetPatchOptions();
        if (s.customPatches) {
            document.querySelectorAll('.custom-val-input').forEach((inp, idx) => {
                if (s.customPatches[idx] !== undefined) inp.value = s.customPatches[idx];
            });
        }
    }

    function loadState() {
        if (!storageIsWorking()) {
            showBanner(
                '⚠️ This browser/tab is blocking saved data, so nothing will persist between visits. ' +
                'Check Brave Shields (cookie/site-data blocking) or "Clear on exit" settings for this site. ' +
                'You can still use <b>Export</b>/<b>Import</b> below to save and reload your plan manually.'
            );
            return false;
        }
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return false;
            applyState(JSON.parse(raw));
            return true;
        } catch (e) { return false; }
    }

    function exportState() {
        const blob = new Blob([JSON.stringify(buildState(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'genshin-wish-plan.json';
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
                showBanner('⚠️ That file could not be read as a valid plan export.');
            }
        };
        reader.readAsText(file);
    }

    function pipelineUpdated() { renderPipeline(); calculateForecast(); saveState(); }

    const debouncedSaveState = debounce(saveState, 300);
    [currentWishesEl, wishesPerPatchEl, starglitterEl, charSoftPityEl, wepSoftPityEl, charPityEl, wepPityEl, totalPatchesEl].forEach(el =>
        el.addEventListener('input', debouncedSaveState)
    );
    currentStarglitterEl.addEventListener('input', debouncedSaveState);
    [hasWelkinEl, hasBPEl].forEach(el => el.addEventListener('change', saveState));
    document.querySelectorAll('input[name="incomeMode"]').forEach(r => r.addEventListener('change', saveState));

    document.getElementById('exportBtn').addEventListener('click', exportState);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', (e) => {
        if (e.target.files[0]) importStateFromFile(e.target.files[0]);
        e.target.value = '';
    });

    document.getElementById('resetBtn').addEventListener('click', () => {

        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        priorityPipeline = [];
        currentWishesEl.value = '';
        currentStarglitterEl.value = '';
        wishesPerPatchEl.value = '80';
        totalPatchesEl.value = '0';
        starglitterEl.value = '8';
        charSoftPityEl.value = '76';
        wepSoftPityEl.value = '65';
        charPityEl.value = '0';
        wepPityEl.value = '0';
        hasWelkinEl.checked = false;
        hasBPEl.checked = false;
        startPatchMajorEl.value = '';
        startPatchMinorEl.value = '';
        const avgMode = document.querySelector('input[name="incomeMode"][value="average"]');
        avgMode.checked = true;
        avgMode.dispatchEvent(new Event('change'));
        updateStarglitterHint();
        renderCustomIncomeRows();
        updateTargetPatchOptions();
        pipelineUpdated();
    });

    loadState();
    pipelineUpdated();

    // html2canvas is only needed for PNG export, so it's loaded on demand
    // the first time someone clicks the export button instead of on every
    // page load — saves ~200KB of parse/exec on the common path.
    let html2canvasLoadPromise = null;
    function loadHtml2Canvas() {
        if (typeof html2canvas !== 'undefined') return Promise.resolve();
        if (html2canvasLoadPromise) return html2canvasLoadPromise;
        html2canvasLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        return html2canvasLoadPromise;
    }

    // Captures the Scenario Summary card as a PNG. html2canvas doesn't
    // reliably render `background-clip: text` gradients (the Radiance
    // shimmer), so we swap it to a flat gold color just for the capture,
    // then restore the live animated version immediately after.
    window.exportScenarioSummaryPNG = async function(btn) {
        const card = document.querySelector('.scenario-summary-card');
        if (!card) return;

        const originalLabel = btn.innerText;
        btn.disabled = true;
        btn.innerText = 'Loading…';

        try {
            await loadHtml2Canvas();
        } catch (e) {
            console.error('Failed to load html2canvas:', e);
            alert('Export failed to load — check your connection and try again.');
            btn.disabled = false;
            btn.innerText = originalLabel;
            return;
        }

        btn.innerText = 'Exporting…';
        card.classList.add('exporting-for-png');

        html2canvas(card, {
            backgroundColor: '#0f0e1e',
            scale: 2,
            useCORS: true
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = 'scenario-summary.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(err => {
            console.error('PNG export failed:', err);
            alert('Export failed — check the console for details.');
        }).finally(() => {
            card.classList.remove('exporting-for-png');
            btn.disabled = false;
            btn.innerText = originalLabel;
        });
    };

