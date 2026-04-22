import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")

R2_ACCESS_KEY_ID     = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_ENDPOINT          = os.environ["R2_ENDPOINT"]
R2_BUCKET            = os.environ["R2_BUCKET"]
R2_PUBLIC_URL        = os.environ["R2_PUBLIC_URL"]

TELEGRAM_BOT_TOKEN   = os.environ["TELEGRAM_BOT_TOKEN"]
TELEGRAM_CHAT_ID     = os.environ["TELEGRAM_CHAT_ID"]

DB_PATH = Path(__file__).parent.parent / "data" / "mlb.duckdb"
