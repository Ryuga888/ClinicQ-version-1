from datetime import datetime, timedelta
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from bson import ObjectId
from clinicq.database.connection import db
from clinicq.database.schemas import appointment_document
from clinicq.api_helpers import (
    get_current_user,
    require_role,
    log_audit,
    parse_json
)


@csrf_exempt
def book_appointment(request):
    """Atomic slot booking with concurrency conflict resolution."""
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    user = get_current_user(request)
    if not user or user["role"] != "Patient":
        return JsonResponse({"error": "Access denied: Patient role required"}, status=403)

    data = parse_json(request)
    slot_id = data.get("slot_id")

    if not slot_id:
        return JsonResponse({"error": "slot_id is required"}, status=400)

    try:
        s_id = ObjectId(slot_id)
        slot = db.slots.find_one({"_id": s_id})
        if not slot:
            return JsonResponse({"error": "Slot not found"}, status=404)

        now = datetime.utcnow()
        if slot["start_at"] < now:
            return JsonResponse({"error": "Refused: This appointment slot has already passed."}, status=400)

        patient_id = ObjectId(user["id"])

        # Check if patient already holds an active appointment at this exact date & time
        collision = db.appointments.find_one({
            "patient_id": patient_id,
            "status": "Booked",
            "slot_id": {"$in": [s["_id"] for s in db.slots.find({"start_at": slot["start_at"]})]}
        })

        if collision:
            return JsonResponse({"error": "Refused: You already hold an active appointment at this date and time."}, status=409)

        # Atomic reservation check: exactly one winner under concurrency
        updated_slot = db.slots.find_one_and_update(
            {"_id": s_id, "status": "Free"},
            {"$set": {"status": "Booked"}}
        )

        if not updated_slot:
            return JsonResponse({"error": "This slot was just taken. Please select another free slot."}, status=409)

        # Create appointment document
        appt_doc = appointment_document(
            slot_id=s_id,
            patient_id=patient_id,
            doctor_id=slot["doctor_id"]
        )

        res = db.appointments.insert_one(appt_doc)
        appt_id = str(res.inserted_id)

        # Fetch doctor details for confirmation
        doctor = db.doctors.find_one({"_id": slot["doctor_id"]})
        doc_user = db.users.find_one({"_id": doctor["user_id"]}) if doctor else None

        log_audit(
            user["id"],
            "APPOINTMENT_BOOKED",
            "APPOINTMENT",
            appt_id,
            f"Patient {user['name']} booked with {doc_user['name'] if doc_user else 'Doctor'} on {slot['start_at'].strftime('%Y-%m-%d %H:%M')}"
        )

        return JsonResponse({
            "appointment": {
                "id": appt_id,
                "slotId": slot_id,
                "doctorId": str(slot["doctor_id"]),
                "doctorName": doc_user["name"] if doc_user else "Physician",
                "specialization": doctor["specialization"] if doctor else "",
                "date": slot["start_at"].strftime("%Y-%m-%d"),
                "startTime": slot["start_at"].strftime("%H:%M"),
                "endTime": slot["end_at"].strftime("%H:%M"),
                "status": "Booked"
            }
        }, status=201)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


def patient_appointments(request):
    """Get appointments for the current patient."""
    user = get_current_user(request)
    if not user or user["role"] != "Patient":
        return JsonResponse({"error": "Access denied: Patient role required"}, status=403)

    patient_id = ObjectId(user["id"])
    cursor = db.appointments.find({"patient_id": patient_id}).sort("created_at", -1)

    results = []
    now = datetime.utcnow()

    for a in cursor:
        slot = db.slots.find_one({"_id": a["slot_id"]})
        doctor = db.doctors.find_one({"_id": a["doctor_id"]})
        doc_user = db.users.find_one({"_id": doctor["user_id"]}) if doctor else None

        start_dt = slot["start_at"] if slot else datetime.utcnow()
        end_dt = slot["end_at"] if slot else start_dt

        results.append({
            "id": str(a["_id"]),
            "slotId": str(a["slot_id"]),
            "doctorId": str(a["doctor_id"]),
            "doctorName": doc_user["name"] if doc_user else "Unknown",
            "specialization": doctor["specialization"] if doctor else "",
            "date": start_dt.strftime("%Y-%m-%d"),
            "startTime": start_dt.strftime("%H:%M"),
            "endTime": end_dt.strftime("%H:%M"),
            "status": a["status"],
            "isPast": start_dt < now
        })

    return JsonResponse({"appointments": results})


@csrf_exempt
def cancel_appointment(request, appointment_id):
    """Cancel appointment (Patient for own upcoming, or Admin for any)."""
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    user = get_current_user(request)
    if not user:
        return JsonResponse({"error": "Authentication required"}, status=401)

    try:
        a_id = ObjectId(appointment_id)
        appt = db.appointments.find_one({"_id": a_id})
        if not appt:
            return JsonResponse({"error": "Appointment not found"}, status=404)

        slot = db.slots.find_one({"_id": appt["slot_id"]})

        # Ownership and role enforcement
        if user["role"] == "Patient":
            if str(appt["patient_id"]) != user["id"]:
                return JsonResponse({"error": "Record not found or access denied."}, status=404)

            # Refuse cancellation of past appointments
            if slot and slot["start_at"] < datetime.utcnow():
                return JsonResponse({"error": "Past appointments cannot be cancelled."}, status=400)

        elif user["role"] != "Admin":
            return JsonResponse({"error": "Access denied"}, status=403)

        # Mark cancelled and free the slot
        db.appointments.update_one({"_id": a_id}, {"$set": {"status": "Cancelled"}})
        if slot:
            db.slots.update_one({"_id": slot["_id"]}, {"$set": {"status": "Free"}})

        action_name = "ADMIN_APPOINTMENT_CANCELLED" if user["role"] == "Admin" else "APPOINTMENT_CANCELLED"
        log_audit(
            user["id"],
            action_name,
            "APPOINTMENT",
            appointment_id,
            f"Appointment {appointment_id} cancelled by {user['name']}. Slot restored to Free."
        )

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


def doctor_schedule(request):
    """Clinician schedule for a given date (defaults to today)."""
    user = get_current_user(request)
    if not user or user["role"] != "Doctor":
        return JsonResponse({"error": "Access denied: Doctor role required"}, status=403)

    doctor = db.doctors.find_one({"user_id": ObjectId(user["id"])})
    if not doctor:
        return JsonResponse({"appointments": [], "doctor": None})

    date_str = request.GET.get('date', datetime.utcnow().strftime("%Y-%m-%d"))
    start_of_day = datetime.strptime(date_str, "%Y-%m-%d")
    end_of_day = start_of_day + timedelta(days=1)

    # Find slots for this doctor on date
    slots_cursor = db.slots.find({
        "doctor_id": doctor["_id"],
        "start_at": {"$gte": start_of_day, "$lt": end_of_day}
    })
    slot_map = {s["_id"]: s for s in slots_cursor}

    # Find appointments in those slots
    appts = db.appointments.find({"slot_id": {"$in": list(slot_map.keys())}})

    results = []
    for a in appts:
        slot = slot_map.get(a["slot_id"])
        patient_user = db.users.find_one({"_id": a["patient_id"]})
        has_note = db.consultation_notes.find_one({"appointment_id": a["_id"]}) is not None

        start_dt = slot["start_at"] if slot else datetime.utcnow()
        end_dt = slot["end_at"] if slot else start_dt

        results.append({
            "id": str(a["_id"]),
            "slotId": str(a["slot_id"]),
            "patientName": patient_user["name"] if patient_user else "Unknown",
            "patientPhone": patient_user.get("phone", "") if patient_user else "",
            "date": start_dt.strftime("%Y-%m-%d"),
            "startTime": start_dt.strftime("%H:%M"),
            "endTime": end_dt.strftime("%H:%M"),
            "status": a["status"],
            "hasNote": has_note
        })

    results.sort(key=lambda x: x["startTime"])

    return JsonResponse({
        "doctor": {
            "id": str(doctor["_id"]),
            "name": user["name"],
            "specialization": doctor["specialization"]
        },
        "appointments": results
    })


@csrf_exempt
def complete_appointment(request, appointment_id):
    """Doctor marks appointment Completed."""
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    user = get_current_user(request)
    if not user or user["role"] != "Doctor":
        return JsonResponse({"error": "Access denied: Doctor role required"}, status=403)

    try:
        doctor = db.doctors.find_one({"user_id": ObjectId(user["id"])})
        if not doctor:
            return JsonResponse({"error": "Doctor profile not found"}, status=404)

        a_id = ObjectId(appointment_id)
        appt = db.appointments.find_one({"_id": a_id, "doctor_id": doctor["_id"]})
        if not appt:
            return JsonResponse({"error": "Access Denied: You may only update your own assigned appointments."}, status=403)

        db.appointments.update_one({"_id": a_id}, {"$set": {"status": "Completed"}})

        log_audit(
            user["id"],
            "APPOINTMENT_COMPLETED",
            "APPOINTMENT",
            appointment_id,
            f"Dr. {user['name']} marked appointment {appointment_id} as Completed."
        )

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


def admin_appointments(request):
    """Admin views all clinic appointments for a date, filterable by doctor."""
    user = get_current_user(request)
    if not user or user["role"] != "Admin":
        return JsonResponse({"error": "Access denied: Administrator required"}, status=403)

    date_str = request.GET.get('date', datetime.utcnow().strftime("%Y-%m-%d"))
    doctor_filter = request.GET.get('doctor_id', 'ALL')

    start_of_day = datetime.strptime(date_str, "%Y-%m-%d")
    end_of_day = start_of_day + timedelta(days=1)

    slot_query = {"start_at": {"$gte": start_of_day, "$lt": end_of_day}}
    if doctor_filter != 'ALL':
        try:
            slot_query["doctor_id"] = ObjectId(doctor_filter)
        except Exception:
            pass

    slots_cursor = db.slots.find(slot_query)
    slot_map = {s["_id"]: s for s in slots_cursor}

    appts = db.appointments.find({"slot_id": {"$in": list(slot_map.keys())}})

    results = []
    for a in appts:
        slot = slot_map.get(a["slot_id"])
        doctor = db.doctors.find_one({"_id": a["doctor_id"]})
        doc_user = db.users.find_one({"_id": doctor["user_id"]}) if doctor else None
        patient = db.users.find_one({"_id": a["patient_id"]})

        start_dt = slot["start_at"] if slot else datetime.utcnow()
        end_dt = slot["end_at"] if slot else start_dt

        results.append({
            "id": str(a["_id"]),
            "slotId": str(a["slot_id"]),
            "doctorName": doc_user["name"] if doc_user else "Unknown",
            "patientName": patient["name"] if patient else "Unknown",
            "patientPhone": patient.get("phone", "") if patient else "",
            "date": start_dt.strftime("%Y-%m-%d"),
            "startTime": start_dt.strftime("%H:%M"),
            "endTime": end_dt.strftime("%H:%M"),
            "status": a["status"]
            # NOTE: Private consultation notes are strictly excluded from admin
        })

    results.sort(key=lambda x: x["startTime"])

    return JsonResponse({"appointments": results})
