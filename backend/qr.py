import io
import qrcode
from qrcode.image.pure import PyPNGImage


def make_qr_png(data: str) -> bytes:
    qr = qrcode.QRCode(
        # "Q" survives about 25% damage: folded or smudged paper tickets still scan
        error_correction=qrcode.constants.ERROR_CORRECT_Q,
        box_size=10,
        # the white margin scanners need around the code
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    # PyPNGImage writes a black-and-white PNG without needing Pillow
    image = qr.make_image(image_factory=PyPNGImage)

    buffer = io.BytesIO()
    image.save(buffer)

    return buffer.getvalue()
