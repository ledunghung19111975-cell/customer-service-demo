#!/usr/bin/env python3
"""Run the local workspace on a stable origin. Standard library only."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from pathlib import Path
import argparse
import threading
import webbrowser

def main():
    parser = argparse.ArgumentParser(description='启动知序客服工作空间')
    parser.add_argument('--port', type=int, default=8768)
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('端口必须在 1024–65535 之间')
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as exc:
        raise SystemExit(f'无法启动：{exc}\n请关闭占用此端口的服务。不会自动切换端口，以免误用另一份浏览器数据。')
    url = f'http://127.0.0.1:{args.port}/'
    print(f'知序客服：{url}\n按 Ctrl+C 停止。只允许本机访问。')
    if not args.no_open:
        threading.Timer(0.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止。')
    finally:
        server.server_close()
if __name__ == '__main__':
    main()
