
"""
ClinicQ MongoDB collection relationships.

All references use BSON ObjectId.
MongoDB does not automatically enforce foreign keys.
"""

RELATIONSHIPS = {
    "doctors": {
        "user_id": "users._id",
        "cardinality": "one-to-one"
    },

    "slots": {
        "doctor_id": "doctors._id",
        "cardinality": "many-to-one"
    },

    "appointments": {
        "slot_id": "slots._id",
        "patient_id": "users._id",
        "doctor_id": "doctors._id",
        "cardinality": "many-to-one"
    },

    "consultation_notes": {
        "appointment_id": "appointments._id",
        "doctor_id": "doctors._id",
        "cardinality": "one-to-one"
    },

    "audit_logs": {
        "user_id": "users._id",
        "target_id": "referenced target identifier",
        "cardinality": "many-to-one"
    }
}
