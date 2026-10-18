"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const token = sessionStorage.getItem("bookshopToken");
  const message = document.getElementById("reportDownloadMessage");
  const buttons = document.querySelectorAll("[data-report]");

  buttons.forEach(button => {
    button.addEventListener("click", async () => {
      const type = button.dataset.report;

      if (!["books", "orders", "deliveries"].includes(type)) return;

      if (!token) {
        message.textContent = "Please log in to the admin dashboard again.";
        return;
      }

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Preparing report…";
      message.textContent = "";

      let objectUrl;

      try {
        const response = await fetch(`/api/reports/${type}.csv`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store"
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(
            `Download failed (${response.status}). ${detail.slice(0, 180)}`
          );
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = {
          books: "book-inventory-report.csv",
          orders: "orders-report.csv",
          deliveries: "deliveries-report.csv"
        }[type];

        document.body.appendChild(link);
        link.click();
        link.remove();

        message.textContent = "Your report download has started.";
      } catch (error) {
        console.error("Report download error:", error);
        message.textContent = error.message || "Could not download report.";
      } finally {
        if (objectUrl) {
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        }
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
});
