import re

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Organization, Site, User

ORG_NAME = "Lagos Community Sensor Network"
DEMO_PASSWORD = "envirowatch-demo"

USERS = [
    ("admin@envirowatch.test", "admin"),
    ("operator@envirowatch.test", "operator"),
]

# (name, latitude, longitude): copied from the frontend's src/mocks/sim/world.ts
SITE_TABLE = [
    ("Yaba", 6.5095, 3.3711), ("Yaba North", 6.52, 3.379), ("Akoka", 6.525, 3.388),
    ("Bariga", 6.54, 3.385), ("Ebute Metta", 6.485, 3.38), ("Costain", 6.49, 3.365),
    ("Surulere", 6.5, 3.35), ("Mushin", 6.53, 3.35), ("Palmgrove", 6.545, 3.365),
    ("Ilupeju", 6.555, 3.36), ("Oshodi", 6.555, 3.343), ("Isolo", 6.53, 3.32),
    ("Ejigbo", 6.55, 3.3), ("Ikotun", 6.55, 3.27), ("Egbeda", 6.59, 3.285),
    ("Alimosho", 6.61, 3.29), ("Agege", 6.615, 3.32), ("Ogba", 6.625, 3.34),
    ("Ikeja", 6.6018, 3.3515), ("Ikeja GRA", 6.58, 3.355), ("Maryland", 6.57, 3.367),
    ("Ojota", 6.584, 3.379), ("Ogudu", 6.58, 3.395), ("Ketu", 6.597, 3.39),
    ("Magodo", 6.615, 3.38), ("Ojodu", 6.642, 3.37), ("Isheri", 6.63, 3.4),
    ("Gbagada", 6.555, 3.39), ("Ikorodu", 6.6194, 3.5105), ("Lagos Island", 6.4541, 3.3947),
    ("Ikoyi", 6.455, 3.435), ("Victoria Island", 6.428, 3.421), ("Oniru", 6.432, 3.45),
    ("Lekki Phase 1", 6.4474, 3.472), ("Ikota", 6.445, 3.55), ("Ajah", 6.4667, 3.5667),
    ("Sangotedo", 6.47, 3.63), ("Ijora", 6.47, 3.365), ("Apapa GRA", 6.449, 3.359),
    ("Apapa Port", 6.443, 3.365), ("Amuwo Odofin", 6.46, 3.3), ("Festac", 6.467, 3.283),
    ("Satellite Town", 6.45, 3.27), ("Badagry Road", 6.465, 3.23), ("Ojo", 6.46, 3.18),
    ("Iganmu", 6.478, 3.372),
]


def site_id(name: str) -> str:
    # the same rule the frontend uses: site-<lowercase name, spaces to hyphens>
    return "site-" + re.sub(r"\s+", "-", name.lower())


def seed() -> None:
    with SessionLocal() as db:
        org = db.scalar(select(Organization).where(Organization.name == ORG_NAME))
        if org is None:
            org = Organization(name=ORG_NAME)
            db.add(org)
            db.flush()

        existing_users = set(db.scalars(select(User.email)))
        for email, role in USERS:
            if email not in existing_users:
                db.add(User(organization_id=org.id, email=email,
                            password_hash=hash_password(DEMO_PASSWORD), role=role))

        existing_sites = set(db.scalars(select(Site.id)))
        for name, lat, lon in SITE_TABLE:
            sid = site_id(name)
            if sid not in existing_sites:
                db.add(Site(id=sid, organization_id=org.id, name=name, latitude=lat, longitude=lon))
                existing_sites.add(sid)

        db.commit()
        print(f"Seed complete: {len(SITE_TABLE)} sites, {len(USERS)} users.")


if __name__ == "__main__":
    seed()
