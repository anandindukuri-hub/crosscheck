import type { Metadata, Viewport } from "next";
import { LaunchPage } from "@/components/launch/LaunchPage";

export const metadata: Metadata = { title: { absolute: "CrossCheck · We call the kitchen before you eat there" } };

// the launch page is black, so the browser's own bars and overscroll are too
export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export default function Home() {
  return <LaunchPage />;
}
