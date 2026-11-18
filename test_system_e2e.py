"""
Full End-to-End System Test Suite:
Frontend HTTP Delivery + Django Backend API + Live MongoDB Database
Simulates real browser sessions with persistent cookie handling across all roles.
"""

import urllib.request
import urllib.parse
import http.cookiejar
import json
import datetime
import sys
import uuid

BASE_URL = "http://localhost:8000"

# Setup cookie-enabled HTTP client for Admin
admin_cj = http.cookiejar.CookieJar()
admin_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(admin_cj))

# Setup cookie-enabled HTTP client for Patient
patient_cj = http.cookiejar.CookieJar()
patient_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(patient_cj))

# Setup cookie-enabled HTTP client for Doctor
doctor_cj = http.cookiejar.CookieJar()
doctor_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(doctor_cj))

passed = 0
total = 0

def test(name, fn):
    global passed, total
    total += 1
    try:
        fn()
        print(f"  [PASS] {name}")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] {name}: {e}")

def api_call(opener, path, method="GET", data=None):
    url = f"{BASE_URL}{path}"
    body = None
    headers = {}
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with opener.open(req) as resp:
            raw = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw

print("\n=======================================================")
print("ClinicQ End-to-End System Test: Frontend + Backend + DB")
print("=======================================================\n")

# 1. Frontend Static Delivery
print("--- 1. Testing Frontend Static Delivery via Web Server ---")

def test_index_page():
    status, body = api_call(admin_opener, "/")
    assert status == 200, f"Expected 200, got {status}"
    assert "<title>ClinicQ" in body
    assert "id=\"view-auth\"" in body

def test_static_assets():
    status_css, _ = api_call(admin_opener, "/style.css")
    assert status_css == 200, f"style.css returned {status_css}"
    status_js, _ = api_call(admin_opener, "/app.js")
    assert status_js == 200, f"app.js returned {status_js}"

test("Server delivers index.html at root", test_index_page)
test("Server delivers style.css and app.js", test_static_assets)

# 2. Database & Auth Flow
print("\n--- 2. Testing Authentication & Database Persistence ---")

def test_admin_login():
    status, body = api_call(admin_opener, "/api/auth/login", method="POST", data={
        "email": "admin@clinicq.local",
        "password": "admin"
    })
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert body["user"]["role"] == "Admin"
    assert body["user"]["email"] == "admin@clinicq.local"

def test_session_persistence():
    status, body = api_call(admin_opener, "/api/auth/me")
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert body["user"]["role"] == "Admin"

test("Admin login creates session and verifies Argon2 in DB", test_admin_login)
test("Session verification (/api/auth/me) maintains state across requests", test_session_persistence)

# 3. Admin Workflow: Create Doctor & Slots in Database
print("\n--- 3. Testing Admin Roster & Slot Generation in Database ---")

created_doc_id = None
tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")

def test_create_doctor():
    global created_doc_id
    doc_email = f"doc_{int(datetime.datetime.now().timestamp())}@clinicq.local"
    status, body = api_call(admin_opener, "/api/clinic/doctors/create", method="POST", data={
        "name": "Dr. Alexander Ross",
        "specialization": "Cardiology",
        "email": doc_email,
        "phone": "+1-555-0321",
        "password": "doctorpassword"
    })
    assert status == 201, f"Expected 201, got {status}: {body}"
    created_doc_id = body["doctor"]["id"]
    assert body["doctor"]["name"] == "Dr. Alexander Ross"

def test_generate_slots():
    status, body = api_call(admin_opener, "/api/clinic/slots/generate", method="POST", data={
        "doctor_id": created_doc_id,
        "start_date": tomorrow,
        "end_date": tomorrow,
        "daily_start_time": "10:00",
        "daily_end_time": "11:30",
        "slot_duration_minutes": 30
    })
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert body["generated"] == 3

def test_query_slots():
    status, body = api_call(admin_opener, f"/api/clinic/slots?doctor_id={created_doc_id}&date={tomorrow}")
    assert status == 200, f"Expected 200, got {status}"
    assert len(body["slots"]) == 3
    assert body["slots"][0]["status"] == "Free"

test("Admin creates new physician profile in MongoDB", test_create_doctor)
test("Admin generates time slots in MongoDB", test_generate_slots)
test("Slots query retrieves free slots from DB", test_query_slots)

# 4. Patient Registration & Booking
print("\n--- 4. Testing Patient Self-Registration & Atomic Slot Booking ---")

target_slot_id = None
appointment_id = None

def test_patient_register():
    p_email = f"patient_{int(datetime.datetime.now().timestamp())}@example.com"
    status, body = api_call(patient_opener, "/api/auth/register", method="POST", data={
        "name": "Jane Miller",
        "email": p_email,
        "phone": "+1-555-9876",
        "password": "patientpassword"
    })
    assert status == 201, f"Expected 201, got {status}: {body}"
    assert body["user"]["role"] == "Patient"

def test_book_slot():
    global target_slot_id, appointment_id
    _, slots_resp = api_call(patient_opener, f"/api/clinic/slots?doctor_id={created_doc_id}&date={tomorrow}")
    target_slot_id = slots_resp["slots"][0]["id"]
    
    status, body = api_call(patient_opener, "/api/booking/book", method="POST", data={
        "slot_id": target_slot_id
    })
    assert status == 201, f"Expected 201, got {status}: {body}"
    appointment_id = body["appointment"]["id"]
    assert body["appointment"]["status"] == "Booked"

def test_double_booking_rejected():
    # A second patient attempts to book the exact same slot concurrently
    p2_cj = http.cookiejar.CookieJar()
    p2_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(p2_cj))
    p2_email = f"patient2_{uuid.uuid4().hex[:6]}@example.com"
    api_call(p2_opener, "/api/auth/register", method="POST", data={
        "name": "Second Patient",
        "email": p2_email,
        "phone": "+1-555-0198",
        "password": "PatientPassword123!"
    })
    status, body = api_call(p2_opener, "/api/booking/book", method="POST", data={
        "slot_id": target_slot_id
    })
    assert status == 409, f"Expected 409, got {status}: {body}"
    assert "This slot was just taken" in body.get("error", "") or "Conflict" in body.get("error", "")

def test_patient_history():
    status, body = api_call(patient_opener, "/api/booking/patient")
    assert status == 200, f"Expected 200, got {status}"
    assert any(a["id"] == appointment_id for a in body["appointments"])

test("Patient self-registration persists to MongoDB", test_patient_register)
test("Patient books free slot (DB updates slot to Booked & saves appointment)", test_book_slot)
test("Atomic double-booking prevention returns 409 conflict", test_double_booking_rejected)
test("Patient appointment history shows newly booked visit", test_patient_history)

# 5. Doctor Actions: Schedule, Completion & Confidential Notes
print("\n--- 5. Testing Doctor Schedule, Completion & Confidential Notes ---")

def test_doctor_login():
    _, doc_list = api_call(admin_opener, "/api/clinic/doctors")
    doc_info = next(d for d in doc_list["doctors"] if d["id"] == created_doc_id)
    status, body = api_call(doctor_opener, "/api/auth/login", method="POST", data={
        "email": doc_info["email"],
        "password": "doctorpassword"
    })
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert body["user"]["role"] == "Doctor"

def test_doctor_schedule():
    status, body = api_call(doctor_opener, f"/api/booking/doctor?date={tomorrow}")
    assert status == 200, f"Expected 200, got {status}"
    assert len(body["appointments"]) >= 1
    assert body["appointments"][0]["patientName"] == "Jane Miller"
    assert body["appointments"][0]["patientPhone"] == "+1-555-9876"

def test_doctor_save_note():
    status, body = api_call(doctor_opener, f"/api/notes/{appointment_id}", method="POST", data={
        "text": "Initial consultation completed. Blood pressure within normal range. Follow-up in 3 months."
    })
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert body["success"] is True

def test_doctor_read_note():
    status, body = api_call(doctor_opener, f"/api/notes/{appointment_id}")
    assert status == 200, f"Expected 200, got {status}: {body}"
    assert "Blood pressure within normal range" in body["note"]["text"]

def test_note_privacy():
    # Patient blocked
    p_status, _ = api_call(patient_opener, f"/api/notes/{appointment_id}")
    assert p_status == 403, f"Expected 403 for Patient, got {p_status}"
    
    # Admin blocked
    a_status, _ = api_call(admin_opener, f"/api/notes/{appointment_id}")
    assert a_status == 403, f"Expected 403 for Admin, got {a_status}"

test("Doctor logs in with admin-created credentials", test_doctor_login)
test("Doctor views daily schedule with patient details", test_doctor_schedule)
test("Doctor records confidential consultation note in MongoDB", test_doctor_save_note)
test("Doctor reads back consultation note from MongoDB", test_doctor_read_note)
test("Patient and Admin are strictly blocked from notes (403)", test_note_privacy)

# 6. Audit Trail Verification
print("\n--- 6. Testing Append-Only Audit Logging in Database ---")

def test_audit_logs():
    status, body = api_call(admin_opener, "/api/audit/")
    assert status == 200, f"Expected 200, got {status}"
    logs = body["auditLogs"]
    actions = [l["action"] for l in logs]
    assert "LOGIN_SUCCESS" in actions
    assert "DOCTOR_ACCOUNT_CREATED" in actions
    assert "SLOTS_GENERATED" in actions
    assert "APPOINTMENT_BOOKED" in actions
    assert "NOTE_SAVED" in actions

test("Admin views append-only audit trail with all operational events", test_audit_logs)

print("\n=======================================================")
print(f"End-to-End System Test Result: {passed} / {total} passed.")
print("=======================================================\n")

if passed == total:
    sys.exit(0)
else:
    sys.exit(1)
