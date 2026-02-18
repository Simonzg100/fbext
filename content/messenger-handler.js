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
  const seenTexts = new Set(); // Deduplicate messages

  // Get the horizontal center of the chat area for position-based detection
  const mainRect = mainContent.getBoundingClientRect();
  const centerX = (mainRect.left + mainRect.right) / 2;

  messages.forEach(msg => {
    // Detect if this row is a message from "me" using multiple methods
    const rowText = msg.innerText || '';

    // Method 1: Text-based detection (works for English UI)
    let isFromMe = rowText.includes('You sent') || rowText.includes('You said');

    // Look for all div[dir="auto"] within this row
    // Filter out nested [dir="auto"] elements to avoid duplicates
    const allTextElements = msg.querySelectorAll('[dir="auto"]');
    const textElements = Array.from(allTextElements).filter(el => {
      return !el.querySelector('[dir="auto"]');
    });

    // Method 2: Position-based detection (language-independent)
    // In Messenger, your messages are right-aligned, others are left-aligned
    // Use the CENTER of actual content text elements for more reliable detection
    if (!isFromMe && textElements.length > 0) {
      for (const el of textElements) {
        const text = el.innerText.trim();
        if (text && text.length > 0) {
          const rect = el.getBoundingClientRect();
          const elCenterX = (rect.left + rect.right) / 2;
          if (elCenterX > centerX) {
            isFromMe = true;
          }
          break;
        }
      }
    }

    textElements.forEach(textElement => {
      const text = textElement.innerText.trim();

      // Skip empty messages and UI elements
      if (!text || text.length === 0) return;

      // Deduplicate: skip if we've already seen this exact text from the same sender
      // Use sender+text as key so different people sending "500" are both kept
      const dedupeKey = `${isFromMe ? 'me' : 'them'}:${text}`;
      if (seenTexts.has(dedupeKey)) {
        return;
      }
      seenTexts.add(dedupeKey);

      // Skip common UI text patterns
      const uiPatterns = [
        /^You sent$/i,
        /^You said$/i,
        /^Message sent$/i,
        /started this chat/i,
        /created this group/i,
        /View buyer profile/i,
        /is waiting for your response/i,
        /Send a quick response/i,
        /^Today at/i,
        /^Yesterday at/i,
        /^\d{1,2}:\d{2}\s*(AM|PM)$/i,
        /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}:\d{2}\s*(AM|PM)$/i,
        /^[A-Z][a-z]+ \d{1,2}, \d{4}$/i,
        /^Yesterday at .+\n/i,
        /·.*Private [Rr]oom/i,
        /You're not connected to/i,
        /You marked the listing/i,
        /You can now rate/i,
        /rate one another/i,
        /based on their interactions/i,
        /·.*Beds?\s+\d+\s*Bath/i,
        /·.*Townhouse/i,
        /·.*Apartment/i,
        /·.*Condo/i,
        /·.*House/i,
        /^\d+\s+Beds?\s+\d+\s*Bath/i,
        /^Rate \w+/i,
      ];

      const isUIElement = uiPatterns.some(pattern => pattern.test(text));
      if (isUIElement) return;

      // Note: removed name filter (was skipping single capitalized words like "Student")

      conversation.push({
        text: text,
        isFromMe: isFromMe
      });
    });
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
    '<button id="start-auto-reply" style="width:100%;padding:8px;margin-bottom:10px;background:#1877f2;color:white;border:none;border-radius:6px;cursor:pointer;">Detect & Reply</button>' +
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

// Core function: process the current conversation, generate AI reply if needed
// Returns: 'replied' | 'no_reply_needed' | 'pending' | 'no_conversation' | 'error'
async function processCurrentConversation() {
  const statusEl = document.getElementById('status');

  const convId = getConversationId(null);
  console.log('Current conversation ID:', convId);

  // Skip conversations where screening is already complete
  if (completedScreenings.has(convId)) {
    console.log(`Screening already complete for ${convId}, skipping`);
    return 'screening_complete';
  }

  const conversation = await getCurrentConversation();

  if (conversation.length === 0) {
    console.log('No conversation found');
    return 'no_conversation';
  }

  // Check if last message is from tenant (meaning we haven't replied yet)
  const lastMessage = conversation[conversation.length - 1];
  if (lastMessage && lastMessage.isFromMe) {
    console.log('Last message is from us, no reply needed');
    pendingReplies.delete(convId);
    return 'no_reply_needed';
  }

  // Check if we already inserted a reply for this conversation's last tenant message
  const lastTenantMsg = conversation.filter(m => !m.isFromMe).pop()?.text;
  if (pendingReplies.get(convId) === lastTenantMsg) {
    console.log(`Already inserted reply for ${convId}, waiting for manual send`);
    return 'pending';
  }

  console.log('Last message is from tenant, generating reply...');
  statusEl.innerText = 'AI is analyzing conversation...';

  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'generateReply',
        conversation: conversation
      }, (resp) => resolve(resp));
    });

    if (response && response.reply) {
      // Save AI-extracted info to dashboard
      await updateConversationMemory(convId, conversation, response.extractedInfo);

      // Check if all 5 required fields are collected → mark screening complete
      if (response.extractedInfo) {
        const info = response.extractedInfo;
        const allCollected = info.budget && info.moveInDate && info.leaseLength && info.occupation && info.phone;
        if (allCollected) {
          console.log(`All screening info collected for ${convId}, marking as complete after this reply`);
          completedScreenings.add(convId);
          // Persist to storage
          const completedArray = Array.from(completedScreenings);
          await chrome.storage.local.set({ completedScreenings: completedArray });
        }
      }

      insertReply(response.reply);
      pendingReplies.set(convId, lastTenantMsg);

      // Auto-send: wait for text to settle, then click send
      await new Promise(resolve => setTimeout(resolve, 1500));
      const sendButton = document.querySelector('[aria-label="Press enter to send"]');
      if (sendButton) {
        sendButton.click();
        console.log('Message sent automatically');
        statusEl.innerText = 'Message sent!';
      } else {
        statusEl.innerText = 'Reply inserted - send button not found, please send manually';
      }

      return 'replied';
    } else {
      statusEl.innerText = 'Error: ' + (response?.error || 'Unknown error');
      return 'error';
    }
  } catch (error) {
    console.error('Error processing conversation:', error);
    statusEl.innerText = 'Error: ' + error.message;
    return 'error';
  }
}

let singleMonitorRunning = false;

// Button handler: continuously monitor the current conversation
async function handleAutoReply() {
  const statusEl = document.getElementById('status');

  // Toggle: if already monitoring, stop
  if (singleMonitorRunning) {
    singleMonitorRunning = false;
    document.getElementById('start-auto-reply').textContent = 'Detect & Reply';
    document.getElementById('start-auto-reply').style.background = '#1877f2';
    statusEl.innerText = 'Monitoring stopped';
    return;
  }

  singleMonitorRunning = true;
  document.getElementById('start-auto-reply').textContent = 'Stop Monitoring';
  document.getElementById('start-auto-reply').style.background = '#e74c3c';

  await loadMemory();

  statusEl.innerText = 'Monitoring current conversation...';

  while (singleMonitorRunning) {
    const result = await processCurrentConversation();

    switch (result) {
      case 'no_conversation':
        statusEl.innerText = 'Monitoring: No conversation found';
        break;
      case 'no_reply_needed':
        statusEl.innerText = 'Monitoring: Waiting for tenant reply...';
        break;
      case 'pending':
        statusEl.innerText = 'Monitoring: Waiting for tenant reply...';
        break;
      case 'replied':
        statusEl.innerText = 'Monitoring: Replied! Waiting for next message...';
        break;
      case 'screening_complete':
        statusEl.innerText = 'Monitoring: Screening complete, skipping';
        break;
      case 'error':
        // error message already set by processCurrentConversation
        break;
    }

    // Check every 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
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
let pendingReplies = new Map(); // Track conversations with unsent replies (convId -> lastTenantMessage)
let completedScreenings = new Set(); // Conversations where all 5 required fields are collected

// Load memory on page load
async function loadMemory() {
  const stored = await chrome.storage.local.get(['conversationMemory', 'completedScreenings']);
  if (stored.conversationMemory) {
    conversationMemory = new Map(Object.entries(stored.conversationMemory));
    console.log('Loaded conversation memory:', conversationMemory.size, 'conversations');
  }
  if (stored.completedScreenings) {
    completedScreenings = new Set(stored.completedScreenings);
    console.log('Loaded completed screenings:', completedScreenings.size, 'conversations');
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
  // If an element is provided, try to get ID from the element first
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

    // Fallback: text content
    const nameElement = conversationElement.querySelector('[dir="auto"]');
    if (nameElement) return nameElement.innerText;
    if (conversationElement.innerText) return conversationElement.innerText.substring(0, 50);
  }

  // No element provided: get from current URL
  const urlMatch = window.location.href.match(/\/t\/(\d+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  return 'unknown';
}

// Check if conversation has new messages from tenant (last message is from tenant)
function hasNewTenantMessages(conversationId, conversation) {
  if (conversation.length === 0) return false;

  const lastMessage = conversation[conversation.length - 1];
  const needsReply = !lastMessage.isFromMe;

  console.log(`Conversation ${conversationId}: last message from ${needsReply ? 'tenant' : 'us'}`);

  return needsReply;
}

// Update memory for conversation
async function updateConversationMemory(conversationId, conversation, aiExtractedInfo) {
  const tenantMessageCount = conversation.filter(msg => !msg.isFromMe).length;
  conversationMemory.set(conversationId, tenantMessageCount);

  // Extract basic info from page (name, property)
  const tenantInfo = await extractDetailedTenantInfo(conversationId, conversation);

  // Merge AI-extracted info (overrides regex-based extraction)
  if (aiExtractedInfo) {
    tenantInfo.budget = aiExtractedInfo.budget || null;
    tenantInfo.leaseLength = aiExtractedInfo.leaseLength || null;
    tenantInfo.occupation = aiExtractedInfo.occupation || null;
    tenantInfo.creditScore = aiExtractedInfo.creditScore || null;
    tenantInfo.phone = aiExtractedInfo.phone || tenantInfo.phone;
    tenantInfo.email = aiExtractedInfo.email || tenantInfo.email;
    tenantInfo.moveInDate = aiExtractedInfo.moveInDate || tenantInfo.moveInDate;
    tenantInfo.summary = aiExtractedInfo.summary || null;
    console.log('Merged AI-extracted info:', aiExtractedInfo);
  }

  console.log('Final tenant info:', tenantInfo);

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
  const repliedInSession = new Set(); // Track conversations we've already replied to this session

  while (autoModeRunning) {
    // Step 1: Process the currently open conversation
    const currentConvId = getConversationId(null);
    if (currentConvId && currentConvId !== 'unknown') {
      document.getElementById('status').innerText = 'Auto Mode: Checking current conversation...';
      const result = await processCurrentConversation();
      console.log(`Current conversation ${currentConvId}: ${result}`);
      if (result === 'replied') {
        repliedInSession.add(currentConvId);
      }
    }

    // Step 2: Find unread conversations and filter out ones we don't need to process
    const unreadConversations = getUnreadConversations();
    const toProcess = unreadConversations.filter(conv => {
      const convId = getConversationId(conv);
      // Skip: already completed screening
      if (completedScreenings.has(convId)) return false;
      // Skip: already replied this session (wait for tenant to respond)
      if (repliedInSession.has(convId)) return false;
      // Skip: same as currently open conversation (already processed above)
      if (convId === currentConvId) return false;
      return true;
    });

    console.log(`Unread: ${unreadConversations.length}, To process: ${toProcess.length}, Replied this session: ${repliedInSession.size}, Completed: ${completedScreenings.size}`);

    if (toProcess.length === 0) {
      document.getElementById('status').innerText = `Auto Mode: Monitoring... (${repliedInSession.size} replied, ${completedScreenings.size} completed)`;
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Periodically clear repliedInSession so we re-check conversations
      // where the tenant may have sent a new message
      repliedInSession.clear();
      continue;
    }

    // Step 3: Process only the filtered unread conversations
    for (let i = 0; i < toProcess.length && autoModeRunning; i++) {
      const conv = toProcess[i];
      const convId = getConversationId(conv);

      console.log(`Processing ${i + 1}/${toProcess.length}: ${convId}`);
      document.getElementById('status').innerText = `Auto Mode: Processing ${i + 1}/${toProcess.length}...`;

      // Click on the conversation
      clickConversation(conv);

      // Wait for conversation to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Process this conversation
      const result = await processCurrentConversation();
      console.log(`Conversation ${convId}: ${result}`);

      if (result === 'replied') {
        repliedInSession.add(convId);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Wait before next scan
    document.getElementById('status').innerText = `Auto Mode: Monitoring... (${repliedInSession.size} replied, ${completedScreenings.size} completed)`;
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Clear replied set so we re-check for new tenant messages
    repliedInSession.clear();
  }
}

waitForElement('[role="grid"]').then(() => {
  console.log('Messenger page loaded, creating control panel');
  createControlPanel();
}).catch(err => {
  console.error('Failed to initialize:', err);
});
