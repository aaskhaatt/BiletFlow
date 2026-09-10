from exceptions import *
from fastapi import Request
from fastapi.responses import JSONResponse

ERRORS = {
    UserNotFoundError: (404, "User not Found"),
    UserAlreadyExistsError: (409, "User Already exists"),
    InvalidCredentialsError: (401, "Invalid Credentials"),
    OrganizerProfileAlreadyExistsError: (409, "Organizer Profile Already Exists"),
    OrganizerNotFoundError: (404, "Organizer Not Found"),
    OrganizerNotApprovedError: (403, "Organizer Not Aproved"),
    EventNotFoundError: (404, "Event Not Found"),
    EventAccessDeniedError: (403, "Event Access Denied"),
    InvalidEventTimeError: (400, "Invalid Event Time")
}

async def exception_handler(request: Request, exc):
    status, message = ERRORS[type(exc)]

    return JSONResponse(status_code = status, content = {"detail": message})