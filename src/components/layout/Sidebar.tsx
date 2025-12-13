import { Home, Users, History, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImportExport } from "@/components/ImportExport";
import { Link, useLocation } from "react-router-dom";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Users, label: "Contacts", path: "/" }, // Same as home
  { icon: History, label: "History", path: "/history" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export const Sidebar = ({ isOpen, onClose, onImportComplete }: SidebarProps) => {
  const location = useLocation();
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-[72px] lg:w-[240px] glass-panel border-r border-border/30 flex flex-col items-center lg:items-start py-6 gap-2 transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Close button for mobile - centered at top */}
        <button
          onClick={onClose}
          className="lg:hidden absolute top-4 left-1/2 -translate-x-1/2 p-2 rounded-lg hover:bg-primary/10 transition-colors z-10"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>

        {/* Logo icon */}
        <div className="w-10 h-10 rounded-xl btn-premium flex items-center justify-center mb-6 glow-primary mx-auto mt-12 lg:mt-0">
          <span className="text-lg">📖</span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2 flex-1 w-full px-2 lg:px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
              key={item.label}
                to={item.path}
                onClick={onClose}
              className={cn(
                  "w-12 h-12 lg:w-full lg:px-4 rounded-xl flex items-center justify-center lg:justify-start gap-3 transition-all duration-300 group relative mx-auto lg:mx-0",
                  isActive
                  ? "glass-panel glow-primary text-primary"
                  : "hover:bg-primary/10 text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
                <span className="hidden lg:block text-sm font-medium">{item.label}</span>
              
                {/* Tooltip for mobile */}
                <span className="absolute left-full ml-3 px-3 py-1.5 rounded-lg glass-panel text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none lg:hidden">
                {item.label}
              </span>
              </Link>
            );
          })}
        </nav>

        {/* Import/Export */}
        <div className="w-full px-2 pb-2 flex justify-center lg:justify-start">
          <ImportExport onImportComplete={onImportComplete} />
        </div>

        {/* Bottom decorative element */}
        <div className="w-8 h-1 rounded-full bg-gradient-to-r from-primary to-accent opacity-50 lg:mx-auto" />
      </aside>
    </>
  );
};
