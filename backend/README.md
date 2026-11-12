# ClinicQ — Backend Architecture & Specification

This folder is dedicated to the ClinicQ backend service, designed to conform with the **ClinicQ PRD** and IEEE 830 specifications.

---

## Planned Tech Stack (PRD Page 8)

- **Framework**: Python 3.11+, Django 5
- **Database**: PostgreSQL
- **Password Security**: Argon2 (`argon2-cffi`) salted hashes (NFR-4)
- **Concurrency & Safety**: `transaction.atomic` with `select_for_update` to guarantee zero double-booking under concurrency (FR-3.3, NFR-3)
- **Configuration**: `python-dotenv` with environment variables (NFR-11)
- **Testing**: Django `TestCase` and `TransactionTestCase`

---

## App Modular Layout

As specified in the PRD, the Django backend is organized into one dedicated app per module:

```text
backend/
├── manage.py
├── clinicq/               # Core project settings, routing, WSGI/ASGI
├── accounts/              # Module M1: Registration, authentication, roles, session timeout
├── clinic/                # Module M2: Doctor profiles, slot generator engine
├── booking/               # Modules M3 & M4: Atomic booking, cancellations, schedules
├── notes/                 # Module M5: Confidential clinical consultation notes
└── audit/                 # Module M6: Append-only security audit log
```

---

## Core Security & Business Rules (To Enforce)

1. **Double Booking Prevention (FR-3.3, FR-3.4)**
   - Database-level unique constraint on `(doctor_id, start_time)` for active slots.
   - Atomic transactions (`transaction.atomic`) with row locks (`select_for_update`) during slot reservation.

2. **Access Control & IDOR Defense (FR-1.4, NFR-6, NFR-7)**
   - Role checks (`Patient`, `Doctor`, `Admin`) verified server-side on every request.
   - Record lookups by ID must verify ownership; unauthorized attempts return `404 Not Found` (blocking IDOR).

3. **Clinician Note Secrecy (FR-5.2)**
   - Consultation notes are readable **only** by the treating doctor.
   - Strictly excluded from Patient and Admin queries and API responses.

4. **Security Hardening (NFR-5, NFR-9, NFR-10, NFR-12)**
   - All database access via Django ORM with parameterized queries (SQL injection defense).
   - Session cookies flagged with `HttpOnly` and `SameSite=Lax/Strict`.
   - Production error pages (`DEBUG=False`) with zero stack traces, paths, or SQL queries exposed.
   - Account lockout after 5 consecutive failed login attempts within 10 minutes (NFR-12).

---

## Setup & Development (Quickstart)

```bash
# 1. Create and activate a virtual environment
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# 2. Install dependencies
pip install django psycopg2-binary argon2-cffi python-dotenv

# 3. Configure environment variables in .env
# DB_NAME=clinicq
# DB_USER=postgres
# DB_PASSWORD=your_password
# SECRET_KEY=your_django_secret_key

# 4. Run migrations
python manage.py migrate

# 5. Run test suite
python manage.py test

# 6. Start development server
python manage.py runserver
```
