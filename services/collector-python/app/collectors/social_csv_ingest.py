import csv
import glob
import hashlib
import json
import logging
import os
import re
import threading
from typing import Dict, List, Optional, Tuple

from ..crawler_identity import identity_fields
from ..discovery import _fetch_bytes

logger = logging.getLogger(__name__)

EMOJI_PATTERN = re.compile(
    "["
    "\U0001F1E0-\U0001F1FF"
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FA6F"
    "\U0001FA70-\U0001FAFF"
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "]+",
    flags=re.UNICODE,
)

GENERIC_SHORT_NOISE = {
    "get well soon", "gws", "cepat sembuh", "semoga lekas sembuh", "be strong",
    "praying for you", "stay safe", "wkwk", "wkwkwk", "haha", "hahaha", "amin", "aamiin"
}

_COLLECTION_LOCK = threading.Lock()
DEFAULT_SOCIAL_CSV_BATCH_SIZE: Optional[int] = None
SOCIAL_CSV_LOOP_MODE = os.getenv("SOCIAL_CSV_LOOP_MODE", "false").lower() in {"1", "true", "yes", "on"}


def detect_platform_from_url(url: str, filename: str = "") -> str:
    """Detect social media platform from post URL or filename."""
    lower_url = (url or "").lower()
    lower_file = (filename or "").lower()
    if "tiktok.com" in lower_url or "tiktok" in lower_file:
        return "TikTok"
    if "instagram.com" in lower_url or "instagram" in lower_file:
        return "Instagram"
    if "facebook.com" in lower_url or "fb.com" in lower_file or "facebook" in lower_file:
        return "Facebook"
    if "twitter.com" in lower_url or "x.com" in lower_url or "twitter" in lower_file:
        return "X (Twitter)"
    return "Social Media"


def fetch_opengraph_caption(url: str, timeout_seconds: float = 2.5) -> Tuple[Optional[str], Optional[str]]:
    """Fetch title and caption from public OpenGraph meta tags."""
    if not url or not url.startswith("http"):
        return None, None

    try:
        payload, _, _ = _fetch_bytes(url, timeout=max(1, int(timeout_seconds)))
        html = payload.decode("utf-8", errors="ignore")
        title_m = re.search(
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']*)["\']',
            html,
            re.IGNORECASE,
        )
        desc_m = re.search(
            r'<meta[^>]+(?:property|name)=["\'](?:og:description|description)["\'][^>]+content=["\']([^"\']*)["\']',
            html,
            re.IGNORECASE,
        )
        raw_title = title_m.group(1).strip() if title_m else None
        raw_desc = desc_m.group(1).strip() if desc_m else None

        if raw_title:
            raw_title = re.sub(r"&quot;|&#x2026;|&#x1f92f;|&amp;", " ", raw_title).strip()
        if raw_desc:
            raw_desc = re.sub(r"&quot;|&#x2026;|&#x1f92f;|&amp;", " ", raw_desc).strip()
        return raw_title, raw_desc
    except Exception as exc:
        logger.debug("Failed OpenGraph fetch for %s: %s", url, exc)
        return None, None


def is_meaningful_comment(text: str) -> bool:
    """Filter out pure emoji or short generic greetings."""
    if not text:
        return False
    clean_text = EMOJI_PATTERN.sub("", text).strip()
    if len(clean_text) < 4:
        return False

    lower = clean_text.lower()
    words = lower.split()
    if len(words) < 4:
        if any(noise in lower for noise in GENERIC_SHORT_NOISE):
            return False
    return True


class SocialCSVIngestCollector:
    """Scans and ingests social media CSVs into disease surveillance pipeline."""

    def __init__(self, data_dir: Optional[str] = None):
        self.data_dir = data_dir or os.getenv("SOCIAL_MEDIA_CSV_DIR", "/app/data/social_media")
        self.checkpoint_file = os.path.join(self.data_dir, ".state_checkpoints.json")
        self._og_cache: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
        self.loop_mode = SOCIAL_CSV_LOOP_MODE

    def _load_checkpoints(self) -> set:
        if os.path.exists(self.checkpoint_file):
            try:
                with open(self.checkpoint_file, "r", encoding="utf-8") as f:
                    return set(json.load(f))
            except Exception:
                pass
        return set()

    def _save_checkpoints(self, processed_keys: set) -> None:
        try:
            with open(self.checkpoint_file, "w", encoding="utf-8") as f:
                json.dump(list(processed_keys), f)
        except Exception as exc:
            logger.warning("Could not save checkpoints to %s: %s", self.checkpoint_file, exc)

    def collect(self, max_posts: Optional[int] = None) -> dict:
        # The scheduler and the manual trigger share one process. Prevent
        # simultaneous runs from racing on the checkpoint file or publishing
        # the same batch twice.
        if not _COLLECTION_LOCK.acquire(blocking=False):
            return {
                "success": True,
                "skipped": True,
                "reason": "social CSV collection is already running",
            }
        try:
            return self._collect(max_posts)
        finally:
            _COLLECTION_LOCK.release()

    def _collect(self, max_posts: Optional[int] = None) -> dict:
        """Scan directory, group comments per post, extract caption, and publish."""
        if not os.path.exists(self.data_dir):
            return {"success": False, "error": f"Directory not found: {self.data_dir}"}

        if max_posts is None:
            max_posts = DEFAULT_SOCIAL_CSV_BATCH_SIZE

        csv_files = glob.glob(os.path.join(self.data_dir, "*.csv"))
        if not csv_files:
            return {"success": True, "files_found": 0, "posts_ingested": 0}

        checkpoints = self._load_checkpoints()
        total_ingested = 0
        total_comments_read = 0
        grouped_posts: List[Tuple[str, str, dict]] = []

        # Read every file first. This lets the loop know when a complete cycle
        # has finished, even when one run is limited to a small batch.
        for file_path in sorted(csv_files):
            filename = os.path.basename(file_path)
            posts_map: Dict[str, dict] = {}
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        total_comments_read += 1
                        post_id = (row.get("post_id") or row.get("id") or "").strip()
                        url = (row.get("video_link") or row.get("url") or row.get("link") or "").strip()
                        key = post_id or url
                        if not key:
                            continue

                        if key not in posts_map:
                            posts_map[key] = {
                                "post_id": post_id,
                                "url": url,
                                "account": row.get("account_name") or "",
                                "date": row.get("comment_date") or row.get("date") or "",
                                "source": row.get("source") or "",
                                "caption": row.get("caption") or row.get("post_content") or "",
                                "comments": [],
                                "filename": filename,
                            }
                        else:
                            # A post can have a blank URL/caption on its first
                            # comment row and a populated value on a later row.
                            posts_map[key]["url"] = posts_map[key]["url"] or url
                            posts_map[key]["date"] = posts_map[key]["date"] or row.get("comment_date") or row.get("date") or ""
                            posts_map[key]["caption"] = posts_map[key]["caption"] or row.get("caption") or row.get("post_content") or ""

                        comment_text = row.get("comment") or row.get("text") or ""
                        commenter = row.get("commenter_username") or row.get("user") or ""
                        if is_meaningful_comment(comment_text):
                            posts_map[key]["comments"].append((commenter, comment_text))
            except Exception as exc:
                logger.exception("Failed reading %s: %s", filename, exc)
                continue

            grouped_posts.extend((filename, key, post) for key, post in posts_map.items())

        skipped = 0
        failed = 0
        for filename, key, post in grouped_posts:
            checkpoint_key = f"{filename}:{key}"
            if checkpoint_key in checkpoints:
                continue
            if key in checkpoints:
                # Migrate the old pre-file-prefix checkpoint format while
                # preserving its already-processed status.
                checkpoints.add(checkpoint_key)
                continue
            if max_posts is not None and total_ingested >= max_posts:
                break

            platform = detect_platform_from_url(post["url"], filename)
            caption = post["caption"]
            og_title = None

            if not caption and post["url"]:
                if post["url"] in self._og_cache:
                    og_title, caption = self._og_cache[post["url"]]
                else:
                    og_title, caption = fetch_opengraph_caption(post["url"])
                    self._og_cache[post["url"]] = (og_title, caption)

            # Mark unusable rows as handled so they do not prevent the loop
            # from completing a cycle on every scheduler tick.
            if not caption and not post["comments"]:
                checkpoints.add(checkpoint_key)
                skipped += 1
                continue

            title_topic = og_title or f"Laporan {platform} — {post['source'] or 'Surveillance'}"
            content_parts = [
                f"[POST UTAMA {platform.upper()}]",
                f"Akun Pengunggah: {post['account'] or 'Netizen / Komunitas'}",
                f"Topik/Narasi: {caption or title_topic}",
            ]
            if post["source"]:
                content_parts.append(f"Kategori Pencarian: {post['source']}")
            if post["comments"]:
                content_parts.append("\n[LAPORAN & DISKUSI WARGA]")
                for commenter, c_text in post["comments"][:6]:
                    c_user = f"@{commenter}" if commenter else "Warga"
                    content_parts.append(f"- {c_user}: {c_text}")

            full_text = "\n".join(content_parts)
            try:
                from .. import rabbitmq
                from ..minio_client import upload_file

                obj_hash = hashlib.sha256(f"{checkpoint_key}_{full_text}".encode()).hexdigest()
                obj_path = f"social/{platform.lower()}/{obj_hash}.txt"
                upload_file(obj_path, full_text.encode("utf-8"), "text/plain; charset=utf-8")

                rabbitmq.publish({
                    "source_type": "social_media",
                    "source_name": platform,
                    "published_at": post["date"][:10] if post["date"] else "",
                    "text": full_text,
                    "url": post["url"],
                    "object_path": obj_path,
                    "collector_run_id": "",
                    "collector_source_id": f"social_csv_{platform.lower()}",
                    **identity_fields(post["url"], full_text),
                })
                total_ingested += 1
                checkpoints.add(checkpoint_key)
            except Exception as exc:
                failed += 1
                logger.exception("Failed publishing social post %s: %s", key, exc)

        # In loop mode, start the next cycle only after every grouped post has
        # either been published or explicitly classified as unusable. Failed
        # messages remain pending and will be retried on the next run.
        cycle_reset = False
        all_checkpoint_keys = {f"{filename}:{key}" for filename, key, _ in grouped_posts}
        if self.loop_mode and all_checkpoint_keys and all_checkpoint_keys.issubset(checkpoints) and failed == 0:
            checkpoints.clear()
            cycle_reset = True

        self._save_checkpoints(checkpoints)
        return {
            "success": True,
            "files_processed": len(csv_files),
            "comments_read": total_comments_read,
            "posts_ingested": total_ingested,
            "posts_skipped": skipped,
            "posts_failed": failed,
            "loop_mode": self.loop_mode,
            "cycle_reset": cycle_reset,
        }
