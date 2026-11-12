
from clinicq.database.connection import db


VALIDATORS = {

    # 1. USERS
    "users": {
        "bsonType": "object",
        "required": [
            "name",
            "email",
            "phone",
            "password_hash",
            "role"
        ],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "name": {
                "bsonType": "string",
                "minLength": 2,
                "maxLength": 100
            },
            "email": {
                "bsonType": "string",
                "pattern": r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
            },
            "phone": {
                "bsonType": "string",
                "minLength": 7,
                "maxLength": 20
            },
            "password_hash": {
                "bsonType": "string",
                "minLength": 20
            },
            "role": {
                "enum": ["Patient", "Doctor", "Admin"]
            }
        }
    },

    # 2. DOCTORS
    "doctors": {
        "bsonType": "object",
        "required": ["user_id", "specialization"],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "user_id": {"bsonType": "objectId"},
            "specialization": {
                "bsonType": "string",
                "minLength": 2,
                "maxLength": 100
            }
        }
    },

    # 3. SLOTS
    "slots": {
        "bsonType": "object",
        "required": [
            "doctor_id",
            "start_at",
            "end_at",
            "status"
        ],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "doctor_id": {"bsonType": "objectId"},
            "start_at": {"bsonType": "date"},
            "end_at": {"bsonType": "date"},
            "status": {
                "enum": ["Free", "Booked"]
            }
        }
    },

    # 4. APPOINTMENTS
    "appointments": {
        "bsonType": "object",
        "required": [
            "slot_id",
            "patient_id",
            "doctor_id",
            "status",
            "created_at"
        ],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "slot_id": {"bsonType": "objectId"},
            "patient_id": {"bsonType": "objectId"},
            "doctor_id": {"bsonType": "objectId"},
            "status": {
                "enum": [
                    "Booked",
                    "Cancelled",
                    "Completed"
                ]
            },
            "created_at": {"bsonType": "date"}
        }
    },

    # 5. CONSULTATION NOTES
    "consultation_notes": {
        "bsonType": "object",
        "required": [
            "appointment_id",
            "doctor_id",
            "text",
            "updated_at"
        ],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "appointment_id": {"bsonType": "objectId"},
            "doctor_id": {"bsonType": "objectId"},
            "text": {
                "bsonType": "string",
                "maxLength": 2000
            },
            "updated_at": {"bsonType": "date"}
        }
    },

    # 6. AUDIT LOGS
    "audit_logs": {
        "bsonType": "object",
        "required": [
            "user_id",
            "action",
            "target_type",
            "target_id",
            "created_at"
        ],
        "properties": {
            "_id": {"bsonType": "objectId"},
            "user_id": {"bsonType": "objectId"},
            "action": {
                "bsonType": "string",
                "minLength": 1
            },
            "target_type": {"bsonType": "string"},
            "target_id": {"bsonType": "string"},
            "created_at": {"bsonType": "date"}
        }
    }
}


def apply_validators():
    """Apply MongoDB schema validation to all ClinicQ collections."""

    for collection_name, schema in VALIDATORS.items():

        db.command({
            "collMod": collection_name,
            "validator": {
                "$jsonSchema": schema
            },
            "validationLevel": "strict",
            "validationAction": "error"
        })

        print(f"Validation applied: {collection_name}")

    print("All ClinicQ validators applied successfully.")
