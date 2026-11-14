import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const displayFont = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const sansFont = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Natural Composition — live rooms from phone cameras",
  description:
    "Create a room, share the link, and every phone camera joins one live view — with real-time pinch tracking.",
};

export const viewport: Viewport = {
  themeColor: "#faf7f1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full ${displayFont.variable} ${sansFont.variable} antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
