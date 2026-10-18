"use strict";

const form = document.getElementById("registerForm");
const message = document.getElementById("authMessage");
const button = document.getElementById("registerButton");

const params = new URLSearchParams(window.location.search);
const requestedNext = params.get("next");

const allowedNextPages = [
  "/pages/checkout.html",
  "/pages/my-orders.html"
];

const nextPage = allowedNextPages.includes(requestedNext)
  ? requestedNext
  : "/pages/checkout.html";

document.getElementById("loginLink").href =
  `/pages/login.html?next=${encodeURIComponent(nextPage)}`;

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.textContent = "";
  button.disabled = true;
  button.textContent = "Creating account...";

  const payload = {
    full_name: form.full_name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    password: form.password.value
  };

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.token) {
      throw new Error(data.message || "Registration failed.");
    }

    localStorage.setItem("chachaCustomerToken", data.token);
    message.textContent = "Account created successfully. Redirecting...";

    window.location.assign(nextPage);
  } catch (error) {
    message.textContent =
      error.message || "Could not connect to the server.";
  } finally {
    button.disabled = false;
    button.textContent = "Create account";
  }
});