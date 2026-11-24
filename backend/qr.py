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
