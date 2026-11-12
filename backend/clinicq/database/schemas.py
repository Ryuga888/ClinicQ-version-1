
from bson import ObjectId
from datetime import datetime, timezone


def user_document(name, email, phone, password_hash, role):
    return {
        "name": name,
        "email": email.lower().strip(),
        "phone": phone,
        "password_hash": password_hash,
        "role": role
    }


def doctor_document(user_id, specialization):
    return {
        "user_id": ObjectId(user_id),
        "specialization": specialization
    }


def slot_document(doctor_id, start_at, end_at):
    return {
        "doctor_id": ObjectId(doctor_id),
        "start_at": start_at,
        "end_at": end_at,
        "status": "Free"
    }


def appointment_document(slot_id, patient_id, doctor_id):
    return {
        "slot_id": ObjectId(slot_id),
        "patient_id": ObjectId(patient_id),
        "doctor_id": ObjectId(doctor_id),
        "status": "Booked",
        "created_at": datetime.now(timezone.utc)
    }


def consultation_note_document(appointment_id, doctor_id, text):
    return {
        "appointment_id": ObjectId(appointment_id),
        "doctor_id": ObjectId(doctor_id),
        "text": text,
        "updated_at": datetime.now(timezone.utc)
    }


def audit_log_document(user_id, action, target_type, target_id):
    return {
        "user_id": ObjectId(user_id),
        "action": action,
        "target_type": target_type,
        "target_id": str(target_id),
        "created_at": datetime.now(timezone.utc)
    }
