/**
 * printHelper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bulletproof printing helper for invoices in both Web and Electron (desktop).
 *
 * Guarantees:
 * 1. Never shows two/multiple bills when clicking Print multiple times in the
 *    same session (cleans up any existing portals prior to cloning).
 * 2. Never prints black borders or dark window background on the sides in Electron
 *    or web (portal takes 100% width with pure white background #ffffff).
 * 3. Sets document.title to `Invoice_[ID]_[Customer]` so the saved PDF filename
 *    in the Chrome/Electron print dialog defaults to the invoice name.
 * 4. Cleans up cleanly after printing or cancellation via standard 'afterprint'.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function printInvoiceElement(
  elementId: string,
  invoiceId?: string | number,
  customerName?: string
): void {
  // If running in Electron, ensure the host window compositor has a pure white background
  if (typeof window !== 'undefined' && (window as any).electronAPI?.preparePrint) {
    try {
      (window as any).electronAPI.preparePrint();
    } catch (_) {}
  }

  // 1. Immediately remove ANY existing print portal elements to prevent duplicate bills
  const strayPortals = document.querySelectorAll(
    '#print-portal-root, #electron-print-portal, .print-only-container, #print-only-container'
  );
  strayPortals.forEach(el => el.remove());
  document.body.classList.remove('printing-active', 'electron-printing');

  const invoiceEl = document.getElementById(elementId);
  if (!invoiceEl) {
    console.warn(`[printHelper] Target element with ID "${elementId}" not found in DOM.`);
    window.print();
    return;
  }

  // 2. Set document.title so PDF download/save dialog uses the invoice name
  const originalTitle = document.title;
  if (invoiceId) {
    const safeCustomer = (customerName || '').replace(/[^a-zA-Z0-9_-]/g, '_').trim();
    document.title = `Invoice_${invoiceId}${safeCustomer ? `_${safeCustomer}` : ''}`;
  }

  // 3. Create a clean top-level portal div directly on document.body
  const portal = document.createElement('div');
  portal.id = 'print-portal-root';
  portal.className = 'print-only-container print-portal-container';
  // Off-screen on display, but @media print makes it visible & 100% white
  portal.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;background:#ffffff;background-color:#ffffff;z-index:99999;pointer-events:none;overflow:visible;';

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  // 4. Clone the target invoice template into the portal
  const clone = invoiceEl.cloneNode(true) as HTMLElement;
  clone.classList.add('print-bill-target');

  if (!isElectron) {
    // ── ONLINE (WEB): 100% original untouched styles ─────────────────────────
    // Retains full A4 paper bill layout, stretching empty grid lines to bottom
    clone.style.cssText =
      'transform:none!important;box-shadow:none!important;margin:0 auto!important;padding:16px!important;width:794px!important;max-width:794px!important;height:auto!important;min-height:0!important;background:#ffffff!important;background-color:#ffffff!important;border-radius:0!important;';
    // Do NOT alter clone child min-heights or empty rows!
  } else {
    // ── EXE (DESKTOP): Full paper bill look, tuned to fit 1 page on Letter/A4 ─
    // On Letter paper (1056px height), the standard 1050px border box + 48px padding = 1098px,
    // which overflows by 42px creating a 2nd page.
    // Setting outer padding to 10px 14px and inner border box min-height to 980px gives
    // a total height of ~1004px (safely under 1056px Letter and 1122px A4).
    // The empty rows STILL expand to fill the entire 980px space via flex-1,
    // preserving ALL horizontal & vertical grid lines so the bill is NOT shortened!
    clone.style.cssText =
      'transform:none!important;box-shadow:none!important;margin:0 auto!important;padding:10px 14px!important;width:794px!important;max-width:100%!important;height:auto!important;max-height:1015px!important;background:#ffffff!important;background-color:#ffffff!important;border-radius:0!important;box-sizing:border-box!important;page-break-inside:avoid!important;break-inside:avoid!important;page-break-after:avoid!important;';

    // Neutralize outer min-h-[1123px] on the clone wrapper
    clone.style.minHeight = '1004px';

    // In the inner border box (which has min-h-[1050px]), tune it to 980px
    // This maintains the FULL height paper look with all empty grid lines, but prevents the 2nd page spill!
    const borderBoxes = clone.querySelectorAll<HTMLElement>('[class*="1050"]');
    borderBoxes.forEach(box => {
      box.style.minHeight = '980px';
    });
  }

  portal.appendChild(clone);
  document.body.appendChild(portal);
  document.body.classList.add('printing-active');
  if (isElectron) {
    document.body.classList.add('electron-printing');
  }

  // Explicitly ensure body & documentElement background colors are white
  const origBodyBg = document.body.style.backgroundColor;
  const origHtmlBg = document.documentElement.style.backgroundColor;
  document.body.style.backgroundColor = '#ffffff';
  document.documentElement.style.backgroundColor = '#ffffff';

  // 5. Cleanup handler when print dialog closes (printed or cancelled)
  let isCleanedUp = false;
  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    document.body.style.backgroundColor = origBodyBg;
    document.documentElement.style.backgroundColor = origHtmlBg;
    if (document.body.contains(portal)) {
      document.body.removeChild(portal);
    }
    // Also remove any stray portals just in case
    document.querySelectorAll(
      '#print-portal-root, #electron-print-portal, .print-only-container, #print-only-container'
    ).forEach(el => el.remove());
    document.body.classList.remove('printing-active', 'electron-printing');
    document.title = originalTitle;
    window.removeEventListener('afterprint', cleanup);
  };

  // 'afterprint' is standard in Chromium, Electron, Edge, Firefox, Safari
  window.addEventListener('afterprint', cleanup, { once: true });

  // 6. Short delay for DOM repaint, then trigger print
  setTimeout(() => {
    window.print();
    // Safety fallback: in case afterprint doesn't fire (older browser or edge-case),
    // ensure cleanup runs eventually
    setTimeout(cleanup, 15000);
  }, 100);
}
