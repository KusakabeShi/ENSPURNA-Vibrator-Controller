#!/usr/bin/env python3
"""Minimal signalling server using only Python's standard library.

Usage:
    python signalling_server_builtin.py --host 0.0.0.0 --port 8000

Endpoints:
    PUT/GET   /sig/<room_id>/offer
    PUT/DELETE /sig/<room_id>/answer

Offers and answers are kept in memory with a simple dictionary.
"""

from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Tuple

PREFIX = "sig"
TTL_SECONDS = 60 * 60 * 24  # Placeholder if you want to expire entries later

offers: Dict[str, str] = {}
answers: Dict[str, str] = {}


def parse_path(path: str) -> Tuple[str, str, str]:
    parts = [segment for segment in path.split('/') if segment]
    if len(parts) != 3:
        raise ValueError('Invalid path')
    prefix, room_id, resource = parts
    if prefix != PREFIX:
        raise ValueError('Unknown prefix')
    if resource not in {'offer', 'answer'}:
        raise ValueError('Unknown resource')
    return prefix, room_id, resource


def read_body(handler: BaseHTTPRequestHandler) -> str:
    length = int(handler.headers.get('Content-Length', '0'))
    return handler.rfile.read(length).decode('utf-8') if length else ''


class SignallingHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status: int, headers: Dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()

    def _handle(self, method: str) -> None:
        try:
            _, room_id, resource = parse_path(self.path)
        except ValueError as exc:
            self._set_headers(HTTPStatus.NOT_FOUND)
            self.wfile.write(str(exc).encode('utf-8'))
            return

        key = f"{resource}:{room_id}"

        if resource == 'offer':
            store = offers
        else:
            store = answers

        if method == 'PUT':
            body = read_body(self)
            if not body:
                self._set_headers(HTTPStatus.BAD_REQUEST)
                self.wfile.write(b'Empty body')
                return
            store[key] = body
            self._set_headers(HTTPStatus.NO_CONTENT)
            return

        if method == 'GET' and resource == 'offer':
            value = store.get(key)
            if value is None:
                self._set_headers(HTTPStatus.NOT_FOUND)
                self.wfile.write(b'Not found')
                return
            self._set_headers(HTTPStatus.OK, {'Content-Type': 'application/json'})
            self.wfile.write(value.encode('utf-8'))
            return

        if method == 'DELETE' and resource == 'answer':
            value = store.pop(key, None)
            if value is None:
                self._set_headers(HTTPStatus.NO_CONTENT)
                return
            self._set_headers(HTTPStatus.OK, {'Content-Type': 'application/json'})
            self.wfile.write(value.encode('utf-8'))
            return

        self._set_headers(HTTPStatus.METHOD_NOT_ALLOWED, {'Allow': 'GET, PUT' if resource == 'offer' else 'PUT, DELETE'})

    def _health(self) -> None:
        try:
            parts = [segment for segment in self.path.split('/') if segment]
            if len(parts) == 1 and parts[0] == 'health':
                self._set_headers(HTTPStatus.OK, {'Content-Type': 'application/json'})
                self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
                return
            if len(parts) == 2 and parts[0] == PREFIX and parts[1] == 'health':
                self._set_headers(HTTPStatus.OK, {'Content-Type': 'application/json'})
                self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
                return
            if len(parts) == 3 and parts[0] == PREFIX and parts[2] == 'health':
                self._set_headers(HTTPStatus.OK, {'Content-Type': 'application/json'})
                self.wfile.write(json.dumps({'status': 'ok', 'room': parts[1]}).encode('utf-8'))
                return
        except Exception as exc:  # noqa: B902
            self._set_headers(HTTPStatus.BAD_REQUEST)
            self.wfile.write(str(exc).encode('utf-8'))
            return
        self._set_headers(HTTPStatus.NOT_FOUND)

    def do_PUT(self) -> None:  # noqa: N802 (base class API)
        self._handle('PUT')

    def do_GET(self) -> None:  # noqa: N802
        if self.path.endswith('/health'):
            self._health()
        else:
            self._handle('GET')

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle('DELETE')

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        # Reduce noise in console
        print(json.dumps({
            'client': self.client_address[0],
            'method': self.command,
            'path': self.path,
            'message': format % args,
        }))


def main() -> None:
    parser = argparse.ArgumentParser(description='Simple signalling server (built-in libs only).')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=8000, type=int)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), SignallingHandler)
    print(f'Starting signalling server on http://{args.host}:{args.port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down signalling server...')
        server.shutdown()


if __name__ == '__main__':
    main()
