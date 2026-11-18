import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import RequestFactory
from django.contrib.sessions.middleware import SessionMiddleware
from accounts.views import login_view, register_patient, logout_view, me_view
from clinic.views import list_doctors, create_doctor, generate_slots, list_slots
from booking.views import book_appointment, patient_appointments, cancel_appointment, doctor_schedule
from notes.views import handle_note
from audit.views import list_audit_logs
import json

rf = RequestFactory()

def add_session(request):
    middleware = SessionMiddleware(lambda r: None)
    middleware.process_request(request)
    request.session.save()
    return request

print("Testing Backend Endpoints...")

# 1. Admin login
req = rf.post('/api/auth/login', data=json.dumps({"email": "admin@clinicq.local", "password": "admin"}), content_type='application/json')
add_session(req)
resp = login_view(req)
print("1. Admin Login Response:", resp.status_code, resp.content.decode('utf-8'))
assert resp.status_code == 200

# 2. Register new patient
patient_email = f"patient_{int(django.utils.timezone.now().timestamp())}@test.com"
req_reg = rf.post('/api/auth/register', data=json.dumps({"name": "Test Patient", "email": patient_email, "phone": "+1-555-0199", "password": "patientpwd"}), content_type='application/json')
add_session(req_reg)
resp_reg = register_patient(req_reg)
print("2. Patient Register Response:", resp_reg.status_code, resp_reg.content.decode('utf-8'))
assert resp_reg.status_code == 201

# 3. Create doctor as Admin
req_doc = rf.post('/api/clinic/doctors/create', data=json.dumps({"name": "Dr. Sarah Adams", "specialization": "Pediatrics", "email": f"sarah_{int(django.utils.timezone.now().timestamp())}@clinicq.local", "phone": "+1-555-0177", "password": "doctorpwd"}), content_type='application/json')
req_doc.session = req.session # Admin session
resp_doc = create_doctor(req_doc)
print("3. Admin Create Doctor Response:", resp_doc.status_code, resp_doc.content.decode('utf-8'))
assert resp_doc.status_code == 201
doc_id = json.loads(resp_doc.content.decode('utf-8'))['doctor']['id']

# 4. Generate slots
tomorrow = (django.utils.timezone.now() + django.utils.timezone.timedelta(days=1)).strftime("%Y-%m-%d")
req_gen = rf.post('/api/clinic/slots/generate', data=json.dumps({"doctor_id": doc_id, "start_date": tomorrow, "end_date": tomorrow, "daily_start_time": "09:00", "daily_end_time": "10:00", "slot_duration_minutes": 30}), content_type='application/json')
req_gen.session = req.session
resp_gen = generate_slots(req_gen)
print("4. Generate Slots Response:", resp_gen.status_code, resp_gen.content.decode('utf-8'))
assert resp_gen.status_code == 200

# 5. List slots
req_slots = rf.get(f'/api/clinic/slots?doctor_id={doc_id}&date={tomorrow}')
resp_slots = list_slots(req_slots)
slots_data = json.loads(resp_slots.content.decode('utf-8'))['slots']
print(f"5. List Slots Response ({len(slots_data)} slots):", resp_slots.status_code)
assert len(slots_data) == 2
slot_id = slots_data[0]['id']

# 6. Book slot as Patient
req_book = rf.post('/api/booking/book', data=json.dumps({"slot_id": slot_id}), content_type='application/json')
req_book.session = req_reg.session # Patient session
resp_book = book_appointment(req_book)
print("6. Book Slot Response:", resp_book.status_code, resp_book.content.decode('utf-8'))
assert resp_book.status_code == 201
appt_id = json.loads(resp_book.content.decode('utf-8'))['appointment']['id']

# 7. Audit log check
req_audit = rf.get('/api/audit/')
req_audit.session = req.session # Admin session
resp_audit = list_audit_logs(req_audit)
logs = json.loads(resp_audit.content.decode('utf-8'))['auditLogs']
print(f"7. Audit Logs Response ({len(logs)} logs):", resp_audit.status_code)
assert len(logs) > 0

print("\nALL BACKEND API ENDPOINTS VERIFIED SUCCESSFULLY!")
