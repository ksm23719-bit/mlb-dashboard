"""
한국 선수 최근 타석 조회 (batter MLB ID 기반)
실행: python -m etl.query_korean
"""
import duckdb, sys
from etl.config import DB_PATH

KOREAN_PLAYERS = {
    673490: "김하성 (Ha-Seong Kim)",
    808975: "김혜성 (Hyeseong Kim)",
    808982: "이정후 (Jung Hoo Lee)",
}


def query_player(con: duckdb.DuckDBPyConnection, mlb_id: int, name: str) -> None:
    rows = con.execute(
        """
        SELECT game_date, events, launch_speed, launch_angle,
               estimated_woba_using_speedangle, player_name AS pitcher
        FROM statcast_pitches
        WHERE batter = ? AND events IS NOT NULL
        ORDER BY game_date DESC, at_bat_number DESC
        LIMIT 10
        """,
        [mlb_id],
    ).fetchall()

    out = f"\n{name} (ID:{mlb_id}) — {len(rows)}타석\n"
    sys.stdout.buffer.write(out.encode("utf-8"))

    if not rows:
        sys.stdout.buffer.write("  (해당 기간 데이터 없음)\n".encode("utf-8"))
        return

    header = f"  {'날짜':12} {'결과':22} {'타구속':7} {'발사각':7} {'xwOBA':6} {'투수':20}\n"
    sys.stdout.buffer.write(header.encode("utf-8"))
    sys.stdout.buffer.write(b"  " + b"-" * 80 + b"\n")

    for r in rows:
        dt, ev, spd, ang, xwoba, pitcher = r
        line = (
            f"  {str(dt):12} {str(ev):22} "
            f"{str(spd or '-'):7} {str(ang or '-'):7} "
            f"{str(xwoba or '-'):6} {str(pitcher):20}\n"
        )
        sys.stdout.buffer.write(line.encode("utf-8"))


def main() -> None:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    date_range = con.execute(
        "SELECT MIN(game_date), MAX(game_date) FROM statcast_pitches"
    ).fetchone()
    sys.stdout.buffer.write(
        f"DB 기간: {date_range[0]} ~ {date_range[1]}\n".encode("utf-8")
    )

    for mlb_id, name in KOREAN_PLAYERS.items():
        query_player(con, mlb_id, name)

    con.close()


if __name__ == "__main__":
    main()
