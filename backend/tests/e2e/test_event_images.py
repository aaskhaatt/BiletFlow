"""Event cover images: upload, replace, remove, validation and who may do it.

Needs the storage container (docker compose up -d storage) and the S3_* settings in backend/.env.
Without the settings, it only checks that uploads answer 503 and skips the rest.
"""
import json
import secrets
import struct
import sys
import urllib.error
import urllib.request
import zlib
from helpers import E2E, BASE


def tiny_png() -> bytes:
    # a real 1x1 PNG, built by hand so the test needs no image library
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    header = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    pixels = zlib.compress(b"\x00\xff\x00\x00")
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixels) + chunk(b"IEND", b"")


# only the first bytes matter to the API; these are enough to identify each format
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + secrets.token_bytes(64)
WEBP = b"RIFF" + struct.pack("<I", 68) + b"WEBPVP8 " + secrets.token_bytes(60)
GIF = b"GIF89a" + secrets.token_bytes(32)


def upload(token: str | None, event_id: int, data: bytes | None, filename: str = "cover.png",
           content_type: str = "image/png", field: str = "file"):
    """PUT /events/{id}/image as multipart/form-data, the way a browser or phone sends a file."""
    boundary = "----e2e" + secrets.token_hex(8)
    body = b""
    if data is not None:
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
                 f"Content-Type: {content_type}\r\n\r\n").encode() + data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(f"{BASE}/events/{event_id}/image", data=body, method="PUT")
    request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        raw = error.read()
        return error.code, (json.loads(raw) if raw else None)


def download(url: str):
    """Fetches an image URL with no login. Returns (status, content type, bytes)."""
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return response.status, response.headers.get("Content-Type"), response.read()
    except urllib.error.HTTPError as error:
        return error.code, None, None


def main() -> bool:
    with E2E("event images") as t:
        (org, _), (other_org, _), (attendee, _) = t.new_user(organizer=True), t.new_user(organizer=True), t.new_user()
        eid = t.make_event(org)
        png = tiny_png()

        s, ev = t.call("GET", f"/events/{eid}")
        t.check("a new event has no image", s == 200 and ev["image_url"] is None, f"status {s}")

        s, ev = upload(org, eid, png)
        if s == 503 and ev and ev["error"] == "StorageNotConfiguredError":
            t.check("storage not configured: upload answers 503", True)
            print("SKIP  the rest: set S3_* in backend/.env and run `docker compose up -d storage`")
            return t.passed

        # first upload
        t.check("owner uploads a PNG", s == 200 and ev["image_url"] and ev["image_url"].endswith(".png"), f"status {s}")
        first_url = ev["image_url"]
        s, kind, data = download(first_url)
        t.check("anyone can download it, no login", s == 200 and data == png, f"status {s}")
        t.check("served as image/png", kind == "image/png", kind)
        s, ev = t.call("GET", f"/events/{eid}")
        t.check("public event page shows the image", ev["image_url"] == first_url)
        s, page = t.call("GET", f"/events?q=E2E+event&limit=100")
        t.check("the catalogue shows it too", any(e["id"] == eid and e["image_url"] == first_url for e in page["items"]))

        # replacing
        s, ev = upload(org, eid, JPEG, filename="photo.jpg", content_type="image/jpeg")
        second_url = ev and ev["image_url"]
        t.check("replace with a JPEG", s == 200 and second_url.endswith(".jpg") and second_url != first_url, f"{s}")
        t.check("the new one downloads as image/jpeg", download(second_url)[:2] == (200, "image/jpeg"))
        t.check("the old file is deleted", download(first_url)[0] in (403, 404), f"status {download(first_url)[0]}")
        s, ev = upload(org, eid, WEBP, filename="pic.webp", content_type="image/webp")
        t.check("WebP is accepted", s == 200 and ev["image_url"].endswith(".webp"), f"status {s}")
        current_url = ev["image_url"]

        # what is refused: the API looks at the file's bytes, never at the name or Content-Type the client sends
        s, b = upload(org, eid, b"<html><script>alert(1)</script></html>", filename="evil.png", content_type="image/png")
        t.check("HTML pretending to be a PNG", s == 415 and b["error"] == "InvalidImageError", f"status {s}")
        s, b = upload(org, eid, GIF, filename="anim.gif", content_type="image/gif")
        t.check("GIF is not accepted", s == 415 and b["error"] == "InvalidImageError", f"status {s}")
        s, b = upload(org, eid, png + b"\x00" * (5 * 1024 * 1024))
        t.check("more than 5 MB", s == 413 and b["error"] == "ImageTooLargeError", f"status {s}")
        s, b = upload(org, eid, None)
        t.check("no file at all", s == 422 and b["error"] == "VALIDATION_ERROR", f"status {s}")
        s, b = upload(org, eid, png, field="image")
        t.check("file sent under the wrong field name", s == 422, f"status {s}")

        # who may do it
        s, b = upload(other_org, eid, png)
        t.check("another organizer is refused", s == 403 and b["error"] == "EventAccessDeniedError", f"status {s}")
        s, b = upload(attendee, eid, png)
        t.check("a user who isn't an organizer is refused", s == 404 and b["error"] == "OrganizerNotFoundError", f"status {s}")
        s, _ = upload(None, eid, png)
        t.check("no login is refused", s == 401, f"status {s}")
        s, b = upload(org, 99999999, png)
        t.check("unknown event", s == 404 and b["error"] == "EventNotFoundError", f"status {s}")
        s, b = t.call("DELETE", f"/events/{eid}/image", token=other_org)
        t.check("another organizer can't remove it", s == 403, f"status {s}")
        s, ev = t.call("GET", f"/events/{eid}")
        t.check("after all the refusals the image is unchanged", ev["image_url"] == current_url)

        # a draft can get an image before it's published
        draft = t.make_event(org, publish=False)
        s, ev = upload(org, draft, png)
        t.check("a draft event can have an image", s == 200 and ev["image_url"], f"status {s}")
        s, mine = t.call("GET", "/events/me", token=org)
        t.check("the organizer's own list shows it", any(e["id"] == draft and e["image_url"] for e in mine))

        # removing
        s, ev = t.call("DELETE", f"/events/{eid}/image", token=org)
        t.check("owner removes the image", s == 200 and ev["image_url"] is None, f"status {s}")
        t.check("its file is deleted", download(current_url)[0] in (403, 404))
        s, ev = t.call("DELETE", f"/events/{eid}/image", token=org)
        t.check("removing again is fine (nothing to do)", s == 200 and ev["image_url"] is None, f"status {s}")
        t.call("DELETE", f"/events/{draft}/image", token=org)

        # audit log: 3 uploads + 1 removal on the main event; refusals and the no-op removal leave no row
        actions = [r.action for r in t.db_rows(
            "select action from audit_logs where event_id = :e and action like 'event.image%' order by id", e=eid)]
        t.check("audit log", actions == ["event.image_updated"] * 3 + ["event.image_removed"], f"{actions}")
        descriptions = [r.description for r in t.db_rows(
            "select description from audit_logs where event_id = :e and action = 'event.image_updated' order by id", e=eid)]
        t.check("first upload says 'Added', later ones 'Replaced'",
                descriptions == ["Added a cover image", "Replaced the cover image", "Replaced the cover image"], f"{descriptions}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
