import logging
import time

from sqlalchemy import select
from sqlalchemy.exc import InterfaceError, OperationalError

from app.db.session import SessionLocal
from app.models import SimulationRun, Organization
from app.services.simulation import advance

log = logging.getLogger("simulation")


def cycle():
    with SessionLocal() as db:
        runs = db.execute(select(SimulationRun.id, SimulationRun.organization_id).where(SimulationRun.status == "running")).all()
    for run_id, organization_id in runs:
        try:
            with SessionLocal.begin() as db:
                organization = db.scalar(select(Organization).where(Organization.id == organization_id).with_for_update(skip_locked=True))
                if organization is None:
                    continue
                run = db.scalar(select(SimulationRun).where(SimulationRun.id == run_id, SimulationRun.status == "running").with_for_update(skip_locked=True))
                if run:
                    advance(db, run)
        except Exception:
            log.exception("Simulation tick failed for %s", run_id)


def main():
    logging.basicConfig(level=logging.INFO)
    try:
        while True:
            try:
                cycle()
            except (InterfaceError, OperationalError):
                log.warning("Simulation database unavailable; retrying")
                time.sleep(2)
            time.sleep(0.25)
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
