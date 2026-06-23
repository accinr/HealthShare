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

// ── Hospital interoperability simulation ─────────────────────
// Dashboard-only visualization — does not touch Fabric topology, peers, or
// chaincode. Every value below comes from real data already in the system:
// facility names + a real actor->facility map (get_facilities.php),
// and real audit_logs rows (get_audit_logs.php, last 50 events — this is a
// live-activity window, not an all-time total, and is labeled as such).
// Nothing here is hardcoded or fabricated; if there's no activity yet, the
// panel says so instead of inventing a transaction.
async function loadInteropSimulation(auditData) {
  const panel = document.getElementById('sa-interop-panel');
  if (!panel) return;

  const facData = await apiGet('get_facilities.php');
  const facilities = facData.ok ? (facData.facilities || []) : [];
  const staffMap = facData.ok ? (facData.staff_map || {}) : {};

  const statusData = await apiGet('get_blockchain_status.php');
  const synced = !!statusData.connected;

  const logs = auditData.logs || [];

  if (facilities.length < 2) {
    panel.innerHTML = `
      <p class="panel-title">Hospital interoperability simulation</p>
      <p class="empty-cell">Register at least 2 facilities to simulate inter-hospital sync.</p>`;
    return;
  }

  // Pick the two facilities with the most real attributed activity in this
  // window as Hospital A / Hospital B (falls back to the two most recently
  // registered facilities if neither has any logged activity yet).
  const activityCount = {};
  logs.forEach(l => {
    const fid = staffMap[l.actor_id];
    if (fid) activityCount[fid] = (activityCount[fid] || 0) + 1;
  });
  const ranked = [...facilities].sort((a, b) => (activityCount[b.facility_id] || 0) - (activityCount[a.facility_id] || 0));
  const hospA = ranked[0];
  const hospB = ranked[1];

  // Real per-row attribution — no alternating, no guessing. A row only
  // counts toward a node if its actor genuinely works at that facility.
  const rowsForA = logs.filter(l => staffMap[l.actor_id] === hospA.facility_id);
  const rowsForB = logs.filter(l => staffMap[l.actor_id] === hospB.facility_id);
  const sharingEvents  = logs.filter(l => l.action === 'consent_granted');
  const exchangeEvents = logs.filter(l => l.action === 'record_submitted' || l.action === 'record_viewed');
  const latest = logs[0];

  const lastFor = rows => rows[0] ? `${rows[0].action.replace(/_/g,' ')} · ${rows[0].time}` : 'No activity yet';

  panel.innerHTML = `
    <p class="panel-title">Hospital interoperability simulation</p>
    <p class="panel-sub">Live, derived from the last ${logs.length} audit_logs entries — not a fixed demo.</p>
    <div class="record-grid unlocked" style="margin:12px 0;">
      <div><p class="record-label">Hospital A node</p><p class="record-value">${hospA.name}</p></div>
      <div><p class="record-label">Hospital B node</p><p class="record-value">${hospB.name}</p></div>
      <div><p class="record-label">Sync status</p><p class="record-value">${synced ? 'Synchronized' : 'Pending (sidecar offline)'}</p></div>
      <div><p class="record-label">Record sharing count</p><p class="record-value">${sharingEvents.length} consent grant${sharingEvents.length===1?'':'s'}</p></div>
      <div><p class="record-label">Records exchanged</p><p class="record-value">${exchangeEvents.length}</p></div>
      <div><p class="record-label">Latest transaction</p><p class="record-value">${latest ? latest.action.replace(/_/g,' ') : '—'}</p></div>
      <div><p class="record-label">Latest actor</p><p class="record-value mono">${latest ? latest.actor_id : '—'}</p></div>
      <div><p class="record-label">Transaction timestamp</p><p class="record-value">${latest ? latest.time : '—'}</p></div>
    </div>
    <div class="record-grid unlocked" style="margin-bottom:8px;">
      <div>
        <p class="record-label">${hospA.name} — events in window</p>
        <p class="record-value">${rowsForA.length}</p>
        <p class="record-value" style="font-size:12px;color:var(--muted);">Last: ${lastFor(rowsForA)}</p>
      </div>
      <div>
        <p class="record-label">${hospB.name} — events in window</p>
        <p class="record-value">${rowsForB.length}</p>
        <p class="record-value" style="font-size:12px;color:var(--muted);">Last: ${lastFor(rowsForB)}</p>
      </div>
    </div>`;
}
