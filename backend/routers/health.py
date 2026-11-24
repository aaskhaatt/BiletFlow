from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from services.health_service import check_health_service

router = APIRouter(tags=["health"])


# used by the host (e.g. Render) to know the server is up; no login needed
@router.get("/health")
def health(db: Session = Depends(get_db)):
    return check_health_service(db)
