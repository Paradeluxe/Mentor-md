#!/usr/bin/env python3
"""
mentor-server.py - Mentor static server + /open?path= for local .mentor files

Default port: 8787 (see PORT file; avoids clash with tools on 8765)

Usage:
  python mentor-server.py
  python mentor-server.py --port 9000
  python mentor-server.py --open C:/path/to/file.mentor
"""
import http.server
import socketserver
import sys
import os
import urllib.parse
import argparse
import webbrowser
import time
import socket


HTML_DIR = os.path.dirname(os.path.abspath(__file__))


def default_port():
    port_file = os.path.join(HTML_DIR, 'PORT')
    if os.path.isfile(port_file):
        try:
            with open(port_file, 'r', encoding='utf-8') as f:
                return int(f.read().strip() or '8787')
        except Exception:
            pass
    return 8787


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0


def is_mentor_on_port(port):
    """Return True if something on port looks like Mentor index.html."""
    try:
        import urllib.request
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html', timeout=2) as r:
            body = r.read(4000).decode('utf-8', errors='ignore')
            return 'Mentor' in body and 'psyclaw' not in body.lower()
    except Exception:
        return False


def start_server(port, open_url=None):
    os.chdir(HTML_DIR)

    class Router(http.server.SimpleHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def do_GET(self):
            if self.path.startswith('/open'):
                parsed = urllib.parse.urlparse(self.path)
                params = urllib.parse.parse_qs(parsed.query)
                if 'path' not in params:
                    self.send_error(400, 'Missing ?path=<file>')
                    return
                mentor_path = os.path.abspath(params['path'][0])
                if not os.path.exists(mentor_path):
                    self.send_error(404, f'File not found: {mentor_path}')
                    return
                if not mentor_path.lower().endswith('.mentor'):
                    self.send_error(400, f'Not a .mentor file: {mentor_path}')
                    return
                with open(mentor_path, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/zip')
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
            else:
                super().do_GET()

    # allow_reuse so quick restart works
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', port), Router) as httpd:
        print(f'Mentor server: http://127.0.0.1:{port}/index.html')
        time.sleep(0.3)
        try:
            webbrowser.open(open_url or f'http://127.0.0.1:{port}/index.html')
        except Exception as e:
            print('webbrowser.open failed:', e)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('Stopping...')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=None)
    parser.add_argument('--open', type=str, help='Open a .mentor file')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    port = args.port if args.port is not None else default_port()

    open_url = f'http://127.0.0.1:{port}/index.html'
    if args.open:
        open_url += f'?open={urllib.parse.quote(os.path.abspath(args.open))}'

    if is_port_in_use(port):
        if is_mentor_on_port(port):
            print(f'Port {port} already running Mentor. Opening browser...')
            if not args.no_browser:
                webbrowser.open(open_url)
            return
        print(f'ERROR: Port {port} is in use by another application (not Mentor).')
        print(f'Change the number in {os.path.join(HTML_DIR, "PORT")} or free the port.')
        sys.exit(2)

    if args.no_browser:
        # start without auto-open: reuse start_server with open_url=None
        os.chdir(HTML_DIR)

        class Router(http.server.SimpleHTTPRequestHandler):
            def log_message(self, fmt, *args):
                pass

            def do_GET(self):
                if self.path.startswith('/open'):
                    parsed = urllib.parse.urlparse(self.path)
                    params = urllib.parse.parse_qs(parsed.query)
                    if 'path' not in params:
                        self.send_error(400, 'Missing ?path=<file>')
                        return
                    mentor_path = os.path.abspath(params['path'][0])
                    if not os.path.exists(mentor_path):
                        self.send_error(404, f'File not found: {mentor_path}')
                        return
                    if not mentor_path.lower().endswith('.mentor'):
                        self.send_error(400, f'Not a .mentor file: {mentor_path}')
                        return
                    with open(mentor_path, 'rb') as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/zip')
                    self.send_header('Content-Length', str(len(data)))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)
                else:
                    super().do_GET()

        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(('127.0.0.1', port), Router) as httpd:
            print(f'Mentor server (no-browser): http://127.0.0.1:{port}/index.html')
            httpd.serve_forever()
        return

    start_server(port, open_url=open_url)


if __name__ == '__main__':
    main()
