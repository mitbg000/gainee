export type NavItem = { href: string; key: string; icon: string; phase?: number; mobileTab?: boolean };

/** Single source of truth for navigation (desktop sidebar + mobile tab bar / "More" sheet). */
export const NAV: NavItem[] = [
  { href: "/", key: "dashboard", icon: "home", mobileTab: true },
  { href: "/library", key: "library", icon: "book", mobileTab: true },
  { href: "/import", key: "import", icon: "plus" },
  { href: "/dictionary", key: "dictionary", icon: "dict", mobileTab: true },
  { href: "/words", key: "words", icon: "words" },
  { href: "/labels", key: "labels", icon: "tag" },
  { href: "/quick", key: "quick", icon: "bolt" },
  { href: "/review", key: "review", icon: "cards", mobileTab: true },
  { href: "/practice", key: "practice", icon: "target" },
  { href: "/ielts", key: "ielts", icon: "exam" },
  { href: "/listen", key: "listen", icon: "headphones" },
  { href: "/writing", key: "writing", icon: "pen" },
  { href: "/progress", key: "progress", icon: "chart" },
  { href: "/assistant", key: "assistant", icon: "spark" },
  { href: "/settings", key: "settings", icon: "gear" },
];
