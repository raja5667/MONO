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
        loadChecksum(asset); // now synchronous — reads the .exe asset's digest field

    } catch (e) {
        console.warn("Could not load version info from GitHub:", e);
        showApiFallback();
    }
}

// Reads the SHA-256 checksum straight off the .exe asset object returned by
// the GitHub API. GitHub computes and exposes this itself via `asset.digest`
// (format: "sha256:<hex>") — no separate .sha256 file or extra request needed.
//
// NOTE: We deliberately do NOT fetch a separate .sha256 asset file (even
// though one may exist in the release). GitHub's asset API redirects those
// download requests to release-assets.githubusercontent.com, and that
// redirected response does not send Access-Control-Allow-Origin, so the
// browser blocks it with a CORS error every time. The releases/latest JSON
// call (already made in updateInfo) includes `digest` on each asset and DOES
// send proper CORS headers, so this avoids the extra request entirely.
function loadChecksum(asset) {
    if (!asset || !asset.digest) return; // digest not available for this asset

    const match = asset.digest.match(/sha256:([a-fA-F0-9]{64})/i);
    if (!match) return; // digest present but not in sha256 form

    const hash = match[1];
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