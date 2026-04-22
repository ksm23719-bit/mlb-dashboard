"""
한국 MLB 선수 crosswalk 테이블 생성
실행: python -m etl.build_crosswalk
"""
import duckdb
import requests
import pandas as pd
from etl.config import DB_PATH

KOREAN_PLAYERS = [
    {"mlb_id": 673490, "name_kr": "김하성", "name_en": "Ha-Seong Kim", "pos": "SS"},
    {"mlb_id": 808975, "name_kr": "김혜성", "name_en": "Hyeseong Kim", "pos": "2B"},
    {"mlb_id": 808982, "name_kr": "이정후", "name_en": "Jung Hoo Lee", "pos": "CF"},
]


def fetch_player_info(mlb_id: int) -> dict:
    resp = requests.get(
        f"https://statsapi.mlb.com/api/v1/people/{mlb_id}",
        params={"hydrate": "currentTeam"},
        timeout=10,
    )
    p = resp.json()["people"][0]
    return {
        "current_team": p.get("currentTeam", {}).get("abbreviation", ""),
        "statcast_name": p.get("lastFirstName", ""),
        "active": p.get("active", False),
    }


def build() -> None:
    con = duckdb.connect(str(DB_PATH))

    rows = []
    for p in KOREAN_PLAYERS:
        info = fetch_player_info(p["mlb_id"])
        row = {**p, **info}
        rows.append(row)
        print(f"  {p['name_kr']} → {info['current_team']}, statcast: {info['statcast_name']}")

    df = pd.DataFrame(rows)
    con.execute("DROP TABLE IF EXISTS player_crosswalk")
    con.execute("CREATE TABLE player_crosswalk AS SELECT * FROM df")

    count = con.execute("SELECT COUNT(*) FROM player_crosswalk").fetchone()[0]
    print(f"\n  player_crosswalk {count}행 저장 완료")
    con.close()


if __name__ == "__main__":
    print("player_crosswalk 빌드 시작...")
    build()
