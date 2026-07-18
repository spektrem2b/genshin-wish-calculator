console.log("BUILD a3a145f");

// Shared debounce helper — delays a function until `wait` ms after the
// last call, so rapid-fire events (typing, etc.) only trigger it once
// the user pauses instead of on every single keystroke.
function debounce(fn, wait = 150) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}
function setActiveRarityTab(tab) {
    const is5 = tab === '5star';
    const is4 = tab === '4star';
    const isOdds = tab === 'odds';
    const isBuild = tab === 'build';
    const isOther = tab === 'other';

    document.getElementById('tab5starContent').classList.toggle('hidden', !is5);
    document.getElementById('tab4starContent').classList.toggle('hidden', !is4);
    document.getElementById('tabOddsContent').classList.toggle('hidden', !isOdds);
    document.getElementById('tabBuildContent').classList.toggle('hidden', !isBuild);
    document.getElementById('tabOtherContent').classList.toggle('hidden', !isOther);

    const btn5 = document.getElementById('tab5starBtn');
    const btn4 = document.getElementById('tab4starBtn');
    const btnOdds = document.getElementById('tabOddsBtn');
    const btnBuild = document.getElementById('tabBuildBtn');
    const btnOther = document.getElementById('tabOtherBtn');
    [[btn5, is5], [btn4, is4], [btnOdds, isOdds], [btnBuild, isBuild], [btnOther, isOther]].forEach(([btn, active]) => {
        btn.classList.toggle('active', active);
    });

    if (isOdds && typeof activateOddsTab === 'function') activateOddsTab();
    if (isBuild && typeof activateBuildTab === 'function') activateBuildTab();
    if (isOther && typeof activateOtherTab === 'function') activateOtherTab();

    const indicator = document.getElementById('mobileTabLabel');
    if (indicator) {
        const labels = { '5star': '✦ 5★ Calculator', '4star': '✦ 4★ Calculator', odds: '🎲 Simulator', build: '🛠 Build', other: '⋯ Other' };
        indicator.textContent = labels[tab] || '';
    }
}

document.getElementById('tab5starBtn').addEventListener('click', () => setActiveRarityTab('5star'));
document.getElementById('tab4starBtn').addEventListener('click', () => setActiveRarityTab('4star'));
document.getElementById('tabOddsBtn').addEventListener('click', () => setActiveRarityTab('odds'));
document.getElementById('tabBuildBtn').addEventListener('click', () => setActiveRarityTab('build'));
document.getElementById('tabOtherBtn').addEventListener('click', () => setActiveRarityTab('other'));

(function () {
    const toggleBtn = document.getElementById('navToggleBtn');
    const sidebar = document.querySelector('.sidebar');
    if (!toggleBtn || !sidebar) return;

    function closeNav() {
        sidebar.classList.remove('nav-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
    }

    toggleBtn.addEventListener('click', () => {
        const isOpen = sidebar.classList.toggle('nav-open');
        toggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    document.querySelectorAll('.sidebar-nav .nav-link').forEach((btn) => {
        btn.addEventListener('click', closeNav);
    });

    document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target)) closeNav();
    });
})();

