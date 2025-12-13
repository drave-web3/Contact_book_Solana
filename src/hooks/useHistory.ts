import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  fetchTransactionHistory,
  TransactionHistoryItem,
} from "@/lib/helius";
import { formatAmount } from "@/lib/utils";

interface UseHistoryOptions {
  contactAddress?: string;
  limit?: number;
  autoLoad?: boolean;
}

interface HistoryStats {
  totalSent: number;
  totalReceived: number;
  totalSentFormatted: string;
  totalReceivedFormatted: string;
  transactionCount: number;
}

export function useHistory(options: UseHistoryOptions = {}) {
  const { contactAddress, limit = 20, autoLoad = true } = options;
  const { publicKey } = useWallet();
  const [history, setHistory] = useState<TransactionHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<HistoryStats>({
    totalSent: 0,
    totalReceived: 0,
    totalSentFormatted: "0",
    totalReceivedFormatted: "0",
    transactionCount: 0,
  });

  const loadHistory = useCallback(async () => {
    if (!publicKey || !contactAddress || !autoLoad) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const transactions = await fetchTransactionHistory(
        publicKey.toBase58(),
        contactAddress
      );

      // Apply limit
      const limited = transactions.slice(0, limit);
      setHistory(limited);

      // Calculate stats
      let totalSent = 0;
      let totalReceived = 0;

      for (const tx of transactions) {
        const amount = tx.amount / Math.pow(10, tx.decimals);
        if (tx.direction === "out") {
          totalSent += amount;
        } else {
          totalReceived += amount;
        }
      }

      // Format amounts (use the most common token or SOL)
      const mostCommonToken =
        transactions.find((tx) => tx.token === "SOL")?.token || "SOL";
      const decimals =
        transactions.find((tx) => tx.token === mostCommonToken)?.decimals || 9;

      setStats({
        totalSent,
        totalReceived,
        totalSentFormatted: formatAmount(
          totalSent * Math.pow(10, decimals),
          decimals,
          mostCommonToken
        ),
        totalReceivedFormatted: formatAmount(
          totalReceived * Math.pow(10, decimals),
          decimals,
          mostCommonToken
        ),
        transactionCount: transactions.length,
      });
    } catch (err) {
      setError(err as Error);
      console.error("Error loading history:", err);
    } finally {
      setLoading(false);
    }
  }, [publicKey, contactAddress, limit, autoLoad]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const refreshHistory = useCallback(() => {
    return loadHistory();
  }, [loadHistory]);

  const getTransactionsByToken = useCallback(
    (token: string) => {
      return history.filter((tx) => tx.token === token);
    },
    [history]
  );

  const getTransactionsByDirection = useCallback(
    (direction: "in" | "out") => {
      return history.filter((tx) => tx.direction === direction);
    },
    [history]
  );

  return {
    history,
    loading,
    error,
    stats,
    refreshHistory,
    getTransactionsByToken,
    getTransactionsByDirection,
  };
}

