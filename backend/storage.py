"""File storage for event images, over the S3 protocol.

Locally this is the RustFS container from docker-compose.yml. Any S3-compatible service works
(AWS S3, Cloudflare R2, ...) by changing the S3_* settings, because the code only speaks S3 through boto3.

Files are public: anyone with the URL can download them, and nobody can list the bucket.
Every upload gets a new random name, so URLs can't be guessed and a cached old image never shows up
after a replacement.
"""
import json
import logging
import os
import threading

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

from exceptions import InvalidImageError, StorageNotConfiguredError, StorageUnavailableError

load_dotenv()
logger = logging.getLogger(__name__)

# all optional: without them the API runs normally, only image uploads answer 503
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")          # how the API reaches storage, e.g. http://localhost:9000
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY")
S3_BUCKET = os.getenv("S3_BUCKET", "biletflow-images")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
# how browsers and phones reach the files; differs from S3_ENDPOINT_URL inside Docker or behind a CDN
S3_PUBLIC_URL = (os.getenv("S3_PUBLIC_URL") or f"{S3_ENDPOINT_URL}/{S3_BUCKET}").rstrip("/")

MAX_IMAGE_BYTES = 5 * 1024 * 1024

_client = None
_bucket_ready = False
_lock = threading.Lock()


def storage_configured() -> bool:
    return bool(S3_ENDPOINT_URL and S3_ACCESS_KEY and S3_SECRET_KEY)


def public_url(key: str | None) -> str | None:
    if key is None or not storage_configured():
        return None
    return f"{S3_PUBLIC_URL}/{key}"


def detect_image_type(data: bytes) -> tuple[str, str]:
    """Returns (content type, file extension), judged by the file's first bytes.

    The browser's Content-Type and the file name are chosen by the client, so they're never trusted.
    SVG is not accepted: it can contain JavaScript."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    raise InvalidImageError()


def _get_client():
    global _client
    if not storage_configured():
        raise StorageNotConfiguredError()
    if _client is None:
        _client = boto3.client(
            "s3", endpoint_url=S3_ENDPOINT_URL, aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY, region_name=S3_REGION,
            # path style: http://host/bucket/key, which local S3 servers expect;
            # short timeouts so a stopped storage server fails the request quickly instead of hanging it
            config=Config(s3={"addressing_style": "path"}, signature_version="s3v4",
                          connect_timeout=3, read_timeout=10, retries={"max_attempts": 2}),
        )
    return _client


def _ensure_bucket(client):
    # creates the bucket and makes its files publicly readable, once per process
    global _bucket_ready
    if _bucket_ready:
        return
    with _lock:
        if _bucket_ready:
            return
        try:
            client.head_bucket(Bucket=S3_BUCKET)
        except ClientError:
            client.create_bucket(Bucket=S3_BUCKET)
        policy = {"Version": "2012-10-17", "Statement": [{
            "Effect": "Allow", "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],  # download only: listing the bucket stays forbidden
            "Resource": [f"arn:aws:s3:::{S3_BUCKET}/*"]}]}
        try:
            client.put_bucket_policy(Bucket=S3_BUCKET, Policy=json.dumps(policy))
        except ClientError:
            # some providers (e.g. Cloudflare R2) set public access in their dashboard instead
            logger.warning("could not set a public-read policy on bucket %s", S3_BUCKET, exc_info=True)
        _bucket_ready = True


def upload_file(key: str, data: bytes, content_type: str):
    client = _get_client()
    try:
        _ensure_bucket(client)
        client.put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type,
                          # a key is never reused, so browsers may cache the file forever
                          CacheControl="public, max-age=31536000, immutable")
    except (BotoCoreError, ClientError) as error:
        logger.error("upload of %s failed: %s", key, error)
        raise StorageUnavailableError() from error


def delete_file(key: str | None):
    # best effort: the database change has already happened, so a failure only leaves an unused file behind
    if key is None or not storage_configured():
        return
    try:
        _get_client().delete_object(Bucket=S3_BUCKET, Key=key)
    except (BotoCoreError, ClientError):
        logger.warning("could not delete %s", key, exc_info=True)


def copy_file(source_key: str, new_key: str) -> bool:
    """Copies a file inside storage (no download). Returns False instead of raising: a duplicated event
    is still useful without its image, so a storage problem must not stop the copy."""
    if not storage_configured():
        return False
    try:
        client = _get_client()
        client.copy_object(Bucket=S3_BUCKET, Key=new_key, CopySource={"Bucket": S3_BUCKET, "Key": source_key},
                           CacheControl="public, max-age=31536000, immutable", MetadataDirective="COPY")
        return True
    except (BotoCoreError, ClientError, StorageNotConfiguredError):
        logger.warning("could not copy %s to %s", source_key, new_key, exc_info=True)
        return False
