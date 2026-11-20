export type NavItem = { href: string; key: string; icon: string; phase?: number; mobileTab?: boolean };

/** Single source of truth for navigation (desktop sidebar + mobile tab bar / "More" sheet). */
export const NAV: NavItem[] = [
  { href: "/", key: "dashboard", icon: "home", mobileTab: true },
  { href: "/library", key: "library", icon: "book", phase: 1, mobileTab: true },
  { href: "/import", key: "import", icon: "plus", phase: 1 },
  { href: "/dictionary", key: "dictionary", icon: "dict", mobileTab: true },
  { href: "/words", key: "words", icon: "words", phase: 2 },
  { href: "/review", key: "review", icon: "cards", phase: 2, mobileTab: true },
  { href: "/progress", key: "progress", icon: "chart", phase: 2 },
  { href: "/assistant", key: "assistant", icon: "spark", phase: 3 },
  { href: "/settings", key: "settings", icon: "gear", phase: 1 },
];
