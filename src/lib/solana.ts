import { Connection, clusterApiUrl } from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

export type Cluster = "devnet" | "mainnet-beta" | "testnet";

/**
 * Gets the current Solana cluster from environment variables or localStorage
 * @returns Cluster name (defaults to devnet)
 */
export function getCluster(): Cluster {
  // Check localStorage first (user preference)
  const stored = localStorage.getItem("solana_cluster") as Cluster;
  if (stored && ["devnet", "mainnet-beta", "testnet"].includes(stored)) {
    return stored;
  }
  
  // Fallback to environment variable
  const cluster = import.meta.env.VITE_SOLANA_CLUSTER as Cluster;
  return cluster || "devnet";
}

/**
 * Gets the RPC URL from environment or defaults to cluster API URL
 * @returns RPC URL string
 */
export function getRpcUrl(): string {
  const customRpc = import.meta.env.VITE_SOLANA_RPC_URL;
  if (customRpc) {
    return customRpc;
  }

  const cluster = getCluster();
  // clusterApiUrl accepts "devnet" | "mainnet-beta" | "testnet" as strings
  // Map our cluster values to what clusterApiUrl expects
  if (cluster === "mainnet-beta") {
    return clusterApiUrl("mainnet-beta");
  } else if (cluster === "devnet") {
    return clusterApiUrl("devnet");
  } else {
    return clusterApiUrl("testnet");
  }
}

/**
 * Creates a new Solana connection instance
 * @returns Connection instance
 */
export function getConnection(): Connection {
  const rpcUrl = getRpcUrl();
  return new Connection(rpcUrl, "confirmed");
}

/**
 * Gets the explorer URL for a transaction signature
 * @param signature - Transaction signature
 * @param cluster - Cluster name (optional, uses current cluster if not provided)
 * @returns Explorer URL
 */
export function getExplorerUrl(
  signature: string,
  cluster?: Cluster
): string {
  const currentCluster = cluster || getCluster();

  // Use Solscan for both devnet and mainnet
  if (currentCluster === "mainnet-beta") {
    return `https://solscan.io/tx/${signature}`;
  } else if (currentCluster === "devnet") {
    return `https://solscan.io/tx/${signature}?cluster=devnet`;
  } else {
    return `https://solscan.io/tx/${signature}?cluster=testnet`;
  }
}

/**
 * Gets the explorer URL for an address
 * @param address - Solana address
 * @param cluster - Cluster name (optional, uses current cluster if not provided)
 * @returns Explorer URL
 */
export function getExplorerAddressUrl(
  address: string,
  cluster?: Cluster
): string {
  const currentCluster = cluster || getCluster();

  if (currentCluster === "mainnet-beta") {
    return `https://solscan.io/account/${address}`;
  } else if (currentCluster === "devnet") {
    return `https://solscan.io/account/${address}?cluster=devnet`;
  } else {
    return `https://solscan.io/account/${address}?cluster=testnet`;
  }
}

/**
 * Gets a human-readable cluster name
 * @param cluster - Cluster name
 * @returns Human-readable string
 */
export function getClusterName(cluster?: Cluster): string {
  const currentCluster = cluster || getCluster();
  switch (currentCluster) {
    case "mainnet-beta":
      return "Mainnet";
    case "devnet":
      return "Devnet";
    case "testnet":
      return "Testnet";
    default:
      return "Unknown";
  }
}

