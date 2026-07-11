// TODO: replace with your real Firebase Realtime Database URL once created.
// Must match the RATINGS_DB_URL used in main.py in the desktop app exactly.
const RATINGS_DB_URL = "https://ytmp3-pro-default-rtdb.asia-southeast1.firebasedatabase.app";

const downloadButtons = document.querySelectorAll(".download-btn");

downloadButtons.forEach(button => {
    button.addEventListener("click", () => {
        // The button's href already points straight to the real GitHub
        // download URL, so the browser starts that request immediately
        // on click — we are NOT calling preventDefault() or delaying
        // navigation here. Everything below is purely cosmetic feedback
        // and runs alongside (not instead of) the real download starting.
        button.classList.add("downloading");

        const textSpan = button.querySelector("span");
        const originalText = textSpan.textContent;

        textSpan.textContent = "Starting Download...";
        button.style.pointerEvents = "none";

        setTimeout(() => {
            textSpan.textContent = originalText;
            button.style.pointerEvents = "auto";
            button.classList.remove("downloading");
        }, 2000);
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
        loadChangelog(data);

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

// Sums download_count across every .exe asset in every release ever published.
// GitHub tracks this natively — no custom analytics backend needed.
async function loadTotalDownloads() {
    const REPO_API = "https://api.github.com/repos/raja5667/YT-MP3/releases";
    let total = 0;
    let page = 1;

    try {
        while (true) {
            const res = await fetch(`${REPO_API}?per_page=100&page=${page}`);
            if (!res.ok) break;

            const releases = await res.json();
            if (!releases.length) break; // no more pages

            for (const release of releases) {
                for (const asset of release.assets) {
                    if (asset.name.toLowerCase().endsWith(".exe")) {
                        total += asset.download_count;
                    }
                }
            }

            if (releases.length < 100) break; // last page reached
            page++;
        }

        const statEl = document.getElementById("download-stat");
        const countEl = document.getElementById("download-count");
        if (statEl && countEl && total > 0) {
            countEl.textContent = total.toLocaleString();
            statEl.style.display = "inline-block";
        }

    } catch (e) {
        console.warn("Could not load total download count:", e);
        // Fail silently — stat just stays hidden
    }
}

// Displays the release notes you write in GitHub's "release notes" box
// (data.body) inside a collapsible "What's New" section. Converts basic
// Markdown (headers, bullet lists, bold text, paragraphs) to HTML —
// GitHub release notes are usually simple enough that a full Markdown
// library isn't needed for this.
function markdownToHtml(md) {
    // Escape any raw HTML first so nothing unexpected gets injected
    let html = md
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Normalize line endings
    html = html.replace(/\r\n/g, "\n");

    const lines = html.split("\n");
    const out = [];
    let listBuffer = [];
    let quoteBuffer = [];

    function flushList() {
        if (listBuffer.length) {
            out.push(`<ul>${listBuffer.map(i => `<li>${i}</li>`).join("")}</ul>`);
            listBuffer = [];
        }
    }

    function flushQuote() {
        if (quoteBuffer.length) {
            out.push(`<blockquote>${quoteBuffer.join(" ")}</blockquote>`);
            quoteBuffer = [];
        }
    }

    function inline(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/`([^`]+?)`/g, "<code>$1</code>");
    }

    for (let rawLine of lines) {
        const line = rawLine.trim();

        // Blank line: flush any open blocks, otherwise ignore
        if (line === "") {
            flushList();
            flushQuote();
            continue;
        }

        // Horizontal rule: --- or *** or ___ (must be the whole line)
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
            flushList();
            flushQuote();
            out.push("<hr>");
            continue;
        }

        // Headers: &gt;-escaped input means raw "#" is still literal here, safe to match
        const h3 = line.match(/^### +(.*)$/);
        const h2 = line.match(/^## +(.*)$/);
        const h1 = line.match(/^# +(.*)$/);
        if (h3) { flushList(); flushQuote(); out.push(`<h3>${inline(h3[1])}</h3>`); continue; }
        if (h2) { flushList(); flushQuote(); out.push(`<h2>${inline(h2[1])}</h2>`); continue; }
        if (h1) { flushList(); flushQuote(); out.push(`<h1>${inline(h1[1])}</h1>`); continue; }

        // Blockquote: > text (already escaped to &gt; earlier)
        const quote = line.match(/^&gt; ?(.*)$/);
        if (quote) { flushList(); quoteBuffer.push(inline(quote[1])); continue; }

        // Bullet list: - text or * text
        const bullet = line.match(/^[-*] +(.*)$/);
        if (bullet) { flushQuote(); listBuffer.push(inline(bullet[1])); continue; }

        // Otherwise: plain paragraph line
        flushList();
        flushQuote();
        out.push(`<p>${inline(line)}</p>`);
    }

    flushList();
    flushQuote();

    return out.join("\n");
}

function loadChangelog(data) {
    const section = document.getElementById("changelog");
    const summary = document.getElementById("changelog-summary");
    const body = document.getElementById("changelog-body");

    if (!section || !summary || !body) return;

    const notes = (data.body || "").trim();
    if (!notes) return; // no release notes written for this release — stay hidden

    const version = data.tag_name.replace(/^v/, "");
    summary.textContent = `What's New in v${version}`;
    body.innerHTML = markdownToHtml(notes);
    section.style.display = "block";
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

// Reads every rating the desktop app has submitted to Firebase (each one is
// just {stars, ts}), averages them, and renders it as a Play-Store-style
// badge: partial-fill stars + numeric average + rating count.
async function loadRatingSummary() {
    try {
        const res = await fetch(`${RATINGS_DB_URL}/ratings.json`);
        const data = await res.json();

        if (!data) return; // no ratings submitted yet -- badge stays hidden

        const values = Object.values(data)
            .map(r => Number(r.stars))
            .filter(n => n >= 1 && n <= 5);

        if (!values.length) return;

        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const count = values.length;

        const badge = document.getElementById("rating-badge");
        const avgEl = document.getElementById("rating-average");
        const countEl = document.getElementById("rating-count");
        const starsFront = document.getElementById("rating-stars-front");

        if (!badge || !avgEl || !countEl || !starsFront) return;

        avgEl.textContent = avg.toFixed(1);
        countEl.textContent = count.toLocaleString();
        starsFront.style.width = `${(avg / 5) * 100}%`;
        badge.style.display = "inline-flex";

    } catch (e) {
        console.warn("Could not load rating summary:", e);
        // Fail silently -- badge just stays hidden, same pattern as
        // loadTotalDownloads() above
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
loadTotalDownloads();
loadRatingSummary();

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

    // "Download Now" (info card) still points to "#" — instead of doing
    // nothing, scroll back up to the real "Download For Windows" button
    // in the hero section so the visitor lands on the actual working link.
    const downloadNowBtn = document.getElementById('download-now-btn');
    if (downloadNowBtn) {
        downloadNowBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const heroDownloadBtn = document.getElementById('scroll-download');
            if (heroDownloadBtn) {
                heroDownloadBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    // Version banner's "Download Now" already has a real href (set in
    // showVersionBannerIfNeeded), so we do NOT preventDefault here — the
    // real download still starts normally. This just adds the same
    // "scroll to Getting Started" follow-up as the hero button, for
    // consistent behavior between the two real download links.
    const bannerLink = document.getElementById('version-banner-link');
    if (bannerLink) {
        bannerLink.addEventListener('click', () => {
            setTimeout(() => {
                const section = document.getElementById('start');
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth' });
                }
            }, 2000);
        });
    }
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

// Preview section: switch between MP3 / MP4 screenshots
const previewTabs = document.querySelectorAll(".preview-tab");
const previewImgs = document.querySelectorAll(".screenshot-img");
const previewPlaceholders = document.querySelectorAll(".screenshot-placeholder");

previewTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        previewTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        const targetId = tab.dataset.target;
        previewImgs.forEach(img => {
            img.classList.toggle("active", img.id === targetId);
        });
    });
});

// If a screenshot file hasn't been added to /img/ yet, hide the broken
// image and show a friendly placeholder in its place instead. Once the
// real screenshot-mp3.png / screenshot-mp4.png files are added this
// simply stops firing, since the images will load successfully.
previewImgs.forEach(img => {
    img.addEventListener("error", () => {
        img.style.display = "none";
        const placeholder = document.querySelector(`.screenshot-placeholder[data-for="${img.id}"]`);
        if (placeholder && img.classList.contains("active")) {
            placeholder.classList.add("show");
        }
    }, { once: true });
});

// Keep placeholder visibility in sync when switching tabs (only show the
// placeholder for whichever screenshot is currently active and missing).
previewTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        const targetId = tab.dataset.target;
        previewPlaceholders.forEach(ph => {
            const img = document.getElementById(ph.dataset.for);
            const isMissing = img && img.style.display === "none";
            ph.classList.toggle("show", ph.dataset.for === targetId && isMissing);
        });
    });
});