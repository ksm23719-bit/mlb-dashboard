"""
Statcast 데이터 로드 → mlb.duckdb
- 첫 실행: 시즌 시작(SEASON_START)부터 전체 로드
- 이후: 마지막 날짜 기준 증분 로드 (3일 overlap으로 늦은 데이터 보정)
실행: python -m etl.statcast_load
"""
import duckdb
import pandas as pd
import pybaseball
from datetime import date, timedelta
from etl.config import DB_PATH
from etl.notify import send_telegram

pybaseball.cache.enable()

SEASON_START = date(2026, 3, 18)   # 2026 MLB 시즌 개막일
CHUNK_DAYS   = 7                   # 한 번에 가져올 최대 일수
OVERLAP_DAYS = 3                   # 증분 로드 시 중복 기간 (늦은 데이터 보정)


def _fix_types(df: pd.DataFrame) -> pd.DataFrame:
    for c in ["game_pk", "at_bat_number", "pitch_number"]:
        if c in df.columns:
            df[c] = df[c].astype("Int64")
    return df


def _fetch_range(start: date, end: date) -> pd.DataFrame | None:
    """date 범위를 CHUNK_DAYS씩 나눠 가져와 합친다."""
    chunks = []
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=CHUNK_DAYS - 1), end)
        print(f"    fetching {cur} ~ {chunk_end}...", flush=True)
        df = pybaseball.statcast(
            start_dt=str(cur), end_dt=str(chunk_end), verbose=False
        )
        if df is not None and not df.empty:
            chunks.append(_fix_types(df))
        cur = chunk_end + timedelta(days=1)

    if not chunks:
        return None
    return pd.concat(chunks, ignore_index=True)


def _upsert(con: duckdb.DuckDBPyConnection, df: pd.DataFrame) -> int:
    """로드한 날짜 범위의 기존 행 삭제 후 재삽입 (idempotent)."""
    loaded_dates = (
        df["game_date"].dropna().astype(str).str[:10].unique().tolist()
    )
    date_list = ", ".join(f"'{d}'" for d in loaded_dates)
    con.execute(
        f"DELETE FROM statcast_pitches WHERE game_date::DATE::TEXT IN ({date_list})"
    )
    con.execute("INSERT INTO statcast_pitches SELECT * FROM df")
    return con.execute("SELECT COUNT(*) FROM statcast_pitches").fetchone()[0]


def load_smart(force_full: bool = False) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH))

    yesterday = date.today() - timedelta(days=1)

    # 테이블 존재 여부 확인
    tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
    table_exists = "statcast_pitches" in tables
    row_count = 0
    max_date = None

    if table_exists:
        row_count = con.execute("SELECT COUNT(*) FROM statcast_pitches").fetchone()[0]
        result = con.execute("SELECT MAX(game_date)::TEXT FROM statcast_pitches").fetchone()[0]
        max_date = date.fromisoformat(result) if result else None

    if force_full or not table_exists or row_count == 0 or max_date is None:
        # ── 첫 실행: 시즌 전체 로드 ──────────────────────────────
        print(f"  [초기 로드] {SEASON_START} ~ {yesterday} 시즌 전체 로드 시작...")
        df = _fetch_range(SEASON_START, yesterday)
        if df is None:
            print("  No data.")
            con.close()
            return
        con.execute("DROP TABLE IF EXISTS statcast_pitches")
        con.execute("CREATE TABLE statcast_pitches AS SELECT * FROM df")
        total = con.execute("SELECT COUNT(*) FROM statcast_pitches").fetchone()[0]
        print(f"  초기 로드 완료: {total:,}행")
    else:
        # ── 증분 로드: (max_date - OVERLAP) ~ yesterday ──────────
        inc_start = max_date - timedelta(days=OVERLAP_DAYS)
        if inc_start > yesterday:
            print(f"  이미 최신 상태 ({max_date}). 스킵.")
            con.close()
            return
        print(f"  [증분 로드] {inc_start} ~ {yesterday} (기존 최신: {max_date})")
        df = _fetch_range(inc_start, yesterday)
        if df is None:
            print("  No new data.")
            con.close()
            return
        total = _upsert(con, df)
        print(f"  증분 로드 완료. 총 {total:,}행")

    con.close()


if __name__ == "__main__":
    import sys
    force = "--full" in sys.argv
    try:
        print(f"Statcast 스마트 로드 시작{'(강제 전체)' if force else ''}...")
        load_smart(force_full=force)
        send_telegram("✅ Statcast 로드 완료")
    except Exception as e:
        send_telegram(f"❌ Statcast 로드 실패: {e}")
        raise
