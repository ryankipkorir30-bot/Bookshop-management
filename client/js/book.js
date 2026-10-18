"use strict";

const params = new URLSearchParams(window.location.search);
const bookId = params.get("id");
const message = document.getElementById("bookMessage");
const details = document.getElementById("bookDetails");
const quantityInput = document.getElementById("bookQuantity");
const addButton = document.getElementById("addBookButton");
let selectedBook = null;

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency", currency: "KES", maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function showBookMessage(text, error = false) {
  message.textContent = text;
  message.className = error ? "store-message error" : "store-message";
  message.hidden = !text;
}

function setQuantity(value) {
  const stock = Math.max(0, Number(selectedBook?.stock_quantity) || 0);
  quantityInput.value = String(Math.min(stock || 1, Math.max(1, Number(value) || 1)));
}

async function loadBook() {
  if (!bookId) {
    showBookMessage("Choose a book from the catalogue to view its details.", true);
    return;
  }
  try {
    const response = await fetch("/api/books");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load book details.");
    const books = Array.isArray(result.books) ? result.books :
      Array.isArray(result.data) ? result.data : Array.isArray(result) ? result : [];
    selectedBook = books.find(book => String(book.id) === String(bookId));
    if (!selectedBook) throw new Error("This book is unavailable or no longer published.");

    document.title = `${selectedBook.title} | ChachaPkorir Bookshop`;
    document.getElementById("breadcrumbTitle").textContent = selectedBook.title;
    document.getElementById("bookTitle").textContent = selectedBook.title || "Untitled book";
    document.getElementById("bookAuthor").textContent = selectedBook.author || "Unknown author";
    document.getElementById("bookCategory").textContent = selectedBook.category || "BOOK COLLECTION";
    document.getElementById("bookPrice").textContent = money(selectedBook.price);
    document.getElementById("bookDescription").textContent =
      selectedBook.description || "Discover this title from the ChachaPkorir Bookshop collection.";
    const stock = Math.max(0, Number(selectedBook.stock_quantity) || 0);
    const stockElement = document.getElementById("bookStock");
    stockElement.textContent = stock > 0 ? `${stock} copies available` : "Currently out of stock";
    stockElement.className = stock > 0 ? "product-stock in-stock" : "product-stock out-of-stock";
    const cover = document.getElementById("bookCover");
    if (selectedBook.cover_image) {
      cover.src = selectedBook.cover_image.startsWith("/") || /^https?:\/\//i.test(selectedBook.cover_image)
        ? selectedBook.cover_image
        : `/uploads/books/${encodeURIComponent(selectedBook.cover_image)}`;
      cover.onerror = () => { cover.hidden = true; };
    } else {
      cover.hidden = true;
    }
    quantityInput.max = String(Math.max(1, stock));
    quantityInput.disabled = stock < 1;
    addButton.disabled = stock < 1;
    addButton.textContent = stock > 0 ? "Add to cart +" : "Out of stock";
    document.getElementById("decreaseQuantity").disabled = stock < 1;
    document.getElementById("increaseQuantity").disabled = stock < 1;
    details.hidden = false;
    showBookMessage("");
  } catch (error) {
    console.error(error);
    showBookMessage(error.message || "Unable to load this book.", true);
  }
}

document.getElementById("decreaseQuantity").addEventListener("click", () => setQuantity(Number(quantityInput.value) - 1));
document.getElementById("increaseQuantity").addEventListener("click", () => setQuantity(Number(quantityInput.value) + 1));
quantityInput.addEventListener("change", () => setQuantity(quantityInput.value));

addButton.addEventListener("click", () => {
  if (!selectedBook) return;
  const stock = Math.max(0, Number(selectedBook.stock_quantity) || 0);
  const quantity = Math.max(1, Number(quantityInput.value) || 1);
  if (quantity > stock) {
    showBookMessage(`Only ${stock} copies are available.`, true);
    return;
  }
  let cart = [];
  try {
    const saved = JSON.parse(localStorage.getItem("chachaCart") || "[]");
    if (Array.isArray(saved)) cart = saved;
  } catch {}
  const id = String(selectedBook.id);
  const existing = cart.find(item => String(item.id) === id);
  const next = (Number(existing?.quantity) || 0) + quantity;
  if (next > stock) {
    showBookMessage(`Your cart can contain at most ${stock} copies of this book.`, true);
    return;
  }
  if (existing) existing.quantity = next;
  else cart.push({ id, quantity });
  localStorage.setItem("chachaCart", JSON.stringify(cart));
  showBookMessage(`${selectedBook.title} added to your cart.`);
  addButton.textContent = "Added to cart ✓";
});

const year = document.getElementById("currentYear");
if (year) year.textContent = new Date().getFullYear();
loadBook();
