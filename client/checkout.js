
"use strict";

const CART_KEY = "chachaCart";
const DELIVERY_FEE = 250;

const form = document.getElementById("checkoutForm");
const placeOrderButton = document.getElementById("placeOrderButton");
const message = document.getElementById("checkoutMessage");
const addressField = document.getElementById("addressField");
const addressInput = document.getElementById("deliveryAddress");

let cart = [];
let booksById = new Map();
let cartReady = false;
let submitting = false;

function money(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `checkout-message ${type}`;
  message.hidden = false;
}

function getCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(item =>
      item &&
      /^\d+$/.test(String(item.id)) &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0
    ).map(item => ({
      id: String(item.id),
      quantity: item.quantity
    }));
  } catch {
    return [];
  }
}

function selectedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function getDeliveryFee() {
  return selectedValue("deliveryMethod") === "delivery"
    ? DELIVERY_FEE
    : 0;
}

function updateDeliveryFields() {
  const isDelivery = selectedValue("deliveryMethod") === "delivery";

  addressField.hidden = !isDelivery;
  addressInput.required = isDelivery;

  renderSummary();
}

function renderSummary() {
  const itemsContainer = document.getElementById("checkoutItems");
  itemsContainer.replaceChildren();

  let subtotal = 0;

  for (const item of cart) {
    const book = booksById.get(item.id);
    if (!book) continue;

    const lineTotal = Number(book.price) * item.quantity;
    subtotal += lineTotal;

    const row = document.createElement("div");
    row.className = "checkout-item";

    const name = document.createElement("div");
    name.className = "checkout-item-name";

    const title = document.createElement("strong");
    title.textContent = book.title;

    const quantity = document.createElement("small");
    quantity.textContent = `Qty: ${item.quantity}`;

    name.append(title, quantity);

    const price = document.createElement("strong");
    price.className = "checkout-item-price";
    price.textContent = money(lineTotal);

    row.append(name, price);
    itemsContainer.appendChild(row);
  }

  const delivery = getDeliveryFee();

  document.getElementById("checkoutSubtotal").textContent = money(subtotal);
  document.getElementById("checkoutDelivery").textContent = money(delivery);
  document.getElementById("checkoutTotal").textContent =
    money(subtotal + delivery);

  placeOrderButton.disabled = !cartReady || cart.length === 0 || submitting;
}

async function loadCheckout() {
  cart = getCart();

  if (cart.length === 0) {
    cartReady = true;
    showMessage("Your cart is empty. Browse the book collection to get started.");
    document.getElementById("checkoutItems").textContent = "No books in your cart.";
    placeOrderButton.disabled = true;
    return;
  }

  try {
    const response = await fetch("/api/books");

    if (!response.ok) {
      throw new Error("Could not load the book collection.");
    }

    const result = await response.json();
    const books = Array.isArray(result) ? result : result.data;

    if (!Array.isArray(books)) {
      throw new Error("Unexpected book API response.");
    }

    booksById = new Map(books.map(book => [String(book.id), book]));

    cart = cart.filter(item => {
      const book = booksById.get(item.id);
      return book && Number(book.stock_quantity) >= item.quantity;
    });

    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    cartReady = true;

    if (cart.length === 0) {
      showMessage("Your cart is empty or some books are no longer available. Please browse the collection again.");
    } else {
      message.hidden = true;
    }

    renderSummary();
  } catch (error) {
    console.error(error);
    showMessage("We couldn't load your order summary. Please refresh and try again.");
    placeOrderButton.disabled = true;
  }
}

function showConfirmation(order) {
  form.hidden = true;
  document.querySelector(".checkout-summary").hidden = true;
  document.querySelector(".checkout-steps").hidden = true;
  document.querySelector(".checkout-heading").hidden = true;

  document.getElementById("confirmationOrderNumber").textContent =
    order.orderNumber || order.order_number || "Order received";

  document.getElementById("confirmationTotal").textContent =
    money(Number(order.total));

  const paymentMethod = selectedValue("paymentMethod");
  let confirmationText =
    "Your order has been received. Keep your order reference for future enquiries.";

  if (paymentMethod === "mpesa" || paymentMethod === "card") {
    confirmationText +=
      " Your payment preference has been recorded, but online payment is not yet activated. Your order is not confirmed as paid.";
  } else {
    confirmationText +=
      " Payment is still pending. Our team will need to coordinate fulfilment and payment collection.";
  }

  document.getElementById("confirmationMessage").textContent = confirmationText;
  document.getElementById("orderConfirmation").hidden = false;
  message.hidden = true;
}

form.addEventListener("change", event => {
  if (event.target.name === "deliveryMethod") {
    updateDeliveryFields();
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (submitting || !cartReady || cart.length === 0) {
    showMessage("Please check your cart before placing an order.");
    return;
  }

  if (!form.reportValidity()) return;

  const deliveryMethod = selectedValue("deliveryMethod");
  const paymentMethod = selectedValue("paymentMethod");

  if (!["delivery", "collection"].includes(deliveryMethod)) {
    showMessage("Please select delivery or collection.");
    return;
  }

  if (!["mpesa", "card", "cash_on_delivery"].includes(paymentMethod)) {
    showMessage("Please select a payment preference.");
    return;
  }

  if (deliveryMethod === "delivery" && !addressInput.value.trim()) {
    showMessage("Please enter your delivery address.");
    addressInput.focus();
    return;
  }

  const data = {
    customer_name: document.getElementById("customerName").value.trim(),
    customer_email: document.getElementById("customerEmail").value.trim(),
    customer_phone: document.getElementById("customerPhone").value.trim(),
    delivery_method: deliveryMethod,
    delivery_address: deliveryMethod === "delivery"
      ? addressInput.value.trim()
      : null,
    payment_method: paymentMethod,
    items: cart.map(item => ({
      id: item.id,
      quantity: item.quantity
    }))
  };

  submitting = true;
  placeOrderButton.disabled = true;
  placeOrderButton.textContent = "Placing your order...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "We couldn't place your order.");
    }

    const order = result.order || result.data || result;

    if (!order.orderNumber && !order.order_number) {
      throw new Error("The server response did not include an order reference. Please contact the bookshop before retrying.");
    }

    // The order exists on the server, so clear the cart only after success.
    localStorage.removeItem(CART_KEY);
    showConfirmation(order);
  } catch (error) {
    console.error(error);
    showMessage(
      error.message || "Something went wrong. Please try again.",
      "error"
    );
  } finally {
    submitting = false;

    if (!form.hidden) {
      placeOrderButton.disabled = !cartReady || cart.length === 0;
      placeOrderButton.textContent = "Place Order →";
    }
  }
});

document.getElementById("currentYear").textContent =
  new Date().getFullYear();

updateDeliveryFields();
loadCheckout();
