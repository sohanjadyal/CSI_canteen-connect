import { describe, expect, it } from "vitest";
import {
  buildUpiPaymentUri,
  generateUpiQrCode,
  getCanteenVpa,
  DEFAULT_CANTEEN_VPA,
  DEFAULT_CANTEEN_NAME,
} from "./upi";

describe("UPI payment URI and QR code generation", () => {
  it("resolves canteen VPA from environment config or fallback", () => {
    const originalEnv = import.meta.env.VITE_CANTEEN_UPI_VPA;
    try {
      import.meta.env.VITE_CANTEEN_UPI_VPA = "canteen-merchant@okhdfcbank";
      expect(getCanteenVpa()).toBe("canteen-merchant@okhdfcbank");

      const uri = buildUpiPaymentUri({
        amount: 100,
        transactionRef: "TXN-ENV-TEST",
      });
      const search = new URLSearchParams(uri.replace("upi://pay?", ""));
      expect(search.get("pa")).toBe("canteen-merchant@okhdfcbank");
    } finally {
      if (originalEnv !== undefined) {
        import.meta.env.VITE_CANTEEN_UPI_VPA = originalEnv;
      } else {
        delete (import.meta.env as Record<string, unknown>).VITE_CANTEEN_UPI_VPA;
      }
    }
  });

  it("falls back to default VPA when environment config is empty", () => {
    const originalCanteen = import.meta.env.VITE_CANTEEN_UPI_VPA;
    const originalUpi = import.meta.env.VITE_UPI_VPA;
    try {
      delete (import.meta.env as Record<string, unknown>).VITE_CANTEEN_UPI_VPA;
      delete (import.meta.env as Record<string, unknown>).VITE_UPI_VPA;
      expect(getCanteenVpa()).toBe(DEFAULT_CANTEEN_VPA);
    } finally {
      if (originalCanteen !== undefined) {
        import.meta.env.VITE_CANTEEN_UPI_VPA = originalCanteen;
      }
      if (originalUpi !== undefined) {
        import.meta.env.VITE_UPI_VPA = originalUpi;
      }
    }
  });

  it("builds a valid dynamic UPI URI with default canteen VPA", () => {
    const uri = buildUpiPaymentUri({
      amount: 145.5,
      transactionRef: "CC123456",
    });

    expect(uri.startsWith("upi://pay?")).toBe(true);
    const search = new URLSearchParams(uri.replace("upi://pay?", ""));

    expect(search.get("pa")).toBe(getCanteenVpa());
    expect(search.get("pn")).toBe(DEFAULT_CANTEEN_NAME);
    expect(search.get("am")).toBe("145.50");
    expect(search.get("tr")).toBe("CC123456");
    expect(search.get("cu")).toBe("INR");
  });

  it("supports custom VPA and note", () => {
    const uri = buildUpiPaymentUri({
      vpa: "spit.canteen@okhdfcbank",
      payeeName: "Sardar Patel Canteen",
      amount: 200,
      transactionRef: "TXN-999",
      note: "Lunch Order 999",
    });

    const search = new URLSearchParams(uri.replace("upi://pay?", ""));
    expect(search.get("pa")).toBe("spit.canteen@okhdfcbank");
    expect(search.get("pn")).toBe("Sardar Patel Canteen");
    expect(search.get("am")).toBe("200.00");
    expect(search.get("tr")).toBe("TXN-999");
    expect(search.get("tn")).toBe("Lunch Order 999");
  });

  it("handles edge cases for zero or negative amount gracefully", () => {
    const uri = buildUpiPaymentUri({
      amount: -10,
      transactionRef: "TXN-ZERO",
    });

    const search = new URLSearchParams(uri.replace("upi://pay?", ""));
    expect(search.get("am")).toBe("0.00");
  });

  it("generates a valid QR code base64 Data URL", async () => {
    const uri = buildUpiPaymentUri({
      amount: 50,
      transactionRef: "QRTEST123",
    });

    const qrDataUrl = await generateUpiQrCode(uri);
    expect(qrDataUrl).toBeDefined();
    expect(qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
