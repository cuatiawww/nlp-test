import json, re, glob, os

en = json.load(open('/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/locales/en.json'))
id_d = json.load(open('/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/locales/id.json'))

def flatten(d, prefix=''):
    items = {}
    for k, v in d.items():
        new_key = prefix + '.' + k if prefix else k
        if isinstance(v, dict):
            items.update(flatten(v, new_key))
        else:
            items[new_key] = v
    return items

en_flat = flatten(en)
id_flat = flatten(id_d)

print('=== 1. CHECK EN.JSON FOR INDONESIAN TEXT ===')
id_words = ['penyakit', 'keluar', 'tambah', 'hapus', 'simpan', 'batal', 'pengguna', 'laporan', 'aturan', 'peringatan', 'gejala', 'kasus', 'kematian', 'tidak', 'yang', 'dari', 'untuk', 'semua', 'pencarian', 'masuk', 'ubah', 'tutup', 'pemantauan', 'konfigurasi', 'beranda']

for k, v in en_flat.items():
    if isinstance(v, str):
        v_lower = v.lower()
        for word in id_words:
            if re.search(r'\b' + word + r'\b', v_lower):
                print('  [EN has Indonesian] ' + k + ': "' + v + '"')
                break

print('\n\=== 2. SCAN TSX FILES FOR INDONESIAN TEXT ===')
tsx_files = glob.glob('/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/**/*.tsx', recursive=True)
for f in tsx_files:
    if 'locales' in f or 'node_modules' in f: continue
    content = open(f).read()
    lines = content.splitlines()
    rel = os.path.relpath(f, '/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next')
    for idx, line in enumerate(lines):
        line_lower = line.lower()
        for word in id_words:
            if re.search(r'\b' + word + r'\b', line_lower):
                s = line.strip()
                if s.startswith('//') or s.startswith('*'): continue
                if 'Logo Kementerian' in line: continue
                if 'title="Bahasa Indonesia"' in line or 'aria-label="Ganti ke Bahasa Indonesia"' in line: continue
                if 'sidebar.' in line or 'pages.' in line or 'common.' in line or 'header.' in line or 'dashboard.' in line or 'ews.' in line or 'map.' in line or 'tv.' in line or	'severity.' in line or 'diseases.' in line or 'footer.' in line: continue
                print('  ' + rel + ':' + str(idx+1) + ' -> ' + s)
                break
