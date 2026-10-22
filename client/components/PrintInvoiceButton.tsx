"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where the invoice saves as a PDF. */
export default function PrintInvoiceButton() {
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      <Download className="h-4 w-4" aria-hidden="true" />
      Download PDF
    </Button>
  );
}
