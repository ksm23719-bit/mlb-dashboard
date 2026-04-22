"""
Statcast 데이터 로드 → mlb.duckdb
실행: python -m etl.statcast_load
"""
import duckdb
import pybaseball
from datetime import date, timedelta
from etl.config import DB_PATH
from etl.notify import send_telegram

pybaseball.cache.enable()


def load_recent(days: int = 7) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH))

    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)

    print(f"  Fetching Statcast {start} ~ {end}...", flush=True)
    df = pybaseball.statcast(start_dt=str(start), end_dt=str(end), verbose=False)

    if df is None or df.empty:
        print("  No data.")
        con.close()
        return

    for c in ["game_pk", "at_bat_number", "pitch_number"]:
        if c in df.columns:
            df[c] = df[c].astype("Int64")

    con.execute("DROP TABLE IF EXISTS statcast_pitches")
    con.execute("CREATE TABLE statcast_pitches AS SELECT * FROM df")
    count = con.execute("SELECT COUNT(*) FROM statcast_pitches").fetchone()[0]
    con.close()
    print(f"\n  {count:,}행 저장 완료 → {DB_PATH}")


if __name__ == "__main__":
    try:
        print("Statcast 로드 시작 (최근 7일)...")
        load_recent(days=7)
        send_telegram("✅ Statcast 로드 완료")
    except Exception as e:
        send_telegram(f"❌ Statcast 로드 실패: {e}")
        raise
