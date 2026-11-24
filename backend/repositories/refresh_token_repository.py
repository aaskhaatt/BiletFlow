from sqlalchemy.orm import Session
from sqlalchemy import delete
from models.refresh_token import RefreshToken
from datetime import datetime


 
def create_refresh_token(user_id: int, token_hash: str, expires_at: datetime, db: Session):
    refresh_token = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)

    db.add(refresh_token)
    db.flush()



def consume_refresh_token(token_hash:str, db: Session):
    stmt = delete(RefreshToken).where(RefreshToken.token_hash == token_hash).returning(RefreshToken.user_id, RefreshToken.expires_at)
    return db.execute(stmt).first()



def delete_user_refresh_tokens(user_id: int, db: Session):
    # signs the user out everywhere, e.g. after a password reset
    db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
