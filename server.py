#!/usr/bin/env python3
"""
Servidor local para o projeto romântico.
- Serve os arquivos estáticos
- /search?q=QUERY     → busca no YouTube via yt-dlp
- /audio?id=VIDEO_ID  → proxy de áudio sem anúncio (yt-dlp extrai URL + headers)
"""

import json
import sys
import time
import threading
import urllib.parse
import urllib.request
import yt_dlp
from http.server import HTTPServer, SimpleHTTPRequestHandler

# ── Cache de info de stream ──────────────────────────────────────────
_cache      = {}   # video_id → (url, headers, expires_at)
_cache_lock = threading.Lock()
CACHE_TTL   = 60 * 30   # 30 minutos

def get_audio_info(video_id):
    """Retorna (url, http_headers) para o melhor formato de áudio streamável."""
    now = time.time()
    with _cache_lock:
        if video_id in _cache:
            url, hdrs, exp = _cache[video_id]
            if now < exp:
                return url, hdrs

    # Preferimos webm/opus que é streamável via pipe; fallback para qualquer áudio
    opts = {
        'quiet':         True,
        'no_warnings':   True,
        'skip_download': True,
        'format':        'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(
            f'https://www.youtube.com/watch?v={video_id}', download=False
        )

    url  = None
    hdrs = {}

    # info pode ser um dict com 'url' direto ou ter lista 'formats'
    if info.get('url'):
        url  = info['url']
        hdrs = info.get('http_headers', {})
    else:
        for fmt in reversed(info.get('formats', [])):
            if fmt.get('url') and fmt.get('acodec', 'none') != 'none':
                url  = fmt['url']
                hdrs = fmt.get('http_headers', {})
                break

    if not url:
        raise RuntimeError('Nenhuma URL de áudio encontrada')

    with _cache_lock:
        _cache[video_id] = (url, hdrs, now + CACHE_TTL)

    return url, hdrs


class Handler(SimpleHTTPRequestHandler):

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # ── Busca ─────────────────────────────────────────────────
        if parsed.path == '/search':
            params = urllib.parse.parse_qs(parsed.query)
            query  = params.get('q', [''])[0].strip()
            if not query:
                self._json(400, {'error': 'query vazia'})
                return
            try:
                opts = {
                    'quiet': True, 'no_warnings': True,
                    'extract_flat': True, 'skip_download': True,
                }
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(f'ytsearch5:{query}', download=False)
                videos = []
                for entry in (info.get('entries') or []):
                    if not entry: continue
                    vid_id = entry.get('id', '')
                    thumb  = entry.get('thumbnail') or \
                             f'https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg'
                    videos.append({
                        'videoId':   vid_id,
                        'title':     entry.get('title', ''),
                        'thumbnail': thumb,
                        'author':    entry.get('uploader') or entry.get('channel', ''),
                    })
                self._json(200, videos)
            except Exception as e:
                self._json(500, {'error': str(e)})
            return

        # ── Proxy de áudio sem anúncio ─────────────────────────────
        if parsed.path == '/audio':
            params   = urllib.parse.parse_qs(parsed.query)
            video_id = params.get('id', [''])[0].strip()
            if not video_id:
                self._json(400, {'error': 'id vazio'})
                return
            try:
                stream_url, yt_headers = get_audio_info(video_id)

                # Usa os mesmos headers que o yt-dlp usaria
                req = urllib.request.Request(stream_url, headers=yt_headers)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    ct = resp.headers.get('Content-Type', 'audio/webm')
                    cl = resp.headers.get('Content-Length', '')

                    self.send_response(200)
                    self.send_header('Content-Type', ct)
                    if cl:
                        self.send_header('Content-Length', cl)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()

                    try:
                        while True:
                            chunk = resp.read(65536)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                    except (BrokenPipeError, ConnectionResetError):
                        pass  # cliente fechou — normal

            except Exception as e:
                # Tenta servir sem cache se deu erro (URL expirada)
                with _cache_lock:
                    _cache.pop(video_id, None)
                self._json(500, {'error': str(e)})
            return

        # ── Arquivos estáticos ─────────────────────────────────────
        super().do_GET()

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type',   'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # silencia logs

if __name__ == '__main__':
    import os
    os.chdir('/Users/joaopedro/Documents/black/romantico')
    server = HTTPServer(('localhost', 8181), Handler)
    print('✅ Servidor rodando em http://localhost:8181')
    server.serve_forever()
