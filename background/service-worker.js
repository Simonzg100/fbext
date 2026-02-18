// Background Service Worker

console.log('Facebook Rental Assistant: Service worker started');

const DEFAULT_SCREENING_PROMPT = `You are Simon, a rental assistant for Tian Realty. You are chatting with potential tenants on Facebook Messenger.

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
- If the tenant asks about the deposit, tell them it's typically one month's rent.
- After sending the closing message, do NOT reply to follow-up questions. If the tenant asks other questions, say: "Great questions! Our property manager will reach out to you soon with all the details. Thanks!"
- Keep replies SHORT. Just list what you still need.
- NEVER repeat, restate, or paraphrase what the tenant said. Just ask for what's missing.
- Always reply in English.
- Do NOT use markdown formatting. Write plain text only, as this will be sent in Facebook Messenger.`;

// Load custom prompt from storage, fallback to default
async function getScreeningPrompt() {
  const { replyTemplate } = await chrome.storage.local.get('replyTemplate');
  return replyTemplate || DEFAULT_SCREENING_PROMPT;
}

const EXTRACTION_PROMPT = `Analyze the following conversation between a rental assistant and a potential tenant. Extract any information the tenant has provided. Return ONLY a JSON object with these fields (use null for info not yet provided):

{
  "budget": "budget range mentioned by tenant, e.g. '$500-700'",
  "moveInDate": "move-in date mentioned, e.g. 'March 1, 2025'",
  "leaseLength": "lease length preference, e.g. '12 months'",
  "occupation": "student/working/other",
  "phone": "phone number",
  "email": "email address",
  "creditScore": "credit score or 'no credit'",
  "summary": "one-sentence summary of what info is still missing"
}

Return ONLY valid JSON, no other text.`;

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

// 调用 AI API (Groq - OpenAI compatible)
async function callAI(messages) {
  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');

  if (!geminiApiKey) {
    throw new Error('API Key not set. Please add your Groq API Key in the dashboard Settings.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${geminiApiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      temperature: 0.7,
      max_tokens: 300
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`API error (${response.status}): ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;

  if (!reply) {
    throw new Error('API returned empty response');
  }

  return reply.trim();
}

// 用 AI 提取租客结构化信息
async function extractInfoWithAI(conversation) {
  const conversationText = conversation
    .map(msg => `${msg.isFromMe ? 'Assistant' : 'Tenant'}: ${msg.text}`)
    .join('\n');

  const messages = [
    { role: 'system', content: EXTRACTION_PROMPT },
    { role: 'user', content: conversationText }
  ];

  try {
    const result = await callAI(messages);
    // Parse JSON from response (handle possible markdown wrapping)
    const jsonStr = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const info = JSON.parse(jsonStr);
    console.log('AI extracted info:', info);
    return info;
  } catch (error) {
    console.error('Error extracting info with AI:', error);
    return null;
  }
}

// 生成回复 - 使用 AI
async function handleGenerateReply(conversation, sendResponse) {
  try {
    // Build conversation messages for reply generation
    const screeningPrompt = await getScreeningPrompt();
    const replyMessages = [
      { role: 'system', content: screeningPrompt },
      ...conversation.map(msg => ({
        role: msg.isFromMe ? 'assistant' : 'user',
        content: msg.text
      }))
    ];

    const reply = await callAI(replyMessages);

    // Extract structured info with a second AI call
    const extractedInfo = await extractInfoWithAI(conversation);

    sendResponse({ reply: reply, extractedInfo: extractedInfo });

  } catch (error) {
    console.error('Error generating reply:', error);
    sendResponse({ error: error.message });
  }
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
