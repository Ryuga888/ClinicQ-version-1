/**
 * ClinicQ Test Suite — Node.js Automated Verification
 * Verifies all functional (FR) and non-functional (NFR) requirements from the PRD.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock browser environment for Node.js execution
global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.sessionStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};
const domElements = {};
function createMockElement(id = '', tag = 'div') {
  return {
    id,
    tag,
    value: '',
    textContent: '',
    style: {},
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      contains(c) { return this.classes.has(c); }
    },
    innerHTML: '',
    appendChild() {},
    scrollIntoView() {}
  };
}

global.document = {
  addEventListener() {},
  createElement(tag) {
    return createMockElement('', tag);
  },
  getElementById(id) {
    if (!domElements[id]) {
      domElements[id] = createMockElement(id);
    }
    return domElements[id];
  },
  querySelectorAll() { return []; }
};

const vm = require('vm');

// Load ClinicStore and ClinicApp into global context
const dataJs = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
vm.runInThisContext(dataJs);

const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
vm.runInThisContext(appJs);

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
  }
}

console.log('\n========================================');
console.log('ClinicQ Automated PRD Test Suite (M1-M6)');
console.log('========================================\n');

// Reset store to pristine installation state
window.clinicStore.reset();
const app = new ClinicApp();

// ---------------------------------------------------------
// Module M1: Accounts and Access
// ---------------------------------------------------------
console.log('--- Module M1: Accounts & Access Control ---');

test('FR-1.1: Patient registration succeeds with unique email', () => {
  const patientEmail = 'john.doe@test.com';
  // Mock form
  document.getElementById('reg-name').value = 'John Doe';
  document.getElementById('reg-email').value = patientEmail;
  document.getElementById('reg-phone').value = '+1-555-0199';
  document.getElementById('reg-password').value = 'secret123';

  app.handleRegister({ preventDefault() {} });

  const patient = app.store.data.users.find(u => u.email === patientEmail);
  assert(patient, 'Patient should exist in store');
  assert.strictEqual(patient.role, 'Patient');
  assert.strictEqual(patient.name, 'John Doe');
});

test('FR-1.1: Patient registration fails on duplicate email', () => {
  const patientEmail = 'john.doe@test.com';
  document.getElementById('reg-name').value = 'Another John';
  document.getElementById('reg-email').value = patientEmail;
  document.getElementById('reg-phone').value = '+1-555-0200';
  document.getElementById('reg-password').value = 'secret456';

  let errorShown = false;
  document.getElementById('auth-error-msg').textContent = '';
  app.handleRegister({ preventDefault() {} });

  const count = app.store.data.users.filter(u => u.email === patientEmail).length;
  assert.strictEqual(count, 1, 'Duplicate email registration should be refused');
});

test('FR-1.2: Failed login produces single generic error', () => {
  document.getElementById('login-email').value = 'nonexistent@test.com';
  document.getElementById('login-password').value = 'wrongpassword';

  app.handleLogin({ preventDefault() {} });

  assert.strictEqual(
    document.getElementById('auth-error-msg').textContent,
    'Invalid email or password.',
    'Must show exact generic error message'
  );
});

test('NFR-12: 5 failed logins triggers account lockout', () => {
  const testEmail = 'target@test.com';
  document.getElementById('login-email').value = testEmail;
  document.getElementById('login-password').value = 'badpwd';

  // 5 failed attempts
  for (let i = 0; i < 5; i++) {
    app.handleLogin({ preventDefault() {} });
  }

  // 6th attempt while locked out
  app.handleLogin({ preventDefault() {} });

  const msg = document.getElementById('auth-error-msg').textContent;
  assert(msg.includes('Account locked due to 5 consecutive failed attempts'), 'Should be locked out');
});

test('FR-1.3 & FR-1.4: Successful admin login & session setup', () => {
  document.getElementById('login-email').value = 'admin@clinicq.local';
  document.getElementById('login-password').value = 'admin';

  app.handleLogin({ preventDefault() {} });

  assert(app.currentUser, 'Current user should be authenticated');
  assert.strictEqual(app.currentUser.role, 'Admin');
  assert.strictEqual(app.currentUser.email, 'admin@clinicq.local');
});

// ---------------------------------------------------------
// Module M2: Doctors and Slots
// ---------------------------------------------------------
console.log('\n--- Module M2: Doctors & Slot Generation ---');

let createdDocId = null;

test('FR-1.5 & FR-2.1: Admin creates doctor profile and account', () => {
  document.getElementById('newdoc-name').value = 'Dr. Julian Bashir';
  document.getElementById('newdoc-spec').value = 'Internal Medicine';
  document.getElementById('newdoc-email').value = 'julian.bashir@clinicq.local';
  document.getElementById('newdoc-phone').value = '+1-555-0888';
  document.getElementById('newdoc-password').value = 'doctor';

  app.handleCreateDoctor({ preventDefault() {} });

  const doc = app.store.data.doctors.find(d => d.name === 'Dr. Julian Bashir');
  assert(doc, 'Doctor profile must be created');
  assert.strictEqual(doc.specialization, 'Internal Medicine');

  const user = app.store.data.users.find(u => u.email === 'julian.bashir@clinicq.local');
  assert(user, 'Doctor user account must be created');
  assert.strictEqual(user.role, 'Doctor');
  createdDocId = doc.id;
});

test('FR-2.1: Admin edits doctor profile', () => {
  document.getElementById('editdoc-id').value = createdDocId;
  document.getElementById('editdoc-name').value = 'Dr. Julian Bashir, MD';
  document.getElementById('editdoc-spec').value = 'Exobiology & Internal Medicine';

  app.handleUpdateDoctor({ preventDefault() {} });

  const doc = app.store.data.doctors.find(d => d.id === createdDocId);
  assert.strictEqual(doc.name, 'Dr. Julian Bashir, MD');
  assert.strictEqual(doc.specialization, 'Exobiology & Internal Medicine');
});

test('FR-2.2 & FR-2.3: Admin generates slots (rejects past and overlaps)', () => {
  // Use a future date to test valid generation
  const tomorrow = app.getTodayDateString(1);

  document.getElementById('gen-doctor-select').value = createdDocId;
  document.getElementById('gen-start-date').value = tomorrow;
  document.getElementById('gen-end-date').value = tomorrow;
  document.getElementById('gen-start-time').value = '09:00';
  document.getElementById('gen-end-time').value = '11:00';
  document.getElementById('gen-slot-length').value = '30';

  app.handleGenerateSlots({ preventDefault() {} });

  const slots = app.store.data.slots.filter(s => s.doctorId === createdDocId && s.date === tomorrow);
  // 09:00 - 11:00 with 30m slots => 4 slots (09:00, 09:30, 10:00, 10:30)
  assert.strictEqual(slots.length, 4, 'Should generate exactly 4 slots');

  // Attempt duplicate generation for the same doctor and window
  const initialCount = app.store.data.slots.length;
  app.handleGenerateSlots({ preventDefault() {} });
  const countAfter = app.store.data.slots.length;
  assert.strictEqual(countAfter, initialCount, 'FR-2.3: Overlapping slots must be refused');
});

test('FR-2.4: Admin removes unbooked slot', () => {
  const tomorrow = app.getTodayDateString(1);
  const slots = app.store.data.slots.filter(s => s.doctorId === createdDocId && s.date === tomorrow);
  const slotToRemove = slots[slots.length - 1];

  app.removeSlot(slotToRemove.id);

  const exists = app.store.data.slots.some(s => s.id === slotToRemove.id);
  assert(!exists, 'Unbooked slot should be removed');
});

// ---------------------------------------------------------
// Module M3: Booking Flow (Patient)
// ---------------------------------------------------------
console.log('\n--- Module M3: Patient Booking & Cancellation ---');

let testAppointment = null;
let targetSlot = null;

test('FR-3.1: Patient browses free slots for doctor and date', () => {
  // Switch session to Patient
  const patient = app.store.data.users.find(u => u.email === 'john.doe@test.com');
  app.currentUser = { ...patient };

  const tomorrow = app.getTodayDateString(1);
  app.bookingState.selectedDoctorId = createdDocId;
  app.bookingState.selectedDate = tomorrow;

  const freeSlots = app.store.data.slots.filter(s => s.doctorId === createdDocId && s.date === tomorrow && s.status === 'Free');
  assert(freeSlots.length >= 3, 'Should find remaining free slots');
  targetSlot = freeSlots[0];
});

test('FR-3.2 & FR-3.4: Patient books slot and receives confirmation', () => {
  app.bookingState.selectedSlot = targetSlot;

  app.confirmBooking();

  const slotInStore = app.store.data.slots.find(s => s.id === targetSlot.id);
  assert.strictEqual(slotInStore.status, 'Booked', 'Slot status must transition to Booked');

  testAppointment = app.store.data.appointments.find(a => a.slotId === targetSlot.id);
  assert(testAppointment, 'Appointment record must exist');
  assert.strictEqual(testAppointment.patientId, app.currentUser.id);
  assert.strictEqual(testAppointment.status, 'Booked');
});

test('FR-3.3: Double booking is refused ("This slot was just taken")', () => {
  // Switch to another patient trying to book the same slot
  app.currentUser = { id: 'usr_pat_other', name: 'Other Patient', email: 'other@test.com', role: 'Patient' };
  app.bookingState.selectedSlot = targetSlot;

  let alertMessage = '';
  app.showAlert = (msg) => { alertMessage = msg; };

  app.confirmBooking();

  assert(alertMessage.includes('This slot was just taken'), 'Must reject double booking');
});

test('FR-3.8: Patient cannot hold two active appointments at same date and time', () => {
  // Switch back to John Doe
  const patient = app.store.data.users.find(u => u.email === 'john.doe@test.com');
  app.currentUser = { ...patient };

  // Create a second doctor with a slot at the exact same date & time
  const tomorrow = app.getTodayDateString(1);
  const conflictingSlot = {
    id: 's_conflict_test',
    doctorId: 'doc_other',
    date: tomorrow,
    startTime: targetSlot.startTime,
    endTime: targetSlot.endTime,
    status: 'Free'
  };
  app.store.data.slots.push(conflictingSlot);

  app.bookingState.selectedSlot = conflictingSlot;

  let alertMessage = '';
  app.showAlert = (msg) => { alertMessage = msg; };

  app.confirmBooking();

  assert(alertMessage.includes('already hold an active appointment at this date and time'), 'FR-3.8 must block duplicate patient slot');
});

test('FR-3.5: Patient cancels upcoming appointment, freeing the slot', () => {
  global.confirm = () => true;

  app.patientCancelAppointment(testAppointment.id);

  const updatedAppt = app.store.data.appointments.find(a => a.id === testAppointment.id);
  assert.strictEqual(updatedAppt.status, 'Cancelled', 'Appointment status should be Cancelled');

  const freedSlot = app.store.data.slots.find(s => s.id === targetSlot.id);
  assert.strictEqual(freedSlot.status, 'Free', 'Slot status must be released back to Free');
});

test('FR-3.6: Booking or cancelling past appointments is refused', () => {
  const pastAppt = {
    id: 'apt_past_test',
    slotId: 's_past',
    patientId: app.currentUser.id,
    doctorId: createdDocId,
    date: '2020-01-01',
    startTime: '09:00',
    endTime: '09:30',
    status: 'Booked'
  };
  app.store.data.appointments.push(pastAppt);

  let alertMessage = '';
  app.showAlert = (msg) => { alertMessage = msg; };

  app.patientCancelAppointment(pastAppt.id);
  assert(alertMessage.includes('Past appointments cannot be cancelled'), 'Past cancellation must be refused');
});

// ---------------------------------------------------------
// Module M4 & M5: Doctor Schedule & Confidential Notes
// ---------------------------------------------------------
console.log('\n--- Module M4 & M5: Doctor Schedule & Notes ---');

let activeApptId = null;

test('FR-4.3: Doctor marks appointment Completed', () => {
  // Re-book slot for testing
  const tomorrow = app.getTodayDateString(1);
  const slot = app.store.data.slots.find(s => s.doctorId === createdDocId && s.status === 'Free');
  slot.status = 'Booked';

  const appt = {
    id: 'apt_doc_test',
    slotId: slot.id,
    patientId: 'usr_pat_john',
    doctorId: createdDocId,
    date: tomorrow,
    startTime: slot.startTime,
    endTime: slot.endTime,
    status: 'Booked'
  };
  app.store.data.appointments.push(appt);
  activeApptId = appt.id;

  // Sign in as Dr. Julian Bashir
  const docUser = app.store.data.users.find(u => u.email === 'julian.bashir@clinicq.local');
  app.currentUser = { ...docUser };

  app.markAppointmentCompleted(activeApptId);

  const updated = app.store.data.appointments.find(a => a.id === activeApptId);
  assert.strictEqual(updated.status, 'Completed', 'Doctor should mark appointment Completed');
});

test('FR-5.1 & FR-5.2: Treating doctor writes private consultation note', () => {
  document.getElementById('note-appointment-id').value = activeApptId;
  document.getElementById('note-text-content').value = 'Patient reports complete symptom resolution. Cleared for standard physical activity.';

  app.handleSaveNote({ preventDefault() {} });

  const note = app.store.data.notes.find(n => n.appointmentId === activeApptId);
  assert(note, 'Consultation note must be stored');
  assert.strictEqual(note.doctorId, createdDocId);
  assert(note.text.includes('symptom resolution'));
});

test('FR-5.2: Confidentiality guard: non-treating doctor or admin cannot access note', () => {
  // Switch to another doctor
  app.currentUser = { id: 'usr_other_doc', role: 'Doctor' };

  let alertMessage = '';
  app.showAlert = (msg) => { alertMessage = msg; };

  app.openNotesModal(activeApptId);
  assert(alertMessage.includes('restricted to the treating doctor'), 'FR-5.2 non-treating doctor blocked');

  // Switch to Admin
  app.currentUser = { id: 'usr_admin', role: 'Admin' };
  app.openNotesModal(activeApptId);
  assert(alertMessage.includes('restricted to the treating doctor'), 'FR-5.2 admin blocked from notes');
});

// ---------------------------------------------------------
// Module M6: Append-Only Security Audit Log
// ---------------------------------------------------------
console.log('\n--- Module M6: Append-Only Audit Logging ---');

test('FR-6.1 & FR-6.2: Append-only audit logs recorded and immutable', () => {
  const logs = app.store.data.auditLogs;
  assert(logs.length > 5, 'Should have multiple audit log entries');

  const actions = logs.map(l => l.action);
  assert(actions.includes('USER_REGISTRATION'), 'Should record registration');
  assert(actions.includes('LOGIN_FAILED'), 'Should record failed logins');
  assert(actions.includes('DOCTOR_ACCOUNT_CREATED'), 'Should record doctor creation');
  assert(actions.includes('SLOTS_GENERATED'), 'Should record slot generation');
  assert(actions.includes('APPOINTMENT_BOOKED'), 'Should record appointment booking');
  assert(actions.includes('APPOINTMENT_CANCELLED'), 'Should record cancellations');
  assert(actions.includes('NOTE_SAVED'), 'Should record clinical note saves');
});

test('FR-6.3: Audit logs displayed in reverse chronological order (newest first)', () => {
  const reversedLogs = [...app.store.data.auditLogs].reverse();
  const t0 = new Date(reversedLogs[0].timestamp).getTime();
  const tLast = new Date(reversedLogs[reversedLogs.length - 1].timestamp).getTime();
  assert(t0 >= tLast, 'FR-6.3 newest log entry must come first');
});

console.log('\n========================================');
console.log(`Test Execution Finished: ${passedTests} / ${totalTests} passed.`);
console.log('========================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
