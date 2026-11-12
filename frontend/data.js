/**
 * ClinicQ Static Data Store
 * Initial clean install state as per PRD (Page 2 & Page 10):
 * "One Admin account is created at install; patients self-register; Admin creates doctor accounts and generates slots."
 * No synthetic AI dummy filler.
 */

const CLINICQ_STORAGE_KEY = 'clinicq_state_v1';

const INITIAL_INSTALL_DATA = {
  // PRD Page 2 & 10: One Admin account created at installation
  users: [
    {
      id: 'usr_admin',
      name: 'Clinic Administrator',
      email: 'admin@clinicq.local',
      phone: '+1-555-0100',
      password: 'admin',
      role: 'Admin'
    }
  ],
  doctors: [],
  slots: [],
  appointments: [],
  notes: [],
  auditLogs: [
    {
      id: 'aud_init',
      timestamp: new Date().toISOString(),
      userId: 'usr_admin',
      userEmail: 'admin@clinicq.local',
      action: 'SYSTEM_INSTALL',
      targetType: 'SYSTEM',
      targetId: 'v1.0',
      details: 'System installed. Master Admin account configured.'
    }
  ]
};

class ClinicStore {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem(CLINICQ_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Could not read from localStorage, using initial install data.', e);
    }
    return JSON.parse(JSON.stringify(INITIAL_INSTALL_DATA));
  }

  save() {
    try {
      localStorage.setItem(CLINICQ_STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Could not save to localStorage', e);
    }
  }

  reset() {
    localStorage.removeItem(CLINICQ_STORAGE_KEY);
    this.data = JSON.parse(JSON.stringify(INITIAL_INSTALL_DATA));
    this.save();
  }

  // --- Append-Only Audit Logging (FR-6.1, FR-6.2) ---
  logAction(currentUser, action, targetType, targetId, details) {
    const entry = {
      id: 'aud_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      userId: currentUser ? currentUser.id : 'ANONYMOUS',
      userEmail: currentUser ? currentUser.email : 'system@clinicq.local',
      action,
      targetType,
      targetId: String(targetId),
      details: String(details)
    };
    this.data.auditLogs.push(entry);
    this.save();
    return entry;
  }
}

window.clinicStore = new ClinicStore();
