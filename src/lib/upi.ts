import QRCode from "qrcode";

export interface UpiPaymentDetails {
  vpa?: string;
  payeeName?: string;
  amount: number;
  transactionRef: string;
  note?: string;
}

export const DEFAULT_CANTEEN_VPA = "canteen@upi";
export const DEFAULT_CANTEEN_NAME = "SPIT Canteen";

/**
 * Reads the canteen UPI VPA address from environment configuration.
 * Checks VITE_CANTEEN_UPI_VPA and VITE_UPI_VPA, falling back to DEFAULT_CANTEEN_VPA.
 */
export function getCanteenVpa(): string {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const configuredVpa = import.meta.env.VITE_CANTEEN_UPI_VPA || import.meta.env.VITE_UPI_VPA;
    if (configuredVpa && typeof configuredVpa === "string" && configuredVpa.trim()) {
      return configuredVpa.trim();
    }
  }
  return DEFAULT_CANTEEN_VPA;
}

/**
 * Generates a standard dynamic UPI URI for QR codes and deep links.
 * Format: upi://pay?pa={vpa}&pn=SPIT+Canteen&am={totalBill}&tr={orderId}&cu=INR
 */
export function buildUpiPaymentUri({
  vpa = getCanteenVpa(),
  payeeName = DEFAULT_CANTEEN_NAME,
  amount,
  transactionRef,
  note,
}: UpiPaymentDetails): string {
  const safeAmount = Math.max(0, amount).toFixed(2);
  const params = new URLSearchParams();
  params.set("pa", vpa);
  params.set("pn", payeeName);
  params.set("am", safeAmount);
  params.set("tr", transactionRef);
  params.set("cu", "INR");
  if (note) {
    params.set("tn", note);
  }

  return `upi://pay?${params.toString()}`;
}

/**
 * Generates a base64 PNG data URL of the UPI QR Code
 */
export async function generateUpiQrCode(upiUri: string): Promise<string> {
  return QRCode.toDataURL(upiUri, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256,
    color: {
      dark: "#2a211b",
      light: "#ffffff",
    },
  });
}
