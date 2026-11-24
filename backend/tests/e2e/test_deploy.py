"""Shared test server support: /health, CORS from CORS_ORIGINS, and Render-style postgres:// URLs."""
import os
import subprocess
import sys
import urllib.error
import urllib.request
from helpers import E2E, BASE, BACKEND


def preflight(origin: str):
    """The browser's CORS check before a cross-site POST; returns the allowed origin header or None."""
    request = urllib.request.Request(BASE + "/auth/login", method="OPTIONS")
    request.add_header("Origin", origin)
    request.add_header("Access-Control-Request-Method", "POST")
    request.add_header("Access-Control-Request-Headers", "content-type,authorization")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.headers.get("Access-Control-Allow-Origin")
    except urllib.error.HTTPError as error:
        return error.headers.get("Access-Control-Allow-Origin")


def _url_from_dotenv() -> str:
    from dotenv import dotenv_values
    return dotenv_values(BACKEND / ".env")["DATABASE_URL"]


def main() -> bool:
    with E2E("deploy") as t:
        s, body = t.call("GET", "/health")
        t.check("health check answers 200 without login", s == 200, f"status {s}")
        t.check("health check reports the database", body == {"status": "ok", "database": "ok"}, str(body))

        # helpers.E2E starts the server with the default CORS_ORIGINS (the Vite dev server)
        t.check("CORS allows the local web app", preflight("http://localhost:5173") == "http://localhost:5173")
        t.check("CORS refuses other sites", preflight("https://evil.example.com") is None)

        # Render gives "postgres://" URLs; SQLAlchemy 2 only accepts "postgresql://"
        script = "import database; print(database.engine.url.drivername)"
        env = {**os.environ, "DATABASE_URL": "postgres://u:p@db.example.com:5432/biletflow"}
        result = subprocess.run([sys.executable, "-c", script], cwd=BACKEND, env=env, capture_output=True, text=True)
        t.check("postgres:// URLs from the host are accepted", result.stdout.strip() == "postgresql",
                (result.stdout + result.stderr).strip()[-80:])

        # migrations run with the same URL at container start, so they must accept it too
        # ("alembic current" connects; the test database is reached through its real URL with the prefix swapped)
        real_url = os.environ.get("DATABASE_URL") or _url_from_dotenv()
        env = {**os.environ, "DATABASE_URL": real_url.replace("postgresql://", "postgres://", 1)}
        result = subprocess.run([sys.executable, "-m", "alembic", "current"], cwd=BACKEND, env=env,
                                capture_output=True, text=True)
        t.check("migrations accept postgres:// URLs too", result.returncode == 0, result.stderr.strip()[-80:])
    return t.passed


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
