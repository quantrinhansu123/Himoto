"""Local synthetic API for the isolated Android emulator. Business writes are denied."""
import argparse
import importlib.util
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

def run(workflow, catalogue, output, port):
    data = json.loads(workflow.read_text(encoding='utf-8'))
    columns = json.loads(catalogue.read_text(encoding='utf-8'))
    assert data['fixtureOnly'] and columns['fixtureOnly'] and output.resolve().is_relative_to(Path('.backups').resolve())
    spec = importlib.util.spec_from_file_location('parity_ui', Path(__file__).with_name('check-mobile-web-parity-ui.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    fixture = module.Fixture(data, columns)
    output.mkdir(parents=True, exist_ok=False)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args): pass
        def dispatch(self):
            if self.path == '/health': status, result = 200, dict(fixtureOnly=True)
            elif self.path == '/requests': status, result = 200, fixture.requests
            elif self.command != 'GET' and not (self.command == 'POST' and self.path == '/api/mobile/v1/session'):
                fixture.requests.append(dict(method=self.command, path=self.path.removeprefix('/api/mobile/v1'), params={}, denied=True))
                status, result = 403, dict(code='FIXTURE_WRITE_DENIED', message='Native QA only allows login and reads.')
            else:
                try:
                    raw = self.rfile.read(min(65536, int(self.headers.get('Content-Length', 0))))
                    status, result = fixture.respond(self.command, self.path, json.loads(raw) if raw else None)
                except Exception as error: status, result = 503, dict(code='FIXTURE_UNAVAILABLE', message=str(error))
            body = json.dumps(result).encode('utf-8')
            self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body)
            (output / 'requests.json').write_text(json.dumps(fixture.requests, ensure_ascii=False, indent=2), encoding='utf-8')
        do_GET = dispatch
        do_POST = dispatch
        do_PUT = dispatch
        do_PATCH = dispatch
        do_DELETE = dispatch
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(json.dumps(dict(ready=True, fixtureOnly=True, port=port)), flush=True)
    server.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for flag in ['workflow', 'catalogue', 'output']: parser.add_argument('--' + flag, required=True, type=Path)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args(); run(args.workflow, args.catalogue, args.output, args.port)
