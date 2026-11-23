import argparse
import json
import uuid

from app.db.session import SessionLocal
from app.services.retention import apply_retention


def main():
    parser = argparse.ArgumentParser(description="Summarize expired readings and apply a tenant's retention policy. Dry-run unless --apply is supplied.")
    parser.add_argument("--organization-id", required=True, type=uuid.UUID)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        counts = apply_retention(db, args.organization_id, dry_run=not args.apply)
        print(json.dumps(counts))


if __name__ == "__main__":
    main()
