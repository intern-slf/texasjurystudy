import "./globals.css";
// Import your components (you'll need to create these files)
import Navbar from "@/components/Navbar"; 
import Footer from "@/components/Footer";

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
        className="min-h-screen flex flex-col bg-background text-foreground"
      >
        <Navbar />
        <main className="flex-grow">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}