"""PostGIS point helpers.

ST_MakePoint(x, y) uses X=longitude and Y=latitude. Passing latitude first
pins ASEAN cities into the Atlantic and swaps them on the map.
"""

import unicodedata


def st_makepoint_args(latitude, longitude):
    """Bind order for a nullable ``ST_MakePoint(longitude, latitude)``.

    Use with::

        CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
        END
    """
    return (longitude, latitude, longitude, latitude)


# Country-level pins only. Never used as a fallback for a missing city.
ASEAN_COUNTRY_CENTROIDS = {
    "Brunei": (4.5353, 114.7277),
    "Cambodia": (12.5657, 104.9910),
    "Indonesia": (-2.5489, 118.0149),
    "Laos": (17.9757, 102.6331),
    "Malaysia": (3.1390, 101.6869),
    "Myanmar": (19.7633, 96.0785),
    "Philippines": (14.5995, 120.9842),
    "Singapore": (1.3521, 103.8198),
    "Thailand": (13.7563, 100.5018),
    "Vietnam": (14.0583, 108.2772),
    "Timor-Leste": (-8.5569, 125.5603),
}

# south, north, west, east
ASEAN_COUNTRY_BBOXES = {
    "Brunei": (4.0, 5.15, 114.0, 115.5),
    "Cambodia": (10.3, 14.75, 102.3, 107.7),
    "Indonesia": (-11.2, 6.35, 94.9, 141.1),
    "Laos": (13.9, 22.55, 100.0, 107.8),
    "Malaysia": (0.85, 7.55, 99.55, 119.4),
    "Myanmar": (9.5, 28.55, 92.1, 101.2),
    "Philippines": (4.55, 21.25, 116.9, 126.7),
    "Singapore": (1.15, 1.48, 103.6, 104.1),
    "Thailand": (5.55, 20.55, 97.3, 105.7),
    "Vietnam": (8.35, 23.45, 102.1, 109.55),
    "Timor-Leste": (-9.55, -8.1, 124.0, 127.45),
}


def _country_key(country: str | None) -> str | None:
    if not country:
        return None
    folded = country.strip().casefold()
    for name in ASEAN_COUNTRY_CENTROIDS:
        if name.casefold() == folded:
            return name
    return country.strip()


def coords_in_country_bbox(lat, lon, country: str | None) -> bool:
    if lat is None or lon is None or not country:
        return False
    bbox = ASEAN_COUNTRY_BBOXES.get(_country_key(country) or "")
    if not bbox:
        return True
    south, north, west, east = bbox
    return south <= float(lat) <= north and west <= float(lon) <= east


def country_centroid(country: str | None):
    if not country:
        return None
    return ASEAN_COUNTRY_CENTROIDS.get(_country_key(country) or "")


# Subnational pins used when the locations table has not been re-seeded.
CURATED_ADMIN_COORDS = {
    "an giang": ("Vietnam", 10.5216, 105.1259),
    "quang tri": ("Vietnam", 16.7943, 107.0027),
    "yogyakarta": ("Indonesia", -7.7956, 110.3695),
    "di yogyakarta": ("Indonesia", -7.7956, 110.3695),
    "jogja": ("Indonesia", -7.7956, 110.3695),
}
_INDONESIA_DEFAULT_CENTROID = (-2.5489, 118.0149)


def _fold_admin_name(name: str) -> str:
    folded = unicodedata.normalize("NFKD", name.casefold())
    return "".join(char for char in folded if not unicodedata.combining(char))


def curated_admin_coordinates(name: str | None, country: str | None = None):
    """Return a curated province pin, or None when the name is unknown."""
    key = _fold_admin_name(str(name or "").strip())
    row = CURATED_ADMIN_COORDS.get(key)
    if not row:
        return None
    place_country, lat, lon = row
    if country and _country_key(country) != place_country and country.strip().casefold() != place_country.casefold():
        return None
    return lat, lon


def replace_foreign_indonesia_centroid(lat, lon, country: str | None):
    """Never keep the Indonesia default pin on another country's row."""
    if lat is None or lon is None or not country:
        return lat, lon
    if country.strip().casefold() == "indonesia":
        return lat, lon
    if abs(float(lat) - _INDONESIA_DEFAULT_CENTROID[0]) > 1e-3:
        return lat, lon
    if abs(float(lon) - _INDONESIA_DEFAULT_CENTROID[1]) > 1e-3:
        return lat, lon
    return country_centroid(country) or (None, None)
