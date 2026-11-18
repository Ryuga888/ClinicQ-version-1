/**
 * ClinicQ — Application Controller
 * Outpatient Appointment & Schedule Register
 * Integrated with Django Backend API & Static Store Fallback
 */

const API_BASE = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http'))
  ? `${window.location.origin}/api`
  : 'http://localhost:8000/api';

class ClinicApp {
  constructor() {
    this.store = window.clinicStore;
    this.currentUser = null;
    this.currentView = null;
    this.authTab = 'login'; // 'login' or 'register'
    this.useBackend = false;

    // Security & Inactivity tracking
    this.inactivitySeconds = 30 * 60; // 30 minutes
    this.inactivityTimer = null;
    this.failedLoginAttempts = {}; // { email: { count, lastFailedTime } }

    // Patient booking workflow state
    this.bookingState = {
      selectedDoctorId: null,
      selectedDate: this.getTodayDateString(),
      selectedSlot: null
    };

    // Initialize
    this.initEventListeners();
    this.detectBackend();
  }

  async detectBackend() {
    try {
      if (typeof fetch === 'function' && typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
        if (res.ok) {
          this.useBackend = true;
          const data = await res.json();
          if (data && data.user) {
            this.currentUser = data.user;
            this.onUserLoggedIn();
            return;
          }
        }
      }
    } catch (e) {
      this.useBackend = false;
    }
    this.checkSession();
  }

  // --- Utilities & Helpers ---
  getTodayDateString(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  isPastTime(dateStr, timeStr) {
    const target = new Date(`${dateStr}T${timeStr}:00`);
    return target.getTime() < Date.now();
  }

  formatTimeDisplay(timeStr) {
    if (!timeStr) return '';
    return timeStr;
  }

  // Escape HTML to prevent cross-site scripting
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  showAlert(message, type = 'info') {
    const alertEl = document.getElementById('system-alert');
    const msgEl = document.getElementById('system-alert-msg');
    alertEl.className = `cq-alert cq-alert-${type} no-print`;
    msgEl.textContent = message;
    alertEl.style.display = 'flex';
  }

  closeAlert() {
    const alertEl = document.getElementById('system-alert');
    alertEl.style.display = 'none';
  }

  // --- Activity Tracking & 30-min Session Inactivity ---
  resetInactivity() {
    this.inactivitySeconds = 30 * 60;
  }

  startInactivityTimer() {
    clearInterval(this.inactivityTimer);
    this.inactivitySeconds = 30 * 60;

    const updateDisplay = () => {
      const minutes = Math.floor(this.inactivitySeconds / 60);
      const seconds = this.inactivitySeconds % 60;
      const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      const timerEl = document.getElementById('session-timer');
      if (timerEl) timerEl.textContent = display;

      if (this.inactivitySeconds <= 0) {
        clearInterval(this.inactivityTimer);
        this.handleAutoLogout();
      } else {
        this.inactivitySeconds--;
      }
    };

    updateDisplay();
    this.inactivityTimer = setInterval(updateDisplay, 1000);
  }

  handleAutoLogout() {
    if (this.currentUser) {
      if (!this.useBackend) {
        this.store.logAction(
          this.currentUser,
          'SESSION_EXPIRED',
          'USER',
          this.currentUser.id,
          'Session terminated due to 30 minutes of inactivity.'
        );
      }
      this.logout(false);
      this.showAlert('Your session expired due to 30 minutes of inactivity. Please sign in again.', 'info');
    }
  }

  initEventListeners() {
    const resetEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    resetEvents.forEach(evt => {
      window.addEventListener(evt, () => {
        if (this.currentUser) this.resetInactivity();
      }, { passive: true });
    });
  }

  // --- Authentication Flow ---
  checkSession() {
    const savedUser = sessionStorage.getItem('clinicq_current_user');
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
        this.onUserLoggedIn();
        return;
      } catch (e) {
        sessionStorage.removeItem('clinicq_current_user');
      }
    }
    this.showAuthView();
  }

  setAuthTab(tab) {
    this.authTab = tab;
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');
    const tabLoginBtn = document.getElementById('tab-login-btn');
    const tabRegBtn = document.getElementById('tab-register-btn');
    const titleEl = document.getElementById('auth-view-title');
    const authErr = document.getElementById('auth-error');

    authErr.style.display = 'none';

    if (tab === 'login') {
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
      tabLoginBtn.className = 'cq-btn cq-btn-sm cq-btn-primary';
      tabRegBtn.className = 'cq-btn cq-btn-sm cq-btn-secondary';
      titleEl.textContent = 'Portal Sign In';
    } else {
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
      tabLoginBtn.className = 'cq-btn cq-btn-sm cq-btn-secondary';
      tabRegBtn.className = 'cq-btn cq-btn-sm cq-btn-primary';
      titleEl.textContent = 'Patient Registration';
    }
  }

  async handleLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const authErrorEl = document.getElementById('auth-error');
    const authErrorMsg = document.getElementById('auth-error-msg');

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) {
          authErrorMsg.textContent = data.error || 'Invalid email or password.';
          authErrorEl.style.display = 'block';
          return;
        }

        authErrorEl.style.display = 'none';
        this.currentUser = data.user;
        sessionStorage.setItem('clinicq_current_user', JSON.stringify(this.currentUser));
        this.onUserLoggedIn();
        return;
      } catch (err) {
        console.warn('Backend login failed, attempting local fallback', err);
      }
    }

    // Fallback: Local validation
    const now = Date.now();
    const failedInfo = this.failedLoginAttempts[email];
    if (failedInfo && failedInfo.count >= 5 && (now - failedInfo.lastFailedTime) < 10 * 60 * 1000) {
      const waitMins = Math.ceil((10 * 60 * 1000 - (now - failedInfo.lastFailedTime)) / 60000);
      authErrorMsg.textContent = `Account locked due to 5 consecutive failed attempts. Please wait ${waitMins} minute(s).`;
      authErrorEl.style.display = 'block';
      return;
    }

    const user = this.store.data.users.find(u => u.email.toLowerCase() === email && u.password === password);

    if (!user) {
      if (!this.failedLoginAttempts[email]) {
        this.failedLoginAttempts[email] = { count: 1, lastFailedTime: now };
      } else {
        this.failedLoginAttempts[email].count++;
        this.failedLoginAttempts[email].lastFailedTime = now;
      }

      this.store.logAction(null, 'LOGIN_FAILED', 'USER', email, 'Failed authentication attempt.');
      authErrorMsg.textContent = 'Invalid email or password.';
      authErrorEl.style.display = 'block';
      return;
    }

    delete this.failedLoginAttempts[email];
    authErrorEl.style.display = 'none';

    this.currentUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role
    };

    sessionStorage.setItem('clinicq_current_user', JSON.stringify(this.currentUser));
    this.store.logAction(this.currentUser, 'LOGIN_SUCCESS', 'USER', user.id, `User signed in with role: ${user.role}`);
    this.onUserLoggedIn();
  }

  async handleRegister(e) {
    if (e && e.preventDefault) e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;

    const authErrorEl = document.getElementById('auth-error');
    const authErrorMsg = document.getElementById('auth-error-msg');

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, email, phone, password })
        });
        const data = await res.json();
        if (!res.ok) {
          authErrorMsg.textContent = data.error || 'Registration failed.';
          authErrorEl.style.display = 'block';
          return;
        }

        authErrorEl.style.display = 'none';
        this.currentUser = data.user;
        sessionStorage.setItem('clinicq_current_user', JSON.stringify(this.currentUser));
        this.showAlert(`Welcome, ${this.currentUser.name}. Your patient registration is complete.`, 'success');
        this.onUserLoggedIn();
        return;
      } catch (err) {
        console.warn('Backend register failed, attempting local fallback', err);
      }
    }

    // Fallback: Local registration
    const existing = this.store.data.users.find(u => u.email.toLowerCase() === email);
    if (existing) {
      authErrorMsg.textContent = 'An account with this email address already exists. Please sign in or use a different email.';
      authErrorEl.style.display = 'block';
      return;
    }

    const newUser = {
      id: 'usr_pat_' + Date.now(),
      name,
      email,
      phone,
      password,
      role: 'Patient'
    };

    this.store.data.users.push(newUser);
    this.store.save();

    this.store.logAction(newUser, 'USER_REGISTRATION', 'USER', newUser.id, `Patient self-registered with email ${email}`);

    this.currentUser = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: 'Patient'
    };

    sessionStorage.setItem('clinicq_current_user', JSON.stringify(this.currentUser));
    this.showAlert(`Welcome, ${newUser.name}. Your patient registration is complete.`, 'success');
    this.onUserLoggedIn();
  }

  async logout(shouldLog = true) {
    if (this.useBackend) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          credentials: 'include'
        });
      } catch (e) {}
    } else if (shouldLog && this.currentUser) {
      this.store.logAction(this.currentUser, 'LOGOUT', 'USER', this.currentUser.id, 'User explicitly logged out.');
    }

    this.currentUser = null;
    sessionStorage.removeItem('clinicq_current_user');
    clearInterval(this.inactivityTimer);
    this.showAuthView();
  }

  showAuthView() {
    this.hideAllViews();
    document.getElementById('view-auth').style.display = 'block';
    document.getElementById('main-nav').style.display = 'none';
    document.getElementById('session-container').style.display = 'none';
    document.getElementById('user-badge').textContent = 'Guest';

    const authActions = document.getElementById('auth-actions-header');
    authActions.innerHTML = `<span style="font-size: 0.85rem; color: var(--color-ink-muted);">Please sign in</span>`;
    this.setAuthTab('login');
  }

  onUserLoggedIn() {
    this.closeAlert();
    this.startInactivityTimer();

    // Update Header and Topbar
    document.getElementById('session-container').style.display = 'inline-block';
    document.getElementById('user-badge').textContent = `${this.currentUser.name} (${this.currentUser.role})`;

    const authActions = document.getElementById('auth-actions-header');
    authActions.innerHTML = `
      <span style="font-size: 0.875rem; font-weight: 500;">Signed in as <strong>${this.escapeHtml(this.currentUser.name)}</strong></span>
      <button type="button" class="cq-btn cq-btn-sm cq-btn-secondary" onclick="app.logout()">Log Out</button>
    `;

    // Render Navigation Tabs based on Role
    this.renderNavigation();

    // Route to initial default view per role
    if (this.currentUser.role === 'Patient') {
      this.navigateTo('find-doctor');
    } else if (this.currentUser.role === 'Doctor') {
      this.navigateTo('doctor-schedule');
    } else if (this.currentUser.role === 'Admin') {
      this.navigateTo('admin-doctors');
    }
  }

  // --- Role-Based Navigation & Access Control ---
  renderNavigation() {
    const navBar = document.getElementById('main-nav');
    const tabsList = document.getElementById('nav-tabs-list');
    navBar.style.display = 'block';
    tabsList.innerHTML = '';

    const role = this.currentUser.role;

    if (role === 'Patient') {
      tabsList.innerHTML = `
        <li><button type="button" class="cq-nav-tab" id="nav-find-doctor" onclick="app.navigateTo('find-doctor')">Find a Doctor &amp; Book</button></li>
        <li><button type="button" class="cq-nav-tab" id="nav-patient-appointments" onclick="app.navigateTo('patient-appointments')">My Appointments</button></li>
      `;
    } else if (role === 'Doctor') {
      tabsList.innerHTML = `
        <li><button type="button" class="cq-nav-tab" id="nav-doctor-schedule" onclick="app.navigateTo('doctor-schedule')">My Schedule</button></li>
      `;
    } else if (role === 'Admin') {
      tabsList.innerHTML = `
        <li><button type="button" class="cq-nav-tab" id="nav-admin-doctors" onclick="app.navigateTo('admin-doctors')">Doctors &amp; Slot Generator</button></li>
        <li><button type="button" class="cq-nav-tab" id="nav-admin-all-appointments" onclick="app.navigateTo('admin-all-appointments')">All Appointments (Master)</button></li>
        <li><button type="button" class="cq-nav-tab" id="nav-admin-audit" onclick="app.navigateTo('admin-audit')">Security Audit Log</button></li>
      `;
    }
  }

  hideAllViews() {
    const views = document.querySelectorAll('.cq-view');
    views.forEach(v => v.style.display = 'none');
  }

  navigateTo(viewName) {
    if (!this.currentUser) {
      this.showAuthView();
      return;
    }

    const role = this.currentUser.role;
    const patientViews = ['find-doctor', 'patient-appointments'];
    const doctorViews = ['doctor-schedule'];
    const adminViews = ['admin-doctors', 'admin-all-appointments', 'admin-audit'];

    if (patientViews.includes(viewName) && role !== 'Patient') {
      this.showAlert('Access Denied: Screen restricted to Patient accounts.', 'danger');
      return;
    }
    if (doctorViews.includes(viewName) && role !== 'Doctor') {
      this.showAlert('Access Denied: Screen restricted to Doctor accounts.', 'danger');
      return;
    }
    if (adminViews.includes(viewName) && role !== 'Admin') {
      this.showAlert('Access Denied: Screen restricted to Administrator accounts.', 'danger');
      return;
    }

    this.hideAllViews();
    this.currentView = viewName;

    document.querySelectorAll('.cq-nav-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById(`nav-${viewName}`);
    if (activeTab) activeTab.classList.add('active');

    if (viewName === 'find-doctor') {
      document.getElementById('view-find-doctor').style.display = 'block';
      this.setupBookingView();
    } else if (viewName === 'patient-appointments') {
      document.getElementById('view-patient-appointments').style.display = 'block';
      this.renderPatientAppointments();
    } else if (viewName === 'doctor-schedule') {
      document.getElementById('view-doctor-schedule').style.display = 'block';
      this.setupDoctorScheduleView();
    } else if (viewName === 'admin-doctors') {
      document.getElementById('view-admin-doctors').style.display = 'block';
      this.setupAdminDoctorsView();
    } else if (viewName === 'admin-all-appointments') {
      document.getElementById('view-admin-all-appointments').style.display = 'block';
      this.setupAdminAllAppointmentsView();
    } else if (viewName === 'admin-audit') {
      document.getElementById('view-admin-audit').style.display = 'block';
      this.renderAdminAuditTable();
    }
  }

  // --- Patient Booking Flow ---
  setupBookingView() {
    const dateInput = document.getElementById('patient-booking-date');
    if (!dateInput.value) {
      dateInput.value = this.getTodayDateString();
    }
    this.bookingState.selectedDate = dateInput.value;
    this.resetBookingFlow();
    this.renderDoctorSelector();
  }

  setStepIndicator(stepNumber) {
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`step-ind-${i}`);
      if (!el) continue;
      el.classList.remove('active', 'completed');
      if (i < stepNumber) {
        el.classList.add('completed');
      } else if (i === stepNumber) {
        el.classList.add('active');
      }
    }
  }

  resetBookingFlow() {
    this.bookingState.selectedSlot = null;
    this.setStepIndicator(1);
    document.getElementById('booking-selection-panel').style.display = 'block';
    document.getElementById('booking-review-panel').style.display = 'none';
    document.getElementById('booking-confirmed-panel').style.display = 'none';
  }

  async renderDoctorSelector() {
    const listEl = document.getElementById('patient-doctor-list');
    const noticeEl = document.getElementById('no-doctors-notice');
    listEl.innerHTML = '';

    let doctors = [];
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/clinic/doctors`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          doctors = data.doctors || [];
        }
      } catch (e) {}
    } else {
      doctors = this.store.data.doctors || [];
    }

    if (!doctors || doctors.length === 0) {
      noticeEl.style.display = 'block';
      document.getElementById('patient-slots-container').style.display = 'none';
      return;
    }

    noticeEl.style.display = 'none';

    doctors.forEach(doc => {
      const isSelected = this.bookingState.selectedDoctorId === doc.id;
      const card = document.createElement('div');
      card.className = `cq-doc-item ${isSelected ? 'selected' : ''}`;
      card.onclick = () => this.selectDoctorForBooking(doc);
      card.innerHTML = `
        <div class="cq-doc-name">${this.escapeHtml(doc.name)}</div>
        <div class="cq-doc-spec">${this.escapeHtml(doc.specialization)}</div>
      `;
      listEl.appendChild(card);
    });

    if (this.bookingState.selectedDoctorId) {
      this.renderAvailableSlots();
    }
  }

  selectDoctorForBooking(doctorOrId) {
    if (typeof doctorOrId === 'object') {
      this.bookingState.selectedDoctorId = doctorOrId.id;
      this.bookingState.selectedDoctor = doctorOrId;
    } else {
      this.bookingState.selectedDoctorId = doctorOrId;
    }
    this.bookingState.selectedSlot = null;
    this.renderDoctorSelector();
    this.renderAvailableSlots();
  }

  handleDateOrDoctorChange() {
    const dateInput = document.getElementById('patient-booking-date');
    this.bookingState.selectedDate = dateInput.value;
    this.bookingState.selectedSlot = null;
    if (this.bookingState.selectedDoctorId) {
      this.renderAvailableSlots();
    }
  }

  async renderAvailableSlots() {
    const container = document.getElementById('patient-slots-container');
    const grid = document.getElementById('slots-grid-list');
    const countLabel = document.getElementById('slots-count-label');
    const noSlotsNotice = document.getElementById('no-slots-notice');

    container.style.display = 'block';
    grid.innerHTML = '';

    const doctorId = this.bookingState.selectedDoctorId;
    const date = this.bookingState.selectedDate;

    let allSlots = [];
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/clinic/slots?doctor_id=${doctorId}&date=${date}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          allSlots = data.slots || [];
        }
      } catch (e) {}
    } else {
      allSlots = this.store.data.slots.filter(s => s.doctorId === doctorId && s.date === date);
    }

    const freeSlots = allSlots.filter(s => s.status === 'Free' && !s.isPast && !this.isPastTime(s.date, s.startTime));
    countLabel.textContent = `${freeSlots.length} available out of ${allSlots.length} slots`;

    if (freeSlots.length === 0) {
      noSlotsNotice.style.display = 'block';
      return;
    }

    noSlotsNotice.style.display = 'none';
    allSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    allSlots.forEach(slot => {
      const isPast = slot.isPast || this.isPastTime(slot.date, slot.startTime);
      const isBooked = slot.status === 'Booked' || isPast;
      const isSelected = this.bookingState.selectedSlot && this.bookingState.selectedSlot.id === slot.id;

      const card = document.createElement('div');
      card.className = `cq-slot-card ${isBooked ? 'booked' : ''} ${isSelected ? 'selected' : ''}`;

      let badgeLabel = 'Available';
      if (isPast) {
        badgeLabel = 'Past';
      } else if (slot.status === 'Booked') {
        badgeLabel = 'Reserved';
      }

      card.innerHTML = `
        <span class="cq-slot-time cq-tabular">${slot.startTime} &ndash; ${slot.endTime}</span>
        <span class="cq-slot-badge">${badgeLabel}</span>
      `;

      if (!isBooked) {
        card.onclick = () => this.selectSlotForBooking(slot);
      }

      grid.appendChild(card);
    });
  }

  selectSlotForBooking(slot) {
    this.bookingState.selectedSlot = slot;
    this.setStepIndicator(2);
    this.renderAvailableSlots();

    this.setStepIndicator(3);
    const doc = this.bookingState.selectedDoctor || (this.store && this.store.data.doctors ? this.store.data.doctors.find(d => d.id === this.bookingState.selectedDoctorId) : null);

    document.getElementById('review-doc-name').textContent = doc ? doc.name : 'Physician';
    document.getElementById('review-doc-spec').textContent = doc ? doc.specialization : '';
    document.getElementById('review-datetime').textContent = `${slot.date} at ${slot.startTime} – ${slot.endTime}`;
    document.getElementById('review-duration').textContent = `Fixed-length consultation window`;
    document.getElementById('review-patient-name').textContent = this.currentUser.name;
    document.getElementById('review-patient-phone').textContent = this.currentUser.phone;

    document.getElementById('booking-review-panel').style.display = 'block';
    document.getElementById('booking-review-panel').scrollIntoView({ behavior: 'smooth' });
  }

  cancelBookingReview() {
    this.bookingState.selectedSlot = null;
    document.getElementById('booking-review-panel').style.display = 'none';
    this.setStepIndicator(2);
    this.renderAvailableSlots();
  }

  async confirmBooking() {
    const slot = this.bookingState.selectedSlot;
    if (!slot) {
      this.showAlert('No slot selected.', 'danger');
      return;
    }

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/booking/book`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ slot_id: slot.id })
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Failed to book slot.', 'danger');
          if (res.status === 409) this.cancelBookingReview();
          return;
        }

        const appt = data.appointment;
        this.setStepIndicator(4);
        document.getElementById('booking-selection-panel').style.display = 'none';
        document.getElementById('booking-review-panel').style.display = 'none';
        const confirmedPanel = document.getElementById('booking-confirmed-panel');
        confirmedPanel.style.display = 'block';

        document.getElementById('confirmed-ref-id').textContent = appt.id;
        document.getElementById('confirmed-doc-name').textContent = appt.doctorName;
        document.getElementById('confirmed-datetime').textContent = `${appt.date} &bull; ${appt.startTime} – ${appt.endTime}`;
        confirmedPanel.scrollIntoView({ behavior: 'smooth' });
        return;
      } catch (err) {
        console.warn('Backend booking error, trying fallback', err);
      }
    }

    // Fallback: Local booking
    if (this.isPastTime(slot.date, slot.startTime)) {
      this.showAlert('Refused: This appointment slot has already passed.', 'danger');
      this.cancelBookingReview();
      return;
    }

    const storeSlot = this.store.data.slots.find(s => s.id === slot.id);
    if (!storeSlot || storeSlot.status !== 'Free') {
      this.showAlert('This slot was just taken. Please select another free slot.', 'danger');
      this.cancelBookingReview();
      return;
    }

    const patientCollision = this.store.data.appointments.find(a =>
      a.patientId === this.currentUser.id &&
      a.status === 'Booked' &&
      a.date === slot.date &&
      a.startTime === slot.startTime
    );

    if (patientCollision) {
      this.showAlert('Refused: You already hold an active appointment at this date and time.', 'danger');
      return;
    }

    storeSlot.status = 'Booked';

    const newAppointment = {
      id: 'apt_' + Date.now(),
      slotId: storeSlot.id,
      patientId: this.currentUser.id,
      doctorId: storeSlot.doctorId,
      date: storeSlot.date,
      startTime: storeSlot.startTime,
      endTime: storeSlot.endTime,
      status: 'Booked',
      createdAt: new Date().toISOString()
    };

    this.store.data.appointments.push(newAppointment);

    const doc = this.store.data.doctors.find(d => d.id === storeSlot.doctorId);
    this.store.logAction(
      this.currentUser,
      'APPOINTMENT_BOOKED',
      'APPOINTMENT',
      newAppointment.id,
      `Patient ${this.currentUser.name} booked with ${doc ? doc.name : 'Doctor'} on ${storeSlot.date} at ${storeSlot.startTime}`
    );

    this.store.save();

    this.setStepIndicator(4);
    document.getElementById('booking-selection-panel').style.display = 'none';
    document.getElementById('booking-review-panel').style.display = 'none';
    const confirmedPanel = document.getElementById('booking-confirmed-panel');
    confirmedPanel.style.display = 'block';

    document.getElementById('confirmed-ref-id').textContent = newAppointment.id;
    document.getElementById('confirmed-doc-name').textContent = doc ? doc.name : 'Physician';
    document.getElementById('confirmed-datetime').textContent = `${newAppointment.date} &bull; ${newAppointment.startTime} – ${newAppointment.endTime}`;

    confirmedPanel.scrollIntoView({ behavior: 'smooth' });
  }

  // --- Patient Appointments View ---
  async renderPatientAppointments() {
    const tbody = document.getElementById('patient-appointments-table-body');
    const emptyNotice = document.getElementById('no-patient-appointments');
    tbody.innerHTML = '';

    let myAppointments = [];
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/booking/patient`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          myAppointments = data.appointments || [];
        }
      } catch (e) {}
    } else {
      myAppointments = this.store.data.appointments.filter(a => a.patientId === this.currentUser.id);
      myAppointments.sort((a, b) => (`${b.date} ${b.startTime}`).localeCompare(`${a.date} ${a.startTime}`));
    }

    if (myAppointments.length === 0) {
      emptyNotice.style.display = 'block';
      return;
    }

    emptyNotice.style.display = 'none';

    myAppointments.forEach(appt => {
      const doc = this.useBackend ? null : this.store.data.doctors.find(d => d.id === appt.doctorId);
      const docName = appt.doctorName || (doc ? doc.name : 'Unknown');
      const docSpec = appt.specialization || (doc ? doc.specialization : '');
      const isPast = appt.isPast !== undefined ? appt.isPast : this.isPastTime(appt.date, appt.startTime);
      const canCancel = appt.status === 'Booked' && !isPast;

      const tr = document.createElement('tr');

      let statusBadge = '';
      if (appt.status === 'Booked') {
        statusBadge = `<span class="cq-status cq-status-booked">Booked</span>`;
      } else if (appt.status === 'Completed') {
        statusBadge = `<span class="cq-status cq-status-completed">Completed</span>`;
      } else if (appt.status === 'Cancelled') {
        statusBadge = `<span class="cq-status cq-status-cancelled">Cancelled</span>`;
      }

      tr.innerHTML = `
        <td class="cq-code">${appt.id}</td>
        <td style="font-weight: 500;">${this.escapeHtml(docName)}</td>
        <td style="font-size: 0.85rem; color: var(--color-ink-muted);">${this.escapeHtml(docSpec)}</td>
        <td class="cq-tabular">${appt.date}</td>
        <td class="cq-tabular">${appt.startTime} &ndash; ${appt.endTime}</td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          ${canCancel ? `
            <button type="button" class="cq-btn cq-btn-sm cq-btn-danger" onclick="app.patientCancelAppointment('${appt.id}')">Cancel</button>
          ` : `
            <span style="font-size: 0.775rem; color: var(--color-ink-muted);">${isPast && appt.status === 'Booked' ? 'Passed' : '&mdash;'}</span>
          `}
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  async patientCancelAppointment(appointmentId) {
    if (!confirm('Are you sure you want to cancel this scheduled appointment? The slot will become available to others.')) {
      return;
    }

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/booking/${appointmentId}/cancel`, {
          method: 'POST',
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Failed to cancel appointment.', 'danger');
          return;
        }
        this.showAlert('Appointment successfully cancelled. The slot has been released.', 'success');
        this.renderPatientAppointments();
        return;
      } catch (err) {}
    }

    // Fallback: Local cancel
    const appt = this.store.data.appointments.find(a => a.id === appointmentId);
    if (!appt || appt.patientId !== this.currentUser.id) {
      this.showAlert('Record not found or access denied.', 'danger');
      return;
    }

    if (this.isPastTime(appt.date, appt.startTime)) {
      this.showAlert('Past appointments cannot be cancelled.', 'danger');
      return;
    }

    appt.status = 'Cancelled';
    const slot = this.store.data.slots.find(s => s.id === appt.slotId);
    if (slot) {
      slot.status = 'Free';
    }

    this.store.logAction(
      this.currentUser,
      'APPOINTMENT_CANCELLED',
      'APPOINTMENT',
      appt.id,
      `Patient ${this.currentUser.name} cancelled appointment ${appt.id}. Slot ${appt.slotId} returned to Free.`
    );

    this.store.save();
    this.showAlert('Appointment successfully cancelled. The slot has been released.', 'success');
    this.renderPatientAppointments();
  }

  // --- Doctor Schedule View ---
  setupDoctorScheduleView() {
    const heading = document.getElementById('doctor-schedule-heading');
    const dateInput = document.getElementById('doc-filter-date');

    if (!dateInput.value) {
      dateInput.value = this.getTodayDateString();
    }

    heading.textContent = `Schedule: ${this.currentUser.name}`;
    this.renderDoctorSchedule();
  }

  async renderDoctorSchedule() {
    const tbody = document.getElementById('doctor-schedule-table-body');
    const emptyNotice = document.getElementById('no-doctor-appointments');
    const selectedDate = document.getElementById('doc-filter-date').value;
    tbody.innerHTML = '';

    let appointments = [];
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/booking/doctor?date=${selectedDate}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          appointments = data.appointments || [];
          if (data.doctor) {
            document.getElementById('doctor-schedule-heading').textContent = `Schedule: ${data.doctor.name} — ${data.doctor.specialization}`;
          }
        }
      } catch (e) {}
    } else {
      const doctorProfile = this.store.data.doctors.find(d => d.userId === this.currentUser.id);
      if (!doctorProfile) {
        emptyNotice.style.display = 'block';
        return;
      }
      appointments = this.store.data.appointments.filter(a =>
        a.doctorId === doctorProfile.id &&
        a.date === selectedDate
      );
      appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    if (appointments.length === 0) {
      emptyNotice.style.display = 'block';
      return;
    }

    emptyNotice.style.display = 'none';

    appointments.forEach(appt => {
      const patient = this.useBackend ? null : this.store.data.users.find(u => u.id === appt.patientId);
      const patientName = appt.patientName || (patient ? patient.name : 'Unknown');
      const patientPhone = appt.patientPhone || (patient ? patient.phone : 'Unknown');

      const tr = document.createElement('tr');

      let statusBadge = '';
      if (appt.status === 'Booked') {
        statusBadge = `<span class="cq-status cq-status-booked">Booked</span>`;
      } else if (appt.status === 'Completed') {
        statusBadge = `<span class="cq-status cq-status-completed">Completed</span>`;
      } else if (appt.status === 'Cancelled') {
        statusBadge = `<span class="cq-status cq-status-cancelled">Cancelled</span>`;
      }

      tr.innerHTML = `
        <td class="cq-tabular" style="font-weight: 600;">${appt.startTime} &ndash; ${appt.endTime}</td>
        <td style="font-weight: 500;">${this.escapeHtml(patientName)}</td>
        <td class="cq-tabular">${this.escapeHtml(patientPhone)}</td>
        <td>${statusBadge}</td>
        <td>
          <button type="button" class="cq-btn cq-btn-sm cq-btn-secondary" onclick="app.openNotesModal('${appt.id}')">
            ${appt.hasNote ? '&check; View/Edit Note' : '+ Add Note'}
          </button>
        </td>
        <td style="text-align: right;">
          ${appt.status === 'Booked' ? `
            <button type="button" class="cq-btn cq-btn-sm cq-btn-primary" onclick="app.markAppointmentCompleted('${appt.id}')">Mark Completed</button>
          ` : `
            <span style="font-size: 0.775rem; color: var(--color-ink-muted);">${appt.status}</span>
          `}
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  async markAppointmentCompleted(appointmentId) {
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/booking/${appointmentId}/complete`, {
          method: 'POST',
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Failed to update appointment.', 'danger');
          return;
        }
        this.showAlert('Appointment marked as Completed.', 'success');
        this.renderDoctorSchedule();
        return;
      } catch (err) {}
    }

    // Fallback: Local
    const doctorProfile = this.store.data.doctors.find(d => d.userId === this.currentUser.id);
    const appt = this.store.data.appointments.find(a => a.id === appointmentId);

    if (!appt || !doctorProfile || appt.doctorId !== doctorProfile.id) {
      this.showAlert('Access Denied: You may only update your own assigned appointments.', 'danger');
      return;
    }

    appt.status = 'Completed';
    this.store.logAction(
      this.currentUser,
      'APPOINTMENT_COMPLETED',
      'APPOINTMENT',
      appt.id,
      `Dr. ${doctorProfile.name} marked appointment ${appt.id} as Completed.`
    );

    this.store.save();
    this.showAlert('Appointment marked as Completed.', 'success');
    this.renderDoctorSchedule();
  }

  async openNotesModal(appointmentId) {
    document.getElementById('note-appointment-id').value = appointmentId;
    const textarea = document.getElementById('note-text-content');
    textarea.value = '';

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/notes/${appointmentId}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Access denied.', 'danger');
          return;
        }
        textarea.value = data.note ? data.note.text : '';
        this.updateNoteCharCount();
        document.getElementById('modal-notes').classList.add('open');
        return;
      } catch (err) {}
    }

    // Fallback: Local
    const doctorProfile = this.store.data.doctors.find(d => d.userId === this.currentUser.id);
    const appt = this.store.data.appointments.find(a => a.id === appointmentId);

    if (!doctorProfile || !appt || appt.doctorId !== doctorProfile.id) {
      this.showAlert('Access Denied: Consultation notes are confidential and restricted to the treating doctor.', 'danger');
      return;
    }

    const existingNote = this.store.data.notes.find(n => n.appointmentId === appointmentId && n.doctorId === doctorProfile.id);
    textarea.value = existingNote ? existingNote.text : '';
    this.updateNoteCharCount();

    this.store.logAction(
      this.currentUser,
      'NOTE_VIEWED',
      'NOTE',
      existingNote ? existingNote.id : appointmentId,
      `Clinician opened consultation notes for appointment ${appointmentId}`
    );

    document.getElementById('modal-notes').classList.add('open');
  }

  updateNoteCharCount() {
    const text = document.getElementById('note-text-content').value;
    const counter = document.getElementById('note-char-counter');
    counter.textContent = `${text.length} / 2000`;
  }

  closeNotesModal() {
    document.getElementById('modal-notes').classList.remove('open');
  }

  async handleSaveNote(e) {
    if (e && e.preventDefault) e.preventDefault();
    const appointmentId = document.getElementById('note-appointment-id').value;
    const text = document.getElementById('note-text-content').value.trim();

    if (text.length > 2000) {
      this.showAlert('Note exceeds 2,000 character maximum limit.', 'danger');
      return;
    }

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/notes/${appointmentId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Failed to save note.', 'danger');
          return;
        }
        this.closeNotesModal();
        this.showAlert('Confidential consultation note saved.', 'success');
        this.renderDoctorSchedule();
        return;
      } catch (err) {}
    }

    // Fallback: Local
    const doctorProfile = this.store.data.doctors.find(d => d.userId === this.currentUser.id);
    if (!doctorProfile) return;

    let note = this.store.data.notes.find(n => n.appointmentId === appointmentId && n.doctorId === doctorProfile.id);
    if (note) {
      note.text = text;
      note.updatedAt = new Date().toISOString();
    } else {
      note = {
        id: 'note_' + Date.now(),
        appointmentId,
        doctorId: doctorProfile.id,
        text,
        updatedAt: new Date().toISOString()
      };
      this.store.data.notes.push(note);
    }

    this.store.logAction(
      this.currentUser,
      'NOTE_SAVED',
      'NOTE',
      note.id,
      `Clinician updated consultation note for appointment ${appointmentId}`
    );

    this.store.save();
    this.closeNotesModal();
    this.showAlert('Confidential consultation note saved.', 'success');
    this.renderDoctorSchedule();
  }

  // --- Admin Views: Doctors and Slot Generator ---
  setupAdminDoctorsView() {
    this.renderAdminDoctorsTable();
    this.populateDoctorSelectOptions();
    this.renderAdminSlotsTable();

    document.getElementById('gen-start-date').value = this.getTodayDateString(0);
    document.getElementById('gen-end-date').value = this.getTodayDateString(1);
  }

  async renderAdminDoctorsTable() {
    const tbody = document.getElementById('admin-doctors-table-body');
    const emptyNotice = document.getElementById('no-admin-doctors');
    tbody.innerHTML = '';

    let doctors = [];
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/clinic/doctors`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          doctors = data.doctors || [];
        }
      } catch (e) {}
    } else {
      doctors = this.store.data.doctors || [];
    }

    if (doctors.length === 0) {
      emptyNotice.style.display = 'block';
      return;
    }

    emptyNotice.style.display = 'none';

    doctors.forEach(doc => {
      const user = this.useBackend ? null : this.store.data.users.find(u => u.id === doc.userId);
      const email = doc.email || (user ? user.email : 'N/A');
      const phone = doc.phone || (user ? user.phone : 'N/A');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${this.escapeHtml(doc.name)}</td>
        <td>${this.escapeHtml(doc.specialization)}</td>
        <td class="cq-code">${this.escapeHtml(email)}</td>
        <td class="cq-tabular">${this.escapeHtml(phone)}</td>
        <td style="text-align: right;">
          <button type="button" class="cq-btn cq-btn-sm cq-btn-secondary" onclick="app.openEditDoctorModal('${doc.id}', '${this.escapeHtml(doc.name)}', '${this.escapeHtml(doc.specialization)}')">Edit Profile</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async populateDoctorSelectOptions() {
    const genSelect = document.getElementById('gen-doctor-select');
    const filterSelect = document.getElementById('admin-slot-filter-doc');

    genSelect.innerHTML = '';
    filterSelect.innerHTML = '<option value="ALL">All Physicians</option>';

    let doctors = [];
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/clinic/doctors`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          doctors = data.doctors || [];
        }
      } catch (e) {}
    } else {
      doctors = this.store.data.doctors || [];
    }

    doctors.forEach(doc => {
      const opt1 = document.createElement('option');
      opt1.value = doc.id;
      opt1.textContent = `${doc.name} (${doc.specialization})`;
      genSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = doc.id;
      opt2.textContent = doc.name;
      filterSelect.appendChild(opt2);
    });
  }

  openNewDoctorModal() {
    document.getElementById('modal-new-doctor').classList.add('open');
  }

  closeNewDoctorModal() {
    document.getElementById('modal-new-doctor').classList.remove('open');
  }

  async handleCreateDoctor(e) {
    if (e && e.preventDefault) e.preventDefault();
    const name = document.getElementById('newdoc-name').value.trim();
    const spec = document.getElementById('newdoc-spec').value.trim();
    const email = document.getElementById('newdoc-email').value.trim().toLowerCase();
    const phone = document.getElementById('newdoc-phone').value.trim();
    const password = document.getElementById('newdoc-password').value;

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/clinic/doctors/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, specialization: spec, email, phone, password })
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Failed to create doctor.', 'danger');
          return;
        }
        this.closeNewDoctorModal();
        this.showAlert(`Doctor account created for ${name}.`, 'success');
        this.setupAdminDoctorsView();
        return;
      } catch (err) {}
    }

    // Fallback: Local
    if (this.store.data.users.some(u => u.email.toLowerCase() === email)) {
      this.showAlert('An account with this email address already exists.', 'danger');
      return;
    }

    const userId = 'usr_doc_' + Date.now();
    const newUser = {
      id: userId,
      name,
      email,
      phone,
      password,
      role: 'Doctor'
    };

    const docId = 'doc_' + Date.now();
    const newDoc = {
      id: docId,
      userId,
      name,
      specialization: spec
    };

    this.store.data.users.push(newUser);
    this.store.data.doctors.push(newDoc);

    this.store.logAction(
      this.currentUser,
      'DOCTOR_ACCOUNT_CREATED',
      'DOCTOR',
      docId,
      `Admin created doctor account for ${name} (${spec}, ${email})`
    );

    this.store.save();
    this.closeNewDoctorModal();
    this.showAlert(`Doctor account created for ${name}.`, 'success');
    this.setupAdminDoctorsView();
  }

  openEditDoctorModal(doctorId, name, spec) {
    document.getElementById('editdoc-id').value = doctorId;
    if (name) {
      document.getElementById('editdoc-name').value = name;
      document.getElementById('editdoc-spec').value = spec || '';
    } else {
      const doc = this.store && this.store.data.doctors ? this.store.data.doctors.find(d => d.id === doctorId) : null;
      if (doc) {
        document.getElementById('editdoc-name').value = doc.name;
        document.getElementById('editdoc-spec').value = doc.specialization;
      }
    }
    document.getElementById('modal-edit-doctor').classList.add('open');
  }

  closeEditDoctorModal() {
    document.getElementById('modal-edit-doctor').classList.remove('open');
  }

  async handleUpdateDoctor(e) {
    if (e && e.preventDefault) e.preventDefault();
    const docId = document.getElementById('editdoc-id').value;
    const name = document.getElementById('editdoc-name').value.trim();
    const spec = document.getElementById('editdoc-spec').value.trim();

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/clinic/doctors/${docId}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, specialization: spec })
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Failed to update doctor.', 'danger');
          return;
        }
        this.closeEditDoctorModal();
        this.showAlert(`Doctor profile updated for ${name}.`, 'success');
        this.setupAdminDoctorsView();
        return;
      } catch (err) {}
    }

    // Fallback: Local
    const doc = this.store.data.doctors.find(d => d.id === docId);
    if (!doc) return;

    doc.name = name;
    doc.specialization = spec;

    const user = this.store.data.users.find(u => u.id === doc.userId);
    if (user) {
      user.name = name;
    }

    this.store.logAction(
      this.currentUser,
      'DOCTOR_PROFILE_UPDATED',
      'DOCTOR',
      docId,
      `Admin updated profile for ${name}`
    );

    this.store.save();
    this.closeEditDoctorModal();
    this.showAlert(`Doctor profile updated for ${name}.`, 'success');
    this.setupAdminDoctorsView();
  }

  async handleGenerateSlots(e) {
    if (e && e.preventDefault) e.preventDefault();
    const doctorId = document.getElementById('gen-doctor-select').value;
    const startDate = document.getElementById('gen-start-date').value;
    const endDate = document.getElementById('gen-end-date').value;
    const startTimeStr = document.getElementById('gen-start-time').value;
    const endTimeStr = document.getElementById('gen-end-time').value;
    const slotMinutes = parseInt(document.getElementById('gen-slot-length').value, 10);

    if (!doctorId) {
      this.showAlert('Please select a doctor.', 'danger');
      return;
    }

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/clinic/slots/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            doctor_id: doctorId,
            start_date: startDate,
            end_date: endDate,
            daily_start_time: startTimeStr,
            daily_end_time: endTimeStr,
            slot_duration_minutes: slotMinutes
          })
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Slot generation failed.', 'danger');
          return;
        }
        let msg = `Successfully generated ${data.generated} new slots.`;
        if (data.skipped_overlap > 0) msg += ` ${data.skipped_overlap} overlapping slots skipped.`;
        if (data.skipped_past > 0) msg += ` ${data.skipped_past} past slots skipped.`;
        this.showAlert(msg, data.generated > 0 ? 'success' : 'warning');
        this.renderAdminSlotsTable();
        return;
      } catch (err) {}
    }

    // Fallback: Local
    if (startDate > endDate) {
      this.showAlert('Start date cannot be after end date.', 'danger');
      return;
    }

    if (startTimeStr >= endTimeStr) {
      this.showAlert('Daily start time must be before end time.', 'danger');
      return;
    }

    const startMinutes = this.timeToMinutes(startTimeStr);
    const endMinutes = this.timeToMinutes(endTimeStr);

    let generatedCount = 0;
    let skippedOverlapCount = 0;
    let skippedPastCount = 0;

    const startObj = new Date(startDate);
    const endObj = new Date(endDate);

    for (let cur = new Date(startObj); cur <= endObj; cur.setDate(cur.getDate() + 1)) {
      const dateStr = cur.toISOString().split('T')[0];

      for (let m = startMinutes; m + slotMinutes <= endMinutes; m += slotMinutes) {
        const slotStart = this.minutesToTime(m);
        const slotEnd = this.minutesToTime(m + slotMinutes);

        if (this.isPastTime(dateStr, slotStart)) {
          skippedPastCount++;
          continue;
        }

        const overlap = this.store.data.slots.some(s =>
          s.doctorId === doctorId &&
          s.date === dateStr &&
          !(slotEnd <= s.startTime || slotStart >= s.endTime)
        );

        if (overlap) {
          skippedOverlapCount++;
          continue;
        }

        const newSlot = {
          id: 's_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          doctorId,
          date: dateStr,
          startTime: slotStart,
          endTime: slotEnd,
          status: 'Free'
        };

        this.store.data.slots.push(newSlot);
        generatedCount++;
      }
    }

    this.store.logAction(
      this.currentUser,
      'SLOTS_GENERATED',
      'DOCTOR',
      doctorId,
      `Generated ${generatedCount} slots for doctor ${doctorId}. (Skipped ${skippedOverlapCount} overlaps, ${skippedPastCount} past times).`
    );

    this.store.save();
    this.renderAdminSlotsTable();

    let msg = `Successfully generated ${generatedCount} new slots.`;
    if (skippedOverlapCount > 0) msg += ` ${skippedOverlapCount} overlapping slots skipped.`;
    if (skippedPastCount > 0) msg += ` ${skippedPastCount} past slots skipped.`;
    this.showAlert(msg, generatedCount > 0 ? 'success' : 'warning');
  }

  timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  minutesToTime(mins) {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    return `${h}:${m}`;
  }

  async renderAdminSlotsTable() {
    const tbody = document.getElementById('admin-slots-table-body');
    const filterDoc = document.getElementById('admin-slot-filter-doc').value;
    tbody.innerHTML = '';

    let slots = [];
    if (this.useBackend) {
      try {
        const query = filterDoc && filterDoc !== 'ALL' ? `?doctor_id=${filterDoc}` : '';
        // If ALL, fetch per doctor or slots
        const res = await fetch(`${API_BASE}/clinic/slots${query}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          slots = (data.slots || []).filter(s => s.status === 'Free');
        }
      } catch (e) {}
    } else {
      slots = this.store.data.slots.filter(s => (filterDoc === 'ALL' || s.doctorId === filterDoc) && s.status === 'Free');
    }

    if (slots.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-ink-muted); font-style: italic; padding: 1.5rem;">No unbooked free slots to display.</td></tr>`;
      return;
    }

    slots.sort((a, b) => (`${a.date} ${a.startTime}`).localeCompare(`${b.date} ${b.startTime}`));

    slots.slice(0, 50).forEach(slot => {
      const doc = this.useBackend ? null : this.store.data.doctors.find(d => d.id === slot.doctorId);
      const docName = doc ? doc.name : (slot.doctorName || 'Physician');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cq-code">${slot.id}</td>
        <td style="font-weight: 500;">${this.escapeHtml(docName)}</td>
        <td class="cq-tabular">${slot.date}</td>
        <td class="cq-tabular">${slot.startTime} &ndash; ${slot.endTime}</td>
        <td><span class="cq-status cq-status-free">Free</span></td>
        <td style="text-align: right;">
          <button type="button" class="cq-btn cq-btn-sm cq-btn-danger" onclick="app.removeSlot('${slot.id}')">Remove Slot</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async removeSlot(slotId) {
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/clinic/slots/${slotId}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Cannot remove slot.', 'danger');
          return;
        }
        this.showAlert(`Slot ${slotId} removed.`, 'success');
        this.renderAdminSlotsTable();
        return;
      } catch (err) {}
    }

    // Fallback: Local
    const slotIndex = this.store.data.slots.findIndex(s => s.id === slotId);
    if (slotIndex === -1) return;

    const slot = this.store.data.slots[slotIndex];
    if (slot.status !== 'Free') {
      this.showAlert('Cannot remove a slot that has an active booking.', 'danger');
      return;
    }

    this.store.data.slots.splice(slotIndex, 1);
    this.store.logAction(
      this.currentUser,
      'SLOT_REMOVED',
      'SLOT',
      slotId,
      `Admin deleted unbooked slot ${slotId} (${slot.date} ${slot.startTime}-${slot.endTime})`
    );

    this.store.save();
    this.showAlert(`Slot ${slotId} removed.`, 'success');
    this.renderAdminSlotsTable();
  }

  // --- Admin All Appointments Master View ---
  setupAdminAllAppointmentsView() {
    const dateInput = document.getElementById('admin-appt-filter-date');
    if (!dateInput.value) {
      dateInput.value = this.getTodayDateString();
    }

    this.populateDoctorSelectOptions();
    this.renderAdminAllAppointments();
  }

  async renderAdminAllAppointments() {
    const selectedDate = document.getElementById('admin-appt-filter-date').value;
    const selectedDoc = document.getElementById('admin-appt-filter-doc').value;
    const tbody = document.getElementById('admin-all-appointments-table-body');
    const emptyNotice = document.getElementById('no-admin-appointments');
    const printMeta = document.getElementById('print-meta-info');

    tbody.innerHTML = '';
    printMeta.textContent = `Schedule Date: ${selectedDate} | Filter: ${selectedDoc === 'ALL' ? 'All Clinicians' : selectedDoc} | Printed: ${new Date().toLocaleString()}`;

    let appointments = [];
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/booking/admin?date=${selectedDate}&doctor_id=${selectedDoc}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          appointments = data.appointments || [];
        }
      } catch (e) {}
    } else {
      appointments = this.store.data.appointments.filter(a => a.date === selectedDate);
      if (selectedDoc !== 'ALL') {
        appointments = appointments.filter(a => a.doctorId === selectedDoc);
      }
      appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    if (appointments.length === 0) {
      emptyNotice.style.display = 'block';
      return;
    }

    emptyNotice.style.display = 'none';

    appointments.forEach(appt => {
      const doc = this.useBackend ? null : this.store.data.doctors.find(d => d.id === appt.doctorId);
      const patient = this.useBackend ? null : this.store.data.users.find(u => u.id === appt.patientId);

      const doctorName = appt.doctorName || (doc ? doc.name : 'Unknown');
      const patientName = appt.patientName || (patient ? patient.name : 'Unknown');
      const patientPhone = appt.patientPhone || (patient ? patient.phone : 'Unknown');

      let statusBadge = '';
      if (appt.status === 'Booked') {
        statusBadge = `<span class="cq-status cq-status-booked">Booked</span>`;
      } else if (appt.status === 'Completed') {
        statusBadge = `<span class="cq-status cq-status-completed">Completed</span>`;
      } else if (appt.status === 'Cancelled') {
        statusBadge = `<span class="cq-status cq-status-cancelled">Cancelled</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cq-tabular" style="font-weight: 600;">${appt.startTime} &ndash; ${appt.endTime}</td>
        <td>${this.escapeHtml(doctorName)}</td>
        <td style="font-weight: 500;">${this.escapeHtml(patientName)}</td>
        <td class="cq-tabular">${this.escapeHtml(patientPhone)}</td>
        <td>${statusBadge}</td>
        <td class="no-print" style="text-align: right;">
          ${appt.status === 'Booked' ? `
            <button type="button" class="cq-btn cq-btn-sm cq-btn-danger" onclick="app.adminCancelAppointment('${appt.id}')">Cancel Appointment</button>
          ` : `
            <span style="font-size: 0.775rem; color: var(--color-ink-muted);">&mdash;</span>
          `}
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  async adminCancelAppointment(appointmentId) {
    if (!confirm(`Cancel appointment ${appointmentId}? The slot will be restored to Free status.`)) {
      return;
    }

    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/booking/${appointmentId}/cancel`, {
          method: 'POST',
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || 'Failed to cancel appointment.', 'danger');
          return;
        }
        this.showAlert(`Appointment ${appointmentId} cancelled by administrator.`, 'success');
        this.renderAdminAllAppointments();
        return;
      } catch (err) {}
    }

    // Fallback: Local
    const appt = this.store.data.appointments.find(a => a.id === appointmentId);
    if (!appt) return;

    appt.status = 'Cancelled';
    const slot = this.store.data.slots.find(s => s.id === appt.slotId);
    if (slot) {
      slot.status = 'Free';
    }

    this.store.logAction(
      this.currentUser,
      'ADMIN_APPOINTMENT_CANCELLED',
      'APPOINTMENT',
      appt.id,
      `Administrator cancelled appointment ${appt.id}. Slot ${appt.slotId} returned to Free.`
    );

    this.store.save();
    this.showAlert(`Appointment ${appt.id} cancelled by administrator.`, 'success');
    this.renderAdminAllAppointments();
  }

  // --- Audit Log ---
  async renderAdminAuditTable() {
    const tbody = document.getElementById('admin-audit-table-body');
    tbody.innerHTML = '';

    let logs = [];
    if (this.useBackend) {
      try {
        const res = await fetch(`${API_BASE}/audit/`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          logs = data.auditLogs || [];
        }
      } catch (e) {}
    } else {
      logs = [...this.store.data.auditLogs].reverse();
    }

    logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cq-tabular cq-code" style="font-size: 0.775rem;">${log.timestamp}</td>
        <td style="font-weight: 500;">${this.escapeHtml(log.userEmail || log.userId)}</td>
        <td><span class="cq-code" style="font-weight: bold;">${this.escapeHtml(log.action)}</span></td>
        <td class="cq-code">${this.escapeHtml(log.targetType)}:${this.escapeHtml(log.targetId)}</td>
        <td style="font-size: 0.85rem;">${this.escapeHtml(log.details)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  resetData() {
    if (confirm('Reset entire system data back to initial installation state?')) {
      this.store.reset();
      this.logout(false);
      this.showAlert('System database reset to initial installation baseline.', 'info');
    }
  }
}

// Instantiate application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ClinicApp();
});
