// Background Service Worker

console.log('Facebook Rental Assistant: Service worker started');

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateReply') {
    handleGenerateReply(request.conversation, sendResponse);
    return true;
  } else if (request.action === 'fetchProperty') {
    handleFetchProperty(request.url, request.itemId, sendResponse);
    return true;
  }
});

// 生成回复 - 使用固定模板
async function handleGenerateReply(conversation, sendResponse) {
  try {
    // 使用固定模板回复 - 暂时不用换行，因为Facebook会过滤掉
    // const reply = `Hi! This is Simon from Tian Realty. 
    // Thanks for your interest and this room is still available! Please share these details so we can better assist you: 
    // • Phone number 
    // • Move in Date 
    // • Lease length 
    // • Occupation (student/working). 
    // Our property manager will contact you shortly to discuss options! For more properties, you can check on our website: tianrealty.com, and let me know which property you want to schedule a tour.`;

    const reply = `Hi! Are you still looking for a rental? We have some available properties that might interest you..`

    // 提取租客信息
    const tenantInfo = extractTenantInfo(conversation);
    if (tenantInfo) {
      await saveTenantInfo(tenantInfo);
    }

    sendResponse({ reply: reply });

  } catch (error) {
    console.error('Error generating reply:', error);
    sendResponse({ error: error.message });
  }
}

// 提取租客信息
function extractTenantInfo(conversation) {
  const allText = conversation
    .filter(msg => !msg.isFromMe)
    .map(msg => msg.text)
    .join(' ');

  // 简单的信息提取
  const phoneMatch = allText.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  const emailMatch = allText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);

  if (phoneMatch || emailMatch) {
    return {
      timestamp: Date.now(),
      phone: phoneMatch ? phoneMatch[0] : null,
      email: emailMatch ? emailMatch[0] : null,
      rawConversation: allText
    };
  }

  return null;
}

// 保存租客信息
async function saveTenantInfo(info) {
  const { tenants = [] } = await chrome.storage.local.get('tenants');
  tenants.push(info);
  await chrome.storage.local.set({ tenants });
  console.log('Tenant info saved:', info);
}

// 获取房源地址
async function handleFetchProperty(url, itemId, sendResponse) {
  try {
    console.log('Fetching property from:', url);

    const response = await fetch(url);
    const html = await response.text();

    // Look for address pattern
    const addressMatch = html.match(/\d+\s+[NSEW]?\s*\w+\s+(St|Ave|Rd|Street|Avenue|Road|Dr|Drive|Blvd|Boulevard|Lane|Ln|Way|Court|Ct|Place|Pl)[,.\s]+[A-Za-z\s]+,\s*[A-Z]{2}/);

    if (addressMatch) {
      const address = addressMatch[0].trim();
      console.log('Found address:', address);

      // Cache it
      const { propertyCache = {} } = await chrome.storage.local.get('propertyCache');
      propertyCache[itemId] = address;
      await chrome.storage.local.set({ propertyCache });

      sendResponse({ address: address });
    } else {
      console.log('Address not found in HTML');
      sendResponse({ address: null });
    }
  } catch (error) {
    console.error('Error fetching property:', error);
    sendResponse({ address: null });
  }
}
