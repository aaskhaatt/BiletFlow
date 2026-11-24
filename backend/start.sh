#!/bin/sh
# Container start command: bring the database schema up to date, then serve the API.
set -e

alembic upgrade head

# One worker on purpose: the expired-checkout sweeper runs inside the server process,
# and every extra worker would start its own copy.
# --proxy-headers: hosts like Render terminate HTTPS in front of us; trust their X-Forwarded-* headers
# so the app sees https:// URLs.
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips "*"
