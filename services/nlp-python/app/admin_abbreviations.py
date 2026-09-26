"""ASEAN administrative short forms used in local news (Dinkes Sumsel, TP.HCM, KL).

The DB alias table is still the durable registry. This map is the offline
fallback when a seed no-ops because the canonical location row is missing
or spelled as South Sumatra instead of Sumatera Selatan.
"""

from __future__ import annotations

import re
from contextvars import ContextVar
from dataclasses import dataclass

from . import config

_DOCUMENT_TEXT: ContextVar[str] = ContextVar("admin_document_text", default="")
PLACE_VARIANTS: dict[str, list["AdminAbbrev"]] = {}


@dataclass(frozen=True)
class AdminAbbrev:
    canonical: str
    country: str
    admin1: str
    iso3: str
    latitude: float
    longitude: float
    admin_level: int
    aliases: tuple[str, ...]
    synonyms: tuple[str, ...] = ()
    admin2: str = ""
    context_cues: tuple[str, ...] = ()


# Local-language short forms that appear in sitreps and headlines.
# Keep 2-letter codes only when they are unambiguous in surveillance copy.
ASEAN_ADMIN_PLACES: tuple[AdminAbbrev, ...] = (
    AdminAbbrev(
        "Sumatera Selatan", "Indonesia", "Sumatera Selatan", "IDN",
        -2.9909, 104.7565, 1,
        ("sumsel",),
        ("sumatra selatan", "south sumatra"),
    ),
    AdminAbbrev(
        "Sumatera Utara", "Indonesia", "Sumatera Utara", "IDN",
        3.5853, 98.6746, 1,
        ("sumut",),
        ("sumatra utara", "north sumatra"),
    ),
    AdminAbbrev(
        "Sumatera Barat", "Indonesia", "Sumatera Barat", "IDN",
        -0.9492, 100.3543, 1,
        ("sumbar",),
        ("sumatra barat", "west sumatra"),
    ),
    AdminAbbrev(
        "Jawa Barat", "Indonesia", "Jawa Barat", "IDN",
        -6.9175, 107.6191, 1,
        ("jabar",),
        ("west java",),
    ),
    AdminAbbrev(
        "Jawa Tengah", "Indonesia", "Jawa Tengah", "IDN",
        -7.1500, 110.1403, 1,
        ("jateng",),
        ("central java",),
    ),
    AdminAbbrev(
        "Jawa Timur", "Indonesia", "Jawa Timur", "IDN",
        -7.5361, 112.2384, 1,
        ("jatim",),
        ("east java",),
    ),
    AdminAbbrev(
        "DKI Jakarta", "Indonesia", "DKI Jakarta", "IDN",
        -6.2088, 106.8456, 1,
        ("dki",),
        (),
    ),
    AdminAbbrev(
        "DI Yogyakarta", "Indonesia", "DI Yogyakarta", "IDN",
        -7.7956, 110.3695, 1,
        ("diy", "jogja", "jogjakarta"),
        ("yogyakarta", "daerah istimewa yogyakarta"),
    ),
    AdminAbbrev(
        "Sulawesi Selatan", "Indonesia", "Sulawesi Selatan", "IDN",
        -5.1477, 119.4327, 1,
        ("sulsel",),
        ("south sulawesi",),
    ),
    AdminAbbrev(
        "Sulawesi Utara", "Indonesia", "Sulawesi Utara", "IDN",
        1.4748, 124.8421, 1,
        ("sulut",),
        ("north sulawesi",),
    ),
    AdminAbbrev(
        "Sulawesi Tengah", "Indonesia", "Sulawesi Tengah", "IDN",
        -0.8998, 119.8707, 1,
        ("sulteng",),
        ("central sulawesi",),
    ),
    AdminAbbrev(
        "Sulawesi Tenggara", "Indonesia", "Sulawesi Tenggara", "IDN",
        -4.1449, 122.1746, 1,
        ("sultra",),
        ("southeast sulawesi",),
    ),
    AdminAbbrev(
        "Sulawesi Barat", "Indonesia", "Sulawesi Barat", "IDN",
        -2.5491, 119.3450, 1,
        ("sulbar",),
        ("west sulawesi",),
    ),
    AdminAbbrev(
        "Kalimantan Barat", "Indonesia", "Kalimantan Barat", "IDN",
        -0.0263, 109.3425, 1,
        ("kalbar",),
        ("west kalimantan",),
    ),
    AdminAbbrev(
        "Kalimantan Timur", "Indonesia", "Kalimantan Timur", "IDN",
        0.5387, 116.4194, 1,
        ("kaltim",),
        ("east kalimantan",),
    ),
    AdminAbbrev(
        "Kalimantan Selatan", "Indonesia", "Kalimantan Selatan", "IDN",
        -3.0926, 115.2838, 1,
        ("kalsel",),
        ("south kalimantan",),
    ),
    AdminAbbrev(
        "Kalimantan Tengah", "Indonesia", "Kalimantan Tengah", "IDN",
        -1.6815, 113.3824, 1,
        ("kalteng",),
        ("central kalimantan",),
    ),
    AdminAbbrev(
        "Kalimantan Utara", "Indonesia", "Kalimantan Utara", "IDN",
        3.0731, 116.0414, 1,
        ("kaltara",),
        ("north kalimantan",),
    ),
    AdminAbbrev(
        "Nusa Tenggara Barat", "Indonesia", "Nusa Tenggara Barat", "IDN",
        -8.6529, 117.3616, 1,
        ("ntb",),
        ("west nusa tenggara",),
    ),
    AdminAbbrev(
        "Nusa Tenggara Timur", "Indonesia", "Nusa Tenggara Timur", "IDN",
        -8.6574, 121.0794, 1,
        ("ntt",),
        ("east nusa tenggara",),
    ),
    AdminAbbrev(
        "Kepulauan Riau", "Indonesia", "Kepulauan Riau", "IDN",
        0.9160, 104.4460, 1,
        ("kepri",),
        ("riau islands",),
    ),
    AdminAbbrev(
        "Kepulauan Bangka Belitung", "Indonesia", "Kepulauan Bangka Belitung", "IDN",
        -2.7411, 106.4406, 1,
        ("babel",),
        ("bangka belitung",),
    ),
    AdminAbbrev(
        "Papua Barat", "Indonesia", "Papua Barat", "IDN",
        -1.3361, 133.1747, 1,
        ("pabar",),
        ("west papua",),
    ),
    AdminAbbrev(
        "Maluku Utara", "Indonesia", "Maluku Utara", "IDN",
        1.5701, 127.8088, 1,
        ("malut",),
        ("north maluku",),
    ),
    AdminAbbrev(
        "Aceh", "Indonesia", "Aceh", "IDN",
        4.6951, 96.7494, 1,
        ("nad",),
        ("nanggroe aceh darussalam",),
    ),
    AdminAbbrev(
        "Ogan Komering Ulu", "Indonesia", "Sumatera Selatan", "IDN",
        -4.0284, 104.0070, 2,
        ("oku",),
        (),
    ),
    AdminAbbrev(
        "Ogan Ilir", "Indonesia", "Sumatera Selatan", "IDN",
        -3.4310, 104.7040, 2,
        (),
        (),
    ),
    AdminAbbrev(
        "Palembang", "Indonesia", "Sumatera Selatan", "IDN",
        -2.9761, 104.7754, 2,
        (),
        (),
    ),
    AdminAbbrev(
        "Lubuklinggau", "Indonesia", "Sumatera Selatan", "IDN",
        -3.2967, 102.8617, 2,
        (),
        ("lubuk linggau",),
    ),
    AdminAbbrev(
        "Muara Enim", "Indonesia", "Sumatera Selatan", "IDN",
        -3.6500, 103.7700, 2,
        (),
        (),
    ),
    AdminAbbrev(
        "Banyuasin", "Indonesia", "Sumatera Selatan", "IDN",
        -2.8830, 104.3830, 2,
        (),
        (),
    ),
    AdminAbbrev(
        "Ogan Komering Ilir", "Indonesia", "Sumatera Selatan", "IDN",
        -3.4550, 104.9230, 2,
        ("oki",),
        (),
    ),
    AdminAbbrev(
        "Musi Banyuasin", "Indonesia", "Sumatera Selatan", "IDN",
        -2.6440, 103.7480, 2,
        ("muba",),
        (),
    ),
    AdminAbbrev(
        "Kutai Timur", "Indonesia", "Kalimantan Timur", "IDN",
        0.5220, 117.5480, 2,
        ("kutim",),
        (),
    ),
    AdminAbbrev(
        "Kuala Lumpur", "Malaysia", "Kuala Lumpur", "MYS",
        3.1390, 101.6869, 1,
        ("kl", "wpkl"),
        (),
    ),
    AdminAbbrev(
        "Johor Bahru", "Malaysia", "Johor", "MYS",
        1.4927, 103.7414, 2,
        ("jb",),
        (),
    ),
    AdminAbbrev(
        "Johor", "Malaysia", "Johor", "MYS",
        1.4854, 103.7610, 1,
        ("jdt",),
        (),
    ),
    AdminAbbrev(
        "Petaling Jaya", "Malaysia", "Selangor", "MYS",
        3.1073, 101.6067, 2,
        ("pj",),
        (),
    ),
    AdminAbbrev(
        "Ho Chi Minh City", "Vietnam", "Ho Chi Minh City", "VNM",
        10.8231, 106.6297, 1,
        ("tp.hcm", "tphcm", "hcmc", "hcm", "tp hcm"),
        ("thành phố hồ chí minh", "saigon", "sài gòn"),
    ),
    AdminAbbrev(
        "Hanoi", "Vietnam", "Hanoi", "VNM",
        21.0278, 105.8342, 1,
        ("hn",),
        ("hà nội", "ha noi"),
    ),
    AdminAbbrev(
        "Bangkok", "Thailand", "Bangkok", "THA",
        13.7563, 100.5018, 1,
        ("bkk",),
        ("krung thep", "krung thep maha nakhon"),
    ),
    AdminAbbrev(
        "Metro Manila", "Philippines", "Metro Manila", "PHL",
        14.5995, 120.9842, 1,
        ("ncr",),
        ("national capital region",),
    ),
    AdminAbbrev(
        "Yangon", "Myanmar", "Yangon", "MMR",
        16.8409, 96.1735, 1,
        ("ygn",),
        ("rangoon",),
    ),
    AdminAbbrev(
        "Naypyidaw", "Myanmar", "Naypyidaw", "MMR",
        19.7633, 96.0785, 1,
        ("npt",),
        ("nay pyi taw",),
    ),
    AdminAbbrev(
        "Vientiane", "Laos", "Vientiane", "LAO",
        17.9757, 102.6331, 1,
        ("vte",),
        (),
    ),
    AdminAbbrev(
        "Bandar Seri Begawan", "Brunei", "Brunei-Muara", "BRN",
        4.9031, 114.9398, 1,
        ("bsb",),
        (),
    ),
    AdminAbbrev(
        "Dili", "Timor-Leste", "Dili", "TLS",
        -8.5569, 125.5603, 1,
        ("dil",),
        (),
    ),
    AdminAbbrev(
        "Jakarta Barat", "Indonesia", "DKI Jakarta", "IDN",
        -6.1683, 106.7589, 2,
        ("jakbar",),
        ("west jakarta",),
        admin2="Jakarta Barat",
        context_cues=("jakarta barat", "jakbar", "sudinkes", "west jakarta"),
    ),
    AdminAbbrev(
        "Cengkareng", "Indonesia", "DKI Jakarta", "IDN",
        -6.1490, 106.7350, 3,
        (),
        (),
        admin2="Jakarta Barat",
        context_cues=("jakarta barat", "jakbar", "sudinkes", "kecamatan"),
    ),
    AdminAbbrev(
        "Kalideres", "Indonesia", "DKI Jakarta", "IDN",
        -6.1540, 106.7050, 3,
        (),
        (),
        admin2="Jakarta Barat",
        context_cues=("jakarta barat", "jakbar", "sudinkes", "kecamatan"),
    ),
    AdminAbbrev(
        "Grogol Petamburan", "Indonesia", "DKI Jakarta", "IDN",
        -6.1660, 106.7880, 3,
        (),
        (),
        admin2="Jakarta Barat",
        context_cues=("jakarta barat", "jakbar", "sudinkes", "kecamatan", "petamburan"),
    ),
    AdminAbbrev(
        "Kebon Jeruk", "Indonesia", "DKI Jakarta", "IDN",
        -6.1920, 106.7690, 3,
        (),
        (),
        admin2="Jakarta Barat",
        context_cues=("jakarta barat", "jakbar", "sudinkes", "kecamatan", "kebon"),
    ),
    AdminAbbrev(
        "Tamansari", "Indonesia", "DKI Jakarta", "IDN",
        -6.1460, 106.8180, 3,
        (),
        ("taman sari",),
        admin2="Jakarta Barat",
        context_cues=("jakarta barat", "jakbar", "sudinkes", "kecamatan"),
    ),
    AdminAbbrev(
        "Kembangan", "Indonesia", "DKI Jakarta", "IDN",
        -6.1910, 106.7440, 3,
        (),
        (),
        admin2="Jakarta Barat",
        context_cues=("jakarta barat", "jakbar", "sudinkes", "kecamatan"),
    ),
    AdminAbbrev(
        "Palmerah", "Indonesia", "DKI Jakarta", "IDN",
        -6.1910, 106.7930, 3,
        (),
        (),
        admin2="Jakarta Barat",
        context_cues=("jakarta barat", "jakbar", "sudinkes", "kecamatan"),
    ),
    AdminAbbrev(
        "Tambora", "Indonesia", "DKI Jakarta", "IDN",
        -6.1460, 106.8080, 3,
        (),
        (),
        admin2="Jakarta Barat",
        context_cues=("jakarta barat", "jakbar", "sudinkes", "kecamatan"),
    ),
)

ADMIN_ABBREVIATIONS: dict[str, AdminAbbrev] = {}
for _place in ASEAN_ADMIN_PLACES:
    for _alias in _place.aliases:
        ADMIN_ABBREVIATIONS[_alias.casefold()] = _place


def is_admin_abbreviation(token: str | None) -> bool:
    folded = str(token or "").strip().casefold()
    return bool(folded) and folded in ADMIN_ABBREVIATIONS


def _coords_key(name: str) -> str | None:
    folded = name.casefold()
    for key in config.LOCATION_COORDS:
        if str(key).casefold() == folded:
            return str(key)
    return None


def _chosen_canonical(place: AdminAbbrev) -> str:
    existing = _coords_key(place.canonical)
    if not existing:
        return place.canonical
    existing_country = str(config.LOCATION_COUNTRIES.get(existing) or "")
    if existing_country and existing_country.casefold() != place.country.casefold():
        return place.canonical
    return existing


def _add_variant(name: str, place: AdminAbbrev) -> None:
    key = name.casefold()
    rows = PLACE_VARIANTS.setdefault(key, [])
    if any(
        row.canonical.casefold() == place.canonical.casefold()
        and row.country.casefold() == place.country.casefold()
        for row in rows
    ):
        return
    rows.append(place)


def _register_place(name: str, place: AdminAbbrev) -> None:
    existing_country = str(config.LOCATION_COUNTRIES.get(name) or "")
    existing_admin2 = str(config.LOCATION_ADMIN2.get(name) or "")
    wanted_admin2 = place.admin2 or (place.canonical if place.admin_level >= 2 else "")
    if existing_country and existing_country.casefold() != place.country.casefold():
        _add_variant(name, place)
        return
    if (
        existing_admin2
        and wanted_admin2
        and existing_admin2.casefold() != wanted_admin2.casefold()
        and existing_admin2.casefold() != place.canonical.casefold()
    ):
        _add_variant(name, place)
        return
    if name not in config.LOCATION_COORDS:
        config.LOCATION_COORDS[name] = (place.latitude, place.longitude)
    config.LOCATION_COUNTRIES.setdefault(name, place.country)
    config.LOCATION_ADMIN1.setdefault(name, place.admin1)
    admin2 = place.admin2 or (place.canonical if place.admin_level >= 2 else "")
    if admin2:
        config.LOCATION_ADMIN2.setdefault(name, admin2)
    config.LOCATION_ISO3.setdefault(name, place.iso3)
    config.LOCATION_ADMIN_LEVEL.setdefault(name, place.admin_level)
    _add_variant(name, place)


def apply_admin_abbreviations() -> int:
    """Inject missing ASEAN admin short forms into the live gazetteer maps."""
    PLACE_VARIANTS.clear()
    added = 0
    alias_keys = {str(key).casefold() for key in config.LOCATION_ALIASES}
    for place in ASEAN_ADMIN_PLACES:
        canonical = _chosen_canonical(place)
        _register_place(canonical, place)
        if canonical != place.canonical:
            _register_place(place.canonical, place)
            if place.canonical.casefold() not in alias_keys:
                config.LOCATION_ALIASES[place.canonical.casefold()] = canonical
                alias_keys.add(place.canonical.casefold())
                added += 1
        for alias in (*place.aliases, *place.synonyms):
            folded = alias.casefold()
            mapped = str(config.LOCATION_ALIASES.get(folded) or "")
            if mapped and mapped.casefold() != place.canonical.casefold():
                _add_variant(alias, place)
                continue
            if folded in alias_keys:
                continue
            config.LOCATION_ALIASES[folded] = canonical
            alias_keys.add(folded)
            added += 1
    _invalidate_alias_views()
    return added


def bind_document_admin_scope(text: str | None):
    return _DOCUMENT_TEXT.set(str(text or ""))


def reset_document_admin_scope(token) -> None:
    _DOCUMENT_TEXT.reset(token)


def document_admin_scope(text: str | None = None) -> AdminAbbrev | None:
    """The kabupaten/kota/province the article is actually about."""
    source = str(text if text is not None else _DOCUMENT_TEXT.get() or "")
    if not source:
        return None
    folded = source.casefold()
    scored: list[tuple[int, AdminAbbrev]] = []
    for place in ASEAN_ADMIN_PLACES:
        if place.admin_level > 2:
            continue
        names = (place.canonical, *place.aliases, *place.synonyms)
        mentions = sum(
            len(re.findall(rf"(?<![a-z]){re.escape(name.casefold())}(?![a-z])", folded))
            for name in names if name
        )
        if mentions <= 0:
            continue
        office = 0
        if re.search(
            rf"(?:sudinkes|dinkes|pemkot|pemkab|pemprov|suku\s+dinas)\s+{re.escape(place.canonical)}",
            source,
            re.IGNORECASE,
        ):
            office = 8
        scored.append((office + mentions * 2 + (3 if place.admin_level == 2 else 1), place))
    if not scored:
        return None
    scored.sort(key=lambda item: (item[0], len(item[1].canonical)), reverse=True)
    return scored[0][1]


def resolve_admin_place(
    name: str | None,
    context: str = "",
    country_hint: str | None = None,
) -> AdminAbbrev | None:
    """Pick the kabupaten/kecamatan that belongs to this article, not a namesake abroad."""
    raw = str(name or "").strip()
    if not raw:
        return None
    folded = raw.casefold()
    variants = list(PLACE_VARIANTS.get(folded, []))
    if not variants:
        variants = [
            place for place in ASEAN_ADMIN_PLACES
            if place.canonical.casefold() == folded
            or folded in {item.casefold() for item in (*place.aliases, *place.synonyms)}
        ]
    if not variants:
        return None
    if len(variants) == 1 and not PLACE_VARIANTS.get(folded):
        return variants[0]
    scope = document_admin_scope()
    window = f"{context} {_DOCUMENT_TEXT.get()}".casefold()
    hint = str(country_hint or (scope.country if scope else "")).casefold()
    best: tuple[int, AdminAbbrev] | None = None
    for place in variants:
        score = 0
        if hint and place.country.casefold() == hint:
            score += 20
        if scope:
            if place.canonical.casefold() == scope.canonical.casefold():
                score += 50
            if place.admin2 and place.admin2.casefold() == scope.canonical.casefold():
                score += 40
            if place.admin1.casefold() == scope.admin1.casefold():
                score += 15
        for cue in place.context_cues:
            if cue and cue.casefold() in window:
                score += 10
        if best is None or score > best[0]:
            best = (score, place)
    if best and best[0] > 0:
        return best[1]
    if scope:
        for place in variants:
            if place.country.casefold() == scope.country.casefold():
                return place
    return None


def _invalidate_alias_views() -> None:
    try:
        from .extractors import invalidate_location_alias_cache
        invalidate_location_alias_cache()
    except Exception:
        pass
    try:
        from .surveillance_extraction import GazetteerLinker
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
    except Exception:
        pass


def _flatten_resolved(names) -> set[str]:
    out: set[str] = set()
    for raw in names or []:
        for part in re.split(r"[;,/|]", str(raw or "")):
            token = part.strip().casefold()
            if token:
                out.add(token)
    return out


def abbreviations_in_text(text: str | None) -> list[tuple[str, AdminAbbrev]]:
    source = str(text or "")
    if not source:
        return []
    found: list[tuple[str, AdminAbbrev]] = []
    seen: set[str] = set()
    for alias, place in ADMIN_ABBREVIATIONS.items():
        pattern = rf"(?<![A-Za-z]){re.escape(alias)}(?![A-Za-z])"
        if not re.search(pattern, source, re.IGNORECASE):
            continue
        key = place.canonical.casefold()
        if key in seen:
            continue
        seen.add(key)
        found.append((alias, place))
    return found


def extraction_geo_uncertain(
    text: str | None,
    *,
    resolved_names=None,
    case_count: int = 0,
    death_count: int = 0,
) -> bool:
    """True when a local admin short form is present but not bound to its place."""
    if (case_count or 0) <= 0 and (death_count or 0) <= 0:
        return False
    hits = abbreviations_in_text(text)
    if not hits:
        return False
    resolved = _flatten_resolved(resolved_names)
    for _alias, place in hits:
        labels = {
            place.canonical.casefold(),
            place.admin1.casefold(),
            *(item.casefold() for item in place.synonyms),
            *(item.casefold() for item in place.aliases),
        }
        if not (labels & resolved):
            return True
    return False
