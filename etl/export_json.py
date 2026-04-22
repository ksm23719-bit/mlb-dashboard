"""
DuckDB → JSON 파일 생성 → R2 업로드
"""
import json
import boto3
import requests
from botocore.config import Config
from datetime import date
import duckdb
from etl.config import (
    DB_PATH, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT, R2_BUCKET,
)


def fetch_player_names(mlb_ids: list[int]) -> dict[int, str]:
    """MLB Stats API로 선수 ID → 이름 매핑 (최대 500명 배치)"""
    if not mlb_ids:
        return {}
    names: dict[int, str] = {}
    batch_size = 200
    for i in range(0, len(mlb_ids), batch_size):
        batch = mlb_ids[i:i + batch_size]
        ids_str = ",".join(str(x) for x in batch)
        resp = requests.get(
            "https://statsapi.mlb.com/api/v1/people",
            params={"personIds": ids_str, "fields": "people,id,fullName"},
            timeout=15,
        )
        for p in resp.json().get("people", []):
            names[p["id"]] = p["fullName"]
    return names

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

    # MLB Stats API로 선수 이름 일괄 조회
    all_ids = [p["mlb_id"] for p in players]
    name_map = fetch_player_names(all_ids)
    print(f"    이름 조회 완료: {len(name_map)}명")

    # 한국 선수 한글 이름 매핑
    cw_rows = con.execute(
        "SELECT mlb_id, name_en, name_kr FROM player_crosswalk"
    ).fetchall()
    cw = {r[0]: {"name_en": r[1], "name_kr": r[2]} for r in cw_rows}

    for p in players:
        p["name_en"] = name_map.get(p["mlb_id"], f"ID:{p['mlb_id']}")
        p["name_kr"] = cw.get(p["mlb_id"], {}).get("name_kr", "")
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
    balls = [dict(zip(cols, r)) for r in rows]

    # 타자 이름 조회
    unique_ids = list({b["mlb_id"] for b in balls})
    name_map = fetch_player_names(unique_ids)
    cw_rows = con.execute("SELECT mlb_id, name_en, name_kr FROM player_crosswalk").fetchall()
    cw = {r[0]: r[2] for r in cw_rows}
    for b in balls:
        b["batter_name"] = name_map.get(b["mlb_id"], f"ID:{b['mlb_id']}")
        b["name_kr"] = cw.get(b["mlb_id"], "")

    _upload_json(s3, "data/hard_hit.json", {
        "updated_at": str(date.today()), "date_range": dr,
        "description": "타구속도 95mph 이상 타구",
        "balls": balls,
    })


# ── 4. 투수 리더보드 ─────────────────────────────────────────────
def export_pitcher_leaderboard(con: duckdb.DuckDBPyConnection, s3) -> None:
    dr = _date_range(con)

    rows = con.execute("""
        SELECT
            pitcher,
            ANY_VALUE(player_name) AS name_en,
            ANY_VALUE(p_throws) AS throws,
            COUNT(*) FILTER (WHERE events IS NOT NULL) AS bf,
            COUNT(*) FILTER (WHERE events = 'strikeout') AS k,
            COUNT(*) FILTER (WHERE events IN ('walk','intent_walk')) AS bb,
            COUNT(*) FILTER (WHERE events = 'home_run') AS hr,
            COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run')) AS hits,
            ROUND(AVG(release_speed) FILTER (WHERE release_speed IS NOT NULL), 1) AS avg_velo,
            ROUND(MAX(release_speed), 1) AS max_velo,
            ROUND(AVG(release_spin_rate) FILTER (WHERE release_spin_rate IS NOT NULL), 0) AS avg_spin,
            ROUND(
                AVG(estimated_woba_using_speedangle)
                FILTER (WHERE estimated_woba_using_speedangle IS NOT NULL), 3
            ) AS xwoba_against,
            COUNT(*) AS total_pitches,
            COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked')) AS whiffs,
            COUNT(*) FILTER (WHERE description LIKE '%swing%' OR description LIKE '%hit%') AS swings
        FROM statcast_pitches
        GROUP BY pitcher
        HAVING COUNT(*) FILTER (WHERE events IS NOT NULL) >= 10
        ORDER BY xwoba_against ASC NULLS LAST
        LIMIT 200
    """).fetchall()

    cols = ["mlb_id", "name_en", "throws", "bf", "k", "bb", "hr", "hits",
            "avg_velo", "max_velo", "avg_spin", "xwoba_against",
            "total_pitches", "whiffs", "swings"]
    pitchers = [dict(zip(cols, r)) for r in rows]

    for p in pitchers:
        p["k_pct"] = round(p["k"] / p["bf"], 3) if p["bf"] > 0 else None
        p["bb_pct"] = round(p["bb"] / p["bf"], 3) if p["bf"] > 0 else None
        p["whiff_pct"] = round(p["whiffs"] / p["swings"], 3) if p.get("swings", 0) > 0 else None
        p["name_kr"] = ""

    # 한국 투수 추가 (현재 없지만 구조 확보)
    cw_rows = con.execute("SELECT mlb_id, name_en, name_kr FROM player_crosswalk").fetchall()
    cw = {r[0]: r[2] for r in cw_rows}
    for p in pitchers:
        p["name_kr"] = cw.get(p["mlb_id"], "")

    _upload_json(s3, "data/pitcher_leaderboard.json", {
        "updated_at": str(date.today()), "date_range": dr,
        "min_bf": 10, "pitchers": pitchers,
    })


# ── 메인 ────────────────────────────────────────────────────────
def export_all() -> None:
    print("  JSON 익스포트 시작...")
    con = duckdb.connect(str(DB_PATH), read_only=True)
    s3 = _s3()

    export_korean_players(con, s3)
    export_leaderboard(con, s3)
    export_batted_balls(con, s3)
    export_pitcher_leaderboard(con, s3)

    con.close()
    print("  JSON 익스포트 완료 (korean_players / leaderboard / hard_hit / pitcher_leaderboard)")


if __name__ == "__main__":
    export_all()
