import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Echo",
  description: "Zoom transcripts to follow-up email drafts, in your voice.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
