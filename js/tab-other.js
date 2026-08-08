const CALENDAR_API_URL = "https://api.ennead.cc/mihoyo/genshin/calendar";
const SERVER_RESET_OFFSET_HOURS = {
  NA: 13,
  EU: 7,
  AS: 0,
  TW: 0
};
function getServerRegion() {
  return localStorage.getItem("gs-server-region") || "EU";
}
function getServerOffsetSeconds() {
  return (SERVER_RESET_OFFSET_HOURS[getServerRegion()] || 0) * 3600;
}
function formatCountdown(unix) {
  if (!unix) return "";
  const diffMs = (unix + getServerOffsetSeconds()) * 1e3 - Date.now();
  if (diffMs <= 0) return "Ended";
  const days = Math.floor(diffMs / 864e5);
  const hours = Math.floor(diffMs % 864e5 / 36e5);
  const mins = Math.floor(diffMs % 36e5 / 6e4);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
function initServerRegionSelect() {
  const container = document.getElementById("serverRegionSelect");
  if (!container) return;
  const buttons = container.querySelectorAll(".server-region-option");
  const setActive = (region) => {
    buttons.forEach((btn) => btn.classList.toggle("active", btn.dataset.region === region));
  };
  setActive(getServerRegion());
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      localStorage.setItem("gs-server-region", btn.dataset.region);
      setActive(btn.dataset.region);
      if (bannersCache) renderBanners(bannersCache);
    });
  });
}
let bannersInitialized = false;
let bannersCache = null;
let otherTabStructureInitialized = false;
function initOtherTabStructure() {
  if (otherTabStructureInitialized) return;
  otherTabStructureInitialized = true;
  const container = document.getElementById("tabOtherContent");
  container.innerHTML = `
        <div class="section-card">
            <div class="section-title">Current Banners</div>
            <div id="bannersPanel"></div>
        </div>

        <div class="section-card">
            <div class="section-title">Endgame Resets</div>
            <div id="endgameResetsBody"></div>
        </div>

        <div class="section-card">
            <div class="section-title">Current Events</div>
            <div id="eventsPanel"></div>
        </div>

        <div class="section-card">
            <div class="section-title">Active Codes</div>
            <div id="codesPanel"></div>
        </div>
    `;
}
function activateOtherTab() {
  initOtherTabStructure();
  initServerRegionSelect();
  activateBannersPanel();
  loadEndgameResets();
  loadEvents();
  activateCodesPanel();
}
const ENDGAME_RESET_ICONS = [
  { match: /abyssal moon spire|spiral abyss/i, icon: "spiral_abyss_icon.webp" },
  { match: /imaginarium theater/i, icon: "imaginarium_theater_icon.webp" },
  { match: /stygian onslaught/i, icon: "stygian_onslaught.webp" }
];
function getEndgameResetIcon(name) {
  const entry = ENDGAME_RESET_ICONS.find((e) => e.match.test(name || ""));
  return entry ? `assets/data/custom_icons/${entry.icon}` : null;
}
let endgameResetsInitialized = false;
function loadEndgameResets() {
  const panel = document.getElementById("endgameResetsBody");
  if (!panel || endgameResetsInitialized) return;
  endgameResetsInitialized = true;
  panel.innerHTML = `<div class="explanation">Loading reset info\u2026</div>`;
  fetch(CALENDAR_API_URL).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }).then((data) => {
    const rawChallenges = Array.isArray(data.challenges) ? data.challenges : [];
    const hiddenChallenges = (Array.isArray(data.events) ? data.events : []).filter((e) => e.type_name === "ActTypeHardChallenge");
    const challenges = [...rawChallenges, ...hiddenChallenges].filter((c) => c.special_reward && c.special_reward.amount > 0).sort((a, b) => (a.end_time || 0) - (b.end_time || 0));
    if (!challenges.length) {
      panel.innerHTML = `<div class="explanation">No reset data available right now.</div>`;
      return;
    }
    const esc = (s) => String(s || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);
    const fmtDate = (unix) => unix ? new Date(unix * 1e3).toLocaleDateString(void 0, {
      month: "short",
      day: "numeric"
    }) : "?";
    panel.innerHTML = challenges.map((c) => {
      const icon = getEndgameResetIcon(c.name);
      const iconHtml = icon ? `<img class="reset-row-icon" src="${icon}" alt="">` : "";
      return `
                <div class="reset-row">
                    ${iconHtml}
                    <div class="reset-row-info">
                        <div class="reset-row-name">${esc(c.name)}</div>
                        <div class="reset-row-date">Resets ${fmtDate(c.end_time)} <span class="reset-row-countdown">${esc(formatCountdown(c.end_time))}</span></div>
                    </div>
                    <div class="reset-row-reward">+${c.special_reward.amount} Primogems</div>
                </div>
            `;
    }).join("");
  }).catch(() => {
    endgameResetsInitialized = false;
    panel.innerHTML = `<div class="explanation">Couldn't load reset info right now \u2014 the calendar source might be down. Try again in a bit.</div>`;
  });
}
let eventsInitialized = false;
function loadEvents() {
  const panel = document.getElementById("eventsPanel");
  if (!panel || eventsInitialized) return;
  eventsInitialized = true;
  panel.innerHTML = `<div class="explanation">Loading events\u2026</div>`;
  fetch(CALENDAR_API_URL).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }).then((data) => {
    const events = (Array.isArray(data.events) ? data.events : []).filter((e) => e.start_time > 0 && e.end_time > 0 && e.type_name !== "ActTypeHardChallenge" && !(e.special_reward && e.special_reward.id === 107021)).sort((a, b) => (a.end_time || 0) - (b.end_time || 0));
    if (!events.length) {
      panel.innerHTML = `<div class="explanation">No live events right now.</div>`;
      return;
    }
    const esc = (s) => String(s || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);
    const fmtDate = (unix) => unix ? new Date(unix * 1e3).toLocaleDateString(void 0, {
      month: "short",
      day: "numeric"
    }) : "?";
    panel.innerHTML = events.map((e, i) => {
      const all = [...e.special_reward ? [e.special_reward] : [], ...Array.isArray(e.rewards) ? e.rewards : []];
      const seen = /* @__PURE__ */ new Set();
      const items = all.filter((r) => r && r.amount > 0 && !seen.has(r.id) && seen.add(r.id));
      const primo = items.find((r) => r.id === 201);
      const rest = items.filter((r) => r.id !== 201);
      const chip = (r) => `<span class="codes-reward-chip${r.id === 201 ? " reward-chip-primo" : ""}">${esc(r.name)} <span class="codes-reward-qty">\xD7${r.amount}</span></span>`;
      const rewardsHtml = items.length ? `
                <div class="codes-rewards">
                    ${primo ? chip(primo) : ""}
                    ${rest.length ? `<span class="event-show-more" data-idx="${i}">Show more</span>` : ""}
                </div>
                ${rest.length ? `<div class="codes-rewards event-rewards-extra" data-idx="${i}" style="display:none;">${rest.map(chip).join("")}</div>` : ""}
            ` : "";
      return `
                <div class="reset-row">
                    <div>
                        <div class="reset-row-name">${esc(e.name)}</div>
                        <div class="reset-row-date">Ends ${fmtDate(e.end_time)} <span class="reset-row-countdown">${esc(formatCountdown(e.end_time))}</span></div>
                        ${rewardsHtml}
                    </div>
                </div>
            `;
    }).join("");
    panel.querySelectorAll(".event-show-more").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = btn.dataset.idx;
        const extra = panel.querySelector(`.event-rewards-extra[data-idx="${idx}"]`);
        if (!extra) return;
        const showing = extra.style.display !== "none";
        extra.style.display = showing ? "none" : "flex";
        btn.textContent = showing ? "Show more" : "Show less";
      });
    });
  }).catch(() => {
    eventsInitialized = false;
    panel.innerHTML = `<div class="explanation">Couldn't load events right now \u2014 the calendar source might be down. Try again in a bit.</div>`;
  });
}
function activateBannersPanel() {
  const panel = document.getElementById("bannersPanel");
  if (!panel) return;
  if (bannersCache) {
    renderBanners(bannersCache);
    return;
  }
  if (bannersInitialized) return;
  bannersInitialized = true;
  panel.innerHTML = `<div class="explanation">Loading current banners\u2026</div>`;
  fetch(CALENDAR_API_URL).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }).then((data) => {
    const banners = Array.isArray(data.banners) ? data.banners : [];
    bannersCache = banners;
    renderBanners(banners);
  }).catch(() => {
    bannersInitialized = false;
    panel.innerHTML = `<div class="explanation">Couldn't load banners right now \u2014 the calendar source might be down. Try again in a bit.</div>`;
  });
}
let charProfileMap = null;
let weaponProfileMap = null;
function getCharProfile(id) {
  if (!charProfileMap) {
    charProfileMap = /* @__PURE__ */ new Map();
    (typeof GENSHIN_CHARACTER_PROFILE_INDEX !== "undefined" ? GENSHIN_CHARACTER_PROFILE_INDEX : []).forEach((c) => charProfileMap.set(String(c.id), c));
  }
  return charProfileMap.get(String(id)) || null;
}
function getWeaponProfile(id) {
  if (!weaponProfileMap) {
    weaponProfileMap = /* @__PURE__ */ new Map();
    (typeof GENSHIN_WEAPON_PROFILE_INDEX !== "undefined" ? GENSHIN_WEAPON_PROFILE_INDEX : []).forEach((w) => weaponProfileMap.set(String(w.id), w));
  }
  return weaponProfileMap.get(String(id)) || null;
}
function renderBanners(banners) {
  const panel = document.getElementById("bannersPanel");
  if (!panel) return;
  const active = banners.filter((b) => b.characters && b.characters.length || b.weapons && b.weapons.length);
  if (!active.length) {
    panel.innerHTML = `<div class="explanation">No active banners right now \u2014 check back later.</div>`;
    return;
  }
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
  const fmtDate = (unix) => unix ? new Date(unix * 1e3).toLocaleDateString(void 0, {
    month: "short",
    day: "numeric"
  }) : "?";
  panel.innerHTML = active.map((b) => {
    const chars = (b.characters || []).map((u) => ({ unit: u, kind: "character", profile: getCharProfile(u.id) }));
    const weapons = (b.weapons || []).map((u) => ({ unit: u, kind: "weapon", profile: getWeaponProfile(u.id) }));
    const units = [...chars, ...weapons];
    const unitHtml = units.map(({ unit: u, kind, profile }) => {
      const rarityClass = u.rarity === 5 ? "r5" : "r4";
      const iconSrc = profile && profile.icon ? `assets/data/${profile.icon}` : u.icon;
      const icon = iconSrc ? `<img src="${esc(iconSrc)}" alt="" loading="lazy">` : `<div class="ac-icon-placeholder">?</div>`;
      const inner = `${icon}<div class="banner-unit-name">${esc(u.name)}</div>`;
      if (profile) {
        const href = kind === "character" ? `#/character-info?character=${profile.id}` : `#/weapon-info?weapon=${profile.id}`;
        return `
                <a class="banner-unit ${rarityClass}" href="${href}">
                    ${inner}
                </a>
            `;
      }
      return `
                <div class="banner-unit ${rarityClass}">
                    ${inner}
                </div>
            `;
    }).join("");
    return `
            <div class="banner-card">
                <div class="banner-card-header">
                    <div class="banner-card-title">${esc(b.name)}${b.version ? ` <span style="color: var(--text-muted); font-weight:400;">v${esc(b.version)}</span>` : ""}</div>
                    <div class="banner-card-dates">
                        <div>${fmtDate(b.start_time)} \u2013 ${fmtDate(b.end_time)}</div>
                        <div class="banner-card-countdown">${esc(formatCountdown(b.end_time))}</div>
                    </div>
                </div>
                <div class="banner-card-units">${unitHtml}</div>
            </div>
        `;
  }).join("");
}
const CODES_API_URL = "https://db.hashblen.com/codes";
const CODES_REDEEM_BASE = "https://genshin.hoyoverse.com/en/gift?code=";
let codesInitialized = false;
let codesCache = null;
function activateCodesPanel() {
  const panel = document.getElementById("codesPanel");
  if (!panel) return;
  if (codesCache) {
    renderCodes(codesCache);
    return;
  }
  if (codesInitialized) return;
  codesInitialized = true;
  panel.innerHTML = `<div class="explanation">Loading current codes\u2026</div>`;
  fetch(CODES_API_URL).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }).then((data) => {
    const codes = Array.isArray(data.genshin) ? data.genshin : [];
    codesCache = codes;
    renderCodes(codes);
  }).catch(() => {
    codesInitialized = false;
    panel.innerHTML = `<div class="explanation">Couldn't load codes right now \u2014 the tracker might be down. Try again in a bit, or check <a href="https://genshin.hoyoverse.com/en/gift" target="_blank" rel="noopener">the official redeem page</a> directly.</div>`;
  });
}
function renderCodes(codes) {
  const panel = document.getElementById("codesPanel");
  if (!panel) return;
  if (!codes.length) {
    panel.innerHTML = `<div class="explanation">No active codes right now \u2014 check back later.</div>`;
    return;
  }
  const sorted = codes.slice().sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);
  const parseRewards = (desc) => {
    if (!desc || typeof desc !== "string") return [];
    return desc.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const idx = part.lastIndexOf("*");
      if (idx === -1) return { name: part, qty: null };
      const name = part.slice(0, idx).trim();
      const qty = part.slice(idx + 1).trim();
      return { name, qty: /^[\d,]+$/.test(qty) ? qty : null };
    });
  };
  panel.innerHTML = sorted.map((c, i) => {
    const rewards = parseRewards(c.description);
    const rewardsHtml = rewards.length ? `<div class="codes-rewards">${rewards.map((r) => `<span class="codes-reward-chip">${esc(r.name)}${r.qty ? ` <span class="codes-reward-qty">\xD7${esc(r.qty)}</span>` : ""}</span>`).join("")}</div>` : `<div class="explanation" style="margin-top:6px;">Reward not listed</div>`;
    return `
        <div class="codes-row">
            <div>
                <span class="codes-code">${esc(c.code)}</span>
                ${rewardsHtml}
            </div>
            <div class="codes-actions">
                <a class="codes-claim-link" href="${CODES_REDEEM_BASE}${encodeURIComponent(c.code)}" target="_blank" rel="noopener">Claim</a>
                <button type="button" class="codes-copy-btn" data-code="${esc(c.code)}" data-idx="${i}">Copy</button>
            </div>
        </div>
    `;
  }).join("");
  panel.querySelectorAll(".codes-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.code;
      navigator.clipboard.writeText(code).then(() => {
        const original = btn.textContent;
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove("copied");
        }, 1500);
      });
    });
  });
}
