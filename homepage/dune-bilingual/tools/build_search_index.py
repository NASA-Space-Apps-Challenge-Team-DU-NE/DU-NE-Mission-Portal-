"""Rebuild assets/js/search-index.js from the pages. Run from the website folder:
   python3 tools/build_search_index.py
Run it again whenever page text changes, so the search box finds the new text."""
import glob, html, json, os, re, sys
root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.chdir(root)
SKIP = {'search.html', 'addedteaching.html'}
pages = []
for f in sorted(glob.glob('*.html')):
    if f in SKIP: continue
    s = open(f, encoding='utf-8').read()
    t = re.search(r'<title>(.*?)</title>', s, re.S)
    title = html.unescape(t.group(1)).split(' - ')[0].strip() if t else f
    m = re.search(r'<main\b.*?</main>', s, re.S)
    body = m.group(0) if m else ''
    body = re.sub(r'<(script|style|svg)\b.*?</\1>', ' ', body, flags=re.S)
    body = re.sub(r'<[^>]+>', ' ', body)
    body = re.sub(r'\s+', ' ', html.unescape(body)).strip()
    pages.append({'u': f, 't': title, 'x': body})
os.makedirs('assets/js', exist_ok=True)
with open('assets/js/search-index.js', 'w', encoding='utf-8', newline='\n') as out:
    out.write('// Made by tools/build_search_index.py. Do not edit by hand.\nvar SEARCH_INDEX = ')
    json.dump(pages, out, ensure_ascii=False, indent=0)
    out.write(';\n')
print('indexed', len(pages), 'pages')
