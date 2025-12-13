import { ContactCard, Contact } from "./ContactCard";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ContactGridProps {
  contacts: Contact[];
  searchQuery: string;
  loading?: boolean;
  onSend: (contact: Contact, token: "SOL" | "USDC" | "USDT") => void;
  onContactClick: (contact: Contact) => void;
  onAddContact: () => void;
}

export const ContactGrid = ({
  contacts,
  searchQuery,
  loading = false,
  onSend,
  onContactClick,
  onAddContact,
}: ContactGridProps) => {
  const filteredContacts = contacts.filter((contact) => {
    const query = searchQuery.toLowerCase();
    return (
      contact.name.toLowerCase().includes(query) ||
      contact.address.toLowerCase().includes(query) ||
      contact.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
      {/* Add Contact Button */}
      <div className="flex justify-end mb-4 sm:mb-5 lg:mb-6 animate-fade-in-glow" style={{ animationDelay: "0.15s" }}>
        <Button variant="glow" onClick={onAddContact} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          Add Contact
        </Button>
      </div>

      {/* Loading State */}
      {loading && (
        <div 
          className="grid gap-3 sm:gap-4 lg:gap-5 xl:gap-6 justify-items-center"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 155px))',
            justifyContent: 'center',
          }}
        >
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="w-full max-w-[155px] h-[180px] sm:h-[202px] rounded-2xl" />
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && (
      <div 
        className="grid gap-3 sm:gap-4 lg:gap-5 xl:gap-6 justify-items-center stagger-children"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 155px))',
          justifyContent: 'center',
        }}
      >
        {filteredContacts.map((contact) => (
          <ContactCard
            key={contact.id}
            contact={contact}
            onSend={onSend}
            onClick={onContactClick}
          />
        ))}
      </div>
      )}

      {/* Empty State */}
      {!loading && filteredContacts.length === 0 && (
        <div className="text-center py-8 sm:py-12 lg:py-16 animate-fade-in-glow px-4">
          <div className="text-4xl sm:text-5xl lg:text-6xl mb-3 sm:mb-4">🔍</div>
          <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">No contacts found</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {searchQuery
              ? "Try adjusting your search query"
              : "Add your first contact to get started"}
          </p>
        </div>
      )}
    </div>
  );
};
