"""
YouTube to MP3 — Flask Backend
Run: pip install flask yt-dlp
Requires: ffmpeg in PATH
"""

import os
import re
import shutil
import socket
import tempfile
import subprocess
import threading
import logging
import io
import zipfile
from typing import Any, Dict, Optional, cast
from pathlib import Path
from flask import Flask, request, jsonify, send_file, Response
import urllib.request

from yt_dlp import YoutubeDL

# ─────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────
DEFAULT_OUTPUT_DIR = Path(tempfile.gettempdir()) / "ytmp3_downloads"
DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

YOUTUBE_REGEX = re.compile(
    r'(https?://)?(www\.|m\.|music\.)?youtube\.com/'
    r'(watch\?v=|embed/|v/|shorts/|live/|playlist\?list=)'
    r'([a-zA-Z0-9_-]+)', re.IGNORECASE
)
YOUTU_BE_REGEX = re.compile(
    r'(https?://)?youtu\.be/([a-zA-Z0-9_-]+)', re.IGNORECASE
)


def clean_youtube_url(url: str) -> str:
    """Remove tracking params (si=, utm_*, etc.) that confuse yt-dlp."""
    import urllib.parse
    url = url.strip()
    try:
        p = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(p.query, keep_blank_values=True)
        # Keep only essential params
        allowed = {'v', 'list', 'index', 't', 'start'}
        qs_clean = {k: v for k, v in qs.items() if k in allowed}
        clean_query = urllib.parse.urlencode(qs_clean, doseq=True)
        return urllib.parse.urlunparse(p._replace(query=clean_query))
    except Exception:
        return url


def is_valid_youtube_url(url: str) -> bool:
    url = url.strip()
    return bool(YOUTUBE_REGEX.match(url) or YOUTU_BE_REGEX.match(url))


def is_playlist_url(url: str) -> bool:
    return "list=" in url and "watch?v=" not in url


def resolve_ffmpeg_path() -> str:
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg
    binary_name = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), binary_name)


FFMPEG_CMD = resolve_ffmpeg_path()


def check_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None or os.path.exists(FFMPEG_CMD)


def check_internet(timeout=3) -> bool:
    try:
        socket.setdefaulttimeout(timeout)
        socket.create_connection(("8.8.8.8", 53))
        return True
    except OSError:
        return False


# ─────────────────────────────────────────
# DOWNLOAD STATE
# ─────────────────────────────────────────
download_state: Dict[str, Any] = {
    "active": False,
    "stop": False,
    "progress": 0.0,
    "status": "Ready",
    "skipped": 0,
    "current_index": 1,
    "total_tracks": 1,
    "finished": False,
    "error": None,
    "last_file": None,
    "last_zip": None,
    "is_playlist": False,
}
download_lock = threading.Lock()

output_dir = str(DEFAULT_OUTPUT_DIR)

# ─────────────────────────────────────────
# FLASK APP
# ─────────────────────────────────────────
SITE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=SITE_DIR, static_url_path="")
logging.basicConfig(level=logging.ERROR)


@app.route("/")
def index():
    return send_file(os.path.join(SITE_DIR, "index.html"))

@app.route("/debug")
def debug():
    import shutil
    import os

    return {
        "ffmpeg": shutil.which("ffmpeg"),
        "platform": os.name
    }

@app.route("/<path:page>")
def pages(page):
    filepath = os.path.join(SITE_DIR, page)
    if os.path.exists(filepath):
        return send_file(filepath)
    return "Not found", 404


@app.route("/api/check")
def api_check():
    return jsonify({
        "ffmpeg": check_ffmpeg(),
        "internet": check_internet(),
        "output_dir": output_dir,
    })


@app.route("/api/validate")
def api_validate():
    url = request.args.get("url", "").strip()
    return jsonify({
        "valid": is_valid_youtube_url(url),
        "playlist": is_playlist_url(url),
    })


@app.route("/api/thumbnail")
def api_thumbnail():
    """Proxy YouTube thumbnail images to avoid mixed-content / CORS issues."""
    url = request.args.get("url", "").strip()
    if not url or not url.startswith("http"):
        return jsonify({"error": "Invalid URL"}), 400
    # Try the requested URL, then fall back to hqdefault pattern
    import re as _re
    vid_match = _re.search(r'/vi(?:_webp)?/([a-zA-Z0-9_-]{11})/', url)
    fallback_url = f"https://i.ytimg.com/vi/{vid_match.group(1)}/hqdefault.jpg" if vid_match else None
    for attempt_url in filter(None, [url, fallback_url]):
        try:
            req = urllib.request.Request(
                attempt_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = resp.read()
                content_type = resp.headers.get("Content-Type", "image/jpeg")
            r = Response(data, content_type=content_type)
            r.headers["Cache-Control"] = "public, max-age=3600"
            r.headers["Access-Control-Allow-Origin"] = "*"
            return r
        except Exception:
            continue
    return jsonify({"error": "Thumbnail unavailable"}), 502


@app.route("/api/meta")
def api_meta():
    url = clean_youtube_url(request.args.get("url", "").strip())
    if not url or not is_valid_youtube_url(url):
        return jsonify({"error": "Invalid URL"}), 400
    try:
        opts: Dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "ignoreerrors": True,
            "noplaylist": False,
            "extract_flat": "in_playlist",
            "socket_timeout": 15,
            "cookiefile": os.path.join(SITE_DIR, "cookies.txt"),
        }
        with YoutubeDL(opts) as ydl:  # type: ignore[arg-type]
            info = ydl.extract_info(url, download=False)
        if not info:
            return jsonify({"error": "Could not fetch metadata"}), 400
        info_data: Dict[str, Any] = cast(Dict[str, Any], info)
        if "entries" in info_data:
            entries = [e for e in (info_data.get("entries") or []) if e]
            return jsonify({
                "title": info_data.get("title") or "Playlist",
                "channel": info_data.get("uploader") or info_data.get("channel"),
                "thumbnail": info_data.get("thumbnails", [{}])[-1].get("url") if info_data.get("thumbnails") else None,
                "track_count": len(entries),
                "is_playlist": True,
            })
        return jsonify({
            "title": info_data.get("title"),
            "channel": info_data.get("uploader") or info_data.get("channel"),
            "thumbnail": info_data.get("thumbnail"),
            "duration": info_data.get("duration"),
            "view_count": info_data.get("view_count"),
            "is_playlist": False,
        })
    except Exception as e:
        import traceback
        print("META ERROR:", traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/api/set_output_dir", methods=["POST"])
def api_set_output_dir():
    global output_dir
    data = request.get_json() or {}
    path = data.get("path", "").strip()
    if not path:
        return jsonify({"error": "No path provided."}), 400
    resolved = os.path.expanduser(path)
    try:
        os.makedirs(resolved, exist_ok=True)
    except Exception as e:
        return jsonify({"error": f"Cannot create directory: {e}"}), 400
    if not os.path.isdir(resolved):
        return jsonify({"error": "Path is not a directory."}), 400
    output_dir = resolved
    return jsonify({"ok": True, "output_dir": output_dir})


# ─────────────────────────────────────────
# DOWNLOAD WORKER
# ─────────────────────────────────────────
def _make_opts(out_dir: str, noplaylist: bool = True, outtmpl: Optional[str] = None) -> Dict[str, Any]:
    if outtmpl is None:
        outtmpl = os.path.join(out_dir, "%(title)s.%(ext)s")
    state = download_state

    class YtdlpLogger:
        def debug(self, msg): pass
        def warning(self, msg): pass
        def error(self, msg):
            if any(x in msg for x in ["Video unavailable", "not available", "Private video"]):
                with download_lock:
                    state["skipped"] += 1

    def hook(d):
        if state["stop"]:
            raise Exception("Download cancelled by user.")
        filename = d.get("filename", "")
        status = d.get("status")
        if status == "downloading":
            downloaded = d.get("downloaded_bytes", 0) or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            pct = (downloaded / total * 100) if total else 0.0
            overall = (((state["current_index"] - 1) + (pct / 100.0)) / state["total_tracks"]) * 100.0
            short = os.path.basename(filename)[:25]
            with download_lock:
                state["progress"] = overall
                state["status"] = (
                    f"[{state['current_index']}/{state['total_tracks']}] "
                    f"Downloading: {pct:.1f}% — {short}"
                )
        elif status == "finished":
            if filename:
                mp3 = os.path.splitext(os.path.abspath(filename))[0] + ".mp3"
                with download_lock:
                    state["last_file"] = mp3
            overall = (state["current_index"] / state["total_tracks"]) * 100.0
            with download_lock:
                state["progress"] = overall
                state["status"] = f"[{state['current_index']}/{state['total_tracks']}] Converting..."

    return {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "cookiefile": os.path.join(SITE_DIR, "cookies.txt"),
        "noplaylist": noplaylist,
        "quiet": True,
        "no_warnings": True,
        "logger": YtdlpLogger(),
        "progress_hooks": [hook],
        "ffmpeg_location": FFMPEG_CMD,
        "writethumbnail": True,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "0"},
            {"key": "EmbedThumbnail"},
        ],
        "keepvideo": False,
        "retries": 3,
        "continuedl": True,
        "ignoreerrors": True,
    }


def cleanup_partials(out_dir: str, stop: bool = True):
    try:
        if stop and os.path.isdir(out_dir):
            for f in os.listdir(out_dir):
                if f.endswith((".part", ".ytdl", ".temp", ".tmp", ".webp", ".jpg", ".jpeg", ".png")):
                    try:
                        os.remove(os.path.join(out_dir, f))
                    except Exception:
                        pass
    except Exception:
        pass


def _download_worker(url: str, out_dir: str):
    state = download_state
    try:
        opts_meta: Dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "ignoreerrors": True,
            "noplaylist": False,
            "extract_flat": "in_playlist",
            "cookiefile": os.path.join(SITE_DIR, "cookies.txt"),
        }
        with download_lock:
            state["status"] = "Extracting metadata..."
        with YoutubeDL(opts_meta) as ydl:  # type: ignore[arg-type]
            info = ydl.extract_info(url, download=False)

        if state["stop"]:
            with download_lock:
                state["status"] = "Cancelled"
                state["finished"] = True
            return

        if not info:
            raise Exception("Failed to extract video information.")

        info_data: Dict[str, Any] = cast(Dict[str, Any], info)

        if "entries" in info_data:
            raw_entries = info_data.get("entries") or []
            entries = [e for e in raw_entries if e is not None]

            # Create a subfolder named after the playlist
            playlist_title = info_data.get("title") or "Playlist"
            safe_name = re.sub(r'[\\/:*?"<>|]', "_", playlist_title).strip(". ")[:80] or "Playlist"
            playlist_dir = os.path.join(out_dir, safe_name)
            os.makedirs(playlist_dir, exist_ok=True)

            with download_lock:
                state["total_tracks"] = len(entries)
                state["is_playlist"] = True
                state["status"] = f'Found playlist "{safe_name}" with {len(entries)} tracks. Starting...'

            for idx, entry in enumerate(entries, 1):
                if state["stop"]:
                    break
                with download_lock:
                    state["current_index"] = idx
                video_id = entry.get("id") or entry.get("url")
                track_url = entry.get("webpage_url") or (
                    f"https://www.youtube.com/watch?v={video_id}" if video_id else None
                )
                if not track_url:
                    continue
                title = re.sub(r'[\\/:*?"<>|]', "_", entry.get("title") or f"Track_{idx}")
                with download_lock:
                    state["status"] = f"[{idx}/{state['total_tracks']}] Processing: {title[:30]}..."
                    state["last_file"] = None
                track_outtmpl = os.path.join(playlist_dir, "%(title)s.%(ext)s")
                with YoutubeDL(_make_opts(playlist_dir, noplaylist=True, outtmpl=track_outtmpl)) as ydl:  # type: ignore[arg-type]
                    ydl.download([track_url])

            if not state["stop"]:
                # Clean up leftover thumbnail/temp files from the playlist folder
                cleanup_partials(playlist_dir, stop=True)
                with download_lock:
                    state["last_file"] = playlist_dir
        else:
            with download_lock:
                state["total_tracks"] = 1
                state["current_index"] = 1
                state["status"] = "Starting download..."
                state["last_file"] = None
            with YoutubeDL(_make_opts(out_dir)) as ydl:  # type: ignore[arg-type]
                ydl.download([url])

        if not state["stop"]:
            skipped = state["skipped"]
            total = state["total_tracks"]
            msg = "Done" if skipped == 0 else f"Done — {total - skipped} downloaded, {skipped} skipped"
            with download_lock:
                state["progress"] = 100.0
                state["status"] = msg
                state["finished"] = True

    except Exception as e:
        if state["stop"] or "cancelled" in str(e).lower():
            with download_lock:
                state["status"] = "Cancelled"
                state["finished"] = True
        else:
            with download_lock:
                state["error"] = str(e)
                state["status"] = "Error"
                state["finished"] = True
    finally:
        cleanup_partials(out_dir, state["stop"])
        with download_lock:
            state["active"] = False


@app.route("/api/download", methods=["POST"])
def api_download():
    if not check_ffmpeg():
        return jsonify({"error": "FFmpeg not found."}), 400
    if not check_internet():
        return jsonify({"error": "No internet connection."}), 400

    data = request.get_json() or {}
    url = data.get("url", "").strip()

    url = clean_youtube_url(url)
    if not url or not is_valid_youtube_url(url):
        return jsonify({"error": "Invalid YouTube URL."}), 400

    if download_state["active"]:
        return jsonify({"error": "A download is already in progress."}), 409

    out = output_dir

    with download_lock:
        download_state.update({
            "active": True, "stop": False, "progress": 0.0,
            "status": "Queued", "skipped": 0, "current_index": 1,
            "total_tracks": 1, "finished": False, "error": None,
            "last_file": None, "last_zip": None, "is_playlist": False,
        })

    t = threading.Thread(target=_download_worker, args=(url, out), daemon=True)
    t.start()

    return jsonify({"ok": True})

@app.route("/api/download/file")
def api_download_file():
    last_file = download_state.get("last_file")
    
    if not last_file or not os.path.exists(last_file):
        return jsonify({"error": "No file or playlist found to download."}), 404

    # 1. HANDLE PLAYLISTS (Directory)
    if os.path.isdir(last_file):
        folder = last_file
        folder_name = os.path.basename(folder)
        # Gather all MP3s
        mp3_files = sorted([f for f in os.listdir(folder) if f.lower().endswith(".mp3")])
        
        if not mp3_files:
            return jsonify({"error": "Playlist folder is empty."}), 404

        # Create the ZIP
        tmp_zip = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        zip_path = tmp_zip.name
        tmp_zip.close() 

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in mp3_files:
                fpath = os.path.join(folder, fname)
                zf.write(fpath, arcname=os.path.join(folder_name, fname))
        
        response = send_file(
            zip_path,
            as_attachment=True,
            download_name=f"{folder_name}.zip",
            mimetype="application/zip",
        )
        @response.call_on_close
        def cleanup_zip():
            if os.path.exists(zip_path):
                os.remove(zip_path)
        return response

    # 2. HANDLE SINGLE TRACKS (File)
    elif os.path.isfile(last_file):
        # Serve the raw MP3 directly
        return send_file(last_file, as_attachment=True)

    return jsonify({"error": "Unknown file state."}), 500

@app.route("/api/download/status")
def api_download_status():
    with download_lock:
        return jsonify(dict(download_state))


@app.route("/api/download/cancel", methods=["POST"])
def api_download_cancel():
    with download_lock:
        download_state["stop"] = True
    return jsonify({"ok": True})