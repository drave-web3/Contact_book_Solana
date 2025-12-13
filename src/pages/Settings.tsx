import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCluster, getClusterName, type Cluster } from "@/lib/solana";
import { toast } from "sonner";
import { Trash2, RefreshCw } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Settings = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentCluster, setCurrentCluster] = useState<Cluster>(getCluster());
  const { contacts, removeContact } = useContacts();
  const [clearDataOpen, setClearDataOpen] = useState(false);

  const handleClusterChange = (value: string) => {
    const newCluster = value as Cluster;
    setCurrentCluster(newCluster);
    
    // Store in localStorage
    localStorage.setItem("solana_cluster", newCluster);
    
    toast.success(`Network changed to ${getClusterName(newCluster)}. Please refresh the page.`);
  };

  const handleClearAllData = async () => {
    try {
      // Clear all contacts
      for (const contact of contacts) {
        await removeContact(contact.id);
      }
      
      // Clear localStorage
      localStorage.clear();
      
      toast.success("All data cleared successfully");
      setClearDataOpen(false);
      
      // Reload page
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error("Error clearing data:", error);
      toast.error("Failed to clear data");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header onToggleSidebar={() => setSidebarOpen(true)} />
      <div className="flex flex-1">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex-1 flex flex-col overflow-auto p-4 sm:p-5 lg:p-6">
          <div className="max-w-full sm:max-w-2xl lg:max-w-3xl mx-auto w-full">
            <h1 className="text-2xl sm:text-3xl font-bold gradient-text mb-4 sm:mb-5 lg:mb-6">Settings</h1>

            {/* Network Settings */}
            <Card className="glass-panel mb-4 sm:mb-5 lg:mb-6">
              <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
                <CardTitle className="text-lg sm:text-xl">Network Settings</CardTitle>
                <CardDescription className="text-sm">
                  Choose which Solana network to connect to
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="space-y-2">
                  <Label htmlFor="cluster">Network</Label>
                  <Select
                    value={currentCluster}
                    onValueChange={handleClusterChange}
                  >
                    <SelectTrigger id="cluster" className="glass-panel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="devnet">Devnet (Test Network)</SelectItem>
                      <SelectItem value="mainnet-beta">Mainnet (Production)</SelectItem>
                      <SelectItem value="testnet">Testnet</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Current: {getClusterName(currentCluster)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Data Management */}
            <Card className="glass-panel mb-4 sm:mb-5 lg:mb-6">
              <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
                <CardTitle className="text-lg sm:text-xl">Data Management</CardTitle>
                <CardDescription className="text-sm">
                  Manage your contacts and application data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/30">
                  <div>
                    <p className="font-medium">Total Contacts</p>
                    <p className="text-sm text-muted-foreground">
                      {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                <AlertDialog open={clearDataOpen} onOpenChange={setClearDataOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="w-full"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear All Data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="glass-panel">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete all your contacts
                        and clear all local storage data. The page will reload after clearing.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearAllData}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Clear All Data
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>

            {/* About */}
            <Card className="glass-panel">
              <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
                <CardTitle className="text-lg sm:text-xl">About</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4 sm:px-6 pb-4 sm:pb-6">
                <p className="text-sm text-muted-foreground">
                  Solana Contact Book - Manage your Solana contacts and transaction history
                </p>
                <p className="text-xs text-muted-foreground">
                  Version 1.0.0
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Settings;

