import { Shield, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { AddressReputation } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AddressReputationCardProps {
  reputation: AddressReputation | null;
  loading?: boolean;
  address: string;
}

export const AddressReputationCard = ({
  reputation,
  loading,
  address,
}: AddressReputationCardProps) => {
  if (loading) {
    return (
      <div className="glass-panel-subtle rounded-xl p-3 sm:p-4 border-border/30">
        <div className="flex items-center gap-2 sm:gap-3">
          <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-primary" />
          <span className="text-xs sm:text-sm text-muted-foreground">Checking address reputation...</span>
        </div>
      </div>
    );
  }

  // Show card even if reputation is null (will show default low score)
  if (!reputation) {
    return (
      <div className="glass-panel-subtle rounded-xl p-3 sm:p-4 border-border/30 bg-red-500/10 border-red-500/30">
        <div className="flex items-start justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <span className="text-xs sm:text-sm font-semibold text-foreground">Address Reputation</span>
          </div>
          <div className="text-base sm:text-lg font-bold text-red-500">0/100</div>
        </div>
        <div className="text-xs text-muted-foreground">
          Unable to check reputation. Please verify the address manually.
        </div>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 60) return "text-green-500";
    if (score >= 30) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreBg = (score: number) => {
    if (score >= 60) return "bg-green-500/10 border-green-500/30";
    if (score >= 30) return "bg-yellow-500/10 border-yellow-500/30";
    return "bg-red-500/10 border-red-500/30";
  };

  const getRecommendationIcon = () => {
    if (reputation.recommendation === "safe") {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    if (reputation.recommendation === "caution") {
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    }
    return <AlertTriangle className="w-4 h-4 text-red-500" />;
  };

  const getRecommendationText = () => {
    if (reputation.recommendation === "safe") {
      return "Address looks safe";
    }
    if (reputation.recommendation === "caution") {
      return "Exercise caution";
    }
    return "High risk - verify address";
  };

  return (
    <div className={cn(
      "glass-panel-subtle rounded-xl p-3 sm:p-4 border-border/30 transition-all",
      getScoreBg(reputation.score)
    )}>
      <div className="flex items-start justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          <span className="text-xs sm:text-sm font-semibold text-foreground">Address Reputation</span>
        </div>
        <div className={cn("text-base sm:text-lg font-bold", getScoreColor(reputation.score))}>
          {reputation.score}/100
        </div>
      </div>

      <div className="space-y-2 text-xs sm:text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Age:</span>
          <span className="text-foreground font-medium">
            {reputation.age === 0 ? "<24 hours" : `${reputation.age} day${reputation.age !== 1 ? "s" : ""}`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Transactions:</span>
          <span className="text-foreground font-medium">{reputation.transactionCount}</span>
        </div>
        {reputation.ataTokens.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">ATA:</span>
            <span className="text-foreground font-medium">{reputation.ataTokens.join(", ")}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Incoming:</span>
          <span className={cn("font-medium", reputation.hasIncoming ? "text-green-500" : "text-muted-foreground")}>
            {reputation.hasIncoming ? "Yes" : "No"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Recent Activity:</span>
          <span className="text-foreground font-medium">
            {reputation.recentActivity} tx (14 days)
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Similarity:</span>
          <span className={cn(
            "font-medium",
            reputation.similarityRisk === 0 ? "text-green-500" : "text-yellow-500"
          )}>
            {reputation.similarityRisk === 0 ? "Low" : "Similar to saved contact"}
          </span>
        </div>
      </div>

      <div className={cn(
        "mt-3 pt-3 border-t border-border/30 flex items-center gap-2",
        reputation.recommendation === "safe" ? "text-green-500" :
        reputation.recommendation === "caution" ? "text-yellow-500" : "text-red-500"
      )}>
        {getRecommendationIcon()}
        <span className="text-xs font-medium">{getRecommendationText()}</span>
      </div>
    </div>
  );
};

