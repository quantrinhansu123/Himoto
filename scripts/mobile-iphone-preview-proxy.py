"""Private-LAN facade for a separate loopback synthetic QA server; no control routes."""
import argparse
import http.client
import ipaddress
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


def serve(bind, port, target):
    address = ipaddress.ip_address(bind)
    if address.version != 4 or address.is_loopback or not (address in ipaddress.ip_network('10.0.0.0/8') or address in ipaddress.ip_network('172.16.0.0/12') or address in ipaddress.ip_network('192.168.0.0/16')):
        raise ValueError('Bind to one explicit private LAN IPv4 address')
    if not 8100 <= port <= 8199 or not 8100 <= target <= 8199 or port == target:
        raise ValueError('Use separate synthetic QA ports')
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'
        def log_message(self, *_args):
            pass
        def json(self, status, value):
            payload = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(payload)
        def handle_request(self):
            route = urlsplit(self.path)
            if self.command == 'GET' and route.path == '/health':
                return self.json(200, {'fixtureOnly': True, 'previewOnly': True})
            if route.scheme or route.netloc or not route.path.startswith('/api/mobile/v1/') or self.headers.get('Origin') or self.headers.get('Transfer-Encoding'):
                return self.json(403, {'message': 'Chỉ dành cho app thử QA, không mở điều khiển fixture.', 'code': 'FIXTURE_ONLY'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 <= size <= 3 * 1024 * 1024 + 16384:
                    return self.json(413, {'message': 'Tệp vượt giới hạn fixture thử.'})
                body = self.rfile.read(size) if size else None
                headers = {name: value for name, value in self.headers.items() if name.lower() not in ['host', 'connection', 'proxy-connection', 'transfer-encoding', 'upgrade', 'expect']}
                upstream = http.client.HTTPConnection('127.0.0.1', target, timeout=60)
                try:
                    upstream.request(self.command, self.path, body=body, headers=headers)
                    response = upstream.getresponse()
                    payload = response.read()
                    self.send_response(response.status)
                    for name, value in response.getheaders():
                        if name.lower() not in ['connection', 'transfer-encoding', 'content-length', 'server', 'date']:
                            self.send_header(name, value)
                    self.send_header('Content-Length', str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                finally:
                    upstream.close()
            except ValueError:
                self.json(400, {'message': 'Yêu cầu QA chưa hợp lệ.'})
            except (OSError, http.client.HTTPException):
                self.json(503, {'message': 'Chưa kết nối được checkpoint thử riêng.', 'code': 'SERVICE_UNAVAILABLE'})
        do_GET = handle_request
        do_POST = handle_request
        do_PATCH = handle_request
        do_PUT = handle_request
        do_DELETE = handle_request
    server = ThreadingHTTPServer((bind, port), Handler)
    print(f'iPhone synthetic preview on http://{bind}:{port}; separate checkpoint; controls blocked.', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bind', required=True)
    parser.add_argument('--port', type=int, default=8133)
    parser.add_argument('--target-port', type=int, default=8134)
    args = parser.parse_args()
    serve(args.bind, args.port, args.target_port)
