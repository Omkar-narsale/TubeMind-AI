import re
import logging
from typing import Tuple, List, Optional
import yt_dlp

from app.playlist.models import PlaylistVideoItem

logger = logging.getLogger("app.playlist.extractor")


def extract_playlist_id(url_or_id: str) -> Optional[str]:
    """Extracts playlist ID from string (e.g. PL..., or URL containing list=...)."""
    if not url_or_id:
        return None
    cleaned = url_or_id.strip()

    pid = None
    match = re.search(r"[?&]list=([A-Za-z0-9_-]+)", cleaned)
    if match:
        pid = match.group(1)
    elif re.match(r"^[A-Za-z0-9_-]{10,64}$", cleaned):
        pid = cleaned

    # Filter out auto-generated YouTube Mix / Radio playlists (RD..., UL..., TL...) which cannot be fetched as playlists
    if pid and pid.startswith(("RD", "UL", "TL")):
        return None

    return pid


def fetch_playlist_metadata(
    playlist_id_or_url: str,
    max_items: int = 25
) -> Tuple[str, str, List[PlaylistVideoItem]]:
    """
    Extracts flat playlist info using yt-dlp without downloading any video audio/video files.
    Returns:
        (playlist_id, playlist_title, list_of_videos)
    """
    pid = extract_playlist_id(playlist_id_or_url)
    if not pid:
        raise ValueError("Invalid YouTube playlist URL or ID provided.")

    playlist_url = f"https://www.youtube.com/playlist?list={pid}"

    ydl_opts = {
        "extract_flat": "in_playlist",
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "playlist_items": f"1-{max_items}",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            data = ydl.extract_info(playlist_url, download=False)
            
            title = data.get("title") or f"Playlist {pid}"
            entries = data.get("entries") or []

            videos: List[PlaylistVideoItem] = []
            for i, entry in enumerate(entries):
                if not entry:
                    continue
                vid = entry.get("id")
                vtitle = entry.get("title") or f"Video {i+1}"
                vduration = float(entry.get("duration") or 0.0)
                vurl = entry.get("url") or f"https://www.youtube.com/watch?v={vid}"

                if vid:
                    videos.append(
                        PlaylistVideoItem(
                            video_id=vid,
                            title=vtitle,
                            duration=vduration,
                            position=i + 1,
                            url=vurl,
                        )
                    )

            logger.info(f"Extracted {len(videos)} videos for playlist {pid} ('{title}')")
            return pid, title, videos

    except Exception as e:
        logger.warning(f"yt-dlp playlist extraction failed: {e}. Falling back to default.")
        raise RuntimeError(f"Failed to fetch playlist metadata: {str(e)}")
