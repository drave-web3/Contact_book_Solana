import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ExternalLink, CheckCircle2, Loader2 } from "lucide-react";
import { Contact } from "@/components/ContactCard";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { formatAmount, checkAddressSimilarity, calculateAddressReputation, type AddressReputation } from "@/lib/utils";
import { getConnection, getExplorerUrl, getCluster } from "@/lib/solana";
import {
  getTokenMintAddress,
  hasAssociatedTokenAccount,
  getTokenDecimals,
  getTokenBalance,
} from "@/lib/wallet";
import { toast } from "sonner";
import { useContacts } from "@/hooks/useContacts";
import { AddressReputationCard } from "@/components/AddressReputationCard";

interface SendFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  initialToken?: "SOL" | "USDC" | "USDT";
  onSuccess?: () => void;
}

type Step = "input" | "review" | "sending" | "success" | "error";

export const SendFundsModal = ({ 
  isOpen, 
  onClose, 
  contact, 
  initialToken = "SOL",
  onSuccess
}: SendFundsModalProps) => {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const { contacts } = useContacts();
  const [step, setStep] = useState<Step>("input");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<"SOL" | "USDC" | "USDT">(initialToken);
  const [memo, setMemo] = useState("");
  const [fee, setFee] = useState<number | null>(null);
  const [similarityWarning, setSimilarityWarning] = useState<{
    isSimilar: boolean;
    matchedContact?: { address: string; name?: string };
  }>({ isSimilar: false });
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [needsATA, setNeedsATA] = useState(false);
  const [ataFee, setAtaFee] = useState<number | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [reputation, setReputation] = useState<AddressReputation | null>(null);
  const [checkingReputation, setCheckingReputation] = useState(false);

  useEffect(() => {
    if (isOpen && contact) {
      setStep("input");
      setAmount("");
      setMemo("");
      setFee(null);
      setError(null);
      setTxSignature(null);
      setTokenBalance(null);
      setNeedsATA(false);
      setAtaFee(null);
      setToken(initialToken || (contact.preferredToken as "SOL" | "USDC" | "USDT") || "SOL");
      checkSimilarity();
      if (token !== "SOL") {
        checkTokenBalance();
        checkATA();
      } else {
        estimateFee();
      }
    }
  }, [isOpen, contact?.address, token]);

  useEffect(() => {
    if (isOpen && contact && step === "input") {
      checkReputation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contact?.address, step, contacts.length]);

  const checkReputation = async () => {
    if (!contact) return;
    
    // Don't show loading if reputation already exists
    const hasExistingReputation = reputation !== null;
    
    if (!hasExistingReputation) {
      setCheckingReputation(true);
    }
    // Don't reset reputation to null - keep previous value
    try {
      const rep = await calculateAddressReputation(contact.address, contacts);
      setReputation(rep);
    } catch (error) {
      console.error("Error checking reputation:", error);
      // Don't set reputation to 0 on error - keep previous value
      // If no reputation exists, it will remain null (handled by UI)
    } finally {
      setCheckingReputation(false);
    }
  };

  const checkSimilarity = () => {
    if (!contact) return;
    // Filter out the current contact from the list to avoid false positives
    const otherContacts = contacts
      .filter(c => c.id !== contact.id)
      .map(c => ({ address: c.address, name: c.name }));
    const check = checkAddressSimilarity(
      contact.address,
      otherContacts,
      3
    );
    setSimilarityWarning(check);
  };

  const estimateFee = async () => {
    if (!publicKey || !amount || parseFloat(amount) <= 0 || !contact) {
      setFee(null);
      return;
    }

    try {
      const transaction = new Transaction();
      const recipient = new PublicKey(contact.address);
      const amountLamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

      transaction.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipient,
          lamports: amountLamports,
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const fee = await transaction.getEstimatedFee(connection);
      setFee(fee || 5000);
    } catch (err) {
      console.error("Error estimating fee:", err);
      setFee(5000);
    }
  };

  useEffect(() => {
    if (amount && token === "SOL" && contact) {
      estimateFee();
    } else if (amount && token !== "SOL" && contact) {
      checkTokenBalance();
      checkATA();
      estimateSPLFee();
    }
  }, [amount, token, contact]);

  const checkTokenBalance = async () => {
    if (!publicKey || token === "SOL" || !contact) return;

    setCheckingBalance(true);
    try {
      const mintAddress = getTokenMintAddress(token, getCluster());
      if (!mintAddress) {
        setError("Invalid token");
        return;
      }

      const balance = await getTokenBalance(publicKey.toBase58(), mintAddress);
      if (balance) {
        const amountInTokens = balance.balance / Math.pow(10, balance.decimals);
        setTokenBalance(amountInTokens);
      } else {
        setTokenBalance(0);
      }
    } catch (err) {
      console.error("Error checking token balance:", err);
      setTokenBalance(null);
    } finally {
      setCheckingBalance(false);
    }
  };

  const checkATA = async () => {
    if (!publicKey || token === "SOL" || !contact) return;

    try {
      const mintAddress = getTokenMintAddress(token, getCluster());
      if (!mintAddress) return;

      const hasATA = await hasAssociatedTokenAccount(contact.address, mintAddress);
      setNeedsATA(!hasATA);
      
      if (!hasATA) {
        setAtaFee(2039280); // in lamports
      } else {
        setAtaFee(null);
      }
    } catch (err) {
      console.error("Error checking ATA:", err);
    }
  };

  const estimateSPLFee = async () => {
    if (!publicKey || !amount || parseFloat(amount) <= 0 || token === "SOL" || !contact) {
      setFee(null);
      return;
    }

    try {
      const transaction = new Transaction();
      const recipient = new PublicKey(contact.address);
      const mintAddress = getTokenMintAddress(token, getCluster());
      
      if (!mintAddress) {
        setFee(5000);
        return;
      }

      const mintPubkey = new PublicKey(mintAddress);
      const decimals = await getTokenDecimals(mintAddress);
      const amountInSmallestUnit = Math.floor(parseFloat(amount) * Math.pow(10, decimals));

      const senderATA = await getAssociatedTokenAddress(
        mintPubkey,
        publicKey,
        false
      );

      const recipientATA = await getAssociatedTokenAddress(
        mintPubkey,
        recipient,
        false
      );

      const hasATA = await hasAssociatedTokenAccount(contact.address, mintAddress);
      
      if (!hasATA) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            recipientATA,
            recipient,
            mintPubkey
          )
        );
      }

      transaction.add(
        createTransferInstruction(
          senderATA,
          recipientATA,
          publicKey,
          amountInSmallestUnit
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const fee = await transaction.getEstimatedFee(connection);
      setFee(fee || 5000);
    } catch (err) {
      console.error("Error estimating SPL fee:", err);
      setFee(5000);
    }
  };

  const handleReview = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (token !== "SOL" && tokenBalance !== null) {
      const amountNum = parseFloat(amount);
      if (amountNum > tokenBalance) {
        setError(`Insufficient ${token} balance. You have ${tokenBalance.toFixed(4)} ${token}`);
        return;
      }
    }

    setError(null);
    setStep("review");
  };

  const handleConfirm = async () => {
    if (!publicKey || !signTransaction || !connected || !contact) {
      setError("Wallet not connected");
      return;
    }

    setStep("sending");
    setError(null);

    try {
      const transaction = new Transaction();
      const recipient = new PublicKey(contact.address);

      if (token === "SOL") {
        const amountLamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: recipient,
            lamports: amountLamports,
          })
        );
      } else {
        const mintAddress = getTokenMintAddress(token, getCluster());
        if (!mintAddress) {
          setError(`Invalid token: ${token}`);
          setStep("error");
          return;
        }

        const mintPubkey = new PublicKey(mintAddress);
        const decimals = await getTokenDecimals(mintAddress);
        const amountInSmallestUnit = Math.floor(parseFloat(amount) * Math.pow(10, decimals));

        const senderBalance = await getTokenBalance(publicKey.toBase58(), mintAddress);
        if (!senderBalance || senderBalance.balance < amountInSmallestUnit) {
          const balanceInTokens = senderBalance 
            ? senderBalance.balance / Math.pow(10, senderBalance.decimals)
            : 0;
          setError(`Insufficient ${token} balance. You have ${balanceInTokens.toFixed(4)} ${token}`);
          setStep("error");
          return;
        }

        const senderATA = await getAssociatedTokenAddress(
          mintPubkey,
          publicKey,
          false
        );

        const recipientATA = await getAssociatedTokenAddress(
          mintPubkey,
          recipient,
          false
        );

        const hasATA = await hasAssociatedTokenAccount(contact.address, mintAddress);
        if (!hasATA) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              recipientATA,
              recipient,
              mintPubkey
            )
          );
        }

        transaction.add(
          createTransferInstruction(
            senderATA,
            recipientATA,
            publicKey,
            amountInSmallestUnit
          )
        );
      }

      if (memo) {
        transaction.add({
          keys: [],
          programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
          data: Buffer.from(memo, "utf-8"),
        });
      }

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });

      setTxSignature(signature);

      toast.loading("Confirming transaction...", { id: "tx-confirm" });
      await connection.confirmTransaction(signature, "confirmed");

      toast.success("Transaction confirmed!", { id: "tx-confirm" });
      setStep("success");
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Error sending transaction:", err);
      
      let errorMessage = "Failed to send transaction";
      if (err.message) {
        if (err.message.includes("insufficient funds") || err.message.includes("0x1")) {
          errorMessage = "Insufficient funds. Please check your balance.";
        } else if (err.message.includes("User rejected")) {
          errorMessage = "Transaction was rejected by wallet";
        } else if (err.message.includes("network") || err.message.includes("timeout")) {
          errorMessage = "Network error. Please try again.";
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      setStep("error");
      toast.error(errorMessage, { id: "tx-confirm" });
    }
  };

  if (!contact) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-panel border-border/30 bg-popover/95 backdrop-blur-xl w-full max-w-full sm:max-w-md lg:max-w-lg m-0 sm:m-4 animate-scale-in max-h-[90vh] flex flex-col">
        {step === "input" && (
          <>
            <DialogHeader className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
              <DialogTitle className="text-lg sm:text-xl font-semibold gradient-text flex items-center gap-2 sm:gap-3">
                <span className="text-2xl sm:text-3xl">{contact.emoji}</span>
                <span className="truncate">Send to {contact.name}</span>
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={(e) => { e.preventDefault(); handleReview(); }} className="flex-1 overflow-y-auto space-y-4 sm:space-y-5 mt-2 sm:mt-4 px-4 sm:px-6 pb-4 sm:pb-6 custom-scrollbar">
              {/* Similarity Warning */}
              {similarityWarning.isSimilar && (
                <div className="glass-panel-subtle border-glow-warning/50 rounded-xl p-3 sm:p-4 glow-warning">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-glow-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-foreground">
                        Warning: Similar Address Detected
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This address is similar to {similarityWarning.matchedContact?.name || "a saved contact"}. Please verify before sending.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Recipient Address */}
              <div className="glass-panel-subtle rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">Recipient Address</p>
                <p className="font-mono text-xs sm:text-sm text-foreground break-all">{contact.address}</p>
              </div>

              {/* Address Reputation */}
              <AddressReputationCard
                reputation={reputation}
                loading={checkingReputation}
                address={contact.address}
              />

              {/* Token Selector */}
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Token</Label>
                <Select value={token} onValueChange={(v) => setToken(v as "SOL" | "USDC" | "USDT")}>
                  <SelectTrigger className="glass-panel-subtle border-border/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-panel border-border/30 bg-popover">
                    <SelectItem value="SOL">SOL</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                    <SelectItem value="USDT">USDT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-sm text-foreground flex justify-between">
                  <span>Amount</span>
                  {token !== "SOL" && tokenBalance !== null && (
                  <span className="text-xs text-muted-foreground">
                      Balance: {tokenBalance.toFixed(4)} {token}
                  </span>
                  )}
                </Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.000000001"
                  min="0"
                  className="glass-panel-subtle border-border/30 focus:border-primary/50"
                  disabled={checkingBalance}
                />
                {checkingBalance && (
                  <p className="text-xs text-muted-foreground">Checking balance...</p>
                )}
              </div>

              {/* Fee Estimation */}
              {fee && (
                <div className="glass-panel-subtle rounded-xl p-3 space-y-1">
                  <div className="text-sm text-muted-foreground">
                    Estimated fee: <span className="text-foreground font-semibold">{formatAmount(fee, 9, "SOL")}</span>
                  </div>
                  {needsATA && ataFee && (
                    <div className="text-xs text-warning bg-warning/10 p-2 rounded border border-warning/30">
                      ⚠️ Recipient doesn't have {token} account. Additional fee: ~{formatAmount(ataFee, 9, "SOL")} for account creation
                    </div>
                  )}
                </div>
              )}

              {/* Memo */}
              <div className="space-y-2">
                <Label htmlFor="memo" className="text-sm text-foreground">Memo (optional)</Label>
                <Input
                  id="memo"
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Add a note..."
                  className="glass-panel-subtle border-border/30 focus:border-primary/50"
                  maxLength={290}
                />
              </div>

              {error && (
                <div className="glass-panel-subtle border-destructive/50 rounded-xl p-3 bg-destructive/10">
                  <p className="text-sm text-destructive">{error}</p>
              </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 sticky bottom-0 bg-popover/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 pb-4 sm:pb-6">
                <Button type="button" variant="outline" onClick={onClose} className="w-full sm:flex-1">
                  Cancel
                </Button>
                <Button type="submit" variant="premium" className="w-full sm:flex-1">
                  Review →
                </Button>
              </div>
            </form>
          </>
        )}

        {step === "review" && (
          <>
            <DialogHeader className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
              <DialogTitle className="text-lg sm:text-xl font-semibold gradient-text">Review Transaction</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 sm:space-y-5 mt-2 sm:mt-4 px-4 sm:px-6 pb-4 sm:pb-6 custom-scrollbar">
              {/* Similarity Warning */}
              {similarityWarning.isSimilar && (
                <div className="glass-panel-subtle border-glow-warning/50 rounded-xl p-3 sm:p-4 glow-warning">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-glow-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-foreground">
                        Warning: Similar Address Detected
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This address is similar to {similarityWarning.matchedContact?.name || "a saved contact"}. Please verify before sending.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Review Details */}
              <div className="glass-panel-subtle rounded-xl p-3 sm:p-4 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-1">
                  <span className="text-xs sm:text-sm text-muted-foreground">Recipient:</span>
                  <span className="text-sm sm:text-base font-semibold text-foreground">{contact.name}</span>
                </div>
                <div className="flex justify-between items-start flex-col sm:flex-row gap-1 sm:gap-0">
                  <span className="text-xs sm:text-sm text-muted-foreground">Address:</span>
                  <span className="font-mono text-xs text-foreground">
                    {contact.address.slice(0, 8)}...{contact.address.slice(-8)}
                  </span>
                </div>
                <div className="flex justify-between items-center flex-wrap gap-1">
                  <span className="text-xs sm:text-sm text-muted-foreground">Amount:</span>
                  <span className="font-semibold gradient-text text-base sm:text-lg">
                    {amount} {token}
                  </span>
                </div>
                <div className="flex justify-between items-center flex-wrap gap-1">
                  <span className="text-xs sm:text-sm text-muted-foreground">Fee:</span>
                  <span className="text-xs sm:text-sm text-foreground">{fee ? formatAmount(fee, 9, "SOL") : "~0.000005 SOL"}</span>
                </div>
                {needsATA && ataFee && (
                  <div className="flex justify-between items-center text-warning flex-wrap gap-1">
                    <span className="text-xs sm:text-sm text-muted-foreground">ATA Creation Fee:</span>
                    <span className="text-xs sm:text-sm">~{formatAmount(ataFee, 9, "SOL")}</span>
                  </div>
                )}
                {token !== "SOL" && tokenBalance !== null && (
                  <div className="flex justify-between items-center flex-wrap gap-1">
                    <span className="text-xs sm:text-sm text-muted-foreground">Your {token} Balance:</span>
                    <span className="text-xs sm:text-sm text-foreground">{tokenBalance.toFixed(4)} {token}</span>
                  </div>
                )}
                {memo && (
                  <div className="flex justify-between items-start pt-2 border-t border-border/30 flex-col sm:flex-row gap-1">
                    <span className="text-xs sm:text-sm text-muted-foreground">Memo:</span>
                    <span className="text-foreground text-xs sm:text-sm max-w-xs sm:text-right break-words">{memo}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 sticky bottom-0 bg-popover/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 pb-4 sm:pb-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("input")}
                  className="w-full sm:flex-1"
                >
                  ← Back
                </Button>
                <Button
                  type="button"
                  variant="premium"
                  onClick={handleConfirm}
                  className="w-full sm:flex-1"
                >
                  Confirm & Sign
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "sending" && (
          <div className="text-center py-8 sm:py-12 px-4 sm:px-6">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="mt-4 text-foreground font-semibold">Sending transaction...</p>
            <p className="text-sm text-muted-foreground mt-2">Please confirm in your wallet</p>
          </div>
        )}

        {step === "success" && txSignature && (
          <div className="space-y-4 px-4 sm:px-6 py-4 sm:py-6">
            <div className="glass-panel-subtle border-success/50 rounded-xl p-4 sm:p-6 text-center bg-success/10">
              <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-success mx-auto mb-3 sm:mb-4" />
              <div className="text-lg sm:text-xl font-bold gradient-text mb-2">Transaction successful!</div>
              <p className="text-xs sm:text-sm text-muted-foreground">Your transaction has been confirmed on the blockchain</p>
            </div>
            <a
              href={getExplorerUrl(txSignature)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button variant="premium" className="w-full gap-2">
                View on Explorer
                <ExternalLink className="w-4 h-4" />
              </Button>
            </a>
            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4 px-4 sm:px-6 py-4 sm:py-6">
            <div className="glass-panel-subtle border-destructive/50 rounded-xl p-4 sm:p-6 bg-destructive/10">
              <div className="text-3xl sm:text-4xl mb-3">❌</div>
              <div className="text-base sm:text-lg font-bold text-destructive mb-2">Transaction Failed</div>
              <span className="text-xs sm:text-sm text-muted-foreground">{error || "Transaction failed"}</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("input")}
                className="w-full sm:flex-1"
              >
                Try Again
              </Button>
              <Button
                type="button"
                variant="premium"
                onClick={onClose}
                className="w-full sm:flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
