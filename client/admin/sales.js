"use strict";

const periodSelect = document.getElementById("period");
const message = document.getElementById("analyticsMessage");
const refreshButton = document.getElementById("refreshButton");
const logoutButton = document.getElementById("logoutButton");

const money = value =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);

const number = value =>
  new Intl.NumberFormat("en-KE").format(Number(value) || 0);

let revenueChart;
let booksChart;
let loading = false;

function logout() {
  sessionStorage.removeItem("bookshopToken");
  window.location.replace("/admin/login.html");
}

logoutButton.addEventListener("click", logout);

function getLabels(rows, period) {
  return rows.map(row => {
    const date = new Date(row.date);

    if (Number.isNaN(date.getTime())) return "Unknown";

    if (period === "day") {
      return date.toLocaleDateString("en-KE", {
        day: "numeric",
        month: "short"
      });
    }

    if (period === "month") {
      return date.toLocaleDateString("en-KE", {
        month: "short",
        year: "numeric"
      });
    }

    return date.getFullYear().toString();
  });
}

function drawCharts(rows, period) {
  if (typeof Chart === "undefined") {
    throw new Error("Chart library could not load. Check your internet connection.");
  }

  const labels = getLabels(rows, period);

  if (revenueChart) revenueChart.destroy();
  if (booksChart) booksChart.destroy();

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true }
      },
      y: {
        beginAtZero: true,
        grid: { color: "#edf1eb" },
        ticks: { precision: 0 }
      }
    }
  };

  revenueChart = new Chart(
    document.getElementById("revenueChart"),
    {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Paid revenue (KSh)",
          data: rows.map(row => Number(row.revenue) || 0),
          borderColor: "#236b48",
          backgroundColor: "rgba(35, 107, 72, 0.12)",
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 6
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            ...commonOptions.scales.y,
            ticks: {
              callback: value => "KSh " + number(value)
            }
          }
        }
      }
    }
  );

  booksChart = new Chart(
    document.getElementById("booksChart"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Books sold",
          data: rows.map(row => Number(row.booksSold) || 0),
          backgroundColor: "#80b991",
          hoverBackgroundColor: "#236b48",
          borderRadius: 6,
          maxBarThickness: 34
        }]
      },
      options: commonOptions
    }
  );
}

async function loadSales() {
  if (loading) return;

  const token = sessionStorage.getItem("bookshopToken");

  if (!token) {
    message.textContent = "Your admin session is missing. Redirecting to login...";
    window.location.replace("/admin/login.html");
    return;
  }

  loading = true;
  refreshButton.disabled = true;
  message.textContent = "Loading your latest sales data...";

  try {
    const period = periodSelect.value;
    const response = await fetch(
      `/api/analytics/sales?period=${encodeURIComponent(period)}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const result = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      logout();
      return;
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Could not load sales analytics.");
    }

    const totals = result.totals || {};

    document.getElementById("revenueTotal").textContent =
      money(totals.revenue);

    document.getElementById("booksTotal").textContent =
      number(totals.booksSold);

    document.getElementById("ordersTotal").textContent =
      number(totals.paidOrders);

    drawCharts(
      Array.isArray(result.sales) ? result.sales : [],
      result.period || period
    );

    message.textContent = result.description || "Sales data loaded successfully.";

    document.getElementById("updatedAt").textContent =
      "Last updated: " +
      new Date(result.updatedAt || Date.now()).toLocaleString("en-KE");
  } catch (error) {
    console.error("Sales analytics error:", error);
    message.textContent =
      error.message || "Unable to load sales. Check the server and try again.";
  } finally {
    loading = false;
    refreshButton.disabled = false;
  }
}

periodSelect.addEventListener("change", loadSales);
refreshButton.addEventListener("click", loadSales);

loadSales();
setInterval(loadSales, 30000);
