// Marketplace item scraper
console.log('Marketplace scraper loaded');

// When on a marketplace item page, extract and cache the address
if (window.location.href.includes('/marketplace/item/')) {
  console.log('On marketplace item page, extracting address...');

  setTimeout(() => {
    extractAndCacheAddress();
  }, 2000); // Wait for page to load
}

async function extractAndCacheAddress() {
  // Extract item ID from URL
  const itemIdMatch = window.location.href.match(/\/marketplace\/item\/(\d+)/);
  if (!itemIdMatch) {
    console.log('Could not extract item ID from URL');
    return;
  }

  const itemId = itemIdMatch[1];
  console.log('Item ID:', itemId);

  // Look for address in the page
  // Try multiple selectors
  let address = null;

  // Method 1: Look for text that contains street address pattern
  const spans = document.querySelectorAll('span[dir="auto"]');
  for (let span of spans) {
    const text = span.innerText;
    // Check if it matches address pattern (number + street + city, state)
    if (/\d+\s+[NSEW]?\s*\w+\s+(St|Ave|Rd|Street|Avenue|Road|Dr|Drive|Blvd|Boulevard|Lane|Ln|Way|Court|Ct|Place|Pl)[,.\s]+[A-Za-z\s]+,\s*[A-Z]{2}/.test(text)) {
      address = text.trim();
      console.log('Found address:', address);
      break;
    }
  }

  if (!address) {
    console.log('Could not find address on page');
    return;
  }

  // Cache the address
  const { propertyCache = {} } = await chrome.storage.local.get('propertyCache');
  propertyCache[itemId] = address;
  await chrome.storage.local.set({ propertyCache });

  console.log('Cached address for item', itemId, ':', address);
}
