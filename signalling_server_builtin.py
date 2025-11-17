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
from urllib.parse import urlparse

PREFIX = "sig"
TTL_SECONDS = 60 * 60 * 24  # Placeholder if you want to expire entries later

offers: Dict[str, str] = {}
answers: Dict[str, str] = {}


def _path_segments(raw_path: str) -> list[str]:
    parsed = urlparse(raw_path)
    return [segment for segment in parsed.path.split('/') if segment]


def parse_path(path: str) -> Tuple[str, str, str]:
    parts = _path_segments(path)
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
    CORS_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    }

    def _set_headers(
        self,
        status: int,
        *,
        content_type: str = 'text/plain; charset=utf-8',
        headers: Dict[str, str] | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        for key, value in self.CORS_HEADERS.items():
            self.send_header(key, value)
        if headers:
            for key, value in headers.items():
                self.send_header(key, value)
        self.end_headers()

    def _write_detail(
        self,
        status: HTTPStatus,
        message: str,
        *,
        headers: Dict[str, str] | None = None,
    ) -> None:
        self._set_headers(status, content_type='application/json; charset=utf-8', headers=headers)
        self.wfile.write(json.dumps({'detail': message}).encode('utf-8'))

    def _handle(self, method: str) -> None:
        try:
            _, room_id, resource = parse_path(self.path)
        except ValueError as exc:
            self._write_detail(HTTPStatus.NOT_FOUND, str(exc))
            return

        key = f"{resource}:{room_id}"

        if resource == 'offer':
            store = offers
        else:
            store = answers

        if method == 'PUT':
            body = read_body(self)
            if not body:
                message = 'Offer body is empty' if resource == 'offer' else 'Answer body is empty'
                self._write_detail(HTTPStatus.BAD_REQUEST, message)
                return
            store[key] = body
            self._set_headers(HTTPStatus.NO_CONTENT)
            return

        if method == 'GET' and resource == 'offer':
            value = store.get(key)
            if value is None:
                self._write_detail(HTTPStatus.NOT_FOUND, 'Offer not found')
                return
            self._set_headers(HTTPStatus.OK)
            self.wfile.write(value.encode('utf-8'))
            return

        if method == 'DELETE' and resource == 'answer':
            value = store.pop(key, None)
            if value is None:
                self._set_headers(HTTPStatus.NO_CONTENT)
                return
            self._set_headers(HTTPStatus.OK)
            self.wfile.write(value.encode('utf-8'))
            return

        allow = 'GET, PUT' if resource == 'offer' else 'PUT, DELETE'
        self._write_detail(
            HTTPStatus.METHOD_NOT_ALLOWED,
            'Method not allowed',
            headers={'Allow': allow},
        )

    def _health(self) -> None:
        try:
            parts = _path_segments(self.path)
            if len(parts) == 1 and parts[0] == 'health':
                self._set_headers(HTTPStatus.OK, content_type='application/json; charset=utf-8')
                self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
                return
            if len(parts) == 2 and parts[0] == PREFIX and parts[1] == 'health':
                self._set_headers(HTTPStatus.OK, content_type='application/json; charset=utf-8')
                self.wfile.write(json.dumps({'status': 'ok'}).encode('utf-8'))
                return
            if len(parts) == 3 and parts[0] == PREFIX and parts[2] == 'health':
                self._set_headers(HTTPStatus.OK, content_type='application/json; charset=utf-8')
                self.wfile.write(json.dumps({'status': 'ok', 'room': parts[1]}).encode('utf-8'))
                return
        except Exception as exc:  # noqa: B902
            self._write_detail(HTTPStatus.BAD_REQUEST, str(exc))
            return
        self._write_detail(HTTPStatus.NOT_FOUND, 'Not found')

    def do_PUT(self) -> None:  # noqa: N802 (base class API)
        self._handle('PUT')

    def do_GET(self) -> None:  # noqa: N802
        if self.path.endswith('/health'):
            self._health()
        else:
            self._handle('GET')

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle('DELETE')

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._set_headers(HTTPStatus.NO_CONTENT)

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
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', default=5174, type=int)
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
