from http import HTTPStatus
from exceptions import *
from fastapi import Request
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError
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
    InvalidEventTimeError: (400, "Invalid Event Time"),
    TicketTypeNotFoundError: (404, "Ticket Type Not Found"),
    InvalidTicketSalesTimeError: (400, "Invalid Ticket Sales Time"),
    InvalidRefreshTokenError: (401, "Invalid Refresh Token"),
    InvalidEventStatusError: (409, "Invalid Event Status"),
    EventNotReadyToPublishError: (400, "Event Not Ready To Publish"),
    RegistrationClosedError: (409, "Registration Is Not Open"),
    TicketTypeNotAvailableError: (409, "Ticket Type Not Available"),
    InvalidOrderQuantityError: (400, "Invalid Order Quantity"),
    TicketTypeSoldOutError: (409, "Ticket Type Sold Out"),
    EventSoldOutError: (409, "Event Sold Out"),
    OrderNotFoundError: (404, "Order Not Found"),
    TicketNotFoundError: (404, "Ticket Not Found"),
    QuantityBelowSoldError: (409, "Quantity Is Below Tickets Already Sold"),
    StaffAlreadyAssignedError: (409, "User Is Already Event Staff"),
    StaffAssignmentNotFoundError: (404, "Staff Assignment Not Found"),
    NotEventStaffError: (403, "Not Staff For This Event"),
    TicketNotCheckedInError: (409, "Ticket Is Not Checked In"),
    PaidSalesNotActiveError: (409, "Paid Sales Are Not Active For This Event"),
    ActivationRequirementsNotMetError: (409, "Activation Checklist Is Not Complete"),
    ActivationFeeAlreadyPaidError: (409, "Activation Fee Already Paid"),
    InvalidActivationStatusError: (409, "Invalid Paid Sales Status"),
    PaymentFailedError: (402, "Payment Failed"),
    PaidSalesNotFoundError: (404, "Paid Sales Activation Not Found"),
    OrderNotPayableError: (409, "Order Can Not Be Paid"),
    OrderExpiredError: (409, "Checkout Time Expired"),
    OrderNotCancellableError: (409, "Order Can Not Be Cancelled"),
    OrderNotRefundableError: (409, "Order Can Not Be Refunded"),
    # authentication (dependencies.py)
    NotAuthenticatedError: (401, "Not Authenticated"),
    InvalidTokenError: (401, "Invalid Or Expired Token"),
    PlatformAdminRequiredError: (403, "Platform Admin Access Required"),
}

# 401s about the access token tell the client how to authenticate, as the OAuth2 standard asks
TOKEN_ERRORS = (NotAuthenticatedError, InvalidTokenError)

async def exception_handler(request: Request, exc):
    status, message = ERRORS[type(exc)]

    return JSONResponse(status_code = status,
        content={
            "error": type(exc).__name__,
            "message": message,
            "fields": None
        },
        headers={"WWW-Authenticate": "Bearer"} if isinstance(exc, TOKEN_ERRORS) else None
)


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError
):
    fields = {}

    for error in exc.errors():
        field = error["loc"][-1]
        fields[field] = error["msg"]

    return JSONResponse(
        status_code=422,
        content={
            "error": "VALIDATION_ERROR",
            "message": "Invalid data",
            "fields": fields
        }
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # FastAPI's own errors (unknown URL, wrong method, ...) in the same body as ours,
    # e.g. {"error": "NOT_FOUND", "message": "Not Found", "fields": null}
    try:
        status = HTTPStatus(exc.status_code)
        error, phrase = status.name, status.phrase
    except ValueError:
        error, phrase = "HTTP_ERROR", "Error"

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": error,
            "message": exc.detail if isinstance(exc.detail, str) else phrase,
            "fields": None
        },
        headers=getattr(exc, "headers", None)
    )
