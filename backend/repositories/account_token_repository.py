from datetime import datetime
from models import AccountToken
from sqlalchemy import delete
from sqlalchemy.orm import Session


def create_account_token(user_id: int, purpose: str, token_hash: str, expires_at: datetime, db: Session):
    db.add(AccountToken(user_id=user_id, purpose=purpose, token_hash=token_hash, expires_at=expires_at))
    db.flush()


def consume_account_token(token_hash: str, purpose: str, db: Session):
    """Deletes the token and returns (user_id, expires_at), or None. Atomic, so two clicks can't both use it."""
    stmt = (delete(AccountToken)
            .where(AccountToken.token_hash == token_hash, AccountToken.purpose == purpose)
            .returning(AccountToken.user_id, AccountToken.expires_at))
    return db.execute(stmt).first()


def delete_account_tokens(user_id: int, purpose: str, db: Session):
    db.execute(delete(AccountToken).where(AccountToken.user_id == user_id, AccountToken.purpose == purpose))
