const hamburger = document.querySelector(".hamburger");
const nav = document.querySelector("nav");
const overlay = document.querySelector(".menu-overlay");
const logo = document.querySelector(".logo");

hamburger.addEventListener("click", () => {
    nav.classList.toggle("active");
    overlay.classList.toggle("active");
});

overlay.addEventListener("click", () => {
    nav.classList.remove("active");
    overlay.classList.remove("active");
});

if (logo) {
    logo.addEventListener("click", () => {
        window.location.href = "index.html";
    });
}