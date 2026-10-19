import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const DESCRIPTION = "Tell it who is eating and what they can’t have. An AI calls each restaurant and asks the chef about hidden ingredients and shared fryers. Nothing is booked on a guess.";

export const metadata: Metadata = {
  title: { default: "CrossCheck", template: "%s · CrossCheck" },
  description: DESCRIPTION,
  openGraph: { title: "We call the kitchen before you eat there", description: DESCRIPTION, siteName: "CrossCheck", type: "website" },
  twitter: { card: "summary", title: "We call the kitchen before you eat there", description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#f5f5f7" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full" data-scroll-behavior="smooth">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
