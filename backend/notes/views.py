from datetime import datetime, timezone
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from bson import ObjectId
from clinicq.database.connection import db
from clinicq.database.schemas import consultation_note_document
from clinicq.api_helpers import (
    get_current_user,
    log_audit,
    parse_json
)


@csrf_exempt
def handle_note(request, appointment_id):
    """
    Get or save consultation notes.
    Confidential medical record: accessible exclusively to the treating clinician.
    Patients and administrators are strictly denied.
    """
    user = get_current_user(request)
    if not user or user["role"] != "Doctor":
        return JsonResponse({"error": "Access Denied: Consultation notes are confidential and restricted to the treating doctor."}, status=403)

    try:
        doctor = db.doctors.find_one({"user_id": ObjectId(user["id"])})
        if not doctor:
            return JsonResponse({"error": "Doctor profile not found"}, status=404)

        a_id = ObjectId(appointment_id)
        appt = db.appointments.find_one({"_id": a_id})
        if not appt:
            return JsonResponse({"error": "Appointment not found"}, status=404)

        # Confidentiality guard: Must be treating clinician
        if appt["doctor_id"] != doctor["_id"]:
            return JsonResponse({"error": "Access Denied: Consultation notes are confidential and restricted to the treating doctor."}, status=403)

        if request.method == 'GET':
            note = db.consultation_notes.find_one({"appointment_id": a_id})
            log_audit(
                user["id"],
                "NOTE_VIEWED",
                "NOTE",
                str(note["_id"]) if note else appointment_id,
                f"Clinician opened consultation notes for appointment {appointment_id}"
            )
            return JsonResponse({
                "note": {
                    "text": note["text"] if note else "",
                    "updatedAt": note["updated_at"].isoformat() if note else None
                }
            })

        elif request.method == 'POST':
            data = parse_json(request)
            text = data.get("text", "").strip()

            if len(text) > 2000:
                return JsonResponse({"error": "Note exceeds 2,000 character maximum limit."}, status=400)

            existing = db.consultation_notes.find_one({"appointment_id": a_id})
            now = datetime.now(timezone.utc)

            if existing:
                db.consultation_notes.update_one(
                    {"appointment_id": a_id},
                    {"$set": {"text": text, "updated_at": now}}
                )
                note_id = str(existing["_id"])
            else:
                doc = consultation_note_document(a_id, doctor["_id"], text)
                res = db.consultation_notes.insert_one(doc)
                note_id = str(res.inserted_id)

            log_audit(
                user["id"],
                "NOTE_SAVED",
                "NOTE",
                note_id,
                f"Clinician updated consultation note for appointment {appointment_id}"
            )

            return JsonResponse({"success": True})

        return JsonResponse({"error": "Method not allowed"}, status=405)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
