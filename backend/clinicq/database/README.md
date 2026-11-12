# ClinicQ — MongoDB Database Documentation

## 1. Overview

ClinicQ uses MongoDB Atlas as its database and PyMongo as the Python database driver.

Database name: `clinicq`

## 2. Collections

| Collection | Description |
|---|---|
| users | Patient, Doctor and Admin accounts |
| doctors | Doctor profiles and specializations |
| slots | Doctor availability and appointment slots |
| appointments | Patient appointment records |
| consultation_notes | Private consultation notes |
| audit_logs | Sensitive activity records |

## 3. Database Structure

### users
- _id
- name
- email
- phone
- password_hash
- role

### doctors
- _id
- user_id
- specialization

### slots
- _id
- doctor_id
- start_at
- end_at
- status

### appointments
- _id
- slot_id
- patient_id
- doctor_id
- status
- created_at

### consultation_notes
- _id
- appointment_id
- doctor_id
- text
- updated_at

### audit_logs
- _id
- user_id
- action
- target_type
- target_id
- created_at

## 4. Relationships

- Doctor references a User.
- Slot references a Doctor.
- Appointment references a Patient, Doctor and Slot.
- Consultation Note references an Appointment and Doctor.
- Audit Log references a User and its target record.

References use MongoDB ObjectId values.

## 5. Indexes

- Unique user email.
- Unique doctor user reference.
- Unique doctor and slot start time.
- Active appointment uniqueness per slot.
- Patient appointment history.
- Doctor appointment lookup.
- Unique consultation note per appointment.
- Audit logs sorted by creation time.

## 6. Database Configuration

MongoDB connection settings are stored in the backend `.env` file.

Required variables:

- MONGODB_URI
- MONGODB_DATABASE

Never commit database credentials to GitHub.

## 7. Database Module Files

- connection.py — MongoDB connection.
- collections.py — Collection initialization.
- indexes.py — Database indexes.
- validators.py — MongoDB document validation.
- schemas.py — Document construction helpers.
- relationships.py — Collection reference definitions.

## 8. Technology

- MongoDB Atlas
- MongoDB Compass
- PyMongo
- Python
- Django

## 9. Important Notes

MongoDB references are not automatically enforced as foreign keys. Referential integrity, ownership checks and transactional booking operations must be implemented by the backend application.

Consultation notes must only be accessible to the treating doctor. Audit records should be protected against modification and deletion.

This database design follows the ClinicQ product requirements while adapting the relational data model to MongoDB.
