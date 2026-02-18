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
    // Determine screening status based on collected info
    const infoFields = [tenant.budget, tenant.moveInDate, tenant.occupation, tenant.phone, tenant.creditScore];
    const filledCount = infoFields.filter(f => f).length;
    let statusLabel = 'New';
    let statusClass = 'status-new';
    if (filledCount >= 5) {
      statusLabel = 'Complete';
      statusClass = 'status-complete';
    } else if (filledCount >= 1) {
      statusLabel = `${filledCount}/5 info`;
      statusClass = 'status-active';
    }

    return `
      <tr title="${escapeHtml(tenant.summary || '')}">
        <td><strong>${escapeHtml(tenant.tenantName)}</strong></td>
        <td>${escapeHtml(tenant.property)}</td>
        <td>${escapeHtml(tenant.budget || '-')}</td>
        <td>${tenant.moveInDate || '-'}</td>
        <td>${escapeHtml(tenant.occupation || '-')}</td>
        <td>${tenant.phone || '-'}</td>
        <td>${escapeHtml(tenant.creditScore || '-')}</td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
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

// Settings - API Key
document.getElementById('saveApiKey').addEventListener('click', async () => {
  const apiKey = document.getElementById('geminiApiKey').value.trim();
  if (!apiKey) {
    alert('Please enter an API key.');
    return;
  }
  await chrome.storage.local.set({ geminiApiKey: apiKey });
  alert('API Key saved!');
});

// Default AI prompt (keep in sync with service-worker.js)
const DEFAULT_PROMPT = `You are Simon, a rental assistant for Tian Realty. You are chatting with potential tenants on Facebook Messenger.

Your goal is to screen tenants by collecting the following information through friendly, natural conversation:

Required (must collect all 5):
1. Budget range - how much they can pay per month
2. Move-in date - when they want to move in
3. Lease length - how long they want to rent (e.g. 6 months, 12 months)
4. Occupation - what they do (student, working, etc.)
5. Phone number - so the property manager can contact them

Optional (ask only after all required info is collected):
6. Credit score or credit history

Rules:
- Be friendly, professional, and concise.
- If this is the first message, greet them and ask ALL 5 required items at once.
- Check what info the tenant already provided. Ask for ALL remaining missing items together in one message, not one by one.
- Once all 5 required items are collected, ask about credit score (optional). If they don't have one, that's fine.
- Once everything is collected, thank them and let them know a property manager will contact them shortly. Mention our website tianrealty.com for more listings.
- Keep replies SHORT. Just list what you still need.
- NEVER repeat, restate, or paraphrase what the tenant said. Just ask for what's missing.
- Always reply in English.
- Do NOT use markdown formatting. Write plain text only, as this will be sent in Facebook Messenger.`;

// Settings - AI Instructions
document.getElementById('saveTemplate').addEventListener('click', async () => {
  const template = document.getElementById('replyTemplate').value;
  await chrome.storage.local.set({ replyTemplate: template });
  alert('Instructions saved!');
});

document.getElementById('resetTemplate').addEventListener('click', () => {
  document.getElementById('replyTemplate').value = DEFAULT_PROMPT;
  alert('Reset to default. Click "Save Instructions" to apply.');
});

// Load settings
async function loadSettings() {
  const data = await chrome.storage.local.get(['geminiApiKey', 'replyTemplate', 'autoMonitor', 'checkInterval']);

  if (data.geminiApiKey) {
    document.getElementById('geminiApiKey').value = data.geminiApiKey;
  }

  document.getElementById('replyTemplate').value = data.replyTemplate || DEFAULT_PROMPT;

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
