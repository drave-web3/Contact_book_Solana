import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, SolflareWalletAdapter, BackpackWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { useMemo, useState, useEffect } from "react";
import { getRpcUrl, getCluster } from "@/lib/solana";
import ClientWalletProvider from "@/components/providers/WalletProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import History from "./pages/History";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css";

function useWallets() {
  // Get network from cluster
  const cluster = getCluster();
  const network = useMemo(() => {
    if (cluster === "mainnet-beta") {
      return WalletAdapterNetwork.Mainnet;
    } else if (cluster === "devnet") {
      return WalletAdapterNetwork.Devnet;
    } else {
      return WalletAdapterNetwork.Testnet;
    }
  }, [cluster]);

  const [wallets, setWallets] = useState(() => [new PhantomWalletAdapter({ network })]);

  useEffect(() => {
    // Load Solflare and Backpack adapters
    Promise.all([
      import("@solana/wallet-adapter-wallets")
        .then((mod) => {
          try {
            return new mod.SolflareWalletAdapter({ network });
          } catch (e) {
            console.warn("Solflare adapter not available:", e);
            return null;
          }
        }),
      import("@solana/wallet-adapter-wallets")
        .then((mod) => {
          try {
            // Check if BackpackWalletAdapter exists and is a constructor
            if (mod.BackpackWalletAdapter && typeof mod.BackpackWalletAdapter === 'function') {
              return new mod.BackpackWalletAdapter({ network });
            }
            return null;
          } catch (e) {
            console.warn("Backpack adapter not available:", e);
            return null;
          }
        }),
    ])
      .then(([solflare, backpack]) => {
        const wallets = [new PhantomWalletAdapter({ network })];
        if (solflare) wallets.push(solflare);
        if (backpack) wallets.push(backpack);
        setWallets(wallets);
      })
      .catch((error) => {
        console.warn("Failed to load wallet adapters:", error);
        // Keep only Phantom if loading fails
        setWallets([new PhantomWalletAdapter({ network })]);
      });
  }, [network]);

  return wallets;
}

const App = () => {
  const wallets = useWallets();
  const endpoint = useMemo(() => getRpcUrl(), []);

  return (
    <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
        <ConnectionProvider endpoint={endpoint}>
          <ClientWalletProvider wallets={wallets}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/settings" element={<Settings />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
          </ClientWalletProvider>
        </ConnectionProvider>
  </QueryClientProvider>
    </ErrorBoundary>
);
};

export default App;
