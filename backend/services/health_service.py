from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from repositories.health_repository import ping_database
from exceptions import DatabaseUnavailableError


def check_health_service(db: Session):
    try:
        ping_database(db)
    except OperationalError:
        # the host sees 503 and keeps the old version running / restarts us
        raise DatabaseUnavailableError()

    return {"status": "ok", "database": "ok"}
