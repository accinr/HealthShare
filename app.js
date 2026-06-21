// ============================================================
// HealthShare — app.js
// ============================================================

// ── Fetch helpers ─────────────────────────────────────────────

async function apiPost(url, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { ok: false, error: 'Server error — check debug info below.', _raw: text }; }
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
    const res = await fetch(url, { signal: controller.signal });
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
      if (typeof loadBlockchainStatus === 'function') loadBlockchainStatus();
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
    document.getElementById('login-hint-text').innerHTML = `<strong>${hint.title}</strong>${hint.body}`;
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
  (async () => {
    const user = await guardSession('patient');
    if (!user) return;
    setText('patient-welcome-name', 'Welcome, ' + user.full_name);
    setText('patient-health-id', user.user_id);
    setText('stat-records', '0');
    setText('stat-prescriptions', '0');
    setText('patient-consent-count', '0');
    renderConsentList([]);
  })();

  function renderConsentList(consents) {
    const list  = document.getElementById('consent-list');
    const empty = document.getElementById('consent-empty');
    if (!list) return;
    list.innerHTML = '';
    empty.hidden = consents.length > 0;
    setText('patient-consent-count', consents.length);
    consents.forEach(c => {
      const row = document.createElement('div');
      row.className = 'consent-row';
      row.innerHTML = `
        <div class="consent-info">
          <p class="consent-name">${c.doctor_name}</p>
          <p class="consent-meta">${c.facility} · Granted ${formatDate(c.granted_at)}</p>
        </div>
        <button class="btn-revoke">Revoke</button>`;
      list.appendChild(row);
    });
  }

  document.getElementById('btn-simulate-request')?.addEventListener('click', () => {
    const otp = `${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)}`;
    document.getElementById('patient-otp-flag').hidden = false;
    document.getElementById('pending-otp-card').hidden = false;
    document.getElementById('patient-otp-chip').textContent = otp;
    document.getElementById('btn-simulate-request').hidden = true;
    document.getElementById('pending-doctor-name').textContent = 'Dr. [Requesting doctor]';
  });

  document.getElementById('btn-confirm-otp-issued')?.addEventListener('click', () => {
    document.getElementById('pending-otp-card').hidden = true;
    document.getElementById('patient-otp-flag').hidden = true;
    document.getElementById('btn-simulate-request').hidden = false;
  });

  document.getElementById('btn-deny-otp')?.addEventListener('click', () => {
    document.getElementById('pending-otp-card').hidden = true;
    document.getElementById('patient-otp-flag').hidden = true;
    document.getElementById('btn-simulate-request').hidden = false;
  });
}

// ─────────────────────────────────────────────────────────────
//  DOCTOR PAGE
// ─────────────────────────────────────────────────────────────

if (document.getElementById('screen-doctor')) {
  (async () => {
    const user = await guardSession('doctor');
    if (!user) return;
    setText('doctor-name', 'Dr. ' + user.full_name);
    setText('doctor-staff-id', user.user_id);
    setText('doctor-facility', user.facility_name || '—');
    setText('stat-patients-seen', '0');
    setText('stat-records-today', '0');
    setText('stat-pending-reviews', '0');
  })();

  let _otp = null;

  document.getElementById('btn-request-access')?.addEventListener('click', async () => {
    const patientId = document.getElementById('doctor-search-id')?.value.trim().toUpperCase();
    if (!patientId) { alert('Please enter a patient Health ID first.'); return; }

    const data = await apiPost('request_access.php', { patient_id: patientId });
    if (!data.ok) {
      const errEl = document.getElementById('otp-error');
      errEl.textContent = data.error;
      errEl.hidden = false;
      return;
    }

    _otp = data.otp;
    document.getElementById('otp-request-card').hidden = false;
    const hint = document.getElementById('doctor-demo-otp-hint');
    if (hint) hint.textContent = `Demo — patient OTP: ${_otp}`;
    document.getElementById('btn-request-access').disabled = true;
  });

  document.getElementById('btn-verify-otp')?.addEventListener('click', async () => {
    const entered   = document.getElementById('doctor-otp-input').value.trim();
    const patientId = document.getElementById('doctor-search-id')?.value.trim().toUpperCase();
    const errEl     = document.getElementById('otp-error');

    const data = await apiPost('verify_otp.php', { patient_id: patientId, otp: entered });
    if (!data.ok) { errEl.hidden = false; errEl.textContent = data.error; return; }

    errEl.hidden = true;
    document.getElementById('otp-request-card').hidden = true;
    document.getElementById('access-status-locked').hidden = true;
    document.getElementById('access-status-granted').hidden = false;
    document.getElementById('record-locked-overlay').classList.add('hidden');
    ['btn-view-records','btn-submit-diagnosis','btn-update-records',
     'record-type','clinical-notes','btn-submit-record'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });
  });

  // ── Submit clinical record ──
  document.getElementById('btn-submit-record')?.addEventListener('click', async () => {
    const patientId  = document.getElementById('doctor-search-id')?.value.trim().toUpperCase();
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

    alert(`Record submitted ✓\nIPFS CID: ${data.cid}\nBlockchain: ${data.blockchain ? 'Anchored ✓' : 'Pending'}`);
    document.getElementById('clinical-notes').value = '';
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
    const license_no     = document.getElementById('ha-doc-license').value.trim();
    const specialization = document.getElementById('ha-doc-spec').value;
    const errEl          = document.getElementById('doc-reg-error');
    clearError(errEl);
    if (!full_name || !license_no) { showError(errEl, 'Full name and license number are required.'); return; }

    const btn = document.getElementById('btn-register-doctor');
    btn.disabled = true; btn.textContent = 'Registering…';
    const data = await apiPost('register_doctor.php', { full_name, license_no, specialization });
    btn.disabled = false; btn.textContent = 'Register doctor';

    if (!data.ok) { showError(errEl, data.error, data._raw); return; }
    document.getElementById('ha-doc-name').value = '';
    document.getElementById('ha-doc-license').value = '';
    showCredModal('Doctor account created', data.full_name, data.staff_id, data.temp_password);
  });

  document.getElementById('btn-register-emergency')?.addEventListener('click', async () => {
    const full_name = document.getElementById('ha-em-name').value.trim();
    const em_role   = document.getElementById('ha-em-role').value;
    const errEl     = document.getElementById('em-reg-error');
    clearError(errEl);
    if (!full_name) { showError(errEl, 'Full name is required.'); return; }

    const btn = document.getElementById('btn-register-emergency');
    btn.disabled = true; btn.textContent = 'Registering…';
    const data = await apiPost('register_emergency.php', { full_name, em_role });
    btn.disabled = false; btn.textContent = 'Register emergency personnel';

    if (!data.ok) { showError(errEl, data.error, data._raw); return; }
    document.getElementById('ha-em-name').value = '';
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
    const facility_id = document.getElementById('sa-adm-facility').value;
    const errEl       = document.getElementById('adm-reg-error');
    clearError(errEl); errEl.style.color = '';
    if (!full_name || !facility_id) { showError(errEl, 'Full name and facility are required.'); return; }

    const btn = document.getElementById('btn-register-hospital-admin');
    btn.disabled = true; btn.textContent = 'Creating account…';
    const data = await apiPost('register_hospital_admin.php', { full_name, facility_id });
    btn.disabled = false; btn.textContent = 'Create admin account';

    if (!data.ok) { showError(errEl, data.error, data._raw); return; }
    document.getElementById('sa-adm-name').value = '';
    document.getElementById('sa-adm-facility').value = '';
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
    const data = await apiGet(`lookup_patient.php?id=${encodeURIComponent(patientId)}`);
    btn.disabled = false; btn.textContent = 'Trigger break-glass access';

    if (!data.ok) { showError(errEl, data.error || 'Patient not found.', data._raw); return; }

    // Log on blockchain
    apiPost('breakglass_log.php', { patient_id: patientId, reason });

    const p = data.patient;
    document.getElementById('emergency-locked-overlay').classList.add('hidden');
    document.getElementById('emergency-record-grid').classList.add('unlocked');
    setText('em-rec-name',      p.full_name);
    setText('em-rec-hid',       p.user_id);
    setText('em-rec-phone',     p.phone || '—');
    setText('em-rec-blood',     p.blood_type || 'Not recorded');
    setText('em-rec-allergies', p.allergies  || 'None recorded');

    const now = new Date().toLocaleString('en-KE', { dateStyle:'medium', timeStyle:'short' });
    document.getElementById('breakglass-status-text').textContent = `Access logged at ${now} — patient notified`;
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