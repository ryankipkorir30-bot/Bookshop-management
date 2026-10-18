"use strict";

const form = document.getElementById("loginForm");
const message = document.getElementById("authMessage");
const button = document.getElementById("loginButton");

const params = new URLSearchParams(window.location.search);
const requestedNext = params.get("next");

const allowedNextPages = [
  "/pages/checkout.html",
  "/pages/my-orders.html"
];

const nextPage = allowedNextPages.includes(requestedNext)
  ? requestedNext
  : "/pages/checkout.html";

document.getElementById("registerLink").href =
  `/pages/register.html?next=${encodeURIComponent(nextPage)}`;

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.textContent = "";
  button.disabled = true;
  button.textContent = "Logging in...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: form.email.value.trim(),
        password: form.password.value
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.token) {
      throw new Error(data.message || "Login failed.");
    }

    if (data.user?.role !== "customer") {
      throw new Error(
        "This page is for customer accounts. Please use the admin login if you are an administrator."
      );
    }

    localStorage.setItem("chachaCustomerToken", data.token);

    message.style.color = "#166534";
    message.textContent = "Login successful. Redirecting...";

    window.location.assign(nextPage);
  } catch (error) {
    message.style.color = "#b91c1c";
    message.textContent =
      error.message || "Could not connect to the server.";
  } finally {
    button.disabled = false;
    button.textContent = "Log in";
  }
});