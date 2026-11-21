/**
 * Web fonts offered in Settings → Appearance (all with Vietnamese letters). next/font downloads them at build time and
 * serves them from this app; preload is off, so a browser only fetches the fonts that are actually chosen.
 */
import { Be_Vietnam_Pro, Bitter, EB_Garamond, Inter, Literata, Lora, Merriweather, Noto_Serif, Nunito, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";

// next/font needs each option written out as a literal in every call
const literata = Literata({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-literata" });
const bitter = Bitter({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-bitter" });
const merriweather = Merriweather({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-merriweather" });
const lora = Lora({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-lora" });
const sourceserif = Source_Serif_4({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-sourceserif" });
const notoserif = Noto_Serif({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-notoserif" });
const garamond = EB_Garamond({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-garamond" });
const inter = Inter({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-inter" });
const bevietnam = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, weight: ["400", "500", "600", "700"], variable: "--ff-bevietnam" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-jakarta" });
const nunito = Nunito({ subsets: ["latin", "vietnamese"], display: "swap", preload: false, variable: "--ff-nunito" });

/** Class names that define the --ff-* variables; put on <html>. */
export const fontVars = [literata, bitter, merriweather, lora, sourceserif, notoserif, garamond, inter, bevietnam, jakarta, nunito].map((f) => f.variable).join(" ");
