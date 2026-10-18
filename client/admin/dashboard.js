"use strict";

const token = sessionStorage.getItem("bookshopToken");

let revenueChart = null;
let ordersChart = null;
let analyticsLoading = false;
let mainLoading = false;
let coverPreviewUrl = null;

const $ = id => document.getElementById(id);

const formatMoney = value => new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 2
}).format(Number(value) || 0);

const formatNumber = value => new Intl.NumberFormat("en-KE")
  .format(Number(value) || 0);

const formatDate = value => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-KE");
};

// Always use textContent for database-provided values.
function addCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value == null ? "—" : String(value);
  row.appendChild(cell);
  return cell;
}

function showMessage(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = "message" + (type ? " " + type : "");
}


function showToast(message, type = "info", duration = 4500) {
  const container = $("toastContainer");
  if (!container) {
    console[type === "error" ? "error" : "log"](message);
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast" +
    (["success", "error", "warning"].includes(type) ? " " + type : "");
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = type === "error" ? "×" :
    type === "warning" ? "!" : type === "success" ? "✓" : "i";

  const content = document.createElement("div");
  content.className = "toast-content";

  const title = document.createElement("strong");
  title.className = "toast-title";
  title.textContent = type === "error" ? "Something went wrong" :
    type === "success" ? "Success" :
    type === "warning" ? "Please note" : "Notice";

  const text = document.createElement("div");
  text.className = "toast-text";
  text.textContent = String(message);

  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss notification");
  close.textContent = "×";
  close.addEventListener("click", () => toast.remove());

  content.append(title, text);
  toast.append(icon, content, close);
  container.appendChild(toast);

  while (container.children.length > 5) {
    container.firstElementChild.remove();
  }

  if (duration > 0) {
    window.setTimeout(() => toast.remove(), duration);
  }
}

function showConfirmDialog({
  title = "Please confirm",
  message = "Are you sure you want to continue?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false
} = {}) {
  const dialog = $("confirmDialog");
  if (!dialog || typeof dialog.showModal !== "function") {
    return Promise.resolve(
      window.confirm(String(message))
    );
  }

  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  $("confirmAccept").textContent = confirmText;
  $("confirmCancel").textContent = cancelText;
  $("confirmAccept").className = "button" + (danger ? " danger" : "");
  $("confirmCancel").className = "button secondary";

  return new Promise(resolve => {
    let settled = false;

    const finish = accepted => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("close", onClose);
      $("confirmAccept").removeEventListener("click", onAccept);
      $("confirmCancel").removeEventListener("click", onCancel);
      if (dialog.open) dialog.close();
      resolve(accepted);
    };

    const onAccept = () => finish(true);
    const onCancel = () => finish(false);
    const onClose = () => finish(false);

    $("confirmAccept").addEventListener("click", onAccept);
    $("confirmCancel").addEventListener("click", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.showModal();
    $("confirmCancel").focus();
  });
}

function logout() {
  sessionStorage.removeItem("bookshopToken");
  window.location.replace("/admin/login.html");
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", "Bearer " + token);

  // Do not set Content-Type for FormData: fetch adds the multipart boundary.
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error("Your administrator session has expired or access was denied.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || "Request failed (" + response.status + ").");
  }

  return data;
}

function updateOverviewCards(overview = {}) {
  $("dashTotalOrders").textContent = formatNumber(overview.totalOrders);
  $("dashRecentOrders").textContent =
    formatNumber(overview.recentOrders) + " orders in the last 30 days";
  $("dashRevenue").textContent = formatMoney(overview.paidRevenue30d);
  $("dashBooksSold").textContent = formatNumber(overview.booksSold30d);
  $("dashPendingOrders").textContent = formatNumber(overview.pendingOrders);
  $("dashTotalBooks").textContent = formatNumber(overview.totalBooks);
  $("dashStockUnits").textContent =
    formatNumber(overview.stockUnits) + " copies in stock";
  $("dashLowStock").textContent = formatNumber(overview.lowStockBooks);
}

function drawRevenueChart(sales) {
  if (typeof Chart === "undefined") {
    throw new Error("Chart.js did not load. Check your internet connection.");
  }

  const labels = sales.map(item => new Date(item.date).toLocaleDateString(
    "en-KE", { day: "numeric", month: "short" }
  ));

  if (revenueChart) revenueChart.destroy();

  revenueChart = new Chart($("dashboardRevenueChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Paid revenue (KSh)",
          data: sales.map(item => Number(item.revenue) || 0),
          borderColor: "#236b48",
          backgroundColor: "rgba(35, 107, 72, 0.12)",
          fill: true,
          tension: 0.3,
          yAxisID: "revenue"
        },
        {
          label: "Books sold",
          data: sales.map(item => Number(item.booksSold) || 0),
          borderColor: "#d19a42",
          backgroundColor: "#d19a42",
          tension: 0.3,
          yAxisID: "books"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        revenue: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          title: { display: true, text: "KSh" }
        },
        books: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Books" }
        }
      }
    }
  });
}

function drawOrdersChart(orders) {
  if (typeof Chart === "undefined") return;

  const counts = new Map();

  for (const order of orders) {
    if (!order.created_at) continue;
    const date = new Date(order.created_at);
    if (Number.isNaN(date.getTime())) continue;

    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");

    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const entries = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14);

  if (ordersChart) ordersChart.destroy();

  ordersChart = new Chart($("dashboardOrdersChart"), {
    type: "bar",
    data: {
      labels: entries.map(([date]) => {
        const [year, month, day] = date.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString(
          "en-KE", { day: "numeric", month: "short" }
        );
      }),
      datasets: [{
        label: "Orders received",
        data: entries.map(([, count]) => count),
        backgroundColor: "#80b991",
        hoverBackgroundColor: "#236b48",
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { grid: { display: false } }
      }
    }
  });
}

async function refreshAnalytics() {
  if (analyticsLoading || !token) return;
  analyticsLoading = true;
  $("refreshAnalytics").disabled = true;

  try {
    const [overviewData, salesData, ordersData] = await Promise.all([
      api("/api/analytics/overview"),
      api("/api/analytics/sales?period=day"),
      api("/api/orders/admin")
    ]);

    updateOverviewCards(overviewData.overview || {});
    drawRevenueChart(salesData.sales || []);
    drawOrdersChart(ordersData.orders || []);

    showMessage(
      $("dashboardAnalyticsMessage"),
      "Analytics updated successfully.",
      "success"
    );
    $("dashboardUpdatedAt").textContent =
      "Last refreshed: " + new Date().toLocaleString("en-KE") +
      " · Refreshes every 30 seconds.";
  } catch (error) {
    console.error("Dashboard analytics:", error);
    showMessage(
      $("dashboardAnalyticsMessage"),
      "Could not update analytics: " + error.message,
      "error"
    );
  } finally {
    analyticsLoading = false;
    $("refreshAnalytics").disabled = false;
  }
}

async function loadInventory() {
  const body = $("inventory");
  body.replaceChildren();

  try {
    const data = await api("/api/books/admin");
    const books = Array.isArray(data.books) ? data.books : [];

    $("inventoryCount").textContent = formatNumber(books.length);

    if (!books.length) {
      const row = body.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 7;
      cell.className = "empty";
      cell.textContent = "No books found.";
      return;
    }

    for (const book of books) {
      const row = body.insertRow();
      addCell(row, book.title);
      addCell(row, book.author);
      addCell(row, book.category || "Uncategorised");
      addCell(row, formatMoney(book.price));
      addCell(row, formatNumber(book.stock_quantity));

      const availability = addCell(row, "");
      const badge = document.createElement("span");
      badge.className = "status" +
        (Number(book.stock_quantity) <= 5 ? " warning" : "");
      badge.textContent =
        Number(book.stock_quantity) <= 5 ? "Low stock" : "In stock";
      availability.appendChild(badge);

      const actions = addCell(row, "");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "button secondary";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => startEditingBook(book));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button secondary";
      deleteButton.textContent = "Delete";
      deleteButton.style.marginLeft = "6px";
      deleteButton.addEventListener("click", async () => {
        if (!await showConfirmDialog({
          title: "Delete this book?",
          message: `Delete "${book.title}"? This action cannot be undone.`,
          confirmText: "Delete book",
          danger: true
        })) return;

        deleteButton.disabled = true;

        try {
          const result = await api(
            `/api/books/${encodeURIComponent(book.id)}`,
            { method: "DELETE" }
          );

          const deleteMessage =
            result.message || "Book deleted successfully.";

          showMessage($("formMessage"), deleteMessage, "success");
          showToast(deleteMessage, "success");

          await Promise.all([
            loadInventory(),
            refreshAnalytics().catch(() => {})
          ]);
        } catch (error) {
          const deleteError =
            "Could not delete book: " + error.message;

          showMessage($("formMessage"), deleteError, "error");
          showToast(deleteError, "error");
        } finally {
          deleteButton.disabled = false;
        }
      });

      actions.append(editButton, deleteButton);
    }
  } catch (error) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.className = "empty";
    cell.textContent = "Unable to load inventory: " + error.message;
  }
}

function trackingInput(labelText, value) {
  const wrapper = document.createElement("label");
  wrapper.className = "tracking-field";
  wrapper.appendChild(document.createTextNode(labelText));

  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.className = "table-input";
  input.placeholder = labelText;
  input.value = value === null || value === undefined ? "" : String(value);
  input.style.width = "135px";
  input.style.margin = "4px 4px 4px 0";
  wrapper.appendChild(input);

  return input;
}

function addTrackingControls(row, order) {
  const cell = row.insertCell();
  cell.style.minWidth = "310px";

  const destinationTitle = document.createElement("strong");
  destinationTitle.textContent = "Destination coordinates";
  cell.appendChild(destinationTitle);
  cell.appendChild(document.createElement("br"));

  const destinationLat = trackingInput(
    "Destination latitude", order.delivery_latitude
  );
  const destinationLon = trackingInput(
    "Destination longitude", order.delivery_longitude
  );
  cell.append(destinationLat, destinationLon);

  cell.appendChild(document.createElement("br"));
  const currentTitle = document.createElement("strong");
  currentTitle.textContent = "Current delivery GPS";
  cell.appendChild(currentTitle);
  cell.appendChild(document.createElement("br"));

  const currentLat = trackingInput(
    "Current latitude", order.delivery_current_latitude
  );
  const currentLon = trackingInput(
    "Current longitude", order.delivery_current_longitude
  );
  cell.append(currentLat, currentLon);

  const sharingLabel = document.createElement("label");
  sharingLabel.style.display = "block";
  sharingLabel.style.margin = "8px 0";

  const sharing = document.createElement("input");
  sharing.type = "checkbox";
  sharing.checked = order.delivery_location_sharing === true;
  sharing.style.marginRight = "8px";
  sharingLabel.append(sharing, document.createTextNode("Share current GPS with customer"));
  cell.appendChild(sharingLabel);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "btn btn-primary";
  saveButton.textContent = "Save tracking";
  cell.appendChild(saveButton);

  const feedback = document.createElement("p");
  feedback.setAttribute("role", "status");
  feedback.style.margin = "6px 0";
  cell.appendChild(feedback);

  saveButton.addEventListener("click", async () => {
    const readPair = (latInput, lonInput, label, latKey, lonKey, payload) => {
      const latText = latInput.value.trim();
      const lonText = lonInput.value.trim();

      if (Boolean(latText) !== Boolean(lonText)) {
        throw new Error("Enter both " + label + " latitude and longitude, or leave both blank.");
      }

      if (latText !== "" && lonText !== "") {
        const lat = Number(latText);
        const lon = Number(lonText);

        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          throw new Error(label + " latitude must be between -90 and 90.");
        }
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
          throw new Error(label + " longitude must be between -180 and 180.");
        }

        payload[latKey] = lat;
        payload[lonKey] = lon;
      }
    };

    saveButton.disabled = true;
    feedback.textContent = "Saving…";

    try {
      const payload = { location_sharing: sharing.checked };

      readPair(
        destinationLat, destinationLon, "destination",
        "destination_latitude", "destination_longitude", payload
      );
      readPair(
        currentLat, currentLon, "current GPS",
        "current_latitude", "current_longitude", payload
      );

      const result = await api(
        "/api/orders/admin/" + encodeURIComponent(order.id) + "/tracking",
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );

      feedback.textContent = result.message || "Tracking details saved.";
      feedback.style.color = "green";
    } catch (error) {
      feedback.textContent = error.message || "Could not save tracking details.";
      feedback.style.color = "red";
    } finally {
      saveButton.disabled = false;
    }
  });
}

async function loadOrders() {
  const body = $("ordersList");
  body.replaceChildren();

  try {
    const data = await api("/api/orders/admin");
    const orders = Array.isArray(data.orders) ? data.orders : [];

    $("ordersCount").textContent = formatNumber(orders.length);

    if (!orders.length) {
      const row = body.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 7;
      cell.className = "empty";
      cell.textContent = "No customer orders found.";
      return;
    }

    for (const order of orders) {
      const row = body.insertRow();
      addCell(row, order.order_number || order.id);
      addCell(
        row,
        order.customer_name || order.full_name || order.customer_email || "Customer"
      );
      addCell(row, formatMoney(order.total_amount));

      const paymentCell = addCell(row, "");
      const paymentBadge = document.createElement("span");
      paymentBadge.className = "status";
      paymentBadge.textContent = order.payment_status || "Unknown";
      paymentCell.appendChild(paymentBadge);

      const statusCell = addCell(row, "");
      const statusBadge = document.createElement("span");
      statusBadge.className = "status" +
        (order.order_status === "cancelled" ? " error" :
         order.order_status === "pending" ? " warning" : "");
      statusBadge.textContent = order.order_status || "Unknown";
      statusCell.appendChild(statusBadge);

      const currentStatus = order.order_status || "pending";

      if (currentStatus === "pending") {
        const approveButton = document.createElement("button");
        approveButton.type = "button";
        approveButton.textContent = "Approve order";
        approveButton.style.display = "block";
        approveButton.style.marginTop = "8px";

        approveButton.addEventListener("click", async () => {
          if (!await showConfirmDialog({
            title: "Approve order?",
            message: "Approve order " + (order.order_number || order.id) + "?",
            confirmText: "Approve order"
          })) return;

          approveButton.disabled = true;
          approveButton.textContent = "Approving...";

          try {
            const result = await api(
              "/api/orders/admin/" + encodeURIComponent(order.id) + "/status",
              {
                method: "PATCH",
                body: JSON.stringify({ status: "confirmed" })
              }
            );

            showMessage(
              $("pageMessage"),
              result.message || "Order approved successfully.",
              "success"
            );
            await loadOrders();
          } catch (error) {
            showMessage(
              $("pageMessage"),
              "Could not approve order: " + error.message,
              "error"
            );
            approveButton.disabled = false;
            approveButton.textContent = "Approve order";
          }
        });

        statusCell.appendChild(approveButton);
      }

      const nextStatuses = {
        confirmed: ["processing", "cancelled"],
        processing: ["dispatched", "cancelled"],
        dispatched: ["delivered", "cancelled"]
      };

      const choices = nextStatuses[currentStatus] || [];

      if (choices.length) {
        const statusControls = document.createElement("div");
        statusControls.style.display = "flex";
        statusControls.style.flexDirection = "column";
        statusControls.style.gap = "6px";
        statusControls.style.marginTop = "8px";

        const statusSelect = document.createElement("select");
        statusSelect.setAttribute("aria-label", "Next order status");

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose next status";
        statusSelect.appendChild(placeholder);

        for (const nextStatus of choices) {
          const option = document.createElement("option");
          option.value = nextStatus;
          option.textContent =
            nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1);
          statusSelect.appendChild(option);
        }

        const updateButton = document.createElement("button");
        updateButton.type = "button";
        updateButton.textContent = "Update status";

        updateButton.addEventListener("click", async () => {
          const nextStatus = statusSelect.value;

          if (!nextStatus) {
            showMessage(
              $("pageMessage"),
              "Choose the next status first.",
              "error"
            );
            return;
          }

          if (!await showConfirmDialog({
            title: "Update order status?",
            message: "Change order " + (order.order_number || order.id) +
              " from " + currentStatus + " to " + nextStatus + "?",
            confirmText: "Update status",
            danger: nextStatus === "cancelled"
          })) return;

          updateButton.disabled = true;
          statusSelect.disabled = true;
          updateButton.textContent = "Updating...";

          try {
            const result = await api(
              "/api/orders/admin/" + encodeURIComponent(order.id) + "/status",
              {
                method: "PATCH",
                body: JSON.stringify({ status: nextStatus })
              }
            );

            showMessage(
              $("pageMessage"),
              result.message || "Order status updated.",
              "success"
            );
            await loadOrders();
          } catch (error) {
            showMessage(
              $("pageMessage"),
              "Could not update order: " + error.message,
              "error"
            );
            updateButton.disabled = false;
            statusSelect.disabled = false;
            updateButton.textContent = "Update status";
          }
        });

        statusControls.append(statusSelect, updateButton);
        statusCell.appendChild(statusControls);
      }

      addCell(row, formatDate(order.created_at));
      addTrackingControls(row, order);
    }
  } catch (error) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.className = "empty";
    cell.textContent = "Unable to load orders: " + error.message;
  }
}

async function refreshMainTables() {
  if (mainLoading || !token) return;
  mainLoading = true;
  $("refreshButton").disabled = true;

  try {
    await Promise.all([loadInventory(), loadOrders()]);
    showMessage($("pageMessage"), "Administrator dashboard loaded.", "success");
  } catch (error) {
    showMessage($("pageMessage"), error.message, "error");
  } finally {
    mainLoading = false;
    $("refreshButton").disabled = false;
  }
}

let editingBookId = null;

function clearCoverPreview() {
  if (coverPreviewUrl) {
    URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = null;
  }

  if (coverPreview) {
    coverPreview.hidden = true;
    coverPreview.removeAttribute("src");
  }
}

function resetBookForm() {
  editingBookId = null;
  $("bookForm").reset();
  clearCoverPreview();

  $("bookFormHeading").textContent = "Add a new book";
  $("bookFormDescription").textContent = "Add a title to your book catalogue.";
  $("saveBookButton").textContent = "Save book";
  $("cancelEditButton").hidden = true;
}

function startEditingBook(book) {
  editingBookId = String(book.id);

  $("title").value = book.title || "";
  $("author").value = book.author || "";
  $("category").value = book.category || "";
  $("price").value = book.price ?? "";
  $("stock_quantity").value = book.stock_quantity ?? 0;
  $("description").value = book.description || "";

  clearCoverPreview();
  if (coverInput) coverInput.value = "";

  if (coverPreview && book.cover_image) {
    coverPreview.src = book.cover_image;
    coverPreview.hidden = false;
  }

  $("bookFormHeading").textContent = "Edit book";
  $("bookFormDescription").textContent =
    "Update the details below. Leave the cover field empty to keep the current cover.";
  $("saveBookButton").textContent = "Save changes";
  $("cancelEditButton").hidden = false;

  showMessage($("formMessage"), `Editing: ${book.title || "Selected book"}`);
  $("bookForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

const coverInput = $("cover_image");
const coverPreview = $("coverPreview");

if (coverInput && coverPreview) {
  coverInput.addEventListener("change", () => {
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
      coverPreviewUrl = null;
    }

    const file = coverInput.files && coverInput.files[0];

    if (!file) {
      coverPreview.hidden = true;
      coverPreview.removeAttribute("src");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
      showToast("Choose a JPG, PNG, or WebP image no larger than 5 MB.", "error");
      coverInput.value = "";
      coverPreview.hidden = true;
      coverPreview.removeAttribute("src");
      return;
    }

    coverPreviewUrl = URL.createObjectURL(file);
    coverPreview.src = coverPreviewUrl;
    coverPreview.hidden = false;
  });
}

$("bookForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("saveBookButton");
  const wasEditing = editingBookId !== null;
  button.disabled = true;

  showMessage(
    $("formMessage"),
    wasEditing ? "Updating book..." : "Saving book..."
  );

  const form = new FormData(event.currentTarget);
  const url = wasEditing
    ? `/api/books/${encodeURIComponent(editingBookId)}`
    : "/api/books";
  const method = wasEditing ? "PUT" : "POST";

  try {
    const result = await api(url, {
      method,
      body: form
    });

    resetBookForm();

    const saveMessage = result.message || (
      wasEditing
        ? "Book updated successfully."
        : "Book saved successfully."
    );

    showMessage($("formMessage"), saveMessage, "success");
    showToast(saveMessage, "success");

    await Promise.all([
      loadInventory(),
      refreshAnalytics().catch(() => {})
    ]);
  } catch (error) {
    const saveError =
      (wasEditing ? "Could not update book: " : "Could not save book: ") +
      error.message;

    showMessage($("formMessage"), saveError, "error");
    showToast(saveError, "error");
  } finally {
    button.disabled = false;
  }
});

$("cancelEditButton").addEventListener("click", () => {
  resetBookForm();
  showMessage($("formMessage"), "Editing cancelled.");
});

$("refreshAnalytics").addEventListener("click", refreshAnalytics);
$("refreshButton").addEventListener("click", refreshMainTables);
$("refreshInventoryButton").addEventListener("click", loadInventory);
$("refreshOrdersButton").addEventListener("click", loadOrders);
$("logoutButton").addEventListener("click", logout);

if (!token) {
  window.location.replace("/admin/login.html");
} else {
  refreshMainTables();
  refreshAnalytics();
  setInterval(refreshAnalytics, 30000);
  setInterval(refreshMainTables, 30000);
}
