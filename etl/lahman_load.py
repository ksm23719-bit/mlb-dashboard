"""
Day 2: Lahman DB 전체 로드 → mlb.duckdb
pybaseball zip 다운로드 우회 → CSV 직접 로드
실행: python -m etl.lahman_load
"""
import duckdb
import pandas as pd
from etl.config import DB_PATH
from etl.notify import send_telegram

BASE = "https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/main/core"

TABLES = {
    "season_batting":  f"{BASE}/Batting.csv",
    "season_pitching": f"{BASE}/Pitching.csv",
    "season_fielding": f"{BASE}/Fielding.csv",
    "players":         f"{BASE}/People.csv",
    "teams":           f"{BASE}/Teams.csv",
    "salaries":        f"{BASE}/Salaries.csv",
    "awards_players":  f"{BASE}/AwardsPlayers.csv",
    "hall_of_fame":    f"{BASE}/HallOfFame.csv",
}


def load_all() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH))

    for table_name, url in TABLES.items():
        print(f"  Loading {table_name}...", end=" ", flush=True)
        df = pd.read_csv(url)
        con.execute(f"DROP TABLE IF EXISTS {table_name}")
        con.execute(f"CREATE TABLE {table_name} AS SELECT * FROM df")
        count = con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        print(f"{count:,} rows")

    con.close()
    print(f"\nDone → {DB_PATH}")


if __name__ == "__main__":
    try:
        print("Lahman DB 로드 시작...")
        load_all()
        send_telegram("✅ Lahman DB 로드 완료")
    except Exception as e:
        send_telegram(f"❌ Lahman 로드 실패: {e}")
        raise
