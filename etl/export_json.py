"""
DuckDB → JSON 파일 생성 → R2 업로드
브라우저가 duckdb-wasm 없이 직접 소비하는 데이터
"""
import json
import boto3
from botocore.config import Config
from datetime import date
import duckdb
from etl.config import (
    DB_PATH, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT, R2_BUCKET, R2_PUBLIC_URL,
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
    s3.put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=body,
        ContentType="application/json",
    )
    print(f"  → R2:{key} 업로드 완료")


def export_korean_players() -> None:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    s3 = _s3()

    date_range = con.execute(
        "SELECT MIN(game_date)::TEXT, MAX(game_date)::TEXT FROM statcast_pitches"
    ).fetchone()

    players_out = []
    for p in KOREAN_PLAYERS:
        mid = p["mlb_id"]

        # 요약 통계
        stats = con.execute(f"""
            SELECT
                COUNT(*) AS pa,
                COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run')) AS hits,
                ROUND(AVG(launch_speed), 1) AS avg_ev,
                ROUND(MAX(launch_speed), 1) AS max_ev,
                ROUND(AVG(estimated_woba_using_speedangle)
                      FILTER (WHERE estimated_woba_using_speedangle IS NOT NULL), 3) AS xwoba
            FROM statcast_pitches
            WHERE batter = {mid} AND events IS NOT NULL
        """).fetchone()

        # 최근 타석 (최대 15개)
        abs_rows = con.execute(f"""
            SELECT
                game_date::TEXT AS game_date,
                events,
                ROUND(launch_speed, 1) AS launch_speed,
                launch_angle,
                ROUND(estimated_woba_using_speedangle, 3) AS xwoba,
                player_name AS pitcher
            FROM statcast_pitches
            WHERE batter = {mid} AND events IS NOT NULL
            ORDER BY game_date DESC, at_bat_number DESC
            LIMIT 15
        """).fetchall()

        cols = ["game_date", "events", "launch_speed", "launch_angle", "xwoba", "pitcher"]
        at_bats = [dict(zip(cols, row)) for row in abs_rows]

        players_out.append({
            **p,
            "stats": {
                "pa": stats[0], "hits": stats[1],
                "avg_ev": stats[2], "max_ev": stats[3], "xwoba": stats[4],
            },
            "at_bats": at_bats,
        })

    payload = {
        "updated_at": str(date.today()),
        "date_range": {"start": date_range[0], "end": date_range[1]},
        "players": players_out,
    }

    _upload_json(s3, "data/korean_players.json", payload)
    con.close()


def export_all() -> None:
    print("  JSON 익스포트 시작...")
    export_korean_players()
    print("  JSON 익스포트 완료")


if __name__ == "__main__":
    export_all()
