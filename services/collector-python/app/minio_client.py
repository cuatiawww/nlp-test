from minio import Minio
from . import config

_client = None


def _get_client():
    global _client
    if _client is None:
        secure = config.MINIO_ENDPOINT.startswith("https://")
        endpoint = config.MINIO_ENDPOINT.replace("https://", "").replace("http://", "")
        _client = Minio(
            endpoint,
            access_key=config.MINIO_ACCESS_KEY,
            secret_key=config.MINIO_SECRET_KEY,
            secure=secure,
        )
    return _client


def ensure_bucket():
    client = _get_client()
    if not client.bucket_exists(config.MINIO_BUCKET):
        client.make_bucket(config.MINIO_BUCKET)


def upload_file(object_name: str, content: bytes, content_type="text/plain") -> str:
    client = _get_client()
    from io import BytesIO
    client.put_object(
        config.MINIO_BUCKET,
        object_name,
        BytesIO(content),
        length=len(content),
        content_type=content_type,
    )
    return f"{config.MINIO_ENDPOINT}/{config.MINIO_BUCKET}/{object_name}"
