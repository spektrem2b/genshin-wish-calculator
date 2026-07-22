(function() {
  "use strict";
  const CHARACTER_ID = "10000002";
  function getJson(url) {
    return fetch(url).then((res) => res.ok ? res.json() : null).catch(() => null);
  }
  function fetchFullCharacterProfile(id) {
    const base = `assets/data/character-profiles/${id}`;
    return Promise.all([
      getJson(`${base}/info.json`),
      getJson(`${base}/skills/talents.json`),
      getJson(`${base}/constellations/constellations.json`),
      getJson(`${base}/materials/materials.json`)
    ]).then(([info, talents, constellations, materials]) => {
      if (!info) return null;
      return {
        ...info,
        talents: (Array.isArray(talents) ? talents : talents && talents.talents) || [],
        constellations: (Array.isArray(constellations) ? constellations : constellations && constellations.constellations) || [],
        promotes: materials && materials.promotes || []
      };
    });
  }
  function dataAssetSrc(path) {
    if (!path) return null;
    if (/^(https?:)?\/\//.test(path) || path.startsWith("assets/data/")) return path;
    return `assets/data/${path}`;
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function starsHtml(rarity) {
    return "\u2605".repeat(rarity || 0);
  }
  function birthdayLabel(b) {
    if (!b) return null;
    const months = [
      "",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    return `${months[b.month] || ""} ${b.day}`.trim();
  }
  function releaseLabel(release) {
    if (!release) return null;
    return new Date(release).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
  function formatParamToken(token, params) {
    const m = token.match(/^param(\d+):([A-Za-z0-9]+)$/);
    if (!m) return token;
    const idx = parseInt(m[1], 10) - 1;
    const fmt = m[2];
    const raw = params[idx];
    if (raw === void 0) return "";
    const isPercent = fmt.endsWith("P");
    const decimalsMatch = fmt.match(/F(\d)/);
    const decimals = decimalsMatch ? parseInt(decimalsMatch[1], 10) : isPercent ? 1 : 0;
    const value = isPercent ? raw * 100 : raw;
    return value.toFixed(decimals) + (isPercent ? "%" : "");
  }
  function renderTemplate(template, params) {
    return template.replace(/\{([^}]+)\}/g, (_, inner) => formatParamToken(inner, params));
  }
  function parseDescRow(raw, params) {
    if (!raw) return null;
    const pipeIdx = raw.indexOf("|");
    if (pipeIdx === -1) return null;
    const label = raw.slice(0, pipeIdx);
    const template = raw.slice(pipeIdx + 1);
    if (!label) return null;
    return { label, value: renderTemplate(template, params) };
  }
  const DEFAULT_LEVELS = [1, 6, 8, 9, 10, 13];
  function scalingTableHtml(levels, uid) {
    const rows = (levels || []).filter((l) => l.level && l.description && l.description.length);
    if (!rows.length) return "";
    const labels = (rows[0].description || []).map((raw) => parseDescRow(raw, rows[0].params)).filter(Boolean).map((r) => r.label);
    if (!labels.length) return "";
    const buildRow = (l) => {
      const parsed = (l.description || []).map((raw) => parseDescRow(raw, l.params)).filter(Boolean);
      const cells = labels.map((label, i) => escapeHtml(parsed[i] && parsed[i].value || "\u2014"));
      const hiddenCls = DEFAULT_LEVELS.includes(l.level) ? "" : " ci-level-extra";
      const highlightCls = l.level === 10 ? " ci-level-10" : "";
      return `<tr class="${(hiddenCls + highlightCls).trim()}"><td>${l.level}</td>${cells.map((v) => `<td>${v}</td>`).join("")}</tr>`;
    };
    const bodyRows = rows.map(buildRow).join("");
    const hasExtra = rows.some((l) => !DEFAULT_LEVELS.includes(l.level));
    return `
            <div class="ci-scaling-wrap">
                <table class="ci-scaling" id="${uid}">
                    <thead><tr><th>Lv.</th>${labels.map((l) => `<th>${escapeHtml(l)}</th>`).join("")}</tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>
            ${hasExtra ? `<button type="button" class="ci-scaling-toggle" data-target="${uid}">Show full scaling</button>` : ""}`;
  }
  function quickStatsHtml(t) {
    const stats = [];
    if (t.cooldown !== null && t.cooldown !== void 0 && t.cooldown > 0) {
      stats.push(["Cooldown", `${t.cooldown}s`]);
    }
    if (t.cost !== null && t.cost !== void 0 && t.cost > 0) {
      stats.push(["Energy Cost", t.cost]);
    }
    const first = t.levels && t.levels[0] || null;
    if (first) {
      const parsed = (first.description || []).map((raw) => parseDescRow(raw, first.params)).filter(Boolean);
      ["Duration", "Particles", "ICD"].forEach((want) => {
        const hit = parsed.find((r) => r.label.toLowerCase().includes(want.toLowerCase()));
        if (hit && !stats.some((s) => s[0] === want)) stats.push([want, hit.value]);
      });
    }
    if (!stats.length) return "";
    return `<div class="ci-quickstats">${stats.map(([k, v]) => `
            <div class="ci-quickstat"><span class="ci-quickstat-label">${escapeHtml(k)}</span><span class="ci-quickstat-value">${escapeHtml(v)}</span></div>`).join("")}</div>`;
  }
  const TALENT_TYPE_LABELS = {
    normal_attack: "Normal Attack",
    skill: "Elemental Skill",
    alt_sprint: "Alternate Sprint",
    burst: "Elemental Burst",
    passive: "Passive Talent",
    unknown: "Unknown"
  };
  function normalizeTalentType(rawType) {
    if (typeof rawType === "string" && rawType.startsWith("DISAGREEMENT")) return "unknown";
    return rawType || "unknown";
  }
  function talentTypeLabel(rawType) {
    const normalized = normalizeTalentType(rawType);
    return TALENT_TYPE_LABELS[normalized] || normalized;
  }
  function isActiveTalent(t) {
    return normalizeTalentType(t.type) !== "passive";
  }
  let talentAccordionIdx = 0;
  function talentBlockHtml(t) {
    const uid = `ci-scaling-${talentAccordionIdx}`;
    const table = scalingTableHtml(t.levels, uid);
    const isFirst = talentAccordionIdx === 0;
    talentAccordionIdx++;
    return `
            <details class="ci-talent-accordion" ${isFirst ? "open" : ""}>
                <summary>
                    <img class="ci-talent-icon" src="${dataAssetSrc(t.icon)}" alt="">
                    <span class="ci-talent-summary-name">${escapeHtml(t.name)}</span>
                    <span class="ci-talent-summary-type">${escapeHtml(talentTypeLabel(t.type))}</span>
                </summary>
                <div class="ci-talent-accordion-body">
                    ${quickStatsHtml(t)}
                    ${table || '<div class="ci-talent-desc ci-muted">No scaling data.</div>'}
                </div>
            </details>`;
  }
  function passiveEffectHtml(t, uid) {
    const rows = (t.levels || []).filter((l) => l.description && l.description.length);
    if (!rows.length) return '<div class="ci-item-desc ci-muted">No effect data.</div>';
    if (rows.length > 1) return scalingTableHtml(t.levels, uid);
    const parsed = (rows[0].description || []).map((raw) => parseDescRow(raw, rows[0].params)).filter(Boolean);
    if (!parsed.length) return '<div class="ci-item-desc ci-muted">No effect data.</div>';
    return `<div class="ci-passive-desc">${parsed.map((r) => `
            <div class="ci-passive-desc-row"><span class="ci-passive-desc-label">${escapeHtml(r.label)}</span><span class="ci-passive-desc-value">${escapeHtml(r.value)}</span></div>`).join("")}</div>`;
  }
  let passiveUidIdx = 0;
  function passiveCardHtml(t) {
    const uid = `ci-passive-scaling-${passiveUidIdx++}`;
    return `
            <div class="ci-passive-card">
                <img class="ci-passive-icon" src="${dataAssetSrc(t.icon)}" alt="">
                <div class="ci-passive-body">
                    <div class="ci-passive-name">${escapeHtml(t.name)}</div>
                    ${passiveEffectHtml(t, uid)}
                </div>
            </div>`;
  }
  function constellationCardHtml(con, i) {
    return `
            <div class="ci-const-card">
                <div class="ci-const-badge">C${i + 1}</div>
                <div class="ci-const-body">
                    <div class="ci-const-name">${escapeHtml(con.name)}</div>
                    <div class="ci-const-desc">${escapeHtml(con.description)}</div>
                </div>
            </div>`;
  }
  function materialsHtml(promotes) {
    const phases = (promotes || []).filter((p) => p.items && p.items.length);
    if (!phases.length) return '<div class="ci-item-desc ci-muted">No ascension material data.</div>';
    return phases.map((p) => `
            <div class="ci-phase">
                <div class="ci-phase-label">Ascension ${p.promoteLevel} \u2192 Lv.${p.unlockMaxLevel}${p.moraCost ? ` &nbsp;\u2022&nbsp; ${p.moraCost.toLocaleString()} Mora` : ""}</div>
                <div class="ci-material-grid">
                    ${p.items.map((item) => `
                        <div class="ci-material-chip">
                            <img src="${dataAssetSrc(item.icon)}" alt="">
                            <span>${escapeHtml(item.name)}</span>
                            <span class="ci-material-qty">\xD7${item.qty}</span>
                        </div>`).join("")}
                </div>
            </div>`).join("");
  }
  function heroHtml(c) {
    const facts = [];
    if (c.element) facts.push(["\u2694", "Element", c.element]);
    if (c.weapon_type) facts.push(["\u{1F5E1}", "Weapon", c.weapon_type]);
    if (c.region) facts.push(["\u{1F4CD}", "Region", c.region]);
    const bday = birthdayLabel(c.birthday);
    if (bday) facts.push(["\u{1F382}", "Birthday", bday]);
    const release = releaseLabel(c.release);
    if (release) facts.push(["\u{1F4C5}", "Release", release]);
    return `
            <div class="ci-hero">
                <img class="ci-hero-portrait" src="${dataAssetSrc(c.icon)}" alt="">
                <div class="ci-hero-info">
                    <div class="ci-hero-name">${escapeHtml(c.name)}</div>
                    ${/* c.title (the quoted epithet) is gone from info.json with no
       new equivalent (migration-map.md §2) — this stays as a
       no-op guard rather than dead markup in case it comes back. */
    ""}
                    ${c.title ? `<div class="ci-hero-title">"${escapeHtml(c.title)}"</div>` : ""}
                    <div class="ci-hero-stars">${starsHtml(c.rarity)}</div>
                    <div class="ci-hero-facts">
                        ${facts.map(([icon, label, value]) => `
                            <div class="ci-hero-fact"><span class="ci-hero-fact-icon">${icon}</span><span class="ci-hero-fact-label">${escapeHtml(label)}</span><span class="ci-hero-fact-value">${escapeHtml(value)}</span></div>`).join("")}
                    </div>
                    <div class="ci-hero-id">ID: ${escapeHtml(c.id)}</div>
                </div>
            </div>`;
  }
  function navHtml() {
    const items = [
      ["ci-sec-overview", "Overview"],
      ["ci-sec-talents", "Talents"],
      ["ci-sec-passives", "Passives"],
      ["ci-sec-const", "Constellations"],
      ["ci-sec-materials", "Materials"]
    ];
    return `
            <nav class="ci-subnav">
                ${items.map(([id, label]) => `<a href="#${id}" class="ci-subnav-link">${label}</a>`).join("")}
            </nav>`;
  }
  function overviewHtml(c) {
    return `
            <section id="ci-sec-overview" class="ci-panel">
                <h2 class="ci-panel-title">Overview</h2>
                <div class="ci-item-desc ci-muted">Bio and base-stat data aren't available from the current database yet.</div>
            </section>`;
  }
  function renderCharacterInfo(c, root) {
    talentAccordionIdx = 0;
    const activeTalents = (c.talents || []).filter(isActiveTalent);
    const passiveTalents = (c.talents || []).filter((t) => !isActiveTalent(t));
    root.innerHTML = `
            ${heroHtml(c)}
            ${navHtml()}
            <div class="ci-layout">
                <div class="ci-col-left">
                    ${overviewHtml(c)}
                </div>
                <div class="ci-col-right">
                    <section id="ci-sec-talents" class="ci-panel">
                        <h2 class="ci-panel-title">Talents</h2>
                        <div class="ci-talent-list">
                            ${activeTalents.map(talentBlockHtml).join("") || '<div class="ci-item-desc ci-muted">No talent data.</div>'}
                        </div>
                    </section>
                    <section id="ci-sec-passives" class="ci-panel">
                        <h2 class="ci-panel-title">Passives</h2>
                        <div class="ci-passive-list">
                            ${passiveTalents.map(passiveCardHtml).join("") || '<div class="ci-item-desc ci-muted">None</div>'}
                        </div>
                    </section>
                    <section id="ci-sec-const" class="ci-panel">
                        <h2 class="ci-panel-title">Constellations</h2>
                        <div class="ci-const-list">
                            ${(c.constellations || []).map(constellationCardHtml).join("") || '<div class="ci-item-desc ci-muted">None</div>'}
                        </div>
                    </section>
                    <section id="ci-sec-materials" class="ci-panel">
                        <h2 class="ci-panel-title">Ascension Materials</h2>
                        ${materialsHtml(c.promotes)}
                    </section>
                </div>
            </div>`;
    wireInteractions(root);
  }
  function wireInteractions(root) {
    const links = Array.from(root.querySelectorAll(".ci-subnav-link"));
    links.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const target = root.querySelector(link.getAttribute("href"));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    if (links.length) {
      const sections = links.map((l) => root.querySelector(l.getAttribute("href"))).filter(Boolean);
      const onScroll = () => {
        let current = sections[0];
        for (const sec of sections) {
          if (sec.getBoundingClientRect().top - 140 <= 0) current = sec;
        }
        links.forEach((l) => l.classList.toggle("active", root.querySelector(l.getAttribute("href")) === current));
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    const accordions = Array.from(root.querySelectorAll(".ci-talent-accordion"));
    accordions.forEach((acc) => {
      acc.addEventListener("toggle", () => {
        if (acc.open) accordions.forEach((other) => {
          if (other !== acc) other.open = false;
        });
      });
    });
    root.querySelectorAll(".ci-scaling-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const table = root.querySelector(`#${btn.dataset.target}`);
        if (!table) return;
        const expanded = table.classList.toggle("ci-scaling-expanded");
        btn.textContent = expanded ? "Show fewer levels" : "Show full scaling";
      });
    });
  }
  let initialized = false;
  window.activateCharacterInfoTab = function() {
    const root = document.getElementById("characterInfoPanel");
    if (!root) return;
    if (initialized) return;
    initialized = true;
    fetchFullCharacterProfile(CHARACTER_ID).then((profile) => {
      if (!profile) {
        root.innerHTML = '<div class="ci-item-desc ci-muted">Character data not found.</div>';
        return;
      }
      renderCharacterInfo(profile, root);
    });
  };
})();
