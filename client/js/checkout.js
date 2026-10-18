"use strict";

const CART_KEY = "chachaCart";
const DELIVERY_FEE = 250;

const form = document.getElementById("checkoutForm");
const message = document.getElementById("checkoutMessage");
const itemsElement = document.getElementById("checkoutItems");
const subtotalElement = document.getElementById("checkoutSubtotal");
const deliveryElement = document.getElementById("checkoutDelivery");
const totalElement = document.getElementById("checkoutTotal");
const addressField = document.getElementById("addressField");
const addressInput = document.getElementById("deliveryAddress");
const submitButton = document.getElementById("placeOrderButton");

let cart = [];
let booksById = new Map();
let booksLoaded = false;
let submitting = false;

function formatKES(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function readCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY) || "[]");

    if (!Array.isArray(stored)) return [];

    return stored.filter(item =>
      item &&
      /^[1-9]\d{0,17}$/.test(String(item.id)) &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity >= 1 &&
      item.quantity <= 100
    ).map(item => ({
      id: String(item.id),
      quantity: item.quantity
    }));
  } catch {
    return [];
  }
}

function showMessage(text, type = "error") {
  message.textContent = text;
  message.classList.toggle("error", type === "error");
  message.classList.toggle("success", type === "success");
}

function selectedDeliveryMethod() {
  return form.querySelector(
    'input[name="deliveryMethod"]:checked'
  )?.value || "delivery";
}

function updateDeliveryFields() {
  const delivery = selectedDeliveryMethod() === "delivery";

  addressField.hidden = !delivery;
  addressInput.required = delivery;

  renderSummary();
}

function makeElement(tag, text, className) {
  const element = document.createElement(tag);

  if (text !== undefined) {
    element.textContent = text;
  }

  if (className) {
    element.className = className;
  }

  return element;
}

function renderSummary() {
  itemsElement.replaceChildren();

  let subtotal = 0;
  let totalQuantity = 0;

  for (const item of cart) {
    const book = booksById.get(item.id);

    if (!book) continue;

    const price = Number(book.price);

    if (!Number.isFinite(price) || price < 0) continue;

    const lineTotal = price * item.quantity;

    subtotal += lineTotal;
    totalQuantity += item.quantity;

    const row = makeElement("div", undefined, "checkout-item");
    const details = makeElement("div", undefined, "checkout-item-details");

    details.append(
      makeElement("strong", book.title || "Book"),
      makeElement("span", `Quantity: ${item.quantity}`)
    );

    row.append(
      details,
      makeElement("strong", formatKES(lineTotal))
    );

    itemsElement.appendChild(row);
  }

  const delivery = selectedDeliveryMethod() === "delivery"
    && totalQuantity > 0
    ? DELIVERY_FEE
    : 0;

  subtotalElement.textContent = formatKES(subtotal);
  deliveryElement.textContent = formatKES(delivery);
  totalElement.textContent = formatKES(subtotal + delivery);

  if (totalQuantity === 0) {
    itemsElement.appendChild(
      makeElement("p", "Your cart is empty. Please add books before checkout.")
    );
  }

  submitButton.disabled =
    !booksLoaded || totalQuantity === 0 || submitting;
}

async function loadCheckout() {
  cart = readCart();

  try {
    const response = await fetch("/api/books");
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to load books.");
    }

    const books = Array.isArray(result.books)
      ? result.books
      : Array.isArray(result.data)
        ? result.data
        : Array.isArray(result)
          ? result
          : null;

    if (!books) {
      throw new Error("The books API returned an unexpected response.");
    }

    booksById = new Map(
      books.map(book => [String(book.id), book])
    );

    // Remove unavailable books from the checkout cart.
    const previousLength = cart.length;
    cart = cart.filter(item => booksById.has(item.id));

    if (cart.length !== previousLength) {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      showMessage(
        "Some unavailable books were removed from your cart.",
        "success"
      );
    }

    booksLoaded = true;
    renderSummary();
  } catch (error) {
    console.error("Checkout loading error:", error);
    showMessage(
      "We could not load your books. Refresh the page and try again."
    );
    itemsElement.textContent = "Unable to load your order summary.";
    submitButton.disabled = true;
  }
}

form.querySelectorAll('input[name="deliveryMethod"]').forEach(input => {
  input.addEventListener("change", updateDeliveryFields);
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (submitting) return;

  if (!booksLoaded) {
    showMessage("Please wait while your books load.");
    return;
  }

  cart = readCart();

  if (cart.length === 0) {
    showMessage("Your cart is empty. Add books before placing an order.");
    renderSummary();
    return;
  }

  const formData = new FormData(form);
  const deliveryMethod = formData.get("deliveryMethod");
  const paymentMethod = formData.get("paymentMethod");
  const deliveryAddress = String(
    formData.get("deliveryAddress") || ""
  ).trim();

  if (
    deliveryMethod === "delivery" &&
    deliveryAddress.length < 5
  ) {
    showMessage("Please enter a complete delivery address.");
    addressInput.focus();
    return;
  }

  if (!["mpesa", "card", "cash_on_delivery"].includes(paymentMethod)) {
    showMessage("Please select a payment method.");
    return;
  }

  // Check current stock for a helpful message.
  // The server will check stock again when creating the order.
  for (const item of cart) {
    const book = booksById.get(item.id);

    if (!book) {
      showMessage("A book in your cart is no longer available.");
      return;
    }

    if (Number(book.stock_quantity) < item.quantity) {
      showMessage(
        `Not enough stock for "${book.title}". Please update your cart.`
      );
      return;
    }
  }

  const payload = {
    customer_name: String(formData.get("customerName") || "").trim(),
    customer_email: String(formData.get("customerEmail") || "").trim(),
    customer_phone: String(formData.get("customerPhone") || "").trim(),
    delivery_method: deliveryMethod,
    delivery_address: deliveryMethod === "delivery"
      ? deliveryAddress
      : null,
    payment_method: paymentMethod,
    items: cart.map(item => ({
      id: item.id,
      quantity: item.quantity
    }))
  };

  submitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "Placing your order...";
  showMessage("");

  try {
    const token = localStorage.getItem("chachaCustomerToken");

    if (!token) {
      const next = encodeURIComponent("/pages/checkout.html");
      window.location.href = `/pages/login.html?next=${next}`;
      return;
    }

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      localStorage.removeItem("chachaCustomerToken");
      const next = encodeURIComponent("/pages/checkout.html");
      window.location.href = `/pages/login.html?next=${next}`;
      return;
    }

    const result = await response.json();

    if (!response.ok || result.success !== true || !result.order) {
      throw new Error(
        result.message || "The order could not be created."
      );
    }

    // Clear the cart only after the server confirms order creation.
    localStorage.removeItem(CART_KEY);

    document.querySelector(".checkout-layout").hidden = true;

    const confirmation = document.getElementById("orderConfirmation");
    confirmation.hidden = false;

    document.getElementById("confirmationOrderNumber").textContent =
      result.order.order_number || "Order received";

    document.getElementById("confirmationTotal").textContent =
      formatKES(Number(result.order.total_amount));

    let confirmationText = result.message ||
      "Your order has been received.";

    if (paymentMethod === "mpesa" || paymentMethod === "card") {
      confirmationText +=
        " Your online payment is still pending. No payment is confirmed by this order response.";
    } else {
      confirmationText +=
        " Please pay when your order is delivered.";
    }

    document.getElementById("confirmationMessage").textContent =
      confirmationText;

    const trackingLink = document.createElement("a");
    trackingLink.className = "primary-button";
    trackingLink.href = result.order.tracking_url;
    trackingLink.textContent = "Track your order →";
    trackingLink.style.marginRight = "12px";
    trackingLink.style.marginBottom = "12px";
    trackingLink.style.display = "inline-flex";
    trackingLink.rel = "noopener";
    const continueLink = confirmation.querySelector('a[href="/"]');
    if (continueLink) {
      confirmation.insertBefore(trackingLink, continueLink);
    } else {
      confirmation.appendChild(trackingLink);
    }


    showMessage("Order created successfully.", "success");

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("Checkout submission error:", error);

    showMessage(
      error.message ||
      "Something went wrong. Please try again."
    );
  } finally {
    submitting = false;
    submitButton.innerHTML = 'Place Order <span>→</span>';

    if (document.getElementById("orderConfirmation").hidden) {
      renderSummary();
    }
  }
});

document.getElementById("currentYear").textContent =
  new Date().getFullYear();

updateDeliveryFields();
loadCheckout();
