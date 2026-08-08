                        
                     
from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import shutil
import sys

import aiohttp
import ambr
from PIL import Image

WEBP_QUALITY = 85

WEBP_METHOD_FAST = 4
WEBP_METHOD_SLOW = 6
WEBP_SLOW_METHOD_MIN_PIXELS = 512 * 512


def _to_webp(raw: bytes) -> bytes:
    with Image.open(io.BytesIO(raw)) as im:
        im = im.convert("RGBA")
        method = WEBP_METHOD_SLOW if (im.width * im.height) >= WEBP_SLOW_METHOD_MIN_PIXELS else WEBP_METHOD_FAST
        buf = io.BytesIO()
        im.save(buf, format="WEBP", quality=WEBP_QUALITY, method=method)
        return buf.getvalue()


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "assets", "data")

RAW_DIR = os.path.join(SCRIPT_DIR, "raw_dumps")
VERSION_FILE = os.path.join(SCRIPT_DIR, ".data-version.json")

CURVES_DIR = os.path.join(DATA_DIR, "curves")
CHAR_OUT_DIR = os.path.join(DATA_DIR, "character-profiles")
WEAPON_OUT_DIR = os.path.join(DATA_DIR, "weapon-profiles")
SHARED_ASSETS_DIR = os.path.join(DATA_DIR, "shared-assets", "materials")

DATA_SCHEMA_VERSION = 11

DETAIL_FETCH_DELAY = 0.4
ASSET_DOWNLOAD_CONCURRENCY = 8
ASSET_MAX_RETRIES = 3
ASSET_RETRY_BACKOFF = 0.75

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
    "Sword": "Sword",
    "Claymore": "Claymore",
    "Polearm": "Polearm",
    "Bow": "Bow",
    "Catalyst": "Catalyst",
}

CHARACTERS_JS_FOOTER = """
function getGenshinCharacter(name, rarity = 5) {
    return GENSHIN_CHARACTER_DB.find((c) => c.rarity === rarity && c.name.toLowerCase() === name.toLowerCase()) || null;
}

function searchGenshinCharacters(query, rarity = 5) {
    const pool = GENSHIN_CHARACTER_DB.filter((c) => c.rarity === rarity);
    if (!query) return pool.slice(0, 10);
    const lowerQuery = query.toLowerCase();
    return pool.filter((c) => c.name.toLowerCase().includes(lowerQuery));
}

function makeCustomCharacter(name, rarity = 5) {
    return {
        id: null,
        name,
        rarity,
        element: null,
        icon: "custom_icons/Lumine_Placeholder_custom.webp",
        isCustom: true
    };
}
"""

WEAPONS_JS_FOOTER = """
function getGenshinWeapon(name, rarity = 5) {
    return GENSHIN_WEAPON_DB.find((w) => w.rarity === rarity && w.name.toLowerCase() === name.toLowerCase()) || null;
}

function searchGenshinWeapons(query, rarity = 5) {
    const pool = GENSHIN_WEAPON_DB.filter((w) => w.rarity === rarity);
    if (!query) return pool.slice(0, 10);
    const lowerQuery = query.toLowerCase();
    return pool.filter((w) => w.name.toLowerCase().includes(lowerQuery));
}

function makeCustomWeapon(name, rarity = 5) {
    return {
        id: null,
        name,
        rarity,
        weaponType: null,
        icon: "custom_icons/Weapon_Dull_Blade_custom.webp",
        isCustom: true
    };
}
"""


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path, data):
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


def clean_name(raw):
    if not raw:
        return raw
    for open_q, close_q in (('"', '"'), ("\u201c", "\u201d")):
        if len(raw) >= 2 and raw.startswith(open_q) and raw.endswith(close_q):
            return raw[1:-1]
    return raw


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


def curve_multiplier(curve: dict, level, curve_id):
    if curve is None:
        return None
    level_entry = curve.get(str(level))
    if not level_entry:
        return None
    return level_entry.get("curveInfos", {}).get(curve_id)


def parse_needles(raw: str | None):
    if not raw:
        return None
    return {n.strip().lower() for n in raw.split(",") if n.strip()}


def matches_needle(entity, needles: set) -> bool:
    return any(n in entity.name.lower() or str(entity.id) == n for n in needles)


class AssetLocalizer:
    def __init__(self, session: aiohttp.ClientSession):
        self._session = session
        self._sem = asyncio.Semaphore(ASSET_DOWNLOAD_CONCURRENCY)
        self._cache: dict[str, str] = {}
        self.used_paths: dict[str, set] = {}
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
                data = await asyncio.to_thread(_to_webp, data)
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
        if not url:
            return None

        basename = os.path.basename(url.split("?")[0])
        name_no_ext = os.path.splitext(basename)[0]
        if not name_no_ext:
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
    return f"shared-assets/materials/{mat_id}.webp"


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
    if mat_id == 104319:
        return "talentBooks"
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
    if 112000 <= mat_id < 113000:
        return "enemyDrops"
    if 114000 <= mat_id < 115000:
        return "weaponMaterials"
    return None


async def resolve_cost_items(cost_items, material_lookup: dict, localizer: AssetLocalizer) -> list:
    if not cost_items:
        return []

    async def _resolve_one(item):
        mat_id = item.get("id")
        info = material_lookup.get(mat_id, {})
        icon = await localizer.localize(info.get("icon"), material_asset_rel(mat_id))
        qty = item.get("amount", item.get("count"))
        return {
            "id": mat_id,
            "name": info.get("name"),
            "icon": icon,
            "rarity": info.get("rarity"),
            "qty": qty,
        }

    return list(await asyncio.gather(*(_resolve_one(item) for item in cost_items)))


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
    labels = classify_talent_types(talents_raw)

    passive_n = 0
    entries = []
    for idx, (t, label) in enumerate(zip(talents_raw, labels)):
        resolved_label = label if "DISAGREEMENT" not in label else "unknown"
        if resolved_label == "passive":
            passive_n += 1
            local_fname = f"{idx:02d}_passive_{passive_n}.webp"
        else:
            local_fname = f"{idx:02d}_{resolved_label}.webp"
        entries.append((t, label, local_fname))

    icon_rels = await asyncio.gather(*(
        localizer.localize(t.get("icon"), f"character-profiles/{char_id}/skills/{fname}")
        for t, _label, fname in entries
    ))

    async def _build_levels(t):
        upgrades = t.get("upgrades") or []
        items_lists = await asyncio.gather(*(
            resolve_cost_items(u.get("cost_items"), material_lookup, localizer) for u in upgrades
        ))
        return [
            {
                "level": u.get("level"),
                "description": u.get("description"),
                "params": u.get("params"),
                "moraCost": u.get("mora_cost"),
                "items": items,
            }
            for u, items in zip(upgrades, items_lists)
        ]

    all_levels = await asyncio.gather(*(_build_levels(t) for t, _label, _fname in entries))

    results = [
        {
            "name": t.get("name"),
            "type": label,
            "description": t.get("description"),
            "icon": icon_rel,
            "cooldown": t.get("cooldown"),
            "cost": t.get("cost"),
            "levels": levels,
        }
        for (t, label, _fname), icon_rel, levels in zip(entries, icon_rels, all_levels)
    ]

    mismatches = [r for r in results if "DISAGREEMENT" in r["type"]]
    if mismatches:
        names = ", ".join(m["name"] or "?" for m in mismatches)
        print(f"  !! {len(mismatches)} talent classification mismatch(es) for char {char_id} ({names}) — "
              f"often a character with a non-standard talent slot (e.g. Raiden's burst-state-switch ability). "
              f"Check the 'type' field in talents.json before trusting it.")
    return results


async def build_constellations_doc(char_id, constellations_raw, localizer):
    icon_rels = await asyncio.gather(*(
        localizer.localize(c.get("icon"), f"character-profiles/{char_id}/constellations/{idx:02d}_const.webp")
        for idx, c in enumerate(constellations_raw)
    ))
    return [
        {"name": c.get("name"), "description": c.get("description"), "icon": icon_rel}
        for c, icon_rel in zip(constellations_raw, icon_rels)
    ]


async def build_character_materials_doc(detail, material_lookup, localizer):
    raw_mats = detail.get("ascension_materials") or []

    async def _resolve_ascension(m):
        mat_id = m.get("id")
        info = material_lookup.get(mat_id, {})
        icon = await localizer.localize(info.get("icon"), material_asset_rel(mat_id))
        return {"id": mat_id, "name": info.get("name"), "icon": icon, "rarity": m.get("rarity")}

    ascension_materials = list(await asyncio.gather(*(_resolve_ascension(m) for m in raw_mats)))

    buckets = {"ascensionGems": [], "localSpecialty": [], "talentBooks": [], "enemyDrops": []}
    for entry in ascension_materials:
        bucket = categorize_character_material(entry["id"])
        if bucket:
            buckets[bucket].append(entry)

    promotes_raw = (detail.get("upgrade") or {}).get("promotes") or []

    async def _resolve_promote(p):
        return {
            "promoteLevel": p.get("promote_level"),
            "unlockMaxLevel": p.get("unlock_max_level"),
            "moraCost": p.get("coin_cost"),
            "requiredPlayerLevel": p.get("required_player_level"),
            "items": await resolve_cost_items(p.get("cost_items"), material_lookup, localizer),
        }

    promotes = list(await asyncio.gather(*(_resolve_promote(p) for p in promotes_raw)))

    special_stat_id = detail.get("special_stat")
    max_promote = max(promotes_raw, key=lambda p: p.get("promote_level", 0)) if promotes_raw else None
    ascension_stat_bonus = None
    if special_stat_id and max_promote and max_promote.get("add_stats"):
        for stat in max_promote["add_stats"]:
            if stat.get("id") == special_stat_id:
                ascension_stat_bonus = stat.get("value", 0)

    return {
        "ascensionMaterials": ascension_materials,
        "ascensionGems": buckets["ascensionGems"],
        "localSpecialty": buckets["localSpecialty"],
        "talentBooks": buckets["talentBooks"],
        "enemyDrops": buckets["enemyDrops"],
        "promotes": promotes,
        "ascensionStatBonus": ascension_stat_bonus,
    }


async def build_character_profile(detail, material_lookup, localizer):
    char_id = str(detail["id"])
    name = clean_name(detail["name"])
    print(f"\n=== character profile: {name} (id {char_id}) ===")

    char_dir = os.path.join(CHAR_OUT_DIR, char_id)
    skills_dir = os.path.join(char_dir, "skills")
    constellations_dir = os.path.join(char_dir, "constellations")
    materials_dir = os.path.join(char_dir, "materials")

    avatar_rel, full_wish_rel = await asyncio.gather(
        localizer.localize(detail.get("icon"), f"character-profiles/{char_id}/avatar.webp"),
        localizer.localize(detail.get("gacha"), f"character-profiles/{char_id}/full_wish.webp"),
    )

    info = {
        "id": detail.get("id"),
        "name": name,
        "element": normalize_element(detail.get("element")),
        "weapon_type": normalize_weapon_type(detail.get("weapon_type")),
        "rarity": detail.get("rarity"),
        "region": detail.get("region"),
        "birthday": detail.get("birthday"),
        "release": detail.get("release"),
        "icon": avatar_rel,
        "fullWish": full_wish_rel,
        "title": (detail.get("info") or {}).get("title"),
        "description": (detail.get("info") or {}).get("detail"),
        "constellationName": (detail.get("info") or {}).get("constellation"),
        "native": (detail.get("info") or {}).get("native"),
        "cv": (detail.get("info") or {}).get("cv"),
        "specialStat": detail.get("special_stat"),
        "baseStats": [
            {
                "propType": s.get("prop_type"),
                "initValue": s.get("init_value"),
                "growthType": s.get("growth_type"),
            }
            for s in ((detail.get("upgrade") or {}).get("base_stats") or [])
        ],
    }
    dump_json(os.path.join(char_dir, "info.json"), info)

    talents, constellations, materials_doc = await asyncio.gather(
        build_talents_doc(char_id, detail.get("talents") or [], skills_dir, material_lookup, localizer),
        build_constellations_doc(char_id, detail.get("constellations") or [], localizer),
        build_character_materials_doc(detail, material_lookup, localizer),
    )
    dump_json(os.path.join(skills_dir, "talents.json"), talents)
    dump_json(os.path.join(constellations_dir, "constellations.json"), constellations)
    dump_json(os.path.join(materials_dir, "materials.json"), materials_doc)


async def build_weapon_materials_doc(detail, material_lookup, localizer):
    raw_mats = detail.get("ascension_materials") or []

    async def _resolve_ascension(m):
        mat_id = m.get("id")
        info = material_lookup.get(mat_id, {})
        icon = await localizer.localize(info.get("icon"), material_asset_rel(mat_id))
        return {"id": mat_id, "name": info.get("name"), "icon": icon, "rarity": m.get("rarity")}

    ascension_materials = list(await asyncio.gather(*(_resolve_ascension(m) for m in raw_mats)))

    buckets = {"enemyDrops": [], "weaponMaterials": []}
    for entry in ascension_materials:
        bucket = categorize_weapon_material(entry["id"])
        if bucket:
            buckets[bucket].append(entry)

    async def _resolve_promote(p):
        return {
            "promoteLevel": p.get("promote_level"),
            "unlockMaxLevel": p.get("unlock_max_level"),
            "moraCost": p.get("coin_cost"),
            "requiredPlayerLevel": p.get("required_player_level"),
            "items": await resolve_cost_items(p.get("cost_items"), material_lookup, localizer),
        }

    promotes_raw = (detail.get("upgrade") or {}).get("promotes") or []
    promotes = list(await asyncio.gather(*(_resolve_promote(p) for p in promotes_raw)))

    return {
        "ascensionMaterials": ascension_materials,
        "enemyDrops": buckets["enemyDrops"],
        "weaponMaterials": buckets["weaponMaterials"],
        "promotes": promotes,
    }


async def build_weapon_profile(detail, weapon_curve, material_lookup, localizer):
    weapon_id = str(detail["id"])
    name = clean_name(detail["name"])
    print(f"\n=== weapon profile: {name} (id {weapon_id}) ===")

    weapon_dir = os.path.join(WEAPON_OUT_DIR, weapon_id)
    refinements_dir = os.path.join(weapon_dir, "refinements")
    materials_dir = os.path.join(weapon_dir, "materials")

    avatar_rel, materials_doc = await asyncio.gather(
        localizer.localize(detail.get("icon"), f"weapon-profiles/{weapon_id}/avatar.webp"),
        build_weapon_materials_doc(detail, material_lookup, localizer),
    )

    base_stats = (detail.get("upgrade") or {}).get("base_stats") or []
    base_atk = next((s for s in base_stats if s.get("prop_type") == "FIGHT_PROP_BASE_ATTACK"), None)
    substat = next((s for s in base_stats if s.get("prop_type") != "FIGHT_PROP_BASE_ATTACK"), None)

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
        "name": name,
        "type": normalize_weapon_type(detail.get("type")),
        "rarity": detail.get("rarity"),
        "description": detail.get("description"),
        "icon": avatar_rel,
        "base_atk_lvl1": base_atk.get("init_value") if base_atk else None,
        "base_atk_lvl90": base_atk_lvl90,
        "substat_type": substat.get("prop_type") if substat else None,
        "substat_lvl1": substat.get("init_value") if substat else None,
        "substat_lvl90": substat_lvl90,
        "awakenCost": (detail.get("upgrade") or {}).get("awaken_cost"),
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

    dump_json(os.path.join(materials_dir, "materials.json"), materials_doc)


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
    char_entries.sort(key=lambda e: (e["name"] or "").lower())
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
    weapon_entries.sort(key=lambda e: (e["name"] or "").lower())
    write_js_db(os.path.join(DATA_DIR, "weapons.js"), "GENSHIN_WEAPON_DB", weapon_entries, WEAPONS_JS_FOOTER)

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

    return len(char_entries), len(weapon_entries)


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


def read_stored_version():
    if not os.path.exists(VERSION_FILE):
        return None
    with open(VERSION_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return None


def write_stored_version(ambr_version: str, char_count: int | None = None, weapon_count: int | None = None):
    payload = {"ambr_version": ambr_version, "schema_version": DATA_SCHEMA_VERSION}
    if char_count is not None:
        payload["char_count"] = char_count
    if weapon_count is not None:
        payload["weapon_count"] = weapon_count
    with open(VERSION_FILE, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, indent=2)


ROSTER_DROP_TOLERANCE = 0.05


def check_roster_sanity(stored: dict | None, char_count: int, weapon_count: int):
    if not stored:
        return
    prev_char = stored.get("char_count")
    prev_weapon = stored.get("weapon_count")
    problems = []
    for label, prev, current in (("character", prev_char, char_count), ("weapon", prev_weapon, weapon_count)):
        if prev is None:
            continue
        if current < prev * (1 - ROSTER_DROP_TOLERANCE):
            problems.append(f"{label} count dropped from {prev} to {current} (>{ROSTER_DROP_TOLERANCE:.0%} decrease)")
    if problems:
        raise RuntimeError(
            "Roster sanity check failed -- this looks like a bad/partial Ambr response, "
            "not a real game update. Refusing to publish. Details: " + "; ".join(problems)
        )


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
    parser.add_argument(
        "--skip-weapons", action="store_true",
        help="Skip weapon fetch/build entirely. Useful when testing character-only changes.",
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
            character_curve = await client.fetch_avatar_curve()
            dump_json(os.path.join(CURVES_DIR, "character_curve.json"), character_curve)

            print("Fetching weapon_curve...")
            weapon_curve = await client.fetch_weapon_curve()
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
            if args.skip_weapons:
                print("  --skip-weapons set, skipping entirely")
                eligible_weapons = []
            else:
                weapons = await client.fetch_weapons()
                print(f"  {len(weapons)} weapons total")
                eligible_weapons = [w for w in weapons if w.rarity >= 3]
                print(f"  ({len(weapons) - len(eligible_weapons)} weapons at 1-2 star skipped)")
                weapon_needles = parse_needles(args.only_weapon)
                if weapon_needles:
                    eligible_weapons = [w for w in eligible_weapons if matches_needle(w, weapon_needles)]
                    print(f"  (test filter) narrowed to {len(eligible_weapons)}: {[w.name for w in eligible_weapons]}")

            valid_char_ids = set()
            valid_weapon_ids = set()

            print(f"\nBuilding character profiles ({DETAIL_FETCH_DELAY}s throttle between fetches)...")
            total = len(characters)
            for i, c in enumerate(characters, 1):
                char_id = str(c.id)
                try:
                    detail = await client.fetch_character_detail(c.id)
                    detail_dict = detail.model_dump(mode="json")
                    detail_dict["gacha"] = detail.gacha
                    dump_json(
                        os.path.join(RAW_DIR, f"character_{char_id}_{c.name.replace(' ', '_')}.json"),
                        detail_dict,
                    )
                    await build_character_profile(detail_dict, material_lookup, localizer)
                    valid_char_ids.add(char_id)
                    print(f"  [{i}/{total}] OK: {c.name}")
                except Exception as e:
                    failed_chars.append((char_id, c.name, str(e)))
                    valid_char_ids.add(char_id)
                    print(f"  [{i}/{total}] FAILED (build): {c.name} ({char_id}) - {e}")
                await asyncio.sleep(DETAIL_FETCH_DELAY)

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
            char_count, weapon_count = build_indexes()

            if not test_mode:
                check_roster_sanity(stored, char_count, weapon_count)

            cleanup_stale_and_orphans(valid_char_ids, valid_weapon_ids, localizer, test_mode)

            print("\nAsset stats:")
            print(f"  downloaded: {localizer.stats['downloaded']}")
            print(f"  reused (already local): {localizer.stats['reused']}")
            print(f"  failed (kept remote URL as fallback): {localizer.stats['failed']}")

        if not test_mode:
            write_stored_version(latest_version, char_count, weapon_count)

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
        print(f"\nFATAL: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
