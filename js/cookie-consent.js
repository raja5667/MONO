document.addEventListener("DOMContentLoaded", () => {

    function getConsent() {
        try {
            const fromStorage = localStorage.getItem("cookieConsent");
            if (fromStorage) return fromStorage;
        } catch (e) {
            console.warn("cookie-consent: localStorage read failed, falling back to cookie", e);
        }
        // Fallback: check a plain cookie in case localStorage is blocked
        const match = document.cookie.match(/(?:^|; )cookieConsent=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    function setConsent(value) {
        try {
            localStorage.setItem("cookieConsent", value);
        } catch (e) {
            console.warn("cookie-consent: localStorage write failed, using cookie fallback", e);
        }
        // Always also set a cookie (1 year) as a durable fallback,
        // and so it works even if localStorage is unavailable/blocked.
        const oneYear = 60 * 60 * 24 * 365;
        document.cookie = `cookieConsent=${encodeURIComponent(value)}; max-age=${oneYear}; path=/; SameSite=Lax`;
    }

    if (getConsent()) {
        return;
    }

    const banner = document.createElement("div");

    banner.id = "cookie-banner";

    banner.innerHTML = `

        <div class="cookie-content">

            <div class="cookie-text">

                <h3>🍪 We Value Your Privacy</h3>

                <p>
                    We use cookies to improve your experience,
                    analyze traffic, and enhance website performance.
                    By continuing to use our website, you agree to our
                    Privacy Policy.
                </p>

            </div>

            <div class="cookie-actions">

                <button id="cookie-accept">
                    Accept
                </button>

            </div>

        </div>

    `;

    document.body.appendChild(banner);

    document
        .getElementById("cookie-accept")
        .addEventListener("click", () => {

            setConsent("accepted");

            banner.remove();

        });

});