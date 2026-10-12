"""Give every app hosted under apps/<folder>/ a home-screen icon and manifest.

Reads apps/catalog.js, and for each access:'play' app writes home-icon-180.png, home-icon-512.png and
manifest.webmanifest into its folder and adds the matching <link>/<meta> tags to its index.html
(between marker comments, so re-running just refreshes them). Uses the catalog icon when there is one,
otherwise a gradient tile from the catalog hue with the app's initial.

    python tools/make-home-screen.py            # all hosted apps
    python tools/make-home-screen.py paper-sim  # just these ids
"""
import json, re, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent / 'apps'
START, END = '<!-- home-screen:start -->', '<!-- home-screen:end -->'
FONTS = ['C:/Windows/Fonts/georgiab.ttf', 'C:/Windows/Fonts/arialbd.ttf']

def catalog():
    js = ("global.window={};require('vm').runInNewContext(require('fs').readFileSync(process.argv[1],'utf8'),{window:global.window});"
          "console.log(JSON.stringify(window.CATALOG.apps))")
    return json.loads(subprocess.check_output(['node', '-e', js, str(ROOT / 'catalog.js')]))

def tile(app, size):
    if app.get('icon') and (ROOT / app['icon']).exists():
        im = Image.open(ROOT / app['icon']).convert('RGBA')
        bg = Image.new('RGBA', im.size, (0, 0, 0, 255)); bg.alpha_composite(im)   # iOS wants an opaque square
        return bg.convert('RGB').resize((size, size), Image.LANCZOS)
    c0, c1 = [tuple(int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)) for h in app['hue']]
    im = Image.new('RGB', (size, size)); px = im.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(round(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
    mid = [(c0[i] + c1[i]) / 2 for i in range(3)]
    ink = (24, 24, 28) if 0.299 * mid[0] + 0.587 * mid[1] + 0.114 * mid[2] > 150 else (255, 255, 255)   # readable on light or dark tiles
    font = None
    for f in FONTS:
        try: font = ImageFont.truetype(f, int(size * .56)); break
        except OSError: pass
    ImageDraw.Draw(im).text((size / 2, size / 2), app['name'][0].upper(), font=font, fill=ink, anchor='mm')
    return im

def tracked(folder):
    r = subprocess.run(['git', 'ls-files', '--error-unmatch', str(folder / 'index.html')], cwd=ROOT, capture_output=True)
    return r.returncode == 0

only = set(sys.argv[1:])
for a in catalog():
    if a.get('access') != 'play' or (only and a['id'] not in only): continue
    folder = ROOT / a['url'].strip('/'); page = folder / 'index.html'
    if not page.exists() or not tracked(folder):
        print('skip', a['id'], '(no page, or not committed yet)'); continue
    tile(a, 180).save(folder / 'home-icon-180.png'); tile(a, 512).save(folder / 'home-icon-512.png')
    theme = a['hue'][0]
    (folder / 'manifest.webmanifest').write_text(json.dumps({
        'name': a['name'], 'short_name': a['name'][:12], 'description': a['subtitle'], 'start_url': './', 'scope': './',
        'display': 'standalone', 'background_color': theme, 'theme_color': theme,
        'icons': [{'src': 'home-icon-180.png', 'sizes': '180x180', 'type': 'image/png'},
                  {'src': 'home-icon-512.png', 'sizes': '512x512', 'type': 'image/png'}]}, indent=2) + '\n')
    name = a['name'].replace('&', '&amp;').replace('"', '&quot;')
    block = (f'{START}\n    <link rel="manifest" href="manifest.webmanifest">\n    <link rel="apple-touch-icon" href="home-icon-180.png">\n'
             f'    <meta name="apple-mobile-web-app-capable" content="yes">\n    <meta name="mobile-web-app-capable" content="yes">\n'
             f'    <meta name="apple-mobile-web-app-title" content="{name}">\n    {END}')
    html = page.read_text(encoding='utf-8')
    html = re.sub(re.escape(START) + r'.*?' + re.escape(END), lambda m: block, html, flags=re.S) if START in html \
        else re.sub(r'</head>', lambda m: f'    {block}\n  </head>', html, count=1, flags=re.I)
    page.write_text(html, encoding='utf-8'); print('ok  ', a['id'])
