
(function () {
    let fs4SelectedAsset = null;

    const fs4NameInput = document.getElementById('fs4AssetName');
    const fs4CurrentEl = document.getElementById('fs4CurrentConst');
    const fs4GoalEl = document.getElementById('fs4Const');
    const fs4WishesEl = document.getElementById('fs4WishesAvailable');
    const fs4StopModeEl = document.getElementById('fs4StopMode');
    const fs4BannerPityGroup = document.getElementById('fs4BannerPityGroup');
    const fs4BannerPityEl = document.getElementById('fs4BannerPity');
    const fs4WishesExplanationEl = document.getElementById('fs4WishesExplanation');

    if (!fs4NameInput) return;

    const FS4_STOP_TARGETS = {
        before1: 77,
        until1: 78,
        until2: 78 * 2,
        before3: 78 * 3 - 1,
    };

    function fs4UpdateStopModeUI() {
        const mode = fs4StopModeEl.value;
        const isNever = mode === 'never';
        fs4BannerPityGroup.classList.toggle('hidden', isNever);
        if (isNever) {
            fs4WishesExplanationEl.textContent = 'Just this pool — 4 Stars are too RNG to project.';
        } else {
            fs4WishesExplanationEl.textContent = 'Whichever is smaller: this pool, or what\'s left until the stop-condition milestone.';
        }
    }

    fs4StopModeEl.addEventListener('change', fs4UpdateStopModeUI);
    fs4BannerPityEl.addEventListener('input', fs4UpdateStopModeUI);
    fs4UpdateStopModeUI();

    fs4WishesEl.addEventListener('input', () => {
        if (fs4WishesEl.value.length > 5) fs4WishesEl.value = fs4WishesEl.value.slice(0, 5);
    });

    function fs4ResolveWishBudget() {
        const manual = Math.min(999, Math.max(0, parseInt(fs4WishesEl.value) || 0));
        const mode = fs4StopModeEl.value;
        if (mode === 'never') return manual;
        const target = FS4_STOP_TARGETS[mode] || 0;
        const bannerPity = Math.min(89, Math.max(0, parseInt(fs4BannerPityEl.value) || 0));
        const stopCap = Math.min(999, Math.max(0, target - bannerPity));
        return Math.min(manual, stopCap);
    }

    function fs4RenderAssetList(query) {
        const list = document.getElementById('fs4AssetNameList');
        const results = searchGenshinCharacters(query, 4);
        const trimmed = query.trim();
        const exactMatch = results.some(r => r.name.toLowerCase() === trimmed.toLowerCase());

        let html = results.slice(0, 8).map(entry => `
            <div class="autocomplete-item" data-name="${entry.name.replace(/"/g, '&quot;')}">
                ${assetIconHtml(entry)}
                <span class="ac-name">${entry.name}</span>
                <span class="ac-sub">${fs4AssetSubLabel(entry)}</span>
            </div>
        `).join('');

        if (trimmed && !exactMatch) {
            html += `
                <div class="autocomplete-item ac-custom" data-custom="${trimmed.replace(/"/g, '&quot;')}">
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
        list.classList.remove('hidden');
    }

    function fs4AssetSubLabel(entry) {
        if (!entry) return '';
        if (entry.isCustom) return 'Custom • Unreleased';
        if (entry.element) {
            const iconPath = elementIconPath(entry.element);
            const iconHtml = iconPath ? `<img class="el-icon" src="${iconPath}" alt="">` : '';
            return `${iconHtml}${entry.element} • <span style="color:var(--text-muted);">4★</span>`;
        }
        return `<span style="color:var(--text-muted);">4★</span>`;
    }

    function fs4HideAssetList() {
        const list = document.getElementById('fs4AssetNameList');
        list.classList.add('hidden');
        list.innerHTML = '';
    }

    function fs4SelectAssetByName(name) {
        const entry = getGenshinCharacter(name, 4);
        fs4ApplySelectedAsset(entry || makeCustomCharacter(name, 4));
    }

    function fs4SelectCustomAsset(name) {
        fs4ApplySelectedAsset(makeCustomCharacter(name, 4));
    }

    function fs4ApplySelectedAsset(entry) {
        fs4SelectedAsset = entry;
        fs4NameInput.value = entry.name;
        fs4RenderSelectedAssetChip();
        fs4HideAssetList();
    }

    function fs4ClearSelectedAsset() {
        fs4SelectedAsset = null;
        const chip = document.getElementById('fs4SelectedAssetChip');
        chip.classList.add('hidden');
        chip.innerHTML = '';
    }

    function fs4RenderSelectedAssetChip() {
        const chip = document.getElementById('fs4SelectedAssetChip');
        if (!fs4SelectedAsset) { chip.classList.add('hidden'); chip.innerHTML = ''; return; }
        const iconPath = elementIconPath(fs4SelectedAsset.element);
        const icon = iconPath ? `<img class="el-icon" src="${iconPath}" alt="" style="width:22px;height:22px;margin:0 2px;">` : '';
        const nameLine = fs4SelectedAsset.isCustom
            ? `${fs4SelectedAsset.name} <span style="color: var(--text-muted); font-weight:500; font-size:0.7em;">(Custom)</span>`
            : `${fs4SelectedAsset.name}${icon}<span style="color:var(--text-muted); font-weight:700; font-size:0.85em;">4★</span>`;
        chip.innerHTML = `
            ${assetIconHtml(fs4SelectedAsset)}
            <div class="sac-name">${nameLine}</div>
            <button type="button" class="sac-clear" id="fs4SacClearBtn" title="Clear selection">&times;</button>
        `;
        chip.classList.remove('hidden');
        document.getElementById('fs4SacClearBtn').addEventListener('click', () => {
            fs4ClearSelectedAsset();
            fs4NameInput.value = '';
            fs4NameInput.focus();
        });
    }

    fs4NameInput.addEventListener('input', (e) => {
        if (fs4SelectedAsset && fs4SelectedAsset.name !== e.target.value) fs4ClearSelectedAsset();
        fs4RenderAssetList(e.target.value);
    });
    fs4NameInput.addEventListener('focus', (e) => fs4RenderAssetList(e.target.value));
    document.getElementById('fs4AssetNameList').addEventListener('mousedown', (e) => {
        e.preventDefault();
        const item = e.target.closest('.autocomplete-item');
        if (!item) return;
        if (item.dataset.custom !== undefined) fs4SelectCustomAsset(item.dataset.custom);
        else if (item.dataset.name !== undefined) fs4SelectAssetByName(item.dataset.name);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#fs4AssetName') && !e.target.closest('#fs4AssetNameList')) fs4HideAssetList();
    });

    function fs4EnforceGoalFloor() {
        const current = parseInt(fs4CurrentEl.value);
        const floor = Math.max(0, current + 1);
        Array.from(fs4GoalEl.options).forEach(opt => {
            opt.disabled = parseInt(opt.value) < floor;
        });
        if (parseInt(fs4GoalEl.value) < floor) fs4GoalEl.value = String(floor);
        fs4UpdateCopiesExplanation();
    }

    function fs4UpdateCopiesExplanation() {
        const goal = parseInt(fs4GoalEl.value);
        const current = parseInt(fs4CurrentEl.value);
        const needed = Math.max(0, goal - current);
        const el = document.getElementById('fs4CopiesExplanation');
        if (el) el.innerText = needed === 0 ? "Goal already met — 0 pulls needed." : `Need ${needed} more cop${needed === 1 ? 'y' : 'ies'} to go from C${current < 0 ? '(none)' : current} to C${goal}.`;
    }

    fs4CurrentEl.addEventListener('change', fs4EnforceGoalFloor);
    fs4GoalEl.addEventListener('change', fs4UpdateCopiesExplanation);
    fs4EnforceGoalFloor();

    function fs4SimulateOnePull(state) {

        state.pos++;
        const chance = state.pos <= 8 ? 0.05 : (state.pos === 9 ? 0.25 : 1.0);
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
            if (gotRateup && Math.random() < (1 / 3)) state.copies++;
        }
    }

    function fs4SimulateMilestones(copiesNeeded, trials, cap) {
        const results = new Array(trials);
        for (let t = 0; t < trials; t++) {
            const state = { pos: 0, guaranteedRateup: false, copies: 0 };
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

    document.getElementById('fs4CalcBtn').addEventListener('click', () => {
        const current = parseInt(fs4CurrentEl.value);
        const goal = parseInt(fs4GoalEl.value);
        const copiesNeeded = Math.max(0, goal - current);
        const wishes = fs4ResolveWishBudget();

        const resultEl = document.getElementById('fs4Result');
        const percentEl = document.getElementById('fs4PercentValue');
        const labelEl = document.getElementById('fs4PercentLabel');
        const rangeEl = document.getElementById('fs4RangeText');

        const targetLabel = fs4SelectedAsset ? fs4SelectedAsset.name : (fs4NameInput.value.trim() || 'this character');

        if (copiesNeeded === 0) {
            resultEl.classList.remove('hidden');
            percentEl.style.color = 'var(--success)';
            percentEl.textContent = '100%';
            labelEl.textContent = `You already own C${goal} ${targetLabel} — nothing to pull for.`;
            rangeEl.textContent = '';
            return;
        }

        const CAP = 1000;
        const TRIALS = 6000;
        const milestones = fs4SimulateMilestones(copiesNeeded, TRIALS, CAP);

        const successCount = milestones.filter(m => m <= wishes).length;
        const chance = successCount / TRIALS;

        const lucky = fs4Percentile(milestones, 0.10);
        const average = Math.round(milestones.reduce((a, b) => a + b, 0) / milestones.length);
        const unlucky = fs4Percentile(milestones, 0.90);

        percentEl.textContent = `${Math.round(chance * 100)}%`;
        percentEl.style.color = chance >= 0.66 ? 'var(--success)' : chance >= 0.33 ? 'var(--warning)' : 'var(--danger)';
        labelEl.textContent = `chance to hit C${goal} ${targetLabel} with ${wishes} wish${wishes === 1 ? '' : 'es'}`;

        const luckyText = lucky > CAP ? `${CAP}+` : lucky;
        const unluckyText = unlucky > CAP ? `${CAP}+` : unlucky;
        rangeEl.innerHTML = `Typical cost for ${copiesNeeded} cop${copiesNeeded === 1 ? 'y' : 'ies'}: lucky players get there in ~${luckyText} pulls, unlucky ones need ~${unluckyText}+. Average is ~${average} pulls.`;

        resultEl.classList.remove('hidden');
    });
})();

