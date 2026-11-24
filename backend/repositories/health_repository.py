from sqlalchemy import text
from sqlalchemy.orm import Session


def ping_database(db: Session):
    db.execute(text("select 1"))
