"""
Regenerates assets/data/characters.js, assets/data/weapons.js, and
assets/data/character-profiles.js from Project Ambr (via ambr-py), in
the format the wish tracker + Build tab expect.

Gated on Ambr's own data version: fetch_latest_version() is checked
first, and the whole pipeline (including the expensive per-character
detail pull) is skipped entirely unless that hash has actually changed
since the last successful run. Most days this script does one cheap
API call and exits.

Meant to be run by the GitHub Actions workflow
(.github/workflows/update-data.yml) — not manually. To run locally:
`pip install ambr-py` then `python scripts/update_data.py`.
"""

import asyncio
import json
import os

import ambr

VERSION_FILE = os.path.join(os.path.dirname(__file__), ".ambr-version")
DETAIL_FETCH_DELAY = 0.4  # seconds between per-character detail calls

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


def normalize_element(raw):
    if not raw:
        return None
    return ELEMENT_MAP.get(raw, raw)


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

CHARACTER_PROFILES_JS_FOOTER = """
function getCharacterProfile(id) {
    return GENSHIN_CHARACTER_PROFILES.find(p => p.id === id) || null;
}

function getCharacterProfileByName(name) {
    return GENSHIN_CHARACTER_PROFILES.find(p => p.name.toLowerCase() === name.toLowerCase()) || null;
}
"""


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
        "weaponType": getattr(w, "type", None),
        "icon": getattr(w, "icon", None),
        "isCustom": False,
    }


# --- Character profile (Build tab) helpers -------------------------------

def build_material_lookup(materials):
    lookup = {}
    for m in materials:
        d = m.model_dump()
        lookup[d["id"]] = {
            "name": d.get("name"),
            "icon": d.get("icon"),
            "rarity": d.get("rarity"),
        }
    return lookup


def categorize_material(mat_id):
    """
    Buckets an ascension material id by Ambr's numeric id-prefix scheme.
    Verified against two real character samples (Sandrone, Aino); if a
    future character's materials don't fit cleanly, they'll still land
    in ascensionMaterials (the full flat list is always kept as a
    fallback/superset), just possibly uncategorized in the split lists.
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


def resolve_cost_items(cost_items, material_lookup, qty_key):
    if not cost_items:
        return []
    resolved = []
    for item in cost_items:
        mat_id = item.get("id")
        info = material_lookup.get(mat_id, {})
        resolved.append({
            "id": mat_id,
            "name": info.get("name"),
            "icon": info.get("icon"),
            "rarity": info.get("rarity"),
            "qty": item.get(qty_key),
        })
    return resolved


def trim_character_profile(raw, material_lookup):
    active_talents = []
    passive_talents = []
    for t in raw.get("talents", []):
        entry = {
            "name": t.get("name"),
            "description": t.get("description"),
            "icon": t.get("icon"),
        }
        if t.get("upgrades"):
            # Cost only — level, Mora, resolved material quantities.
            # Deliberately excludes each upgrade's damage-scaling
            # description/params, which is where the multi-thousand-line
            # bloat came from originally.
            entry["levelCosts"] = [
                {
                    "level": u.get("level"),
                    "moraCost": u.get("mora_cost"),
                    "items": resolve_cost_items(u.get("cost_items"), material_lookup, "amount"),
                }
                for u in t["upgrades"]
            ]
            active_talents.append(entry)
        else:
            passive_talents.append(entry)

    constellations = [
        {
            "name": c.get("name"),
            "description": c.get("description"),
            "icon": c.get("icon"),
        }
        for c in raw.get("constellations", [])
    ]

    ascension_materials = []
    buckets = {"ascensionGems": [], "localSpecialty": [], "talentBooks": [], "enemyDrops": []}

    for m in raw.get("ascension_materials", []):
        mat_id = m.get("id")
        resolved = material_lookup.get(mat_id, {})
        entry = {
            "id": mat_id,
            "name": resolved.get("name"),
            "icon": resolved.get("icon"),
            "rarity": m.get("rarity"),
        }
        ascension_materials.append(entry)

        bucket = categorize_material(mat_id)
        if bucket:
            buckets[bucket].append(entry)

    # Per-ascension-phase Mora + material quantities (0 = base, 1-6 =
    # each ascension). This is the actual cost table — separate from
    # ascensionMaterials above, which only lists unique item *types*
    # with no quantities.
    promotes = []
    for p in raw.get("upgrade", {}).get("promotes", []):
        promotes.append({
            "promoteLevel": p.get("promote_level"),
            "unlockMaxLevel": p.get("unlock_max_level"),
            "moraCost": p.get("coin_cost"),
            "requiredPlayerLevel": p.get("required_player_level"),
            "items": resolve_cost_items(p.get("cost_items"), material_lookup, "count"),
        })

    return {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "rarity": raw.get("rarity"),
        "element": raw.get("element"),
        "weapon_type": raw.get("weapon_type"),
        "icon": raw.get("icon"),
        "activeTalents": active_talents,
        "passiveTalents": passive_talents,
        "constellations": constellations,
        "ascensionMaterials": ascension_materials,
        "ascensionGems": buckets["ascensionGems"],
        "localSpecialty": buckets["localSpecialty"],
        "talentBooks": buckets["talentBooks"],
        "enemyDrops": buckets["enemyDrops"],
        "promotes": promotes,
    }


async def fetch_all_character_profiles(client, characters, material_lookup):
    profiles = []
    total = len(characters)
    for i, c in enumerate(characters, 1):
        char_id = c.id
        try:
            detail = await client.fetch_character_detail(char_id)
            profiles.append(trim_character_profile(detail.model_dump(), material_lookup))
            print(f"  [{i}/{total}] OK: {c.name}")
        except Exception as e:
            print(f"  [{i}/{total}] FAILED: {c.name} ({char_id}) - {e}")
        await asyncio.sleep(DETAIL_FETCH_DELAY)
    return profiles


def write_character_profiles(profiles_dir, entries):
    """
    Writes one small JSON file per character (keyed by id, stable across
    renames) instead of one giant blob. This keeps git diffs to just the
    characters that actually changed on patch day, and lets the Build
    tab fetch only the specific character it needs instead of loading
    the entire roster's profile data upfront.

    Also writes a lightweight index.js (id/name/rarity/element/icon
    only) for the autocomplete search, so that doesn't need to load
    every full profile either.
    """
    os.makedirs(profiles_dir, exist_ok=True)

    # Remove stale per-character files from a previous run (e.g. a
    # character that got merged/renamed) so the folder doesn't
    # accumulate orphans over time.
    existing_ids = {f"{e['id']}.json" for e in entries}
    for fname in os.listdir(profiles_dir):
        if fname.endswith(".json") and fname not in existing_ids:
            os.remove(os.path.join(profiles_dir, fname))

    index = []
    for e in entries:
        char_path = os.path.join(profiles_dir, f"{e['id']}.json")
        with open(char_path, "w", encoding="utf-8") as f:
            json.dump(e, f, ensure_ascii=False, indent=2)

        index.append({
            "id": e["id"],
            "name": e["name"],
            "rarity": e["rarity"],
            "element": e["element"],
            "icon": e.get("icon"),
        })

    index_path = os.path.join(profiles_dir, "index.js")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(f"const GENSHIN_CHARACTER_PROFILE_INDEX = {js_value(index)};\n")

    return index_path


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


def read_stored_version():
    if not os.path.exists(VERSION_FILE):
        return None
    with open(VERSION_FILE, "r", encoding="utf-8") as f:
        return f.read().strip()


def write_stored_version(version):
    with open(VERSION_FILE, "w", encoding="utf-8") as f:
        f.write(version)


def categorize_weapon_material(mat_id):
    """
    Weapon-specific split: 112xxx = common enemy drops (shared item
    family with characters, e.g. Drive Shafts), 114xxx = weapon-only
    ascension ore/crystal materials. Weapons don't have the
    gems/local-specialty/talent-book concept characters do, so those
    buckets don't apply here.
    """
    if 112000 <= mat_id < 113000:
        return "enemyDrops"
    if 114000 <= mat_id < 115000:
        return "weaponMaterials"
    return None


def trim_weapon_profile(raw, material_lookup):
    ascension_materials = []
    buckets = {"enemyDrops": [], "weaponMaterials": []}

    for m in raw.get("ascension_materials", []):
        mat_id = m.get("id")
        resolved = material_lookup.get(mat_id, {})
        entry = {
            "id": mat_id,
            "name": resolved.get("name"),
            "icon": resolved.get("icon"),
            "rarity": m.get("rarity"),
        }
        ascension_materials.append(entry)
        bucket = categorize_weapon_material(mat_id)
        if bucket:
            buckets[bucket].append(entry)

    promotes = []
    for p in raw.get("upgrade", {}).get("promotes", []):
        promotes.append({
            "promoteLevel": p.get("promote_level"),
            "unlockMaxLevel": p.get("unlock_max_level"),
            "moraCost": p.get("coin_cost"),
            "requiredPlayerLevel": p.get("required_player_level"),
            "items": resolve_cost_items(p.get("cost_items"), material_lookup, "amount"),
        })

    return {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "rarity": raw.get("rarity"),
        "type": raw.get("type"),
        "icon": raw.get("icon"),
        "ascensionMaterials": ascension_materials,
        "enemyDrops": buckets["enemyDrops"],
        "weaponMaterials": buckets["weaponMaterials"],
        "promotes": promotes,
    }


async def fetch_all_weapon_profiles(client, weapons, material_lookup):
    # Skip 1-2 star weapons entirely — nobody uses them, no point
    # spending API calls or shipping files nobody will ever load.
    eligible = [w for w in weapons if w.rarity >= 3]
    profiles = []
    skipped_non_playable = []
    total = len(eligible)
    print(f"  ({len(weapons) - total} weapons at 1-2 star skipped)")
    for i, w in enumerate(eligible, 1):
        try:
            detail = await client.fetch_weapon_detail(w.id)
            profiles.append(trim_weapon_profile(detail.model_dump(), material_lookup))
            print(f"  [{i}/{total}] OK: {w.name}")
        except Exception as e:
            # Weapon skins (e.g. "X - Sublimation" reforged variants)
            # share their base weapon's stats entirely and carry no
            # independent ascension/refinement data of their own —
            # that's why these fields come back missing. Not a real
            # fetch failure, just a catalog entry with nothing new to
            # pull; skip it quietly instead of alarming about it.
            missing = ("storyId", "affix", "upgrade", "ascension")
            err_text = str(e)
            if all(f"{field}\n  Field required" in err_text for field in missing):
                skipped_non_playable.append((w.id, w.name))
                print(f"  [{i}/{total}] SKIPPED (non-playable entry): {w.name}")
            else:
                print(f"  [{i}/{total}] FAILED: {w.name} ({w.id}) - {e}")
        await asyncio.sleep(DETAIL_FETCH_DELAY)
    if skipped_non_playable:
        print(f"  {len(skipped_non_playable)} weapon skin entries skipped (share base weapon's stats, no independent data)")
    return profiles


def write_weapon_profiles(profiles_dir, entries):
    os.makedirs(profiles_dir, exist_ok=True)

    existing_ids = {f"{e['id']}.json" for e in entries}
    for fname in os.listdir(profiles_dir):
        if fname.endswith(".json") and fname not in existing_ids:
            os.remove(os.path.join(profiles_dir, fname))

    index = []
    for e in entries:
        path = os.path.join(profiles_dir, f"{e['id']}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(e, f, ensure_ascii=False, indent=2)
        index.append({
            "id": e["id"], "name": e["name"], "rarity": e["rarity"],
            "type": e["type"], "icon": e.get("icon"),
        })

    index_path = os.path.join(profiles_dir, "index.js")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(f"const GENSHIN_WEAPON_PROFILE_INDEX = {js_value(index)};\n")

    return index_path


async def main():
    # cache_ttl set well above our own daily version-check cadence, so
    # re-running this script for reasons unrelated to Ambr's data itself
    # (e.g. a bug fix on our end, testing) is served from the local
    # SQLite cache instead of re-hitting their servers for everything.
    async with ambr.AmbrAPI(cache_ttl=60 * 60 * 24 * 7) as client:
        print("Checking Ambr data version...")
        latest_version = await client.fetch_latest_version()
        stored_version = read_stored_version()

        if stored_version == latest_version:
            print(f"No change (version {latest_version}). Skipping update.")
            return

        print(f"Version changed: {stored_version!r} -> {latest_version!r}. Running full sync...")

        print("Fetching characters and weapons...")
        characters = await client.fetch_characters()
        weapons = await client.fetch_weapons()
        print(f"Characters fetched: {len(characters)}")
        print(f"Weapons fetched: {len(weapons)}")

        char_entries = [build_character_entry(c) for c in characters]
        weapon_entries = [build_weapon_entry(w) for w in weapons]

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

        print("Fetching materials catalog (lookup only, not shipped)...")
        materials = await client.fetch_materials()
        material_lookup = build_material_lookup(materials)
        print(f"Loaded {len(material_lookup)} materials into lookup table")

        print(f"Fetching character detail profiles (sequential, {DETAIL_FETCH_DELAY}s between calls)...")
        profile_entries = await fetch_all_character_profiles(client, characters, material_lookup)
        profile_entries.sort(key=lambda e: (e["name"] or "").lower())

        print(f"Fetching weapon detail profiles, 3-star and up only (sequential, {DETAIL_FETCH_DELAY}s between calls)...")
        weapon_profile_entries = await fetch_all_weapon_profiles(client, weapons, material_lookup)
        weapon_profile_entries.sort(key=lambda e: (e["name"] or "").lower())

        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        out_dir = os.path.join(project_root, "assets", "data")
        char_path = os.path.join(out_dir, "characters.js")
        weapon_path = os.path.join(out_dir, "weapons.js")
        profiles_dir = os.path.join(out_dir, "character-profiles")
        weapon_profiles_dir = os.path.join(out_dir, "weapon-profiles")

        write_js_db(char_path, "GENSHIN_CHARACTER_DB", char_entries, CHARACTERS_JS_FOOTER)
        write_js_db(weapon_path, "GENSHIN_WEAPON_DB", weapon_entries, WEAPONS_JS_FOOTER)
        index_path = write_character_profiles(profiles_dir, profile_entries)
        weapon_index_path = write_weapon_profiles(weapon_profiles_dir, weapon_profile_entries)

        write_stored_version(latest_version)

        print("Saved:")
        print(char_path)
        print(weapon_path)
        print(f"{profiles_dir}\\ ({len(profile_entries)} files)")
        print(index_path)
        print(f"{weapon_profiles_dir}\\ ({len(weapon_profile_entries)} files)")
        print(weapon_index_path)
        print(VERSION_FILE)


if __name__ == "__main__":
    asyncio.run(main())
