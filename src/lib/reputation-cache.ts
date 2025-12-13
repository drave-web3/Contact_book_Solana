/**
 * Reputation Cache Storage
 * Stores address reputation data in IndexedDB via localforage
 * File: All_reputation (JSON format)
 */

import localforage from "localforage";
import { AddressReputation } from "./utils";

// Initialize localforage for reputation cache
const reputationStore = localforage.createInstance({
  name: "wallet-contacts",
  storeName: "reputation",
  description: "Address reputation cache data",
});

const STORAGE_KEY = "All_reputation";

export interface ReputationCacheEntry {
  address: string;
  reputation: AddressReputation;
  timestamp: number;
}

export interface ReputationCacheData {
  [address: string]: ReputationCacheEntry;
}

/**
 * Loads all reputation data from cache
 */
export async function loadReputationCache(): Promise<ReputationCacheData> {
  try {
    const data = await reputationStore.getItem<ReputationCacheData>(STORAGE_KEY);
    return data || {};
  } catch (error) {
    console.error('[Reputation Cache] Error loading cache:', error);
    return {};
  }
}

/**
 * Saves reputation data for an address
 */
export async function saveReputationToCache(
  address: string,
  reputation: AddressReputation
): Promise<void> {
  try {
    const cache = await loadReputationCache();
    cache[address] = {
      address,
      reputation,
      timestamp: Date.now(),
    };
    await reputationStore.setItem(STORAGE_KEY, cache);
    console.log('[Reputation Cache] Saved reputation for:', address);
  } catch (error) {
    console.error('[Reputation Cache] Error saving cache:', error);
  }
}

/**
 * Gets reputation data for an address from cache
 */
export async function getReputationFromCache(
  address: string
): Promise<AddressReputation | null> {
  try {
    const cache = await loadReputationCache();
    const entry = cache[address];
    
    if (!entry) {
      return null;
    }

    // Check if cache is still valid (30 minutes)
    const CACHE_DURATION = 30 * 60 * 1000;
    const age = Date.now() - entry.timestamp;
    
    if (age > CACHE_DURATION) {
      console.log('[Reputation Cache] Cache expired for:', address);
      return null;
    }

    console.log('[Reputation Cache] Loaded from cache for:', address);
    return entry.reputation;
  } catch (error) {
    console.error('[Reputation Cache] Error reading cache:', error);
    return null;
  }
}

/**
 * Clears all reputation cache
 */
export async function clearReputationCache(): Promise<void> {
  try {
    await reputationStore.removeItem(STORAGE_KEY);
    console.log('[Reputation Cache] Cache cleared');
  } catch (error) {
    console.error('[Reputation Cache] Error clearing cache:', error);
  }
}

/**
 * Clears reputation for addresses with incorrect data (same score for all)
 * This helps fix issues where all addresses got the same cached data
 */
export async function clearIncorrectReputationCache(): Promise<void> {
  try {
    const cache = await loadReputationCache();
    const addresses = Object.keys(cache);
    
    // Find addresses with same score (likely incorrect data)
    const scoreCounts: { [score: number]: string[] } = {};
    addresses.forEach(addr => {
      const score = cache[addr]?.reputation?.score || 0;
      if (!scoreCounts[score]) {
        scoreCounts[score] = [];
      }
      scoreCounts[score].push(addr);
    });
    
    // If more than 2 addresses have the same score, clear them
    let clearedCount = 0;
    for (const [score, addrs] of Object.entries(scoreCounts)) {
      if (addrs.length > 2 && parseInt(score) > 0) {
        console.log(`[Reputation Cache] Clearing ${addrs.length} addresses with same score ${score}`);
        addrs.forEach(addr => {
          delete cache[addr];
          clearedCount++;
        });
      }
    }
    
    if (clearedCount > 0) {
      await reputationStore.setItem(STORAGE_KEY, cache);
      console.log(`[Reputation Cache] Cleared ${clearedCount} incorrect cache entries`);
    }
  } catch (error) {
    console.error('[Reputation Cache] Error clearing incorrect cache:', error);
  }
}

/**
 * Removes reputation for a specific address
 */
export async function removeReputationFromCache(address: string): Promise<void> {
  try {
    const cache = await loadReputationCache();
    delete cache[address];
    await reputationStore.setItem(STORAGE_KEY, cache);
    console.log('[Reputation Cache] Removed reputation for:', address);
  } catch (error) {
    console.error('[Reputation Cache] Error removing from cache:', error);
  }
}

