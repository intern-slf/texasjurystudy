import "./globals.css";
import Navbar from "@/components/Navbar"; 
import Footer from "@/components/Footer";
import RootLayoutClient from "./layout-client"; // The motion wrapper we'll create

export const metadata = {
  title: "FocusGroup",
  description: "Structured focus groups with the right people",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className="min-h-screen flex flex-col bg-background text-foreground antialiased"
      >
        <Navbar />
        <main className="flex-grow">
          {/* We wrap the inner content in our Client Motion component */}
          <RootLayoutClient>{children}</RootLayoutClient>
        </main>
        <Footer />
      </body>
    </html>
  );
}