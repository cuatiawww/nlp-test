path = '/home/aspire_5/app/NLP-PENYAKIT/services/backend-rust/src/security.rs'
with open(path, 'r') as f:
    content = f.read()

old = '        "/api/v1/region-context",'
new = '''        "/api/v1/region-context",
        "/api/v1/map-layers/vectors",
        "/api/v1/map-layers/flights",
        "/api/v1/map-layers/fires",
        "/api/v1/map-layers/facilities",
        "/api/v1/map-layers/news",
        "/api/v1/map-layers/population",'''
content = content.replace(old, new, 1)

with open(path, 'w') as f:
    f.write(content)
print(f'Patched security.rs — {len(content)} bytes')
