import { PublicKey, Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { getConnection, getCluster } from "./solana";

export interface TransactionHistoryItem {
  signature: string;
  timestamp: number;
  direction: "in" | "out";
  from?: string;
  to?: string;
  amount: number;
  token: "SOL" | "USDC" | "USDT" | string;
  decimals: number;
  fee?: number;
  success: boolean;
}

interface CacheEntry {
  data: TransactionHistoryItem[];
  timestamp: number;
}

// In-memory cache with TTL (5 minutes)
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Throttle queue for rate limiting
interface ThrottleQueue {
  queue: Array<() => Promise<any>>;
  processing: boolean;
  lastRequestTime: number;
}

const THROTTLE_DELAY = 500; // 500ms between requests for faster processing while avoiding 429 errors

const throttleQueue: ThrottleQueue = {
  queue: [],
  processing: false,
  lastRequestTime: Date.now() - THROTTLE_DELAY, // Initialize to allow first request immediately
};

async function throttleRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    throttleQueue.queue.push(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    
    // Start processing queue if not already processing
    processThrottleQueue().catch(err => {
      console.error("[Throttle] Error in processThrottleQueue:", err);
    });
  });
}

async function processThrottleQueue() {
  if (throttleQueue.processing) {
    return;
  }
  
  if (throttleQueue.queue.length === 0) {
    return;
  }

  throttleQueue.processing = true;

  while (throttleQueue.queue.length > 0) {
    const now = Date.now();
    const timeSinceLastRequest = now - throttleQueue.lastRequestTime;

    // Ensure minimum delay between requests to prevent 429 errors
    if (timeSinceLastRequest < THROTTLE_DELAY) {
      const waitTime = THROTTLE_DELAY - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    const request = throttleQueue.queue.shift();
    if (request) {
      throttleQueue.lastRequestTime = Date.now();
      try {
        await request();
      } catch (error) {
        // Log error but continue processing queue
        console.error("[Throttle] Error processing request:", error);
      }
    } else {
      break; // Safety break to prevent infinite loop
    }
  }

  throttleQueue.processing = false;
  
  // If new requests were added while processing, process them
  if (throttleQueue.queue.length > 0) {
    processThrottleQueue().catch(err => {
      console.error("[Throttle] Error in recursive processThrottleQueue:", err);
    });
  }
}

/**
 * Wrapper for all RPC calls to ensure they go through throttle queue
 * This prevents 429 errors by ensuring all RPC requests are rate-limited
 */
async function throttledRpcCall<T>(
  fn: () => Promise<T>,
  description: string
): Promise<T> {
  return throttleRequest(async () => {
    try {
      const result = await fn();
      return result;
    } catch (error: any) {
      // If we get 429, wait longer and retry once (through throttle)
      if (error?.message?.includes('429') || error?.code === 429) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Retry through throttle to maintain rate limiting
        return await throttleRequest(async () => {
          return await fn();
        });
      }
      throw error;
    }
  });
}

/**
 * Fetches transaction history using RPC
 */
async function fetchRPCHistory(
  address: string,
  contactAddress: string
): Promise<TransactionHistoryItem[]> {
  const connection = getConnection();
  const publicKey = new PublicKey(address);
  const contactPubkey = new PublicKey(contactAddress);

  // Normalize addresses for comparison
  const userAddr = address.toLowerCase();
  const contactAddr = contactAddress.toLowerCase();

  try {
    console.log(`[fetchRPCHistory] Getting signatures for both addresses: ${address.substring(0, 8)}... and ${contactAddress.substring(0, 8)}...`);
    
    // Get signatures for BOTH addresses to find all transactions between them
    // This is critical because transactions initiated by the contact may not appear in user's signature list
    const [userSignatures, contactSignatures] = await Promise.all([
      throttledRpcCall(
        () => connection.getSignaturesForAddress(publicKey, { limit: 100 }),
        `Getting signatures for user ${address.substring(0, 8)}...`
      ),
      throttledRpcCall(
        () => connection.getSignaturesForAddress(contactPubkey, { limit: 100 }),
        `Getting signatures for contact ${contactAddress.substring(0, 8)}...`
      )
    ]);

    console.log(`[fetchRPCHistory] Found ${userSignatures.length} signatures for user, ${contactSignatures.length} for contact`);

    // Combine and deduplicate signatures by signature string
    const signatureMap = new Map<string, typeof userSignatures[0]>();
    for (const sig of userSignatures) {
      signatureMap.set(sig.signature, sig);
    }
    for (const sig of contactSignatures) {
      if (!signatureMap.has(sig.signature)) {
        signatureMap.set(sig.signature, sig);
      }
    }

    const signatures = Array.from(signatureMap.values()).sort((a, b) => {
      // Sort by blockTime descending (most recent first)
      const timeA = a.blockTime || 0;
      const timeB = b.blockTime || 0;
      return timeB - timeA;
    });

    console.log(`[fetchRPCHistory] Total unique signatures: ${signatures.length}`);

    const transactions: TransactionHistoryItem[] = [];

    // Process transactions SEQUENTIALLY (not in parallel) to prevent 429 errors
    // Process one at a time with minimal delays
    const batchSize = 1; // Process one transaction at a time
    const BATCH_DELAY = 500; // 500ms delay between transactions (reduced for faster processing)
    
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      
      // Process each transaction in batch SEQUENTIALLY (not Promise.all)
      for (const sig of batch) {
        // WRAP EACH RPC CALL IN THROTTLE
        const tx = await throttledRpcCall(
          () => connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          }),
          `Getting transaction ${sig.signature.substring(0, 8)}...`
        );
        
        // Process this transaction directly (no need for array)
        if (!tx || !tx.meta) continue;

        // Skip failed transactions
        if (tx.meta.err) continue;

        const txAddresses = new Set<string>();
        let solTransfer = 0;
        let direction: "in" | "out" | null = null;
        let fromAddress: string | undefined;
        let toAddress: string | undefined;
        let userIndex = -1;
        let contactIndex = -1;

        // Parse account keys
        if (tx.transaction.message.accountKeys) {
          for (const key of tx.transaction.message.accountKeys) {
            if (key.pubkey) {
              txAddresses.add(key.pubkey.toBase58().toLowerCase());
            }
          }
        }

        // Check if contact address is involved
        if (!txAddresses.has(contactAddr)) continue;
        
        console.log(`[fetchRPCHistory] Found transaction involving contact: ${tx.transaction.signatures[0]?.substring(0, 16)}...`);

        // Try to parse from instructions first
        let foundInInstructions = false;
        if (tx.transaction.message.instructions) {
          for (const ix of tx.transaction.message.instructions) {
            if ("parsed" in ix && ix.parsed) {
              const parsed = ix.parsed as any;

              // SOL transfer
              if (parsed.type === "transfer") {
                const from = parsed.info.source?.toLowerCase();
                const to = parsed.info.destination?.toLowerCase();
                const amount = parsed.info.lamports;

                if (
                  (from === userAddr && to === contactAddr) ||
                  (from === contactAddr && to === userAddr)
                ) {
                  direction = from === userAddr ? "out" : "in";
                  fromAddress = parsed.info.source;
                  toAddress = parsed.info.destination;
                  solTransfer = amount;
                  foundInInstructions = true;
                  break;
                }
              }
            }
          }
        }

        // If not found in instructions, try to parse from balance changes
        if (!foundInInstructions && tx.meta.preBalances && tx.meta.postBalances && tx.transaction.message.accountKeys) {
          const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey?.toBase58().toLowerCase());
          userIndex = accountKeys.indexOf(userAddr);
          contactIndex = accountKeys.indexOf(contactAddr);

          if (userIndex >= 0 && contactIndex >= 0) {
            const userPreBalance = tx.meta.preBalances[userIndex];
            const userPostBalance = tx.meta.postBalances[userIndex];
            const contactPreBalance = tx.meta.preBalances[contactIndex];
            const contactPostBalance = tx.meta.postBalances[contactIndex];

            const userChange = userPostBalance - userPreBalance;
            const contactChange = contactPostBalance - contactPreBalance;

            console.log(`[fetchRPCHistory] Balance changes - User: ${userChange / 1e9} SOL, Contact: ${contactChange / 1e9} SOL`);

            // Check if there's a transfer between user and contact
            if (userChange !== 0 && contactChange !== 0 && Math.abs(userChange) === Math.abs(contactChange)) {
              // User sent to contact
              if (userChange < 0 && contactChange > 0) {
                direction = "out";
                fromAddress = address;
                toAddress = contactAddress;
                solTransfer = Math.abs(userChange);
                foundInInstructions = true;
              }
              // User received from contact
              else if (userChange > 0 && contactChange < 0) {
                direction = "in";
                fromAddress = contactAddress;
                toAddress = address;
                solTransfer = Math.abs(userChange);
                foundInInstructions = true;
              }
            }
          }
        }

        if (foundInInstructions && solTransfer > 0) {
          console.log(`[fetchRPCHistory] Adding transaction: ${direction} ${(solTransfer / 1e9).toFixed(4)} SOL from ${fromAddress?.substring(0, 8)}... to ${toAddress?.substring(0, 8)}...`);
          transactions.push({
            signature: tx.transaction.signatures[0],
            timestamp: tx.blockTime
              ? tx.blockTime * 1000
              : Date.now(),
            direction,
            from: fromAddress,
            to: toAddress,
            amount: solTransfer,
            token: "SOL",
            decimals: 9,
            fee: tx.meta.fee || 0,
            success: true,
          });
        } else if (txAddresses.has(contactAddr)) {
          console.log(`[fetchRPCHistory] Transaction involves contact but no SOL transfer found. Parsed: ${foundInInstructions}, Amount: ${solTransfer}, UserIndex: ${userIndex >= 0 ? userIndex : 'N/A'}, ContactIndex: ${contactIndex >= 0 ? contactIndex : 'N/A'}`);
        }
      }
      
      // Add delay between batches to prevent rate limiting
      if (i + batchSize < signatures.length) {
        console.log(`[fetchRPCHistory] Waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    console.log(`[fetchRPCHistory] Total transactions found: ${transactions.length}`);
    return transactions.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("[fetchRPCHistory] Error fetching RPC history:", error);
    throw error;
  }
}

/**
 * Fetches transaction history between two addresses using RPC
 * Note: This function does NOT wrap in throttleRequest because fetchRPCHistory
 * already uses throttledRpcCall for all RPC operations internally.
 * Wrapping here would create nested throttle requests and block the queue.
 */
export async function fetchTransactionHistory(
  address: string,
  contactAddress: string
): Promise<TransactionHistoryItem[]> {
  const cacheKey = `${address}-${contactAddress}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();

  // Return cached data if still valid (including empty results to prevent repeated requests)
  // Check cache BEFORE adding to throttle queue to avoid unnecessary requests
  if (cached && now - cached.timestamp < CACHE_TTL) {
    console.log(`[fetchTransactionHistory] Using cached data for ${address.substring(0, 8)}... and ${contactAddress.substring(0, 8)}... (${cached.data.length} transactions)`);
    return cached.data;
  }

  // Call fetchRPCHistory directly - it already uses throttledRpcCall internally
  console.log(`[fetchTransactionHistory] Fetching transactions between ${address.substring(0, 8)}... and ${contactAddress.substring(0, 8)}...`);

  try {
    const transactions = await fetchRPCHistory(address, contactAddress);
    console.log(`[fetchTransactionHistory] RPC returned ${transactions.length} transactions`);

    // Cache the results (including empty arrays to prevent repeated requests)
    cache.set(cacheKey, {
      data: transactions,
      timestamp: Date.now(),
    });

    return transactions;
  } catch (error) {
    // Log RPC error for debugging
    console.error("[fetchTransactionHistory] RPC failed:", error);
    
    // Cache empty result to prevent repeated failed requests
    cache.set(cacheKey, {
      data: [],
      timestamp: Date.now(),
    });
    
    // Return empty array instead of throwing to prevent console spam
    return [];
  }
}

/**
 * Clears the transaction history cache
 */
export function clearHistoryCache(): void {
  cache.clear();
}

/**
 * Clears cache for a specific address pair
 */
export function clearHistoryCacheFor(
  address: string,
  contactAddress: string
): void {
  const cacheKey = `${address}-${contactAddress}`;
  cache.delete(cacheKey);
}

