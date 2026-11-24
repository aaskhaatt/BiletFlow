import io
import qrcode
from qrcode.image.pure import PyPNGImage


def _build_qr(data: str) -> qrcode.QRCode:
    # one place for the settings, so the PNG and the PDF ticket always contain the same code
    qr = qrcode.QRCode(
        # "Q" survives about 25% damage: folded or smudged paper tickets still scan
        error_correction=qrcode.constants.ERROR_CORRECT_Q,
        box_size=10,
        # the white margin scanners need around the code
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    return qr


def make_qr_png(data: str) -> bytes:
    # PyPNGImage writes a black-and-white PNG without needing Pillow
    image = _build_qr(data).make_image(image_factory=PyPNGImage)

    buffer = io.BytesIO()
    image.save(buffer)

    return buffer.getvalue()


def make_qr_matrix(data: str) -> list[list[bool]]:
    # the code as rows of squares (True = black), white margin included; the PDF draws these as sharp vector squares
    return _build_qr(data).get_matrix()


def make_campaign_qr_png(data: str, code: str) -> bytes:
    """A Campaign QR for posters (SRS 4.14): visibly NOT a ticket. Navy squares inside a thick orange frame,
    with "PROMO CODE ... NOT AN ENTRY TICKET" printed under it. The scanner rejects it anyway (only "T-" codes
    admit anyone); this makes the difference obvious to people too."""
    from pathlib import Path
    from PIL import Image, ImageDraw, ImageFont

    matrix = make_qr_matrix(data)
    cell, frame, caption_height = 10, 24, 96
    side = len(matrix) * cell
    width, height = side + 2 * frame, side + 2 * frame + caption_height
    orange, navy, white = (249, 115, 22), (30, 58, 138), (255, 255, 255)

    image = Image.new("RGB", (width, height), orange)
    draw = ImageDraw.Draw(image)
    draw.rectangle([frame, frame, frame + side - 1, frame + side - 1], fill=white)
    for r, row in enumerate(matrix):
        for c, dark in enumerate(row):
            if dark:
                x, y = frame + c * cell, frame + r * cell
                draw.rectangle([x, y, x + cell - 1, y + cell - 1], fill=navy)

    fonts = Path(__file__).resolve().parent / "assets" / "fonts"
    bold = ImageFont.truetype(str(fonts / "DejaVuSans-Bold.ttf"), 30)
    small = ImageFont.truetype(str(fonts / "DejaVuSans-Bold.ttf"), 18)
    top = frame + side + 14
    draw.text((width / 2, top), f"PROMO CODE  {code}", font=bold, fill=white, anchor="mt")
    draw.text((width / 2, top + 44), "NOT AN ENTRY TICKET", font=small, fill=white, anchor="mt")

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
