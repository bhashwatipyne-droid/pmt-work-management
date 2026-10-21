import { useState } from "react";

import { InvoiceList } from "@/components/invoicing/InvoiceList";
import { InvoiceDetail } from "@/components/invoicing/InvoiceDetail";

// Finance's "Ready to invoice": projects an admin has moved to "Ready for
// Invoice", and a per-project costing view listing every piece, who made it and
// its link. Markup follows the design prototype; data is live from /invoicing.

export default function InvoicingPage() {
  const [openId, setOpenId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div data-testid="invoicing-page" style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative", background: "#fff" }}>
      {openId ? (
        <InvoiceDetail projectId={openId} onBack={() => setOpenId(null)} onChanged={() => setRefreshKey((k) => k + 1)} />
      ) : (
        <InvoiceList onOpen={setOpenId} refreshKey={refreshKey} />
      )}
    </div>
  );
}
