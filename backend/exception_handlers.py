from exceptions import *
from fastapi import Request
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
    # --- Dev B: Feature 7 ---
    InvalidAccountTokenError: (400, "This link is invalid, expired or already used"),
    EmailAlreadyVerifiedError: (409, "Email Is Already Verified"),
    # --- end Dev B ---
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
    OrderNotRefundableError: (409, "Order Can Not Be Refunded")
}

async def exception_handler(request: Request, exc):
    status, message = ERRORS[type(exc)]

    return JSONResponse(status_code = status, 
        content={
            "error": type(exc).__name__,
            "message": message,
            "fields": None
})


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