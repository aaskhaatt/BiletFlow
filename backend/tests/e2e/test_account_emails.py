"""Feature 7: email verification and password reset (SRS 4.1).

Links carry a one-use, expiring token; the database keeps only its SHA-256 hash. The tests read the
plain token from the queued email in email_outbox, which is what the user would click.
"""
import hashlib
import secrets
import sys
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import text
from helpers import E2E, engine


def main() -> bool:
    with E2E("account emails") as t:
        def outbox(email, template):
            return t.db_rows("select * from email_outbox where to_email = :e and template = :t order by id",
                             e=email, t=template)

        def latest_token(email, template):
            return outbox(email, template)[-1].data["token"]

        def register(password="first-password"):
            email = f"e2e-{secrets.token_hex(4)}@example.com"
            t.emails.append(email)
            status, body = t.call("POST", "/auth/register", {"email": email, "password": password})
            return status, body, email

        def login(email, password):
            return t.call("POST", "/auth/login", {"email": email, "password": password})

        # 1. registering queues a verification email; only the token's hash is stored
        status, body, email = register()
        t.check("register still answers 201", status == 201, status)
        t.check("new account is not verified yet", body.get("email_verified_at") is None, body)
        mails = outbox(email, "verify_email")
        t.check("one verification email is queued", len(mails) == 1, f"{len(mails)} queued")
        token = mails[0].data["token"]
        stored = t.db_rows("select token_hash from account_tokens where user_id = :u", u=body["id"])
        t.check("database keeps only the SHA-256 hash",
                [r.token_hash for r in stored] == [hashlib.sha256(token.encode()).hexdigest()])

        t.call("POST", "/auth/register", {"email": email, "password": "first-password"})
        t.check("duplicate registration queues no second email", len(outbox(email, "verify_email")) == 1)

        # 2. verifying
        status, body = t.call("POST", "/auth/verify-email", {"token": "not-a-real-token"})
        t.check("unknown token: 400 InvalidAccountTokenError",
                status == 400 and body["error"] == "InvalidAccountTokenError", status)
        status, body = t.call("POST", "/auth/verify-email", {"token": token})
        t.check("right token verifies the email", status == 200, status)
        t.check("email_verified_at is set",
                t.db_value("select email_verified_at is not null from users where email = :e", e=email))
        status, _ = t.call("POST", "/auth/verify-email", {"token": token})
        t.check("the same link works only once", status == 400, status)

        # 3. resending
        _, tokens = login(email, "first-password")
        status, body = t.call("POST", "/auth/resend-verification", token=tokens["access_token"])
        t.check("resend for a verified account: 409", status == 409 and body["error"] == "EmailAlreadyVerifiedError",
                status)
        status, _ = t.call("POST", "/auth/resend-verification")
        t.check("resend without signing in: 401", status == 401, status)

        _, _, email2 = register()
        _, tokens2 = login(email2, "first-password")
        old = latest_token(email2, "verify_email")
        status, _ = t.call("POST", "/auth/resend-verification", token=tokens2["access_token"])
        new = latest_token(email2, "verify_email")
        t.check("resend queues a new email with a new token", status == 200 and new != old, status)
        status, _ = t.call("POST", "/auth/verify-email", {"token": old})
        t.check("resending invalidates the old link", status == 400, status)

        # 4. expired links are refused
        with engine.begin() as c:
            c.execute(text("update account_tokens set expires_at = now() - interval '1 minute' "
                           "where user_id = (select id from users where email = :e)"), {"e": email2})
        status, _ = t.call("POST", "/auth/verify-email", {"token": new})
        t.check("expired link: 400", status == 400, status)

        # 5. forgot password never reveals whether the account exists
        unknown = f"e2e-nobody-{secrets.token_hex(4)}@example.com"
        s1, b1 = t.call("POST", "/auth/forgot-password", {"email": unknown})
        s2, b2 = t.call("POST", "/auth/forgot-password", {"email": email})
        t.check("same 200 answer for unknown and known emails", s1 == s2 == 200 and b1 == b2, f"{s1} {s2}")
        t.check("no email for an unknown address", t.db_value(
            "select count(*) from email_outbox where to_email = :e", e=unknown) == 0)
        t.check("reset email queued for the real account", len(outbox(email, "password_reset")) == 1)

        first_reset = latest_token(email, "password_reset")
        t.call("POST", "/auth/forgot-password", {"email": email})
        reset = latest_token(email, "password_reset")
        status, _ = t.call("POST", "/auth/reset-password", {"token": first_reset, "new_password": "second-password"})
        t.check("a newer request invalidates the older link", status == 400, status)

        # 6. links are tied to their purpose
        status, _ = t.call("POST", "/auth/verify-email", {"token": reset})
        t.check("a reset link can't verify an email", status == 400, status)
        status, _ = t.call("POST", "/auth/reset-password", {"token": reset, "new_password": "123"})
        t.check("too short new password: 422", status == 422, status)

        # 7. resetting: new password works, old one and every session stop working
        _, session = login(email, "first-password")
        status, _ = t.call("POST", "/auth/reset-password", {"token": reset, "new_password": "second-password"})
        t.check("reset with a valid link: 200", status == 200, status)
        status, _ = login(email, "first-password")
        t.check("old password no longer works", status == 401, status)
        status, _ = login(email, "second-password")
        t.check("new password works", status == 200, status)
        status, _ = t.call("POST", "/auth/refresh", {"refresh_token": session["refresh_token"]})
        t.check("sessions from before the reset are signed out", status == 401, status)
        status, _ = t.call("POST", "/auth/reset-password", {"token": reset, "new_password": "third-password"})
        t.check("the reset link works only once", status == 400, status)

        # 8. two clicks at the same moment: exactly one wins
        t.call("POST", "/auth/forgot-password", {"email": email2})
        race = latest_token(email2, "password_reset")
        with ThreadPoolExecutor(8) as pool:
            statuses = list(pool.map(lambda i: t.call("POST", "/auth/reset-password",
                                                      {"token": race, "new_password": f"race-password-{i}"})[0],
                                     range(8)))
        t.check("8 parallel resets with one link: exactly one 200", statuses.count(200) == 1, sorted(statuses))
        t.check("a password reset also verifies the email (the link proved ownership)",
                t.db_value("select email_verified_at is not null from users where email = :e", e=email2))
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
