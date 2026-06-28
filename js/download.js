const downloadButtons = document.querySelectorAll(".download-btn");

downloadButtons.forEach(button => {
    button.addEventListener("click", () => {
        button.classList.add("downloading");

        const textSpan = button.querySelector("span");
        const originalText = textSpan.textContent;

        textSpan.textContent = "Preparing Download...";
        button.style.pointerEvents = "none";

        setTimeout(() => {
            textSpan.textContent = "Starting Download";
        }, 1500);

        setTimeout(() => {
            window.location.href = "https://github.com/raja5667/YT-MP3/releases/latest/download/YTMP3-Pro.exe";
            textSpan.textContent = originalText;
            button.style.pointerEvents = "auto";
            button.classList.remove("downloading");
        }, 2500);
    });
});

async function updateInfo() {
    try {
        const res = await fetch("https://api.github.com/repos/raja5667/YT-MP3/releases/latest");
        const data = await res.json();

        // Version (tag name, e.g. "v1.2.3")
        const version = data.tag_name.replace(/^v/, "");

        // Find the .exe asset
        const asset = data.assets.find(a => a.name.endsWith(".exe"));
        const sizeInMB = asset ? (asset.size / (1024 * 1024)).toFixed(1) + " MB" : "N/A";

        // Format date e.g. "June 2026"
        const date = new Date(data.published_at);
        const updated = date.toLocaleString("en-US", { month: "long", year: "numeric" });

        document.getElementById("file-size").textContent = sizeInMB;
        document.getElementById("app-version").textContent = version;
        document.getElementById("app-updated").textContent = updated;
        document.getElementById("hero-version").textContent = version;

    } catch (e) {
        console.warn("Could not load version info from GitHub");
    }
}

updateInfo();

document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.getElementById('scroll-download');

    downloadBtn.addEventListener('click', () => {
        // Wait for 2 seconds (2000 milliseconds)
        setTimeout(() => {
            const section = document.getElementById('start');
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
            }
        }, 2000);
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

            if (entry.isIntersecting) {

                entry.target.classList.add("show");

            }

        });

    }, {
        threshold: 0.2
    });

cards.forEach(card => {

    card.classList.add("hidden");

    observer.observe(card);

});