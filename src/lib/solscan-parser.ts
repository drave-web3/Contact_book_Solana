/**
 * Solscan HTML Parser
 * Parses https://solscan.io/account/{address} page to extract reputation data
 * Uses CORS proxy to bypass browser restrictions
 */

import { getCluster } from "./solana";

export interface SolscanParsedData {
  transactionCount: number;
  firstTxTime?: number; // Unix timestamp in seconds
  recentActivity: number; // Transactions in last 14 days
  hasIncoming: boolean;
  hasOutgoing: boolean;
  tokenHoldings: Array<{
    symbol: string;
    balance: string;
  }>;
}

/**
 * Fetches and parses Solscan account page
 * @param address - Solana address
 * @returns Parsed data or null if failed
 */
export async function parseSolscanAccount(
  address: string
): Promise<SolscanParsedData | null> {
  try {
    const cluster = getCluster();
    // Build Solscan URL
    let solscanUrl = `https://solscan.io/account/${address}`;
    if (cluster !== "mainnet-beta") {
      solscanUrl += `?cluster=${cluster}`;
    }

    // Use CORS proxy to bypass browser restrictions
    // Try multiple CORS proxies for reliability
    const corsProxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(solscanUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(solscanUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(solscanUrl)}`,
    ];

    let html = "";
    let lastError: Error | null = null;

    // Try each proxy
    for (const proxyUrl of corsProxies) {
      try {
        console.log('[Solscan Parser] Trying proxy:', proxyUrl.substring(0, 50) + '...');
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/html',
          },
        });

        if (response.ok) {
          html = await response.text();
          console.log('[Solscan Parser] Successfully fetched HTML, length:', html.length);
          break;
        } else {
          console.warn('[Solscan Parser] Proxy returned:', response.status);
          lastError = new Error(`Proxy error: ${response.status}`);
        }
      } catch (error: any) {
        console.warn('[Solscan Parser] Proxy failed:', error.message);
        lastError = error;
        continue;
      }
    }

    if (!html) {
      throw lastError || new Error('All proxies failed');
    }

    // Parse HTML
    return parseSolscanHTML(html, address);
  } catch (error: any) {
    console.error('[Solscan Parser] Error:', error);
    return null;
  }
}

/**
 * Parses Solscan HTML to extract account data
 */
function parseSolscanHTML(html: string, address: string): SolscanParsedData | null {
  try {
    // Create a temporary DOM parser (works in browser)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Initialize result
    const result: SolscanParsedData = {
      transactionCount: 0,
      recentActivity: 0,
      hasIncoming: false,
      hasOutgoing: false,
      tokenHoldings: [],
    };

    console.log('[Solscan Parser] Starting HTML parsing for address:', address);

    // Method 1: Look for JSON data in script tags (Solscan uses this for React hydration)
    const scriptTags = doc.querySelectorAll('script');
    for (const script of Array.from(scriptTags)) {
      const scriptContent = script.textContent || script.innerHTML;
      
      // Look for various JSON patterns
      const jsonPatterns = [
        /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
        /window\.__NEXT_DATA__\s*=\s*({.+?});/s,
        /"account":\s*({[^}]+"address"[^}]+})/,
        /"transactionCount":\s*(\d+)/,
        /"totalTx":\s*(\d+)/,
        /"txCount":\s*(\d+)/,
      ];

      for (const pattern of jsonPatterns) {
        const match = scriptContent.match(pattern);
        if (match) {
          try {
            let jsonData: any = null;
            if (match[1] && match[1].startsWith('{')) {
              jsonData = JSON.parse(match[1]);
            } else if (match[1] && !isNaN(parseInt(match[1]))) {
              // Direct number match - only set if we don't have a value yet
              if (result.transactionCount === 0) {
                result.transactionCount = parseInt(match[1], 10);
                console.log('[Solscan Parser] Found transaction count from script:', result.transactionCount);
              }
            }

            if (jsonData) {
              // Try various paths in JSON - use FIRST found, not maximum
              const txCount = jsonData.account?.transactionCount || 
                            jsonData.account?.totalTx || 
                            jsonData.account?.txCount ||
                            jsonData.transactionCount ||
                            jsonData.totalTx ||
                            jsonData.txCount;
              
              if (txCount && result.transactionCount === 0) {
                // Only set if we don't have a value yet (first match wins)
                result.transactionCount = parseInt(txCount, 10);
                console.log('[Solscan Parser] Found transaction count from JSON:', result.transactionCount);
              }

              if (jsonData.account?.firstTxTime || jsonData.firstTxTime) {
                result.firstTxTime = jsonData.account?.firstTxTime || jsonData.firstTxTime;
                console.log('[Solscan Parser] Found firstTxTime:', result.firstTxTime);
              }
            }
          } catch (e) {
            // JSON parsing failed, continue
          }
        }
      }
    }

    // Method 2: Look for transaction-related text in HTML, but ONLY near the address
    // Search for patterns that are specific to this address, not general page numbers
    const addressPattern = address.slice(0, 8); // First 8 chars for matching
    const addressSection = html.indexOf(addressPattern);
    
    if (addressSection !== -1) {
      // Extract a section around the address (3000 chars before and after)
      const start = Math.max(0, addressSection - 3000);
      const end = Math.min(html.length, addressSection + 3000);
      const addressContext = html.substring(start, end);
      
      console.log('[Solscan Parser] Searching in context around address, context length:', addressContext.length);
      
      // Look for transaction count near the address - use FIRST match, not maximum
      const txCountPatterns = [
        /(\d+)\s*(?:transactions?|txs?|txns?)/i, // Case insensitive, first match
        /"totalTx":\s*(\d+)/i,
        /"txCount":\s*(\d+)/i,
        /transaction[^>]*>.*?(\d+)/i,
      ];

      let foundCount = false;
      for (const pattern of txCountPatterns) {
        const match = addressContext.match(pattern);
        if (match && !foundCount) {
          const numMatch = match[0].match(/(\d+)/);
          if (numMatch) {
            const count = parseInt(numMatch[1], 10);
            // Only accept reasonable transaction counts
            if (count > 0 && count <= 100000) {
              result.transactionCount = count;
              console.log('[Solscan Parser] Found transaction count near address (FIRST match):', result.transactionCount);
              foundCount = true;
              break; // Stop after first valid match
            }
          }
        }
      }
    }
    
    // Fallback: if nothing found near address, search whole HTML but take FIRST match
    if (result.transactionCount === 0) {
      console.log('[Solscan Parser] No count found near address, searching whole HTML...');
      const txCountMatches = html.match(/(\d+)\s*(?:transactions?|txs?|txns?)/gi);
      if (txCountMatches && txCountMatches.length > 0) {
        // Take the FIRST match, not the maximum
        const firstMatch = txCountMatches[0];
        const numMatch = firstMatch.match(/(\d+)/);
        if (numMatch) {
          const count = parseInt(numMatch[1], 10);
          if (count > 0 && count <= 100000) {
            result.transactionCount = count;
            console.log('[Solscan Parser] Found transaction count from first match in whole HTML:', result.transactionCount);
          }
        }
      }
    }

    // Method 3: Look for transaction list or table in DOM
    const txSelectors = [
      'table[class*="transaction"]',
      'div[class*="transaction-list"]',
      'div[class*="tx-list"]',
      '[data-testid*="transaction"]',
      '[id*="transaction"]',
    ];

    for (const selector of txSelectors) {
      const txTable = doc.querySelector(selector);
      if (txTable) {
        const txRows = txTable.querySelectorAll('tr, div[class*="transaction-item"], div[class*="tx-item"]');
        if (txRows.length > 0 && result.transactionCount === 0) {
          // Only set if we don't have a count yet (first match wins)
          result.transactionCount = txRows.length;
          console.log('[Solscan Parser] Found', txRows.length, 'transaction rows from selector:', selector);
        }
        
        // Check for incoming/outgoing indicators
        const txText = txTable.textContent || '';
        if (txText.includes('Received') || txText.includes('Incoming') || txText.includes('Receive')) {
          result.hasIncoming = true;
        }
        if (txText.includes('Sent') || txText.includes('Outgoing') || txText.includes('Send')) {
          result.hasOutgoing = true;
        }
        break;
      }
    }

    // Method 4: Count transaction links or buttons (only if no count yet)
    if (result.transactionCount === 0) {
      const txLinks = doc.querySelectorAll('a[href*="/tx/"], a[href*="transaction"]');
      if (txLinks.length > 0) {
        result.transactionCount = txLinks.length;
        console.log('[Solscan Parser] Found', txLinks.length, 'transaction links');
      }
    }

    // Method 5: Look for token holdings in HTML text and DOM
    const tokenSelectors = [
      'div[class*="token"]',
      'div[class*="holding"]',
      'div[class*="balance"]',
      '[data-testid*="token"]',
    ];

    for (const selector of tokenSelectors) {
      const tokenSection = doc.querySelector(selector);
      if (tokenSection) {
        const tokenItems = tokenSection.querySelectorAll('div[class*="token-item"], tr, div[class*="balance-item"]');
        tokenItems.forEach((item) => {
          const text = item.textContent || '';
          const symbolMatch = text.match(/(USDC|USDT|SOL)/i);
          const balanceMatch = text.match(/([\d,]+\.?\d*)/);
          if (symbolMatch && balanceMatch && parseFloat(balanceMatch[1].replace(/,/g, '')) > 0) {
            result.tokenHoldings.push({
              symbol: symbolMatch[1].toUpperCase(),
              balance: balanceMatch[1].replace(/,/g, ''),
            });
            console.log('[Solscan Parser] Found token:', symbolMatch[1], 'balance:', balanceMatch[1]);
          }
        });
        if (result.tokenHoldings.length > 0) break;
      }
    }

    // Also search in raw HTML for token patterns
    const tokenHtmlMatches = html.match(/(USDC|USDT|SOL)[^>]*>[\s\S]*?([\d,]+\.?\d*)/gi);
    if (tokenHtmlMatches) {
      for (const match of tokenHtmlMatches) {
        const symbolMatch = match.match(/(USDC|USDT|SOL)/i);
        const balanceMatch = match.match(/([\d,]+\.?\d*)/);
        if (symbolMatch && balanceMatch) {
          const symbol = symbolMatch[1].toUpperCase();
          const balance = balanceMatch[1].replace(/,/g, '');
          // Check if we already have this token
          if (!result.tokenHoldings.find(t => t.symbol === symbol)) {
            result.tokenHoldings.push({ symbol, balance });
            console.log('[Solscan Parser] Found token from HTML:', symbol, 'balance:', balance);
          }
        }
      }
    }

    // Method 6: Calculate recent activity (last 14 days) from transaction timestamps
    const now = Date.now();
    const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);
    
    // Look for transaction timestamps in the HTML
    const timeSelectors = [
      'time',
      'span[class*="time"]',
      'div[class*="timestamp"]',
      'div[class*="date"]',
      '[datetime]',
    ];

    for (const selector of timeSelectors) {
      const timeElements = doc.querySelectorAll(selector);
      timeElements.forEach((el) => {
        const timeText = el.getAttribute('datetime') || el.getAttribute('data-time') || el.textContent || '';
        const timeMatch = timeText.match(/(\d{4}-\d{2}-\d{2})|(\d{10,13})/);
        if (timeMatch) {
          let timestamp = 0;
          if (timeMatch[1]) {
            // Date string
            timestamp = new Date(timeMatch[1]).getTime();
          } else if (timeMatch[2]) {
            // Unix timestamp
            timestamp = parseInt(timeMatch[2], 10);
            if (timestamp < 10000000000) {
              timestamp *= 1000; // Convert seconds to milliseconds
            }
          }
          
          if (timestamp > fourteenDaysAgo && timestamp > 0) {
            result.recentActivity++;
          }
        }
      });
      if (result.recentActivity > 0) break;
    }

    // If we have transaction count but no recent activity, estimate based on count
    if (result.transactionCount > 0 && result.recentActivity === 0) {
      // Assume at least some transactions are recent if count is low
      if (result.transactionCount <= 10) {
        result.recentActivity = Math.min(result.transactionCount, 5);
      }
    }

    // If we found first transaction time, calculate age
    if (result.firstTxTime) {
      const firstTxDate = new Date(result.firstTxTime * 1000);
      const ageDays = Math.floor((now - firstTxDate.getTime()) / (1000 * 60 * 60 * 24));
      console.log('[Solscan Parser] Account age:', ageDays, 'days');
    }

    // Final summary
    console.log('[Solscan Parser] Final parsed data:', {
      transactionCount: result.transactionCount,
      recentActivity: result.recentActivity,
      hasIncoming: result.hasIncoming,
      hasOutgoing: result.hasOutgoing,
      tokenHoldings: result.tokenHoldings.length,
      firstTxTime: result.firstTxTime ? new Date(result.firstTxTime * 1000).toISOString() : 'not found',
    });

    // If we got some data, return it even if transactionCount is 0
    // (might be a new address)
    return result;
  } catch (error) {
    console.error('[Solscan Parser] HTML parsing error:', error);
    return null;
  }
}

