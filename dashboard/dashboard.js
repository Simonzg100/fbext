// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const viewName = item.dataset.view;
    switchView(viewName);
  });
});

function switchView(viewName) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

  // Update view
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`${viewName}View`).classList.add('active');

  // Update title
  const titles = {
    conversations: 'Conversations',
    tenants: 'Tenant Information',
    settings: 'Settings'
  };
  document.getElementById('pageTitle').textContent = titles[viewName];
}

// Load data
async function loadData() {
  const data = await chrome.storage.local.get(['detailedTenants', 'tenants']);

  displayTenantsTable(data.detailedTenants || []);
  displayTenants(data.tenants || []);
  updateStats(data.detailedTenants || []);
}

function updateStats(detailedTenants) {
  const totalMessages = detailedTenants.reduce((sum, t) => sum + t.messageCount, 0);
  const tenantsWithContact = detailedTenants.filter(t => t.phone || t.email).length;

  document.getElementById('totalConversations').textContent = detailedTenants.length;
  document.getElementById('totalTenants').textContent = tenantsWithContact;
  document.getElementById('totalMessages').textContent = totalMessages;
}

function displayTenantsTable(detailedTenants) {
  const tbody = document.getElementById('tenantsTableBody');

  if (detailedTenants.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:40px;color:#999;">
          No tenant inquiries yet. Start Auto Mode to begin tracking.
        </td>
      </tr>
    `;
    return;
  }

  // Sort by last reply time (most recent first)
  detailedTenants.sort((a, b) => b.lastReplyTime - a.lastReplyTime);

  tbody.innerHTML = detailedTenants.map(tenant => {
    const lastReply = new Date(tenant.lastReplyTime).toLocaleString();
    return `
      <tr>
        <td><strong>${escapeHtml(tenant.tenantName)}</strong></td>
        <td>${escapeHtml(tenant.property)}</td>
        <td>${tenant.phone || '-'}</td>
        <td>${tenant.email || '-'}</td>
        <td>${tenant.moveInDate || '-'}</td>
        <td>${lastReply}</td>
        <td><span class="status-badge status-active">${tenant.status}</span></td>
      </tr>
    `;
  }).join('');
}

function displayTenants(tenants) {
  const container = document.getElementById('tenantsList');

  if (tenants.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-text">No tenant information collected yet</div>
      </div>
    `;
    return;
  }

  container.innerHTML = tenants.map(tenant => {
    const date = new Date(tenant.timestamp).toLocaleString();
    return `
      <div class="tenant-card">
        ${tenant.phone ? `<div><strong>Phone:</strong> ${tenant.phone}</div>` : ''}
        ${tenant.email ? `<div><strong>Email:</strong> ${tenant.email}</div>` : ''}
        <div style="color:#666;font-size:12px;margin-top:5px;">Collected: ${date}</div>
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Refresh button
document.getElementById('refreshData').addEventListener('click', () => {
  loadData();
});

// Export CSV
document.getElementById('exportData').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['tenants', 'conversationMemory']);

  if (!data.tenants || data.tenants.length === 0) {
    alert('No data to export');
    return;
  }

  const csv = generateCSV(data.tenants);
  downloadCSV(csv, 'rental-assistant-data.csv');
});

function generateCSV(tenants) {
  const headers = ['Time', 'Phone', 'Email'];
  const rows = tenants.map(t => [
    new Date(t.timestamp).toLocaleString(),
    t.phone || '',
    t.email || ''
  ]);

  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Clear all data
document.getElementById('clearAllData').addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
    await chrome.storage.local.clear();
    alert('All data cleared!');
    loadData();
  }
});

// Settings
document.getElementById('saveTemplate').addEventListener('click', async () => {
  const template = document.getElementById('replyTemplate').value;
  await chrome.storage.local.set({ replyTemplate: template });
  alert('Template saved!');
});

// Load settings
async function loadSettings() {
  const data = await chrome.storage.local.get(['replyTemplate', 'autoMonitor', 'checkInterval']);

  if (data.replyTemplate) {
    document.getElementById('replyTemplate').value = data.replyTemplate;
  }

  document.getElementById('autoMonitor').checked = data.autoMonitor || false;
  document.getElementById('checkInterval').value = data.checkInterval || 10;
}

// Save settings on change
document.getElementById('autoMonitor').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ autoMonitor: e.target.checked });
});

document.getElementById('checkInterval').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ checkInterval: parseInt(e.target.value) });
});

// Initialize
loadData();
loadSettings();

// Auto-refresh every 30 seconds
setInterval(loadData, 30000);
