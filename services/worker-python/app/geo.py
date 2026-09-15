"""PostGIS point helpers.

ST_MakePoint(x, y) uses X=longitude and Y=latitude. Passing latitude first
pins ASEAN cities into the Atlantic and swaps them on the map.
"""


def st_makepoint_args(latitude, longitude):
    """Bind order for a nullable ``ST_MakePoint(longitude, latitude)``.

    Use with::

        CASE WHEN %s::float8 IS NULL OR %s::float8 IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326)
        END
    """
    return (longitude, latitude, longitude, latitude)
