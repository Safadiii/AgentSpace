
import os

from dotenv import load_dotenv
from sqlalchemy import URL
from sqlmodel import (
    SQLModel,
    Session,
    create_engine,
)

load_dotenv()

DATABASE_URL = URL.create(
    drivername="mysql+pymysql",
    username=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    host=os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("DB_PORT", "3306")),
    database=os.environ["DB_NAME"],
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)


def init_db():
    import storage.research.models

    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
