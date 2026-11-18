# ClinicQ — Backend Architecture & Service

The ClinicQ backend is a Python Django service implementing all functional and security requirements defined in the ClinicQ specifications.

---

## Implemented Tech Stack

- **Framework**: Python 3.13 / Django 6.1
- **Database**: MongoDB & SQLite session management
- **Password Security**: Argon2 (`argon2-cffi`) salted hashes
- **Concurrency & Atomic Reservation**: Atomic reservation with unique status constraints rejecting double-bookings under concurrent requests
- **Configuration**: `python-dotenv` with environment variables (`.env`)
- **Integration**: Direct REST API routes integrated with the single-page frontend

---

## App Modular Layout

As specified in the architecture, the backend is organized into dedicated apps per functional module:

```text
backend/
├── manage.py
├── config/                # Core settings, URL routing, frontend serving
├── clinicq/
│   ├── database/          # Connection, collections, schemas, indexes, validators
│   └── api_helpers.py     # Auth helpers, Argon2 hashing, audit logging
├── accounts/              # Accounts: Registration, authentication, roles, session timeout
├── clinic/                # Clinicians: Doctor profiles, slot generator engine
├── booking/               # Booking: Atomic booking, cancellations, clinician schedules, admin register
├── notes/                 # Consultation notes: Confidential clinical consultation notes
└── audit/                 # Audit logging: Append-only security audit log
```

---

## Core Security & Business Rules

1. **Double Booking Prevention**
   - Database-level unique constraint on `(doctor_id, start_at)` for slots.
   - Atomic `find_one_and_update` on `{"_id": slot_id, "status": "Free"}` guarantees exactly one winner under concurrency.
   - Collision checks prevent any patient from holding two active appointments at the same date and time.

2. **Access Control & Privacy**
   - Server-side role checks (`Patient`, `Doctor`, `Admin`) enforced on every endpoint.
   - Record lookups verify ownership; unauthorized requests return not-found or access denied.

3. **Clinician Note Secrecy**
   - Clinical notes (up to 2,000 characters) are readable and editable **exclusively** by the treating doctor.
   - Strictly excluded from Patient and Admin queries and API responses.

4. **Security Hardening**
   - Session cookies flagged with `HttpOnly` and `SameSite=Lax`.
   - Account lockout after 5 consecutive failed login attempts within 10 minutes.
   - Single generic error message on failed login: *"Invalid email or password."*

---

## Setup & Running the Integrated Server

```bash
# 1. From the backend directory
cd backend

# 2. Run migrations
python manage.py migrate

# 3. Seed initial master administrator (if not present)
python manage.py seed_admin

# 4. Start the integrated server
python manage.py runserver 8000
```

Once running, navigate to **`http://localhost:8000`** in your browser. The Django server serves the frontend application and handles all REST API requests seamlessly.

---

## Automated Backend Integration Tests

To verify all backend API endpoints:
```bash
cd backend
python test_backend.py
```
Expected output:
```text
Testing Backend Endpoints...
1. Admin Login Response: 200 OK
2. Patient Register Response: 201 Created
3. Admin Create Doctor Response: 201 Created
4. Generate Slots Response: 200 OK
5. List Slots Response: 200 OK
6. Book Slot Response: 201 Created
7. Audit Logs Response: 200 OK

ALL BACKEND API ENDPOINTS VERIFIED SUCCESSFULLY!
```
