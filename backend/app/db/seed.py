from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Organization, Site, User

ORG_NAME = "Lagos Environmental Monitoring"
DEMO_PASSWORD = "envirowatch-demo"

USERS = [
    ("admin@envirowatch.test", "admin"),
    ("operator@envirowatch.test", "operator"),
]


SITES = [
    ("Ikeja", 6.6018, 3.3515),
    ("Victoria Island", 6.4281, 3.4219),
    ("Lekki Phase 1", 6.4474, 3.4723),
    ("Yaba", 6.5095, 3.3711),
    ("Surulere", 6.4969, 3.3548),
    ("Apapa", 6.4489, 3.3592),
    ("Ikoyi", 6.4549, 3.4246),
    ("Maryland", 6.5667, 3.3667),
    ("Ajah", 6.4698, 3.5852),
    ("Oshodi", 6.5569, 3.3489),
    ("Ikorodu", 6.6194, 3.5105),
    ("Badagry", 6.4150, 2.8800),
]


def seed() -> None:
    with SessionLocal() as db:
        org = db.scalar(select(Organization).where(Organization.name == ORG_NAME))
        if org is None:
            org = Organization(name=ORG_NAME)
            db.add(org)
            db.flush()  # assigns org.id without committing yet

        for email, role in USERS:
            if db.scalar(select(User).where(User.email == email)) is None:
                db.add(
                    User(
                        organization_id=org.id,
                        email=email,
                        password_hash=hash_password(DEMO_PASSWORD),
                        role=role,
                    )
                )

        for name, lat, lon in SITES:
            exists = db.scalar(
                select(Site).where(Site.organization_id == org.id, Site.name == name)
            )
            if exists is None:
                db.add(Site(organization_id=org.id, name=name, latitude=lat, longitude=lon))

        db.commit()
        print("Seed complete.")


if __name__ == "__main__":
    seed()