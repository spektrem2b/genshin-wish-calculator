function debounce(fn, wait = 150) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
function setActiveRarityTab(tab) {
  const is5 = tab === "5star";
  const is4 = tab === "4star";
  const isOdds = tab === "odds";
  const isBuild = tab === "build";
  const isOther = tab === "other";
  document.getElementById("tab5starContent").classList.toggle("hidden", !is5);
  document.getElementById("tab4starContent").classList.toggle("hidden", !is4);
  document.getElementById("tabOddsContent").classList.toggle("hidden", !isOdds);
  document.getElementById("tabBuildContent").classList.toggle("hidden", !isBuild);
  document.getElementById("tabOtherContent").classList.toggle("hidden", !isOther);
  const btn5 = document.getElementById("tab5starBtn");
  const btn4 = document.getElementById("tab4starBtn");
  const btnOdds = document.getElementById("tabOddsBtn");
  const btnBuild = document.getElementById("tabBuildBtn");
  const btnOther = document.getElementById("tabOtherBtn");
  [[btn5, is5], [btn4, is4], [btnOdds, isOdds], [btnBuild, isBuild], [btnOther, isOther]].forEach(([btn, active]) => {
    btn.classList.toggle("active", active);
  });
  if (isOdds && typeof activateOddsTab === "function") activateOddsTab();
  if (isBuild && typeof activateBuildTab === "function") activateBuildTab();
  if (isOther && typeof activateOtherTab === "function") activateOtherTab();
  const indicator = document.getElementById("mobileTabLabel");
  if (indicator) {
    const labels = { "5star": "\u2726 5\u2605 Calculator", "4star": "\u2726 4\u2605 Calculator", odds: "\u{1F3B2} Simulator", build: "\u{1F6E0} Build", other: "\u22EF Other" };
    indicator.textContent = labels[tab] || "";
  }
}
function bindTabBtn(id, tab) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", () => setActiveRarityTab(tab));
}
bindTabBtn("tab5starBtn", "5star");
bindTabBtn("tab4starBtn", "4star");
bindTabBtn("tabOddsBtn", "odds");
bindTabBtn("tabBuildBtn", "build");
bindTabBtn("tabOtherBtn", "other");
(function() {
  const toggleBtn = document.getElementById("navToggleBtn");
  const sidebar = document.querySelector(".sidebar");
  if (!toggleBtn || !sidebar) return;
  function closeNav() {
    sidebar.classList.remove("nav-open");
    toggleBtn.setAttribute("aria-expanded", "false");
  }
  toggleBtn.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("nav-open");
    toggleBtn.setAttribute("aria-expanded", String(isOpen));
  });
  document.querySelectorAll(".sidebar-nav .nav-link").forEach((btn) => {
    btn.addEventListener("click", closeNav);
  });
  document.addEventListener("click", (e) => {
    if (!sidebar.contains(e.target)) closeNav();
  });
})();
