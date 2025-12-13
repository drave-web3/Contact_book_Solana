import { Search } from "lucide-react";
import { useState, useEffect } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export const SearchBar = ({ onSearch }: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  // Debounce search query to prevent excessive re-renders
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [query, onSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    // Don't call onSearch immediately - let debounce handle it
  };

  return (
    <div className="w-full mx-auto animate-fade-in-glow flex justify-center" style={{ animationDelay: "0.1s" }}>
      <div
        className={`glass-panel rounded-xl flex items-center px-3 sm:px-4 gap-2 sm:gap-3 transition-all duration-300 w-full sm:max-w-md lg:max-w-lg xl:w-[555px] h-12 sm:h-14 lg:h-16 xl:h-[77px] ${
          isFocused ? "glow-primary ring-2 ring-primary/30" : ""
        }`}
      >
        <Search className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Search contacts..."
          className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-sm sm:text-base"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              onSearch("");
            }}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
