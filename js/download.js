const downloadButtons = document.querySelectorAll(".download-btn");

downloadButtons.forEach(button => {

    button.addEventListener("click", () => {

        button.classList.add("downloading");

        const originalText = button.textContent;

        button.textContent = "Preparing Download...";

        button.style.pointerEvents = "none";

        setTimeout(() => {

            button.textContent = "Starting Download";

        }, 1500);

        setTimeout(() => {

            // Replace with your actual file link
            window.location.href = "app/YT-MP3.exe";

            button.textContent = originalText;
            button.style.pointerEvents = "auto";

            button.classList.remove("downloading");

        }, 2500);

    });

});


// Download Counter

const counterElement = document.getElementById("downloadCount");

let downloads =
Number(localStorage.getItem("downloads")) || 0;

if(counterElement){
    counterElement.textContent =
    downloads.toLocaleString();
}

downloadButtons.forEach(button => {

    button.addEventListener("click", () => {

        downloads++;

        localStorage.setItem(
            "downloads",
            downloads
        );

        if(counterElement){
            counterElement.textContent =
            downloads.toLocaleString();
        }

    });

});


// Reveal Animation

const cards =
document.querySelectorAll(
".feature-card, .glass-card, .preview-card"
);

const observer =
new IntersectionObserver(entries => {

    entries.forEach(entry => {

        if(entry.isIntersecting){

            entry.target.classList.add("show");

        }

    });

},{
    threshold:0.2
});

cards.forEach(card => {

    card.classList.add("hidden");

    observer.observe(card);

});