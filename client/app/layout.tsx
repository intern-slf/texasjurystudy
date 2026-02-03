import "./globals.css";

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
        className="min-h-screen bg-background text-foreground"
      >
        {children}
      </body>
    </html>
  );
}
