from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os



load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Hosts like Render and Heroku hand out "postgres://..." URLs, which SQLAlchemy 2 rejects
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL.removeprefix("postgres://")

engine = create_engine(DATABASE_URL)



class Base(DeclarativeBase):
    pass



SessionLocal = sessionmaker(
    bind=engine, 
    autoflush=False,
    autocommit=False
)



def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()

