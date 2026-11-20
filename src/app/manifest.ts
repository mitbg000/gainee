import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ReadLearn – Learn English through reading",
    short_name: "ReadLearn",
    description: "Turn articles into IELTS lessons with vocabulary, exercises and spaced repetition.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#faf7f1",
    theme_color: "#1f4e79",
    categories: ["education", "books"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dictionary", url: "/dictionary", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
