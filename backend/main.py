import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from background import send_emails_forever, sweep_expired_orders_forever
from routers.auth import router as auth_router
from routers.events import router as events_router
from routers.organizers import router as organizers_router
from routers.ticket_types import router as ticket_types_router
from routers.orders import router as orders_router
from routers.tickets import router as tickets_router
from routers.staff import router as staff_router
from routers.check_in import router as check_in_router
from routers.paid_sales import router as paid_sales_router
from routers.campaigns import router as campaigns_router
from routers.admin import router as admin_router
from routers.support import router as support_router  # Dev B
from routers.reports import router as reports_router  # Dev B
from routers.health import router as health_router
from fastapi.exceptions import RequestValidationError
from exception_handlers import ERRORS, exception_handler, validation_exception_handler, http_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware


def custom_generate_unique_id(route):
    return f"{route.tags[0]}-{route.name}"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # code before `yield` runs when the server starts, code after it when the server stops
    tasks = [asyncio.create_task(sweep_expired_orders_forever())]
    # --- Dev B: email sender, only when a mail server is configured ---
    if os.getenv("SMTP_HOST"):
        tasks.append(asyncio.create_task(send_emails_forever()))
    # --- end Dev B ---
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan
)



for error in ERRORS:
    app.add_exception_handler(error, exception_handler)

app.add_exception_handler(
    RequestValidationError,
    validation_exception_handler
)

# FastAPI's built-in errors (404 unknown URL, 405 wrong method) use the same body as ours
app.add_exception_handler(StarletteHTTPException, http_exception_handler)

app.include_router(auth_router)
app.include_router(events_router)
app.include_router(organizers_router)
app.include_router(ticket_types_router)
app.include_router(orders_router)
app.include_router(tickets_router)
app.include_router(staff_router)
app.include_router(check_in_router)
app.include_router(paid_sales_router)
app.include_router(campaigns_router)
app.include_router(admin_router)
app.include_router(support_router)  # Dev B
app.include_router(reports_router)  # Dev B
app.include_router(health_router)

# web apps allowed to call the API from a browser: comma-separated, e.g.
# "http://localhost:5173,https://biletflow-web.onrender.com". Mobile apps don't need CORS.
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)