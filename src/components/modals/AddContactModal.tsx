import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock, Loader2, Trash2 } from "lucide-react";
import { Contact } from "@/components/ContactCard";
import { EmojiPicker } from "@/components/EmojiPicker";
import { validateSolanaAddress, resolveSNS, calculateAddressReputation, type AddressReputation } from "@/lib/utils";
import { getConnection } from "@/lib/solana";
import { toast } from "sonner";
import { AddressReputationCard } from "@/components/AddressReputationCard";
import { useContacts } from "@/hooks/useContacts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contact: Omit<Contact, "id" | "transactions" | "sent" | "received" | "txCount" | "lastAmount">) => Promise<void>;
  onDelete?: (contactId: string) => Promise<void>;
  editContact?: Contact | null;
}

export const AddContactModal = ({ isOpen, onClose, onSave, onDelete, editContact }: AddContactModalProps) => {
  const { contacts } = useContacts();
  const [name, setName] = useState(editContact?.name || "");
  const [emoji, setEmoji] = useState(editContact?.emoji || "😊");
  const [address, setAddress] = useState(editContact?.address || "");
  const [note, setNote] = useState(editContact?.note || "");
  const [tags, setTags] = useState(editContact?.tags?.join(", ") || "");
  const [preferredToken, setPreferredToken] = useState<"SOL" | "USDC" | "USDT">(
    (editContact?.preferredToken as "SOL" | "USDC" | "USDT") || "SOL"
  );
  const [addressError, setAddressError] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reputation, setReputation] = useState<AddressReputation | null>(null);
  const [checkingReputation, setCheckingReputation] = useState(false);
  const prevAddressRef = useRef<string>("");

  useEffect(() => {
    if (editContact) {
      const prevAddress = address;
      setName(editContact.name);
      setEmoji(editContact.emoji);
      setAddress(editContact.address);
      setNote(editContact.note || "");
      setTags(editContact.tags?.join(", ") || "");
      setPreferredToken((editContact.preferredToken as "SOL" | "USDC" | "USDT") || "SOL");
      // Only reset reputation if address changed
      if (prevAddress !== editContact.address) {
        setReputation(null);
        prevAddressRef.current = ""; // Reset ref to trigger reputation check
      }
    } else {
      resetForm();
    }
  }, [editContact, isOpen]);

  // Check reputation when address is valid and modal is open
  // Only check if address changed, not when other fields change
  useEffect(() => {
    if (isOpen && address && validateSolanaAddress(address)) {
      // Only check reputation if address actually changed
      if (prevAddressRef.current !== address) {
        prevAddressRef.current = address;
        checkReputation();
      }
    } else if (!isOpen) {
      // Only reset when modal closes, not when other fields change
      prevAddressRef.current = "";
      setReputation(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, address, contacts.length]);

  const checkReputation = async () => {
    if (!address || !validateSolanaAddress(address)) return;
    
    // Don't show loading if reputation already exists
    const hasExistingReputation = reputation !== null;
    
    if (!hasExistingReputation) {
      setCheckingReputation(true);
    }
    // Don't reset reputation to null - keep previous value
    try {
      const rep = await calculateAddressReputation(address, contacts);
      setReputation(rep);
    } catch (error) {
      console.error("Error checking reputation:", error);
      // Don't set reputation to 0 on error - keep previous value
      // If no reputation exists, it will remain null (handled by UI)
    } finally {
      setCheckingReputation(false);
    }
  };

  const handleAddressChange = async (value: string) => {
    setAddress(value);
    setAddressError("");

    if (!value) {
      setReputation(null);
      return;
    }

    // Check if it's a .sol domain
    if (value.endsWith(".sol")) {
      setIsResolving(true);
      try {
        const connection = getConnection();
        const resolved = await resolveSNS(value, connection);
        if (resolved) {
          setAddress(resolved);
          toast.success(`Resolved ${value} to ${resolved.slice(0, 4)}...${resolved.slice(-4)}`);
        } else {
          setAddressError("Could not resolve .sol domain");
        }
      } catch (error) {
        console.error("Error resolving SNS:", error);
        setAddressError("Error resolving .sol domain");
      } finally {
        setIsResolving(false);
      }
    } else {
      // Validate address
      if (!validateSolanaAddress(value)) {
        setAddressError("Invalid Solana address");
        setReputation(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressError("");

    // Final validation
    if (!validateSolanaAddress(address)) {
      setAddressError("Invalid Solana address");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
      name,
      emoji,
      address,
        note: note || undefined,
      preferredToken,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    resetForm();
    } catch (error) {
      console.error("Error saving contact:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    if (!editContact) {
    setName("");
    setEmoji("😊");
    setAddress("");
    setNote("");
    setTags("");
    setPreferredToken("SOL");
      setAddressError("");
    }
  };

  const handleDelete = async () => {
    if (!editContact || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(editContact.id);
      toast.success("Contact deleted successfully");
      setShowDeleteDialog(false);
      onClose();
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast.error("Failed to delete contact");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-panel border-border/30 bg-popover/95 backdrop-blur-xl w-full max-w-full sm:max-w-md lg:max-w-lg m-0 sm:m-4 animate-scale-in max-h-[90vh] sm:max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 pb-2 sm:pb-3 px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="text-lg sm:text-xl font-semibold gradient-text">
            {editContact ? "Edit Contact" : "Add New Contact"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 space-y-3 sm:space-y-3.5 custom-scrollbar">
          {/* Name and Emoji in one row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          {/* Name */}
            <div className="space-y-1.5">
            <Label htmlFor="name" className="text-sm text-foreground">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter contact name"
              className="glass-panel-subtle border-border/30 focus:border-primary/50 focus:glow-primary"
              required
            />
          </div>

          {/* Emoji Picker */}
            <div className="space-y-1.5">
            <Label className="text-sm text-foreground">Emoji</Label>
              <EmojiPicker selected={emoji} onSelect={setEmoji} />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="address" className="text-sm text-foreground">
              Wallet Address or .sol Domain
            </Label>
            <div className="relative">
            <Input
              id="address"
              value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
              placeholder="Enter address or .sol domain"
                className={`glass-panel-subtle border-border/30 focus:border-primary/50 font-mono text-sm ${
                  addressError ? "border-destructive" : ""
                }`}
              required
                disabled={isResolving}
              />
              {isResolving && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              )}
            </div>
            {addressError && (
              <p className="text-xs text-destructive">{addressError}</p>
            )}
          </div>

          {/* Address Reputation - only show if address is valid */}
          {address && validateSolanaAddress(address) && (
            <div className="py-1">
              <AddressReputationCard
                reputation={reputation}
                loading={checkingReputation}
                address={address}
              />
            </div>
          )}

          {/* Note (Encrypted) */}
          <div className="space-y-1.5">
            <Label htmlFor="note" className="text-sm text-foreground flex items-center gap-2">
              Note
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Lock className="w-3 h-3" /> Encrypted locally
              </span>
            </Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a private note..."
              className="glass-panel-subtle border-border/30 focus:border-primary/50"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="tags" className="text-sm text-foreground">Tags</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="friend, team, investor (comma-separated)"
              className="glass-panel-subtle border-border/30 focus:border-primary/50"
            />
          </div>

          {/* Preferred Token */}
          <div className="space-y-1.5 pb-2">
            <Label className="text-sm text-foreground">Preferred Token</Label>
            <Select value={preferredToken} onValueChange={setPreferredToken}>
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

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-3 pb-2 flex-shrink-0 sticky bottom-0 bg-popover/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6">
            {editContact && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                className="w-full sm:flex-1"
                disabled={isSubmitting || isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose} 
              className="w-full sm:flex-1"
              disabled={isSubmitting || isDeleting}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="premium" 
              className="w-full sm:flex-1"
              disabled={isSubmitting || isResolving || isDeleting}
            >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  editContact ? "Save Changes" : "Save Contact"
                )}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="glass-panel border-border/30 bg-popover/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{editContact?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
