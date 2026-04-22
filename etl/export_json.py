"""
DuckDB → JSON 파일 생성 → R2 업로드
"""
import json
import boto3
from botocore.config import Config
from datetime import date
import duckdb
from etl.config import (
    DB_PATH, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT, R2_BUCKET,
)

KOREAN_PLAYERS = [
    {"mlb_id": 673490, "name_kr": "김하성", "name_en": "Ha-Seong Kim", "pos": "SS"},
    {"mlb_id": 808975, "name_kr": "김혜성", "name_en": "Hyeseong Kim", "pos": "2B"},
    {"mlb_id": 808982, "name_kr": "이정후", "name_en": "Jung Hoo Lee", "pos": "CF"},
]


def _s3():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _upload_json(s3, key: str, data: object) -> None:
    body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
    s3.put_object(Bucket=R2_BUCKET, Key=key, Body=body, ContentType="application/json")
    print(f"  → R2:{key} 업로드 완료")


def _date_range(con: duckdb.DuckDBPyConnection) -> dict:
    r = con.execute(
        "SELECT MIN(game_date)::TEXT, MAX(game_date)::TEXT FROM statcast_pitches"
    ).fetchone()
    return {"start": r[0], "end": r[1]}


# ── 1. 한국 선수 상세 ────────────────────────────────────────────
def export_korean_players(con: duckdb.DuckDBPyConnection, s3) -> None:
    dr = _date_range(con)
    players_out = []

    for p in KOREAN_PLAYERS:
        mid = p["mlb_id"]
        stats = con.execute(f"""
            SELECT
                COUNT(*) AS pa,
                COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run')) AS hits,
                ROUND(AVG(launch_speed), 1),
                ROUND(MAX(launch_speed), 1),
                ROUND(AVG(estimated_woba_using_speedangle)
                      FILTER (WHERE estimated_woba_using_speedangle IS NOT NULL), 3)
            FROM statcast_pitches
            WHERE batter = {mid} AND events IS NOT NULL
        """).fetchone()

        rows = con.execute(f"""
            SELECT game_date::TEXT, events,
                   ROUND(launch_speed,1), launch_angle,
                   ROUND(estimated_woba_using_speedangle,3), player_name
            FROM statcast_pitches
            WHERE batter = {mid} AND events IS NOT NULL
            ORDER BY game_date DESC, at_bat_number DESC
            LIMIT 15
        """).fetchall()

        cols = ["game_date", "events", "launch_speed", "launch_angle", "xwoba", "pitcher"]
        players_out.append({
            **p,
            "stats": {"pa": stats[0], "hits": stats[1],
                      "avg_ev": stats[2], "max_ev": stats[3], "xwoba": stats[4]},
            "at_bats": [dict(zip(cols, r)) for r in rows],
        })

    _upload_json(s3, "data/korean_players.json", {
        "updated_at": str(date.today()), "date_range": dr, "players": players_out,
    })


# ── 2. MLB 전체 타자 리더보드 ────────────────────────────────────
def export_leaderboard(con: duckdb.DuckDBPyConnection, s3) -> None:
    dr = _date_range(con)

    rows = con.execute("""
        SELECT
            batter,
            ANY_VALUE(stand) AS stand,
            COUNT(*) AS pa,
            COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run')) AS hits,
            COUNT(*) FILTER (WHERE events = 'home_run') AS hr,
            COUNT(*) FILTER (WHERE events = 'strikeout') AS so,
            COUNT(*) FILTER (WHERE events IN ('walk','intent_walk')) AS bb,
            ROUND(AVG(launch_speed) FILTER (WHERE launch_speed IS NOT NULL), 1) AS avg_ev,
            ROUND(MAX(launch_speed), 1) AS max_ev,
            ROUND(AVG(launch_angle) FILTER (WHERE launch_angle IS NOT NULL), 1) AS avg_la,
            ROUND(AVG(estimated_woba_using_speedangle)
                  FILTER (WHERE estimated_woba_using_speedangle IS NOT NULL), 3) AS xwoba,
            ROUND(AVG(estimated_ba_using_speedangle)
                  FILTER (WHERE estimated_ba_using_speedangle IS NOT NULL), 3) AS xba
        FROM statcast_pitches
        WHERE events IS NOT NULL
        GROUP BY batter
        HAVING COUNT(*) >= 5
        ORDER BY xwoba DESC NULLS LAST
        LIMIT 200
    """).fetchall()

    cols = ["mlb_id", "stand", "pa", "hits", "hr", "so", "bb",
            "avg_ev", "max_ev", "avg_la", "xwoba", "xba"]
    players = [dict(zip(cols, r)) for r in rows]

    # 선수 이름 매핑 (player_name은 투수명이므로 별도 조회)
    # batter ID → 투수로서 등장한 이름은 없으므로 MLB API 대신 crosswalk 활용
    # crosswalk에 없는 선수는 ID만 표시 (프론트에서 API로 보완)
    cw_rows = con.execute(
        "SELECT mlb_id, name_en, name_kr FROM player_crosswalk"
    ).fetchall()
    cw = {r[0]: {"name_en": r[1], "name_kr": r[2]} for r in cw_rows}

    for p in players:
        info = cw.get(p["mlb_id"], {})
        p["name_en"] = info.get("name_en", "")
        p["name_kr"] = info.get("name_kr", "")
        p["avg"] = round(p["hits"] / p["pa"], 3) if p["pa"] > 0 else None

    _upload_json(s3, "data/leaderboard.json", {
        "updated_at": str(date.today()), "date_range": dr,
        "min_pa": 5, "players": players,
    })


# ── 3. 타구 이벤트 전체 (스크리너용) ────────────────────────────
def export_batted_balls(con: duckdb.DuckDBPyConnection, s3) -> None:
    dr = _date_range(con)

    rows = con.execute("""
        SELECT
            batter,
            game_date::TEXT,
            events,
            ROUND(launch_speed, 1) AS launch_speed,
            launch_angle,
            ROUND(estimated_woba_using_speedangle, 3) AS xwoba,
            hit_distance_sc,
            bb_type,
            home_team,
            away_team,
            player_name AS pitcher
        FROM statcast_pitches
        WHERE launch_speed IS NOT NULL
          AND launch_speed >= 95
        ORDER BY launch_speed DESC
        LIMIT 500
    """).fetchall()

    cols = ["mlb_id", "game_date", "events", "launch_speed", "launch_angle",
            "xwoba", "distance", "bb_type", "home_team", "away_team", "pitcher"]

    _upload_json(s3, "data/hard_hit.json", {
        "updated_at": str(date.today()), "date_range": dr,
        "description": "타구속도 95mph 이상 타구",
        "balls": [dict(zip(cols, r)) for r in rows],
    })


# ── 메인 ────────────────────────────────────────────────────────
def export_all() -> None:
    print("  JSON 익스포트 시작...")
    con = duckdb.connect(str(DB_PATH), read_only=True)
    s3 = _s3()

    export_korean_players(con, s3)
    export_leaderboard(con, s3)
    export_batted_balls(con, s3)

    con.close()
    print("  JSON 익스포트 완료 (korean_players / leaderboard / hard_hit)")


if __name__ == "__main__":
    export_all()
