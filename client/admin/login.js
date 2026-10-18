
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const message = document.getElementById("loginMessage");
  const submitButton = form?.querySelector('button[type="submit"]');

  if (!form || !message) {
    console.error("Login form or message element was not found.");
    return;
  }

  // If a token already exists, check it before redirecting.
  const existingToken = sessionStorage.getItem("bookshopToken");

  if (existingToken) {
    fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${existingToken}`
      }
    })
      .then(async response => {
        const data = await response.json();
        if (response.ok && data.success) {
          window.location.replace("/admin/dashboard.html");
        } else {
          sessionStorage.removeItem("bookshopToken");
        }
      })
      .catch(error => {
        console.error("Session check failed:", error);
      });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    message.textContent = "Signing in...";
    message.style.color = "";
    if (submitButton) submitButton.disabled = true;

    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok || !data.success || !data.token) {
        throw new Error(data.message || "Unable to sign in.");
      }

      if (!data.user || data.user.role !== "admin") {
        throw new Error(
          "This account is not an administrator. Please use an admin account."
        );
      }

      sessionStorage.setItem("bookshopToken", data.token);

      message.textContent = "Login successful. Opening dashboard...";
      message.style.color = "green";

      window.location.replace("/admin/dashboard.html");
    } catch (error) {
      sessionStorage.removeItem("bookshopToken");
      message.textContent = error.message || "Login failed. Please try again.";
      message.style.color = "crimson";
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
});
