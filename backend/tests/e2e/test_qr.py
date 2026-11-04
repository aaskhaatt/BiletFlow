"""Feature 2: ticket QR image."""
import sys
from helpers import E2E


def main() -> bool:
    with E2E("ticket QR") as t:
        (org, _), (alice, _), (bob, _) = t.new_user(organizer=True), t.new_user(), t.new_user()
        eid = t.make_event(org)
        tt = t.make_ticket_type(org, eid)
        _, order = t.order(alice, eid, [(tt, 1)])
        ticket_id = order["tickets"][0]["id"]

        s, content_type, png = t.call_raw("GET", f"/tickets/{ticket_id}/qr", token=alice)
        t.check("owner gets the QR image", s == 200 and content_type == "image/png", f"{s} {content_type}")
        t.check("it is a real PNG file", png[:8] == b"\x89PNG\r\n\x1a\n", f"{len(png)} bytes")
        s, _, _ = t.call_raw("GET", f"/tickets/{ticket_id}/qr", token=bob)
        t.check("someone else gets 404", s == 404, f"status {s}")
        s, _, _ = t.call_raw("GET", f"/tickets/{ticket_id}/qr")
        t.check("not logged in gets 401", s == 401, f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
