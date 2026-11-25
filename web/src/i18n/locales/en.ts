import type { Messages } from '@/i18n/messages'

export const en: Messages = {
  common: {
    close: 'Close',
    language: 'Language',
    toHome: 'Go to the home page',
  },
  dev: {
    greeting: 'Welcome to BiletFlow',
  },
  notFound: {
    title: 'Page not found',
    text: 'The link may be out of date, or the address has a typo.',
  },
  routeError: {
    title: 'Something went wrong',
    text: 'Reload the page. If it happens again, contact support.',
  },
  validation: {
    invalid: 'Check this field',
  },
  money: {
    free: 'Free',
  },
  time: {
    astanaZone: 'Astana time (UTC+5)',
  },
  errors: {
    // 400
    InvalidEventTimeError: 'Check the event dates: the end must be later than the start.',
    InvalidTicketSalesTimeError: 'Check the ticket sales dates.',
    EventNotReadyToPublishError: 'Add the venue and address to publish the event.',
    InvalidOrderQuantityError: "This number of tickets can't be ordered.",
    InvalidCampaignError: 'Check the campaign settings.',
    InvalidAccountTokenError: 'This link is invalid, expired or already used.',
    InvalidSupportAssigneeError: "This person doesn't handle this case.",
    CannotSuspendSelfError: "You can't suspend your own account.",
    // 401
    InvalidCredentialsError: 'Wrong email or password.',
    InvalidRefreshTokenError: 'Your session has ended. Please sign in again.',
    NotAuthenticatedError: 'Sign in to continue.',
    InvalidTokenError: 'Your session has ended. Please sign in again.',
    // 402
    PaymentFailedError: "The payment didn't go through. Please try again.",
    // 403
    OrganizerNotApprovedError: "Your organizer profile isn't approved yet.",
    EventAccessDeniedError: "You don't have access to this event.",
    NotEventStaffError: "You're not on the staff of this event.",
    PlatformAdminRequiredError: 'Only platform admins can do this.',
    UserSuspendedError: 'This account is suspended.',
    SupportCaseAccessDeniedError: 'Only the people handling this case can do this.',
    // 404
    UserNotFoundError: 'User not found.',
    OrganizerNotFoundError: 'Organizer profile not found.',
    EventNotFoundError: "This event doesn't exist or isn't available.",
    TicketTypeNotFoundError: 'Ticket type not found.',
    OrderNotFoundError: 'Order not found.',
    TicketNotFoundError: 'Ticket not found.',
    StaffAssignmentNotFoundError: "This person isn't on the event staff.",
    PaidSalesNotFoundError: "Paid sales aren't set up for this event.",
    CampaignNotFoundError: 'Campaign not found.',
    PromoCodeNotFoundError: "This promo code doesn't exist.",
    CampaignLinkNotFoundError: "This campaign link isn't valid.",
    SupportCaseNotFoundError: 'Support case not found.',
    EventReportNotFoundError: 'Report not found.',
    NOT_FOUND: "What you asked for wasn't found.",
    // 405
    METHOD_NOT_ALLOWED: "This action isn't available.",
    // 409
    UserAlreadyExistsError: 'An account with this email already exists.',
    OrganizerProfileAlreadyExistsError: "You've already applied to be an organizer.",
    InvalidEventStatusError: "This can't be done in the event's current status.",
    RegistrationClosedError: 'Registration for this event is closed right now.',
    TicketTypeNotAvailableError: "This ticket isn't on sale right now.",
    TicketTypeSoldOutError: 'This ticket type is sold out.',
    EventSoldOutError: 'The event is sold out.',
    QuantityBelowSoldError: "The quantity can't be lower than the tickets already sold.",
    StaffAlreadyAssignedError: 'This person is already on the event staff.',
    TicketNotCheckedInError: "This ticket hasn't been checked in.",
    PaidSalesNotActiveError: "Paid sales aren't active for this event yet.",
    ActivationRequirementsNotMetError: 'Complete every step of the activation checklist first.',
    ActivationFeeAlreadyPaidError: 'The activation fee is already paid.',
    InvalidActivationStatusError: "This can't be done in the current paid sales status.",
    OrderNotPayableError: "This order can't be paid.",
    OrderExpiredError: 'The time to pay has run out. Please start a new order.',
    OrderNotCancellableError: "This order can't be cancelled.",
    OrderNotRefundableError: "This order can't be refunded.",
    TicketNotPrintableError: 'Only valid tickets can be printed.',
    PromoCodeAlreadyExistsError: 'This event already has this promo code.',
    PromoCodeNotActiveError: "This promo code isn't active.",
    PromoCodeUsedUpError: 'This promo code has been used up.',
    PromoCodeNotApplicableError: "This promo code doesn't apply to the selected tickets.",
    EmailAlreadyVerifiedError: 'Your email is already verified.',
    EventAlreadyReportedError: "You've already reported this event.",
    // 413, 415
    ImageTooLargeError: 'The image is larger than 5 MB.',
    InvalidImageError: 'Upload a JPEG, PNG or WebP image.',
    // 422
    VALIDATION_ERROR: 'Check the highlighted fields.',
    // 503
    StorageNotConfiguredError: "File uploads aren't available right now.",
    StorageUnavailableError: "File storage isn't responding. Please try again later.",
    DatabaseUnavailableError: 'The service is temporarily unavailable. Please try again later.',
    // made by the client
    NETWORK_ERROR: "Can't reach the server. Check your connection and try again.",
    UNKNOWN_ERROR: 'Something went wrong. Please try again.',
  },
}
