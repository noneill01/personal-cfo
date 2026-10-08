import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal CFO",
  description: "A private, local-first personal financial operating system.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning>{children}</body></html>;
}
