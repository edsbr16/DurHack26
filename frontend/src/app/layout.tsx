import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DurHack WebRTC Stream — Central Media Engine",
  description: "Sub-200ms real-time camera and audio streaming from mobile phones to a central server dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-neutral-950 text-white antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
