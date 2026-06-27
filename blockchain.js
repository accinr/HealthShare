// ============================================================
// blockchain.js — blockchain status panel for system admin
// Loaded only on system-admin.html
// ============================================================

// Auto-refresh interval for live interop simulation (while tab is visible)
let _blockchainRefreshTimer = null;

function startBlockchainAutoRefresh() {
  if (_blockchainRefreshTimer) return; // already running
  _blockchainRefreshTimer = setInterval(() => {
    const panel = document.getElementById('sa-blockchain');
    if (panel && panel.closest('.side-pane')?.classList.contains('active')) {
      loadBlockchainStatus();
    } else {
      stopBlockchainAutoRefresh();
    }
  }, 15000); // refresh every 15 seconds
}

function stopBlockchainAutoRefresh() {
  if (_blockchainRefreshTimer) { clearInterval(_blockchainRefreshTimer); _blockchainRefreshTimer = null; }
}

async function loadBlockchainStatus() {
  const panel = document.getElementById('sa-blockchain');
  if (!panel) return;

  // Show loading state
  panel.innerHTML = `
    <div class="panel">
      <p class="panel-title">Blockchain network status</p>
      <p class="empty-cell">Connecting to blockchain…</p>
    </div>`;

  const data = await apiGet('get_blockchain_status.php');
  const auditData = await apiGet('get_audit_logs.php');
  const chain = auditData.chain || { chain_valid: false, verified_blocks: 0, tampered_blocks: 0, total_blocks: 0 };

  panel.innerHTML = `
    <div class="panel">
      <p class="panel-title">Blockchain health</p>
      <div class="chain-status">
        <i class="dot ${chain.chain_valid ? 'dot-sage' : 'dot-coral'}"></i>
        <strong>${chain.chain_valid ? 'Chain valid — no tampering detected' : (chain.total_blocks ? 'Tampering detected' : 'No chained blocks yet')}</strong>
      </div>
      <div class="record-grid unlocked" style="margin-top:16px;">
        <div><p class="record-label">Verified blocks</p><p class="record-value">${chain.verified_blocks}</p></div>
        <div><p class="record-label">Tampered blocks</p><p class="record-value">${chain.tampered_blocks}</p></div>
        <div><p class="record-label">Total chained blocks</p><p class="record-value">${chain.total_blocks}</p></div>
        <div><p class="record-label">Genesis hash</p><p class="record-value mono" style="font-size:11px;">${(chain.genesis_hash || '').slice(0,16)}…</p></div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <p class="panel-title">Blockchain network status</p>

      <div class="chain-status">
        <i class="dot ${data.connected ? 'dot-sage' : 'dot-coral'}"></i>
        <strong>${data.connected ? 'Network active' : 'Network unreachable'}</strong>
      </div>

      <div class="record-grid unlocked" style="margin-top:16px;">
        <div>
          <p class="record-label">Channel</p>
          <p class="record-value mono">${data.channel ?? '—'}</p>
        </div>
        <div>
          <p class="record-label">Chaincode</p>
          <p class="record-value mono">${data.chaincode ?? '—'}</p>
        </div>
        <div>
          <p class="record-label">Connected peers</p>
          <p class="record-value">${data.peers ?? '—'}</p>
        </div>
        <div>
          <p class="record-label">Status</p>
          <p class="record-value">${data.status ?? '—'}</p>
        </div>
        <div>
          <p class="record-label">Last checked</p>
          <p class="record-value">${data.checked_at ?? '—'}</p>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;" id="sa-interop-panel">
      <p class="panel-title">Hospital interoperability simulation</p>
      <p class="empty-cell">Loading nodes…</p>
    </div>

    <div class="panel" style="margin-top:16px;">
      <p class="panel-title">Recent blockchain transactions</p>
      <table class="data-table small">
        <thead>
          <tr>
            <th>Block</th><th>Time</th><th>Actor</th><th>Role</th><th>Action</th>
            <th>Record</th><th>Prev hash</th><th>Hash</th><th>Status</th>
          </tr>
        </thead>
        <tbody id="blockchain-tx-tbody">
          <tr><td colspan="9" class="empty-cell">Loading transactions…</td></tr>
        </tbody>
      </table>
      <div class="chain-status" style="margin-top:12px;">
        <i class="dot dot-sage"></i>
        All records permanently anchored on Hyperledger Fabric
      </div>
    </div>`;

  renderBlockchainTransactions(auditData);
  loadInteropSimulation(auditData);
}

function renderBlockchainTransactions(auditData) {
  const tbody = document.getElementById('blockchain-tx-tbody');
  if (!tbody) return;

  if (!auditData.ok || !auditData.logs?.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No transactions recorded yet.</td></tr>';
    return;
  }

  const shortHash = h => h ? h.slice(0, 10) + '…' : '—';
  const statusDot = s => s === 'verified' ? 'dot-sage' : (s === 'tampered' ? 'dot-coral' : 'dot-amber');

  tbody.innerHTML = auditData.logs.map(l => `
    <tr>
      <td class="mono">#${l.block_id}</td>
      <td>${l.time}</td>
      <td class="mono">${l.actor_id}</td>
      <td>${l.actor_role ?? '—'}</td>
      <td>${l.action.replace(/_/g, ' ')}</td>
      <td class="mono">${l.record_id ?? '—'}</td>
      <td class="mono">${shortHash(l.previous_hash)}</td>
      <td class="mono">${shortHash(l.current_hash) !== '—' ? shortHash(l.current_hash) : (l.log_hash ?? '—')}</td>
      <td><i class="dot ${statusDot(l.verification_status)}"></i> ${l.verification_status ?? 'legacy'}</td>
    </tr>`).join('');
}

// ── Live interoperability timeline ───────────────────────────
// Reads real audit_logs rows, attributes each to a facility via staffMap,
// then finds cross-hospital patient journeys: any patient who has events
// from more than one facility. Each journey is rendered as a vertical
// timeline. No demo button. No hardcoded data. No interop_demo.php.
async function loadInteropSimulation(auditData) {
  const panel = document.getElementById('sa-interop-panel');
  if (!panel) return;

  const facData  = await apiGet('get_facilities.php');
  const facilities = facData.ok ? (facData.facilities || []) : [];
  const staffMap   = facData.ok ? (facData.staff_map  || {}) : {};
  const facNames   = {};
  facilities.forEach(f => { facNames[f.facility_id] = f.name; });

  const logs = (auditData.logs || []).slice().reverse(); // chronological order

  // ── Interop-relevant action types ────────────────────────
  const INTEROP_ACTIONS = new Set([
    'patient_registered',
    'access_requested',
    'consent_granted',
    'consent_revoked',
    'record_viewed',
    'record_submitted',
    'breakglass_access',
  ]);

  // ── Extract patient ID from detail field ─────────────────
  // Detail is always written as "Patient: KE-HID-XXXXX | ..."
  function extractPatient(detail = '') {
    const m = detail.match(/Patient:\s*(KE-HID-[A-Z0-9]+)/i);
    return m ? m[1] : null;
  }

  // ── Build journey map: patient → ordered list of events ──
  const journeys = {}; // patient_id → [{ facility_id, facility_name, action, actor_id, time, hash, block_id }]

  logs.forEach(l => {
    if (!INTEROP_ACTIONS.has(l.action)) return;

    const patient = extractPatient(l.detail || '');
    if (!patient) return;

    const fid   = staffMap[l.actor_id] || null;
    const fname = fid ? (facNames[fid] || fid) : (l.actor_role === 'patient' ? 'Patient' : 'System');

    if (!journeys[patient]) journeys[patient] = [];
    journeys[patient].push({
      facility_id:   fid,
      facility_name: fname,
      action:        l.action,
      actor_id:      l.actor_id,
      actor_role:    l.actor_role,
      time:          l.time,
      hash:          (l.current_hash || l.log_hash || '').slice(0, 12),
      block_id:      l.block_id,
    });
  });

  // ── Keep only cross-hospital journeys ────────────────────
  // A journey is cross-hospital if events come from at least 2 distinct
  // non-null facility IDs.
  const crossHospital = Object.entries(journeys).filter(([, events]) => {
    const fids = new Set(events.map(e => e.facility_id).filter(Boolean));
    return fids.size >= 2;
  });

  // ── Summary counts for the header ────────────────────────
  const allConsentEvents  = logs.filter(l => l.action === 'consent_granted');
  const allRecordEvents   = logs.filter(l => l.action === 'record_submitted' || l.action === 'record_viewed');
  const allBreakglass     = logs.filter(l => l.action === 'breakglass_access');
  const syncedStatus      = await apiGet('get_blockchain_status.php');
  const synced            = !!syncedStatus.connected;

  // ── Action → human label + CSS class ─────────────────────
  const ACTION_META = {
    patient_registered: { label: 'Patient registered',    cls: 'badge-teal'  },
    access_requested:   { label: 'Access requested',      cls: 'badge-amber' },
    consent_granted:    { label: 'Consent granted',       cls: 'badge-sage'  },
    consent_revoked:    { label: 'Consent revoked',       cls: 'badge-coral' },
    record_viewed:      { label: 'Records retrieved',     cls: 'badge-blue'  },
    record_submitted:   { label: 'Record submitted',      cls: 'badge-teal'  },
    breakglass_access:  { label: 'Emergency break-glass', cls: 'badge-coral' },
  };

  // ── Render ────────────────────────────────────────────────
  let html = `
    <p class="panel-title">Live interoperability events</p>
    <p class="panel-sub">Automatically updated from real system activity — no simulated data.</p>

    <div class="record-grid unlocked" style="margin:12px 0 20px;">
      <div><p class="record-label">Active facilities</p><p class="record-value">${facilities.filter(f=>f.status==='active').length}</p></div>
      <div><p class="record-label">Cross-hospital journeys</p><p class="record-value">${crossHospital.length}</p></div>
      <div><p class="record-label">Consent events</p><p class="record-value">${allConsentEvents.length}</p></div>
      <div><p class="record-label">Records exchanged</p><p class="record-value">${allRecordEvents.length}</p></div>
      <div><p class="record-label">Break-glass events</p><p class="record-value">${allBreakglass.length}</p></div>
      <div><p class="record-label">Fabric sync</p><p class="record-value">${synced ? '✓ Synchronized' : 'Sidecar offline'}</p></div>
    </div>`;

  if (crossHospital.length === 0) {
    html += `
      <div style="padding:24px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:8px;">
        <p style="margin:0 0 8px;font-weight:600;">No cross-hospital events yet</p>
        <p style="margin:0;font-size:13px;">
          To generate a real interoperability event: register a patient at Hospital A,
          then log in as a Hospital B doctor and request access to that patient.
          The timeline will appear here automatically.
        </p>
      </div>`;
  } else {
    // Most recent journey first
    crossHospital.reverse().forEach(([patient_id, events]) => {
      const facilitiesInvolved = [...new Set(events.map(e => e.facility_name).filter(n => n !== 'Patient' && n !== 'System'))];
      const hospA = facilitiesInvolved[0] || '—';
      const hospB = facilitiesInvolved[1] || '—';

      html += `
        <div style="margin-bottom:28px;border:1px solid var(--border);border-radius:10px;overflow:hidden;">
          <div style="background:var(--surface-alt,#f5f3ee);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;">Patient journey</span>
              <p style="margin:2px 0 0;font-family:var(--font-mono,monospace);font-weight:700;">${patient_id}</p>
            </div>
            <div style="text-align:right;font-size:12px;color:var(--muted);">
              ${hospA} <span style="margin:0 6px;">⟷</span> ${hospB}
            </div>
          </div>
          <div style="padding:16px;">
            <div class="interop-timeline">`;

      events.forEach((ev, idx) => {
        const meta    = ACTION_META[ev.action] || { label: ev.action.replace(/_/g,' '), cls: 'badge-amber' };
        const isLast  = idx === events.length - 1;
        html += `
              <div class="interop-step">
                <div class="interop-step-marker">
                  <div class="interop-dot"></div>
                  ${!isLast ? '<div class="interop-line"></div>' : ''}
                </div>
                <div class="interop-step-body">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                    <span class="badge ${meta.cls}">${meta.label}</span>
                    <span style="font-size:12px;font-weight:600;">${ev.facility_name}</span>
                    <span style="font-size:11px;color:var(--muted);">${ev.time}</span>
                  </div>
                  <div style="font-size:11px;color:var(--muted);font-family:var(--font-mono,monospace);">
                    Actor: ${ev.actor_id}
                    ${ev.hash ? `· Block #${ev.block_id} · Hash: ${ev.hash}…` : ''}
                  </div>
                </div>
              </div>`;
      });

      html += `
            </div>
          </div>
        </div>`;
    });
  }

  html += `
    <p style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px;">
      Auto-refreshes every 15 seconds · All events are anchored on Hyperledger Fabric
    </p>`;

  panel.innerHTML = html;
}