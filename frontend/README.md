# ClinicQ Frontend (v1.0)

Production-grade, minimalist outpatient appointment and schedule register built in pure standard **HTML5, CSS3, and Vanilla JavaScript**.

## Design System & Aesthetic Directives
- **Palette**: Cream (`#F3EEE3`) background with Ink Black (`#111111`) typographic contrast and paper stationery surfaces (`#FAF8F5`).
- **Typography**: Editorial serif headings (`Newsreader`, `Charter`, `Georgia`) paired with clean system grotesque sans for body/tables, and tabular numerals for timings and reference IDs.
- **Minimalist Execution**: Zero AI-slop — no purple/cyan glowing tech gradients, no floating drop shadows, no glassmorphism blur, no decorative sparklines. Clean hairline borders and typographic hierarchy inspired by European/Japanese clinical appointment registers.
- **Portability & Responsive**: Fluid layout fully functional from mobile viewports (360px wide, NFR-14) up to desktop displays, with custom print layout (`@media print`) for master daily clinic schedules.

---

## Static Architecture & Data Flow
The application runs standalone in any standard modern web browser with no server-side build step or external dependencies required:
- `index.html`: Semantic single-page layout with role-governed views and modals.
- `style.css`: Minimalist cream-and-ink design system and print stylesheet.
- `data.js`: Baseline clean install state as specified in the PRD (Page 2 & 10: *"One Admin account is created at install; patients self-register; Admin creates doctor accounts and generates slots"*).
- `app.js`: Complete business rule and validation engine fulfilling all functional requirements (FR-1.1 through FR-6.3) with client-side persistence (`localStorage`).

---

## Run and Test Commands

### 1. Run Automated PRD Test Suite
To run the automated verification suite covering all 20 functional and non-functional requirements (M1 through M6):
```bash
node frontend/test_runner.js
```
Expected output:
```
========================================
ClinicQ Automated PRD Test Suite (M1-M6)
========================================
...
Test Execution Finished: 20 / 20 passed.
========================================
```

### 2. Run Local Web Server
To serve the frontend application locally on port 8000:
```bash
# Using Python
python -m http.server 8000 -d frontend

# Or using Node.js
npx serve frontend
```
Then navigate to `http://localhost:8000` in your browser. (The app also functions by double-clicking `frontend/index.html` directly in any web browser).

---

## Baseline Account & Authentication (At Installation)
Per PRD Page 2 & Page 10, the clean installation starts with one administrator account:
- **Email**: `admin@clinicq.local`
- **Password**: `admin`
- **Role**: `Admin`

### Starting Fresh Workflows:
1. **As Admin**: Log in with `admin@clinicq.local` / `admin`.
   - Go to **Doctors & Slot Generator** (UI-5).
   - Click **+ Add New Physician** to register clinical staff (e.g. Dr. Jane Watson, Cardiology).
   - Use the **Slot Generator Engine** to generate fixed-length consultation slots across date ranges.
2. **As Patient**:
   - Log out and click **New Patient** on the sign-in card.
   - Register with Name, Email (must be unique), Phone, and Password (FR-1.1).
   - Browse free slots by doctor and date (UI-2), and confirm bookings in **4 steps or fewer** (NFR-13).
   - View history and cancel upcoming appointments in **My Appointments** (UI-3).
3. **As Doctor**:
   - Log in using credentials created by the Admin.
   - Open **My Schedule** (UI-4) to see daily assigned appointments with patient contact information.
   - Mark appointments as **Completed** (FR-4.3) and record confidential **Consultation Notes** up to 2,000 characters (FR-5.1, strictly guarded from patients and admin via FR-5.2).

---

## Verification Traceability Matrix (IEEE 830)

| Requirement ID | Requirement Description | Implementation in Frontend |
|---|---|---|
| **FR-1.1** | Patient registers with unique email, name, phone, password | `app.handleRegister()`, email uniqueness verification |
| **FR-1.2** | Login with email and password; failed login shows single generic message | `app.handleLogin()`, display: *"Invalid email or password."* |
| **FR-1.3** | Session expires after 30 minutes of inactivity; user can log out | `app.startInactivityTimer()`, 30:00 countdown timer, activity event listeners, auto-logout |
| **FR-1.4 / NFR-6** | Role stored & checked on every action; UI hiding is not protection | Guard checks on every view transition, action, and modal trigger |
| **FR-1.5** | Admin creates doctor accounts | `app.handleCreateDoctor()` modal & validation |
| **FR-2.1** | Admin creates and edits doctor profiles (name, specialization) | `app.openEditDoctorModal()`, `app.handleUpdateDoctor()` |
| **FR-2.2** | Admin generates slots from date range, daily start/end, slot length | `app.handleGenerateSlots()` slot generator engine |
| **FR-2.3** | System refuses slots that overlap existing slot of same doctor or start in past | Overlap detection logic and past timestamp refusal in slot engine |
| **FR-2.4** | Admin removes a slot that has no booking | `app.removeSlot()` with unbooked verification check |
| **FR-3.1** | Patient picks doctor and date, sees free slots | `app.selectDoctorForBooking()`, `app.renderAvailableSlots()` |
| **FR-3.2** | Patient books one free slot; confirmation with doctor, date, time | 4-step booking workflow with instant confirmation receipt |
| **FR-3.3** | Slot has at most one active booking; second attempt sees *"This slot was just taken"* | Atomic status verification before write |
| **FR-3.4** | Booking is all-or-nothing in one transaction | Atomic state modification and synchronous persistence |
| **FR-3.5** | Patient cancels own upcoming appointment; slot becomes free | `app.patientCancelAppointment()`, releases slot back to Free |
| **FR-3.6** | Booking or cancelling slot whose start time has passed is refused | `app.isPastTime()` check on booking and cancellation |
| **FR-3.7** | Patient sees list of own appointments with status | `app.renderPatientAppointments()`, filtered strictly by `patientId` |
| **FR-3.8** | Patient cannot hold two active appointments at same date and time | `patientCollision` guard in `app.confirmBooking()` |
| **FR-4.1** | Doctor sees only own appointments, filtered by date (today by default) | `app.renderDoctorSchedule()`, filtered by `doctorProfile.id` and date |
| **FR-4.2** | Doctor sees patient name and phone for own appointments only | Rendered in doctor table; restricted from other doctors |
| **FR-4.3** | Doctor marks own appointment Completed | `app.markAppointmentCompleted()` |
| **FR-4.4** | Admin sees all appointments for a date, filterable by doctor, print layout | `app.renderAdminAllAppointments()`, `@media print` layout |
| **FR-4.5** | Admin cancels any appointment | `app.adminCancelAppointment()` |
| **FR-5.1** | Doctor adds and edits text note (up to 2,000 chars) on own appointment | `app.openNotesModal()`, character counter, 2,000 char validation |
| **FR-5.2** | Only treating doctor can read note; patients and Admin cannot | Enforced by strict doctor ID check; excluded from patient & admin views |
| **FR-6.1** | Record user, action, target and timestamp for sensitive actions | Append-only logging on login, booking, cancellation, slot generation, note view/edit |
| **FR-6.2** | No way to edit or delete log entries | Append-only store; no UI buttons or actions to mutate logs |
| **FR-6.3** | Admin views log newest first | `app.renderAdminAuditTable()`, reversed chronological display |
| **NFR-12** | 5 failed logins within 10 minutes locks account for 10 minutes | Lockout tracker in `app.handleLogin()` |
| **NFR-13** | Confirmed booking takes 4 steps or fewer after login | Step 1 (Doctor/Date) &rarr; Step 2 (Slot) &rarr; Step 3 (Review) &rarr; Step 4 (Confirmed) |
| **NFR-14** | Responsive from 360px wide | Fluid flexbox/grid layout and media queries in `style.css` |
