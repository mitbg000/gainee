export type NavGroup = "read" | "words" | "skills" | "me";
export type NavItem = { href: string; key: string; icon: string; phase?: number; mobileTab?: boolean; admin?: boolean; group?: NavGroup; /** a page reached from another one (breadcrumbs only, not in the menu) */ hidden?: boolean };

/** Single source of truth for navigation (desktop sidebar + mobile tab bar / "More" sheet), in menu order and groups. */
export const NAV: NavItem[] = [
  { href: "/", key: "dashboard", icon: "home", mobileTab: true },
  { href: "/library", key: "library", icon: "book", mobileTab: true, group: "read" },
  { href: "/import", key: "import", icon: "plus", group: "read" },
  { href: "/labels", key: "labels", icon: "tag", group: "read" },
  { href: "/review", key: "review", icon: "cards", mobileTab: true, group: "words" },
  { href: "/words", key: "words", icon: "words", group: "words" },
  { href: "/practice", key: "practice", icon: "target", group: "words" },
  { href: "/quick", key: "quick", icon: "bolt", group: "words" },
  { href: "/dictionary", key: "dictionary", icon: "dict", mobileTab: true, group: "words" },
  { href: "/ielts", key: "ielts", icon: "exam", group: "skills" },
  { href: "/listen", key: "listen", icon: "headphones", group: "skills" },
  { href: "/writing", key: "writing", icon: "pen", group: "skills" },
  { href: "/assistant", key: "assistant", icon: "spark", group: "skills" },
  { href: "/profile", key: "profile", icon: "user", group: "me" },
  { href: "/progress", key: "progress", icon: "chart", group: "me", hidden: true },
  { href: "/credits", key: "credits", icon: "coin", group: "me", hidden: true },
  { href: "/admin", key: "admin", icon: "shield", admin: true, group: "me" },
  { href: "/settings", key: "settings", icon: "gear", group: "me" },
];
