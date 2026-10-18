"use strict";

const tokenKey = "chachaCustomerToken";
const token = localStorage.getItem(tokenKey);

const message = document.getElementById("message");
const ordersContainer = document.getElementById("ordersContainer");
const logoutButton = document.getElementById("logoutButton");

document.getElementById("year").textContent = new Date().getFullYear();

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = "message";

  if (type) {
    message.classList.add(type);
  }

  message.hidden = !text;
}

function formatMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "Amount unavailable";
  }

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES"
  }).format(amount);
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = String(text);
  }

  return element;
}

function makeStatus(value) {
  const status = String(value || "unknown").toLowerCase();
  return createElement("span", `status ${status}`, status.replaceAll("_", " "));
}

function renderOrder(order) {
  const card = createElement("article", "order-card");

  const top = createElement("div", "order-top");
  const heading = document.createElement("div");
  heading.append(
    createElement("h2", "", `Order ${order.order_number}`),
    createElement("div", "order-date", formatDate(order.created_at))
  );

  const statusBox = document.createElement("div");
  statusBox.append(makeStatus(order.order_status));

  top.append(heading, statusBox);

  const body = createElement("div", "order-body");
  body.append(createElement("h3", "", "Items ordered"));

  const list = createElement("ul", "items");
  const items = Array.isArray(order.items) ? order.items : [];

  if (items.length === 0) {
    list.append(createElement("li", "", "No item details available."));
  } else {
    for (const item of items) {
      const row = document.createElement("li");
      const description = document.createElement("div");

      description.append(
        createElement("div", "item-name", item.title || "Book"),
        createElement("div", "item-quantity", `Quantity: ${item.quantity}`)
      );

      row.append(
        description,
        createElement("strong", "", formatMoney(item.line_total))
      );

      list.append(row);
    }
  }

  body.append(list);

  const meta = createElement("div", "order-meta");

  const payment = document.createElement("div");
  payment.append(
    createElement("span", "meta-label", "Payment status"),
    makeStatus(order.payment_status)
  );

  const method = document.createElement("div");
  method.append(
    createElement("span", "meta-label", "Payment method"),
    createElement("span", "meta-value", order.payment_method || "Not specified")
  );

  const delivery = document.createElement("div");
  delivery.append(
    createElement("span", "meta-label", "Delivery method"),
    createElement("span", "meta-value", order.delivery_method || "Not specified")
  );

  const deliveryFee = document.createElement("div");
  deliveryFee.append(
    createElement("span", "meta-label", "Delivery fee"),
    createElement("span", "meta-value", formatMoney(order.delivery_fee))
  );

  meta.append(payment, method, delivery, deliveryFee);
  body.append(meta);

  const total = createElement("div", "order-total");
  total.append(
    createElement("span", "", "Order total"),
    createElement("span", "", formatMoney(order.total_amount))
  );

  body.append(total);
  card.append(top, body);

  return card;
}

async function loadOrders() {
  if (!token) {
    const next = encodeURIComponent("/pages/my-orders.html");
    window.location.replace(`/pages/login.html?next=${next}`);
    return;
  }

  try {
    const response = await fetch("/api/orders/mine", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      },
      cache: "no-store"
    });

    if (response.status === 401) {
      localStorage.removeItem(tokenKey);
      const next = encodeURIComponent("/pages/my-orders.html");
      window.location.replace(`/pages/login.html?next=${next}`);
      return;
    }

    const result = await response.json();

    if (response.status === 403) {
      showMessage(result.message || "A customer account is required to view orders.", "error");
      return;
    }

    if (!response.ok || result.success !== true || !Array.isArray(result.orders)) {
      throw new Error(result.message || "Unable to load your orders.");
    }

    ordersContainer.replaceChildren();

    if (result.orders.length === 0) {
      const empty = createElement("div", "empty-state");
      empty.append(
        createElement("h2", "", "No orders yet"),
        createElement("p", "", "Your book purchases will appear here after you place an order."),
        createElement("a", "", "Browse the bookshop")
      );

      const browseLink = empty.querySelector("a");
      browseLink.href = "/";
      ordersContainer.append(empty);
      showMessage("Your order history is empty.");
      return;
    }

    for (const order of result.orders) {
      ordersContainer.append(renderOrder(order));
    }

    showMessage(`You have ${result.orders.length} order(s).`, "success");
  } catch (error) {
    console.error("Could not load customer orders:", error);
    showMessage(error.message || "Something went wrong while loading your orders.", "error");
  }
}

logoutButton.addEventListener("click", () => {
  localStorage.removeItem(tokenKey);
  window.location.replace("/pages/login.html");
});

loadOrders();
