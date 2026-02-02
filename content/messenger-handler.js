console.log('Facebook Rental Assistant: Messenger handler loaded');

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Element not found'));
    }, timeout);
  });
}

function getConversationList() {
  const conversations = document.querySelectorAll('[role="grid"] [role="row"]');
  console.log('Found conversations:', conversations.length);
  return Array.from(conversations);
}

function getUnreadConversations() {
  const conversations = getConversationList();
  return conversations.filter(conv => {
    const hasUnreadIndicator = conv.querySelector('[data-visualcompletion="ignore-dynamic"]');
    return hasUnreadIndicator;
  });
}

function clickConversation(conversation) {
  const clickableElement = conversation.querySelector('[role="link"]') || conversation;
  clickableElement.click();
  console.log('Clicked conversation');
}

async function getCurrentConversation() {
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Find only the messages in the chat area, not the conversation list
  // Look for the main message container first
  const mainContent = document.querySelector('[role="main"]');

  if (!mainContent) {
    console.log('Could not find main content area');
    return [];
  }

  // Get messages only from the main content area
  const messages = mainContent.querySelectorAll('[role="row"]');
  console.log('Found messages in main area:', messages.length);

  const conversation = [];

  messages.forEach(msg => {
    const textElement = msg.querySelector('[dir="auto"]');
    if (textElement) {
      const text = textElement.innerText;

      // Check if message is from me by looking for specific indicators
      // Try multiple methods to detect if it's my message
      let isFromMe = false;

      // Method 1: Check aria-label
      const ariaLabel = msg.getAttribute('aria-label') || '';
      if (ariaLabel.includes('You sent') || ariaLabel.includes('You said')) {
        isFromMe = true;
      }

      // Method 2: Check for specific class or data attributes
      if (!isFromMe && msg.closest('[data-scope="messages_table"]')) {
        const tableLabel = msg.closest('[data-scope="messages_table"]').getAttribute('aria-label');
        if (tableLabel && tableLabel.includes('You')) {
          isFromMe = true;
        }
      }

      conversation.push({
        text: text,
        isFromMe: isFromMe
      });
    }
  });

  console.log('Conversation messages found:', conversation.length);
  console.log('From tenant:', conversation.filter(m => !m.isFromMe).length);
  console.log('From me:', conversation.filter(m => m.isFromMe).length);

  return conversation;
}

function insertReply(replyText) {
  const inputBox = document.querySelector('[role="textbox"][contenteditable="true"]');
  if (inputBox) {
    console.log('Found input box:', inputBox);

    inputBox.focus();

    // Use the simple method that worked before
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, replyText);

    console.log('Reply inserted via execCommand');
    return true;
  }
  console.log('Input box not found');
  return false;
}

function createControlPanel() {
  const panel = document.createElement('div');
  panel.id = 'rental-assistant-panel';
  panel.style.cssText = 'position:fixed;top:20px;right:20px;width:300px;background:white;border:2px solid #1877f2;border-radius:8px;padding:15px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:10000;font-family:system-ui,-apple-system,sans-serif;';

  panel.innerHTML = '<h3 style="margin:0 0 10px 0;color:#1877f2;">Rental Assistant</h3>' +
    '<button id="start-auto-reply" style="width:100%;padding:8px;margin-bottom:10px;background:#1877f2;color:white;border:none;border-radius:6px;cursor:pointer;">Start Auto Reply</button>' +
    '<button id="start-auto-mode" style="width:100%;padding:8px;margin-bottom:10px;background:#ff6b00;color:white;border:none;border-radius:6px;cursor:pointer;">Auto Mode (All)</button>' +
    '<button id="next-conversation" style="width:100%;padding:8px;margin-bottom:10px;background:#42b72a;color:white;border:none;border-radius:6px;cursor:pointer;">Next Conversation</button>' +
    '<button id="debug-conversation" style="width:100%;padding:8px;margin-bottom:10px;background:#9b59b6;color:white;border:none;border-radius:6px;cursor:pointer;">Debug: Print Conversation</button>' +
    '<button id="stop-auto" style="width:100%;padding:8px;margin-bottom:10px;background:#e4e6eb;color:#333;border:none;border-radius:6px;cursor:pointer;display:none;">Stop Auto Mode</button>' +
    '<div id="status" style="font-size:14px;color:#666;">Ready</div>';

  document.body.appendChild(panel);

  document.getElementById('start-auto-reply').addEventListener('click', handleAutoReply);
  document.getElementById('start-auto-mode').addEventListener('click', startAutoMode);
  document.getElementById('next-conversation').addEventListener('click', goToNextConversation);
  document.getElementById('debug-conversation').addEventListener('click', debugConversation);
  document.getElementById('stop-auto').addEventListener('click', stopAutoMode);
}

async function debugConversation() {
  const statusEl = document.getElementById('status');
  statusEl.innerText = 'Reading conversation...';

  console.log('========== DEBUG: CURRENT CONVERSATION ==========');

  const convId = getConversationId(null);
  console.log('Conversation ID:', convId);
  console.log('URL:', window.location.href);

  const conversation = await getCurrentConversation();

  console.log('\n===== ALL MESSAGES =====');
  console.log('Total messages:', conversation.length);
  conversation.forEach((msg, index) => {
    console.log(`\n[${index + 1}] ${msg.isFromMe ? '👤 ME' : '👥 TENANT'}:`);
    console.log(msg.text);
  });

  console.log('\n===== STATISTICS =====');
  console.log('From tenant:', conversation.filter(m => !m.isFromMe).length);
  console.log('From me:', conversation.filter(m => m.isFromMe).length);

  console.log('\n===== TENANT MESSAGES ONLY =====');
  const tenantMessages = conversation.filter(m => !m.isFromMe);
  tenantMessages.forEach((msg, index) => {
    console.log(`[${index + 1}]`, msg.text);
  });

  console.log('\n===== COMBINED TENANT TEXT =====');
  const allTenantText = tenantMessages.map(m => m.text).join(' ');
  console.log(allTenantText);

  console.log('\n===== EXTRACTED INFO =====');
  const phoneMatch = allTenantText.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  const emailMatch = allTenantText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  const moveInMatch = allTenantText.match(/(?:move in|moving|available)\s*(?:on|by|in)?\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);

  console.log('Phone:', phoneMatch ? phoneMatch[0] : 'Not found');
  console.log('Email:', emailMatch ? emailMatch[0] : 'Not found');
  console.log('Move-in date:', moveInMatch ? moveInMatch[1] : 'Not found');

  console.log('\n========== END DEBUG ==========');

  statusEl.innerText = 'Check console for conversation details';
}

async function handleAutoReply() {
  const statusEl = document.getElementById('status');
  statusEl.innerText = 'Reading conversation...';

  // Load memory first
  await loadMemory();

  // Get conversation ID from URL
  const convId = getConversationId(null);
  console.log('Current conversation ID:', convId);

  const conversation = await getCurrentConversation();

  if (conversation.length === 0) {
    statusEl.innerText = 'No conversation found';
    return;
  }

  // Count tenant messages
  const currentCount = conversation.filter(msg => !msg.isFromMe).length;

  // Check if already replied to this conversation
  if (conversationMemory.has(convId)) {
    const lastCount = conversationMemory.get(convId);
    console.log(`Memory check: last=${lastCount}, current=${currentCount}`);

    if (currentCount <= lastCount) {
      statusEl.innerText = 'Already replied to this conversation';
      console.log('Already replied, skipping');
      return;
    } else {
      console.log('New messages detected, will reply');
    }
  } else {
    console.log('First time seeing this conversation');
  }

  statusEl.innerText = 'Generating reply...';

  // Update memory immediately
  await updateConversationMemory(convId, conversation);

  chrome.runtime.sendMessage({
    action: 'generateReply',
    conversation: conversation
  }, async (response) => {
    if (response && response.reply) {
      insertReply(response.reply);
      statusEl.innerText = 'Reply inserted, sending...';

      // Wait for UI to update
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check if text was inserted successfully
      const inputBox = document.querySelector('[role="textbox"][contenteditable="true"]');
      if (inputBox && inputBox.innerText.trim().length > 0) {
        // Click send button
        const sendButton = document.querySelector('[aria-label="Press enter to send"]');

        if (sendButton) {
          console.log('Found send button, clicking...');
          sendButton.click();
          statusEl.innerText = 'Message sent!';
          console.log('Message sent automatically');
        } else {
          statusEl.innerText = 'Send button not found';
          console.log('Send button not found');
        }
      } else {
        statusEl.innerText = 'Failed to insert text';
        console.log('Input box is empty');
      }
    } else {
      statusEl.innerText = 'Error: ' + (response?.error || 'Unknown error');
    }
  });
}

function goToNextConversation() {
  const unreadConversations = getUnreadConversations();
  if (unreadConversations.length > 0) {
    clickConversation(unreadConversations[0]);
    document.getElementById('status').innerText = 'Switched to next conversation';
  } else {
    document.getElementById('status').innerText = 'No more unread conversations';
  }
}

let autoModeRunning = false;
let conversationMemory = new Map(); // Store last message count for each conversation

// Load memory on page load
async function loadMemory() {
  const stored = await chrome.storage.local.get('conversationMemory');
  if (stored.conversationMemory) {
    conversationMemory = new Map(Object.entries(stored.conversationMemory));
    console.log('Loaded conversation memory:', conversationMemory.size, 'conversations');
  }
}

async function startAutoMode() {
  autoModeRunning = true;

  // Ensure memory is loaded
  await loadMemory();

  document.getElementById('start-auto-mode').style.display = 'none';
  document.getElementById('stop-auto').style.display = 'block';
  document.getElementById('status').innerText = 'Auto Mode: Starting...';

  // First, initialize memory for all current conversations if memory is empty
  if (conversationMemory.size === 0) {
    document.getElementById('status').innerText = 'Auto Mode: Initializing memory...';
    await initializeMemory();
  }

  document.getElementById('status').innerText = 'Auto Mode: Monitoring...';
  await monitorConversations();
}

function stopAutoMode() {
  autoModeRunning = false;
  document.getElementById('start-auto-mode').style.display = 'block';
  document.getElementById('stop-auto').style.display = 'none';
  document.getElementById('status').innerText = 'Auto Mode: Stopped';
}

// Get conversation ID from the list item or current URL
function getConversationId(conversationElement) {
  // Method 1: Try to get Facebook's thread ID from URL when conversation is open
  const urlMatch = window.location.href.match(/\/t\/(\d+)/);
  if (urlMatch) {
    return urlMatch[1]; // Return the numeric thread ID
  }

  // Method 2: Try to get from data attributes
  if (conversationElement) {
    const link = conversationElement.querySelector('a[href*="/t/"]');
    if (link) {
      const hrefMatch = link.href.match(/\/t\/(\d+)/);
      if (hrefMatch) {
        return hrefMatch[1];
      }
    }

    // Fallback: Try aria-label or other attributes
    const ariaLabel = conversationElement.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel;
    }
  }

  // Method 3: Fallback to text content
  const nameElement = conversationElement?.querySelector('[dir="auto"]');
  return nameElement ? nameElement.innerText : conversationElement?.innerText.substring(0, 50) || 'unknown';
}

// Check if conversation has new messages from tenant
function hasNewTenantMessages(conversationId, conversation) {
  // Count messages from tenant (not from me)
  const tenantMessages = conversation.filter(msg => !msg.isFromMe);
  const tenantMessageCount = tenantMessages.length;

  // Get last known count
  const lastCount = conversationMemory.get(conversationId) || 0;

  console.log(`Conversation ${conversationId}: last=${lastCount}, current=${tenantMessageCount}`);

  return tenantMessageCount > lastCount;
}

// Update memory for conversation
async function updateConversationMemory(conversationId, conversation) {
  const tenantMessageCount = conversation.filter(msg => !msg.isFromMe).length;
  conversationMemory.set(conversationId, tenantMessageCount);

  // Extract detailed info
  const tenantInfo = await extractDetailedTenantInfo(conversationId, conversation);
  console.log('Extracted tenant info:', tenantInfo);

  // Save to storage
  const memoryObj = Object.fromEntries(conversationMemory);
  await chrome.storage.local.set({ conversationMemory: memoryObj });

  // Save detailed tenant info
  const { detailedTenants = [] } = await chrome.storage.local.get('detailedTenants');

  // Check if this tenant already exists
  const existingIndex = detailedTenants.findIndex(t => t.conversationId === conversationId);
  if (existingIndex >= 0) {
    console.log('Updating existing tenant at index', existingIndex);
    detailedTenants[existingIndex] = tenantInfo;
  } else {
    console.log('Adding new tenant');
    detailedTenants.push(tenantInfo);
  }

  await chrome.storage.local.set({ detailedTenants });
  console.log('Saved to storage, total tenants:', detailedTenants.length);

  console.log(`Updated memory for ${conversationId}: ${tenantMessageCount} messages`);
}

// Fetch property address from marketplace item page
async function fetchPropertyAddress(itemUrl, itemId) {
  try {
    console.log('Fetching property address from:', itemUrl);

    // Ask background script to fetch the page
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'fetchProperty',
        url: itemUrl,
        itemId: itemId
      }, (response) => {
        resolve(response);
      });
    });

    if (result && result.address) {
      console.log('Fetched address:', result.address);
      return result.address;
    } else {
      console.log('Could not fetch address, using item ID');
      return `Property ID: ${itemId}`;
    }
  } catch (error) {
    console.error('Error fetching property address:', error);
    return `Property ID: ${itemId}`;
  }
}

// Extract detailed tenant information
async function extractDetailedTenantInfo(conversationId, conversation) {
  const allText = conversation
    .filter(msg => !msg.isFromMe)
    .map(msg => msg.text)
    .join(' ');

  // Try to get tenant name and property from the page
  let tenantName = 'Unknown';
  let property = 'Unknown property';

  // Method 1: Try to get from page header/title
  const headerElement = document.querySelector('h1[dir="auto"]');
  if (headerElement) {
    tenantName = headerElement.innerText.trim();
    console.log('Found tenant name from header:', tenantName);
  }

  // Method 2: Extract property link from conversation
  // Look for marketplace item link in the conversation
  const marketplaceLink = document.querySelector('a[href*="/marketplace/item/"]');
  if (marketplaceLink) {
    const itemUrl = marketplaceLink.href;
    console.log('Found marketplace item link:', itemUrl);

    // Extract item ID
    const itemIdMatch = itemUrl.match(/\/marketplace\/item\/(\d+)/);
    if (itemIdMatch) {
      const itemId = itemIdMatch[1];

      // Try to get cached property info
      const { propertyCache = {} } = await chrome.storage.local.get('propertyCache');

      if (propertyCache[itemId]) {
        property = propertyCache[itemId];
        console.log('Found property from cache:', property);
      } else {
        // Fetch property details in background by opening the link in a hidden iframe
        console.log('Property not in cache, fetching from:', itemUrl);
        property = await fetchPropertyAddress(itemUrl, itemId);
      }
    }
  }

  // Method 3: Try to get from conversation list item
  const conversations = document.querySelectorAll('[role="grid"] [role="row"]');
  for (let conv of conversations) {
    // Check if this conversation contains the current thread ID
    const link = conv.querySelector(`a[href*="/t/${conversationId}"]`);
    if (link) {
      const textContent = conv.innerText;
      console.log('Found matching conversation text:', textContent);

      // Format: "Name · Property listing"
      const parts = textContent.split('·');
      if (parts.length >= 2) {
        tenantName = parts[0]?.trim() || tenantName;
      } else if (parts.length === 1) {
        tenantName = parts[0]?.split('\n')[0]?.trim() || tenantName;
      }
      break;
    }
  }

  console.log('Extracted tenant info:', { tenantName, property });

  // Extract contact info
  const phoneMatch = allText.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  const emailMatch = allText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);

  // Extract move-in date (simple pattern matching)
  const moveInMatch = allText.match(/(?:move in|moving|available)\s*(?:on|by|in)?\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);

  return {
    conversationId: conversationId,
    tenantName: tenantName,
    property: property,
    phone: phoneMatch ? phoneMatch[0] : null,
    email: emailMatch ? emailMatch[0] : null,
    moveInDate: moveInMatch ? moveInMatch[1] : null,
    lastReplyTime: Date.now(),
    messageCount: conversation.filter(msg => !msg.isFromMe).length,
    status: 'Active'
  };
}

async function monitorConversations() {
  while (autoModeRunning) {
    const unreadConversations = getUnreadConversations();

    console.log('Checking unread conversations:', unreadConversations.length);

    if (unreadConversations.length === 0) {
      document.getElementById('status').innerText = 'Auto Mode: No unread messages, monitoring...';
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }

    // Process each unread conversation
    for (let i = 0; i < unreadConversations.length && autoModeRunning; i++) {
      const conv = unreadConversations[i];
      const convId = getConversationId(conv);

      console.log(`Checking conversation ${i + 1}/${unreadConversations.length}: ${convId}`);

      // Click on the conversation
      clickConversation(conv);

      // Wait for conversation to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Get conversation content
      const conversation = await getCurrentConversation();

      if (conversation.length > 0) {
        // Check if this conversation has new messages from tenant
        if (hasNewTenantMessages(convId, conversation)) {
          console.log(`New messages detected in ${convId}, sending reply...`);

          document.getElementById('status').innerText = `Auto Mode: Replying to ${i + 1}/${unreadConversations.length}`;

          // Update memory IMMEDIATELY to prevent duplicate replies
          await updateConversationMemory(convId, conversation);

          // Generate and send reply
          const reply = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              action: 'generateReply',
              conversation: conversation
            }, (response) => {
              resolve(response?.reply);
            });
          });

          if (reply) {
            insertReply(reply);
            await new Promise(resolve => setTimeout(resolve, 1500));

            const sendButton = document.querySelector('[aria-label="Press enter to send"]');
            if (sendButton) {
              sendButton.click();
              console.log('Message sent');
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        } else {
          console.log(`No new messages in ${convId}, skipping`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // After processing all unread, wait before checking again
    console.log('Finished checking all unread, waiting 10 seconds before next check...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

waitForElement('[role="grid"]').then(() => {
  console.log('Messenger page loaded, creating control panel');
  createControlPanel();
}).catch(err => {
  console.error('Failed to initialize:', err);
});
