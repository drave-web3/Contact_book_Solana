import { useState, useRef } from "react";
import { exportContacts, importContacts } from "@/lib/storage";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Upload, Eye, EyeOff, Loader2 } from "lucide-react";

interface ImportExportProps {
  onImportComplete?: () => void;
}

export function ImportExport({ onImportComplete }: ImportExportProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!password) {
      toast.error("Please enter a password for encryption");
      return;
    }

    setIsExporting(true);
    try {
      const encryptedData = await exportContacts(password);
      const blob = new Blob([encryptedData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wallet-contacts-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Contacts exported successfully!");
      setPassword("");
      setIsOpen(false);
    } catch (error: any) {
      toast.error(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    if (!password) {
      toast.error("Please enter the password used for encryption");
      return;
    }

    setIsImporting(true);
    try {
      const text = await file.text();
      const count = await importContacts(text, password);
      toast.success(`Imported ${count} contact(s) successfully!`);
      setPassword("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setIsOpen(false);
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (error: any) {
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImport(file);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="glass" 
          size="sm" 
          className="w-12 h-12 lg:w-full lg:px-4 rounded-xl flex items-center justify-center lg:justify-start gap-3 transition-all duration-300 group relative mx-auto lg:mx-0 hover:bg-primary/10 text-muted-foreground hover:text-foreground"
        >
          <Download className="w-5 h-5" />
          <span className="hidden lg:block text-sm font-medium">Import/Export</span>
          {/* Tooltip for mobile */}
          <span className="absolute left-full ml-3 px-3 py-1.5 rounded-lg glass-panel text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none lg:hidden">
            Import/Export
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-panel border-border/30 bg-popover/95 backdrop-blur-xl max-w-md animate-scale-in">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold gradient-text">
            Import / Export Contacts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          <p className="text-sm text-muted-foreground">
            Backup your contacts or import from a previous backup. All data is encrypted with your password.
          </p>

          {/* Password Input */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm text-foreground">Encryption Password</Label>
            <div className="flex gap-2">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="flex-1 glass-panel-subtle border-border/30 focus:border-primary/50"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Export Button */}
          <Button
            type="button"
            variant="premium"
            onClick={handleExport}
            disabled={isExporting || isImporting || !password}
            className="w-full gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Contacts
              </>
            )}
          </Button>

          {/* Import Section */}
          <div className="space-y-2">
            <Label className="text-sm text-foreground">Import from File</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isExporting || isImporting || !password}
              className="w-full gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Choose File to Import
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

