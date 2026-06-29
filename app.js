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
    body: 'Use your Health ID, National ID, or Phone number to log in.',
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
let _patientLoginMethod = 'health_id'; // health_id | national_id | phone

const PATIENT_LOGIN_METHODS = {
  health_id:   { label: 'Health ID',   placeholder: 'KE-HID-XXXXX', idLabel: 'Health ID' },
  national_id: { label: 'National ID', placeholder: 'e.g. 34218765', idLabel: 'National ID' },
  phone:       { label: 'Phone',       placeholder: '07XX XXX XXX',  idLabel: 'Phone number' },
};

if (loginRoleSelect) {
  function updateRoleHint() {
    const role = loginRoleSelect.value;
    const hint = ROLE_HINTS[role] || ROLE_HINTS['patient'];
    document.getElementById('login-hint-text').innerHTML = `<strong>${hint.title}</strong> — ${hint.body}`;
    document.querySelector('.role-hint-icon').textContent = hint.icon;
    const methodDiv = document.getElementById('patient-login-method');
    if (role === 'patient') {
      if (methodDiv) methodDiv.hidden = false;
      applyPatientLoginMethod(_patientLoginMethod);
    } else {
      if (methodDiv) methodDiv.hidden = true;
      document.getElementById('login-id-label').textContent = hint.idLabel;
      document.getElementById('login-id').placeholder = hint.placeholder;
    }
    const regLink = document.getElementById('login-register-link');
    if (regLink) regLink.hidden = !hint.showRegister;
  }

  function applyPatientLoginMethod(method) {
    const m = PATIENT_LOGIN_METHODS[method] || PATIENT_LOGIN_METHODS['health_id'];
    document.getElementById('login-id-label').textContent = m.idLabel;
    document.getElementById('login-id').placeholder = m.placeholder;
    const inp = document.getElementById('login-id');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  // Patient login method button clicks
  document.querySelectorAll('.pat-login-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pat-login-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _patientLoginMethod = btn.dataset.method;
      applyPatientLoginMethod(_patientLoginMethod);
    });
  });

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
    if (password.length < 8) { showError(errEl, 'Password must be at least 8 characters.'); return; }

    btnLogin.disabled = true; btnLogin.textContent = 'Logging in…';
    const data = await apiPost('login.php', { user_id, password, role });
    btnLogin.disabled = false; btnLogin.textContent = 'Log in';

    if (!data.ok) { showError(errEl, data.error || 'Login failed.', data._raw); return; }

    // Save token — must happen before any redirect
    if (data.token) sessionStorage.setItem('authToken', data.token);

    // Store user so first_login.html knows the role and can redirect correctly
    sessionStorage.setItem('authUser', JSON.stringify(data.user));

    // Roles that must change password on first login (system_admin excluded)
    const mustChangePw = ['patient', 'doctor', 'hospital_admin', 'emergency'];

    if (data.password_changed === 0 && mustChangePw.includes(data.user.role)) {
      window.location.href = 'first_login.html';
      return;
    }

    const pageMap = {
      patient        : 'patient.html',
      doctor         : 'doctor.html',
      hospital_admin : 'hospital-admin.html',
      system_admin   : 'system-admin.html',
      emergency      : 'emergency.html',
    };
    window.location.href = pageMap[data.user.role] || 'login.html';
  });

  document.getElementById('login-pass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnLogin.click();
  });
}


// ─────────────────────────────────────────────────────────────
//  PUBLIC PATIENT REGISTRATION (login page — pane-register)
// ─────────────────────────────────────────────────────────────

if (document.getElementById('pane-register')) {
  // Load active hospitals into the dropdown when the register pane becomes visible
  async function loadPublicHospitals() {
    const sel = document.getElementById('reg-hospital');
    if (!sel) return;
    const res = await apiGet('get_facilities_public.php');
    if (res.ok && res.facilities?.length) {
      sel.innerHTML = '<option value="">— Select your primary hospital —</option>'
        + res.facilities.map(f =>
            `<option value="${f.facility_id}">${f.name}${f.county ? ' — ' + f.county : ''}</option>`
          ).join('');
    } else {
      sel.innerHTML = '<option value="">No hospitals registered yet</option>';
    }
  }

  // Load hospitals when the "Create account" tab is first clicked
  document.querySelectorAll('.seg-btn[data-pane="pane-register"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sel = document.getElementById('reg-hospital');
      if (sel && sel.options.length <= 1) loadPublicHospitals();
    });
  });
  // Also load immediately if the register pane starts active
  if (document.getElementById('pane-register')?.classList.contains('active')) {
    loadPublicHospitals();
  }

  // "Go to login" button on success card
  document.getElementById('btn-reg-go-login')?.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.pane === 'pane-login'));
    document.querySelectorAll('.auth-pane').forEach(p =>
      p.classList.toggle('active', p.id === 'pane-login'));
    // Reset register form for next use
    document.getElementById('reg-success-card').hidden = true;
    document.getElementById('reg-form-wrap').hidden = false;
  });

  const btnRegister = document.getElementById('btn-register');
  if (btnRegister) {
    btnRegister.addEventListener('click', async () => {
      const full_name    = document.getElementById('reg-full-name')?.value.trim() || '';
      const national_id  = document.getElementById('reg-national-id')?.value.trim() || '';
      const facility_id  = document.getElementById('reg-hospital')?.value || '';
      const dob          = document.getElementById('reg-dob')?.value || '';
      const gender       = document.getElementById('reg-gender')?.value || '';
      const phone        = document.getElementById('reg-phone')?.value.trim().replace(/\s/g,'') || '';
      const email        = document.getElementById('reg-email')?.value.trim() || '';
      const blood_type   = document.getElementById('reg-blood')?.value || '';
      const allergies    = document.getElementById('reg-allergies')?.value.trim() || '';
      const ec_name      = document.getElementById('reg-ec-name')?.value.trim() || '';
      const ec_rel       = document.getElementById('reg-ec-rel')?.value || '';
      const ec_phone     = document.getElementById('reg-ec-phone')?.value.trim().replace(/\s/g,'') || '';
      const kin_name     = document.getElementById('reg-kin-name')?.value.trim() || '';
      const kin_rel      = document.getElementById('reg-kin-rel')?.value || '';
      const errEl        = document.getElementById('reg-error');
      clearError(errEl);

      if (!full_name)   { showError(errEl, 'Full name is required.'); return; }
      if (full_name.length < 3) { showError(errEl, 'Full name must be at least 3 characters.'); return; }
      if (!national_id) { showError(errEl, 'National ID is required.'); return; }
      if (!/^\d{7,9}$/.test(national_id)) { showError(errEl, 'National ID must be 7–9 digits (numbers only).'); return; }
      if (!facility_id) { showError(errEl, 'Please select your primary hospital.'); return; }
      if (!dob)         { showError(errEl, 'Date of birth is required.'); return; }
      if (dob > new Date().toISOString().split('T')[0]) { showError(errEl, 'Date of birth cannot be in the future.'); return; }
      if (!gender)      { showError(errEl, 'Gender is required.'); return; }
      if (!phone)       { showError(errEl, 'Phone number is required.'); return; }
      if (!/^0[0-9]{9}$/.test(phone)) { showError(errEl, 'Enter a valid Kenyan phone number (e.g. 0712345678).'); return; }
      if (email && !/^[^@]+@[^@]+\.[^@]+$/.test(email)) { showError(errEl, 'Invalid email address.'); return; }
      if (!ec_name)     { showError(errEl, 'Emergency contact name is required.'); return; }
      if (!ec_rel)      { showError(errEl, 'Emergency contact relationship is required.'); return; }
      if (!ec_phone)    { showError(errEl, 'Emergency contact phone is required.'); return; }
      if (!/^0[0-9]{9}$/.test(ec_phone)) { showError(errEl, 'Enter a valid Kenyan phone for emergency contact.'); return; }
      if (!kin_name)    { showError(errEl, 'Next of kin name is required.'); return; }
      if (!kin_rel)     { showError(errEl, 'Next of kin relationship is required.'); return; }

      btnRegister.disabled = true; btnRegister.textContent = 'Creating account…';
      const data = await apiPost('register_patient.php', {
        full_name,
        national_id,
        facility_id,
        date_of_birth: dob,
        gender,
        phone,
        email,
        blood_type,
        allergies,
        emergency_contact_name: ec_name,
        emergency_contact_relationship: ec_rel,
        emergency_contact_phone: ec_phone,
        next_of_kin_name: kin_name,
        next_of_kin_relationship: kin_rel,
      });
      btnRegister.disabled = false; btnRegister.textContent = 'Create patient account';

      if (!data.ok) { showError(errEl, data.error, data._raw); return; }

      // Show success card — hide form
      document.getElementById('reg-form-wrap').hidden = true;
      const sc = document.getElementById('reg-success-card');
      sc.hidden = false;
      document.getElementById('reg-success-hid').textContent = data.health_id;

      const emailStatus = data.email_sent ? '✓ Email sent'  : '✗ Email not sent';
      const smsStatus   = data.sms_sent   ? '✓ SMS sent'    : '✗ SMS not sent';
      document.getElementById('reg-success-details').innerHTML =
        `<strong>Name:</strong> ${data.full_name}<br>` +
        `<strong>Primary hospital:</strong> ${data.facility_name}<br>` +
        `<strong>Notifications:</strong> ${emailStatus} · ${smsStatus}<br>` +
        `<em style="font-size:12px;">Your temporary password was sent via email/SMS. Change it on first login.</em>`;
    });
  }
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
    setText('patient-welcome-name', _patientUser.full_name);
    setText('patient-health-id', _patientUser.user_id);

    const stats = await apiGet('get_patient_stats.php');
    if (stats.ok) {
      setText('stat-records', stats.records);
      setText('stat-prescriptions', stats.prescriptions);
      setText('patient-consent-count', stats.consents);
      if (stats.primary_hospital) {
        const hospEl = document.getElementById('patient-primary-hospital');
        if (hospEl) hospEl.textContent = 'Primary Hospital: ' + stats.primary_hospital;
      }
    }

    await loadPatientRecords();
    await loadConsents();
    await loadNotifications();
    await pollForOTP();  // immediate first check

    // Poll every 4 seconds for new access requests
    _otpPollTimer = setInterval(pollForOTP, 4000);
  })();

  async function loadPatientRecords() {
    const data  = await apiGet('get_records.php');
    const tbody = document.getElementById('records-tbody');
    if (!tbody) return;
    const recs = data.ok ? data.records : [];
    tbody.innerHTML = !recs.length
      ? '<tr><td colspan="5" class="empty-cell">No records on file yet.</td></tr>'
      : recs.map(r => `<tr>
          <td>${formatDate(r.created_at)}</td>
          <td>${r.facility_name || '—'}</td>
          <td>${r.record_type}</td>
          <td>${r.doctor_name}</td>
          <td></td>
        </tr>`).join('');
  }

  async function loadConsents() {
    const data    = await apiGet('get_consents.php');
    const list    = document.getElementById('consent-list');
    const empty   = document.getElementById('consent-empty');
    if (!list) return;
    const consents = data.ok ? data.consents : [];
    setText('patient-consent-count', consents.length);
    if (!consents.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = consents.map(c => `
      <div class="consent-item">
        <div>
          <p class="consent-name">${c.doctor_name}</p>
          <p class="consent-meta">${c.facility_name || '—'} · Since ${formatDate(c.granted_at)}</p>
        </div>
        <button class="btn-ghost revoke-btn" data-doctor="${c.doctor_id}">Revoke</button>
      </div>`).join('');
    list.querySelectorAll('.revoke-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Revoking…';
        const res = await apiPost('revoke_consent.php', { doctor_id: btn.dataset.doctor });
        if (res.ok) { await loadConsents(); await loadNotifications(); }
        else { btn.disabled = false; btn.textContent = 'Revoke'; alert(res.error || 'Could not revoke.'); }
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

  // Poll for pending access requests — shows full request details to patient
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

    // Populate doctor identity
    setText('pending-doctor-name', 'Dr. ' + data.doctor_name);
    setText('pending-hospital-name', data.hospital_name || '—');
    setText('pending-reason', data.reason || '—');

    // Populate requested record types as a bullet list
    const typesList = document.getElementById('pending-record-types');
    if (typesList) {
      const types = data.record_types || [];
      typesList.innerHTML = types.length
        ? types.map(t => `<li>${t}</li>`).join('')
        : '<li style="color:var(--muted)">Not specified</li>';
    }

    // If patient already approved, hide the buttons and show live countdown
    if (data.patient_approved) {
      const actions = card.querySelector('.pending-actions');
      if (actions) actions.hidden = true;
      const reveal = document.getElementById('pending-otp-reveal');
      if (reveal) reveal.hidden = false;
      // Start/update live countdown from server-supplied seconds_remaining
      if (typeof data.seconds_remaining === 'number') {
        startPatientCountdown(data.seconds_remaining);
      }
    }
  }

  // Live countdown shown to patient after they approve
  let _patientCountdownTimer = null;
  function startPatientCountdown(secondsLeft) {
    if (_patientCountdownTimer) clearInterval(_patientCountdownTimer);
    const el = document.getElementById('patient-otp-countdown');
    function tick() {
      if (!el) return;
      if (secondsLeft <= 0) {
        clearInterval(_patientCountdownTimer);
        el.textContent = 'This OTP has expired. The doctor must request access again.';
        el.style.color = 'var(--coral,#e74c3c)';
        // Hide approve button if somehow still visible
        const actions = document.getElementById('pending-otp-card')?.querySelector('.pending-actions');
        if (actions) actions.hidden = true;
        return;
      }
      const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
      const s = String(secondsLeft % 60).padStart(2, '0');
      el.textContent = `OTP expires in ${m}:${s}`;
      el.style.color = secondsLeft <= 60 ? 'var(--coral,#e74c3c)' : 'var(--muted,#888)';
      secondsLeft--;
    }
    tick();
    _patientCountdownTimer = setInterval(tick, 1000);
  }

  // Re-open card if banner is clicked
  document.getElementById('patient-otp-flag')?.addEventListener('click', () => {
    document.getElementById('pending-otp-card').hidden = false;
  });

  document.getElementById('btn-confirm-otp-issued')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-confirm-otp-issued');
    btn.disabled = true; btn.textContent = 'Approving…';

    const res = await apiPost('approve_otp.php', {});

    if (res.ok) {
      btn.textContent = 'Approved ✓';
      btn.disabled = true;

      // Show confirmation: doctor now has the OTP on their dashboard
      const reveal = document.getElementById('pending-otp-reveal');
      if (reveal) reveal.hidden = false;

      // Hide approve/deny buttons
      const card = document.getElementById('pending-otp-card');
      const actions = card?.querySelector('.pending-actions');
      if (actions) actions.hidden = true;

      // Start live countdown from server-supplied seconds_remaining
      if (typeof res.seconds_remaining === 'number') {
        startPatientCountdown(res.seconds_remaining);
      }

      await loadNotifications();
    } else {
      alert(res.error || 'Could not approve — the request may have expired.');
      btn.disabled = false; btn.textContent = 'Approve';
    }
  });

  document.getElementById('btn-deny-otp')?.addEventListener('click', async () => {
    const res = await apiPost('deny_otp.php', {});
    if (res.ok) {
      document.getElementById('pending-otp-card').hidden = true;
      const flag = document.getElementById('patient-otp-flag');
      if (flag) flag.hidden = true;
      await loadNotifications();
    }
  });

  // Remove simulate button if it exists from old builds
  const simBtn = document.getElementById('btn-simulate-request');
  if (simBtn) simBtn.remove();
}

// ─────────────────────────────────────────────────────────────
//  DOCTOR PAGE
// ─────────────────────────────────────────────────────────────

if (document.getElementById('screen-doctor')) {
  let _doctorUser = null;
  let _currentPatientId = null;
  let _docSearchType = 'health_id';

  (async () => {
    _doctorUser = await guardSession('doctor');
    if (!_doctorUser) return;
    setText('doctor-name', 'Dr. ' + _doctorUser.full_name);
    setText('doctor-staff-id', _doctorUser.user_id);
    setText('doctor-facility', _doctorUser.facility_name || '—');

    const stats = await apiGet('get_doctor_stats.php');
    if (stats.ok) {
      setText('stat-patients-seen', stats.patients_seen);
      setText('stat-records-today', stats.records_today);
      setText('stat-pending-reviews', stats.pending_reviews);
    }
  })();

  // ── Search type toggle (Health ID / National ID / Phone) ────
  document.querySelectorAll('[data-doc-search-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-doc-search-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _docSearchType = btn.dataset.docSearchType;

      const input   = document.getElementById('doctor-search-id');
      const label   = document.getElementById('doc-search-label');
      const hint    = document.getElementById('doc-search-hint');

      if (_docSearchType === 'health_id') {
        if (label) label.textContent = 'Patient Health ID';
        if (input) input.placeholder = 'KE-HID-XXXXX';
        if (hint)  hint.textContent  = "Enter the patient's HealthShare ID from their card.";
      } else if (_docSearchType === 'national_id') {
        if (label) label.textContent = 'National ID number';
        if (input) input.placeholder = 'e.g. 12345678';
        if (hint)  hint.textContent  = "Enter the patient's national ID number.";
      } else {
        if (label) label.textContent = 'Phone number';
        if (input) input.placeholder = 'e.g. 0712 345678';
        if (hint)  hint.textContent  = "Enter the patient's registered phone number.";
      }
      if (input) { input.value = ''; input.focus(); }
    });
  });

  // ── OTP poll timer ──────────────────────────────────────────
  let _doctorOtpPollTimer = null;

  function stopDoctorOtpPoll() {
    if (_doctorOtpPollTimer) { clearInterval(_doctorOtpPollTimer); _doctorOtpPollTimer = null; }
  }

  let _doctorCountdownTimer = null;
  function startDoctorCountdown(secondsLeft) {
    if (_doctorCountdownTimer) clearInterval(_doctorCountdownTimer);
    const expiryEl = document.getElementById('doctor-otp-expiry');
    function tick() {
      if (!expiryEl) return;
      if (secondsLeft <= 0) {
        clearInterval(_doctorCountdownTimer);
        expiryEl.textContent = 'This OTP has expired. Please request access again.';
        expiryEl.style.color = 'var(--coral,#e74c3c)';
        // Hide OTP display and entry form on expiry
        const otpDisplay = document.getElementById('doctor-approved-otp');
        if (otpDisplay) otpDisplay.textContent = '——————';
        const entryEl = document.getElementById('doctor-otp-entry');
        if (entryEl) entryEl.hidden = true;
        const errEl = document.getElementById('otp-error');
        if (errEl) {
          errEl.textContent = 'This OTP has expired. Please request access again.';
          errEl.hidden = false;
        }
        return;
      }
      const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
      const s = String(secondsLeft % 60).padStart(2, '0');
      expiryEl.textContent = `Expires in ${m}:${s}`;
      expiryEl.style.color = secondsLeft <= 60 ? 'var(--coral,#e74c3c)' : '';
      secondsLeft--;
    }
    tick();
    _doctorCountdownTimer = setInterval(tick, 1000);
  }

  // Poll for patient approval. When approved, patient receives OTP via SMS —
  // doctor must ask the patient for the code verbally and type it below.
  function startDoctorOtpPoll(patientId) {
    stopDoctorOtpPoll();
    async function poll() {
      const data = await apiGet('get_doctor_otp.php?patient_id=' + encodeURIComponent(patientId));
      if (!data.ok) return;
      const statusEl = document.getElementById('doctor-otp-status');

      if (data.status === 'approved') {
        // Patient approved — OTP was sent to patient's phone via SMS
        stopDoctorOtpPoll();
        if (statusEl) statusEl.textContent = 'Patient approved. Ask the patient for the code sent to their phone.';

        const titleEl = document.getElementById('otp-card-title');
        if (titleEl) titleEl.textContent = 'Access Approved';

        const dotEl = document.getElementById('otp-card-dot');
        if (dotEl) { dotEl.classList.remove('dot-amber'); dotEl.classList.add('dot-sage'); }

        // Show the approved info block (explains that OTP went to patient's phone)
        const approvedBlock = document.getElementById('doctor-otp-approved-block');
        if (approvedBlock) approvedBlock.hidden = false;

        // Show the manual entry form — doctor enters code received verbally from patient
        const entryEl = document.getElementById('doctor-otp-entry');
        if (entryEl) entryEl.hidden = false;
        document.getElementById('doctor-otp-input')?.focus();

        // Start live MM:SS countdown from server-supplied seconds_remaining
        if (typeof data.seconds_remaining === 'number') {
          startDoctorCountdown(data.seconds_remaining);
        }

      } else if (data.status === 'expired') {
        stopDoctorOtpPoll();
        const titleEl = document.getElementById('otp-card-title');
        if (titleEl) titleEl.textContent = 'OTP Expired';
        if (statusEl) statusEl.textContent = '';
        const expiryEl = document.getElementById('doctor-otp-expiry');
        if (expiryEl) {
          expiryEl.textContent = 'This OTP has expired. Please request access again.';
          expiryEl.style.color = 'var(--coral,#e74c3c)';
        }
        // Hide the OTP code and entry form
        const otpDisplay = document.getElementById('doctor-approved-otp');
        if (otpDisplay) otpDisplay.textContent = '——————';
        const entryEl = document.getElementById('doctor-otp-entry');
        if (entryEl) entryEl.hidden = true;
        const errEl = document.getElementById('otp-error');
        if (errEl) {
          errEl.textContent = 'This OTP has expired. Please request access again.';
          errEl.hidden = false;
        }
      } else if (data.status === 'access_granted') {
        stopDoctorOtpPoll();
        await grantDoctorAccess(patientId);
      } else if (data.status === 'denied') {
        stopDoctorOtpPoll();
        const titleEl = document.getElementById('otp-card-title');
        if (titleEl) titleEl.textContent = 'Request denied';
        if (statusEl) statusEl.textContent = 'The patient denied this request.';
        const errEl = document.getElementById('otp-error');
        if (errEl) { errEl.textContent = 'Patient denied the request.'; errEl.hidden = false; }
      } else if (data.status === 'expired') {
        stopDoctorOtpPoll();
        if (statusEl) statusEl.textContent = 'OTP expired. Please send a new request.';
      } else {
        // pending — keep waiting
        if (statusEl) statusEl.textContent = 'Waiting for the patient to respond…';
      }
    }
    poll();
    _doctorOtpPollTimer = setInterval(poll, 3000);
  }

  // ── OTP verification ────────────────────────────────────────
  document.getElementById('btn-verify-otp')?.addEventListener('click', async () => {
    const patientId = _currentPatientId;
    const otp = document.getElementById('doctor-otp-input')?.value.trim().replace(/\s+/g, '');
    const errEl = document.getElementById('otp-error');
    if (!otp) {
      if (errEl) { errEl.textContent = 'Please enter the 6-digit code.'; errEl.hidden = false; }
      return;
    }
    if (errEl) errEl.hidden = true;

    const btn = document.getElementById('btn-verify-otp');
    btn.disabled = true; btn.textContent = 'Verifying…';

    const data = await apiPost('verify_otp.php', { patient_id: patientId, otp });

    btn.disabled = false; btn.textContent = 'Verify';

    if (!data.ok) {
      if (errEl) { errEl.textContent = data.error || 'Incorrect code.'; errEl.hidden = false; }
      return;
    }

    await grantDoctorAccess(patientId);
  });

  document.getElementById('doctor-otp-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-verify-otp')?.click();
  });

  // ── Grant doctor access after successful OTP verification ───
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

  // ── Search ──────────────────────────────────────────────────
  function resetDoctorAccessState() {
    stopDoctorOtpPoll();
    document.getElementById('access-status-locked').hidden = true;
    document.getElementById('access-status-granted').hidden = true;
    document.getElementById('otp-request-card').hidden = true;
    document.getElementById('doc-found-patient-card').hidden = true;
    document.getElementById('request-records-form').hidden = true;
    const errEl = document.getElementById('otp-error');
    if (errEl) errEl.hidden = true;
    const reqErr = document.getElementById('request-records-error');
    if (reqErr) reqErr.hidden = true;
    document.getElementById('record-locked-overlay')?.classList.remove('hidden');
    document.getElementById('record-grid')?.classList.remove('unlocked');
    const recSection = document.getElementById('doctor-records-section');
    if (recSection) recSection.hidden = true;
    const statusEl = document.getElementById('doctor-otp-status');
    if (statusEl) statusEl.textContent = 'Waiting for the patient to respond…';
    const entryEl = document.getElementById('doctor-otp-entry');
    if (entryEl) entryEl.hidden = true;
    const inputEl = document.getElementById('doctor-otp-input');
    if (inputEl) inputEl.value = '';
    const titleEl = document.getElementById('otp-card-title');
    if (titleEl) titleEl.textContent = 'Awaiting patient approval';
    const dotEl = document.getElementById('otp-card-dot');
    if (dotEl) { dotEl.classList.add('dot-amber'); dotEl.classList.remove('dot-sage'); }
    const approvedBlock = document.getElementById('doctor-otp-approved-block');
    if (approvedBlock) approvedBlock.hidden = true;
    const otpDisplay = document.getElementById('doctor-approved-otp');
    if (otpDisplay) otpDisplay.textContent = '';
    // Clear reason and checkboxes
    const reasonEl = document.getElementById('doc-reason');
    if (reasonEl) reasonEl.value = '';
    document.querySelectorAll('#record-type-checkboxes input[type=checkbox]')
      .forEach(cb => { cb.checked = false; });
    ['btn-view-records','btn-submit-diagnosis','btn-update-records',
     'record-type','clinical-notes','btn-submit-record'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });
  }

  async function doctorSearchPatient() {
    const rawValue = document.getElementById('doctor-search-id')?.value.trim();
    const errEl    = document.getElementById('doc-search-error');
    if (errEl) errEl.hidden = true;
    if (!rawValue) { if (errEl) { errEl.textContent = 'Please enter a value to search.'; errEl.hidden = false; } return; }

    resetDoctorAccessState();
    _currentPatientId = null;

    let url;
    if (_docSearchType === 'health_id') {
      url = 'lookup_patient_for_doctor.php?id=' + encodeURIComponent(rawValue.toUpperCase());
    } else {
      url = 'lookup_patient_for_doctor.php?search=' + encodeURIComponent(rawValue)
          + '&type=' + encodeURIComponent(_docSearchType);
    }

    const btn = document.getElementById('btn-doctor-search');
    btn.disabled = true; btn.textContent = 'Searching…';
    const data = await apiGet(url);
    btn.disabled = false; btn.textContent = 'Search';

    if (!data.ok) {
      if (errEl) { errEl.textContent = data.error || 'Patient not found.'; errEl.hidden = false; }
      return;
    }

    const p = data.patient;
    _currentPatientId = p.user_id;

    // Populate and show the found-patient card
    setText('found-name',  p.full_name);
    setText('found-hid',   p.user_id);
    setText('found-phone', p.phone || '—');

    // Primary hospital + cross-hospital indicator
    const facilityText = p.primary_facility || 'No primary hospital set';
    const facilityEl   = document.getElementById('found-facility');
    if (facilityEl) {
      facilityEl.textContent = facilityText;
      // Remove any old badge
      const oldBadge = document.getElementById('cross-hospital-badge');
      if (oldBadge) oldBadge.remove();
      if (p.cross_hospital) {
        const badge = document.createElement('span');
        badge.id = 'cross-hospital-badge';
        badge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 8px;'
          + 'background:#fff3cd;border:1px solid #ffc107;border-radius:4px;'
          + 'font-size:11px;font-weight:600;color:#856404;';
        badge.textContent = 'Cross-Hospital Access Required';
        facilityEl.after(badge);
      }
    }
    document.getElementById('doc-found-patient-card').hidden = false;

    // Show the access-locked status and the request form
    document.getElementById('access-status-locked').hidden = false;
    document.getElementById('request-records-form').hidden = false;
  }

  document.getElementById('btn-doctor-search')?.addEventListener('click', doctorSearchPatient);
  document.getElementById('doctor-search-id')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doctorSearchPatient();
  });

  // ── Request Records (new button, replaces old "Request access") ──
  document.getElementById('btn-request-records')?.addEventListener('click', async () => {
    const patientId = _currentPatientId;
    if (!patientId) { alert('Please search for a patient first.'); return; }

    const reason = document.getElementById('doc-reason')?.value.trim();
    const checkedBoxes = [...document.querySelectorAll('#record-type-checkboxes input[type=checkbox]:checked')];
    const recordTypes  = checkedBoxes.map(cb => cb.value);
    const errEl = document.getElementById('request-records-error');

    if (!reason) {
      if (errEl) { errEl.textContent = 'Reason for access is required.'; errEl.hidden = false; }
      return;
    }
    if (!recordTypes.length) {
      if (errEl) { errEl.textContent = 'Please select at least one record type.'; errEl.hidden = false; }
      return;
    }
    if (errEl) errEl.hidden = true;

    const btn = document.getElementById('btn-request-records');
    btn.disabled = true; btn.textContent = 'Sending…';

    const data = await apiPost('request_access.php', {
      patient_id:   patientId,
      reason:       reason,
      record_types: recordTypes,
    });

    btn.disabled = false; btn.textContent = 'Request Records';

    if (!data.ok) {
      if (errEl) { errEl.textContent = data.error || 'Request failed.'; errEl.hidden = false; }
      return;
    }

    // Hide the request form and show the waiting card
    document.getElementById('request-records-form').hidden = true;
    document.getElementById('access-status-locked').hidden = true;
    document.getElementById('otp-request-card').hidden = false;

    const statusEl = document.getElementById('doctor-otp-status');
    if (statusEl) statusEl.textContent = 'Request sent. Waiting for the patient to respond…';

    // Start polling — when patient approves, OTP appears for manual entry
    startDoctorOtpPoll(patientId);
  });

  // ── Record history ──────────────────────────────────────────
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
    if (_currentPatientId) loadDoctorPatientRecords(_currentPatientId);
  });

  document.getElementById('btn-submit-diagnosis')?.addEventListener('click', () => {
    const panel = document.getElementById('submit-record-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('record-type')?.focus();
    }
  });

  document.getElementById('btn-update-records')?.addEventListener('click', async () => {
    if (_currentPatientId) {
      await loadDoctorPatientRecords(_currentPatientId);
      const panel = document.getElementById('submit-record-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('clinical-notes')?.focus();
    }
  });

  // ── Submit clinical record ──────────────────────────────────
  document.getElementById('btn-submit-record')?.addEventListener('click', async () => {
    const patientId  = _currentPatientId;
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
      : `Record submitted ✓\nStored locally (IPFS/sidecar unreachable)`;
    alert(msg);
    document.getElementById('clinical-notes').value = '';

    const stats = await apiGet('get_doctor_stats.php');
    if (stats.ok) { setText('stat-records-today', stats.records_today); }
    if (_currentPatientId) await loadDoctorPatientRecords(_currentPatientId);
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
    loadPatients();
  })();

  // ── Patient helpers ───────────────────────────────────────────

  async function loadPatients() {
    const data  = await apiGet('get_patients.php');
    const tbody = document.getElementById('patient-list-tbody');
    if (!tbody) return;
    const patients = data.ok ? data.patients : [];
    setText('ha-stat-patients', patients.length);
    tbody.innerHTML = !patients.length
      ? '<tr><td colspan="6" class="empty-cell">No patients registered yet.</td></tr>'
      : patients.map(p => `<tr>
          <td>${p.full_name}</td>
          <td class="mono">${p.health_id}</td>
          <td class="mono">${p.national_id ?? '—'}</td>
          <td>${p.phone ?? '—'}</td>
          <td>${p.registered_at ? new Date(p.registered_at).toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</td>
          <td>
            <a href="#" class="link-edit-patient" data-hid="${p.health_id}" style="margin-right:8px;">Edit</a>
            <a href="#" class="link-reissue-patient" data-hid="${p.health_id}" data-name="${p.full_name}">Reissue</a>
          </td>
        </tr>`).join('');

    // Store patient data for edit pre-fill
    tbody._patients = patients;

    tbody.querySelectorAll('.link-edit-patient').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const hid = link.dataset.hid;
        const pt  = tbody._patients.find(x => x.health_id === hid);
        if (!pt) return;
        openEditPanel(pt);
      });
    });

    tbody.querySelectorAll('.link-reissue-patient').forEach(link => {
      link.addEventListener('click', async e => {
        e.preventDefault();
        if (!confirm(`Reissue credentials for ${link.dataset.name}? Their current password will be invalidated.`)) return;
        const data = await apiPost('reissue_patient_credentials.php', { health_id: link.dataset.hid });
        if (!data.ok) { alert('Failed: ' + (data.error || 'Unknown error')); return; }
        showPatientCredModal('Credentials reissued', data.full_name, data.health_id, data.temp_password, data.email_sent);
      });
    });
  }

  function openEditPanel(pt) {
    const panel = document.getElementById('pt-edit-panel');
    if (!panel) return;
    panel.hidden = false;
    setText('pt-edit-name', pt.full_name + ' · ' + pt.health_id);
    document.getElementById('pt-edit-health-id').value  = pt.health_id;
    document.getElementById('pt-edit-phone').value      = pt.phone      ?? '';
    document.getElementById('pt-edit-email').value      = pt.email      ?? '';
    document.getElementById('pt-edit-blood').value      = pt.blood_type ?? '';
    document.getElementById('pt-edit-allergies').value  = pt.allergies  ?? '';
    document.getElementById('pt-edit-emergency').value  = pt.emergency_contact ?? '';
    document.getElementById('pt-edit-kin').value        = pt.next_of_kin       ?? '';
    clearError(document.getElementById('pt-edit-error'));
    document.getElementById('pt-edit-success').hidden = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('btn-cancel-patient-edit')?.addEventListener('click', () => {
    const panel = document.getElementById('pt-edit-panel');
    if (panel) panel.hidden = true;
  });

  document.getElementById('btn-save-patient-edit')?.addEventListener('click', async () => {
    const health_id        = document.getElementById('pt-edit-health-id').value;
    const phone            = document.getElementById('pt-edit-phone').value.trim();
    const email            = document.getElementById('pt-edit-email').value.trim();
    const blood_type       = document.getElementById('pt-edit-blood').value;
    const allergies        = document.getElementById('pt-edit-allergies').value.trim();
    const emergency_contact = document.getElementById('pt-edit-emergency').value.trim();
    const next_of_kin      = document.getElementById('pt-edit-kin').value.trim();
    const errEl   = document.getElementById('pt-edit-error');
    const succEl  = document.getElementById('pt-edit-success');
    clearError(errEl); succEl.hidden = true;

    const btn = document.getElementById('btn-save-patient-edit');
    btn.disabled = true; btn.textContent = 'Saving…';
    const data = await apiPost('update_patient.php', {
      health_id, phone, email, blood_type, allergies, emergency_contact, next_of_kin
    });
    btn.disabled = false; btn.textContent = 'Save changes';

    if (!data.ok) { showError(errEl, data.error || 'Update failed.'); return; }
    succEl.textContent = '✓ Patient demographics updated.';
    succEl.hidden = false;
    await loadPatients();
  });

  // ── Register patient ──────────────────────────────────────────

  // Patient registration moved to public login page (pane-register in login.html).

  // ── Patient credential modal ──────────────────────────────────

  function showPatientCredModal(title, name, healthId, facilityName, emailSent, smsSent) {
    document.getElementById('pt-cred-modal-title').textContent = title;
    setText('pt-cred-name', name);
    setText('pt-cred-health-id', healthId);
    // Do NOT display the temporary password on screen — it was delivered via email/SMS
    const pwEl = document.getElementById('pt-cred-password');
    if (pwEl) { pwEl.textContent = '— delivered via email / SMS —'; pwEl.style.color = '#888'; }

    setText('pt-cred-facility', facilityName || '—');

    const noteEl = document.getElementById('pt-cred-email-note');
    if (noteEl) {
      const emailStatus = emailSent ? '✓ Email sent' : '✗ Email not sent';
      const smsStatus   = smsSent   ? '✓ SMS sent'   : '✗ SMS not sent';
      noteEl.textContent = emailStatus + '  ·  ' + smsStatus;
      noteEl.hidden = false;
      noteEl.style.color = (emailSent || smsSent) ? '#2d7a4f' : '#c0392b';
    }
    document.getElementById('patient-cred-modal').hidden = false;
  }

  document.getElementById('btn-close-patient-cred-modal')?.addEventListener('click', () => {
    document.getElementById('patient-cred-modal').hidden = true;
  });

  document.getElementById('btn-print-patient-cred')?.addEventListener('click', () => {
    const d = document.getElementById('patient-cred-modal')._printData || {};
    const w = window.open('', '_blank', 'width=480,height=400');
    w.document.write(`
      <!DOCTYPE html><html><head><title>HealthShare Credentials</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; }
        h2   { margin-bottom: 6px; }
        .row { display: flex; gap: 24px; margin: 10px 0; }
        .lbl { font-weight: bold; width: 130px; }
        .val { font-family: monospace; font-size: 1.1em; }
        .note{ margin-top: 20px; font-size: 12px; color: #555; }
      </style></head><body>
      <h2>HealthShare — Patient Credentials</h2>
      <p>Please keep these details safe and present them on every hospital visit.</p>
      <div class="row"><span class="lbl">Patient name</span><span class="val">${d.name ?? ''}</span></div>
      <div class="row"><span class="lbl">Health ID</span><span class="val">${d.healthId ?? ''}</span></div>
      <div class="row"><span class="lbl">Temp password</span><span class="val">${d.tempPassword ?? ''}</span></div>
      <p class="note">You will be asked to change this password on first login.<br>
      Patients are not expected to log in immediately.</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  });

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
    const phone          = document.getElementById('ha-doc-phone')?.value.trim() ?? '';
    const license_no     = document.getElementById('ha-doc-license').value.trim();
    const specialization = document.getElementById('ha-doc-spec').value;
    const errEl          = document.getElementById('doc-reg-error');
    clearError(errEl);
    if (!full_name || !license_no) { showError(errEl, 'Full name and license number are required.'); return; }
    if (!email) { showError(errEl, 'Email address is required.'); return; }

    const btn = document.getElementById('btn-register-doctor');
    btn.disabled = true; btn.textContent = 'Registering…';
    const data = await apiPost('register_doctor.php', { full_name, email, phone, license_no, specialization });
    btn.disabled = false; btn.textContent = 'Register doctor';

    if (!data.ok) { showError(errEl, data.error, data._raw); return; }
    document.getElementById('ha-doc-name').value = '';
    document.getElementById('ha-doc-email').value = '';
    if (document.getElementById('ha-doc-phone')) document.getElementById('ha-doc-phone').value = '';
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

  // ── Apply policies ────────────────────────────────────────────
  document.getElementById('btn-apply-policies')?.addEventListener('click', () => {
    const breakglass = document.getElementById('policy-breakglass')?.checked;
    const consent    = document.getElementById('policy-consent')?.checked;
    const mfa        = document.getElementById('policy-mfa')?.checked;
    const rbac       = document.getElementById('policy-rbac')?.checked;
    const errEl      = document.getElementById('policy-error');
    const successEl  = document.getElementById('policy-success');
    if (errEl) errEl.hidden = true;
    if (successEl) successEl.hidden = true;

    // RBAC must always be on — it is foundational to the role system
    if (!rbac) {
      const rbacChk = document.getElementById('policy-rbac');
      if (rbacChk) rbacChk.checked = true;
      if (errEl) { errEl.textContent = 'Role-based access control cannot be disabled — it is required for the system to function.'; errEl.hidden = false; }
      return;
    }

    // Policies are stored in sessionStorage so they persist for this admin session
    const policies = { breakglass: !!breakglass, consent: !!consent, mfa: !!mfa, rbac: true };
    sessionStorage.setItem('sa_policies', JSON.stringify(policies));

    if (successEl) {
      successEl.textContent = '✓ Policies saved for this session.';
      successEl.hidden = false;
      setTimeout(() => { successEl.hidden = true; }, 3000);
    }
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

  // ── Search-type toggle (Health ID / National ID / Phone) ─────────────
  // Config for each mode: label, placeholder, hint text, input type
  const EM_SEARCH_CFG = {
    health_id:   {
      label:       'Patient Health ID',
      placeholder: 'KE-HID-XXXXX',
      hint:        'Enter the patient\'s HealthShare ID from their card or wristband.',
      inputmode:   'text',
    },
    national_id: {
      label:       'National ID',
      placeholder: 'Enter National ID',
      hint:        'Enter the patient\'s government-issued National ID number.',
      inputmode:   'numeric',
    },
    phone: {
      label:       'Phone Number',
      placeholder: '07XXXXXXXX',
      hint:        'Enter the patient\'s registered phone number.',
      inputmode:   'tel',
    },
  };

  // Helper: read whichever em-search-btn currently has .active
  function emActiveSearchType() {
    const active = document.querySelector('.em-search-btn.active');
    return active ? active.dataset.searchType : 'health_id';
  }

  // Apply config for the given search type to the form fields
  function applyEmSearchCfg(type) {
    const cfg = EM_SEARCH_CFG[type] || EM_SEARCH_CFG.health_id;
    const inp  = document.getElementById('em-patient-id');
    const lbl  = document.getElementById('em-search-label');
    const hint = document.getElementById('em-search-hint');
    if (inp)  { inp.placeholder  = cfg.placeholder; inp.inputMode = cfg.inputmode; inp.value = ''; }
    if (lbl)  lbl.textContent  = cfg.label;
    if (hint) hint.textContent = cfg.hint;
    clearError(document.getElementById('em-error'));
  }

  // Wire toggle buttons — active class + live form update
  document.querySelectorAll('.em-search-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.em-search-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyEmSearchCfg(btn.dataset.searchType);
    });
  });

  // ── Break-glass trigger ───────────────────────────────────────────────
  document.getElementById('btn-breakglass')?.addEventListener('click', async () => {
    // Read search type directly from the DOM at click time — no shared variable
    const searchType = emActiveSearchType();
    const rawInput   = (document.getElementById('em-patient-id')?.value ?? '').trim();
    const reason     = document.getElementById('em-reason')?.value ?? '';
    const errEl      = document.getElementById('em-error');
    clearError(errEl);

    const cfg = EM_SEARCH_CFG[searchType] || EM_SEARCH_CFG.health_id;
    if (!rawInput) {
      showError(errEl, `Please enter the patient's ${cfg.label.toLowerCase()}.`);
      return;
    }

    const btn = document.getElementById('btn-breakglass');
    btn.disabled = true; btn.textContent = 'Accessing…';

    // Build the correct API URL for the selected search mode
    let url;
    if (searchType === 'health_id') {
      url = `lookup_patient.php?id=${encodeURIComponent(rawInput.toUpperCase())}`;
    } else {
      url = `lookup_patient.php?search=${encodeURIComponent(rawInput)}&type=${encodeURIComponent(searchType)}`;
    }

    const data = await apiGet(url);
    btn.disabled = false; btn.textContent = 'Trigger break-glass access';

    if (!data.ok) { showError(errEl, data.error || 'Patient not found.', data._raw); return; }

    const p = data.patient;

    // Log to audit + blockchain (non-fatal)
    apiPost('breakglass_log.php', { patient_id: p.user_id, reason });

    document.getElementById('emergency-locked-overlay')?.classList.add('hidden');
    document.getElementById('emergency-record-grid')?.classList.add('unlocked');
    setText('em-rec-name',      p.full_name);
    setText('em-rec-hid',       p.user_id);
    setText('em-rec-phone',     p.phone || '—');
    setText('em-rec-blood',     p.blood_type || 'Not recorded');
    setText('em-rec-allergies', p.allergies  || 'None recorded');

    const matchLabel = { health_id: 'Health ID', national_id: 'national ID', phone: 'phone number' }[data.matched_by] || data.matched_by;
    const now = new Date().toLocaleString('en-KE', { dateStyle:'medium', timeStyle:'short' });
    setText('breakglass-status-text', `Matched by ${matchLabel} · Access logged at ${now} — audit trail created`);
    document.getElementById('breakglass-status').hidden = false;

    _accessLog.unshift({
      time: new Date().toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' }),
      patient: p.user_id,
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