"""Printable PDF tickets (SRS 4.7): one A4 page per ticket, with the same QR code as GET /tickets/{id}/qr.

This module only turns plain data into PDF bytes; the service decides who may print what.
Text uses DejaVu Sans (bundled in assets/fonts) because the PDF's built-in fonts have no Cyrillic,
so Russian and Kazakh titles (ә, ғ, қ, ң, ө, ұ, ү, һ, і) would print as empty boxes.
"""
import io
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from qr import make_qr_matrix

FONTS = Path(__file__).resolve().parent / "assets" / "fonts"
pdfmetrics.registerFont(TTFont("DejaVuSans", str(FONTS / "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(FONTS / "DejaVuSans-Bold.ttf")))
REGULAR, BOLD, MONO = "DejaVuSans", "DejaVuSans-Bold", "Courier"

# all of Kazakhstan uses UTC+5 since March 2024; times are printed the way attendees read the clock
KZ_TIME = timezone(timedelta(hours=5))

INK = HexColor("#111827")
MUTED = HexColor("#6b7280")
LINE = HexColor("#d1d5db")
BAND = HexColor("#1f2937")


@dataclass
class PrintableTicket:
    code: str
    attendee_name: str
    ticket_type_name: str
    price: int              # the order's price snapshot, in KZT
    order_id: int
    number: int             # this ticket's place in its order: "Ticket 2 of 3"
    count: int
    event_title: str
    start_time: datetime
    end_time: datetime
    venue_name: str | None
    venue_address: str | None
    refund_policy: str | None
    organizer_name: str | None


def format_price(price: int) -> str:
    # 15000 -> "15 000 KZT", the way prices are written in Kazakhstan
    return "Free" if price == 0 else f"{price:,} KZT".replace(",", " ")


def format_when(start: datetime, end: datetime) -> str:
    start, end = start.astimezone(KZ_TIME), end.astimezone(KZ_TIME)
    day = start.strftime("%a, %d %b %Y")
    if start.date() == end.date():
        return f"{day}, {start:%H:%M}–{end:%H:%M}"
    return f"{day}, {start:%H:%M} – {end:%a, %d %b %Y}, {end:%H:%M}"


def _wrapped(c: Canvas, text: str, font: str, size: float, x: float, y: float, width: float,
             max_lines: int, color=INK) -> float:
    """Draws text wrapped to `width`, at most `max_lines` lines (the last one shortened with "…").
    `y` is the first baseline; returns the baseline below the last line."""
    lines = simpleSplit(text, font, size, width) or [""]
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and pdfmetrics.stringWidth(last + "…", font, size) > width:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    c.setFont(font, size)
    c.setFillColor(color)
    leading = size * 1.3
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def _field(c: Canvas, label: str, value: str, x: float, y: float, width: float, max_lines: int = 2) -> float:
    c.setFont(REGULAR, 7.5)
    c.setFillColor(MUTED)
    c.drawString(x, y, label.upper())
    return _wrapped(c, value, REGULAR, 11, x, y - 14, width, max_lines) - 8


def _qr(c: Canvas, data: str, x: float, y: float, size: float):
    # vector squares instead of a picture: stays sharp at any print size and keeps the file small
    matrix = make_qr_matrix(data)
    cell = size / len(matrix)
    c.setFillColor(white)
    c.rect(x, y, size, size, stroke=0, fill=1)
    c.setFillColor(INK)
    for row_index, row in enumerate(matrix):
        top = y + size - (row_index + 1) * cell
        col = 0
        while col < len(row):
            if row[col]:
                start = col
                while col < len(row) and row[col]:
                    col += 1
                # one rectangle per run of black squares in the row
                c.rect(x + start * cell, top, (col - start) * cell, cell, stroke=0, fill=1)
            else:
                col += 1


def _page(c: Canvas, t: PrintableTicket):
    page_w, page_h = A4
    left, card_w = 20 * mm, page_w - 40 * mm
    card_top, card_h = page_h - 20 * mm, 150 * mm
    card_bottom = card_top - card_h

    # the dark band with the brand, then the card outline over it so their edges meet cleanly
    band_h = 14 * mm
    c.setFillColor(BAND)
    c.roundRect(left, card_top - band_h, card_w, band_h, 4 * mm, stroke=0, fill=1)
    c.rect(left, card_top - band_h, card_w, band_h / 2, stroke=0, fill=1)  # square off the band's lower corners
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.roundRect(left, card_bottom, card_w, card_h, 4 * mm, stroke=1, fill=0)
    c.setFillColor(white)
    c.setFont(BOLD, 14)
    c.drawString(left + 8 * mm, card_top - 9 * mm, "BiletFlow")
    c.setFont(REGULAR, 10)
    c.drawRightString(left + card_w - 8 * mm, card_top - 9 * mm, f"Ticket {t.number} of {t.count}")

    # right column: the QR code and its text
    qr_size = 62 * mm
    qr_x = left + card_w - 8 * mm - qr_size
    qr_y = card_top - band_h - 8 * mm - qr_size
    _qr(c, t.code, qr_x, qr_y, qr_size)
    c.setFont(MONO, 9)
    c.setFillColor(INK)
    c.drawCentredString(qr_x + qr_size / 2, qr_y - 5 * mm, t.code)

    # left column: what, when, where, who
    x = left + 8 * mm
    width = qr_x - x - 8 * mm
    # long titles get a smaller font and one more line before they're shortened with "…"
    title_size, title_lines = (18, 3) if len(simpleSplit(t.event_title, BOLD, 18, width)) <= 3 else (14, 4)
    y = _wrapped(c, t.event_title, BOLD, title_size, x, card_top - band_h - 14 * mm, width, max_lines=title_lines) - 4
    y = _field(c, "Date and time", f"{format_when(t.start_time, t.end_time)} (UTC+5)", x, y, width)
    venue = ", ".join(part for part in (t.venue_name, t.venue_address) if part) or "To be announced"
    y = _field(c, "Venue", venue, x, y, width, max_lines=3)
    y = _field(c, "Ticket", f"{t.ticket_type_name} · {format_price(t.price)}", x, y, width)
    y = _field(c, "Attendee", t.attendee_name, x, y, width)
    _field(c, "Order", f"#{t.order_id}", x, y, width, max_lines=1)

    # bottom of the card: how to use it
    c.setStrokeColor(LINE)
    c.line(left + 8 * mm, card_bottom + 22 * mm, left + card_w - 8 * mm, card_bottom + 22 * mm)
    _wrapped(c, "Show this QR code at the entrance, on paper or on your phone. Each code admits one person once. "
                "Anyone holding it can use it, so don't share it.",
             REGULAR, 9, left + 8 * mm, card_bottom + 15 * mm, card_w - 16 * mm, max_lines=2, color=MUTED)

    # under the card: who runs the event and its refund rules
    y = card_bottom - 10 * mm
    if t.organizer_name:
        y = _wrapped(c, f"Organizer: {t.organizer_name}", REGULAR, 9, left, y, card_w, max_lines=1, color=MUTED) - 2
    if t.refund_policy:
        _wrapped(c, f"Refund policy: {t.refund_policy}", REGULAR, 9, left, y, card_w, max_lines=8, color=MUTED)


def render_tickets_pdf(tickets: list[PrintableTicket]) -> bytes:
    buffer = io.BytesIO()
    c = Canvas(buffer, pagesize=A4, pageCompression=1)
    c.setTitle(tickets[0].event_title if tickets else "BiletFlow tickets")
    c.setAuthor("BiletFlow")
    for ticket in tickets:
        _page(c, ticket)
        c.showPage()
    c.save()

    return buffer.getvalue()
