import csv
import glob
import hashlib
import json
import logging
import os
import re
import urllib.request
from typing import Dict, List, Optional, Tuple

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

    headers = {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
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

    def collect(self, max_posts: int = 25) -> dict:
        """Scan directory, group comments per post, extract caption, and publish."""
        if not os.path.exists(self.data_dir):
            return {"success": False, "error": f"Directory not found: {self.data_dir}"}

        csv_files = glob.glob(os.path.join(self.data_dir, "*.csv"))
        if not csv_files:
            return {"success": True, "files_found": 0, "posts_ingested": 0}

        checkpoints = self._load_checkpoints()
        total_ingested = 0
        total_comments_read = 0

        for file_path in csv_files:
            if total_ingested >= max_posts:
                break

            filename = os.path.basename(file_path)
            posts_map: Dict[str, dict] = {}

            # Read and group CSV rows by post
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        total_comments_read += 1
                        post_id = row.get("post_id") or row.get("id") or ""
                        url = row.get("video_link") or row.get("url") or row.get("link") or ""
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

                        comment_text = row.get("comment") or row.get("text") or ""
                        commenter = row.get("commenter_username") or row.get("user") or ""
                        if is_meaningful_comment(comment_text):
                            posts_map[key]["comments"].append((commenter, comment_text))

            except Exception as exc:
                logger.exception("Failed reading %s: %s", filename, exc)
                continue

            # Process each unique post
            for key, post in posts_map.items():
                if total_ingested >= max_posts:
                    break

                if key in checkpoints:
                    continue

                platform = detect_platform_from_url(post["url"], post["filename"])
                caption = post["caption"]
                og_title = None

                # Fetch OpenGraph caption if not provided in CSV
                if not caption and post["url"]:
                    if post["url"] in self._og_cache:
                        og_title, caption = self._og_cache[post["url"]]
                    else:
                        og_title, caption = fetch_opengraph_caption(post["url"])
                        self._og_cache[post["url"]] = (og_title, caption)

                # Skip posts with no caption and no meaningful comments
                if not caption and not post["comments"]:
                    continue

                # Build rich detailed content document
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

                # Publish to RabbitMQ pipeline
                try:
                    from .. import rabbitmq
                    from ..minio_client import upload_file

                    obj_hash = hashlib.sha256(f"{key}_{full_text[:100]}".encode()).hexdigest()
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
                    })
                    total_ingested += 1
                    checkpoints.add(key)
                except Exception as exc:
                    logger.exception("Failed publishing social post %s: %s", key, exc)

        self._save_checkpoints(checkpoints)
        return {
            "success": True,
            "files_processed": len(csv_files),
            "comments_read": total_comments_read,
            "posts_ingested": total_ingested,
        }
