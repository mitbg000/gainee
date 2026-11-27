export type NavGroup = "learn" | "skills" | "manage";
export type NavItem = { href: string; key: string; icon: string; phase?: number; mobileTab?: boolean; admin?: boolean; group?: NavGroup; /** reached from another page or the account menu (breadcrumbs only, not in the menu) */ hidden?: boolean };

/** Single source of truth for navigation (desktop sidebar + mobile tab bar / "More" sheet), in menu order and groups. */
export const NAV: NavItem[] = [
  { href: "/", key: "dashboard", icon: "home", mobileTab: true },
  { href: "/library", key: "library", icon: "book", mobileTab: true, group: "learn" },
  { href: "/review", key: "review", icon: "cards", mobileTab: true, group: "learn" },
  { href: "/words", key: "words", icon: "words", group: "learn" },
  { href: "/practice", key: "practice", icon: "target", group: "learn" },
  { href: "/dictionary", key: "dictionary", icon: "dict", mobileTab: true, group: "learn" },
  { href: "/ielts", key: "ielts", icon: "exam", group: "skills" },
  { href: "/listen", key: "listen", icon: "headphones", group: "skills" },
  { href: "/writing", key: "writing", icon: "pen", group: "skills" },
  { href: "/assistant", key: "assistant", icon: "spark", group: "skills" },
  { href: "/admin", key: "admin", icon: "shield", admin: true, group: "manage" },
  // reached from the library, practice, the top bar and the account menu
  { href: "/import", key: "import", icon: "plus", hidden: true },
  { href: "/labels", key: "labels", icon: "tag", hidden: true },
  { href: "/quick", key: "quick", icon: "bolt", hidden: true },
  { href: "/profile", key: "profile", icon: "user", hidden: true },
  { href: "/progress", key: "progress", icon: "chart", hidden: true },
  { href: "/credits", key: "credits", icon: "coin", hidden: true },
  { href: "/settings", key: "settings", icon: "gear", hidden: true },
];
