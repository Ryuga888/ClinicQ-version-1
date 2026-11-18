from django.core.management.base import BaseCommand
from clinicq.database.connection import db
from clinicq.database.schemas import user_document, audit_log_document
from argon2 import PasswordHasher

ph = PasswordHasher()


class Command(BaseCommand):
    help = 'Seeds the initial ClinicQ master administrator account if missing'

    def handle(self, *args, **options):
        if not db.users.find_one({"email": "admin@clinicq.local"}):
            pwd_hash = ph.hash("admin")
            doc = user_document(
                name="Clinic Administrator",
                email="admin@clinicq.local",
                phone="+1-555-0100",
                password_hash=pwd_hash,
                role="Admin"
            )
            res = db.users.insert_one(doc)
            audit = audit_log_document(res.inserted_id, "SYSTEM_INSTALL", "SYSTEM", "v1.0")
            audit["details"] = "Initial installation: Master Admin account created."
            db.audit_logs.insert_one(audit)
            self.stdout.write(self.style.SUCCESS("Master Admin account created: admin@clinicq.local / admin"))
        else:
            self.stdout.write("Admin account already exists.")
