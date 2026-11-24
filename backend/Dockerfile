FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# .dockerignore keeps .env, .venv and tests out of the image
COPY . .

# don't run the API as root
RUN useradd --create-home --uid 10001 app && chmod +x start.sh
USER app

EXPOSE 8000

# applies migrations, then starts uvicorn on $PORT (hosts like Render set it)
CMD ["./start.sh"]
