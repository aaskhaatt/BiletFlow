"""Printable PDF tickets: one ticket or a whole order, buyer only, valid tickets only."""
import base64
import json
import re
import sys
import urllib.error
import urllib.request
import zlib
from helpers import E2E, BASE


def get(path: str, token: str | None):
    """GET that also returns the response headers. Returns (status, headers, body bytes)."""
    request = urllib.request.Request(BASE + path)
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()


def error_of(body: bytes) -> str | None:
    try:
        return json.loads(body)["error"]
    except (ValueError, KeyError, TypeError):
        return None


def page_count(pdf: bytes) -> int:
    return len(re.findall(rb"/Type /Page\b(?!s)", pdf))


def page_text(pdf: bytes) -> bytes:
    """The PDF's drawing instructions, unzipped. The ticket code is printed in a standard font,
    so it appears there as plain text; titles use an embedded font and can't be searched this way."""
    text = b""
    # ReportLab puts "endstream" right after the data, with no newline before it
    for stream in re.findall(rb"stream\r?\n(.*?)endstream", pdf, re.DOTALL):
        try:
            # page streams are ASCII85 text (ending in "~>") around zlib-compressed data
            if stream.rstrip().endswith(b"~>"):
                stream = base64.a85decode(stream.rstrip(), adobe=True)
            text += zlib.decompressobj().decompress(stream)
        except (zlib.error, ValueError):
            pass
    return text


def main() -> bool:
    with E2E("ticket PDF") as t:
        (org, _), (alice, _), (bob, _) = t.new_user(organizer=True), t.new_user(), t.new_user()
        eid = t.make_event(org, title="Концерт «Ұлы дала әуендері»", refund_policy="Full refund up to 7 days before.")
        free = t.make_ticket_type(org, eid, name="Стандарт")
        vip = t.make_ticket_type(org, eid, name="VIP", price=15000)
        t.activate_paid_sales(org, eid)

        s, order = t.order(alice, eid, [(free, 2)])
        first, second = order["tickets"]

        # one ticket
        s, headers, pdf = get(f"/tickets/{first['id']}/pdf", alice)
        t.check("buyer downloads one ticket", s == 200 and pdf.startswith(b"%PDF-"), f"status {s}")
        t.check("served as application/pdf", headers.get("Content-Type") == "application/pdf", headers.get("Content-Type"))
        t.check("file name for saving", headers.get("Content-Disposition") == f'inline; filename="ticket-{first["id"]}.pdf"',
                headers.get("Content-Disposition"))
        t.check("never cached (the QR lets someone in)", headers.get("Cache-Control") == "no-store")
        t.check("one page, with its own code only",
                page_count(pdf) == 1 and first["code"].encode() in page_text(pdf) and second["code"].encode() not in page_text(pdf))
        t.check("the Cyrillic font is embedded", b"DejaVuSans" in pdf)

        # the whole order
        s, headers, pdf = get(f"/orders/{order['id']}/pdf", alice)
        t.check("buyer downloads the whole order", s == 200 and pdf.startswith(b"%PDF-"), f"status {s}")
        t.check("one page per ticket, both codes", page_count(pdf) == 2
                and first["code"].encode() in page_text(pdf) and second["code"].encode() in page_text(pdf), f"{page_count(pdf)} pages")
        t.check("order file name", headers.get("Content-Disposition") == f'inline; filename="order-{order["id"]}-tickets.pdf"')

        # a scanned ticket can still be printed
        t.call("POST", f"/events/{eid}/check-in", {"code": first["code"]}, org)
        s, _, _ = get(f"/tickets/{first['id']}/pdf", alice)
        t.check("checked-in ticket still prints", s == 200, f"status {s}")

        # paid checkout: no tickets until it's paid
        s, pending = t.order(alice, eid, [(vip, 1)])
        s, _, body = get(f"/orders/{pending['id']}/pdf", alice)
        t.check("pending checkout: nothing to print yet", s == 409 and error_of(body) == "TicketNotPrintableError", f"status {s}")
        s, paid = t.call("POST", f"/orders/{pending['id']}/pay", {}, alice)
        s, _, pdf = get(f"/orders/{paid['id']}/pdf", alice)
        t.check("after paying it prints", s == 200 and page_count(pdf) == 1
                and paid["tickets"][0]["code"].encode() in page_text(pdf), f"status {s}")

        # who may download
        s, _, body = get(f"/tickets/{first['id']}/pdf", bob)
        t.check("another user gets 404 for the ticket", s == 404 and error_of(body) == "TicketNotFoundError", f"status {s}")
        s, _, body = get(f"/orders/{order['id']}/pdf", bob)
        t.check("another user gets 404 for the order", s == 404 and error_of(body) == "OrderNotFoundError", f"status {s}")
        s, _, _ = get(f"/tickets/{first['id']}/pdf", org)
        t.check("the organizer can't print attendees' tickets", s == 404, f"status {s}")
        s, _, _ = get(f"/tickets/{first['id']}/pdf", None)
        t.check("no login", s == 401, f"status {s}")
        s, _, body = get("/tickets/99999999/pdf", alice)
        t.check("unknown ticket", s == 404 and error_of(body) == "TicketNotFoundError", f"status {s}")
        s, _, body = get("/orders/99999999/pdf", alice)
        t.check("unknown order", s == 404 and error_of(body) == "OrderNotFoundError", f"status {s}")

        # cancelled and refunded tickets never print
        t.call("POST", f"/orders/{order['id']}/cancel", {}, alice)
        s, _, body = get(f"/tickets/{second['id']}/pdf", alice)
        t.check("cancelled ticket: refused", s == 409 and error_of(body) == "TicketNotPrintableError", f"status {s}")
        s, _, body = get(f"/orders/{order['id']}/pdf", alice)
        t.check("cancelled order: refused", s == 409 and error_of(body) == "TicketNotPrintableError", f"status {s}")
        t.call("POST", f"/orders/{paid['id']}/refund", {"reason": "E2E refund"}, org)
        s, _, body = get(f"/orders/{paid['id']}/pdf", alice)
        t.check("refunded order: refused", s == 409 and error_of(body) == "TicketNotPrintableError", f"status {s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
