import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const EMOJI_LIST = [
  // Faces
  "😁", "😂", "😃", "😄", "😅", "😆", "😇", "😈", "😉", "😊", "😋", "😌", "😍", "😎", "😏", "😐", "😒", "😓", "😔", "😖", "😘", "😚", "😜", "😝", "😞", "😠", "😡", "😢", "😣", "😤", "😥", "😨", "😩", "😪", "😫", "😭", "😰", "😱", "😲", "😳", "😵", "😶", "😷",
  // People
  "👴", "🙅", "🙆", "🙇", "🙈", "🙉", "🙊", "🙋", "🙌", "🙍", "🙎", "🙏",
  // Cats
  "😸", "😹", "😺", "😻", "😼", "😽", "😾", "😿", "🙀",
  // Symbols
  "✂", "✅", "✈", "✉", "✊", "✋", "✌", "✏", "✒", "✔", "✖", "✨", "✳", "✴", "❄", "❇", "❌", "❎", "❓", "❔", "❕", "❗", "❤", "➕", "➖", "➗", "➡", "➰",
  // Transport
  "🚀", "🚃", "🚄", "🚅", "🚇", "🚉", "🚌", "🚏", "🚑", "🚒", "🚓", "🚕", "🚗", "🚙", "🚚", "🚢", "🚤", "🚥", "🚧", "🚨", "🚩", "🚪", "🚫", "🚬", "🚭", "🚲", "🚶", "🚹", "🚺", "🚻", "🚼", "🚽", "🚾", "🛀",
  // Letters & Flags
  "Ⓜ", "🅰", "🅱", "🅾", "🅿", "🆎", "🆑", "🆒", "🆓", "🆔", "🆕", "🆖", "🆗", "🆘", "🆙", "🆚", "🇩🇪", "🇬🇧", "🇨🇳", "🇯🇵", "🇰🇷", "🇫🇷", "🇪🇸", "🇮🇹", "🇺🇸", "🇷🇺",
  // Symbols 2
  "©", "®", "‼", "⁉", "™", "↔", "↕", "↖", "↗", "↘", "↙", "↩", "↪", "⤴", "⤵", "⬅", "➡", "⬆", "⬇", "⌚", "⌛", "▪", "▫", "▶", "◀", "☀", "☁", "☎", "☑", "☔", "☕", "☝", "☺",
  // Zodiac & Cards
  "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "♠", "♥", "♦", "♣", "♨", "♻", "♿", "⚓", "⚠", "⚡", "⚪", "⚫", "⚽", "⚾", "⛄", "⛅", "⛎", "⛔", "⛪", "⛲", "⛳", "⛵", "⛺", "⛽", "⬛", "⬜", "⭐", "⭕", "〰", "〽", "㊗", "㊙", "🃏",
  // Weather & Nature
  "🌀", "🌁", "🌂", "🌃", "🌄", "🌅", "🌆", "🌇", "🌈", "🌉", "🌊", "🌋", "🌌", "🌏", "🌑", "🌓", "🌔", "🌕", "🌙", "🌛", "🌟", "🌠", "🌰", "🌱", "🌴", "🌵", "🌷", "🌸", "🌹", "🌺", "🌻", "🌼", "🌽", "🌾", "🌿", "🍀", "🍁", "🍂", "🍃", "🍄",
  // Food
  "🍅", "🍆", "🍇", "🍈", "🍉", "🍊", "🍌", "🍍", "🍎", "🍏", "🍑", "🍒", "🍓", "🍔", "🍕", "🍖", "🍗", "🍘", "🍙", "🍚", "🍛", "🍜", "🍝", "🍞", "🍟", "🍠", "🍡", "🍢", "🍣", "🍤", "🍥", "🍦", "🍧", "🍨", "🍩", "🍪", "🍫", "🍬", "🍭", "🍮", "🍯", "🍰", "🍱", "🍲", "🍳", "🍴", "🍵", "🍶", "🍷", "🍸", "🍹", "🍺", "🍻",
  // Events & Activities
  "🎀", "🎁", "🎂", "🎃", "🎄", "🎅", "🎆", "🎇", "🎈", "🎉", "🎊", "🎋", "🎌", "🎍", "🎎", "🎏", "🎐", "🎑", "🎒", "🎓", "🎠", "🎡", "🎢", "🎣", "🎤", "🎥", "🎦", "🎧", "🎨", "🎩", "🎪", "🎫", "🎬", "🎭", "🎮", "🎯", "🎰", "🎱", "🎲", "🎳", "🎴", "🎵", "🎶", "🎷", "🎸", "🎹", "🎺", "🎻", "🎼", "🎽", "🎾", "🎿", "🏀", "🏁", "🏂", "🏃", "🏄", "🏆", "🏈", "🏊",
  // Buildings
  "🏠", "🏡", "🏢", "🏣", "🏥", "🏦", "🏧", "🏨", "🏩", "🏪", "🏫", "🏬", "🏭", "🏮", "🏯", "🏰",
  // Animals
  "🐌", "🐍", "🐎", "🐑", "🐒", "🐔", "🐗", "🐘", "🐙", "🐚", "🐛", "🐜", "🐝", "🐞", "🐟", "🐠", "🐡", "🐢", "🐣", "🐤", "🐥", "🐦", "🐧", "🐨", "🐩", "🐫", "🐬", "🐭", "🐮", "🐯", "🐰", "🐱", "🐲", "🐳", "🐴", "🐵", "🐶", "🐷", "🐸", "🐹", "🐺", "🐻", "🐼", "🐽", "🐾", "🦊", "🦋", "🦌", "🦍", "🦎", "🦏", "🦐", "🦑", "🦒", "🦓", "🦔", "🦕", "🦖", "🦗", "🦘", "🦙", "🦚", "🦛", "🦜", "🦝", "🦞", "🦟", "🦠", "🦡", "🦢", "🦣", "🦤", "🦥", "🦦", "🦧", "🦨", "🦩", "🦪", "🦫", "🦬", "🦭", "🦮", "🦯", "🦰", "🦱", "🦲", "🦳", "🦴", "🦵", "🦶", "🦷", "🦸", "🦹", "🦺", "🦻", "🦼", "🦽", "🦾", "🦿",
  // Body Parts & People
  "👀", "👂", "👃", "👄", "👅", "👆", "👇", "👈", "👉", "👊", "👋", "👌", "👍", "👎", "👏", "👐", "👑", "👒", "👓", "👔", "👕", "👖", "👗", "👘", "👙", "👚", "👛", "👜", "👝", "👞", "👟", "👠", "👡", "👢", "👣", "👤", "👦", "👧", "👨", "👩", "👪", "👫", "👮", "👯", "👰", "👱", "👲", "👳", "👴", "👵", "👶", "👷", "👸", "👹", "👺", "👻", "👼", "👽", "👾", "👿", "💀", "💁", "💂", "💃", "💄", "💅", "💆", "💇", "💈", "💉", "💊", "💋", "💌", "💍", "💎", "💏", "💐", "💑", "💒", "💓", "💔", "💕", "💖", "💗", "💘", "💙", "💚", "💛", "💜", "💝", "💞", "💟", "💠", "💡", "💢", "💣", "💤", "💥", "💦", "💧", "💨", "💩", "💪", "💫", "💬", "💮", "💯", "💰", "💱", "💲", "💳", "💴", "💵", "💸", "💹", "💺", "💻", "💼", "💽", "💾", "💿", "📀", "📁", "📂", "📃", "📄", "📅", "📆", "📇", "📈", "📉", "📊", "📋", "📌", "📍", "📎", "📏", "📐", "📑", "📒", "📓", "📔", "📕", "📖", "📗", "📘", "📙", "📚", "📛", "📜", "📝", "📞", "📟", "📠", "📡", "📢", "📣", "📤", "📥", "📦", "📧", "📨", "📩", "📪", "📫", "📮", "📰", "📱", "📲", "📳", "📴", "📶", "📷", "📹", "📺", "📻", "📼", "🔃", "🔊", "🔋", "🔌", "🔍", "🔎", "🔏", "🔐", "🔑", "🔒", "🔓", "🔔", "🔖", "🔗", "🔘", "🔙", "🔚", "🔛", "🔜", "🔝", "🔞", "🔟", "🔠", "🔡", "🔢", "🔣", "🔤", "🔥", "🔦", "🔧", "🔨", "🔩", "🔪", "🔫", "🔮", "🔯", "🔰", "🔱", "🔲", "🔳", "🔴", "🔵", "🔶", "🔷", "🔸", "🔹", "🔺", "🔻", "🔼", "🔽",
];

interface EmojiPickerProps {
  selected?: string;
  onSelect: (emoji: string) => void;
  className?: string;
}

export function EmojiPicker({
  selected,
  onSelect,
  className = "",
}: EmojiPickerProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const INITIAL_COUNT = 3;
  
  // Ensure selected emoji is always visible in initial 3
  const getInitialEmojis = () => {
    const baseEmojis = EMOJI_LIST.slice(0, INITIAL_COUNT);
    if (selected && !baseEmojis.includes(selected)) {
      // Replace last emoji with selected one
      return [...baseEmojis.slice(0, INITIAL_COUNT - 1), selected];
    }
    return baseEmojis;
  };
  
  const initialEmojis = getInitialEmojis();

  const handleEmojiSelect = (emoji: string) => {
    onSelect(emoji);
    setIsModalOpen(false);
  };

  const renderEmojiButton = (
    emoji: string,
    index: number,
    isSelected: boolean,
    isHovered: boolean,
    onClick: () => void,
    isInModal: boolean = false
  ) => (
    <button
      key={index}
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(emoji)}
      onMouseLeave={() => setHovered(null)}
      className={`
        ${isInModal ? "w-10 h-10 text-xl" : "w-10 h-10 text-xl"}
        rounded-xl flex items-center justify-center
        transition-all duration-200
        ${isSelected 
          ? "glass-panel glow-primary scale-110 border-2 border-primary ring-2 ring-primary/50" 
          : "glass-panel-subtle hover:scale-105 border border-transparent"
        }
      `}
      style={isSelected ? {
        boxShadow: "0 0 20px rgba(139, 92, 246, 0.6), inset 0 0 10px rgba(139, 92, 246, 0.2)"
      } : {}}
    >
      {emoji}
    </button>
  );

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {initialEmojis.map((emoji, index) => {
          const isSelected = emoji === selected;
          const isHovered = emoji === hovered;
          return renderEmojiButton(emoji, index, isSelected, isHovered, () => onSelect(emoji), false);
        })}
        
        {/* More+ Button */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="
            w-10 h-10 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center
            text-xs font-bold text-white
            transition-all duration-200
            btn-premium glow-primary
            hover:scale-105
            min-w-[44px] min-h-[44px]
          "
          aria-label="Show more emojis"
        >
          more+
        </button>
      </div>

      {/* Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="glass-panel border-border/30 bg-popover/95 backdrop-blur-xl w-full max-w-full sm:max-w-lg lg:max-w-2xl m-0 sm:m-4 animate-scale-in">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
            <DialogTitle className="text-lg sm:text-xl font-semibold gradient-text text-center">
              Select Emoji
            </DialogTitle>
          </DialogHeader>

          {/* Emoji Container - adaptive columns with vertical scroll */}
          <div 
            className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 gap-2 justify-center overflow-y-auto max-h-[60vh] px-3 sm:px-4 emoji-scrollbar"
          >
            {EMOJI_LIST.map((emoji, index) => {
              const isSelected = emoji === selected;
              const isHovered = emoji === hovered;
              return renderEmojiButton(emoji, index, isSelected, isHovered, () => handleEmojiSelect(emoji), true);
            })}
          </div>

          {/* Close Button - Centered */}
          <div className="flex justify-center mt-4 px-4 sm:px-6 pb-4 sm:pb-6">
            <Button
              type="button"
              variant="premium"
              onClick={() => setIsModalOpen(false)}
              className="w-full sm:w-auto min-w-[120px]"
            >
              CLOSE
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

