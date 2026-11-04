import re, sys, pathlib
# Glacier brand colour -> Violet counterpart (status colours stay).
MAP = {
 '#1479B0':'#7C3AED', '#9AD8F5':'#A78BFA', '#4DB3E6':'#8B5CF6', '#E6F4FB':'#F1EAFD',
 '#0B2233':'#1A1523', '#E2F0F8':'#ECE6F5', '#9BB0BF':'#9A93A8', '#5F7A8C':'#7A7189',
 '#0E1D28':'#1C1724', '#0A1620':'#15111B', '#1E3242':'#2E2639', '#4A5E6D':'#5C546A',
 '#9DB2C2':'#A79DB9', '#7E909E':'#8E879C', '#EEF5FA':'#F2F0F6', '#DCE6EE':'#E5E0ED',
}
KEEP = {'#FFFFFF','#9A6A12','#E7C58C','#2F7D4F','#6FBF8B'}
root = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
srcs = sorted(list(root.glob('.github/assets/*.svg')) + list(root.glob('packages/docs/src/public/*.svg')))
for src in srcs:
    t = src.read_text()
    def sub(m):
        h = m.group(0).upper()
        if h in MAP: return MAP[h] if m.group(0).isupper() or m.group(0)[1:].isdigit() else MAP[h].lower()
        if h not in KEEP: sys.exit(f'unmapped {h} in {src}')
        return m.group(0)
    t = re.sub(r'#[0-9a-fA-F]{6}\b', sub, t)
    name = ('docs-' if 'docs' in str(src) else '') + src.name
    (out / name).write_text(t); print('wrote', name)
