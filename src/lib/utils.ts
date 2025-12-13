import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import leven from "leven";
import { PublicKey } from "@solana/web3.js";
import { getCluster } from "./solana";
import { parseSolscanAccount } from "./solscan-parser";
import {
  loadReputationCache,
  saveReputationToCache,
  getReputationFromCache,
  clearReputationCache as clearReputationCacheDB,
  removeReputationFromCache,
  clearIncorrectReputationCache,
} from "./reputation-cache";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// In-memory cache for quick access (backed by IndexedDB)
const reputationCache = new Map<string, { data: AddressReputation; timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes - longer cache to avoid 429 errors

// Function to clear reputation cache (for debugging)
export async function clearReputationCache() {
  reputationCache.clear();
  await clearReputationCacheDB();
  console.log('[Reputation] Cache cleared (memory + IndexedDB)');
}

// Clear incorrect cache on startup (addresses with same scores - likely bug)
// This runs once when module loads to fix cached incorrect data
if (typeof window !== 'undefined') {
  // Only run in browser
  (async () => {
    try {
      await clearIncorrectReputationCache();
    } catch (e) {
      // Ignore errors on startup
    }
  })();
}

// Rate limiting: minimum interval between requests
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests (to avoid 429 errors)

/**
 * Validates a Solana address
 * @param address - Address to validate
 * @returns true if valid, false otherwise
 */
export function validateSolanaAddress(address: string): boolean {
  if (!address || typeof address !== "string") {
    return false;
  }

  // Trim whitespace
  const trimmed = address.trim();
  if (!trimmed) {
    return false;
  }

  // Solana addresses are base58 encoded and typically 32-44 characters long
  // But some edge cases might be shorter, so we check with PublicKey first
  // Minimum length check (base58 addresses are at least 32 chars, but some formats might be shorter)
  if (trimmed.length < 25 || trimmed.length > 44) {
    return false;
  }

  try {
    // Try to create PublicKey - this is the most reliable validation
    new PublicKey(trimmed);
    return true;
  } catch (error) {
    // Log error for debugging
    console.warn('[Validation] Invalid Solana address:', trimmed, error);
    return false;
  }
}

/**
 * Resolves a .sol domain name to a Solana address
 * @param name - .sol domain name (e.g., "example.sol")
 * @param connection - Solana connection (optional, will use default if not provided)
 * @returns Resolved address or null if not found
 */
export async function resolveSNS(
  name: string,
  connection?: any
): Promise<string | null> {
  if (!name.endsWith(".sol")) {
    return null;
  }

  try {
    // Lazy import to avoid issues with polyfills during module load
    const { getDomainKeySync, NameRegistryState } = await import("@solana/spl-name-service");
    const { pubkey } = getDomainKeySync(name);
    if (!connection) {
      // For basic resolution, return the pubkey
      // Full resolution requires connection to retrieve owner
      return pubkey.toBase58();
    }

    try {
      const registry = await NameRegistryState.retrieve(connection, pubkey);
      return registry.owner.toBase58();
    } catch (err) {
      // If retrieval fails, return the domain pubkey as fallback
      return pubkey.toBase58();
    }
  } catch (error) {
    console.error("Error resolving SNS:", error);
    return null;
  }
}

/**
 * Calculates similarity between two addresses using Levenshtein distance
 * @param address1 - First address
 * @param address2 - Second address
 * @returns Number of character differences
 */
export function calculateAddressSimilarity(
  address1: string,
  address2: string
): number {
  if (!address1 || !address2) {
    return Infinity;
  }

  return leven(address1, address2);
}

/**
 * Formats an address for display (truncates to first 4 and last 4 characters)
 * @param address - Full address
 * @returns Formatted address (e.g., "So11...abcd")
 */
export function formatAddress(address: string): string {
  if (!address || address.length <= 8) {
    return address;
  }

  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Formats an amount with decimals
 * @param amount - Amount in smallest unit (lamports for SOL)
 * @param decimals - Number of decimals
 * @param token - Token symbol (optional)
 * @returns Formatted string (e.g., "0.123 SOL")
 */
export function formatAmount(
  amount: number | string,
  decimals: number = 9,
  token?: string
): string {
  const numAmount =
    typeof amount === "string" ? parseFloat(amount) : amount;
  const divisor = Math.pow(10, decimals);
  const formatted = (numAmount / divisor).toFixed(decimals);

  // Remove trailing zeros
  const trimmed = parseFloat(formatted).toString();

  return token ? `${trimmed} ${token}` : trimmed;
}

/**
 * Counts the number of transfers between two addresses in transaction history
 * @param userAddress - User's address
 * @param contactAddress - Contact's address
 * @param history - Array of transaction history items
 * @returns Number of transfers
 */
export function getTransferCount(
  userAddress: string,
  contactAddress: string,
  history: Array<{
    from?: string;
    to?: string;
    direction?: "in" | "out";
  }>
): number {
  if (!history || history.length === 0) {
    return 0;
  }

  const contactAddrLower = contactAddress.toLowerCase();
  const filtered = history.filter((tx) => {
    if (tx.direction === "out") {
      return tx.to?.toLowerCase() === contactAddrLower;
    } else if (tx.direction === "in") {
      return tx.from?.toLowerCase() === contactAddrLower;
    }
    return false;
  });

  if (filtered.length > 0 && filtered.length !== history.length) {
    console.log(`[getTransferCount] Filtered ${filtered.length} transactions from ${history.length} total for contact ${contactAddress.substring(0, 8)}...`);
  }

  return filtered.length;
}

/**
 * Formats a timestamp to relative time (e.g., "2 hours ago")
 * @param timestamp - Unix timestamp in seconds or milliseconds
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp: number | string): string {
  const now = Date.now();
  const ts = typeof timestamp === "string" ? parseInt(timestamp) : timestamp;
  // Handle both seconds and milliseconds
  const date = ts < 10000000000 ? ts * 1000 : ts;
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  if (hours > 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (minutes > 0) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  return "Just now";
}

/**
 * Checks if an address is similar to any contact address (anti-phishing)
 * @param address - Address to check
 * @param contacts - Array of contact addresses
 * @param threshold - Maximum allowed difference (default: 3)
 * @returns Object with isSimilar flag and matched contact info
 */
export function checkAddressSimilarity(
  address: string,
  contacts: Array<{ address: string; name?: string }>,
  threshold: number = 3
): {
  isSimilar: boolean;
  matchedContact?: { address: string; name?: string };
  difference?: number;
} {
  for (const contact of contacts) {
    const difference = calculateAddressSimilarity(address, contact.address);
    if (difference <= threshold) {
      return {
        isSimilar: true,
        matchedContact: contact,
        difference,
      };
    }
  }

  return { isSimilar: false };
}

/**
 * Address reputation information
 */
export interface AddressReputation {
  score: number; // 0-100
  age: number; // days
  transactionCount: number;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  ataTokens: string[]; // USDC, USDT, etc.
  recentActivity: number; // transactions in last 14 days
  similarityRisk: number; // 0-100 (lower is better)
  recommendation: "safe" | "caution" | "high-risk";
  details: {
    ageScore: number;
    txScore: number;
    ataScore: number;
    incomingScore: number;
    activityScore: number;
    similarityScore: number;
  };
}

/**
 * Calculates address reputation score using Solscan HTML parsing
 * @param address - Solana address to check
 * @param contacts - Array of saved contacts for similarity check
 * @returns AddressReputation object
 */
export async function calculateAddressReputation(
  address: string,
  contacts: Array<{ address: string; name?: string }> = []
): Promise<AddressReputation> {
  // Rate limiting: ensure minimum interval between requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  // Check in-memory cache first
  const cached = reputationCache.get(address);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('[Reputation] Using in-memory cached data for:', address, 'score:', cached.data.score);
    return cached.data;
  }

  // Check IndexedDB cache
  const dbCached = await getReputationFromCache(address);
  if (dbCached) {
    console.log('[Reputation] Using IndexedDB cached data for:', address, 'score:', dbCached.score);
    // Also update in-memory cache
    reputationCache.set(address, { data: dbCached, timestamp: Date.now() });
    return dbCached;
  }
  
  // Clear old cache entries that might have 0 scores
  if (cached && cached.data.score === 0 && cached.data.transactionCount === 0 && cached.data.age === 0) {
    // Only clear if it's truly empty (might be a new address)
    const cacheAge = Date.now() - cached.timestamp;
    if (cacheAge > 60 * 1000) { // Only clear if cache is older than 1 minute
      console.log('[Reputation] Clearing old cached 0/0 result for:', address);
      reputationCache.delete(address);
      await removeReputationFromCache(address);
    } else {
      // Return cached 0 result if it's recent (address might really be new)
      return cached.data;
    }
  }

  try {
    let age = 0;
    let transactionCount = 0;
    let hasIncoming = false;
    let hasOutgoing = false;
    let recentActivity = 0;
    const ataTokens: string[] = [];

    // Fetch data from Solscan HTML parsing
    console.log('[Reputation] Fetching from Solscan HTML for:', address);
    const solscanData = await parseSolscanAccount(address);

    if (solscanData) {
      console.log('[Reputation] Solscan data received:', solscanData);
      
      // Extract data from Solscan response
      transactionCount = solscanData.transactionCount || 0;
      hasIncoming = solscanData.hasIncoming ?? false;
      hasOutgoing = solscanData.hasOutgoing ?? false;
      recentActivity = solscanData.recentActivity || 0;

      // Calculate age from first transaction time
      if (solscanData.firstTxTime) {
        const firstTxDate = new Date(solscanData.firstTxTime * 1000);
        const now = new Date();
        age = Math.floor((now.getTime() - firstTxDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Check for ATA tokens from token holdings
      if (solscanData.tokenHoldings && Array.isArray(solscanData.tokenHoldings)) {
        for (const token of solscanData.tokenHoldings) {
          if ((token.symbol === 'USDC' || token.symbol === 'USDT') && parseFloat(token.balance || "0") > 0) {
            ataTokens.push(token.symbol);
          }
        }
      }
    } else {
      console.warn('[Reputation] Solscan parser returned no data for address:', address);
      // If parser failed, try to use expired cache if available
      const cached = reputationCache.get(address);
      if (cached) {
        console.log('[Reputation] Using expired cache due to parser failure');
        return cached.data;
      }
      // Otherwise continue with default values
    }

    // Check similarity with saved contacts
    const similarityCheck = checkAddressSimilarity(address, contacts, 3);
    const similarityRisk = similarityCheck.isSimilar ? 50 : 0;

    // Calculate scores
    const ageScore = age >= 90 ? 30 : age >= 30 ? 20 : age >= 7 ? 10 : 0;
    const txScore = transactionCount >= 20 ? 25 : transactionCount >= 10 ? 15 : transactionCount >= 5 ? 10 : transactionCount >= 2 ? 5 : 0;
    const ataScore = ataTokens.length > 0 ? 10 : 0;
    const incomingScore = hasIncoming ? 10 : 0;
    const activityScore = recentActivity >= 5 ? 10 : recentActivity >= 2 ? 5 : 0;
    const similarityScore = similarityRisk === 0 ? 15 : similarityRisk <= 20 ? 10 : similarityRisk <= 40 ? 5 : 0;

    const totalScore = ageScore + txScore + ataScore + incomingScore + activityScore + similarityScore;
    const finalScore = Math.min(100, Math.max(0, totalScore));

    let recommendation: "safe" | "caution" | "high-risk";
    if (finalScore >= 60) {
      recommendation = "safe";
    } else if (finalScore >= 30) {
      recommendation = "caution";
    } else {
      recommendation = "high-risk";
    }

    const result: AddressReputation = {
      score: finalScore,
      age,
      transactionCount,
      hasIncoming,
      hasOutgoing,
      ataTokens,
      recentActivity,
      similarityRisk,
      recommendation,
      details: {
        ageScore,
        txScore,
        ataScore,
        incomingScore,
        activityScore,
        similarityScore,
      },
    };

    console.log('[Reputation] Calculated reputation for', address, ':', {
      score: finalScore,
      age,
      transactionCount,
      hasIncoming,
      hasOutgoing,
      ataTokens,
      recentActivity,
      source: 'Solscan HTML Parser'
    });

    // Save to both in-memory and IndexedDB cache
    reputationCache.set(address, { data: result, timestamp: Date.now() });
    await saveReputationToCache(address, result);
    
    return result;
  } catch (error) {
    console.error("Error calculating address reputation:", error);
    
    // Check in-memory cache as fallback
    const cached = reputationCache.get(address);
    if (cached) {
      console.log(`[Reputation] Returning in-memory cached reputation due to error for ${address}`);
      return cached.data;
    }

    // Check IndexedDB cache as fallback
    try {
      const dbCached = await getReputationFromCache(address);
      if (dbCached) {
        console.log(`[Reputation] Returning IndexedDB cached reputation due to error for ${address}`);
        // Also update in-memory cache
        reputationCache.set(address, { data: dbCached, timestamp: Date.now() });
        return dbCached;
      }
    } catch (dbError) {
      console.warn('[Reputation] Error reading from IndexedDB cache:', dbError);
    }
    
    // Return default low score on error if no cache
    const defaultResult: AddressReputation = {
      score: 0,
      age: 0,
      transactionCount: 0,
      hasIncoming: false,
      hasOutgoing: false,
      ataTokens: [],
      recentActivity: 0,
      similarityRisk: 100,
      recommendation: "high-risk",
      details: {
        ageScore: 0,
        txScore: 0,
        ataScore: 0,
        incomingScore: 0,
        activityScore: 0,
        similarityScore: 0,
      },
    };
    
    // Cache the default result too (with shorter duration)
    reputationCache.set(address, { data: defaultResult, timestamp: Date.now() });
    await saveReputationToCache(address, defaultResult).catch(() => {
      // Ignore save errors for default result
    });
    
    return defaultResult;
  }
}


