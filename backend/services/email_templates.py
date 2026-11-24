"""Subject and plain-text body for every EMAIL_TEMPLATES key (SRS 4.10), in Kazakh, Russian and English (SRS 7).

Every email carries all three languages: Kazakh first (the state language), then Russian, then English. There's no
per-user language setting yet, and bilingual kk/ru notices are what people in Kazakhstan are used to.
`{placeholders}` come from the email's `data`, plus `{app_url}` (the web app's address, FRONTEND_URL).
Kazakh and Russian texts: have a native speaker check them before the final release.
"""
import os

APP_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

DIVIDER = "\n\n———\n\n"

# template -> {language: (subject, body)}
TEMPLATES = {
    "verify_email": {
        "kk": ("BiletFlow поштаңызды растаңыз",
               "BiletFlow-ға қош келдіңіз!\n\nЭлектрондық пошта мекенжайыңызды мына сілтеме арқылы растаңыз:\n"
               "{app_url}/verify-email?token={token}\n\nСілтеме {expires_at} дейін жарамды. "
               "Егер сіз тіркелмеген болсаңыз, бұл хатты елемеңіз."),
        "ru": ("Подтвердите почту в BiletFlow",
               "Добро пожаловать в BiletFlow!\n\nПодтвердите адрес электронной почты по ссылке:\n"
               "{app_url}/verify-email?token={token}\n\nСсылка действует до {expires_at}. "
               "Если вы не регистрировались, просто проигнорируйте это письмо."),
        "en": ("Confirm your BiletFlow email",
               "Welcome to BiletFlow!\n\nConfirm your email address by opening this link:\n"
               "{app_url}/verify-email?token={token}\n\nThe link works until {expires_at}. "
               "If you didn't create an account, ignore this email."),
    },
    "password_reset": {
        "kk": ("BiletFlow құпиясөзін қалпына келтіру",
               "Біреу сіздің BiletFlow аккаунтыңыздың құпиясөзін қалпына келтіруді сұрады.\n\n"
               "Жаңа құпиясөзді мына жерде орнатыңыз:\n{app_url}/reset-password?token={token}\n\n"
               "Сілтеме бір рет қана және {expires_at} дейін жарамды. "
               "Егер бұл сіз болмасаңыз, хатты елемеңіз: құпиясөзіңіз өзгермейді."),
        "ru": ("Сброс пароля BiletFlow",
               "Кто-то запросил сброс пароля для вашего аккаунта BiletFlow.\n\n"
               "Задайте новый пароль здесь:\n{app_url}/reset-password?token={token}\n\n"
               "Ссылка одноразовая и действует до {expires_at}. "
               "Если это были не вы, проигнорируйте письмо: пароль останется прежним."),
        "en": ("Reset your BiletFlow password",
               "Someone asked to reset the password of your BiletFlow account.\n\nChoose a new password here:\n"
               "{app_url}/reset-password?token={token}\n\nThe link works once, until {expires_at}. "
               "If it wasn't you, ignore this email; your password stays the same."),
    },
    "order_confirmed": {
        "kk": ("{event_title}: билеттеріңіз дайын",
               "{event_title} іс-шарасына №{order_id} тапсырысыңыз расталды.\n\n"
               "Билеттеріңіз бен олардың QR-кодтары осында:\n{app_url}/orders/{order_id}\n\nІс-шарада кездескенше!"),
        "ru": ("Ваши билеты на {event_title}",
               "Ваш заказ №{order_id} на {event_title} подтверждён.\n\n"
               "Билеты и их QR-коды здесь:\n{app_url}/orders/{order_id}\n\nДо встречи на мероприятии!"),
        "en": ("Your tickets for {event_title}",
               "Your order #{order_id} for {event_title} is confirmed.\n\n"
               "Your tickets and their QR codes are here:\n{app_url}/orders/{order_id}\n\nSee you at the event!"),
    },
    "payment_failed": {
        "kk": ("{event_title}: төлем өтпеді",
               "№{order_id} тапсырыс ({event_title}) бойынша {amount} теңге төлем өтпеді. "
               "Бұл демонстрациялық (симуляцияланған) төлем, нақты ақша алынған жоқ.\n\n"
               "Билеттер брондалып тұрғанда қайта көріңіз:\n{app_url}/orders/{order_id}"),
        "ru": ("Платёж не прошёл: {event_title}",
               "Платёж {amount} тенге по заказу №{order_id} ({event_title}) не прошёл. "
               "Это демонстрационный (симулированный) платёж, реальные деньги не списывались.\n\n"
               "Попробуйте ещё раз, пока билеты забронированы:\n{app_url}/orders/{order_id}"),
        "en": ("Payment failed for {event_title}",
               "The payment of {amount} KZT for order #{order_id} ({event_title}) didn't go through. "
               "This is a simulated demo payment; no real money was charged.\n\n"
               "You can try again while your tickets are on hold:\n{app_url}/orders/{order_id}"),
    },
    "order_cancelled": {
        "kk": ("№{order_id} тапсырыс жойылды",
               "{event_title} іс-шарасына №{order_id} тапсырысыңыз жойылды.\nСебебі: {reason}\n\n"
               "Оның билеттері енді жарамсыз."),
        "ru": ("Заказ №{order_id} отменён",
               "Ваш заказ №{order_id} на {event_title} отменён.\nПричина: {reason}\n\n"
               "Его билеты больше не действительны."),
        "en": ("Order #{order_id} was cancelled",
               "Your order #{order_id} for {event_title} was cancelled.\nReason: {reason}\n\n"
               "Its tickets no longer admit anyone."),
    },
    "order_refunded": {
        "kk": ("{event_title}: ақша қайтарылды",
               "{event_title} іс-шарасына №{order_id} тапсырыс бойынша {amount} теңге қайтарылды "
               "(демонстрациялық қайтарым).\nСебебі: {reason}\n\nОның билеттері енді жарамсыз."),
        "ru": ("Возврат за {event_title}",
               "По заказу №{order_id} на {event_title} оформлен возврат {amount} тенге "
               "(демонстрационный возврат).\nПричина: {reason}\n\nЕго билеты больше не действительны."),
        "en": ("Refund for {event_title}",
               "Order #{order_id} for {event_title} was refunded: {amount} KZT (simulated demo refund).\n"
               "Reason: {reason}\n\nIts tickets no longer admit anyone."),
    },
    "event_updated": {
        "kk": ("{event_title}: өзгерістер бар",
               "Ұйымдастырушы {event_title} іс-шарасын жаңартты:\n{changes}\n\nІс-шара беті: {app_url}/events/{event_id}"),
        "ru": ("Изменения: {event_title}",
               "Организатор обновил мероприятие {event_title}:\n{changes}\n\n"
               "Страница мероприятия: {app_url}/events/{event_id}"),
        "en": ("{event_title} has changed",
               "The organizer updated {event_title}:\n{changes}\n\nEvent page: {app_url}/events/{event_id}"),
    },
    "event_cancelled": {
        "kk": ("{event_title} өтпейді",
               "Өкінішке қарай, ұйымдастырушы {event_title} іс-шарасын тоқтатты.\n"
               "Төленген тапсырыстар бойынша ақша автоматты түрде қайтарылады (демонстрациялық қайтарым).\n\n"
               "{app_url}/events/{event_id}"),
        "ru": ("{event_title} отменено",
               "К сожалению, организатор отменил мероприятие {event_title}.\n"
               "Деньги за оплаченные заказы возвращаются автоматически (демонстрационный возврат).\n\n"
               "{app_url}/events/{event_id}"),
        "en": ("{event_title} is cancelled",
               "Unfortunately {event_title} has been cancelled by the organizer.\n"
               "Paid orders are refunded automatically (simulated demo refund).\n\n{app_url}/events/{event_id}"),
    },
    "payout_status": {
        "kk": ("{event_title}: төлем мәртебесі",
               "{event_title} бойынша төлем мәртебесі: {status}.\n\n{app_url}/events/{event_id}"),
        "ru": ("Статус выплаты: {event_title}",
               "Статус выплаты по мероприятию {event_title}: {status}.\n\n{app_url}/events/{event_id}"),
        "en": ("Payout update for {event_title}",
               "The payout status for {event_title} is now: {status}.\n\n{app_url}/events/{event_id}"),
    },
    "support_message": {
        "kk": ("Жаңа жауап: {subject}",
               "«{subject}» қолдау өтінішіңізде жаңа жауап бар.\n\n{app_url}/support/{case_id}"),
        "ru": ("Новый ответ: {subject}",
               "В вашем обращении «{subject}» новый ответ.\n\n{app_url}/support/{case_id}"),
        "en": ("New reply: {subject}",
               "There's a new reply in your support case \"{subject}\".\n\n{app_url}/support/{case_id}"),
    },
    "support_case_assigned": {
        "kk": ("Өтініш сізге тағайындалды: {subject}",
               "«{subject}» қолдау өтініші сізге тағайындалды.\n\n{app_url}/support/{case_id}"),
        "ru": ("Обращение назначено вам: {subject}",
               "Обращение «{subject}» назначено вам.\n\n{app_url}/support/{case_id}"),
        "en": ("Support case assigned: {subject}",
               "The support case \"{subject}\" was assigned to you.\n\n{app_url}/support/{case_id}"),
    },
    "support_case_status_changed": {
        "kk": ("Өтініш мәртебесі өзгерді: {subject}",
               "«{subject}» қолдау өтінішіңіздің мәртебесі: {status_kk}.\n\n{app_url}/support/{case_id}"),
        "ru": ("Статус обращения изменён: {subject}",
               "Статус вашего обращения «{subject}»: {status_ru}.\n\n{app_url}/support/{case_id}"),
        "en": ("Support case {status}: {subject}",
               "Your support case \"{subject}\" is now {status}.\n\n{app_url}/support/{case_id}"),
    },
}

# support case statuses, shown in each language
SUPPORT_STATUS = {
    "open": ("ашық", "открыто"),
    "in_progress": ("қаралуда", "в работе"),
    "waiting_for_customer": ("сіздің жауабыңызды күтуде", "ожидает вашего ответа"),
    "resolved": ("шешілді", "решено"),
}


def render_email(template: str, data: dict) -> tuple[str, str]:
    """Returns (subject, body): Kazakh and Russian subjects, all three bodies.
    Raises KeyError if `data` lacks a placeholder the template needs."""
    values = {**data, "app_url": APP_URL}
    if "status" in data:
        values["status_kk"], values["status_ru"] = SUPPORT_STATUS.get(data["status"], (data["status"], data["status"]))
    texts = {language: (subject.format(**values), body.format(**values))
             for language, (subject, body) in TEMPLATES[template].items()}

    subject = f"{texts['kk'][0]} | {texts['ru'][0]}"
    body = DIVIDER.join(texts[language][1] for language in ("kk", "ru", "en"))
    return subject, body
