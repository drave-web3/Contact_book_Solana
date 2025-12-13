import { useState, useEffect, useMemo, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { useWallet } from "@solana/wallet-adapter-react";
import { useContacts } from "@/hooks/useContacts";
import { formatAddress, formatAmount } from "@/lib/utils";
import { fetchTransactionHistory } from "@/lib/helius";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";

interface TransactionStats {
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  byToken: Record<string, { sent: number; received: number; count: number }>;
}

interface ContactTransaction {
  contactId: string;
  contactName: string;
  contactAddress: string;
  contactEmoji: string;
  stats: TransactionStats;
}

const History = () => {
  const { publicKey, connected } = useWallet();
  const { contacts } = useContacts();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contactTransactions, setContactTransactions] = useState<ContactTransaction[]>([]);
  const [overallStats, setOverallStats] = useState<TransactionStats>({
    totalSent: 0,
    totalReceived: 0,
    transactionCount: 0,
    byToken: {},
  });
  
  // Track if data has been loaded for current page visit
  const hasLoadedRef = useRef(false);
  const lastLocationRef = useRef(location.pathname);
  const isLoadingRef = useRef(false);

  // Reset load flag when navigating to this page from another page
  useEffect(() => {
    if (location.pathname === "/history" && lastLocationRef.current !== location.pathname) {
      hasLoadedRef.current = false;
    }
    lastLocationRef.current = location.pathname;
  }, [location.pathname]);

  // Fetch transaction history for all contacts
  useEffect(() => {
    if (!connected || !publicKey || contacts.length === 0) {
      setContactTransactions([]);
      setOverallStats({
        totalSent: 0,
        totalReceived: 0,
        transactionCount: 0,
        byToken: {},
      });
      hasLoadedRef.current = false;
      return;
    }

    // Don't fetch if already loaded or currently loading
    if (hasLoadedRef.current || isLoadingRef.current) {
      return;
    }

    const fetchAllHistory = async () => {
      isLoadingRef.current = true;
      setLoading(true);
      try {
        const walletAddress = publicKey.toBase58();
        const results: ContactTransaction[] = [];

        // Process each contact to get transaction history
        const contactStatsMap = new Map<string, TransactionStats>();

        // Process contacts in parallel batches for faster loading
        // Use small batches to avoid rate limiting
        const BATCH_SIZE = 2; // Process 2 contacts at a time (reduced to avoid 429 errors)
        const BATCH_DELAY = 1000; // 1 second between batches (reduced for faster loading)
        
        for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
          const batch = contacts.slice(i, i + BATCH_SIZE);
          
          // Process batch in parallel - fetchTransactionHistory has caching and throttling
          const batchPromises = batch.map(async (contact) => {
            try {
              const history = await fetchTransactionHistory(
                walletAddress,
                contact.address
              );
              return { contact, history };
            } catch (error) {
              console.error(`Error fetching history for contact ${contact.name}:`, error);
              return { contact, history: [] };
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          
          // Process results from batch
          for (const { contact, history } of batchResults) {
            if (history.length > 0) {
              // Initialize stats for this contact
              if (!contactStatsMap.has(contact.id)) {
                contactStatsMap.set(contact.id, {
                  totalSent: 0,
                  totalReceived: 0,
                  transactionCount: 0,
                  byToken: {},
                });
              }

              const stats = contactStatsMap.get(contact.id)!;

              // Process each transaction
              for (const tx of history) {
                if (!tx.success) continue;

                stats.transactionCount++;
                const amountInSol = tx.amount / Math.pow(10, tx.decimals);

                // Initialize token stats if needed
                if (!stats.byToken[tx.token]) {
                  stats.byToken[tx.token] = { sent: 0, received: 0, count: 0 };
                }

                if (tx.direction === "out") {
                  // Sent to contact
                  stats.totalSent += tx.amount;
                  stats.byToken[tx.token].sent += tx.amount;
                  stats.byToken[tx.token].count++;
                } else if (tx.direction === "in") {
                  // Received from contact
                  stats.totalReceived += tx.amount;
                  stats.byToken[tx.token].received += tx.amount;
                  stats.byToken[tx.token].count++;
                }
              }
            }
          }
          
          // Add delay between batches to prevent rate limiting
          if (i + BATCH_SIZE < contacts.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
          }
        }

        // Convert map to array
        for (const contact of contacts) {
          const stats = contactStatsMap.get(contact.id);
          if (stats && stats.transactionCount > 0) {
            results.push({
              contactId: contact.id,
              contactName: contact.name,
              contactAddress: contact.address,
              contactEmoji: contact.emoji,
              stats,
            });
          }
        }

        setContactTransactions(results);

        // Calculate overall stats
        const overall: TransactionStats = {
          totalSent: 0,
          totalReceived: 0,
          transactionCount: 0,
          byToken: {},
        };

        for (const result of results) {
          overall.totalSent += result.stats.totalSent;
          overall.totalReceived += result.stats.totalReceived;
          overall.transactionCount += result.stats.transactionCount;

          for (const [token, tokenStats] of Object.entries(result.stats.byToken)) {
            if (!overall.byToken[token]) {
              overall.byToken[token] = { sent: 0, received: 0, count: 0 };
            }
            overall.byToken[token].sent += tokenStats.sent;
            overall.byToken[token].received += tokenStats.received;
            overall.byToken[token].count += tokenStats.count;
          }
        }

        setOverallStats(overall);
        hasLoadedRef.current = true;
      } catch (error) {
        console.error("Error fetching history:", error);
        toast.error("Failed to load transaction history");
      } finally {
        setLoading(false);
        isLoadingRef.current = false;
      }
    };

    fetchAllHistory();
  }, [connected, publicKey, contacts.length, location.pathname]);

  const sortedContacts = useMemo(() => {
    return [...contactTransactions].sort(
      (a, b) => b.stats.transactionCount - a.stats.transactionCount
    );
  }, [contactTransactions]);

  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header onToggleSidebar={() => setSidebarOpen(true)} />
        <div className="flex flex-1">
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          <main className="flex-1 flex items-center justify-center p-6">
            <Card className="glass-panel max-w-md">
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Connect your wallet to view transaction history
                </p>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header onToggleSidebar={() => setSidebarOpen(true)} />
      <div className="flex flex-1">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex-1 flex flex-col overflow-auto p-4 sm:p-5 lg:p-6">
          <div className="max-w-7xl mx-auto w-full">
            <h1 className="text-2xl sm:text-3xl font-bold gradient-text mb-4 sm:mb-5 lg:mb-6">Transaction History</h1>

            {/* Overall Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-5 lg:mb-6">
              <Card className="glass-panel">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                    Total Sent
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  {loading ? (
                    <Skeleton className="h-7 sm:h-8 w-20 sm:w-24" />
                  ) : (
                    <div className="text-xl sm:text-2xl font-bold text-orange-500">
                      {formatAmount(overallStats.totalSent, 9, "SOL")}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                    Total Received
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  {loading ? (
                    <Skeleton className="h-7 sm:h-8 w-20 sm:w-24" />
                  ) : (
                    <div className="text-xl sm:text-2xl font-bold text-green-500">
                      {formatAmount(overallStats.totalReceived, 9, "SOL")}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                    Total Transactions
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  {loading ? (
                    <Skeleton className="h-7 sm:h-8 w-20 sm:w-24" />
                  ) : (
                    <div className="text-xl sm:text-2xl font-bold text-foreground">
                      {overallStats.transactionCount}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Contact Statistics */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="glass-panel">
                    <CardContent className="pt-4 sm:pt-6">
                      <Skeleton className="h-28 sm:h-32 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : sortedContacts.length === 0 ? (
              <Card className="glass-panel">
                <CardContent className="pt-4 sm:pt-6 text-center py-8 sm:py-12">
                  <p className="text-xs sm:text-sm text-muted-foreground">No transaction history found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {sortedContacts.map((contactTx) => (
                  <Card key={contactTx.contactId} className="glass-panel hover:glow-primary transition-all">
                    <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6">
                      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <span className="text-xl sm:text-2xl">{contactTx.contactEmoji}</span>
                        <span className="truncate">{contactTx.contactName}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 sm:space-y-3 px-3 sm:px-6 pb-3 sm:pb-6">
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-muted-foreground">Transactions</span>
                        <span className="text-sm sm:text-base font-semibold">{contactTx.stats.transactionCount}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                          <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500" />
                          Sent
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-orange-500">
                          {formatAmount(contactTx.stats.totalSent, 9, "SOL")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                          <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                          Received
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-green-500">
                          {formatAmount(contactTx.stats.totalReceived, 9, "SOL")}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-border/30">
                        <p className="text-[10px] sm:text-xs text-muted-foreground font-mono break-all">
                          {formatAddress(contactTx.contactAddress)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default History;

