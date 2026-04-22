"""
DuckDB 파일을 Cloudflare R2에 업로드
"""
import boto3
from botocore.config import Config
from etl.config import (
    DB_PATH,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT,
    R2_BUCKET,
    R2_PUBLIC_URL,
)

R2_KEY = "mlb.duckdb"


def upload() -> str:
    s3 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    print(f"  Uploading {DB_PATH} → R2:{R2_BUCKET}/{R2_KEY}...", flush=True)
    s3.upload_file(
        str(DB_PATH),
        R2_BUCKET,
        R2_KEY,
        ExtraArgs={"ContentType": "application/octet-stream"},
    )

    public_url = f"{R2_PUBLIC_URL.rstrip('/')}/{R2_KEY}"
    print(f"  업로드 완료 → {public_url}")
    return public_url


if __name__ == "__main__":
    upload()
