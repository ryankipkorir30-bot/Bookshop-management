
"use strict";

const message = document.getElementById("bookMessage");
const details = document.getElementById("bookDetails");
const cover = document.getElementById("bookCover");
const quantityInput = document.getElementById("bookQuantity");
const addButton = document.getElementById("addBookButton");

let currentBook = null;

function formatKES(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2
  }).format(Number(amount));
}

function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem("chachaCart") || "[]");

    return Array.isArray(cart)
      ? cart.filter(item =>
          item &&
          /^\d+$/.test(String(item.id)) &&
          Number.isSafeInteger(item.quantity) &&
          item.quantity > 0
        )
      : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem("chachaCart", JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const count = getCart().reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById("cartCount").textContent = String(count);
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}

async function loadBook() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id || !/^\d+$/.test(id) || BigInt(id) <= 0n) {
    showMessage("Invalid book link. Please return to the book collection.");
    return;
  }

  try {
    const response = await fetch("/api/books");
    if (!response.ok) {
      throw new Error("Unable to retrieve books.");
    }

    const books = await response.json();
    const list = Array.isArray(books) ? books : books.data;

    if (!Array.isArray(list)) {
      throw new Error("Unexpected response from the book service.");
    }

    currentBook = list.find(book => String(book.id) === id);

    if (!currentBook) {
      showMessage("This book is unavailable or is no longer published.");
      return;
    }

    renderBook(currentBook);
  } catch (error) {
    console.error(error);
    showMessage("We couldn't load this book. Please try again.");
  }
}

function renderBook(book) {
  document.title = `${book.title} | ChachaPkorir Bookshop`;

  document.getElementById("breadcrumbTitle").textContent = book.title;
  document.getElementById("bookCategory").textContent =
    book.category || "BOOK COLLECTION";
  document.getElementById("bookTitle").textContent = book.title;
  document.getElementById("bookAuthor").textContent =
    book.author || "Unknown author";
  document.getElementById("bookPrice").textContent = formatKES(book.price);
  document.getElementById("bookDescription").textContent =
    book.description || "No description is available for this book yet.";

  const stock = Math.max(0, Number(book.stock_quantity) || 0);
  document.getElementById("bookStock").textContent =
    stock > 0 ? `${stock} available` : "Currently out of stock";

  quantityInput.max = String(stock);
  quantityInput.value = "1";
  quantityInput.disabled = stock < 1;
  addButton.disabled = stock < 1;
  addButton.textContent = stock > 0 ? "Add to Cart" : "Out of Stock";

  if (book.cover_image) {
    const coverPath = String(book.cover_image);
    cover.src = coverPath.startsWith("/") || /^https?:\/\//i.test(coverPath)
      ? coverPath
      : `/uploads/books/${encodeURIComponent(coverPath)}`;

    cover.onerror = () => {
      cover.removeAttribute("src");
      cover.alt = "Book cover unavailable";
    };
  } else {
    cover.alt = "No cover image available";
  }

  message.hidden = true;
  details.hidden = false;
}

function changeQuantity(amount) {
  if (!currentBook) return;

  const stock = Math.max(0, Number(currentBook.stock_quantity) || 0);
  const current = Number.parseInt(quantityInput.value, 10) || 1;

  quantityInput.value = String(
    Math.min(stock, Math.max(1, current + amount))
  );
}

document.getElementById("decreaseQuantity").addEventListener("click", () => {
  changeQuantity(-1);
});

document.getElementById("increaseQuantity").addEventListener("click", () => {
  changeQuantity(1);
});

quantityInput.addEventListener("change", () => {
  if (!currentBook) return;

  const stock = Math.max(0, Number(currentBook.stock_quantity) || 0);
  let quantity = Number.parseInt(quantityInput.value, 10);

  if (!Number.isSafeInteger(quantity)) quantity = 1;

  quantityInput.value = String(
    Math.min(stock, Math.max(1, quantity))
  );
});

addButton.addEventListener("click", () => {
  if (!currentBook) return;

  const quantity = Number.parseInt(quantityInput.value, 10);
  const stock = Number(currentBook.stock_quantity) || 0;

  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > stock) {
    showMessage("Please select a valid quantity within available stock.");
    return;
  }

  const cart = getCart();
  const existing = cart.find(item => String(item.id) === String(currentBook.id));
  const newQuantity = (existing?.quantity || 0) + quantity;

  if (newQuantity > stock) {
    showMessage("Your requested quantity exceeds the available stock.");
    return;
  }

  if (existing) {
    existing.quantity = newQuantity;
  } else {
    cart.push({
      id: String(currentBook.id),
      quantity
    });
  }

  saveCart(cart);
  addButton.textContent = "Added to Cart ✓";
  showMessage(`${currentBook.title} added to your cart.`);
  quantityInput.value = "1";

  setTimeout(() => {
    addButton.textContent = "Add to Cart";
  }, 1800);
});

document.getElementById("currentYear").textContent =
  new Date().getFullYear();

updateCartCount();
loadBook();
