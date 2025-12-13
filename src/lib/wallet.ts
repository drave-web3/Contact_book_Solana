import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { useMemo, useEffect, useState } from "react";
import { getConnection } from "./solana";

export interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  symbol?: string;
  name?: string;
}

/**
 * Hook to get wallet balance in SOL
 */
export function useSolBalance() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setBalance(null);
      return;
    }

    setLoading(true);
    setError(null);

    connection
      .getBalance(publicKey)
      .then((lamports) => {
        setBalance(lamports / LAMPORTS_PER_SOL);
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, [connected, publicKey, connection]);

  return { balance, loading, error };
}

/**
 * Hook to get SPL token balances
 */
export function useTokenBalances(mints?: string[]) {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!connected || !publicKey || !mints || mints.length === 0) {
      setBalances([]);
      return;
    }

    setLoading(true);
    setError(null);

    const fetchBalances = async () => {
      try {
        const tokenBalances: TokenBalance[] = [];

        for (const mint of mints) {
          try {
            const mintPubkey = new PublicKey(mint);
            const ata = await getAssociatedTokenAddress(
              mintPubkey,
              publicKey,
              false
            );

            const account = await getAccount(connection, ata);
            const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
            const decimals =
              (mintInfo.value?.data as any)?.parsed?.info?.decimals || 9;

            tokenBalances.push({
              mint,
              balance: Number(account.amount),
              decimals,
            });
          } catch (err: any) {
            // Token account doesn't exist or other error, skip silently
            // Only log if it's not a TokenAccountNotFoundError or 429 rate limit
            if (err?.name !== 'TokenAccountNotFoundError' && err?.message?.includes('429') === false) {
              console.warn(`Failed to fetch balance for ${mint}:`, err);
            }
          }
        }

        setBalances(tokenBalances);
        setLoading(false);
      } catch (err) {
        setError(err as Error);
        setLoading(false);
      }
    };

    fetchBalances();
  }, [connected, publicKey, connection, mints]);

  return { balances, loading, error };
}

/**
 * Hook to get common token balances (USDC, USDT)
 */
export function useCommonTokenBalances() {
  // Devnet token mints
  const devnetUSDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
  const devnetUSDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

  // Mainnet token mints
  const mainnetUSDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const mainnetUSDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

  const cluster = import.meta.env.VITE_SOLANA_CLUSTER || "devnet";
  const mints =
    cluster === "mainnet-beta"
      ? [mainnetUSDC, mainnetUSDT]
      : [devnetUSDC, devnetUSDT];

  return useTokenBalances(mints);
}

/**
 * Gets SOL balance for an address
 */
export async function getSolBalance(address: string): Promise<number> {
  const connection = getConnection();
  const publicKey = new PublicKey(address);
  const lamports = await connection.getBalance(publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Gets SPL token balance for an address
 */
export async function getTokenBalance(
  address: string,
  mint: string
): Promise<TokenBalance | null> {
  try {
    const connection = getConnection();
    const ownerPubkey = new PublicKey(address);
    const mintPubkey = new PublicKey(mint);

    const ata = await getAssociatedTokenAddress(
      mintPubkey,
      ownerPubkey,
      false
    );

    const account = await getAccount(connection, ata);
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    const decimals =
      (mintInfo.value?.data as any)?.parsed?.info?.decimals || 9;

    return {
      mint,
      balance: Number(account.amount),
      decimals,
    };
  } catch (error) {
    console.error("Error getting token balance:", error);
    return null;
  }
}

/**
 * Gets token mint address by symbol
 */
export function getTokenMintAddress(
  token: "SOL" | "USDC" | "USDT",
  cluster?: string
): string | null {
  if (token === "SOL") return null;

  const currentCluster = cluster || import.meta.env.VITE_SOLANA_CLUSTER || "devnet";
  
  // Devnet token mints
  const devnetUSDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
  const devnetUSDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

  // Mainnet token mints
  const mainnetUSDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const mainnetUSDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

  if (currentCluster === "mainnet-beta") {
    return token === "USDC" ? mainnetUSDC : mainnetUSDT;
  } else {
    return token === "USDC" ? devnetUSDC : devnetUSDT;
  }
}

/**
 * Checks if recipient has Associated Token Account
 */
export async function hasAssociatedTokenAccount(
  recipientAddress: string,
  mintAddress: string
): Promise<boolean> {
  try {
    const connection = getConnection();
    const recipientPubkey = new PublicKey(recipientAddress);
    const mintPubkey = new PublicKey(mintAddress);

    const ata = await getAssociatedTokenAddress(
      mintPubkey,
      recipientPubkey,
      false
    );

    await getAccount(connection, ata);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Gets token decimals
 */
export async function getTokenDecimals(mintAddress: string): Promise<number> {
  try {
    const connection = getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
    return (mintInfo.value?.data as any)?.parsed?.info?.decimals || 9;
  } catch (error) {
    console.error("Error getting token decimals:", error);
    return 9; // Default
  }
}

/**
 * Hook to get formatted balance string
 */
export function useFormattedBalance() {
  const { balance } = useSolBalance();
  const { balances: tokenBalances } = useCommonTokenBalances();

  const formatted = useMemo(() => {
    const sol = balance !== null ? `${balance.toFixed(4)} SOL` : "0 SOL";
    const tokens = tokenBalances.map((tb) => {
      const amount = tb.balance / Math.pow(10, tb.decimals);
      const symbol = tb.symbol || "TOKEN";
      return `${amount.toFixed(2)} ${symbol}`;
    });

    return { sol, tokens };
  }, [balance, tokenBalances]);

  return formatted;
}

/**
 * Hook wrapper for wallet state
 */
export function useWalletState() {
  const wallet = useWallet();
  const { balance, loading: balanceLoading } = useSolBalance();

  return {
    ...wallet,
    balance,
    balanceLoading,
    isReady: wallet.connected && !balanceLoading,
  };
}

