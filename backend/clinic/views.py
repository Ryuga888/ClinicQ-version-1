from datetime import datetime, date, timedelta
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from bson import ObjectId
from clinicq.database.connection import db
from clinicq.database.schemas import doctor_document, slot_document, user_document
from clinicq.api_helpers import (
    get_current_user,
    require_role,
    log_audit,
    hash_password,
    parse_json
)


def list_doctors(request):
    """List all registered clinicians."""
    doctors = []
    cursor = db.doctors.find({})
    for doc in cursor:
        user = db.users.find_one({"_id": doc["user_id"]})
        doctors.append({
            "id": str(doc["_id"]),
            "userId": str(doc["user_id"]),
            "name": user["name"] if user else "Unknown",
            "specialization": doc.get("specialization", ""),
            "email": user["email"] if user else "",
            "phone": user.get("phone", "") if user else ""
        })
    return JsonResponse({"doctors": doctors})


@csrf_exempt
def create_doctor(request):
    """Admin creates doctor account and profile."""
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    user = get_current_user(request)
    if not user or user["role"] != "Admin":
        return JsonResponse({"error": "Access denied: Administrator required"}, status=403)

    data = parse_json(request)
    name = data.get("name", "").strip()
    spec = data.get("specialization", "").strip()
    email = data.get("email", "").strip().lower()
    phone = data.get("phone", "").strip()
    password = data.get("password", "")

    if not name or not spec or not email or not phone or not password:
        return JsonResponse({"error": "All fields are required"}, status=400)

    if db.users.find_one({"email": email}):
        return JsonResponse({"error": "An account with this email address already exists."}, status=409)

    pwd_hash = hash_password(password)
    user_doc = user_document(name, email, phone, pwd_hash, "Doctor")
    user_res = db.users.insert_one(user_doc)
    user_id = user_res.inserted_id

    doc_doc = doctor_document(user_id, spec)
    doc_res = db.doctors.insert_one(doc_doc)
    doc_id = str(doc_res.inserted_id)

    log_audit(
        user["id"],
        "DOCTOR_ACCOUNT_CREATED",
        "DOCTOR",
        doc_id,
        f"Admin created doctor account for {name} ({spec}, {email})"
    )

    return JsonResponse({
        "doctor": {
            "id": doc_id,
            "userId": str(user_id),
            "name": name,
            "specialization": spec,
            "email": email,
            "phone": phone
        }
    }, status=201)


@csrf_exempt
def update_doctor(request, doctor_id):
    """Admin updates clinician profile."""
    if request.method != 'PUT' and request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    user = get_current_user(request)
    if not user or user["role"] != "Admin":
        return JsonResponse({"error": "Access denied: Administrator required"}, status=403)

    data = parse_json(request)
    name = data.get("name", "").strip()
    spec = data.get("specialization", "").strip()

    if not name or not spec:
        return JsonResponse({"error": "Name and specialization required"}, status=400)

    try:
        doc = db.doctors.find_one({"_id": ObjectId(doctor_id)})
        if not doc:
            return JsonResponse({"error": "Doctor not found"}, status=404)

        db.doctors.update_one(
            {"_id": ObjectId(doctor_id)},
            {"$set": {"specialization": spec}}
        )
        db.users.update_one(
            {"_id": doc["user_id"]},
            {"$set": {"name": name}}
        )

        log_audit(
            user["id"],
            "DOCTOR_PROFILE_UPDATED",
            "DOCTOR",
            doctor_id,
            f"Admin updated profile for {name}"
        )

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


def list_slots(request):
    """List free/all slots for a given doctor and date."""
    doctor_id = request.GET.get('doctor_id')
    date_str = request.GET.get('date')

    if not doctor_id:
        return JsonResponse({"error": "doctor_id parameter is required"}, status=400)

    try:
        d_id = ObjectId(doctor_id)
    except Exception:
        return JsonResponse({"error": "Invalid doctor ID"}, status=400)

    query = {"doctor_id": d_id}

    if date_str:
        # Match slots on that day
        start_of_day = datetime.strptime(date_str, "%Y-%m-%d")
        end_of_day = start_of_day + timedelta(days=1)
        query["start_at"] = {"$gte": start_of_day, "$lt": end_of_day}

    slots = []
    cursor = db.slots.find(query).sort("start_at", 1)
    now = datetime.utcnow()

    for s in cursor:
        start_dt = s["start_at"]
        end_dt = s["end_at"]
        is_past = start_dt < now

        slots.append({
            "id": str(s["_id"]),
            "doctorId": str(s["doctor_id"]),
            "date": start_dt.strftime("%Y-%m-%d"),
            "startTime": start_dt.strftime("%H:%M"),
            "endTime": end_dt.strftime("%H:%M"),
            "status": s["status"],
            "isPast": is_past
        })

    return JsonResponse({"slots": slots})


@csrf_exempt
def generate_slots(request):
    """Admin generates fixed-length slots with overlap & past checks."""
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    user = get_current_user(request)
    if not user or user["role"] != "Admin":
        return JsonResponse({"error": "Access denied: Administrator required"}, status=403)

    data = parse_json(request)
    doctor_id = data.get("doctor_id")
    start_date_str = data.get("start_date")
    end_date_str = data.get("end_date")
    start_time_str = data.get("daily_start_time", "09:00")
    end_time_str = data.get("daily_end_time", "17:00")
    slot_minutes = int(data.get("slot_duration_minutes", 30))

    if not doctor_id or not start_date_str or not end_date_str:
        return JsonResponse({"error": "Doctor, start date and end date are required"}, status=400)

    try:
        d_id = ObjectId(doctor_id)
    except Exception:
        return JsonResponse({"error": "Invalid doctor ID"}, status=400)

    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()

    if start_date > end_date:
        return JsonResponse({"error": "Start date cannot be after end date"}, status=400)

    start_h, start_m = map(int, start_time_str.split(":"))
    end_h, end_m = map(int, end_time_str.split(":"))

    daily_start_min = start_h * 60 + start_m
    daily_end_min = end_h * 60 + end_m

    if daily_start_min >= daily_end_min:
        return JsonResponse({"error": "Daily start time must be before end time"}, status=400)

    now = datetime.utcnow()
    generated_count = 0
    skipped_overlap = 0
    skipped_past = 0

    curr_date = start_date
    while curr_date <= end_date:
        for m in range(daily_start_min, daily_end_min, slot_minutes):
            if m + slot_minutes > daily_end_min:
                break

            s_h, s_m = divmod(m, 60)
            e_h, e_m = divmod(m + slot_minutes, 60)

            slot_start = datetime(curr_date.year, curr_date.month, curr_date.day, s_h, s_m)
            slot_end = datetime(curr_date.year, curr_date.month, curr_date.day, e_h, e_m)

            # Refuse slots that start in the past
            if slot_start < now:
                skipped_past += 1
                continue

            # Refuse overlapping slots for this doctor
            overlap = db.slots.find_one({
                "doctor_id": d_id,
                "$or": [
                    {"start_at": {"$lt": slot_end, "$gte": slot_start}},
                    {"end_at": {"$gt": slot_start, "$lte": slot_end}},
                    {"start_at": {"$lte": slot_start}, "end_at": {"$gte": slot_end}}
                ]
            })

            if overlap:
                skipped_overlap += 1
                continue

            doc = slot_document(d_id, slot_start, slot_end)
            db.slots.insert_one(doc)
            generated_count += 1

        curr_date += timedelta(days=1)

    log_audit(
        user["id"],
        "SLOTS_GENERATED",
        "DOCTOR",
        doctor_id,
        f"Generated {generated_count} slots. (Skipped {skipped_overlap} overlaps, {skipped_past} past times)."
    )

    return JsonResponse({
        "generated": generated_count,
        "skipped_overlap": skipped_overlap,
        "skipped_past": skipped_past
    })


@csrf_exempt
def remove_slot(request, slot_id):
    """Admin removes an unbooked slot."""
    if request.method != 'DELETE' and request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    user = get_current_user(request)
    if not user or user["role"] != "Admin":
        return JsonResponse({"error": "Access denied: Administrator required"}, status=403)

    try:
        s_id = ObjectId(slot_id)
        slot = db.slots.find_one({"_id": s_id})
        if not slot:
            return JsonResponse({"error": "Slot not found"}, status=404)

        # Refuse removal if slot has booking
        if slot["status"] != "Free":
            return JsonResponse({"error": "Cannot remove a slot that has an active booking."}, status=400)

        db.slots.delete_one({"_id": s_id})

        log_audit(
            user["id"],
            "SLOT_REMOVED",
            "SLOT",
            slot_id,
            f"Admin deleted unbooked slot {slot_id}"
        )

        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)
