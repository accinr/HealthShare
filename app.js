// ============================================================
// HealthShare — app.js  (live, no demo stubs)
// ============================================================

// ── Fetch helpers ─────────────────────────────────────────────
// Auth uses a per-tab token (sessionStorage is isolated per browser tab,
// unlike cookies which are shared by every tab). This lets one browser run
// a doctor tab and a patient tab at the same time without either kicking
// the other out.

function authToken() {
  return sessionStorage.getItem('authToken');
}

function authHeaders() {
  const t = authToken();
  return t ? { 'X-Auth-Token': t } : {};
}

async function apiPost(url, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { ok: false, error: 'Server error — check XAMPP is running.', _raw: text }; }
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') return { ok: false, error: 'Request timed out. Is XAMPP running?' };
    return { ok: false, error: 'Cannot reach server: ' + err.message };
  }
}

async function apiGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { headers: authHeaders(), signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { ok: false, error: 'Server error', _raw: text }; }
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: err.name === 'AbortError' ? 'Timed out' : err.message };
  }
}

// ── UI helpers ────────────────────────────────────────────────

function showError(el, msg, raw) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  const debugEl = document.getElementById(el.id.replace('-error', '-debug'));
  if (debugEl) {
    if (raw) { debugEl.textContent = 'Server response:\n' + raw.substring(0, 600); debugEl.hidden = false; }
    else debugEl.hidden = true;
  }
}

function clearError(el) {
  if (!el) return;
  el.textContent = ''; el.hidden = true;
  const debugEl = document.getElementById(el.id.replace('-error', '-debug'));
  if (debugEl) debugEl.hidden = true;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '—';
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Session guard ─────────────────────────────────────────────

async function guardSession(expectedRole) {
  const data = await apiGet('get_session.php');
  if (!data.ok) { window.location.href = 'login.html'; return null; }
  if (expectedRole && data.user.role !== expectedRole) { window.location.href = 'login.html'; return null; }
  return data.user;
}

// ── Logout ────────────────────────────────────────────────────

document.querySelectorAll('.link-logout').forEach(btn => {
  btn.addEventListener('click', async () => {
    await apiPost('logout.php', {});
    sessionStorage.removeItem('authToken');
    window.location.href = btn.dataset.target || 'login.html';
  });
});

// ── Generic tab toggle ────────────────────────────────────────

document.querySelectorAll('.tab-row').forEach(row => {
  const tabBtns = row.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const scope = row.closest('.app-body');
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scope.querySelectorAll('.tab-pane').forEach(p =>
        p.classList.toggle('active', p.id === btn.dataset.tab));
    });
  });
});

// ── Seg-toggle (login page) ───────────────────────────────────

document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.auth-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.pane)?.classList.add('active');
  });
});

document.querySelectorAll('.link-switch').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const pane = link.dataset.pane;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.pane === pane));
    document.querySelectorAll('.auth-pane').forEach(p => p.classList.toggle('active', p.id === pane));
  });
});

// ── System admin sidebar nav ──────────────────────────────────

document.querySelectorAll('.side-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.side-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.side-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.side)?.classList.add('active');
    if (btn.dataset.side === 'sa-blockchain') {
      if (typeof loadBlockchainStatus === 'function') {
        loadBlockchainStatus();
        if (typeof startBlockchainAutoRefresh === 'function') startBlockchainAutoRefresh();
      }
    } else {
      if (typeof stopBlockchainAutoRefresh === 'function') stopBlockchainAutoRefresh();
    }
  });
});

// ─────────────────────────────────────────────────────────────
//  LOGIN PAGE
// ─────────────────────────────────────────────────────────────

const ROLE_HINTS = {
  'patient': {
    icon: '🪪', title: 'Patient login',
    body: 'Use the Health ID you received when you registered (KE-HID-XXXXX).',
    idLabel: 'Health ID', placeholder: 'KE-HID-XXXXX', showRegister: true,
  },
  'doctor': {
    icon: '🩺', title: 'Doctor login',
    body: 'Use the Staff ID (KE-STF-XXXX) and temporary password given to you by your hospital admin.',
    idLabel: 'Staff ID', placeholder: 'KE-STF-XXXX', showRegister: false,
  },
  'hospital-admin': {
    icon: '🏥', title: 'Hospital admin login',
    body: 'Use the Admin ID (KE-ADM-XXXX) and temporary password issued by the system administrator.',
    idLabel: 'Admin ID', placeholder: 'KE-ADM-XXXX', showRegister: false,
  },
  'system-admin': {
    icon: '⚙️', title: 'System admin login',
    body: 'National-level access. Use your system admin ID (KE-SYS-XXXXX).',
    idLabel: 'System Admin ID', placeholder: 'KE-SYS-XXXXX', showRegister: false,
  },
  'emergency': {
    icon: '🚨', title: 'Emergency personnel login',
    body: 'Use the Staff ID (KE-EMG-XXXX) and credentials issued by your hospital admin.',
    idLabel: 'Staff ID', placeholder: 'KE-EMG-XXXX', showRegister: false,
  },
};

const loginRoleSelect = document.getElementById('login-role');
if (loginRoleSelect) {
  function updateRoleHint() {
    const hint = ROLE_HINTS[loginRoleSelect.value] || ROLE_HINTS['patient'];
    document.getElementById('login-hint-text').innerHTML = `<strong>${hint.title}</strong> — ${hint.body}`;
    document.querySelector('.role-hint-icon').textContent = hint.icon;
    document.getElementById('login-id-label').textContent = hint.idLabel;
    document.getElementById('login-id').placeholder = hint.placeholder;
    const regLink = document.getElementById('login-register-link');
    if (regLink) regLink.hidden = !hint.showRegister;
  }
  loginRoleSelect.addEventListener('change', updateRoleHint);
  updateRoleHint();
}

const btnLogin = document.getElementById('btn-login');
if (btnLogin) {
  btnLogin.addEventListener('click', async () => {
    const role     = document.getElementById('login-role').value;
    const user_id  = document.getElementById('login-id').value.trim().toUpperCase();
    const password = document.getElementById('login-pass').value;
    const errEl    = document.getElementById('login-error');
    clearError(errEl);
    if (!user_id)  { showError(errEl, 'Please enter your User ID.'); return; }
    if (!password) { showError(errEl, 'Please enter your password.'); return; }

    btnLogin.disabled = true; btnLogin.textContent = 'Logging in…';
    const data = await apiPost('login.php', { user_id, password, role });
    btnLogin.disabled = false; btnLogin.textContent = 'Log in';

    if (!data.ok) { showError(errEl, data.error || 'Login failed.', data._raw); return; }

    if (data.token) sessionStorage.setItem('authToken', data.token);

    const pageMap = {
      patient: 'patient.html', doctor: 'doctor.html',
      hospital_admin: 'hospital-admin.html',
      system_admin: 'system-admin.html', emergency: 'emergency.html',
    };
    window.location.href = pageMap[data.user.role] || 'login.html';
  });

  document.getElementById('login-pass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnLogin.click();
  });
}

const btnRegister = document.getElementById('btn-register');
if (btnRegister) {
  btnRegister.addEventListener('click', async () => {
    const full_name   = document.getElementById('reg-name').value.trim();
    const national_id = document.getElementById('reg-national-id').value.trim();
    const phone       = document.getElementById('reg-phone').value.trim();
    const password    = document.getElementById('reg-pass').value;
    const errEl       = document.getElementById('reg-error');
    clearError(errEl);
    if (!full_name)   { showError(errEl, 'Please enter your full name.'); return; }
    if (!national_id) { showError(errEl, 'Please enter your national ID number.'); return; }
    if (!phone)       { showError(errEl, 'Please enter your phone number.'); return; }
    if (!password)    { showError(errEl, 'Please create a password.'); return; }
    if (password.length < 6) { showError(errEl, 'Password must be at least 6 characters.'); return; }

    btnRegister.disabled = true; btnRegister.textContent = 'Creating account…';
    const data = await apiPost('register_patient.php', { full_name, national_id, phone, password });
    btnRegister.disabled = false; btnRegister.textContent = 'Create account';

    if (!data.ok) { showError(errEl, data.error || 'Registration failed.', data._raw); return; }

    document.getElementById('hid-value').textContent = data.health_id;
    document.getElementById('hid-result').hidden = false;
    btnRegister.hidden = true;
    document.getElementById('login-id').value   = data.health_id;
    document.getElementById('login-role').value = 'patient';
    if (typeof updateRoleHint === 'function') updateRoleHint();
  });

  document.getElementById('btn-go-login')?.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.pane === 'pane-login'));
    document.querySelectorAll('.auth-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-login'));
    document.getElementById('hid-result').hidden = true;
    btnRegister.hidden = false;
  });
}

// ─────────────────────────────────────────────────────────────
//  PATIENT PAGE
// ─────────────────────────────────────────────────────────────

if (document.getElementById('screen-patient')) {
  let _patientUser = null;
  let _otpPollTimer = null;

  (async () => {
    _patientUser = await guardSession('patient');
    if (!_patientUser) return;
    setText('patient-welcome-name', 'Welcome, ' + _patientUser.full_name);
    setText('patient-health-id', _patientUser.user_id);

    // Load real stats
    await refreshPatientStats();

    // Load real records
    await loadPatientRecords();

    // Load real consents
    await loadConsents();

    // Load notifications
    await loadNotifications();

    // Start polling for pending OTP requests (every 5 seconds)
    pollForOTP();
    _otpPollTimer = setInterval(pollForOTP, 5000);
  })();

  async function refreshPatientStats() {
    const data = await apiGet('get_patient_stats.php');
    if (data.ok) {
      setText('stat-records', data.records);
      setText('stat-prescriptions', data.prescriptions);
      setText('patient-consent-count', data.consents);
    }
  }

  async function loadPatientRecords() {
    const data   = await apiGet('get_records.php');
    const tbody  = document.getElementById('records-tbody');
    if (!tbody) return;
    if (!data.ok || !data.records?.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No records on file yet.</td></tr>';
      return;
    }
    tbody.innerHTML = data.records.map(r => `
      <tr>
        <td>${formatDate(r.created_at)}</td>
        <td>${r.facility_name || '—'}</td>
        <td>${r.record_type}</td>
        <td>${r.doctor_name}</td>
        <td><span class="badge badge-sage">On file</span></td>
      </tr>`).join('');
  }

  async function loadConsents() {
    const data  = await apiGet('get_consents.php');
    const list  = document.getElementById('consent-list');
    const empty = document.getElementById('consent-empty');
    if (!list) return;
    const consents = data.ok ? data.consents : [];
    list.innerHTML = '';
    empty.hidden = consents.length > 0;
    setText('patient-consent-count', consents.length);
    consents.forEach(c => {
      const row = document.createElement('div');
      row.className = 'consent-row';
      row.innerHTML = `
        <div class="consent-info">
          <p class="consent-name">${c.doctor_name} <span class="badge badge-sage">${c.specialization || ''}</span></p>
          <p class="consent-meta">${c.facility} · Granted ${formatDate(c.granted_at)}</p>
        </div>
        <button class="btn-revoke" data-doctor="${c.doctor_id}">Revoke</button>`;
      list.appendChild(row);
    });
    // Wire revoke buttons
    list.querySelectorAll('.btn-revoke').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Revoking…';
        const res = await apiPost('revoke_consent.php', { doctor_id: btn.dataset.doctor });
        if (res.ok) {
          await loadConsents();
          await refreshPatientStats();
          await loadNotifications();
        } else {
          btn.disabled = false; btn.textContent = 'Revoke';
          alert('Error: ' + (res.error || 'Could not revoke.'));
        }
      });
    });
  }

  async function loadNotifications() {
    const data  = await apiGet('get_notifications.php');
    const panel = document.getElementById('notifications-panel');
    if (!panel) return;
    const notes = data.ok ? data.notifications : [];
    if (!notes.length) {
      panel.innerHTML = '<p class="empty-cell">No notifications yet.</p>';
      return;
    }
    panel.innerHTML = notes.map(n => `
      <div class="event-row">
        <span style="font-size:1.2em">${n.icon}</span>
        <div>
          <p class="event-title">${n.label}</p>
          <p class="event-meta">${n.detail || ''} · ${formatDateTime(n.time)}</p>
        </div>
      </div>`).join('');
  }

  // Poll for pending OTP requests
  async function pollForOTP() {
    const data = await apiGet('get_pending_otp.php');
    const flag = document.getElementById('patient-otp-flag');
    const card = document.getElementById('pending-otp-card');
    if (!data.ok || !data.pending) {
      if (flag) flag.hidden = true;
      if (card) card.hidden = true;
      return;
    }
    if (flag) flag.hidden = false;
    if (card) card.hidden = false;
    setText('pending-doctor-name', 'Dr. ' + data.doctor_name);
  }

  // Clicking the small banner re-opens the card if it was dismissed
  document.getElementById('patient-otp-flag')?.addEventListener('click', () => {
    document.getElementById('pending-otp-card').hidden = false;
  });

  document.getElementById('btn-confirm-otp-issued')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-confirm-otp-issued');
    btn.disabled = true; btn.textContent = 'Approving…';
    const res = await apiPost('approve_otp.php', {});
    btn.disabled = false; btn.textContent = 'Approved ✓';
    if (res.ok) {
      // Show the OTP code so the patient can share it with the doctor verbally
      const otpData = await apiGet('get_pending_otp.php');
      if (otpData.ok && otpData.otp) {
        const codeEl = document.getElementById('pending-otp-code');
        if (codeEl) codeEl.textContent = otpData.otp;
        const reveal = document.getElementById('pending-otp-reveal');
        if (reveal) reveal.hidden = false;
      }
      btn.disabled = true; // can't re-approve
      await loadNotifications();
    } else {
      alert(res.error || 'Could not approve — the request may have expired.');
      btn.disabled = false; btn.textContent = 'Approve & show code';
    }
  });

  document.getElementById('btn-deny-otp')?.addEventListener('click', async () => {
    const res = await apiPost('deny_otp.php', {});
    if (res.ok) {
      document.getElementById('pending-otp-card').hidden = true;
      document.getElementById('patient-otp-flag').hidden = true;
      await loadNotifications();
    }
  });

  // Remove simulate button — no longer needed
  const simBtn = document.getElementById('btn-simulate-request');
  if (simBtn) simBtn.remove();
}

// ─────────────────────────────────────────────────────────────
//  DOCTOR PAGE
// ─────────────────────────────────────────────────────────────

if (document.getElementById('screen-doctor')) {
  let _doctorUser = null;
  let _currentPatientId = null;

  (async () => {
    _doctorUser = await guardSession('doctor');
    if (!_doctorUser) return;
    setText('doctor-name', 'Dr. ' + _doctorUser.full_name);
    setText('doctor-staff-id', _doctorUser.user_id);
    setText('doctor-facility', _doctorUser.facility_name || '—');

    // Load real stats
    const stats = await apiGet('get_doctor_stats.php');
    if (stats.ok) {
      setText('stat-patients-seen', stats.patients_seen);
      setText('stat-records-today', stats.records_today);
      setText('stat-pending-reviews', stats.pending_reviews);
    }
  })();

  let _doctorOtpPollTimer = null;

  function stopDoctorOtpPoll() {
    if (_doctorOtpPollTimer) { clearInterval(_doctorOtpPollTimer); _doctorOtpPollTimer = null; }
  }

  // Poll for patient approval. When approved, show the OTP entry form so the
  // doctor can enter the code shared verbally by the patient.
  function startDoctorOtpPoll(patientId) {
    stopDoctorOtpPoll();
    async function poll() {
      const data = await apiGet('get_doctor_otp.php?patient_id=' + encodeURIComponent(patientId));
      if (!data.ok) return;
      const statusEl = document.getElementById('doctor-otp-status');
      if (data.status === 'approved') {
        // Patient approved — now show OTP entry form for doctor to verify
        stopDoctorOtpPoll();
        if (statusEl) statusEl.textContent = 'Patient approved. Enter the code they share with you.';
        const titleEl = document.getElementById('otp-card-title');
        if (titleEl) titleEl.textContent = "Enter the patient's access code";
        const entryEl = document.getElementById('doctor-otp-entry');
        if (entryEl) entryEl.hidden = false;
        document.getElementById('doctor-otp-input')?.focus();
      } else if (data.status === 'access_granted') {
        stopDoctorOtpPoll();
        await grantDoctorAccess(patientId);
      } else if (data.status === 'denied') {
        stopDoctorOtpPoll();
        if (statusEl) statusEl.textContent = 'The patient denied this request.';
        const errEl = document.getElementById('otp-error');
        if (errEl) { errEl.textContent = 'Access denied by patient.'; errEl.hidden = false; }
        document.getElementById('btn-request-access').disabled = false;
        document.getElementById('btn-request-access').textContent = 'Request access';
      } else if (data.status === 'expired') {
        stopDoctorOtpPoll();
        if (statusEl) statusEl.textContent = 'Request expired without a response.';
        document.getElementById('btn-request-access').disabled = false;
        document.getElementById('btn-request-access').textContent = 'Request access';
      } else {
        // pending or none — keep waiting
        if (statusEl) statusEl.textContent = 'Waiting for the patient to approve…';
      }
    }
    poll(); // immediate first check
    _doctorOtpPollTimer = setInterval(poll, 3000);
  }

  // Doctor enters the OTP received verbally from the patient
  document.getElementById('btn-verify-otp')?.addEventListener('click', async () => {
    const patientId = _currentPatientId;
    const otp = document.getElementById('doctor-otp-input')?.value.trim().replace(/\s+/g, '');
    const errEl = document.getElementById('otp-error');
    if (!otp) { if (errEl) { errEl.textContent = 'Please enter the 6-digit code.'; errEl.hidden = false; } return; }
    if (errEl) errEl.hidden = true;

    const btn = document.getElementById('btn-verify-otp');
    btn.disabled = true; btn.textContent = 'Verifying…';

    const data = await apiPost('verify_otp.php', { patient_id: patientId, otp });

    btn.disabled = false; btn.textContent = 'Verify';

    if (!data.ok) {
      if (errEl) { errEl.textContent = data.error || 'Incorrect code. Ask the patient to check their screen.'; errEl.hidden = false; }
      return;
    }

    // OTP verified — grant access
    await grantDoctorAccess(patientId);
  });

  // Allow Enter key in OTP input to trigger verify
  document.getElementById('doctor-otp-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-verify-otp')?.click();
  });

  // Shared grant path — reached only after the patient approves (see poll()
  // above) or, defensively, if access was already granted in an earlier tab.
  async function grantDoctorAccess(patientId) {
    document.getElementById('otp-request-card').hidden = true;
    document.getElementById('access-status-locked').hidden = true;
    document.getElementById('access-status-granted').hidden = false;
    document.getElementById('record-locked-overlay')?.classList.add('hidden');
    document.getElementById('record-grid')?.classList.add('unlocked');
    ['btn-view-records','btn-submit-diagnosis','btn-update-records',
     'record-type','clinical-notes','btn-submit-record'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });

    const pData = await apiGet('lookup_patient_doctor.php?id=' + encodeURIComponent(patientId));
    if (pData.ok) {
      setText('rec-name',      pData.patient.full_name);
      setText('rec-hid',       pData.patient.user_id);
      setText('rec-phone',     pData.patient.phone || '—');
      setText('rec-blood',     pData.patient.blood_type || 'Not recorded');
      setText('rec-allergies', pData.patient.allergies || 'None recorded');
      setText('rec-facility',  _doctorUser?.facility_name || '—');
    }

    await loadDoctorPatientRecords(patientId);

    const stats = await apiGet('get_doctor_stats.php');
    if (stats.ok) {
      setText('stat-patients-seen', stats.patients_seen);
      setText('stat-records-today', stats.records_today);
      setText('stat-pending-reviews', stats.pending_reviews);
    }
  }

  // Search patient — set current patient and reset UI state
  function resetDoctorAccessState(patientId) {
    stopDoctorOtpPoll();
    _currentPatientId = patientId;
    document.getElementById('access-status-locked').hidden = false;
    document.getElementById('access-status-granted').hidden = true;
    document.getElementById('otp-request-card').hidden = true;
    const errEl = document.getElementById('otp-error');
    if (errEl) errEl.hidden = true;
    document.getElementById('record-locked-overlay')?.classList.remove('hidden');
    document.getElementById('record-grid')?.classList.remove('unlocked');
    document.getElementById('btn-request-access').disabled = false;
    document.getElementById('btn-request-access').textContent = 'Request access';
    const recSection = document.getElementById('doctor-records-section');
    if (recSection) recSection.hidden = true;
    const statusEl = document.getElementById('doctor-otp-status');
    if (statusEl) statusEl.textContent = 'Waiting for the patient to approve…';
    const entryEl = document.getElementById('doctor-otp-entry');
    if (entryEl) entryEl.hidden = true;
    const inputEl = document.getElementById('doctor-otp-input');
    if (inputEl) inputEl.value = '';
    const titleEl = document.getElementById('otp-card-title');
    if (titleEl) titleEl.textContent = 'Awaiting patient approval';
    ['btn-view-records','btn-submit-diagnosis','btn-update-records',
     'record-type','clinical-notes','btn-submit-record'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });
  }

  document.getElementById('btn-doctor-search')?.addEventListener('click', () => {
    const patientId = document.getElementById('doctor-search-id')?.value.trim().toUpperCase();
    if (!patientId) { alert('Please enter a patient Health ID.'); return; }
    resetDoctorAccessState(patientId);
  });

  // Also trigger search on Enter key in the search field
  document.getElementById('doctor-search-id')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-doctor-search')?.click();
  });

  document.getElementById('btn-request-access')?.addEventListener('click', async () => {
    // If doctor typed a patient ID but didn't click Search, still use it
    const patientId = _currentPatientId || document.getElementById('doctor-search-id')?.value.trim().toUpperCase();
    if (!patientId) { alert('Please enter a patient Health ID first.'); return; }
    _currentPatientId = patientId;

    const btn   = document.getElementById('btn-request-access');
    const errEl = document.getElementById('otp-error');
    if (errEl) errEl.hidden = true;
    btn.disabled = true; btn.textContent = 'Sending request…';

    const data = await apiPost('request_access.php', { patient_id: patientId });

    btn.disabled = false; btn.textContent = 'Request access';

    if (!data.ok) {
      if (errEl) { errEl.textContent = data.error; errEl.hidden = false; }
      return;
    }

    // Show the waiting card with clear instructions
    document.getElementById('otp-request-card').hidden = false;
    const hint = document.getElementById('doctor-demo-otp-hint');
    if (hint) {
      hint.textContent = '✓ Request sent to the patient. This screen will update automatically once they respond.';
      hint.style.fontStyle = 'normal';
      hint.style.color = '';
    }
    // Disable the request button so it can't be double-sent
    btn.disabled = true;
    btn.textContent = 'Request sent';

    // Poll for the patient's decision — auto-grants access the moment they approve
    startDoctorOtpPoll(patientId);
  });

  // OTP verification: patient approves → shares code verbally → doctor enters code → verify_otp.php grants access.

  async function loadDoctorPatientRecords(patientId) {
    const section = document.getElementById('doctor-records-section');
    const tbody   = document.getElementById('doctor-records-tbody');
    if (!section || !tbody) return;
    section.hidden = false;
    const data = await apiGet('get_records.php?patient_id=' + encodeURIComponent(patientId));
    if (!data.ok || !data.records?.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No records on file yet.</td></tr>';
      return;
    }
    tbody.innerHTML = data.records.map(r => `
      <tr>
        <td>${formatDate(r.created_at)}</td>
        <td>${r.record_type}</td>
        <td>${r.facility_name || '—'}</td>
        <td>${r.doctor_name}</td>
        <td class="mono">${r.cid || '—'}</td>
      </tr>`).join('');
  }

  document.getElementById('btn-view-records')?.addEventListener('click', () => {
    const patientId = _currentPatientId || document.getElementById('doctor-search-id')?.value.trim().toUpperCase();
    if (patientId) loadDoctorPatientRecords(patientId);
  });

  // Submit diagnosis — scrolls to the submit panel and focuses record type
  document.getElementById('btn-submit-diagnosis')?.addEventListener('click', () => {
    const panel = document.getElementById('submit-record-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('record-type')?.focus();
    }
  });

  // Update records — loads patient record history then scrolls to submit panel
  document.getElementById('btn-update-records')?.addEventListener('click', async () => {
    const patientId = _currentPatientId || document.getElementById('doctor-search-id')?.value.trim().toUpperCase();
    if (patientId) {
      await loadDoctorPatientRecords(patientId);
      const panel = document.getElementById('submit-record-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('clinical-notes')?.focus();
    }
  });

  // Submit clinical record
  document.getElementById('btn-submit-record')?.addEventListener('click', async () => {
    const patientId  = _currentPatientId || document.getElementById('doctor-search-id')?.value.trim().toUpperCase();
    const recordType = document.getElementById('record-type')?.value;
    const notes      = document.getElementById('clinical-notes')?.value.trim();
    if (!notes) { alert('Please enter clinical notes.'); return; }

    const btn = document.getElementById('btn-submit-record');
    btn.disabled = true; btn.textContent = 'Submitting…';

    const data = await apiPost('submit_record.php', {
      patient_id:  patientId,
      record_type: recordType,
      notes:       notes,
    });

    btn.disabled = false; btn.textContent = 'Submit record';

    if (!data.ok) { alert('Error: ' + (data.error || 'Submission failed.')); return; }

    const msg = data.ipfs_anchored
      ? `Record submitted ✓\nIPFS CID: ${data.cid}\nBlockchain: ${data.blockchain ? 'Anchored ✓' : 'Saved locally (sidecar down)'}`
      : `Record submitted ✓\nStored locally (IPFS/sidecar unreachable — will anchor when sidecar is back online)`;
    alert(msg);
    document.getElementById('clinical-notes').value = '';

    // Refresh stats and the records table so the new record appears immediately
    const stats = await apiGet('get_doctor_stats.php');
    if (stats.ok) {
      setText('stat-records-today', stats.records_today);
    }
    if (patientId) await loadDoctorPatientRecords(patientId);
  });
}

// ─────────────────────────────────────────────────────────────
//  HOSPITAL ADMIN PAGE
// ─────────────────────────────────────────────────────────────

if (document.getElementById('screen-hospital-admin')) {
  (async () => {
    const user = await guardSession('hospital_admin');
    if (!user) return;
    setText('ha-facility-name', user.facility_name);
    setText('ha-admin-name', user.full_name);
    setText('ha-facility-id', user.facility_id);
    const stats = await apiGet('get_stats.php');
    if (stats.ok) { setText('ha-stat-doctors', stats.doctors); setText('ha-stat-emergency', stats.emergency_personnel); }
    loadDoctors();
    loadEmergencyPersonnel();
    loadHAauditLog();
  })();

  async function loadDoctors() {
    const data  = await apiGet('get_doctors.php');
    const tbody = document.getElementById('doctor-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = (!data.ok || !data.doctors?.length)
      ? '<tr><td colspan="4" class="empty-cell">No doctors registered yet.</td></tr>'
      : data.doctors.map(d => `<tr>
          <td>${d.full_name}</td><td>${d.specialization}</td>
          <td>${d.license_no}</td><td class="mono">${d.staff_id}</td>
        </tr>`).join('');
  }

  async function loadEmergencyPersonnel() {
    const data  = await apiGet('get_emergency.php');
    const tbody = document.getElementById('emergency-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = (!data.ok || !data.personnel?.length)
      ? '<tr><td colspan="4" class="empty-cell">No emergency personnel registered yet.</td></tr>'
      : data.personnel.map(p => `<tr>
          <td>${p.full_name}</td><td>${p.em_role}</td>
          <td class="mono">${p.staff_id}</td><td class="mono">${p.emergency_token}</td>
        </tr>`).join('');
  }

  async function loadHAauditLog() {
    const data = await apiGet('get_audit_logs.php');
    ['ha-audit-list','ha-side-audit-list'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = (!data.ok || !data.logs?.length)
        ? '<p class="empty-cell">No recent events.</p>'
        : data.logs.slice(0,6).map(l => `
            <div class="event-row">
              <i class="dot dot-sage"></i>
              <div>
                <p class="event-title">${l.action.replace(/_/g,' ')}</p>
                <p class="event-meta">${l.actor_id} · ${l.time}</p>
              </div>
            </div>`).join('');
    });
  }

  function showCredModal(title, name, userId, tempPassword, token = null) {
    document.getElementById('cred-modal-title').textContent = title;
    setText('cred-name', name);
    setText('cred-user-id', userId);
    setText('cred-password', tempPassword);
    const tokenRow = document.getElementById('cred-token-row');
    if (token) { setText('cred-token', token); tokenRow.hidden = false; }
    else tokenRow.hidden = true;
    document.getElementById('cred-modal').hidden = false;
  }

  document.getElementById('btn-close-cred-modal')?.addEventListener('click', async () => {
    document.getElementById('cred-modal').hidden = true;
    loadDoctors(); loadEmergencyPersonnel();
    const stats = await apiGet('get_stats.php');
    if (stats.ok) { setText('ha-stat-doctors', stats.doctors); setText('ha-stat-emergency', stats.emergency_personnel); }
  });

  document.getElementById('btn-register-doctor')?.addEventListener('click', async () => {
    const full_name      = document.getElementById('ha-doc-name').value.trim();
    const email          = document.getElementById('ha-doc-email').value.trim();
    const license_no     = document.getElementById('ha-doc-license').value.trim();
    const specialization = document.getElementById('ha-doc-spec').value;
    const errEl          = document.getElementById('doc-reg-error');
    clearError(errEl);
    if (!full_name || !license_no) { showError(errEl, 'Full name and license number are required.'); return; }
    if (!email) { showError(errEl, 'Email address is required.'); return; }

    const btn = document.getElementById('btn-register-doctor');
    btn.disabled = true; btn.textContent = 'Registering…';
    const data = await apiPost('register_doctor.php', { full_name, email, license_no, specialization });
    btn.disabled = false; btn.textContent = 'Register doctor';

    if (!data.ok) { showError(errEl, data.error, data._raw); return; }
    document.getElementById('ha-doc-name').value = '';
    document.getElementById('ha-doc-email').value = '';
    document.getElementById('ha-doc-license').value = '';
    const emailNote = document.getElementById('cred-email-note');
    if (emailNote) emailNote.textContent = data.email_sent
      ? `✓ Credentials emailed to ${email}.`
      : `⚠ Email could not be sent — share credentials manually.`;
    showCredModal('Doctor account created', data.full_name, data.staff_id, data.temp_password);
  });

  document.getElementById('btn-register-emergency')?.addEventListener('click', async () => {
    const full_name = document.getElementById('ha-em-name').value.trim();
    const em_role   = document.getElementById('ha-em-role').value;
    const email     = document.getElementById('ha-em-email').value.trim();
    const errEl     = document.getElementById('em-reg-error');
    clearError(errEl);
    if (!full_name) { showError(errEl, 'Full name is required.'); return; }
    if (!email) { showError(errEl, 'Email address is required.'); return; }

    const btn = document.getElementById('btn-register-emergency');
    btn.disabled = true; btn.textContent = 'Registering…';
    const data = await apiPost('register_emergency.php', { full_name, em_role, email });
    btn.disabled = false; btn.textContent = 'Register emergency personnel';

    if (!data.ok) { showError(errEl, data.error, data._raw); return; }
    document.getElementById('ha-em-name').value = '';
    document.getElementById('ha-em-email').value = '';
    const emailNote = document.getElementById('cred-email-note');
    if (emailNote) emailNote.textContent = data.email_sent
      ? `✓ Credentials emailed to ${email}.`
      : `⚠ Email could not be sent — share credentials manually.`;
    showCredModal('Emergency personnel account created', data.full_name, data.staff_id, data.temp_password, data.emergency_token);
  });
}

// ─────────────────────────────────────────────────────────────
//  SYSTEM ADMIN PAGE
// ─────────────────────────────────────────────────────────────

if (document.getElementById('screen-system-admin')) {
  (async () => {
    const user = await guardSession('system_admin');
    if (!user) return;
    setText('sa-admin-name', user.full_name);
    const stats = await apiGet('get_stats.php');
    if (stats.ok) { setText('sa-stat-facilities', stats.facilities); setText('sa-stat-admins', stats.hospital_admins); }
    loadFacilities();
    loadAdmins();
    loadAuditLogs();
  })();

  async function loadFacilities() {
    const data   = await apiGet('get_facilities.php');
    const tbody  = document.getElementById('facilities-tbody');
    const select = document.getElementById('sa-adm-facility');
    const facs   = data.ok ? data.facilities : [];

    if (tbody) {
      tbody.innerHTML = !facs.length
        ? '<tr><td colspan="4" class="empty-cell">No facilities registered yet.</td></tr>'
        : facs.map(f => `<tr>
            <td>${f.name}</td><td>${f.county}</td>
            <td class="mono">${f.facility_id}</td>
            <td><span class="badge badge-sage">${f.status}</span></td>
          </tr>`).join('');
    }
    if (select) {
      select.innerHTML = '<option value="">— select facility —</option>';
      facs.forEach(f => {
        const o = document.createElement('option');
        o.value = f.facility_id;
        o.textContent = `${f.name} (${f.facility_id})`;
        select.appendChild(o);
      });
    }
  }

  async function loadAdmins() {
    const data  = await apiGet('get_admins.php');
    const tbody = document.getElementById('admins-tbody');
    if (!tbody) return;
    tbody.innerHTML = (!data.ok || !data.admins?.length)
      ? '<tr><td colspan="3" class="empty-cell">No hospital admins registered yet.</td></tr>'
      : data.admins.map(a => `<tr>
          <td>${a.full_name}</td><td>${a.facility_name}</td>
          <td class="mono">${a.staff_id}</td>
        </tr>`).join('');
  }

  async function loadAuditLogs() {
    const data  = await apiGet('get_audit_logs.php');
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;
    tbody.innerHTML = (!data.ok || !data.logs?.length)
      ? '<tr><td colspan="4" class="empty-cell">No log entries yet.</td></tr>'
      : data.logs.map(l => `<tr>
          <td>${l.time}</td><td class="mono">${l.actor_id}</td>
          <td>${l.action.replace(/_/g,' ')}</td>
          <td class="mono">${l.log_hash ?? '—'}</td>
        </tr>`).join('');
  }

  document.getElementById('btn-register-facility')?.addEventListener('click', async () => {
    const name   = document.getElementById('sa-fac-name').value.trim();
    const county = document.getElementById('sa-fac-city').value.trim();
    const errEl  = document.getElementById('fac-reg-error');
    clearError(errEl); errEl.style.color = '';
    if (!name || !county) { showError(errEl, 'Facility name and county are required.'); return; }

    const btn = document.getElementById('btn-register-facility');
    btn.disabled = true; btn.textContent = 'Registering…';
    const data = await apiPost('register_facility.php', { name, county });
    btn.disabled = false; btn.textContent = 'Register facility';

    if (!data.ok) { showError(errEl, data.error, data._raw); return; }
    document.getElementById('sa-fac-name').value = '';
    document.getElementById('sa-fac-city').value = '';
    errEl.style.color = 'green';
    showError(errEl, `✓ Facility registered: ${data.facility_id}`);
    await loadFacilities();
    const stats = await apiGet('get_stats.php');
    if (stats.ok) setText('sa-stat-facilities', stats.facilities);
  });

  document.getElementById('btn-register-hospital-admin')?.addEventListener('click', async () => {
    const full_name   = document.getElementById('sa-adm-name').value.trim();
    const email       = document.getElementById('sa-adm-email').value.trim();
    const facility_id = document.getElementById('sa-adm-facility').value;
    const errEl       = document.getElementById('adm-reg-error');
    clearError(errEl); errEl.style.color = '';
    if (!full_name || !facility_id) { showError(errEl, 'Full name and facility are required.'); return; }
    if (!email) { showError(errEl, 'Email address is required.'); return; }

    const btn = document.getElementById('btn-register-hospital-admin');
    btn.disabled = true; btn.textContent = 'Creating account…';
    const data = await apiPost('register_hospital_admin.php', { full_name, email, facility_id });
    btn.disabled = false; btn.textContent = 'Create admin account';

    if (!data.ok) { showError(errEl, data.error, data._raw); return; }
    document.getElementById('sa-adm-name').value = '';
    document.getElementById('sa-adm-email').value = '';
    document.getElementById('sa-adm-facility').value = '';
    const saEmailNote = document.getElementById('sa-cred-email-note');
    if (saEmailNote) saEmailNote.textContent = data.email_sent
      ? `✓ Credentials emailed to ${email}.`
      : `⚠ Email could not be sent — share credentials manually.`;
    setText('sa-cred-name', data.full_name);
    setText('sa-cred-user-id', data.staff_id);
    setText('sa-cred-facility', data.facility_name);
    setText('sa-cred-password', data.temp_password);
    document.getElementById('sa-cred-modal').hidden = false;
    await loadAdmins();
    const stats = await apiGet('get_stats.php');
    if (stats.ok) setText('sa-stat-admins', stats.hospital_admins);
  });

  document.getElementById('btn-close-sa-cred')?.addEventListener('click', () => {
    document.getElementById('sa-cred-modal').hidden = true;
  });
}

// ─────────────────────────────────────────────────────────────
//  EMERGENCY PAGE
// ─────────────────────────────────────────────────────────────

if (document.getElementById('screen-emergency')) {
  let _emUser = null;
  const _accessLog = [];

  (async () => {
    _emUser = await guardSession('emergency');
    if (!_emUser) return;
    const infoEl = document.getElementById('em-staff-info');
    if (infoEl) infoEl.textContent = `${_emUser.full_name} · ${_emUser.user_id} · Token: ${_emUser.emergency_token}`;
  })();

  document.getElementById('btn-breakglass')?.addEventListener('click', async () => {
    const patientId = document.getElementById('em-patient-id').value.trim().toUpperCase();
    const reason    = document.getElementById('em-reason').value;
    const errEl     = document.getElementById('em-error');
    clearError(errEl);
    if (!patientId) { showError(errEl, 'Please enter a patient Health ID.'); return; }

    const btn = document.getElementById('btn-breakglass');
    btn.disabled = true; btn.textContent = 'Accessing…';
    const data = await apiGet(`lookup_patient.php?id=${encodeURIComponent(patientId)}&reason=${encodeURIComponent(reason)}`);
    btn.disabled = false; btn.textContent = 'Trigger break-glass access';

    if (!data.ok) { showError(errEl, data.error || 'Patient not found.', data._raw); return; }

    // Log on blockchain (non-fatal)
    apiPost('breakglass_log.php', { patient_id: patientId, reason });

    const p = data.patient;
    document.getElementById('emergency-locked-overlay')?.classList.add('hidden');
    document.getElementById('emergency-record-grid')?.classList.add('unlocked');
    setText('em-rec-name',      p.full_name);
    setText('em-rec-hid',       p.user_id);
    setText('em-rec-phone',     p.phone || '—');
    setText('em-rec-blood',     p.blood_type || 'Not recorded');
    setText('em-rec-allergies', p.allergies  || 'None recorded');

    const now = new Date().toLocaleString('en-KE', { dateStyle:'medium', timeStyle:'short' });
    setText('breakglass-status-text', `Access logged at ${now} — audit trail created`);
    document.getElementById('breakglass-status').hidden = false;

    _accessLog.unshift({
      time: new Date().toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' }),
      patient: patientId,
    });
    const tbody = document.getElementById('em-log-tbody');
    if (tbody) {
      tbody.innerHTML = _accessLog.map(e => `<tr>
        <td>${e.time}</td>
        <td class="mono">${_emUser?.user_id ?? '—'}</td>
        <td class="mono">${e.patient}</td>
        <td><span class="badge badge-coral">Break-glass</span></td>
      </tr>`).join('');
    }
  });
}
// ─────────────────────────────────────────────────────────────
//  CHANGE PASSWORD — shared helper used by hospital_admin,
//  doctor, and emergency pages.
//  Each page has its own IDs; we wire them up per-page below.
// ─────────────────────────────────────────────────────────────

/**
 * Wire up a change-password form.
 * @param {string} currentId   - ID of the "current password" input
 * @param {string} newId       - ID of the "new password" input
 * @param {string} confirmId   - ID of the "confirm" input
 * @param {string} errorId     - ID of the error <p>
 * @param {string} successId   - ID of the success <p>
 * @param {string} btnId       - ID of the submit button
 */
function wireChangePassword(currentId, newId, confirmId, errorId, successId, btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const current_password = document.getElementById(currentId)?.value ?? '';
    const new_password     = document.getElementById(newId)?.value.trim() ?? '';
    const confirm          = document.getElementById(confirmId)?.value.trim() ?? '';
    const errEl            = document.getElementById(errorId);
    const sucEl            = document.getElementById(successId);

    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    if (sucEl) { sucEl.hidden = true; sucEl.textContent = ''; }

    if (!current_password) {
      if (errEl) { errEl.textContent = 'Please enter your current password.'; errEl.hidden = false; }
      return;
    }
    if (!new_password || new_password.length < 8) {
      if (errEl) { errEl.textContent = 'New password must be at least 8 characters.'; errEl.hidden = false; }
      return;
    }
    if (new_password !== confirm) {
      if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.hidden = false; }
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Updating…';

    const data = await apiPost('change_password.php', { current_password, new_password });

    btn.disabled = false;
    btn.textContent = 'Update password';

    if (!data.ok) {
      if (errEl) { errEl.textContent = data.error || 'Password update failed.'; errEl.hidden = false; }
      return;
    }

    // Clear inputs on success
    ['currentId', 'newId', 'confirmId'].forEach(key => {
      const el = document.getElementById(arguments[['currentId','newId','confirmId'].indexOf(key)]);
      if (el) el.value = '';
    });
    document.getElementById(currentId).value = '';
    document.getElementById(newId).value = '';
    document.getElementById(confirmId).value = '';

    if (sucEl) { sucEl.textContent = '✓ Password updated successfully.'; sucEl.hidden = false; }
  });
}

// ── Hospital admin change-password tab ───────────────────────
if (document.getElementById('screen-hospital-admin')) {
  wireChangePassword(
    'ha-cp-current', 'ha-cp-new', 'ha-cp-confirm',
    'ha-cp-error', 'ha-cp-success', 'btn-ha-change-password'
  );
}

// ── Doctor change-password tab ───────────────────────────────
if (document.getElementById('screen-doctor')) {
  wireChangePassword(
    'doc-cp-current', 'doc-cp-new', 'doc-cp-confirm',
    'doc-cp-error', 'doc-cp-success', 'btn-doc-change-password'
  );
}

// ── Emergency change-password tab ────────────────────────────
if (document.getElementById('screen-emergency')) {
  wireChangePassword(
    'em-cp-current', 'em-cp-new', 'em-cp-confirm',
    'em-cp-error', 'em-cp-success', 'btn-em-change-password'
  );
}