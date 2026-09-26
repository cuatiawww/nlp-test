from app import config
from app.admin_abbreviations import apply_admin_abbreviations

apply_admin_abbreviations()

needles = [
    "kembangan", "tamansari", "jeruk", "kebon jeruk", "barat", "jakarta barat",
    "tambora", "grogol", "palmerah", "cengkareng", "kalideres", "arum",
    "april", "maret", "jumat", "jakbar", "sudinkes",
]
for name, country in config.LOCATION_COUNTRIES.items():
    folded = name.casefold()
    if any(n in folded or folded == n for n in needles):
        print(f"{name!r:40} {country}")
print("--- malaysia / singapore named places containing list tokens ---")
for name, country in config.LOCATION_COUNTRIES.items():
    if country in {"Malaysia", "Singapore"} and any(
        tok in name.casefold()
        for tok in ("kembang", "taman", "barat", "grogol", "tambora", "jeruk", "palmer")
    ):
        print(f"{name!r:40} {country}")
