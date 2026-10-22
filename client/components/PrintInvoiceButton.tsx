"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opens the browser's print dialog, where the invoice saves as a PDF. The
 * browser names the file after the page title, so it's set to `fileName` first.
 */
export default function PrintInvoiceButton({ fileName }: { fileName: string }) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        document.title = fileName;
        window.print();
      }}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Download PDF
    </Button>
  );
}
