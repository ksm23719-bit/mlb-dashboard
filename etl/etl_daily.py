"""
일일 ETL 파이프라인 (GitHub Actions cron 진입점)
실행: python -m etl.etl_daily
"""
import traceback
from etl.statcast_load import load_recent
from etl.build_crosswalk import build as build_crosswalk
from etl.r2_upload import upload
from etl.notify import send_telegram


def run() -> None:
    errors: list[str] = []

    # 1. Statcast 최근 7일 로드
    print("[1/3] Statcast 로드...")
    try:
        load_recent(days=7)
    except Exception as e:
        errors.append(f"Statcast: {e}")
        print(f"  ERROR: {e}")

    # 2. player_crosswalk 갱신 (팀 이적 반영)
    print("[2/3] player_crosswalk 갱신...")
    try:
        build_crosswalk()
    except Exception as e:
        errors.append(f"crosswalk: {e}")
        print(f"  ERROR: {e}")

    # 3. R2 업로드
    print("[3/3] R2 업로드...")
    try:
        upload()
    except Exception as e:
        errors.append(f"R2 upload: {e}")
        print(f"  ERROR: {e}")

    # 결과 알림
    if errors:
        send_telegram("❌ ETL 실패\n" + "\n".join(errors))
        raise RuntimeError("ETL 일부 실패: " + ", ".join(errors))
    else:
        send_telegram("✅ ETL 완료 (Statcast + crosswalk + R2)")
        print("\nETL 전체 완료.")


if __name__ == "__main__":
    run()
