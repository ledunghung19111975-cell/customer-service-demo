#!/usr/bin/env python3
"""Produce a self-contained HTML from the readable runtime sources."""
from pathlib import Path
import re
root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')
scripts = re.findall(r'<script src="([^"]+)" defer></script>', html)
html = re.sub(r'<script src="[^"]+" defer></script>', '', html)
css = (root / 'src/styles.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="src/styles.css">', '<style>\n' + css + '\n</style>')
bundle = '\n'.join('<script>\n' + (root / p).read_text(encoding='utf-8') + '\n</script>' for p in scripts)
html = html.replace('</body>', bundle + '\n</body>')
out = root / 'dist'
out.mkdir(exist_ok=True)
(out / '知序客服.html').write_text(html, encoding='utf-8')
print(out / '知序客服.html')
