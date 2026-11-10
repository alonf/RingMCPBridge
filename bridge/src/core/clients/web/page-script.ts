// The admin page's little script (T029; UX U1, U3), served at its own path: the page's policy allows
// no inline script. Everything works without it; it adds two things:
// - **The theme switch** changes the theme in place, keeping what the owner typed, and remembers
//   the choice in the theme cookie. Without the script, the switch posts a form instead.
// - **The health poll**: every 15 s it fetches the Health section alone and puts it in place, so the
//   Enroll section and what is typed there are never touched. When the session has ended, it shows
//   the signed-out notice the server sent and stops.

/** How often the open page fetches the Health section again (FR-040; UX U3). */
export const HEALTH_POLL_MS = 15_000;

/** The script, served as it is: no build step. */
export function pageScript(options: {
  readonly healthPath: string;
  readonly themeCookie: string;
  readonly themeCookiePath: string;
  readonly themeCookieMaxAgeS: number;
}): string {
  return `"use strict";
(function () {
  var root = document.documentElement;
  var themeForm = document.querySelector("form[data-theme-switch]");
  if (themeForm) {
    themeForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      document.cookie = ${JSON.stringify(`${options.themeCookie}=`)} + next +
        ${JSON.stringify(`; Path=${options.themeCookiePath}; Max-Age=${String(options.themeCookieMaxAgeS)}; Secure; SameSite=Lax`)};
      var button = themeForm.querySelector("button");
      if (button) {
        button.textContent = next === "light" ? "Dark theme" : "Light theme";
      }
      var input = themeForm.querySelector("input[name=theme]");
      if (input) {
        input.value = next === "light" ? "dark" : "light";
      }
    });
  }
  if (!document.getElementById("health") || document.body.getAttribute("data-signed-in") !== "yes") {
    return;
  }
  var timer = window.setInterval(function () {
    window.fetch(${JSON.stringify(options.healthPath)}, { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        return response.text().then(function (text) {
          var current = document.getElementById("health");
          if (current && (response.ok || response.status === 401)) {
            current.outerHTML = text;
          }
          if (response.status === 401) {
            window.clearInterval(timer);
          }
        });
      })
      .catch(function () {
        /* The next poll tries again. */
      });
  }, ${String(HEALTH_POLL_MS)});
})();
`;
}
