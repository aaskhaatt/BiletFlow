import type { ErrorCode } from '@/api/error-codes'

// Russian: the reference language. kk.ts and en.ts must have exactly the same keys.

const errors = {
  // 400
  InvalidEventTimeError: 'Проверьте даты события: окончание должно быть позже начала.',
  InvalidTicketSalesTimeError: 'Проверьте даты продажи билетов.',
  EventNotReadyToPublishError: 'Чтобы опубликовать событие, укажите площадку и адрес.',
  InvalidOrderQuantityError: 'Такое количество билетов заказать нельзя.',
  InvalidCampaignError: 'Проверьте настройки кампании.',
  InvalidAccountTokenError: 'Ссылка недействительна, устарела или уже использована.',
  InvalidSupportAssigneeError: 'Этот пользователь не занимается этим обращением.',
  CannotSuspendSelfError: 'Нельзя заблокировать собственный аккаунт.',
  // 401
  InvalidCredentialsError: 'Неверная почта или пароль.',
  InvalidRefreshTokenError: 'Сеанс завершён. Войдите снова.',
  NotAuthenticatedError: 'Войдите, чтобы продолжить.',
  InvalidTokenError: 'Сеанс завершён. Войдите снова.',
  // 402
  PaymentFailedError: 'Оплата не прошла. Попробуйте ещё раз.',
  // 403
  OrganizerNotApprovedError: 'Профиль организатора ещё не одобрен.',
  EventAccessDeniedError: 'У вас нет доступа к этому событию.',
  NotEventStaffError: 'Вы не назначены сотрудником этого события.',
  PlatformAdminRequiredError: 'Это доступно только администраторам платформы.',
  UserSuspendedError: 'Аккаунт заблокирован.',
  SupportCaseAccessDeniedError: 'Это могут делать только те, кто ведёт обращение.',
  // 404
  UserNotFoundError: 'Пользователь не найден.',
  OrganizerNotFoundError: 'Профиль организатора не найден.',
  EventNotFoundError: 'Событие не найдено или недоступно.',
  TicketTypeNotFoundError: 'Тип билета не найден.',
  OrderNotFoundError: 'Заказ не найден.',
  TicketNotFoundError: 'Билет не найден.',
  StaffAssignmentNotFoundError: 'Этот человек не назначен на событие.',
  PaidSalesNotFoundError: 'Платные продажи для этого события не настроены.',
  CampaignNotFoundError: 'Кампания не найдена.',
  PromoCodeNotFoundError: 'Такого промокода нет.',
  CampaignLinkNotFoundError: 'Ссылка кампании недействительна.',
  SupportCaseNotFoundError: 'Обращение не найдено.',
  EventReportNotFoundError: 'Жалоба не найдена.',
  NOT_FOUND: 'Запрошенные данные не найдены.',
  // 405
  METHOD_NOT_ALLOWED: 'Это действие недоступно.',
  // 409
  UserAlreadyExistsError: 'Аккаунт с этой почтой уже есть.',
  OrganizerProfileAlreadyExistsError: 'Вы уже подали заявку на организатора.',
  InvalidEventStatusError: 'В текущем статусе события это действие недоступно.',
  RegistrationClosedError: 'Регистрация на событие сейчас закрыта.',
  TicketTypeNotAvailableError: 'Этот билет сейчас не продаётся.',
  TicketTypeSoldOutError: 'Билеты этого типа закончились.',
  EventSoldOutError: 'Все места на событие распроданы.',
  QuantityBelowSoldError: 'Количество не может быть меньше уже проданных билетов.',
  StaffAlreadyAssignedError: 'Этот пользователь уже назначен на событие.',
  TicketNotCheckedInError: 'Вход по этому билету ещё не отмечен.',
  PaidSalesNotActiveError: 'Платные продажи для этого события ещё не активированы.',
  ActivationRequirementsNotMetError: 'Сначала выполните все пункты чеклиста активации.',
  ActivationFeeAlreadyPaidError: 'Сбор за активацию уже оплачен.',
  InvalidActivationStatusError: 'В текущем статусе платных продаж это действие недоступно.',
  OrderNotPayableError: 'Этот заказ нельзя оплатить.',
  OrderExpiredError: 'Время на оплату истекло. Оформите заказ заново.',
  OrderNotCancellableError: 'Этот заказ нельзя отменить.',
  OrderNotRefundableError: 'По этому заказу нельзя сделать возврат.',
  TicketNotPrintableError: 'Распечатать можно только действительный билет.',
  PromoCodeAlreadyExistsError: 'У этого события уже есть такой промокод.',
  PromoCodeNotActiveError: 'Промокод сейчас не действует.',
  PromoCodeUsedUpError: 'Лимит использований промокода исчерпан.',
  PromoCodeNotApplicableError: 'Промокод не подходит к выбранным билетам.',
  EmailAlreadyVerifiedError: 'Почта уже подтверждена.',
  EventAlreadyReportedError: 'Вы уже пожаловались на это событие.',
  // 413, 415
  ImageTooLargeError: 'Изображение больше 5 МБ.',
  InvalidImageError: 'Загрузите изображение JPEG, PNG или WebP.',
  // 422
  VALIDATION_ERROR: 'Проверьте выделенные поля.',
  // 503
  StorageNotConfiguredError: 'Загрузка файлов сейчас недоступна.',
  StorageUnavailableError: 'Хранилище файлов не отвечает. Попробуйте позже.',
  DatabaseUnavailableError: 'Сервис временно недоступен. Попробуйте позже.',
  // made by the client
  NETWORK_ERROR: 'Нет связи с сервером. Проверьте интернет и попробуйте снова.',
  UNKNOWN_ERROR: 'Что-то пошло не так. Попробуйте ещё раз.',
} satisfies Record<ErrorCode, string>

export const ru = {
  common: {
    close: 'Закрыть',
    language: 'Язык',
    toHome: 'На главную',
  },
  // the developer page /dev/ui
  dev: {
    greeting: 'Добро пожаловать в BiletFlow',
    iconsNote: 'Обводка 2 px, размер 24, скругления на концах. Цвет наследуется от текста рядом.',
  },
  notFound: {
    title: 'Страница не найдена',
    text: 'Возможно, ссылка устарела или в адресе есть ошибка.',
  },
  routeError: {
    title: 'Что-то пошло не так',
    text: 'Обновите страницу. Если ошибка повторится, напишите в поддержку.',
  },
  validation: {
    invalid: 'Проверьте это поле',
  },
  money: {
    free: 'Бесплатно',
  },
  time: {
    astanaZone: 'Время Астаны (UTC+5)',
  },
  errors,
}
