document.addEventListener("DOMContentLoaded", () => {

    if(localStorage.getItem("cookieConsent")){
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

            localStorage.setItem(
                "cookieConsent",
                "accepted"
            );

            banner.remove();

        });

});