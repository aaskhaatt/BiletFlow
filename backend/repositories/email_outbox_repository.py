from datetime import datetime
from models import EmailOutbox
from sqlalchemy import func, select
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


def claim_due_email(lease_until: datetime, db: Session) -> EmailOutbox | None:
    """Takes the oldest pending email whose time has come and pushes its next_attempt_at to `lease_until`.

    SKIP LOCKED lets parallel senders take different rows instead of waiting for each other; once the
    caller commits, the lease keeps other senders away while this one is talking to the SMTP server.
    """
    email = db.scalars(
        select(EmailOutbox)
        .where(EmailOutbox.status == "pending", EmailOutbox.next_attempt_at <= func.now())
        .order_by(EmailOutbox.created_at, EmailOutbox.id)
        .limit(1)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    ).first()
    if email is None:
        return None

    email.attempts += 1
    email.next_attempt_at = lease_until
    db.flush()
    return email
