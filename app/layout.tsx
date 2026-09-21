import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proscenium",
  description: "A human-in-the-loop studio that takes a brief through story, script, consent, reels, and a finished picture.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to the work</a>
        {children}
      </body>
    </html>
  );
}
