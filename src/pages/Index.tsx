import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { SearchBar } from "@/components/SearchBar";
import { ContactGrid } from "@/components/ContactGrid";
import { AddContactModal } from "@/components/modals/AddContactModal";
import { SendFundsModal } from "@/components/modals/SendFundsModal";
import { Contact } from "@/components/ContactCard";
import { useContacts } from "@/hooks/useContacts";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";

const Index = () => {
  const { publicKey, connected } = useWallet();
  const { contacts, loading, addContact, editContact, removeContact, refreshContacts, updateContactsTxCount } = useContacts();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedToken, setSelectedToken] = useState<"SOL" | "USDC" | "USDT">("SOL");
  const [editContactData, setEditContactData] = useState<Contact | null>(null);
  
  // Track if txCount has been updated for current page visit
  const hasUpdatedTxCountRef = useRef(false);
  const lastLocationRef = useRef(location.pathname);
  const isUpdatingRef = useRef(false);

  // Reset update flag when navigating to this page from another page
  useEffect(() => {
    if (location.pathname === "/" && lastLocationRef.current !== location.pathname) {
      hasUpdatedTxCountRef.current = false;
    }
    lastLocationRef.current = location.pathname;
  }, [location.pathname]);

  // Update txCount for all contacts when page loads (same logic as History page)
  useEffect(() => {
    if (!connected || !publicKey || contacts.length === 0) {
      hasUpdatedTxCountRef.current = false;
      return;
    }

    // Don't update if already updated or currently updating
    if (hasUpdatedTxCountRef.current || isUpdatingRef.current) {
      return;
    }

    isUpdatingRef.current = true;
    console.log(`[Index] Updating txCount for ${contacts.length} contacts`);
    
    updateContactsTxCount().then(() => {
      hasUpdatedTxCountRef.current = true;
      isUpdatingRef.current = false;
      console.log(`[Index] Finished updating txCount`);
    }).catch((error) => {
      console.error("[Index] Error updating txCount:", error);
      isUpdatingRef.current = false;
    });
  }, [connected, publicKey, contacts.length, updateContactsTxCount, location.pathname]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleAddContact = () => {
    setEditContactData(null);
    setIsAddModalOpen(true);
  };

  const handleContactClick = (contact: Contact) => {
    setEditContactData(contact);
    setIsAddModalOpen(true);
  };

  const handleSend = (contact: Contact, token: "SOL" | "USDC" | "USDT") => {
    if (!connected) {
      toast.error("Please connect your wallet first");
      return;
    }
    setSelectedContact(contact);
    setSelectedToken(token);
    setIsSendModalOpen(true);
  };

  const handleSaveContact = async (contactData: Omit<Contact, "id" | "transactions" | "sent" | "received" | "txCount" | "lastAmount">) => {
    try {
      if (editContactData) {
      // Update existing contact
        await editContact(editContactData.id, contactData);
        toast.success("Contact updated successfully");
    } else {
      // Add new contact
        await addContact(contactData);
        toast.success("Contact added successfully");
      }
      setIsAddModalOpen(false);
      setEditContactData(null);
      await refreshContacts();
    } catch (error) {
      console.error("Error saving contact:", error);
      toast.error("Failed to save contact");
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      await removeContact(contactId);
      setIsAddModalOpen(false);
      setEditContactData(null);
      await refreshContacts();
    } catch (error) {
      console.error("Error deleting contact:", error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <Header onToggleSidebar={() => setSidebarOpen(true)} />

      <div className="flex flex-1">
        {/* Sidebar */}
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)}
          onImportComplete={refreshContacts}
        />

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Contact Book Title */}
          <div className="text-center mb-4 sm:mb-5 lg:mb-6 pt-4 sm:pt-5 lg:pt-6 animate-fade-in">
            <h1
              className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold gradient-text animate-glow-pulse px-4"
              style={{
                letterSpacing: "0.05em",
                fontFamily: "Verdana, sans-serif",
              }}
            >
              CONTACT BOOK
            </h1>
          </div>

          {/* Wallet Connection Warning */}
          {!connected && (
            <div className="px-4 sm:px-5 lg:px-6 mb-4 sm:mb-5 lg:mb-6">
              <div className="glass-panel-subtle border border-warning/30 rounded-xl p-3 sm:p-4 animate-fade-in-glow">
                <p className="text-xs sm:text-sm text-foreground">
                  <span className="font-semibold">Connect your wallet</span> to view transaction history and send funds.
                </p>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="px-4 sm:px-5 lg:px-6 mb-4 sm:mb-5 lg:mb-6">
            <SearchBar onSearch={handleSearch} />
          </div>

          {/* Contact Grid */}
          <ContactGrid
            contacts={contacts}
            searchQuery={searchQuery}
            loading={loading}
            onSend={handleSend}
            onContactClick={handleContactClick}
            onAddContact={handleAddContact}
          />
        </main>
      </div>

      {/* Modals */}
      <AddContactModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditContactData(null);
        }}
        onSave={handleSaveContact}
        onDelete={editContactData ? handleDeleteContact : undefined}
        editContact={editContactData}
      />
      {selectedContact && (
      <SendFundsModal
        isOpen={isSendModalOpen}
          onClose={() => {
            setIsSendModalOpen(false);
            setSelectedContact(null);
          }}
        contact={selectedContact}
        initialToken={selectedToken}
          onSuccess={refreshContacts}
      />
      )}
    </div>
  );
};

export default Index;
