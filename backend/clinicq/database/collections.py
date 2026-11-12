
from clinicq.database.connection import db

COLLECTIONS = [
    "users",
    "doctors",
    "slots",
    "appointments",
    "consultation_notes",
    "audit_logs",
]


def initialize_collections():
    """Create missing ClinicQ collections without deleting existing data."""

    existing = set(db.list_collection_names())

    for collection_name in COLLECTIONS:
        if collection_name not in existing:
            db.create_collection(collection_name)
            print(f"Created collection: {collection_name}")
        else:
            print(f"Collection already exists: {collection_name}")

    print("ClinicQ collection initialization completed.")


if __name__ == "__main__":
    initialize_collections()
