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

  panel.innerHTML = `
    <div class="panel">
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

    <div class="panel" style="margin-top:16px;">
      <p class="panel-title">Recent blockchain transactions</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Tx Hash</th>
          </tr>
        </thead>
        <tbody id="blockchain-tx-tbody">
          <tr><td colspan="4" class="empty-cell">Loading transactions…</td></tr>
        </tbody>
      </table>
      <div class="chain-status" style="margin-top:12px;">
        <i class="dot dot-sage"></i>
        All records permanently anchored on Hyperledger Fabric
      </div>
    </div>`;

  loadBlockchainTransactions();
}

async function loadBlockchainTransactions() {
  const tbody = document.getElementById('blockchain-tx-tbody');
  if (!tbody) return;

  const data = await apiGet('get_audit_logs.php');

  if (!data.ok || !data.logs?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No transactions recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data.logs.map(l => `
    <tr>
      <td>${l.time}</td>
      <td class="mono">${l.actor_id}</td>
      <td>${l.action.replace(/_/g, ' ')}</td>
      <td class="mono">${l.log_hash ?? '—'}</td>
    </tr>`).join('');
}
