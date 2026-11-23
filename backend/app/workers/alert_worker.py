import asyncio
import logging

from app.workers.alert_loop import alert_loop


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s")
    logging.getLogger("alerts").info("alert worker started (cycle every 15 s)")
    try:
        asyncio.run(alert_loop())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()