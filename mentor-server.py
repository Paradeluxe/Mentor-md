#!/usr/bin/env python3
"""
mentor-server.py - 启动 Mentor HTTP server + 支持 ?open=<path> 加载本地 .mentor

用法:
  python mentor-server.py            # 启动 server on :8765
  python mentor-server.py --port 9000 # 自定义端口
  python mentor-server.py --stop      # 停 server

浏览器 URL:
  http://127.0.0.1:8765/                          # 默认页
  http://127.0.0.1:8765/?open=C:/path/to.mentor   # 自动打开 .mentor
"""
import http.server
import socketserver
import sys
import os
import urllib.parse
import argparse
import cgi
import threading
import webbrowser
import time
import json


HTML_DIR = os.path.dirname(os.path.abspath(__file__))


class MentorHandler(http.server.SimpleHTTPRequestHandler):
    """支持 ?open=<path> 加载本地 .mentor + serve static files."""

    def log_message(self, format, *args):
        # 静默
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        if 'open' in params:
            self.serve_open(params['open'][0])
        else:
            super().do_GET()

    def serve_open(self, mentor_path):
        """serve a local .mentor file as zip, with CORS header."""
        # 安全: 限 .mentor 路径
        mentor_path = os.path.abspath(mentor_path)
        if not os.path.exists(mentor_path):
            self.send_error(404, f'File not found: {mentor_path}')
            return
        if not mentor_path.lower().endswith('.mentor'):
            self.send_error(400, f'Not a .mentor file: {mentor_path}')
            return
        # send as application/zip
        with open(mentor_path, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self.send_header('Content-Type', 'application/zip')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        # 不要 Content-Disposition: attachment, 否则浏览器下载而非 fetch
        self.end_headers()
        self.wfile.write(data)


class OpenHandler(http.server.BaseHTTPRequestHandler):
    """单独的 /open endpoint, 不影响 index.html 路由."""
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        if 'path' not in params:
            self.send_error(400, 'Missing ?path=<file>')
            return
        self.serve_zip(params['path'][0])

    def serve_zip(self, mentor_path):
        mentor_path = os.path.abspath(mentor_path)
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


def is_port_in_use(port):
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


def start_server(port, open_url=None):
    os.chdir(HTML_DIR)

    class Router(http.server.SimpleHTTPRequestHandler):
        """Route /open → OpenHandler, 其它 → SimpleHTTPRequestHandler."""
        def log_message(self, fmt, *args):
            pass

        def do_GET(self):
            if self.path.startswith('/open'):
                # dispatch: parse and serve zip
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

    with socketserver.TCPServer(("", port), Router) as httpd:
        httpd.allow_reuse_address = True
        print(f'Mentor server: http://127.0.0.1:{port}/')
        if open_url:
            print(f'Auto-opening: {open_url}')
            time.sleep(0.5)
            webbrowser.open(open_url)
        else:
            time.sleep(0.5)
            webbrowser.open(f'http://127.0.0.1:{port}/index.html')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('Stopping...')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', type=str, help='Open a .mentor file')
    args = parser.parse_args()
    if is_port_in_use(args.port):
        print(f'Port {args.port} already in use. Opening existing server in browser...')
        url = f'http://127.0.0.1:{args.port}/index.html'
        if args.open:
            url += f'?open={urllib.parse.quote(os.path.abspath(args.open))}'
        webbrowser.open(url)
        return
    start_server(args.port, open_url=f'http://127.0.0.1:{args.port}/index.html?open={urllib.parse.quote(os.path.abspath(args.open))}' if args.open else None)


if __name__ == '__main__':
    main()
