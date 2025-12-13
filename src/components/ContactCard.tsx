import { Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo, useEffect } from "react";
import { useHistory } from "@/hooks/useHistory";
import { useWallet } from "@solana/wallet-adapter-react";
import { formatAddress, calculateAddressReputation, type AddressReputation } from "@/lib/utils";
import type { Contact as StorageContact } from "@/lib/storage";
import { useContacts } from "@/hooks/useContacts";
import { Shield } from "lucide-react";

export interface Contact extends Omit<StorageContact, "note"> {
  transactions?: number;
  sent?: number;
  received?: number;
}

interface ContactCardProps {
  contact: Contact;
  onSend: (contact: Contact, token: "SOL" | "USDC" | "USDT") => void;
  onClick: (contact: Contact) => void;
}

const tokens: ("SOL" | "USDC" | "USDT")[] = ["SOL", "USDC", "USDT"];

export const ContactCard = ({ contact, onSend, onClick }: ContactCardProps) => {
  const { publicKey } = useWallet();
  const { contacts } = useContacts();
  const [selectedToken, setSelectedToken] = useState<"SOL" | "USDC" | "USDT">(
    (contact.preferredToken as "SOL" | "USDC" | "USDT") || "SOL"
  );
  const [reputation, setReputation] = useState<AddressReputation | null>(null);
  const [checkingReputation, setCheckingReputation] = useState(false);

  // Get real transaction history stats - only load if wallet is connected
  // Disable autoLoad to prevent excessive API calls on every render
  const { stats, history } = useHistory({
    contactAddress: contact.address,
    autoLoad: false, // Disabled to prevent blocking - will load on demand if needed
    limit: 20, // Reduced from 50 to improve performance - we only need last sent/received
  });

  const txCount = contact.txCount || stats.transactionCount || 0;
  
  // Memoize sorted history to avoid recalculation on every render
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.timestamp - a.timestamp);
  }, [history]);

  const lastSentTx = useMemo(() => {
    return sortedHistory.find(tx => tx.direction === "out");
  }, [sortedHistory]);

  const lastReceivedTx = useMemo(() => {
    return sortedHistory.find(tx => tx.direction === "in");
  }, [sortedHistory]);
  
  const lastSentAmount = useMemo(() => {
    return lastSentTx 
      ? (lastSentTx.amount / Math.pow(10, lastSentTx.decimals)).toFixed(4)
      : null;
  }, [lastSentTx]);

  const lastReceivedAmount = useMemo(() => {
    return lastReceivedTx
      ? (lastReceivedTx.amount / Math.pow(10, lastReceivedTx.decimals)).toFixed(4)
      : null;
  }, [lastReceivedTx]);

  const shortAddress = formatAddress(contact.address);

  // Check reputation on mount and when contact changes with debounce
  useEffect(() => {
    if (!contact?.address) return;
    
    // Don't show loading if reputation already exists
    const hasExistingReputation = reputation !== null;
    
    const checkRep = async () => {
      if (!hasExistingReputation) {
        setCheckingReputation(true);
      }
      try {
        const rep = await calculateAddressReputation(contact.address, contacts);
        setReputation(rep);
      } catch (error) {
        console.error("Error checking reputation:", error);
        // Don't set reputation to null on error - keep previous value
        // If no reputation exists, it will remain null (handled by UI)
      } finally {
        setCheckingReputation(false);
      }
    };
    
    // Debounce reputation check by 300ms
    const timer = setTimeout(() => {
      checkRep();
    }, 300);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, contact.address, contacts.length]);

  const getScoreColor = (score: number) => {
    if (score >= 60) return "text-green-500";
    if (score >= 30) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div
      className="glass-panel rounded-2xl p-3 sm:p-4 w-full max-w-[155px] min-h-[195px] sm:h-[217px] flex flex-col card-hover cursor-pointer"
      onClick={() => onClick(contact)}
    >
      {/* Emoji and Name in one line, centered */}
      <div className="flex items-center justify-center gap-1.5 sm:gap-1.5 mb-1.5">
        <span className="text-xl sm:text-xl">{contact.emoji}</span>
        <h3 className="text-sm sm:text-xs font-bold text-foreground text-center truncate max-w-[120px] sm:max-w-[100px]">
          {contact.name}
        </h3>
      </div>

      {/* Transaction Count - centered, +2px font, bold */}
      <div className="flex justify-center mb-1.5">
        <div className="text-base sm:text-sm font-bold text-foreground" style={{ fontSize: '16px' }}>
          <span className="sm:hidden" style={{ fontSize: '16px' }}>{txCount}</span>
          <span className="hidden sm:inline" style={{ fontSize: '14px' }}>{txCount}</span>
        </div>
      </div>

      {/* Address */}
      <p className="text-xs sm:text-[10px] font-mono text-muted-foreground text-center mb-1.5">
        {shortAddress}
      </p>

      {/* Address Reputation */}
      <div className="mb-1.5">
        <div className="flex items-center justify-center gap-1 mb-0.5">
          <Shield className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-primary" />
          <span className="text-xs sm:text-[9px] font-semibold text-foreground">Address Reputation</span>
        </div>
        {checkingReputation ? (
          <div className="text-xs sm:text-[10px] text-muted-foreground text-center">Loading...</div>
        ) : reputation ? (
          <>
            <div className={`text-sm sm:text-[11px] font-bold text-center ${getScoreColor(reputation.score)}`}>
              {reputation.score}/100
            </div>
            <div className="text-xs sm:text-[9px] text-muted-foreground text-center mt-0.5 space-y-0.5">
              <div>Age: {reputation.age === 0 ? "<24 hours" : `${reputation.age} day${reputation.age !== 1 ? "s" : ""}`}</div>
              <div>Transactions: {reputation.transactionCount}</div>
            </div>
          </>
        ) : (
          <div className="text-xs sm:text-[10px] text-muted-foreground text-center">-</div>
        )}
      </div>

      {/* Transaction Stats */}
      <div className="flex flex-col gap-1 mb-1.5">
        {/* Last sent amount - orange background */}
        {lastSentAmount && (
          <div 
            className="text-xs sm:text-[10px] font-semibold text-center py-1 sm:py-0.5 px-2 sm:px-1 rounded"
            style={{
              background: "rgba(255, 165, 0, 0.3)",
              color: "#FFA500",
            }}
          >
            Sent: {lastSentAmount}
          </div>
        )}
        
        {/* Received amount - green background */}
        {lastReceivedAmount && (
          <div 
            className="text-xs sm:text-[10px] font-semibold text-center py-1 sm:py-0.5 px-2 sm:px-1 rounded"
            style={{
              background: "rgba(20, 241, 149, 0.3)",
              color: "#14F195",
            }}
          >
            Recv: {lastReceivedAmount}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-1.5 mt-auto" onClick={(e) => e.stopPropagation()}>
        {/* Token Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="glass" size="sm" className="flex-1 h-9 sm:h-7 text-xs sm:text-[10px] px-3 sm:px-2">
              {selectedToken}
              <ChevronDown className="w-3.5 h-3.5 sm:w-3 sm:h-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="glass-panel border-border/30 bg-popover min-w-[80px]">
            {tokens.map((token) => (
              <DropdownMenuItem
                key={token}
                onClick={() => setSelectedToken(token)}
                className="hover:bg-primary/10 cursor-pointer text-xs"
              >
                {token}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Send Button */}
        <Button
          variant="premium"
          size="sm"
          className="h-9 sm:h-7 px-3 sm:px-2 flex-shrink-0 min-w-[44px] sm:min-w-0"
          onClick={() => onSend(contact, selectedToken)}
        >
          <Send className="w-4 h-4 sm:w-3 sm:h-3" />
        </Button>
      </div>
    </div>
  );
};
