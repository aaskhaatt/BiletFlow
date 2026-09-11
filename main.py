from fastapi import FastAPI
from routers.auth import router as auth_router
from routers.events import router as events_router
from routers.organizers import router as organizers_router
from exception_handlers import ERRORS, exception_handler

app = FastAPI()

for error in ERRORS:
    app.add_exception_handler(error, exception_handler)


app.include_router(auth_router)
app.include_router(events_router)
app.include_router(organizers_router)