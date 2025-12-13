import { useState, useEffect, useCallback, useRef } from "react";
import {
  Contact,
  createContact,
  updateContact,
  deleteContact,
  listContacts,
  getContact,
} from "@/lib/storage";
import { useWallet } from "@solana/wallet-adapter-react";
import { getTransferCount } from "@/lib/utils";
import { fetchTransactionHistory } from "@/lib/helius";

interface UseContactsOptions {
  password?: string;
  signature?: Uint8Array;
  autoLoad?: boolean;
}

export function useContacts(options: UseContactsOptions = {}) {
  const { password, signature, autoLoad = true } = options;
  const { publicKey } = useWallet();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isEnrichingRef = useRef(false);
  const enrichedContactIdsRef = useRef<Set<string>>(new Set());
  const lastEnrichedContactIdsRef = useRef<string>(""); // Track which contacts were enriched

  const loadContacts = useCallback(async () => {
    if (!autoLoad) return;

    setLoading(true);
    setError(null);

    try {
      const loadedContacts = await listContacts(password, signature);
      // Reset enriched set when contacts are reloaded to allow re-enrichment
      enrichedContactIdsRef.current.clear();
      lastEnrichedContactIdsRef.current = "";
      isEnrichingRef.current = false;
      console.log(`[useContacts] Loaded ${loadedContacts.length} contacts, reset enrichment state`);
      setContacts(loadedContacts);
    } catch (err) {
      setError(err as Error);
      console.error("Error loading contacts:", err);
    } finally {
      setLoading(false);
    }
  }, [password, signature, autoLoad]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const addContact = useCallback(
    async (contactData: Omit<Contact, "id" | "createdAt" | "updatedAt">) => {
      try {
        const newContact = await createContact(
          contactData,
          password,
          signature
        );
        setContacts((prev) => [...prev, newContact]);
        return newContact;
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [password, signature]
  );

  const editContact = useCallback(
    async (
      id: string,
      updates: Partial<Omit<Contact, "id" | "createdAt">>
    ) => {
      try {
        const updated = await updateContact(id, updates, password, signature);
        setContacts((prev) =>
          prev.map((c) => (c.id === id ? updated : c))
        );
        return updated;
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [password, signature]
  );

  const removeContact = useCallback(async (id: string) => {
    try {
      await deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, []);

  const getContactById = useCallback(
    async (id: string) => {
      try {
        return await getContact(id, password, signature);
      } catch (err) {
        setError(err as Error);
        return null;
      }
    },
    [password, signature]
  );

  const refreshContacts = useCallback(() => {
    return loadContacts();
  }, [loadContacts]);

  // Update txCount for all contacts by fetching transaction history (same logic as History page)
  const updateContactsTxCount = useCallback(async () => {
    if (!publicKey || contacts.length === 0) {
      return;
    }

    console.log(`[updateContactsTxCount] Starting update for ${contacts.length} contacts`);
    const walletAddress = publicKey.toBase58();

    // Process contacts in parallel batches (same as History page)
    const BATCH_SIZE = 2;
    const BATCH_DELAY = 1000;

    const updatedContacts: Contact[] = [];

    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const batchPromises = batch.map(async (contact) => {
        try {
          const history = await fetchTransactionHistory(
            walletAddress,
            contact.address
          );

          const txCount = getTransferCount(
            walletAddress,
            contact.address,
            history
          );

          const lastTx = history[0];
          const lastAmount = lastTx
            ? `${(lastTx.amount / Math.pow(10, lastTx.decimals)).toFixed(4)} ${lastTx.token}`
            : undefined;

          console.log(`[updateContactsTxCount] ${contact.name}: txCount=${txCount} (was: ${contact.txCount ?? 'undefined'})`);

          return {
            ...contact,
            txCount,
            lastAmount,
          };
        } catch (error) {
          console.error(`[updateContactsTxCount] Error for ${contact.name}:`, error);
          return contact; // Return unchanged on error
        }
      });

      const batchResults = await Promise.all(batchPromises);
      updatedContacts.push(...batchResults);

      // Add delay between batches
      if (i + BATCH_SIZE < contacts.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Update contacts state using functional update to ensure we have latest state
    setContacts(prev => {
      const updatedMap = new Map(updatedContacts.map(c => [c.id, c]));
      return prev.map(contact => {
        const updated = updatedMap.get(contact.id);
        if (updated && updated.txCount !== contact.txCount) {
          console.log(`[updateContactsTxCount] Updating ${contact.name}: txCount ${contact.txCount ?? 'undefined'} -> ${updated.txCount}`);
        }
        return updated || contact;
      });
    });
    console.log(`[updateContactsTxCount] Updated ${updatedContacts.length} contacts`);
  }, [publicKey, contacts]);

  // Enrich contacts with transaction counts - only once per wallet connection
  const enrichContacts = useCallback(async (contactsToEnrich: Contact[]) => {
    if (!publicKey || contactsToEnrich.length === 0) return contactsToEnrich;

    const enriched: Contact[] = [];
    
    // Process contacts sequentially with delay to prevent rate limiting
    const ENRICHMENT_DELAY = 800; // Reduced delay for faster processing

    for (let i = 0; i < contactsToEnrich.length; i++) {
      const contact = contactsToEnrich[i];
      
      // Skip if already enriched
      if (enrichedContactIdsRef.current.has(contact.id)) {
        enriched.push(contact);
        continue;
      }
      
      // Add delay between requests (except for the first one)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, ENRICHMENT_DELAY));
      }

      try {
        const history = await fetchTransactionHistory(
          publicKey.toBase58(),
          contact.address
        );

        const txCount = getTransferCount(
          publicKey.toBase58(),
          contact.address,
          history
        );

        console.log(`[enrichContacts] ${contact.name}: found ${history.length} transactions, txCount=${txCount} (was: ${contact.txCount ?? 'undefined'})`);

        const lastTx = history[0];
        const lastAmount = lastTx
          ? `${(lastTx.amount / Math.pow(10, lastTx.decimals)).toFixed(4)} ${lastTx.token}`
          : undefined;

        enriched.push({
          ...contact,
          txCount,
          lastAmount,
        });
        
        // Mark as enriched
        enrichedContactIdsRef.current.add(contact.id);
      } catch (err) {
        console.error(`[enrichContacts] Error enriching contact ${contact.name}:`, err);
        enriched.push(contact);
      }
    }

    return enriched;
  }, [publicKey]);

  // Reset enrichment state when wallet changes
  useEffect(() => {
    if (publicKey) {
      // Reset enrichment state when wallet connects/changes
      enrichedContactIdsRef.current.clear();
      lastEnrichedContactIdsRef.current = "";
      isEnrichingRef.current = false;
      console.log(`[useContacts] Wallet connected/changed, reset enrichment state`);
    }
  }, [publicKey?.toBase58()]);

  // Old enrichment logic disabled - now using updateContactsTxCount from Index.tsx
  // This ensures txCount is updated only when Contacts page loads, with proper caching

  return {
    contacts,
    loading,
    error,
    addContact,
    editContact,
    removeContact,
    getContactById,
    refreshContacts,
    updateContactsTxCount,
  };
}

