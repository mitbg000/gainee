/** Small inline SVG icon set (no icon library dependency). */
type P = { className?: string };
const base = (d: React.ReactNode) =>
  function Icon({ className = "h-5 w-5" }: P) {
    return (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d}
      </svg>
    );
  };

export const IconHome = base(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />);
export const IconBook = base(<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7" />);
export const IconPlus = base(<path d="M12 5v14M5 12h14" />);
export const IconDict = base(<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>);
export const IconCards = base(<><rect x="3" y="6" width="14" height="14" rx="2" /><path d="M7 3h12a2 2 0 0 1 2 2v12" /></>);
export const IconWords = base(<path d="M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h3" />);
export const IconChart = base(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />);
export const IconSpark = base(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />);
export const IconGear = base(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const IconMenu = base(<path d="M4 6h16M4 12h16M4 18h16" />);
export const IconClose = base(<path d="M6 6l12 12M18 6L6 18" />);
export const IconSun = base(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const IconMoon = base(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />);
export const IconMonitor = base(<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>);
export const IconTag = base(<><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>);
export const IconTarget = base(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" /></>);
export const IconPen = base(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />);
export const IconSpeaker = base(<><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>);
export const IconTrash = base(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />);
export const IconEdit = base(<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />);
/** Outline star; add `fill-current` for the "saved" state. */
export const IconStar = base(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />);
export const IconSend = base(<path d="M12 19V5M6 11l6-6 6 6" />);
export const IconStop = base(<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />);
export const IconImage = base(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>);
export const IconScissors = base(<><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8 7.5L20 18M8 16.5L20 6" /></>);
export const IconUndo = base(<path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />);
export const IconRedo = base(<path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />);
export const IconPin = base(<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6" />);
export const IconExpand = base(<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />);
export const IconQuote = base(<path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6" />);
export const IconBulb = base(<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />);
export const IconEye = base(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = base(<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />);
export const IconMapPin = base(<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>);
export const IconChat = base(<path d="M4 5h16v11H9l-5 4z" />);
export const IconChecklist = base(<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />);
export const IconMic = base(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>);
export const IconUser = base(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const IconLogout = base(<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />);
export const IconBolt = base(<path d="M13 3L4 14h7l-1 7 9-11h-7z" />);
export const IconCheck = base(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconX = base(<path d="M6 6l12 12M18 6L6 18" />);
export const IconArrowLeft = base(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const IconArrowRight = base(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconArrowUp = base(<path d="M12 19V5M6 11l6-6 6 6" />);
export const IconArrowDown = base(<path d="M12 5v14M6 13l6 6 6-6" />);
export const IconChevronLeft = base(<path d="M15 6l-6 6 6 6" />);
export const IconChevronRight = base(<path d="M9 6l6 6-6 6" />);
export const IconPlay = base(<path d="M7 5v14l12-7z" />);
export const IconEnter = base(<path d="M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4" />);
export const IconRefresh = base(<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />);
export const IconFlame = base(<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.7 2.3-4.8.2 1.7 1 2.8 2.2 3.3C11 9 11 6 12 3z" />);
export const IconTrophy = base(<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6" />);
export const IconAlert = base(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>);
export const IconClock = base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconFile = base(<path d="M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6" />);
export const IconNews = base(<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2h-1M7 9h7M7 13h7M7 16h4" />);
export const IconCheckCircle = base(<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></>);
export const IconXCircle = base(<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>);
export const IconHalfCircle = base(<><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /></>);
export const IconParty = base(<path d="M4 20l5-14 9 9zM14 4l1 2M19 9l2-1M17 3l-1 3 3-1M10 9c2 0 5 3 5 5" />);

/** A large icon in a soft coloured circle, for result and empty screens. */
export function BigIcon({ icon: Icon, tone = "accent" }: { icon: (p: P) => React.ReactElement; tone?: "accent" | "green" | "amber" | "red" | "orange" }) {
  const c = {
    accent: "bg-accent/10 text-accent",
    green: "bg-green-500/15 text-green-600 dark:text-green-400",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/15 text-red-600 dark:text-red-400",
    orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  }[tone];
  return (
    <span className={`mx-auto flex size-16 items-center justify-center rounded-full ${c}`}>
      <Icon className="h-8 w-8" />
    </span>
  );
}
export const IconVolumeOff = base(<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6" />);
export const IconVolume = base(<path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />);
export const IconHeadphones = base(<path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z" />);
export const IconUpload = base(<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />);
export const IconClipboard = base(<path d="M9 3h6v3H9zM9 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-3M9 11h6M9 15h4" />);
