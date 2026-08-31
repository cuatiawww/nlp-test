import json

with open('/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/locales/en.json') as f:
    en = json.load(f)
with open('/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/locales/id.json') as f:
    id_d = json.load(f)

def flatten(d, prefix=''):
    items = {}
    for k, v in d.items():
        new_key = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            items.update(flatten(v, new_key))
        else:
            items[new_key] = v
    return items

en_flat = flatten(en)
id_flat = flatten(id_d)

missing_in_en = set(id_flat.keys()) - set(en_flat.keys())
missing_in_id = set(en_flat.keys()) - set(id_flat.keys())

print(f'Total EN keys: {len(en_flat)}, Total ID keys: {len(id_flat)}')
print(f'Missing in EN ({len(missing_in_en)}):')
for k in sorted(missing_in_en):
    print(f'  + {k} = {id_flat[k]}')
print(f'Missing in ID ({len(missing_in_id)}):')
for k in sorted(missing_in_id):
    print(f'  - {k} = {en_flat[k]}')
