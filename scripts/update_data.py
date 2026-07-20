"""
Local database builder for the Genshin Wish Calculator.

This script is no longer a "JSON exporter" — it is a full asset/database
builder. It pulls data from Project Ambr (via ambr-py), caches the raw API
responses locally, downloads and localizes every referenced image asset,
and generates a modular, cache-friendly local database under assets/data/.

The frontend never talks to Ambr directly and never sees a remote CDN URL —
everything it loads comes from files this script produces.

Pipeline
--------
    Ambr API
       |
       v
    fetch_raw_data()      -> raw-cache/ambr/*.json
       |
       v
    download_assets()     -> assets/data/**/assets/*.png (local, deduped)
       |
       v
    build_indexes()        -> assets/data/characters.js, weapons.js
    build_character_profile() / build_talents() / build_constellations()
    build_materials()      -> assets/data/character-profiles/<id>/*.json
                               assets/data/weapon-profiles/<id>/*.json
       |
       v
    cleanup_old_files()    -> removes stale character/weapon folders and
                               orphaned local assets

Gating
------
Two independent version checks decide whether a full rebuild runs:

1. Ambr's own data version (fetch_latest_version()) — unchanged behavior
   from before.
2. DATA_SCHEMA_VERSION, defined in this file — bump this whenever the
   *shape* of the generated database changes, even if Ambr's data hasn't.
   That forces a full rebuild so the frontend never reads a stale-shaped
   database.

Meant to be run manually / by a scheduled job, not automatically:
`pip install -r scripts/requirements.txt` then `python scripts/update_data.py`.

Add `--force` to rebuild everything regardless of version checks (useful
after fixing a bug in this script itself).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
from dataclasses import dataclass, field
from typing import Any

import ambr
import aiohttp

# --------------------------------------------------------------------------
# Paths & constants
# --------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

RAW_CACHE_DIR = os.path.join(PROJECT_ROOT, "raw-cache", "ambr")
DATA_DIR = os.path.join(PROJECT_ROOT, "assets", "data")
CHAR_PROFILES_DIR = os.path.join(DATA_DIR, "character-profiles")
WEAPON_PROFILES_DIR = os.path.join(DATA_DIR, "weapon-profiles")
# Material icons are referenced by dozens of characters/weapons at once
# (e.g. every Mondstadt character shares the same local specialty). Rather
# than duplicate the same bytes into every character folder, materials get
# one shared, id-keyed home and every profile just points at it.
SHARED_ASSETS_DIR = os.path.join(DATA_DIR, "shared-assets", "materials")

VERSION_FILE = os.path.join(SCRIPT_DIR, ".data-version.json")

# Bump this whenever the *shape* of the generated database changes.
DATA_SCHEMA_VERSION = 1

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
    "WEAPON_SWORD_ONE_HAND": "Sword",
    "WEAPON_CLAYMORE": "Claymore",
    "WEAPON_POLE": "Polearm",
    "WEAPON_BOW": "Bow",
    "WEAPON_CATALYST": "Catalyst",
}

TALENT_TYPE_MAP = {
    "NORMAL": "Normal Attack",
    "SKILL": "Elemental Skill",
    "ULTIMATE": "Elemental Burst",
    "PASSIVE": "Passive",
}


def normalize_element(raw):
    if not raw:
        return None
    return ELEMENT_MAP.get(raw, raw)


def normalize_weapon_type(raw):
    if not raw:
        return None
    return WEAPON_TYPE_MAP.get(raw, raw)


def js_value(value):
    return json.dumps(value, ensure_ascii=False)


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
        icon: 'assets/data/custom_icons/Lumine_Placeholder_custom.webp',
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
        icon: 'assets/data/custom_icons/Weapon_Dull_Blade_custom.webp',
        isCustom: true
    };
}
"""


# --------------------------------------------------------------------------
# Asset localization
# --------------------------------------------------------------------------

class AssetLocalizer:
    """
    Downloads remote Ambr/Yatta asset URLs and rewrites them into local,
    relative paths (relative to assets/data/) that the frontend can load
    directly.

    - Never redownloads a file that already exists on disk.
    - Tracks every relative path it hands out this run, per top-level
      folder (e.g. "character-profiles/10000002"), so cleanup_old_files()
      can prune anything no longer referenced without touching folders
      that weren't rebuilt this run.
    - On download failure, falls back to returning the original remote
      URL so the frontend still has *something* to render, and logs the
      failure clearly instead of aborting the whole build.
    """

    def __init__(self, session: aiohttp.ClientSession):
        self._session = session
        self._sem = asyncio.Semaphore(ASSET_DOWNLOAD_CONCURRENCY)
        # url -> local relative path, so identical URLs referenced from
        # multiple places only get downloaded once per run.
        self._cache: dict[str, str] = {}
        self.used_paths: dict[str, set[str]] = {}
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
                    async with self._session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
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

    async def localize(self, url: str | None, rel_path: str) -> str | None:
        """
        Ensures `url` is downloaded to assets/data/<rel_path>, and returns
        `rel_path` on success. On failure, returns the original remote
        `url` as a fallback (never raises).
        """
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


def material_asset_rel(mat_id: int) -> str:
    return f"shared-assets/materials/{mat_id}.png"


def char_asset_rel(char_id: str, subpath: str) -> str:
    return f"character-profiles/{char_id}/assets/{subpath}"


def weapon_asset_rel(weapon_id: int, subpath: str) -> str:
    return f"weapon-profiles/{weapon_id}/assets/{subpath}"


# --------------------------------------------------------------------------
# Raw cache helpers
# --------------------------------------------------------------------------

def raw_cache_path(*parts) -> str:
    return os.path.join(RAW_CACHE_DIR, *parts)


def write_raw_cache(rel_path: str, data: Any):
    path = raw_cache_path(rel_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


async def raw_json(client: "ambr.AmbrAPI", endpoint: str) -> Any:
    """
    Pulls the raw (pre-pydantic) JSON body for an endpoint. ambr-py parses
    everything into models internally, but exposes the underlying request
    method we can reuse — this keeps the raw cache close to the original
    API response instead of a re-serialized model dump. Requests are
    served from ambr-py's own on-disk cache, so this doesn't cost an extra
    network round trip beyond what fetch_* already made.
    """
    return await client._request(endpoint, use_cache=True)  # noqa: SLF001


# --------------------------------------------------------------------------
# Stage 1: fetch_raw_data
# --------------------------------------------------------------------------

@dataclass
class RawData:
    characters: list = field(default_factory=list)
    weapons: list = field(default_factory=list)
    materials: list = field(default_factory=list)
    character_details: dict = field(default_factory=dict)   # id -> CharacterDetail
    weapon_details: dict = field(default_factory=dict)      # id -> WeaponDetail


async def fetch_raw_data(
    client: "ambr.AmbrAPI",
    char_filter: set[str] | None = None,
    weapon_filter: set[str] | None = None,
) -> RawData:
    """
    char_filter/weapon_filter, if given, are lowercased name-substrings or
    exact id strings. When set, only matching characters/weapons go through
    the slow sequential detail-fetch loop below — this is what makes
    --only-char/--only-weapon test runs fast instead of still fetching
    detail for the entire roster before throwing most of it away.
    """
    print("Fetching characters and weapons...")
    characters = await client.fetch_characters()
    weapons = await client.fetch_weapons()
    materials = await client.fetch_materials()
    print(f"Characters fetched: {len(characters)}")
    print(f"Weapons fetched: {len(weapons)}")
    print(f"Materials fetched: {len(materials)}")

    write_raw_cache("characters.json", await raw_json(client, "avatar"))
    write_raw_cache("weapons.json", await raw_json(client, "weapon"))
    write_raw_cache("materials.json", await raw_json(client, "material"))

    if char_filter:
        characters = [c for c in characters
                      if any(n in c.name.lower() or str(c.id) == n for n in char_filter)]
        print(f"  (test filter) narrowed to {len(characters)} character(s) before detail fetch: "
              f"{[c.name for c in characters]}")
    if weapon_filter:
        weapons = [w for w in weapons
                   if any(n in w.name.lower() or str(w.id) == n for n in weapon_filter)]
        print(f"  (test filter) narrowed to {len(weapons)} weapon(s) before detail fetch: "
              f"{[w.name for w in weapons]}")

    data = RawData(characters=characters, weapons=weapons, materials=materials)

    print(f"Fetching character detail profiles (sequential, {DETAIL_FETCH_DELAY}s between calls)...")
    total = len(characters)
    for i, c in enumerate(characters, 1):
        try:
            detail = await client.fetch_character_detail(c.id)
            data.character_details[c.id] = detail
            write_raw_cache(f"character/{c.id}.json", await raw_json(client, f"avatar/{c.id}"))
            print(f"  [{i}/{total}] OK: {c.name}")
        except Exception as e:
            print(f"  [{i}/{total}] FAILED (detail fetch): {c.name} ({c.id}) - {e}")
        await asyncio.sleep(DETAIL_FETCH_DELAY)

    # 1-2 star weapons are never usable in the wish/build tabs — skip
    # fetching their details entirely rather than shipping dead files.
    eligible_weapons = [w for w in weapons if w.rarity >= 3]
    print(f"  ({len(weapons) - len(eligible_weapons)} weapons at 1-2 star skipped)")
    print(f"Fetching weapon detail profiles, 3-star and up only (sequential, {DETAIL_FETCH_DELAY}s between calls)...")
    total = len(eligible_weapons)
    for i, w in enumerate(eligible_weapons, 1):
        try:
            detail = await client.fetch_weapon_detail(w.id)
            data.weapon_details[w.id] = detail
            write_raw_cache(f"weapon/{w.id}.json", await raw_json(client, f"weapon/{w.id}"))
            print(f"  [{i}/{total}] OK: {w.name}")
        except Exception as e:
            # Weapon skins (e.g. "X - Sublimation" reforged variants) share
            # their base weapon's stats entirely and carry no independent
            # ascension/refinement data of their own — that's why these
            # fields come back missing. Not a real fetch failure, just a
            # catalog entry with nothing new to pull; skip it quietly.
            missing = ("storyId", "affix", "upgrade", "ascension")
            err_text = str(e)
            if all(f"{field_name}\n  Field required" in err_text for field_name in missing):
                print(f"  [{i}/{total}] SKIPPED (non-playable entry): {w.name}")
            else:
                print(f"  [{i}/{total}] FAILED (detail fetch): {w.name} ({w.id}) - {e}")
        await asyncio.sleep(DETAIL_FETCH_DELAY)

    return data


# --------------------------------------------------------------------------
# Materials lookup
# --------------------------------------------------------------------------

def build_material_lookup(materials) -> dict:
    lookup = {}
    for m in materials:
        d = m.model_dump()
        lookup[d["id"]] = {
            "name": d.get("name"),
            "icon": d.get("icon"),
            "rarity": d.get("rarity"),
        }
    return lookup


def categorize_character_material(mat_id: int):
    """
    Buckets an ascension material id by Ambr's numeric id-prefix scheme.
    Verified against multiple characters; if a future character's
    materials don't fit cleanly, they still land in ascensionMaterials
    (the full flat list is always kept as a fallback/superset), just
    possibly uncategorized in the split lists.
    """
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


def categorize_weapon_material(mat_id: int):
    """
    Weapon-specific split: 112xxx = common enemy drops (shared item family
    with characters, e.g. Drive Shafts), 114xxx = weapon-only ascension
    ore/crystal materials. Weapons don't have the gems/local-specialty/
    talent-book concept characters do, so those buckets don't apply here.
    """
    if 112000 <= mat_id < 113000:
        return "enemyDrops"
    if 114000 <= mat_id < 115000:
        return "weaponMaterials"
    return None


async def resolve_cost_items(cost_items, material_lookup, localizer: AssetLocalizer) -> list:
    if not cost_items:
        return []
    resolved = []
    for item in cost_items:
        mat_id = item.id
        info = material_lookup.get(mat_id, {})
        icon = await localizer.localize(info.get("icon"), material_asset_rel(mat_id))
        qty = item.amount if hasattr(item, "amount") else item.count
        resolved.append({
            "id": mat_id,
            "name": info.get("name"),
            "icon": icon,
            "rarity": info.get("rarity"),
            "qty": qty,
        })
    return resolved


# --------------------------------------------------------------------------
# Stage: build_character_profile / build_talents / build_constellations /
#        build_materials
# --------------------------------------------------------------------------

async def build_character_profile(detail, localizer: AssetLocalizer) -> dict:
    """Character info only — no talent scaling, no material lists."""
    icon = await localizer.localize(detail.icon, char_asset_rel(detail.id, "icon.png"))
    return {
        "id": detail.id,
        "name": detail.name,
        "title": detail.info.title,
        "description": detail.info.detail,
        "rarity": detail.rarity,
        "birthday": {"month": detail.birthday.month, "day": detail.birthday.day},
        "element": normalize_element(detail.element.value),
        "weaponType": normalize_weapon_type(detail.weapon_type.value),
        "constellationName": detail.info.constellation,
        "native": detail.info.native,
        "cv": [{"lang": cv.lang, "va": cv.va} for cv in detail.info.cv],
        "icon": icon,
        "baseStats": [
            {"propType": s.prop_type, "initValue": s.init_value, "growthType": s.growth_type}
            for s in detail.upgrade.base_stats
        ],
        "specialStat": detail.special_stat.value if hasattr(detail.special_stat, "value") else detail.special_stat,
        "region": detail.region,
    }


async def build_talents(detail, localizer: AssetLocalizer) -> dict:
    """
    The most important data file — full per-level scaling is preserved
    for every active talent, never trimmed. The frontend decides later how
    much of it to display. Cost items (Mora + materials) for each level
    are filled in afterward by attach_talent_costs(), once the shared
    material lookup is available, to keep this function focused purely on
    scaling data.
    """
    talents = []
    for i, t in enumerate(detail.talents):
        icon = await localizer.localize(t.icon, char_asset_rel(detail.id, f"talents/{i:02d}.png"))
        talent_type = TALENT_TYPE_MAP.get(t.type.name, t.type.name)
        entry = {
            "name": t.name,
            "type": talent_type,
            "description": t.description,
            "icon": icon,
            "cooldown": t.cooldown,
            "cost": t.cost,
        }
        if t.upgrades:
            entry["levels"] = [
                {
                    "level": u.level,
                    "description": u.description,
                    "params": u.params,
                    "moraCost": u.mora_cost,
                    "items": [],  # filled in by attach_talent_costs()
                }
                for u in t.upgrades
            ]
        talents.append(entry)
    return {"id": detail.id, "talents": talents}


async def attach_talent_costs(detail, talents_doc: dict, material_lookup: dict, localizer: AssetLocalizer):
    """Fills in the per-level `items`/moraCost cost data for each talent."""
    for entry, t in zip(talents_doc["talents"], detail.talents):
        if not t.upgrades:
            continue
        for level_entry, u in zip(entry["levels"], t.upgrades):
            level_entry["items"] = await resolve_cost_items(u.cost_items, material_lookup, localizer)


async def build_constellations(detail, localizer: AssetLocalizer) -> dict:
    constellations = []
    for i, c in enumerate(detail.constellations, 1):
        icon = await localizer.localize(c.icon, char_asset_rel(detail.id, f"constellations/{i}.png"))
        constellations.append({
            "name": c.name,
            "description": c.description,
            "icon": icon,
        })
    return {"id": detail.id, "constellations": constellations}


async def build_materials(detail, material_lookup: dict, localizer: AssetLocalizer) -> dict:
    ascension_materials = []
    buckets = {"ascensionGems": [], "localSpecialty": [], "talentBooks": [], "enemyDrops": []}

    for m in detail.ascension_materials:
        info = material_lookup.get(m.id, {})
        icon = await localizer.localize(info.get("icon"), material_asset_rel(m.id))
        entry = {
            "id": m.id,
            "name": info.get("name"),
            "icon": icon,
            "rarity": m.rarity,
        }
        ascension_materials.append(entry)
        bucket = categorize_character_material(m.id)
        if bucket:
            buckets[bucket].append(entry)

    # Per-ascension-phase Mora + material quantities (0 = base, 1-6 = each
    # ascension). This is the actual cost table — separate from
    # ascensionMaterials above, which only lists unique item *types* with
    # no quantities.
    promotes = []
    for p in detail.upgrade.promotes:
        promotes.append({
            "promoteLevel": p.promote_level,
            "unlockMaxLevel": p.unlock_max_level,
            "moraCost": p.coin_cost,
            "requiredPlayerLevel": p.required_player_level,
            "items": await resolve_cost_items(p.cost_items, material_lookup, localizer),
        })

    return {
        "id": detail.id,
        "ascensionMaterials": ascension_materials,
        "ascensionGems": buckets["ascensionGems"],
        "localSpecialty": buckets["localSpecialty"],
        "talentBooks": buckets["talentBooks"],
        "enemyDrops": buckets["enemyDrops"],
        "promotes": promotes,
    }


async def build_one_character(detail, material_lookup: dict, localizer: AssetLocalizer) -> dict:
    profile = await build_character_profile(detail, localizer)
    talents_doc = await build_talents(detail, localizer)
    await attach_talent_costs(detail, talents_doc, material_lookup, localizer)
    constellations_doc = await build_constellations(detail, localizer)
    materials_doc = await build_materials(detail, material_lookup, localizer)
    return {
        "profile": profile,
        "talents": talents_doc,
        "constellations": constellations_doc,
        "materials": materials_doc,
    }


# --------------------------------------------------------------------------
# Weapon profile builders
# --------------------------------------------------------------------------

async def build_weapon_profile(detail, localizer: AssetLocalizer) -> dict:
    icon = await localizer.localize(detail.icon, weapon_asset_rel(detail.id, "icon.png"))
    affix = None
    if detail.affix:
        affix = {
            "name": detail.affix.name,
            "upgrades": [{"level": u.level, "description": u.description} for u in detail.affix.upgrades],
        }
    return {
        "id": detail.id,
        "name": detail.name,
        "rarity": detail.rarity,
        "type": normalize_weapon_type(detail.type),
        "description": detail.description,
        "icon": icon,
        "affix": affix,
        "baseStats": [
            {"propType": s.prop_type, "initValue": s.init_value, "growthType": s.growth_type}
            for s in detail.upgrade.base_stats
        ],
        "awakenCost": detail.upgrade.awaken_cost,
    }


async def build_weapon_materials(detail, material_lookup: dict, localizer: AssetLocalizer) -> dict:
    ascension_materials = []
    buckets = {"enemyDrops": [], "weaponMaterials": []}

    for m in detail.ascension_materials:
        info = material_lookup.get(m.id, {})
        icon = await localizer.localize(info.get("icon"), material_asset_rel(m.id))
        entry = {
            "id": m.id,
            "name": info.get("name"),
            "icon": icon,
            "rarity": m.rarity,
        }
        ascension_materials.append(entry)
        bucket = categorize_weapon_material(m.id)
        if bucket:
            buckets[bucket].append(entry)

    promotes = []
    for p in detail.upgrade.promotes:
        promotes.append({
            "promoteLevel": p.promote_level,
            "unlockMaxLevel": p.unlock_max_level,
            "moraCost": p.coin_cost,
            "requiredPlayerLevel": p.required_player_level,
            "items": await resolve_cost_items(p.cost_items, material_lookup, localizer),
        })

    return {
        "id": detail.id,
        "ascensionMaterials": ascension_materials,
        "enemyDrops": buckets["enemyDrops"],
        "weaponMaterials": buckets["weaponMaterials"],
        "promotes": promotes,
    }


async def build_one_weapon(detail, material_lookup: dict, localizer: AssetLocalizer) -> dict:
    profile = await build_weapon_profile(detail, localizer)
    materials_doc = await build_weapon_materials(detail, material_lookup, localizer)
    return {"profile": profile, "materials": materials_doc}


# --------------------------------------------------------------------------
# Stage: download_assets (drives the per-character/weapon builders, since
# localization happens inline as each JSON document is built)
# --------------------------------------------------------------------------

async def download_assets(raw: RawData, material_lookup: dict, localizer: AssetLocalizer):
    """
    Runs every per-character/weapon builder, which localizes assets as it
    goes. Returns (character_docs, weapon_docs, failed_characters,
    failed_weapons) so the caller can report what to retry, and skip
    touching folders for anything that failed this run.
    """
    character_docs: dict = {}
    weapon_docs: dict = {}
    failed_characters = []
    failed_weapons = []

    total = len(raw.character_details)
    for i, (char_id, detail) in enumerate(raw.character_details.items(), 1):
        try:
            character_docs[char_id] = await build_one_character(detail, material_lookup, localizer)
            print(f"  [{i}/{total}] built: {detail.name}")
        except Exception as e:
            failed_characters.append((char_id, detail.name, str(e)))
            print(f"  [{i}/{total}] FAILED (build): {detail.name} ({char_id}) - {e}")

    total = len(raw.weapon_details)
    for i, (weapon_id, detail) in enumerate(raw.weapon_details.items(), 1):
        try:
            weapon_docs[weapon_id] = await build_one_weapon(detail, material_lookup, localizer)
            print(f"  [{i}/{total}] built: {detail.name}")
        except Exception as e:
            failed_weapons.append((weapon_id, detail.name, str(e)))
            print(f"  [{i}/{total}] FAILED (build): {detail.name} ({weapon_id}) - {e}")

    return character_docs, weapon_docs, failed_characters, failed_weapons


# --------------------------------------------------------------------------
# Stage: build_indexes
# --------------------------------------------------------------------------

def build_character_entry(c):
    return {
        "id": c.id,
        "name": c.name,
        "rarity": c.rarity,
        "element": normalize_element(c.element.value if getattr(c, "element", None) else None),
        "icon": getattr(c, "icon", None),
        "isCustom": False,
    }


def build_weapon_entry(w):
    return {
        "id": w.id,
        "name": w.name,
        "rarity": w.rarity,
        "weaponType": normalize_weapon_type(getattr(w, "type", None)),
        "icon": getattr(w, "icon", None),
        "isCustom": False,
    }


def write_js_db(path, var_name, entries, footer):
    lines = [f"const {var_name} = ["]
    for i, e in enumerate(entries):
        comma = "," if i < len(entries) - 1 else ""
        entry_lines = ["  {"]
        keys = list(e.keys())
        for j, k in enumerate(keys):
            kcomma = "," if j < len(keys) - 1 else ""
            entry_lines.append(f'    "{k}": {js_value(e[k])}{kcomma}')
        entry_lines.append(f"  }}{comma}")
        lines.append("\n".join(entry_lines))
    lines.append("];")
    lines.append(footer)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


async def build_indexes(
    raw: RawData,
    character_docs: dict,
    weapon_docs: dict,
    localizer: AssetLocalizer,
) -> dict:
    """
    Generates the small top-level index files. characters.js / weapons.js
    stay tiny (just enough for autocomplete/search/roster/thumbnails);
    character-profiles/index.js and weapon-profiles/index.js are the
    slightly richer indexes the Build tab uses to resolve a name to an id
    before fetching that one character's/weapon's files.
    """
    char_entries = [build_character_entry(c) for c in raw.characters]
    weapon_entries = [build_weapon_entry(w) for w in raw.weapons]

    char_entries.sort(key=lambda e: e["name"].lower())
    weapon_entries.sort(key=lambda e: e["name"].lower())

    known_elements = set(ELEMENT_MAP.values())
    for e in char_entries:
        if e["element"] and e["element"] not in known_elements:
            print(f"  ! Unmapped element '{e['element']}' on {e['name']} — add it to ELEMENT_MAP")
        if not e["icon"]:
            print(f"  ! No icon found for {e['name']}")
    for e in weapon_entries:
        if not e["icon"]:
            print(f"  ! No icon found for {e['name']}")

    # Localize the roster/search icons referenced by characters.js /
    # weapons.js themselves (these are the same icon URLs as each
    # character's/weapon's own profile icon, so this is effectively free
    # thanks to the localizer's url -> local-path cache).
    for e in char_entries:
        if e["id"] in character_docs:
            e["icon"] = character_docs[e["id"]]["profile"]["icon"]
        elif e["icon"]:
            e["icon"] = await localizer.localize(e["icon"], char_asset_rel(e["id"], "icon.png"))
    for e in weapon_entries:
        if e["id"] in weapon_docs:
            e["icon"] = weapon_docs[e["id"]]["profile"]["icon"]
        elif e["icon"]:
            e["icon"] = await localizer.localize(e["icon"], weapon_asset_rel(e["id"], "icon.png"))

    char_path = os.path.join(DATA_DIR, "characters.js")
    weapon_path = os.path.join(DATA_DIR, "weapons.js")
    write_js_db(char_path, "GENSHIN_CHARACTER_DB", char_entries, CHARACTERS_JS_FOOTER)
    write_js_db(weapon_path, "GENSHIN_WEAPON_DB", weapon_entries, WEAPONS_JS_FOOTER)

    char_profile_index = [
        {
            "id": doc["profile"]["id"],
            "name": doc["profile"]["name"],
            "rarity": doc["profile"]["rarity"],
            "element": doc["profile"]["element"],
            "icon": doc["profile"]["icon"],
        }
        for doc in character_docs.values()
    ]
    char_profile_index.sort(key=lambda e: (e["name"] or "").lower())

    weapon_profile_index = [
        {
            "id": doc["profile"]["id"],
            "name": doc["profile"]["name"],
            "rarity": doc["profile"]["rarity"],
            "type": doc["profile"]["type"],
            "icon": doc["profile"]["icon"],
        }
        for doc in weapon_docs.values()
    ]
    weapon_profile_index.sort(key=lambda e: (e["name"] or "").lower())

    os.makedirs(CHAR_PROFILES_DIR, exist_ok=True)
    os.makedirs(WEAPON_PROFILES_DIR, exist_ok=True)

    char_index_path = os.path.join(CHAR_PROFILES_DIR, "index.js")
    with open(char_index_path, "w", encoding="utf-8") as f:
        f.write(f"const GENSHIN_CHARACTER_PROFILE_INDEX = {js_value(char_profile_index)};\n")

    weapon_index_path = os.path.join(WEAPON_PROFILES_DIR, "index.js")
    with open(weapon_index_path, "w", encoding="utf-8") as f:
        f.write(f"const GENSHIN_WEAPON_PROFILE_INDEX = {js_value(weapon_profile_index)};\n")

    return {
        "characters.js": char_path,
        "weapons.js": weapon_path,
        "character-profiles/index.js": char_index_path,
        "weapon-profiles/index.js": weapon_index_path,
    }


def write_character_profile_files(character_docs: dict):
    """One folder per character; each of the four JSON files inside is
    written independently so a diff on patch day only touches the
    characters that actually changed."""
    for char_id, doc in character_docs.items():
        folder = os.path.join(CHAR_PROFILES_DIR, char_id)
        os.makedirs(folder, exist_ok=True)
        for filename, payload in (
            ("profile.json", doc["profile"]),
            ("talents.json", doc["talents"]),
            ("constellations.json", doc["constellations"]),
            ("materials.json", doc["materials"]),
        ):
            with open(os.path.join(folder, filename), "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)


def write_weapon_profile_files(weapon_docs: dict):
    for weapon_id, doc in weapon_docs.items():
        folder = os.path.join(WEAPON_PROFILES_DIR, str(weapon_id))
        os.makedirs(folder, exist_ok=True)
        for filename, payload in (
            ("profile.json", doc["profile"]),
            ("materials.json", doc["materials"]),
        ):
            with open(os.path.join(folder, filename), "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)


# --------------------------------------------------------------------------
# Stage: cleanup_old_files
# --------------------------------------------------------------------------

def cleanup_old_files(
    character_docs: dict,
    weapon_docs: dict,
    localizer: AssetLocalizer,
    failed_chars: list | None = None,
    failed_weapons: list | None = None,
):
    """
    Removes:
    - character/weapon folders for ids that no longer exist upstream
      (merges, removals, id changes).
    - assets inside each rebuilt folder that weren't referenced by this
      run (e.g. an old icon left behind after a character's art changed).

    Folders that weren't successfully rebuilt this run (because that
    character's/weapon's detail fetch or build step failed) are
    deliberately left alone rather than wiped, so a transient API
    failure or a bad data shape for one entry can't nuke everything
    already downloaded for it. This requires explicitly folding failed
    ids into the "keep" set below, not just successfully-built ones —
    otherwise a folder that failed to build is indistinguishable from
    one whose character was genuinely removed upstream, and cleanup
    deletes it as if it were stale.
    """
    valid_char_ids = {f"{cid}" for cid in character_docs}
    valid_char_ids |= {f"{cid}" for cid, _name, _err in (failed_chars or [])}
    if os.path.isdir(CHAR_PROFILES_DIR):
        for name in os.listdir(CHAR_PROFILES_DIR):
            full = os.path.join(CHAR_PROFILES_DIR, name)
            if os.path.isdir(full) and name not in valid_char_ids:
                print(f"  removing stale character folder: {name}")
                shutil.rmtree(full)

    valid_weapon_ids = {str(wid) for wid in weapon_docs}
    valid_weapon_ids |= {str(wid) for wid, _name, _err in (failed_weapons or [])}
    if os.path.isdir(WEAPON_PROFILES_DIR):
        for name in os.listdir(WEAPON_PROFILES_DIR):
            full = os.path.join(WEAPON_PROFILES_DIR, name)
            if os.path.isdir(full) and name not in valid_weapon_ids:
                print(f"  removing stale weapon folder: {name}")
                shutil.rmtree(full)

    # Prune orphaned asset files within folders that WERE rebuilt this run.
    #
    # IMPORTANT (Windows): rel_paths are built with forward slashes (e.g.
    # "character-profiles/10000002/assets/constellations/1.png") since
    # those are also written into the JSON for the frontend to load as
    # web paths. os.path.join only inserts a separator BETWEEN its two
    # arguments; it does not convert forward slashes already inside the
    # string. On Windows that leaves used_abs entries with MIXED slashes
    # ("...\assets\data\character-profiles/10000002/..."), while
    # os.walk produces pure-backslash paths for `full`. Those two never
    # string-match, so every file this run just built looked "unused"
    # and got deleted immediately after being written. os.path.normpath
    # below converts both sides to the platform's native separator so
    # the comparison is actually meaningful on Windows.
    removed_assets = 0
    for top, used in localizer.used_paths.items():
        folder_abs = os.path.join(DATA_DIR, top)
        assets_abs = os.path.join(folder_abs, "assets")
        # Materials live directly under shared-assets/materials with no
        # extra "assets" subfolder, characters/weapons have assets/.
        target_dir = assets_abs if os.path.isdir(assets_abs) else folder_abs
        if not os.path.isdir(target_dir):
            continue
        used_abs = {os.path.normpath(os.path.join(DATA_DIR, p)) for p in used}
        for root, _dirs, files in os.walk(target_dir):
            for fname in files:
                full = os.path.normpath(os.path.join(root, fname))
                if full not in used_abs:
                    os.remove(full)
                    removed_assets += 1
    if removed_assets:
        print(f"  removed {removed_assets} orphaned asset file(s)")


# --------------------------------------------------------------------------
# Versioning
# --------------------------------------------------------------------------

def read_stored_version():
    if not os.path.exists(VERSION_FILE):
        return None
    with open(VERSION_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return None


def write_stored_version(ambr_version: str):
    with open(VERSION_FILE, "w", encoding="utf-8") as f:
        json.dump({"ambr_version": ambr_version, "schema_version": DATA_SCHEMA_VERSION}, f, indent=2)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force", action="store_true",
        help="Rebuild everything even if Ambr's version and the schema version are unchanged.",
    )
    parser.add_argument(
        "--only-char", metavar="NAME_OR_ID[,NAME_OR_ID...]", default=None,
        help="TEST MODE: only fetch/build these characters. Comma-separated list; "
             "each entry is a case-insensitive substring match on name, or an exact "
             "numeric id. Implies --force. Cleanup is skipped entirely in this mode "
             "so untouched characters/weapons are never treated as stale and deleted.",
    )
    parser.add_argument(
        "--only-weapon", metavar="NAME_OR_ID[,NAME_OR_ID...]", default=None,
        help="TEST MODE: only fetch/build these weapons. Comma-separated list, same "
             "matching rules as --only-char. Implies --force. Cleanup is skipped "
             "entirely in this mode.",
    )
    args = parser.parse_args()
    test_mode = bool(args.only_char or args.only_weapon)
    if test_mode:
        args.force = True
        print(f"### update_data.py TEST-FILTER BUILD (script has --only-char/--only-weapon support) ###")

    os.makedirs(RAW_CACHE_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)

    # cache_ttl set well above our own daily version-check cadence, so
    # re-running this script for reasons unrelated to Ambr's data itself
    # (e.g. a bug fix on our end, testing) is served from the local
    # SQLite cache instead of re-hitting their servers for everything.
    async with ambr.AmbrAPI(cache_ttl=60 * 60 * 24 * 7) as client:
        print("Checking Ambr data version...")
        latest_version = await client.fetch_latest_version()
        stored = read_stored_version()
        stored_version = stored.get("ambr_version") if stored else None
        stored_schema = stored.get("schema_version") if stored else None

        schema_changed = stored_schema != DATA_SCHEMA_VERSION
        version_changed = stored_version != latest_version

        if not args.force and not schema_changed and not version_changed:
            print(f"No change (Ambr version {latest_version}, schema v{DATA_SCHEMA_VERSION}). Skipping update.")
            return

        if test_mode:
            print(f"TEST MODE: only-char={args.only_char!r} only-weapon={args.only_weapon!r}. "
                  f"Cleanup will NOT run this pass.")
        elif schema_changed and stored_schema is not None:
            print(f"Schema version changed ({stored_schema} -> {DATA_SCHEMA_VERSION}). Forcing full rebuild.")
        elif args.force:
            print("--force passed. Running full rebuild regardless of version checks.")
        else:
            print(f"Ambr version changed: {stored_version!r} -> {latest_version!r}. Running full sync...")

        # Stage 1: fetch_raw_data (filtered BEFORE the slow per-item detail
        # fetch loop when in test mode, so this stays fast)
        char_needles = None
        if args.only_char:
            char_needles = {n.strip().lower() for n in args.only_char.split(",") if n.strip()}
        weapon_needles = None
        if args.only_weapon:
            weapon_needles = {n.strip().lower() for n in args.only_weapon.split(",") if n.strip()}

        raw = await fetch_raw_data(client, char_filter=char_needles, weapon_filter=weapon_needles)

        material_lookup = build_material_lookup(raw.materials)
        print(f"Loaded {len(material_lookup)} materials into lookup table")

        # Stage 2+3: download_assets / build_* (localization happens inline
        # per-document, since each builder knows its own destination paths)
        async with aiohttp.ClientSession() as asset_session:
            localizer = AssetLocalizer(asset_session)
            print("Building character & weapon profiles (downloading/reusing local assets as needed)...")
            character_docs, weapon_docs, failed_chars, failed_weapons = await download_assets(
                raw, material_lookup, localizer
            )

            # Stage 4: generate processed JSON database
            write_character_profile_files(character_docs)
            write_weapon_profile_files(weapon_docs)

            if test_mode:
                print("TEST MODE: skipping index rebuild, cleanup, and version stamp "
                      "(raw/character_docs/weapon_docs are filtered down, so writing "
                      "characters.js/weapons.js or running cleanup here would wipe out "
                      "everything not in this test selection).")
                index_paths = {}
            else:
                # Stage 5: generate lightweight indexes
                index_paths = await build_indexes(raw, character_docs, weapon_docs, localizer)

                # Stage 6: clean obsolete files
                cleanup_old_files(
                    character_docs, weapon_docs, localizer,
                    failed_chars=failed_chars, failed_weapons=failed_weapons,
                )

        if not test_mode:
            write_stored_version(latest_version)

        print("\nAsset stats:")
        print(f"  downloaded: {localizer.stats['downloaded']}")
        print(f"  reused (already local): {localizer.stats['reused']}")
        print(f"  failed (kept remote URL as fallback): {localizer.stats['failed']}")

        if failed_chars:
            print(f"\n{len(failed_chars)} character(s) failed to build and were left untouched:")
            for cid, name, err in failed_chars:
                print(f"  - {name} ({cid}): {err}")
        if failed_weapons:
            print(f"\n{len(failed_weapons)} weapon(s) failed to build and were left untouched:")
            for wid, name, err in failed_weapons:
                print(f"  - {name} ({wid}): {err}")

        print("\nSaved:")
        for label, path in index_paths.items():
            print(f"  {label} -> {path}")
        print(f"  character-profiles/<id>/  ({len(character_docs)} folders)")
        print(f"  weapon-profiles/<id>/     ({len(weapon_docs)} folders)")
        print(f"  raw-cache/ambr/")
        print(f"  {VERSION_FILE}")


if __name__ == "__main__":
    if sys.version_info < (3, 10):
        print("This script requires Python 3.10+ (uses `X | None` type unions).")
        sys.exit(1)
    asyncio.run(main())
