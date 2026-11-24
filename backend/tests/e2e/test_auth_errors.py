"""Every error uses one body: {"error", "message", "fields"}, including 401/403 from auth and FastAPI's own 404/405."""
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from jose import jwt
from sqlalchemy import text
from helpers import E2E, BASE, engine
from security import SECRET_KEY, ALGORITHM, create_access_token


def raw_request(method: str, path: str, token: str | None = None):
    """Returns (status, headers, parsed body or the raw text if it isn't JSON)."""
    request = urllib.request.Request(BASE + path, method=method)
    if token is not None:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, headers, raw = response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        status, headers, raw = error.code, error.headers, error.read()
    try:
        return status, headers, json.loads(raw)
    except ValueError:
        return status, headers, raw.decode(errors="replace")


def is_unified(body) -> bool:
    return isinstance(body, dict) and set(body) == {"error", "message", "fields"} and bool(body["message"])


def main() -> bool:
    with E2E("auth errors") as t:
        def expect(name, method, path, token, status, error):
            s, headers, body = raw_request(method, path, token)
            ok = s == status and is_unified(body) and body["error"] == error
            t.check(name, ok, f"{s} {body}"[:90])
            return headers

        # 401: who are you?
        headers = expect("no token", "GET", "/orders/me", None, 401, "NotAuthenticatedError")
        t.check("401 says how to authenticate (WWW-Authenticate: Bearer)", headers.get("WWW-Authenticate") == "Bearer")
        expect("garbage token", "GET", "/orders/me", "not-a-jwt", 401, "InvalidTokenError")

        expired = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}, SECRET_KEY, ALGORITHM)
        expect("expired token", "GET", "/orders/me", expired, 401, "InvalidTokenError")
        forged = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, "wrong-key", ALGORITHM)
        expect("token signed with another key", "GET", "/orders/me", forged, 401, "InvalidTokenError")
        no_sub = jwt.encode({"exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, SECRET_KEY, ALGORITHM)
        expect("token without a user id", "GET", "/orders/me", no_sub, 401, "InvalidTokenError")
        bad_sub = jwt.encode({"sub": "abc", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, SECRET_KEY, ALGORITHM)
        expect("token with a non-numeric user id", "GET", "/orders/me", bad_sub, 401, "InvalidTokenError")

        user, email = t.new_user()
        user_id = t.db_value("select id from users where email = :e", e=email)
        s, _ = t.call("GET", "/orders/me", token=user)
        t.check("a valid token still works", s == 200, f"status {s}")
        with engine.begin() as c:
            c.execute(text("delete from users where id = :id"), {"id": user_id})
        expect("token of a deleted user is 401, not 404", "GET", "/orders/me", create_access_token(user_id), 401, "InvalidTokenError")

        # 403: you're known, but not allowed
        attendee, _ = t.new_user()
        expect("non-admin on an admin endpoint", "GET", "/admin/settings", attendee, 403, "PlatformAdminRequiredError")
        admin, _ = t.new_user(admin=True)
        s, _ = t.call("GET", "/admin/settings", token=admin)
        t.check("admin still gets in", s == 200, f"status {s}")
        expect("admin endpoint without a token is 401 first", "GET", "/admin/settings", None, 401, "NotAuthenticatedError")

        # FastAPI's own errors use the same body
        expect("unknown URL", "GET", "/no-such-page", None, 404, "NOT_FOUND")
        expect("wrong HTTP method", "DELETE", "/auth/login", None, 405, "METHOD_NOT_ALLOWED")

        # formats that were already right stay the same
        s, body = t.call("POST", "/auth/register", {"email": "not-an-email", "password": "x"})
        t.check("validation errors unchanged (422, fields filled)",
                s == 422 and body["error"] == "VALIDATION_ERROR" and "email" in body["fields"], f"{s}")
        s, body = t.call("GET", "/events/999999999")
        t.check("domain errors unchanged", s == 404 and body["error"] == "EventNotFoundError", f"{s}")
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
