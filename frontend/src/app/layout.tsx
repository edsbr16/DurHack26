import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Natural Composition — a shared environmental artwork",
  description:
    "A collaborative artwork generated from environmental sensors and hand gestures.",
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
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col font-sans bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
