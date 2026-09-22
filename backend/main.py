from fastapi import FastAPI
from routers.auth import router as auth_router
from routers.events import router as events_router
from routers.organizers import router as organizers_router
from routers.ticket_types import router as ticket_types_router
from exception_handlers import ERRORS, exception_handler
from fastapi.middleware.cors import CORSMiddleware


def custom_generate_unique_id(route):
    return f"{route.tags[0]}-{route.name}"

app = FastAPI(
    generate_unique_id_function=custom_generate_unique_id
)



for error in ERRORS:
    app.add_exception_handler(error, exception_handler)


app.include_router(auth_router)
app.include_router(events_router)
app.include_router(organizers_router)
app.include_router(ticket_types_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173"
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)