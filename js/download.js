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

        document.getElementById("file-size").textContent = sizeInMB;
        document.getElementById("app-version").textContent = version;
        document.getElementById("hero-version").textContent = version;

        showVersionBannerIfNeeded(data, version, asset);
        loadChecksum(data);

    } catch (e) {
        console.warn("Could not load version info from GitHub:", e);
        showApiFallback();
    }
}

// Looks for a checksum file uploaded alongside the .exe in the release
// (e.g. "YTMP3-Pro.exe.sha256" or "SHA256SUMS.txt") and displays the hash.
// If no such file was uploaded for this release, the row just stays hidden.
async function loadChecksum(data) {
    const checksumAsset = data.assets.find(a =>
        a.name.toLowerCase().endsWith(".sha256") ||
        a.name.toLowerCase() === "sha256sums.txt"
    );

    if (!checksumAsset) return; // no checksum published for this release

    try {
        // Use the API asset endpoint (not browser_download_url) with the
        // octet-stream Accept header. api.github.com sends CORS headers;
        // the raw CDN (browser_download_url) does not, which silently
        // blocks this fetch in the browser.
        const res = await fetch(checksumAsset.url, {
            headers: { "Accept": "application/octet-stream" }
        });
        const text = (await res.text()).trim();

        // Extract just the hex hash whether the file contains
        // "HASH  filename.exe" (sha256sum format) or just the bare hash
        const match = text.match(/[a-fA-F0-9]{64}/);
        if (!match) return;

        const hash = match[0];
        const row = document.getElementById("checksum-row");
        const valueEl = document.getElementById("checksum-value");
        const copyBtn = document.getElementById("checksum-copy");

        if (!row || !valueEl || !copyBtn) return;

        valueEl.textContent = hash;
        row.style.display = "flex";

        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(hash).then(() => {
                copyBtn.textContent = "Copied!";
                copyBtn.classList.add("copied");
                setTimeout(() => {
                    copyBtn.textContent = "Copy";
                    copyBtn.classList.remove("copied");
                }, 2000);
            });
        });

    } catch (e) {
        console.warn("Could not load checksum file:", e);
        // Fail silently — checksum row just stays hidden
    }
}

// Shown when the GitHub API is down, rate-limited, or the request otherwise fails.
// Gives users a way to still get the software instead of just seeing "Unavailable".
function showApiFallback() {
    const FALLBACK_URL = "https://github.com/raja5667/YT-MP3/releases/latest";

    const fileSizeEl = document.getElementById("file-size");
    const appVersionEl = document.getElementById("app-version");
    const heroVersionEl = document.getElementById("hero-version");

    if (fileSizeEl) fileSizeEl.textContent = "See GitHub";
    if (appVersionEl) appVersionEl.textContent = "Latest";
    if (heroVersionEl) heroVersionEl.textContent = "Latest";

    // Point the main download buttons straight at the GitHub releases page
    // instead of a guessed direct-download URL that may not resolve.
    document.querySelectorAll(".download-btn, #download-now-btn").forEach(btn => {
        btn.href = FALLBACK_URL;
        btn.target = "_blank";
        btn.rel = "noopener noreferrer";
    });

    // Show a clear notice + dedicated button near the download info card
    const infoCard = document.querySelector(".download-info .glass-card");
    if (infoCard && !document.getElementById("api-fallback-notice")) {
        const notice = document.createElement("div");
        notice.id = "api-fallback-notice";
        notice.style.marginTop = "1.5rem";
        notice.style.textAlign = "center";

        const message = document.createElement("p");
        message.style.color = "#e0a96d";
        message.style.fontSize = "0.95rem";
        message.style.lineHeight = "1.6";
        message.style.marginBottom = "1rem";
        message.innerHTML = "Download server is temporarily unavailable.<br>You can download the latest version directly from GitHub.";

        const githubBtn = document.createElement("a");
        githubBtn.href = FALLBACK_URL;
        githubBtn.target = "_blank";
        githubBtn.rel = "noopener noreferrer";
        githubBtn.className = "btn-download-now";
        githubBtn.innerHTML = "Download from GitHub";

        notice.appendChild(message);
        notice.appendChild(githubBtn);
        infoCard.appendChild(notice);
    }
}

function showVersionBannerIfNeeded(data, version, asset) {
    const banner = document.getElementById("version-banner");
    const bannerText = document.getElementById("version-banner-text");
    const bannerLink = document.getElementById("version-banner-link");
    const bannerClose = document.getElementById("version-banner-close");

    const DAYS_TO_SHOW = 15;
    const publishedAt = new Date(data.published_at);
    const daysSinceRelease = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Outside the 15-day window since this version was released -> never show it
    if (daysSinceRelease > DAYS_TO_SHOW) return;

    // Already dismissed this exact version -> don't show it again
    // (a newer release will have a different version string, so it clears automatically)
    const dismissedVersion = localStorage.getItem("dismissedReleaseBanner");
    if (dismissedVersion === version) return;

    bannerText.textContent = `🎉 New version v${version} is here!`;
    bannerLink.href = asset ? asset.browser_download_url : "#";
    banner.style.display = "flex";

    bannerClose.addEventListener("click", () => {
        banner.style.display = "none";
        localStorage.setItem("dismissedReleaseBanner", version);
    });
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