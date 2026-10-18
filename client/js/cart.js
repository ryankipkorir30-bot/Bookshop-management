
"use strict";

const CART_KEY = "chachaCart";
const DELIVERY_FEE = 250;

const cartItemsElement = document.getElementById("cartItems");
const emptyCartElement = document.getElementById("emptyCart");
const cartMessage = document.getElementById("cartMessage");
const checkoutButton = document.getElementById("checkoutButton");

let booksById = new Map();
let cart = [];
let booksLoaded = false;

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
    const value = JSON.parse(localStorage.getItem(CART_KEY) || "[]");

    if (!Array.isArray(value)) return [];

    return value.filter(item =>
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

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById("cartCount").textContent = String(count);
}

function showMessage(text) {
  cartMessage.textContent = text;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

function makeBookCover(book) {
  const image = document.createElement("img");
  image.className = "cart-book-cover";
  image.alt = `Cover of ${book.title}`;
  image.loading = "lazy";

  if (book.cover_image) {
    image.src = book.cover_image.startsWith("/") || /^https?:\/\//i.test(book.cover_image)
      ? book.cover_image
      : `/uploads/books/${encodeURIComponent(book.cover_image)}`;

    image.onerror = () => {
      image.removeAttribute("src");
      image.alt = "Book cover unavailable";
    };
  } else {
    image.alt = "No cover available";
  }

  return image;
}

function renderCart() {
  cartItemsElement.replaceChildren();

  let subtotal = 0;
  let totalQuantity = 0;

  const validItems = cart.filter(item => booksById.has(item.id));

  for (const item of validItems) {
    const book = booksById.get(item.id);
    const price = Number(book.price);
    const stock = Math.max(0, Number(book.stock_quantity) || 0);
    subtotal += price * item.quantity;
    totalQuantity += item.quantity;

    const row = makeElement("article", "cart-item");
    const imageLink = makeElement("a", "cart-image-link");
    imageLink.href = `/pages/book.html?id=${encodeURIComponent(book.id)}`;
    imageLink.appendChild(makeBookCover(book));

    const info = makeElement("div", "cart-item-info");
    const title = makeElement("h3", "", book.title);
    const titleLink = makeElement("a", "cart-book-title");
    titleLink.href = imageLink.href;
    titleLink.appendChild(title);

    const author = makeElement("p", "cart-book-author",
      `By ${book.author || "Unknown author"}`);

    const unitPrice = makeElement("p", "cart-unit-price", formatKES(price));

    const quantityLabel = makeElement("label", "cart-quantity-label", "Quantity");
    const quantityControls = makeElement("div", "cart-quantity-controls");

    const decrease = makeElement("button", "", "−");
    decrease.type = "button";
    decrease.setAttribute("aria-label", `Decrease quantity of ${book.title}`);
    decrease.disabled = item.quantity <= 1;
    decrease.addEventListener("click", () => changeQuantity(item.id, -1));

    const quantity = makeElement("span", "cart-quantity", String(item.quantity));

    const increase = makeElement("button", "", "+");
    increase.type = "button";
    increase.setAttribute("aria-label", `Increase quantity of ${book.title}`);
    increase.disabled = item.quantity >= stock;
    increase.addEventListener("click", () => changeQuantity(item.id, 1));

    quantityControls.append(decrease, quantity, increase);
    quantityLabel.appendChild(quantityControls);

    const remove = makeElement("button", "cart-remove", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => removeItem(item.id));

    info.append(titleLink, author, unitPrice, quantityLabel, remove);

    const lineTotal = makeElement(
      "strong",
      "cart-line-total",
      formatKES(price * item.quantity)
    );

    row.append(imageLink, info, lineTotal);
    cartItemsElement.appendChild(row);
  }

  const missingItems = cart.length - validItems.length;

  if (missingItems > 0) {
    showMessage(
      "Some books are no longer available. Their entries have been removed from your cart."
    );
    cart = validItems;
    saveCart();
  }

  const hasItems = validItems.length > 0;
  emptyCartElement.hidden = hasItems;
  cartItemsElement.hidden = !hasItems;
  document.querySelector(".order-summary").hidden = !hasItems;

  document.getElementById("itemCount").textContent =
    `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"}`;

  const delivery = hasItems ? DELIVERY_FEE : 0;

  document.getElementById("cartSubtotal").textContent = formatKES(subtotal);
  document.getElementById("cartDelivery").textContent = formatKES(delivery);
  document.getElementById("cartTotal").textContent =
    formatKES(subtotal + delivery);

  checkoutButton.disabled = !hasItems || !booksLoaded;
}

function changeQuantity(id, amount) {
  const item = cart.find(entry => entry.id === id);
  const book = booksById.get(id);

  if (!item || !book) return;

  const stock = Math.max(0, Number(book.stock_quantity) || 0);
  const nextQuantity = item.quantity + amount;

  if (nextQuantity < 1 || nextQuantity > stock) {
    showMessage(`Only ${stock} copies of "${book.title}" are currently available.`);
    return;
  }

  item.quantity = nextQuantity;
  saveCart();
  showMessage("");
  renderCart();
}

function removeItem(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  showMessage("Book removed from your cart.");
  renderCart();
}

async function loadCart() {
  cart = readCart();
  saveCart();

  try {
    const response = await fetch("/api/books");

    if (!response.ok) {
      throw new Error("Could not retrieve books.");
    }

    const result = await response.json();
    const books = Array.isArray(result.books) ? result.books : (Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : null));

    if (!Array.isArray(books)) {
      throw new Error("Unexpected book API response.");
    }

    booksById = new Map(
      books.map(book => [String(book.id), book])
    );

    booksLoaded = true;

    // Remove books that are no longer returned by the published-books API.
    const previousLength = cart.length;
    cart = cart.filter(item => booksById.has(item.id));

    if (cart.length !== previousLength) {
      saveCart();
      showMessage("Unavailable books were removed from your cart.");
    }

    // Trim quantities if current stock has fallen since the book was added.
    for (const item of cart) {
      const book = booksById.get(item.id);
      const stock = Math.max(0, Number(book.stock_quantity) || 0);
      item.quantity = Math.min(item.quantity, stock);
    }

    cart = cart.filter(item => item.quantity > 0);
    saveCart();
    renderCart();
  } catch (error) {
    console.error(error);
    showMessage("We couldn't load your cart. Check your connection and try again.");
    checkoutButton.disabled = true;
  }
}

checkoutButton.addEventListener("click", () => {
  if (!booksLoaded || cart.length === 0) return;

  window.location.href = "/pages/checkout.html";
});

document.getElementById("currentYear").textContent =
  new Date().getFullYear();

loadCart();
