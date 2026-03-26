import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";

const canonicalUrl = process.env.APP_CANONICAL_URL;
const metadataBase = canonicalUrl ? new URL(canonicalUrl) : undefined;

export const metadata: Metadata = {
  metadataBase,
  title: "SpeakOnImage Beta - 看中文说英语",
  description: "Invite-only AI speaking coach for turning Chinese intent into natural English output.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
