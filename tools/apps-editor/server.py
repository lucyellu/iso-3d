"""Local-only editor for apps/catalog.js. Serves the whole site and accepts saves."""
import http.server, json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / 'apps' / 'catalog.js'
BACKUP = Path(__file__).resolve().parent / 'catalog.backup.js'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
HEADS = {'game': '// ── Games ───────────────────────────────────────────────',
         'app': '// ── Apps ────────────────────────────────────────────────',
         'toy': '// ── Toys & experiments ──────────────────────────────────'}
STR = r"""('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")"""


def js_str(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', ' ') + "'"


def split_entries(text):
    head, rest = text.split('  apps: [\n', 1)
    body, tail = rest.rsplit('\n  ],', 1)
    blocks, cur = {}, None
    for line in body.split('\n'):
        m = re.match(r"    \{ id: '([^']+)'", line)
        if m:
            cur = m.group(1)
            blocks[cur] = [line]
        elif line.strip().startswith('//'):
            cur = None
        elif cur is not None:
            blocks[cur].append(line)
    return head, {k: '\n'.join(v).rstrip() for k, v in blocks.items()}, '  ],' + tail


def save(payload):
    text = CATALOG.read_text(encoding='utf8')
    head, blocks, tail = split_entries(text)
    if set(a['id'] for a in payload['apps']) != set(blocks):
        raise ValueError('app list does not match catalog.js')
    shutil.copyfile(CATALOG, BACKUP)
    head = re.sub(r"featured: \[[^\]]*\]",
                  lambda m: 'featured: [' + ', '.join(js_str(i) for i in payload['featured']) + ']', head)
    out = []
    for kind in ('game', 'app', 'toy'):
        group = [a for a in payload['apps'] if a['kind'] == kind]
        if not group:
            continue
        out.append('    ' + HEADS[kind])
        for a in group:
            b = blocks[a['id']]
            b = re.sub(r"name: " + STR, lambda m: 'name: ' + js_str(a['name']), b, 1)
            b = re.sub(r"subtitle: " + STR, lambda m: 'subtitle: ' + js_str(a['subtitle']), b, 1)
            b = re.sub(r"kind: '(?:game|app|toy)'(?:, hidden: true)?",
                       "kind: '%s'%s" % (kind, ', hidden: true' if a.get('hidden') else ''), b, 1)
            out.append(b)
    CATALOG.write_text(head + '  apps: [\n' + '\n'.join(out) + '\n' + tail, encoding='utf8', newline='\n')


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] in ('/__editor', '/__editor/'):
            data = (Path(__file__).parent / 'editor.html').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

    def do_POST(self):
        try:
            if self.path != '/__save':
                raise ValueError('not found')
            save(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
            code, msg = 200, 'saved'
        except Exception as e:
            code, msg = 500, str(e)
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(msg.encode())

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print('Apps editor on http://127.0.0.1:%d/__editor  (Ctrl+C to stop)' % PORT)
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
