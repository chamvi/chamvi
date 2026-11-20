import re, sys, pathlib
# Usage: recolor.py <repo> <palette> <out-dir>
# Writes a parked palette's copy of every brand SVG from the current Cobalt
# originals (see .agents/design.md, "Parked palettes"). Status colours stay.
KEEP = {'#FFFFFF', '#9A6A12', '#E7C58C', '#2F7D4F', '#6FBF8B'}
# Cobalt colour -> parked counterpart.
MAPS = {
    'glacier': {
        '#2F55E4': '#1479B0', '#7F9CFF': '#9AD8F5', '#4A6FF0': '#4DB3E6', '#EEF2FE': '#E6F4FB',
        '#121419': '#0B2233', '#ECECF0': '#E2F0F8', '#A3A8B3': '#9BB0BF', '#6B717D': '#5F7A8C',
        '#121418': '#0E1D28', '#0C0D10': '#0A1620', '#25282F': '#1E3242', '#555B67': '#4A5E6D',
        '#9A9FAB': '#9DB2C2', '#80858F': '#7E909E', '#F4F5F8': '#EEF5FA', '#E2E4EA': '#DCE6EE',
    },
    'violet': {
        '#2F55E4': '#7C3AED', '#7F9CFF': '#A78BFA', '#4A6FF0': '#8B5CF6', '#EEF2FE': '#F1EAFD',
        '#121419': '#1A1523', '#ECECF0': '#ECE6F5', '#A3A8B3': '#9A93A8', '#6B717D': '#7A7189',
        '#121418': '#1C1724', '#0C0D10': '#15111B', '#25282F': '#2E2639', '#555B67': '#5C546A',
        '#9A9FAB': '#A79DB9', '#80858F': '#8E879C', '#F4F5F8': '#F2F0F6', '#E2E4EA': '#E5E0ED',
    },
}
# Both parked palettes were drawn with Instrument Sans and JetBrains Mono.
FONTS = {"'Geist'": "'Instrument Sans'", "'Geist Mono'": "'JetBrains Mono'"}

root = pathlib.Path(sys.argv[1]); palette = MAPS[sys.argv[2]]; out = pathlib.Path(sys.argv[3])
srcs = [(p, p.name) for p in sorted(root.glob('.github/assets/*.svg'))]
srcs += [(p, 'docs-' + p.name) for p in sorted(root.glob('packages/docs/src/public/*.svg'))]
srcs += [(root / 'packages/ui/app/public/favicon.svg', 'ui-favicon.svg')]
for src, name in srcs:
    t = src.read_text()
    def sub(m):
        h = m.group(0).upper()
        if h in palette:
            return palette[h] if m.group(0)[1:] == h[1:] else palette[h].lower()
        if h not in KEEP:
            sys.exit(f'unmapped {h} in {src}')
        return m.group(0)
    t = re.sub(r'#[0-9a-fA-F]{6}\b', sub, t)
    for a, b in FONTS.items():
        t = t.replace(a, b)
    (out / name).write_text(t)
    print('wrote', name)
