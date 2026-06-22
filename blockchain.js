// ============================================================
// blockchain.js — blockchain status panel for system admin
// Loaded only on system-admin.html
// ============================================================

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
      <div class="record-grid" style="margin-top:16px;">
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

      <div class="record-grid" style="margin-top:16px;">
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
// Dashboard-only visualization. Reuses real facility names (get_facilities.php,
// already used elsewhere on this page) and real audit log entries — it does
// not change Fabric topology, peers, or chaincode. Per-transaction hospital
// assignment is illustrative (alternating by block id) since true per-row
// facility attribution would require a backend join outside this objective's
// file scope; this is clearly a simulation, not a claim about real routing.
async function loadInteropSimulation(auditData) {
  const panel = document.getElementById('sa-interop-panel');
  if (!panel) return;

  const facData = await apiGet('get_facilities.php');
  const facilities = facData.ok ? (facData.facilities || []) : [];
  const hospA = facilities[0]?.name || 'Hospital A (no facility registered yet)';
  const hospB = facilities[1]?.name || 'Hospital B (register a 2nd facility)';

  const statusData = await apiGet('get_blockchain_status.php');
  const synced = !!statusData.connected;

  const logs = (auditData.logs || []).slice(0, 6);
  const rows = logs.map((l, i) => {
    const origin = i % 2 === 0 ? hospA : hospB;
    const dest   = i % 2 === 0 ? hospB : hospA;
    return `
      <div class="event-row">
        <i class="dot ${synced ? 'dot-sage' : 'dot-amber'}"></i>
        <div>
          <p class="event-title">${origin} → ${dest}: ${l.action.replace(/_/g,' ')}</p>
          <p class="event-meta">Origin tx ${l.actor_id} · Block #${l.block_id} · ${synced ? 'Synchronized' : 'Sync pending (sidecar offline)'}</p>
        </div>
      </div>`;
  }).join('') || '<p class="empty-cell">No transactions to simulate yet.</p>';

  panel.innerHTML = `
    <p class="panel-title">Hospital interoperability simulation</p>
    <div class="record-grid" style="margin-bottom:12px;">
      <div><p class="record-label">Hospital A node</p><p class="record-value">${hospA}</p></div>
      <div><p class="record-label">Hospital B node</p><p class="record-value">${hospB}</p></div>
      <div><p class="record-label">Sync status</p><p class="record-value">${synced ? 'Synced' : 'Pending'}</p></div>
    </div>
    <p class="record-label" style="margin-bottom:6px;">Simulated record sharing</p>
    ${rows}`;
}
