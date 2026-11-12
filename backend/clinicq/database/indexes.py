
from clinicq.database.connection import db


def create_indexes():
    """Create indexes required for ClinicQ data integrity."""

    # USERS: Every account must have a unique email.
    db.users.create_index(
        [("email", 1)],
        unique=True,
        name="unique_user_email"
    )

    # DOCTORS: One doctor profile per doctor account.
    db.doctors.create_index(
        [("user_id", 1)],
        unique=True,
        name="unique_doctor_user"
    )

    # SLOTS: A doctor cannot have two slots with the same start time.
    db.slots.create_index(
        [("doctor_id", 1), ("start_at", 1)],
        unique=True,
        name="unique_doctor_slot_start"
    )

    # SLOTS: Efficient doctor availability searches.
    db.slots.create_index(
        [("doctor_id", 1), ("status", 1), ("start_at", 1)],
        name="doctor_slot_lookup"
    )

    # APPOINTMENTS: Only one active booking per slot.
    db.appointments.create_index(
        [("slot_id", 1)],
        unique=True,
        partialFilterExpression={"status": "Booked"},
        name="unique_active_booking_per_slot"
    )

    # APPOINTMENTS: Patient appointment history.
    db.appointments.create_index(
        [("patient_id", 1), ("created_at", -1)],
        name="patient_appointment_history"
    )

    # APPOINTMENTS: Doctor schedules.
    db.appointments.create_index(
        [("doctor_id", 1), ("status", 1)],
        name="doctor_appointment_lookup"
    )

    # NOTES: One consultation note per appointment.
    db.consultation_notes.create_index(
        [("appointment_id", 1)],
        unique=True,
        name="unique_appointment_note"
    )

    # AUDIT LOGS: Newest activity first.
    db.audit_logs.create_index(
        [("created_at", -1)],
        name="audit_logs_newest_first"
    )

    print("All ClinicQ indexes created successfully.")
