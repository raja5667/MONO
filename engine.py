"""
engine.py — Entry point for YouTube to MP3 server
Run: python engine.py
"""

from server import app, check_ffmpeg, FFMPEG_CMD, output_dir

if __name__ == "__main__":
    print("YouTube to MP3 server starting on http://localhost:5000")
    print(f"FFmpeg: {FFMPEG_CMD} ({'found' if check_ffmpeg() else 'MISSING'})")
    print(f"Output dir: {output_dir}")
    app.run(host="0.0.0.0", port=5000, debug=False)