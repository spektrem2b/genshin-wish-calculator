// character-info-tab.js
//
// Placeholder for a future "Character Info" tab. Not wired up anywhere yet —
// just staking out the shape of it so future-me doesn't have to start cold.
//
// Previously, Abilities + Constellations lived as side panels bolted onto
// the Build tab's main planner layout (tab-build.js). They've been pulled
// out entirely so the planner can stay focused on the actual build config.
// This is where that info (and more) should eventually live instead, as
// its own dedicated tab/view.

(function () {
    'use strict';

    // ---------------------------------------------------------------------
    // TODO: Abilities block
    // ---------------------------------------------------------------------
    // - Active talents (Normal Attack / Elemental Skill / Elemental Burst,
    //   plus any extras like Ayaka's Senho or cooking talents).
    // - Passive talents.
    // - Click-to-expand description, reusing/rebuilding the old skill-modal
    //   pattern (icon + type + name + description).
    // - Source data: character.profile.talents (flat array, filter on
    //   presence of `.levels` for active vs. passive — see tab-build.js's
    //   fetchCharacterProfile for the merge logic)
    //   (assets/data/character-profiles/<id>/{profile,talents}.json).


    // ---------------------------------------------------------------------
    // TODO: Constellations block
    // ---------------------------------------------------------------------
    // - C1–C6, name + description, same click-to-expand treatment as
    //   Abilities so the two feel consistent.
    // - Source data: character.profile.constellations[].{name, description, icon}
    //   (assets/data/character-profiles/<id>/constellations.json)
    // - "None" state for characters with no constellation data.


    // ---------------------------------------------------------------------
    // TODO: Talent priority / scaling notes (maybe)
    // ---------------------------------------------------------------------
    // - Which talent(s) to prioritize leveling and why, if this ever gets
    //   curated data behind it. Not pulling this from anywhere yet.


    // ---------------------------------------------------------------------
    // TODO: Voice lines / lore blurb (maybe, low priority)
    // ---------------------------------------------------------------------
    // - Just an idea. Not core to the calculator, could be a nice-to-have
    //   if this tab ends up feeling too sparse.


    // ---------------------------------------------------------------------
    // TODO: Tab wiring
    // ---------------------------------------------------------------------
    // - New tab button + panel, same activate/init pattern as the other
    //   tabs (see window.activateBuildTab in tab-build.js for reference).
    // - Character picker shared with / synced to the Build tab? Or its own
    //   independent selection? Decide later.

})();
