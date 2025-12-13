import { Wallet, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSolBalance } from "@/lib/wallet";
import { getCluster, getClusterName } from "@/lib/solana";
import { formatAddress } from "@/lib/utils";
import { useState, useEffect } from "react";

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header = ({ onToggleSidebar }: HeaderProps) => {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { balance, loading: balanceLoading } = useSolBalance();
  const cluster = getCluster();
  const clusterName = getClusterName(cluster);
  
  const [showTrustText, setShowTrustText] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 705;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateVisibility = () => {
      const width = window.innerWidth;
      setShowTrustText(width >= 705);
    };

    // Установить начальное значение сразу
    updateVisibility();

    // Также проверить после небольшой задержки (на случай если window.innerWidth еще не готов)
    const timeoutId = setTimeout(updateVisibility, 0);

    // Слушаем resize события
    window.addEventListener("resize", updateVisibility);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  const handleConnect = () => {
    setVisible(true);
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <header className="h-[64px] sm:h-[72px] lg:h-[84px] glass-panel-subtle border-b border-border/30 px-3 sm:px-4 lg:px-6 flex items-center justify-between animate-fade-in-glow">
      {/* Logo */}
      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 sm:p-2 rounded-lg hover:bg-primary/10 transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {showTrustText && (
          <h1 className="text-xl font-semibold gradient-text logo-pulse px-2 min-w-0 break-words">
            Send and receive money only to those you trust.
          </h1>
        )}
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 flex-shrink-0">
        {/* Network Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="glass"
              size="sm"
              className={`px-2 sm:px-3 lg:px-4 text-xs sm:text-sm ${
                cluster === "devnet"
                  ? "border-accent/50 text-accent"
                  : "border-primary/50 text-primary"
              }`}
            >
              <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                cluster === "devnet" ? "bg-accent" : "bg-primary"
              }`} />
              <span className="hidden sm:inline">{clusterName}</span>
              <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 ml-0.5 sm:ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="glass-panel border-border/30 bg-popover">
            <DropdownMenuItem
              className="hover:bg-accent/10 cursor-pointer"
              disabled
            >
              <span className="w-2 h-2 rounded-full bg-accent mr-2" />
              {clusterName} (configured in .env)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Wallet Button */}
        {connected && publicKey ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
          <Button variant="glow" size="sm" className="font-mono text-[10px] sm:text-xs px-2 sm:px-3">
            <Wallet className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{formatAddress(publicKey.toBase58())} • </span>
                {balanceLoading ? "..." : balance?.toFixed(4) || "0"} <span className="hidden sm:inline">SOL</span>
          </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="glass-panel border-border/30 bg-popover">
              <DropdownMenuItem
                onClick={handleDisconnect}
                className="hover:bg-destructive/10 cursor-pointer text-destructive"
              >
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="premium" size="sm" onClick={handleConnect} className="px-2 sm:px-3 text-xs sm:text-sm">
            <Wallet className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Connect Wallet</span>
            <span className="sm:hidden">Connect</span>
          </Button>
        )}
      </div>
    </header>
  );
};
