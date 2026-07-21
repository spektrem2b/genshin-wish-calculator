"""
update_data.py

Genshin Wish Calculator database builder — CI data pipeline.

This is a rebuild of the old, monolithic asset/database builder on top of
the newer, cleaner pipeline skeleton. The architecture below is the new
pipeline's; the features are ported in from the old one where the old
one had something the new one was still missing. See the bottom of this
docstring for exactly what came from where.

Pipeline
--------
    Ambr API
       |
       v
    fetch curves, materials, character/weapon rosters
       |
       v
    per character/weapon: fetch detail -> model_dump() to a plain dict
    -> build profile -> write profile               (build+write together,
                                                       one subject at a time)
       |
       v
    build_indexes()      -- disk-driven: reads whatever profile folders
                             exist on disk right now and (re)generates the
                             index files from that, so indexes can always
                             be rebuilt without re-fetching anything.
       |
       v
    cleanup_stale_and_orphans()   -- full-roster runs only (see below)

Output layout
-------------
    Two roots: SCRIPT_DIR (wherever this file lives, e.g. scripts/) for
    build-only artifacts, and DATA_DIR (<project_root>/assets/data/) for
    everything the deployed frontend actually loads.

    SCRIPT_DIR/
        raw_dumps/                         -- processed (model_dump) dumps,
                                              one per subject. NOT a
                                              byte-perfect copy of the raw
                                              Ambr response — see "Old true
                                              raw cache" at the bottom.
        .data-version.json                 -- last-synced Ambr + schema version

    DATA_DIR/  (<project_root>/assets/data/)
        curves/character_curve.json        -- trimmed to levels 1/90/95/100
        curves/weapon_curve.json           -- trimmed to levels 1/90
        shared-assets/materials/<id>.png   -- material icons, deduplicated
                                              across every character/weapon
                                              that references them
        character-profiles/
            index.js                       -- GENSHIN_CHARACTER_PROFILE_INDEX
            <id>/
                info.json
                avatar.png
                skills/
                    talents.json
                    <icons>
                constellations/
                    constellations.json
                    <icons>
                materials/
                    materials.json
        weapon-profiles/
            index.js                       -- GENSHIN_WEAPON_PROFILE_INDEX
            <id>/
                info.json
                avatar.png
                refinements/
                    refinements.json
                materials/
                    materials.json
        characters.js                      -- GENSHIN_CHARACTER_DB [...] plus
                                              frontend lookup helpers
        weapons.js                         -- GENSHIN_WEAPON_DB [...] plus
                                              frontend lookup helpers

Talent classification (why we don't trust ambr-py's own Talent.type):
    Raw `type` only gives 3 buckets (0/1/2), not the 4-5 real kit
    categories. For characters with an alt-sprint-style extra slot
    (Ayaka's Kamisato Art: Senho), Normal Attack, Skill, AND the extra
    slot all come back as type=0. We classify from two independent
    signals instead — icon filename prefix, and position within the
    kit — and flag loudly if they disagree rather than silently
    guessing.

Weapon level-90 stats:
    total = base_stat * curve_multiplier(level=90) + ascension_bonus
    where ascension_bonus is the LAST promote tier's add_stats value
    taken as-is (NOT summed across all promote tiers).

GitHub Actions compatibility
-----------------------------
This script is meant to run unattended in a workflow, not interactively:
  - `python update_data.py` with no manual input, every path resolved
    relative to this file (build artifacts) or its project root
    (deployed data, see "Output layout" above), every required folder
    created automatically.
  - Individual character/weapon failures are caught, logged, and do not
    abort the run — only a failure that stops the pipeline itself (can't
    reach Ambr, can't write output) raises and produces a non-zero exit
    code (see `if __name__ == "__main__"` at the bottom).
  - Output is deterministic: same source data -> same output. All roster
    listings are explicitly (case-insensitively) sorted; nothing depends
    on dict/set iteration order or the local OS/timezone.
  - `--force`, `--only-char`, `--only-weapon` are the only inputs, all
    optional, all safe to omit for a scheduled/dispatched run.

Dependencies: see requirements.txt (ambr-py, aiohttp).

Usage:
    pip install -r requirements.txt
    python update_data.py                          # full sync
    python update_data.py --force                   # ignore version check
    python update_data.py --only-char "Ayaka,Qiqi"   # test a few characters
    python update_data.py --only-weapon "Absolution" # test a few weapons

What came from where
---------------------
Kept from the new pipeline (architecture):
  - model_dump() to plain dicts as early as possible — one representation
    used for both the raw dump and every builder.
  - feature-based profile folders (skills/, constellations/, materials/
    each own their JSON + icons) instead of old's flat per-character files.
  - disk-driven index building — indexes are regenerated by reading
    whatever profile folders currently exist on disk, not from an
    in-memory batch, so a partial/test run never wipes the full roster's
    index and a rebuild never requires re-fetching.
  - build-then-write per subject, one character/weapon at a time (old's
    build-everything-then-write-everything split was NOT ported).

Ported in from the old pipeline (features):
  - case-insensitive sorting for every roster listing.
  - JS helper footers (getGenshinCharacter/searchGenshinCharacters/
    makeCustomCharacter and the weapon equivalents) appended to
    characters.js / weapons.js.
  - character-profiles/index.js and weapon-profiles/index.js.
  - materials: fetch_materials(), a shared id->info lookup, cost-item
    resolution (Mora + material costs), and per-character/per-weapon
    materials.json (ascension materials, categorized buckets, and the
    full per-promote-level cost table).
  - talent detail: full per-level upgrade descriptions, params, Mora
    cost, and resolved material costs (not just n_levels).
  - full roster fetching (fetch_characters()/fetch_weapons()) replacing
    the old hardcoded test lists, while keeping --only-char/--only-weapon
    test filters, 3-star-and-up weapon rarity filtering, quiet skipping
    of non-playable weapon skin variants, and throttling between detail
    fetches.
  - per-character/per-weapon try/except with a failed-item summary at the
    end, so one bad entry can't kill a 500-character run.
  - AssetLocalizer: downloads are deduplicated by URL, retried on
    failure, tracked per top-level folder for cleanup, and fall back to
    the original remote URL (never raise) on a permanent failure.
  - cleanup_stale_and_orphans(): removes profile folders for
    characters/weapons no longer in the upstream roster, and prunes
    asset files that are no longer referenced — only on full-roster runs
    (never in --only-char/--only-weapon test mode, where "not touched
    this run" doesn't mean "no longer exists upstream").
  - shared material icons under shared-assets/materials/, so the same
    material referenced by dozens of characters/weapons is only ever
    downloaded and stored once.
  - version checking (Ambr's own data version + a local DATA_SCHEMA_VERSION
    for when the *shape* of the generated database changes) so a
    scheduled run with nothing new to sync is a cheap no-op.

Deliberately NOT ported from the old pipeline:
  - the build-everything / write-everything split (see above).
  - the old "true raw" cache (byte-perfect copies of the raw API
    response via the client's internal request method). What this
    script writes to raw_dumps/ is the processed model_dump() instead —
    matches the new pipeline's "one representation" choice. Add the old
    true-raw cache back only if a byte-perfect Ambr snapshot is
    specifically needed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys

import aiohttp
import ambr

# ---------------------------------------------------------------- #
# paths & constants — all relative to this file, not the CWD, so
# this runs the same whether it's invoked locally or from a fresh
# GitHub Actions checkout.
# ---------------------------------------------------------------- #

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "assets", "data")

# Build-time artifacts that are NOT part of the deployed dataset stay
# next to the script itself, same as the old pipeline (raw-cache/ and
# .data-version.json both lived outside assets/data there too).
RAW_DIR = os.path.join(SCRIPT_DIR, "raw_dumps")
VERSION_FILE = os.path.join(SCRIPT_DIR, ".data-version.json")

# Everything the frontend actually loads goes under assets/data/.
CURVES_DIR = os.path.join(DATA_DIR, "curves")
CHAR_OUT_DIR = os.path.join(DATA_DIR, "character-profiles")
WEAPON_OUT_DIR = os.path.join(DATA_DIR, "weapon-profiles")
SHARED_ASSETS_DIR = os.path.join(DATA_DIR, "shared-assets", "materials")

# Bump this whenever the *shape* of the generated database changes, even
# if Ambr's own data hasn't — forces a full rebuild so nothing downstream
# ever reads a stale-shaped database. Set to 3 (old pipeline topped out
# at 2) specifically so migrating from old_update_data.py's output
# always forces a full rebuild by design, not by coincidence.
DATA_SCHEMA_VERSION = 3

CHARACTER_CURVE_LEVELS = ["1", "90", "95", "100"]
WEAPON_CURVE_LEVELS = ["1", "90"]

DETAIL_FETCH_DELAY = 0.4  # seconds between per-character/weapon detail calls
ASSET_DOWNLOAD_CONCURRENCY = 8
ASSET_MAX_RETRIES = 3
ASSET_RETRY_BACKOFF = 0.75  # seconds, multiplied by attempt number

ELEMENT_MAP = {
    "Wind": "Anemo",
    "Rock": "Geo",
    "Grass": "Dendro",
    "Electric": "Electro",
    "Fire": "Pyro",
    "Water": "Hydro",
    "Ice": "Cryo",
    "Anemo": "Anemo",
    "Geo": "Geo",
    "Dendro": "Dendro",
    "Electro": "Electro",
    "Pyro": "Pyro",
    "Hydro": "Hydro",
    "Cryo": "Cryo",
}

WEAPON_TYPE_MAP = {
    # Raw Ambr API constants...
    "WEAPON_SWORD_ONE_HAND": "Sword",
    "WEAPON_CLAYMORE": "Claymore",
    "WEAPON_POLE": "Polearm",
    "WEAPON_BOW": "Bow",
    "WEAPON_CATALYST": "Catalyst",
    # ...and identity entries for ambr-py's own already-human-readable
    # enum value (confirmed via a live run: WeaponDetail.type comes back
    # as "Sword", not "WEAPON_SWORD_ONE_HAND" — same situation ELEMENT_MAP
    # already handled for elements, this just closes the same gap here).
    "Sword": "Sword",
    "Claymore": "Claymore",
    "Polearm": "Polearm",
    "Bow": "Bow",
    "Catalyst": "Catalyst",
}

CHARACTERS_JS_FOOTER = """
function getGenshinCharacter(name, rarity = 5) {
    return GENSHIN_CHARACTER_DB.find(c => c.rarity === rarity && c.name.toLowerCase() === name.toLowerCase()) || null;
}

function searchGenshinCharacters(query, rarity = 5) {
    const pool = GENSHIN_CHARACTER_DB.filter(c => c.rarity === rarity);
    if (!query) return pool.slice(0, 10);
    const lowerQuery = query.toLowerCase();
    return pool.filter(c => c.name.toLowerCase().includes(lowerQuery));
}

function makeCustomCharacter(name, rarity = 5) {
    return {
        id: null,
        name: name,
        rarity: rarity,
        element: null,
        icon: 'custom-icons/Lumine_Placeholder_custom.webp',
        isCustom: true
    };
}
"""

WEAPONS_JS_FOOTER = """
function getGenshinWeapon(name, rarity = 5) {
    return GENSHIN_WEAPON_DB.find(w => w.rarity === rarity && w.name.toLowerCase() === name.toLowerCase()) || null;
}

function searchGenshinWeapons(query, rarity = 5) {
    const pool = GENSHIN_WEAPON_DB.filter(w => w.rarity === rarity);
    if (!query) return pool.slice(0, 10);
    const lowerQuery = query.toLowerCase();
    return pool.filter(w => w.name.toLowerCase().includes(lowerQuery));
}

function makeCustomWeapon(name, rarity = 5) {
    return {
        id: null,
        name: name,
        rarity: rarity,
        weaponType: null,
        icon: 'custom-icons/Weapon_Dull_Blade_custom.webp',
        isCustom: true
    };
}
"""


# ---------------------------------------------------------------- #
# small shared helpers
# ---------------------------------------------------------------- #

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path, data):
    # newline="\n" pins the line ending to LF regardless of OS. Without
    # it, Python's text-mode write translates "\n" to os.linesep, so the
    # exact same data produces byte-different files on Windows (dev
    # machines) vs Linux (GitHub Actions runners) — every scheduled CI
    # run would then show a full-file diff even when nothing changed.
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    print(f"  wrote {path}")


def write_js_db(path, const_name, entries, footer=""):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(f"const {const_name} = ")
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        if footer:
            f.write(footer)
    print(f"  wrote {path}  ({len(entries)} entries)")


def normalize_element(raw):
    if not raw:
        return None
    mapped = ELEMENT_MAP.get(raw)
    if mapped is None:
        print(f"  !! unmapped element '{raw}' — add it to ELEMENT_MAP, leaving as-is for now.")
        return raw
    return mapped


def normalize_weapon_type(raw):
    if not raw:
        return None
    mapped = WEAPON_TYPE_MAP.get(raw)
    if mapped is None:
        print(f"  !! unmapped weapon_type '{raw}' — add it to WEAPON_TYPE_MAP, leaving as-is for now.")
        return raw
    return mapped


def trim_curve(curve: dict, levels: list) -> dict:
    return {lvl: curve[lvl] for lvl in levels if lvl in curve}


def curve_multiplier(curve: dict, level, curve_id):
    """{level_str: {"curveInfos": {curve_id: multiplier}}} lookup."""
    if curve is None:
        return None
    level_entry = curve.get(str(level))
    if not level_entry:
        return None
    return level_entry.get("curveInfos", {}).get(curve_id)


def parse_needles(raw: str | None):
    """Turns a comma-separated --only-char/--only-weapon value into a
    lowercased set of name-substring/exact-id needles, or None if the
    flag wasn't given."""
    if not raw:
        return None
    return {n.strip().lower() for n in raw.split(",") if n.strip()}


def matches_needle(entity, needles: set) -> bool:
    return any(n in entity.name.lower() or str(entity.id) == n for n in needles)


# ---------------------------------------------------------------- #
# asset localization — downloads remote Ambr icon URLs and rewrites
# them into local, root-relative paths. Deduplicated by URL, retried
# on failure, tracked per top-level folder for cleanup, and falls
# back to the remote URL (never raises) on a permanent failure so a
# network hiccup can't wipe out data we already have.
# ---------------------------------------------------------------- #

class AssetLocalizer:
    def __init__(self, session: aiohttp.ClientSession):
        self._session = session
        self._sem = asyncio.Semaphore(ASSET_DOWNLOAD_CONCURRENCY)
        self._cache: dict[str, str] = {}          # url -> local rel path
        self.used_paths: dict[str, set] = {}        # top folder -> {rel paths}
        self.stats = {"downloaded": 0, "reused": 0, "failed": 0}

    def _mark_used(self, rel_path: str):
        parts = rel_path.split("/")
        top = "/".join(parts[:2]) if len(parts) > 1 else parts[0]
        self.used_paths.setdefault(top, set()).add(rel_path)

    async def _download(self, url: str, abs_path: str) -> bool:
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        for attempt in range(1, ASSET_MAX_RETRIES + 1):
            try:
                async with self._sem:
                    async with self._session.get(
                        url,
                        timeout=aiohttp.ClientTimeout(total=30),
                        headers={"User-Agent": "Mozilla/5.0"},
                    ) as resp:
                        if resp.status != 200:
                            raise RuntimeError(f"HTTP {resp.status}")
                        data = await resp.read()
                tmp_path = abs_path + ".tmp"
                with open(tmp_path, "wb") as f:
                    f.write(data)
                os.replace(tmp_path, abs_path)
                return True
            except Exception as e:
                if attempt < ASSET_MAX_RETRIES:
                    await asyncio.sleep(ASSET_RETRY_BACKOFF * attempt)
                else:
                    print(f"    ! asset download failed after {ASSET_MAX_RETRIES} attempts: {url} ({e})")
        return False

    async def localize(self, url, rel_path: str):
        """Ensures `url` is downloaded to DATA_DIR/rel_path and returns
        rel_path on success, or the original url unchanged on failure (so
        a network hiccup degrades gracefully instead of losing data)."""
        if not url:
            return None

        if url in self._cache:
            self.stats["reused"] += 1
            self._mark_used(self._cache[url])
            return self._cache[url]

        abs_path = os.path.join(DATA_DIR, rel_path)
        if os.path.exists(abs_path) and os.path.getsize(abs_path) > 0:
            self.stats["reused"] += 1
            self._cache[url] = rel_path
            self._mark_used(rel_path)
            return rel_path

        ok = await self._download(url, abs_path)
        if ok:
            self.stats["downloaded"] += 1
            self._cache[url] = rel_path
            self._mark_used(rel_path)
            return rel_path

        self.stats["failed"] += 1
        return url


def material_asset_rel(mat_id) -> str:
    return f"shared-assets/materials/{mat_id}.png"


# ---------------------------------------------------------------- #
# materials — shared lookup, cost resolution, categorization
# ---------------------------------------------------------------- #

def build_material_lookup(materials_raw: list) -> dict:
    lookup = {}
    for m in materials_raw:
        lookup[m.get("id")] = {
            "name": m.get("name"),
            "icon": m.get("icon"),
            "rarity": m.get("rarity"),
        }
    return lookup


def categorize_character_material(mat_id):
    """Buckets an ascension material id by Ambr's numeric id-prefix
    scheme. The full flat list is always kept as a fallback/superset;
    an id that doesn't fit a bucket just doesn't get double-listed."""
    if mat_id == 104319:
        return "talentBooks"  # Crown of Insight
    if 101000 <= mat_id < 102000:
        return "localSpecialty"
    if 104100 <= mat_id < 104200:
        return "ascensionGems"
    if 104300 <= mat_id < 104400:
        return "talentBooks"
    if 112000 <= mat_id < 114000:
        return "enemyDrops"
    return None


def categorize_weapon_material(mat_id):
    """112xxx = common enemy drops (shared with characters, e.g. Drive
    Shafts), 114xxx = weapon-only ascension ore/crystal materials."""
    if 112000 <= mat_id < 113000:
        return "enemyDrops"
    if 114000 <= mat_id < 115000:
        return "weaponMaterials"
    return None


async def resolve_cost_items(cost_items, material_lookup: dict, localizer: AssetLocalizer) -> list:
    if not cost_items:
        return []
    resolved = []
    for item in cost_items:
        mat_id = item.get("id")
        info = material_lookup.get(mat_id, {})
        icon = await localizer.localize(info.get("icon"), material_asset_rel(mat_id))
        qty = item.get("amount", item.get("count"))
        resolved.append({
            "id": mat_id,
            "name": info.get("name"),
            "icon": icon,
            "rarity": info.get("rarity"),
            "qty": qty,
        })
    return resolved


# ---------------------------------------------------------------- #
# talent classification
#
# Deliberately not using ambr-py's own Talent.type (see module
# docstring). We derive the category from two independent signals —
# icon filename prefix, and position within the kit — and flag loudly
# if they disagree rather than silently guessing.
# ---------------------------------------------------------------- #

def classify_by_icon(icon_url):
    fname = (icon_url or "").rsplit("/", 1)[-1]
    if fname.startswith("Skill_A_"):
        return "normal_attack"
    if fname.startswith("Skill_E_"):
        return "burst"
    if fname.startswith("UI_Talent_"):
        return "passive"
    if fname.startswith("Skill_S_"):
        return "skill_or_alt"
    return "unknown"


def classify_talent_types(talents_raw: list) -> list:
    """Returns one type-label string per talent, e.g. "normal_attack",
    "skill", "alt_sprint", "burst", "passive", or
    "DISAGREEMENT(icon=...,pos=...)" if the two signals don't match."""
    icon_labels = [classify_by_icon(t.get("icon")) for t in talents_raw]

    skill_group_seen = 0
    resolved_icon_labels = []
    for label in icon_labels:
        if label == "skill_or_alt":
            skill_group_seen += 1
            resolved_icon_labels.append("skill" if skill_group_seen == 1 else "alt_sprint")
        else:
            resolved_icon_labels.append(label)

    position_labels = []
    stage = "normal_attack"
    for t in talents_raw:
        raw_type = t.get("type")
        if stage == "normal_attack":
            position_labels.append("normal_attack")
            stage = "skill"
        elif stage == "skill":
            position_labels.append("skill")
            stage = "alt_sprint_or_burst"
        elif stage == "alt_sprint_or_burst":
            if raw_type == 1:
                position_labels.append("burst")
                stage = "passive"
            else:
                position_labels.append("alt_sprint")
        else:
            position_labels.append("passive")

    labels = []
    for icon_label, pos_label in zip(resolved_icon_labels, position_labels):
        agree = icon_label == pos_label
        labels.append(pos_label if agree else f"DISAGREEMENT(icon={icon_label},pos={pos_label})")
    return labels


async def build_talents_doc(char_id, talents_raw, skills_dir, material_lookup, localizer):
    """Per-talent icon + full per-level scaling: descriptions, params,
    Mora cost, and resolved material costs — not just n_levels."""
    labels = classify_talent_types(talents_raw)

    results = []
    passive_n = 0
    for idx, (t, label) in enumerate(zip(talents_raw, labels)):
        resolved_label = label if "DISAGREEMENT" not in label else "unknown"
        if resolved_label == "passive":
            passive_n += 1
            local_fname = f"{idx:02d}_passive_{passive_n}.png"
        else:
            local_fname = f"{idx:02d}_{resolved_label}.png"
        icon_rel = await localizer.localize(
            t.get("icon"), f"character-profiles/{char_id}/skills/{local_fname}"
        )

        levels = []
        for u in (t.get("upgrades") or []):
            items = await resolve_cost_items(u.get("cost_items"), material_lookup, localizer)
            levels.append({
                "level": u.get("level"),
                "description": u.get("description"),
                "params": u.get("params"),
                "moraCost": u.get("mora_cost"),
                "items": items,
            })

        results.append({
            "name": t.get("name"),
            "type": label,
            "icon": icon_rel,
            "cooldown": t.get("cooldown"),
            "cost": t.get("cost"),
            "levels": levels,
        })

    mismatches = [r for r in results if "DISAGREEMENT" in r["type"]]
    if mismatches:
        print(f"  !! {len(mismatches)} talent classification mismatch(es) for char {char_id} — check before trusting this profile.")
    return results


async def build_constellations_doc(char_id, constellations_raw, localizer):
    results = []
    for idx, c in enumerate(constellations_raw):
        icon_rel = await localizer.localize(
            c.get("icon"), f"character-profiles/{char_id}/constellations/{idx:02d}_const.png"
        )
        results.append({
            "name": c.get("name"),
            "description": c.get("description"),
            "icon": icon_rel,
        })
    return results


async def build_character_materials_doc(detail, material_lookup, localizer):
    ascension_materials = []
    buckets = {"ascensionGems": [], "localSpecialty": [], "talentBooks": [], "enemyDrops": []}

    for m in detail.get("ascension_materials") or []:
        mat_id = m.get("id")
        info = material_lookup.get(mat_id, {})
        icon = await localizer.localize(info.get("icon"), material_asset_rel(mat_id))
        entry = {"id": mat_id, "name": info.get("name"), "icon": icon, "rarity": m.get("rarity")}
        ascension_materials.append(entry)
        bucket = categorize_character_material(mat_id)
        if bucket:
            buckets[bucket].append(entry)

    promotes = []
    for p in (detail.get("upgrade") or {}).get("promotes") or []:
        promotes.append({
            "promoteLevel": p.get("promote_level"),
            "unlockMaxLevel": p.get("unlock_max_level"),
            "moraCost": p.get("coin_cost"),
            "requiredPlayerLevel": p.get("required_player_level"),
            "items": await resolve_cost_items(p.get("cost_items"), material_lookup, localizer),
        })

    return {
        "ascensionMaterials": ascension_materials,
        "ascensionGems": buckets["ascensionGems"],
        "localSpecialty": buckets["localSpecialty"],
        "talentBooks": buckets["talentBooks"],
        "enemyDrops": buckets["enemyDrops"],
        "promotes": promotes,
    }


# ---------------------------------------------------------------- #
# character profile building
# ---------------------------------------------------------------- #

async def build_character_profile(detail, material_lookup, localizer):
    char_id = str(detail["id"])
    name = detail["name"]
    print(f"\n=== character profile: {name} (id {char_id}) ===")

    char_dir = os.path.join(CHAR_OUT_DIR, char_id)
    skills_dir = os.path.join(char_dir, "skills")
    constellations_dir = os.path.join(char_dir, "constellations")
    materials_dir = os.path.join(char_dir, "materials")

    avatar_rel = await localizer.localize(detail.get("icon"), f"character-profiles/{char_id}/avatar.png")

    info = {
        "id": detail.get("id"),
        "name": detail.get("name"),
        "element": normalize_element(detail.get("element")),
        "weapon_type": normalize_weapon_type(detail.get("weapon_type")),
        "rarity": detail.get("rarity"),
        "region": detail.get("region"),
        "birthday": detail.get("birthday"),
        "release": detail.get("release"),
        "icon": avatar_rel,
    }
    dump_json(os.path.join(char_dir, "info.json"), info)

    talents = await build_talents_doc(char_id, detail.get("talents") or [], skills_dir, material_lookup, localizer)
    dump_json(os.path.join(skills_dir, "talents.json"), talents)

    constellations = await build_constellations_doc(char_id, detail.get("constellations") or [], localizer)
    dump_json(os.path.join(constellations_dir, "constellations.json"), constellations)

    materials_doc = await build_character_materials_doc(detail, material_lookup, localizer)
    dump_json(os.path.join(materials_dir, "materials.json"), materials_doc)


# ---------------------------------------------------------------- #
# weapon profile building
# ---------------------------------------------------------------- #

async def build_weapon_materials_doc(detail, material_lookup, localizer):
    ascension_materials = []
    buckets = {"enemyDrops": [], "weaponMaterials": []}

    for m in detail.get("ascension_materials") or []:
        mat_id = m.get("id")
        info = material_lookup.get(mat_id, {})
        icon = await localizer.localize(info.get("icon"), material_asset_rel(mat_id))
        entry = {"id": mat_id, "name": info.get("name"), "icon": icon, "rarity": m.get("rarity")}
        ascension_materials.append(entry)
        bucket = categorize_weapon_material(mat_id)
        if bucket:
            buckets[bucket].append(entry)

    promotes = []
    for p in (detail.get("upgrade") or {}).get("promotes") or []:
        promotes.append({
            "promoteLevel": p.get("promote_level"),
            "unlockMaxLevel": p.get("unlock_max_level"),
            "moraCost": p.get("coin_cost"),
            "requiredPlayerLevel": p.get("required_player_level"),
            "items": await resolve_cost_items(p.get("cost_items"), material_lookup, localizer),
        })

    return {
        "ascensionMaterials": ascension_materials,
        "enemyDrops": buckets["enemyDrops"],
        "weaponMaterials": buckets["weaponMaterials"],
        "promotes": promotes,
    }


async def build_weapon_profile(detail, weapon_curve, material_lookup, localizer):
    weapon_id = str(detail["id"])
    name = detail["name"]
    print(f"\n=== weapon profile: {name} (id {weapon_id}) ===")

    weapon_dir = os.path.join(WEAPON_OUT_DIR, weapon_id)
    refinements_dir = os.path.join(weapon_dir, "refinements")
    materials_dir = os.path.join(weapon_dir, "materials")

    avatar_rel = await localizer.localize(detail.get("icon"), f"weapon-profiles/{weapon_id}/avatar.png")

    base_stats = (detail.get("upgrade") or {}).get("base_stats") or []
    base_atk = next((s for s in base_stats if s.get("prop_type") == "FIGHT_PROP_BASE_ATTACK"), None)
    substat = next((s for s in base_stats if s.get("prop_type") != "FIGHT_PROP_BASE_ATTACK"), None)

    # See module docstring: last promote's add_stats is the full
    # cumulative ascension bonus, NOT a delta to sum across promotes.
    promotes_raw = (detail.get("upgrade") or {}).get("promotes") or []
    max_promote = max(promotes_raw, key=lambda p: p.get("promote_level", 0)) if promotes_raw else None
    ascension_atk_bonus = 0
    if max_promote and max_promote.get("add_stats"):
        for stat in max_promote["add_stats"]:
            if stat.get("id") == "FIGHT_PROP_BASE_ATTACK":
                ascension_atk_bonus = stat.get("value", 0)

    base_atk_lvl90 = None
    substat_lvl90 = None
    if base_atk:
        mult = curve_multiplier(weapon_curve, 90, base_atk["growth_type"])
        if mult is not None:
            base_atk_lvl90 = round(base_atk["init_value"] * mult + ascension_atk_bonus, 1)
    if substat:
        mult = curve_multiplier(weapon_curve, 90, substat["growth_type"])
        if mult is not None:
            substat_lvl90 = round(substat["init_value"] * mult, 4)

    info = {
        "id": detail.get("id"),
        "name": detail.get("name"),
        "type": normalize_weapon_type(detail.get("type")),
        "rarity": detail.get("rarity"),
        "description": detail.get("description"),
        "icon": avatar_rel,
        "base_atk_lvl1": base_atk.get("init_value") if base_atk else None,
        "base_atk_lvl90": base_atk_lvl90,
        "substat_type": substat.get("prop_type") if substat else None,
        "substat_lvl1": substat.get("init_value") if substat else None,
        "substat_lvl90": substat_lvl90,
    }
    dump_json(os.path.join(weapon_dir, "info.json"), info)

    affix = detail.get("affix") or {}
    refinements = {
        "name": affix.get("name"),
        "levels": [
            {"refinement": u["level"] + 1, "description": u["description"]}
            for u in affix.get("upgrades", [])
        ],
    }
    dump_json(os.path.join(refinements_dir, "refinements.json"), refinements)

    materials_doc = await build_weapon_materials_doc(detail, material_lookup, localizer)
    dump_json(os.path.join(materials_dir, "materials.json"), materials_doc)


# ---------------------------------------------------------------- #
# roster index (characters.js / weapons.js / per-profile index.js)
#
# Disk-driven: reads whatever profile folders currently exist on
# disk and regenerates the indexes from that. This means indexes can
# be rebuilt without re-fetching anything, and a filtered
# (--only-char/--only-weapon) run never wipes the rest of the roster
# out of the index — folders this run didn't touch are still sitting
# on disk and still get picked up.
# ---------------------------------------------------------------- #

def build_indexes():
    char_entries = []
    if os.path.isdir(CHAR_OUT_DIR):
        for char_id in sorted(os.listdir(CHAR_OUT_DIR)):
            info_path = os.path.join(CHAR_OUT_DIR, char_id, "info.json")
            if not os.path.isfile(info_path):
                continue
            info = load_json(info_path)
            char_entries.append({
                "id": info["id"],
                "name": info["name"],
                "rarity": info["rarity"],
                "element": info["element"],
                "icon": info["icon"],
                "isCustom": False,
            })
    char_entries.sort(key=lambda e: (e["name"] or "").lower())  # case-insensitive
    write_js_db(os.path.join(DATA_DIR, "characters.js"), "GENSHIN_CHARACTER_DB", char_entries, CHARACTERS_JS_FOOTER)

    weapon_entries = []
    if os.path.isdir(WEAPON_OUT_DIR):
        for weapon_id in sorted(os.listdir(WEAPON_OUT_DIR)):
            info_path = os.path.join(WEAPON_OUT_DIR, weapon_id, "info.json")
            if not os.path.isfile(info_path):
                continue
            info = load_json(info_path)
            weapon_entries.append({
                "id": info["id"],
                "name": info["name"],
                "rarity": info["rarity"],
                "weaponType": info["type"],
                "icon": info["icon"],
                "isCustom": False,
            })
    weapon_entries.sort(key=lambda e: (e["name"] or "").lower())  # case-insensitive
    write_js_db(os.path.join(DATA_DIR, "weapons.js"), "GENSHIN_WEAPON_DB", weapon_entries, WEAPONS_JS_FOOTER)

    # Richer per-profile indexes the frontend's build tab uses to resolve
    # a name to an id before fetching that one character's/weapon's files.
    char_profile_index = [
        {"id": e["id"], "name": e["name"], "rarity": e["rarity"], "element": e["element"], "icon": e["icon"]}
        for e in char_entries
    ]
    char_index_path = os.path.join(CHAR_OUT_DIR, "index.js")
    with open(char_index_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("const GENSHIN_CHARACTER_PROFILE_INDEX = ")
        json.dump(char_profile_index, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    print(f"  wrote {char_index_path}  ({len(char_profile_index)} entries)")

    weapon_profile_index = [
        {"id": e["id"], "name": e["name"], "rarity": e["rarity"], "type": e["weaponType"], "icon": e["icon"]}
        for e in weapon_entries
    ]
    weapon_index_path = os.path.join(WEAPON_OUT_DIR, "index.js")
    with open(weapon_index_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("const GENSHIN_WEAPON_PROFILE_INDEX = ")
        json.dump(weapon_profile_index, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    print(f"  wrote {weapon_index_path}  ({len(weapon_profile_index)} entries)")


# ---------------------------------------------------------------- #
# cleanup — full-roster runs only. In --only-char/--only-weapon test
# mode, "not touched this run" doesn't mean "no longer exists
# upstream", so nothing gets deleted.
# ---------------------------------------------------------------- #

def cleanup_stale_and_orphans(valid_char_ids: set, valid_weapon_ids: set, localizer: AssetLocalizer, test_mode: bool):
    if test_mode:
        print("TEST MODE: skipping cleanup (only a subset of the roster was fetched this run).")
        return

    removed_folders = 0
    if os.path.isdir(CHAR_OUT_DIR):
        for name in sorted(os.listdir(CHAR_OUT_DIR)):
            if name == "index.js":
                continue
            full = os.path.join(CHAR_OUT_DIR, name)
            if os.path.isdir(full) and name not in valid_char_ids:
                print(f"  removing stale character folder: {name}")
                shutil.rmtree(full)
                removed_folders += 1

    if os.path.isdir(WEAPON_OUT_DIR):
        for name in sorted(os.listdir(WEAPON_OUT_DIR)):
            if name == "index.js":
                continue
            full = os.path.join(WEAPON_OUT_DIR, name)
            if os.path.isdir(full) and name not in valid_weapon_ids:
                print(f"  removing stale weapon folder: {name}")
                shutil.rmtree(full)
                removed_folders += 1

    # Prune asset files inside folders that WERE touched this run and are
    # no longer referenced (e.g. an old icon left behind after a
    # character's art changed, or a material no longer used by anything).
    removed_assets = 0
    for top, used in localizer.used_paths.items():
        top_abs = os.path.join(DATA_DIR, top)
        if not os.path.isdir(top_abs):
            continue
        used_abs = {os.path.normpath(os.path.join(DATA_DIR, p)) for p in used}
        for root, _dirs, files in os.walk(top_abs):
            for fname in files:
                if fname.endswith(".json") or fname.endswith(".js"):
                    continue
                full = os.path.normpath(os.path.join(root, fname))
                if full not in used_abs:
                    os.remove(full)
                    removed_assets += 1

    if removed_folders:
        print(f"  removed {removed_folders} stale folder(s)")
    if removed_assets:
        print(f"  removed {removed_assets} orphaned asset file(s)")


# ---------------------------------------------------------------- #
# versioning
# ---------------------------------------------------------------- #

def read_stored_version():
    if not os.path.exists(VERSION_FILE):
        return None
    with open(VERSION_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return None


def write_stored_version(ambr_version: str):
    with open(VERSION_FILE, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"ambr_version": ambr_version, "schema_version": DATA_SCHEMA_VERSION}, f, indent=2)


# ---------------------------------------------------------------- #
# fetch + orchestrate
# ---------------------------------------------------------------- #

async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force", action="store_true",
        help="Rebuild everything even if Ambr's version and the schema version are unchanged.",
    )
    parser.add_argument(
        "--only-char", metavar="NAME_OR_ID[,NAME_OR_ID...]", default=None,
        help="TEST MODE: only fetch/build these characters. Comma-separated, "
             "case-insensitive substring match on name, or an exact numeric id. "
             "Implies --force. Cleanup is skipped entirely in this mode.",
    )
    parser.add_argument(
        "--only-weapon", metavar="NAME_OR_ID[,NAME_OR_ID...]", default=None,
        help="TEST MODE: only fetch/build these weapons. Same matching rules as "
             "--only-char. Implies --force. Cleanup is skipped entirely in this mode.",
    )
    args = parser.parse_args()

    test_mode = bool(args.only_char or args.only_weapon)
    if test_mode:
        args.force = True
        print("### update_data.py TEST-FILTER BUILD (--only-char/--only-weapon active) ###")

    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(CURVES_DIR, exist_ok=True)
    os.makedirs(CHAR_OUT_DIR, exist_ok=True)
    os.makedirs(WEAPON_OUT_DIR, exist_ok=True)
    os.makedirs(SHARED_ASSETS_DIR, exist_ok=True)

    failed_chars = []
    failed_weapons = []

    async with ambr.AmbrAPI(lang=ambr.Language.EN, cache_ttl=60 * 60 * 24 * 7) as client:
        print("Checking Ambr data version...")
        latest_version = await client.fetch_latest_version()
        stored = read_stored_version()
        stored_version = stored.get("ambr_version") if stored else None
        stored_schema = stored.get("schema_version") if stored else None

        schema_changed = stored_schema != DATA_SCHEMA_VERSION
        version_changed = stored_version != latest_version

        if not args.force and not schema_changed and not version_changed:
            print(f"No change detected (Ambr version {latest_version}, schema v{DATA_SCHEMA_VERSION}). Skipping update.")
            return

        if test_mode:
            print(f"TEST MODE: only-char={args.only_char!r} only-weapon={args.only_weapon!r}")
        elif schema_changed and stored_schema is not None:
            print(f"Schema version changed ({stored_schema} -> {DATA_SCHEMA_VERSION}). Forcing full rebuild.")
        elif args.force:
            print("--force passed. Running full rebuild regardless of version checks.")
        else:
            print(f"Ambr version changed: {stored_version!r} -> {latest_version!r}. Running full sync...")

        async with aiohttp.ClientSession() as asset_session:
            localizer = AssetLocalizer(asset_session)

            print("\nFetching character_curve...")
            character_curve = trim_curve(await client.fetch_avatar_curve(), CHARACTER_CURVE_LEVELS)
            dump_json(os.path.join(CURVES_DIR, "character_curve.json"), character_curve)

            print("Fetching weapon_curve...")
            weapon_curve = trim_curve(await client.fetch_weapon_curve(), WEAPON_CURVE_LEVELS)
            dump_json(os.path.join(CURVES_DIR, "weapon_curve.json"), weapon_curve)

            print("Fetching materials...")
            materials_raw = [m.model_dump(mode="json") for m in await client.fetch_materials()]
            material_lookup = build_material_lookup(materials_raw)
            print(f"  loaded {len(material_lookup)} materials into lookup table")

            print("\nFetching character roster...")
            characters = await client.fetch_characters()
            print(f"  {len(characters)} characters total")
            char_needles = parse_needles(args.only_char)
            if char_needles:
                characters = [c for c in characters if matches_needle(c, char_needles)]
                print(f"  (test filter) narrowed to {len(characters)}: {[c.name for c in characters]}")

            print("\nFetching weapon roster...")
            weapons = await client.fetch_weapons()
            print(f"  {len(weapons)} weapons total")
            # 1-2 star weapons are never usable in the wish/build tabs.
            eligible_weapons = [w for w in weapons if w.rarity >= 3]
            print(f"  ({len(weapons) - len(eligible_weapons)} weapons at 1-2 star skipped)")
            weapon_needles = parse_needles(args.only_weapon)
            if weapon_needles:
                eligible_weapons = [w for w in eligible_weapons if matches_needle(w, weapon_needles)]
                print(f"  (test filter) narrowed to {len(eligible_weapons)}: {[w.name for w in eligible_weapons]}")

            valid_char_ids = set()
            valid_weapon_ids = set()

            # -- Characters --
            print(f"\nBuilding character profiles ({DETAIL_FETCH_DELAY}s throttle between fetches)...")
            total = len(characters)
            for i, c in enumerate(characters, 1):
                char_id = str(c.id)
                try:
                    detail = await client.fetch_character_detail(c.id)
                    detail_dict = detail.model_dump(mode="json")
                    dump_json(
                        os.path.join(RAW_DIR, f"character_{char_id}_{c.name.replace(' ', '_')}.json"),
                        detail_dict,
                    )
                    await build_character_profile(detail_dict, material_lookup, localizer)
                    valid_char_ids.add(char_id)
                    print(f"  [{i}/{total}] OK: {c.name}")
                except Exception as e:
                    # A folder that failed to build is kept out of
                    # cleanup's stale-removal set below by adding its id
                    # here too — a transient failure shouldn't look
                    # identical to "this character was removed upstream".
                    failed_chars.append((char_id, c.name, str(e)))
                    valid_char_ids.add(char_id)
                    print(f"  [{i}/{total}] FAILED (build): {c.name} ({char_id}) - {e}")
                await asyncio.sleep(DETAIL_FETCH_DELAY)

            # -- Weapons --
            print(f"\nBuilding weapon profiles ({DETAIL_FETCH_DELAY}s throttle between fetches)...")
            total = len(eligible_weapons)
            for i, w in enumerate(eligible_weapons, 1):
                weapon_id = str(w.id)
                try:
                    detail = await client.fetch_weapon_detail(w.id)
                    detail_dict = detail.model_dump(mode="json")
                    dump_json(
                        os.path.join(RAW_DIR, f"weapon_{weapon_id}_{w.name.replace(' ', '_')}.json"),
                        detail_dict,
                    )
                    await build_weapon_profile(detail_dict, weapon_curve, material_lookup, localizer)
                    valid_weapon_ids.add(weapon_id)
                    print(f"  [{i}/{total}] OK: {w.name}")
                except Exception as e:
                    # Weapon skins (e.g. "X - Sublimation" reforged
                    # variants) share their base weapon's stats entirely
                    # and carry no independent ascension/refinement data
                    # of their own — not a real fetch failure, just a
                    # catalog entry with nothing new to pull.
                    missing = ("storyId", "affix", "upgrade", "ascension")
                    err_text = str(e)
                    if all(f"{field_name}\n  Field required" in err_text for field_name in missing):
                        print(f"  [{i}/{total}] SKIPPED (non-playable skin variant): {w.name}")
                    else:
                        failed_weapons.append((weapon_id, w.name, str(e)))
                        valid_weapon_ids.add(weapon_id)
                        print(f"  [{i}/{total}] FAILED (build): {w.name} ({weapon_id}) - {e}")
                await asyncio.sleep(DETAIL_FETCH_DELAY)

            print("\nBuilding roster indexes (disk-driven)...")
            build_indexes()

            cleanup_stale_and_orphans(valid_char_ids, valid_weapon_ids, localizer, test_mode)

            print("\nAsset stats:")
            print(f"  downloaded: {localizer.stats['downloaded']}")
            print(f"  reused (already local): {localizer.stats['reused']}")
            print(f"  failed (kept remote URL as fallback): {localizer.stats['failed']}")

        if not test_mode:
            write_stored_version(latest_version)

    if failed_chars:
        print(f"\n{len(failed_chars)} character(s) failed to build and were left untouched:")
        for cid, cname, err in failed_chars:
            print(f"  - {cname} ({cid}): {err}")
    if failed_weapons:
        print(f"\n{len(failed_weapons)} weapon(s) failed to build and were left untouched:")
        for wid, wname, err in failed_weapons:
            print(f"  - {wname} ({wid}): {err}")

    print("\nDone.")


if __name__ == "__main__":
    if sys.version_info < (3, 10):
        print("This script requires Python 3.10+ (uses `X | None` type unions).", file=sys.stderr)
        sys.exit(1)
    try:
        asyncio.run(main())
    except Exception as exc:
        # A per-character/per-weapon failure is caught and logged well
        # before this point — only reaching here means the pipeline
        # itself couldn't complete (roster fetch failed, disk write
        # failed, etc). That's the only case that should fail CI.
        print(f"\nFATAL: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
