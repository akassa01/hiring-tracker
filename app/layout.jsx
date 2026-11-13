import { Inter_Tight, Barlow_Condensed } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const sans = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "700", "900"], variable: "--font-sans" });
const condensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-condensed" });

export const metadata = {
  title: "The Hiring Tracker",
  description:
    "Which a16z and speedrun portfolio companies are actually hiring, how fast, and which job posts look stale.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${condensed.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
