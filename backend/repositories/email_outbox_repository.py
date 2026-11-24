from models import EmailOutbox
from sqlalchemy.orm import Session


def create_outbox_email(to_email: str, template: str, data: dict, db: Session) -> EmailOutbox:
    email = EmailOutbox(
        to_email = to_email,
        template = template,
        data = data
    )

    db.add(email)
    db.flush()

    return email
