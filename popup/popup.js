document.getElementById('openDashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
});

async function loadConfig() {
  const config = await chrome.storage.local.get(['tenants', 'conversationMemory']);
  displayConversations(config.conversationMemory || {});
  displayTenants(config.tenants || []);
}

function displayConversations(conversationMemory) {
  const list = document.getElementById('conversationList');
  const count = document.getElementById('conversationCount');

  const conversations = Object.entries(conversationMemory);
  count.innerText = conversations.length;

  if (conversations.length === 0) {
    list.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">No conversations processed yet</div>';
    return;
  }

  list.innerHTML = conversations.map(([name, messageCount]) => {
    return `
      <div class="conversation-item">
        <div><strong>${name}</strong></div>
        <div style="color:#666;font-size:11px;">Messages from tenant: ${messageCount}</div>
      </div>
    `;
  }).join('');
}

function displayTenants(tenants) {
  const list = document.getElementById('tenantList');
  const count = document.getElementById('tenantCount');

  count.innerText = tenants.length;

  if (tenants.length === 0) {
    list.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">No tenant information yet</div>';
    return;
  }

  list.innerHTML = tenants.map(tenant => {
    const date = new Date(tenant.timestamp).toLocaleString();
    return `
      <div class="tenant-item">
        ${tenant.phone ? `<div><strong>Phone:</strong> ${tenant.phone}</div>` : ''}
        ${tenant.email ? `<div><strong>Email:</strong> ${tenant.email}</div>` : ''}
        <div><strong>Time:</strong> ${date}</div>
      </div>
    `;
  }).join('');
}

document.getElementById('clearMemory').addEventListener('click', async () => {
  if (confirm('Clear all conversation history? This will reset auto-reply tracking.')) {
    await chrome.storage.local.set({ conversationMemory: {} });
    alert('History cleared!');
    loadConfig();
  }
});

document.getElementById('exportCSV').addEventListener('click', async () => {
  const { tenants = [] } = await chrome.storage.local.get('tenants');

  if (tenants.length === 0) {
    alert('No data to export');
    return;
  }

  const csv = generateCSV(tenants);
  downloadCSV(csv, 'tenants.csv');
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

loadConfig();
