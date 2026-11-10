// The admin page in a real browser (T029; FR-040; UX U1-U5): one check per page state, in every
// project (three widths, dark and light), against the dev server's stand-ins. Each check asserts the
// theme it was given and that nothing scrolls sideways. The forms are submitted as the browser
// sends them, so the Origin check meets a real browser's headers. The poll, the theme switch and
// unfolding the phone keep what the owner typed; the approval works from the keyboard alone.
import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

const CODE = "7Q4K-29XM";
const NEWER_CODE = "H3NB-C8RT";
const POLL_MS = 15_000;
const MAX_TABS = 40;
const UNFOLDED = { width: 720, height: 840 };
const FOLDED = { width: 360, height: 880 };

function light(testInfo: TestInfo): boolean {
  return testInfo.project.name.endsWith("-light");
}

test.beforeEach(async ({ context, baseURL }, testInfo) => {
  if (light(testInfo) && baseURL !== undefined) {
    await context.addCookies([
      { name: "admin_theme", value: "light", url: baseURL },
    ]);
  }
});

async function open(page: Page, scenario: string): Promise<void> {
  await page.goto(`/dev/start?${scenario}`);
  await expect(page.locator("main")).toBeVisible();
}

async function checkFrame(page: Page, testInfo: TestInfo): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    light(testInfo) ? "light" : "dark",
  );
  // Evaluated in the page: the spec is type-checked without the browser's own types.
  const overflow = await page.evaluate(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const FOCUSED_ID = "document.activeElement && document.activeElement.id";
const FOCUS_OUTLINE =
  "document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : 'none'";

function health(page: Page): ReturnType<Page["locator"]> {
  return page.locator("#health");
}

function enroll(page: Page): ReturnType<Page["locator"]> {
  return page.locator("#enroll");
}

function notice(page: Page): ReturnType<Page["locator"]> {
  return page.locator('[role="status"]');
}

async function approveWith(page: Page, typed: string): Promise<void> {
  await page.getByLabel("Type the code from the connector's log").fill(typed);
  await page.getByRole("button", { name: "Approve" }).click();
}

test.describe("the admin page", () => {
  test("signed out: the sign-in page", async ({ page }, testInfo) => {
    await open(page, "sign_in=none");

    await expect(
      page.getByRole("heading", { level: 1, name: "Admin page" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await checkFrame(page, testInfo);
  });

  test("all OK: every part a word with an icon, and its time", async ({
    page,
  }, testInfo) => {
    await open(page, "health=ok");

    await expect(
      page.getByRole("heading", { level: 1, name: "Bridge admin" }),
    ).toBeVisible();
    await expect(health(page).getByText("Connected")).toBeVisible();
    await expect(health(page).locator(".badge svg").first()).toBeVisible();
    await expect(health(page).getByText(/^as of /)).toBeVisible();
    await expect(health(page).locator(".banner")).toHaveCount(0);
    await expect(enroll(page)).toContainText(
      "No connector is asking to enroll.",
    );
    await checkFrame(page, testInfo);
  });

  for (const [state, title] of [
    ["offline", "The home is offline"],
    ["ring_lost", "Ring signed the home out"],
    ["store_down", "The bridge's database is not answering"],
    ["stale", "The home's data is out of date"],
  ] as const) {
    test(`a banner with what to do: ${state}`, async ({ page }, testInfo) => {
      await open(page, `health=${state}`);

      await expect(health(page).locator(".banner")).toContainText(title);
      await checkFrame(page, testInfo);
    });
  }

  test("connector behind: what to do", async ({ page }, testInfo) => {
    await open(page, "health=behind");

    await expect(health(page)).toContainText("Update");
    await expect(health(page)).toContainText("Pull the new image at home");
    await checkFrame(page, testInfo);
  });

  test("no connector linked yet", async ({ page }, testInfo) => {
    await open(page, "health=not_linked");

    await expect(health(page)).toContainText("Not linked");
    await checkFrame(page, testInfo);
  });

  test("a waiting connector: its code to compare, and the field to type it", async ({
    page,
  }, testInfo) => {
    await open(page, "request=waiting");

    await expect(enroll(page).locator(".code")).toHaveText(CODE);
    await expect(
      page.getByLabel("Type the code from the connector's log"),
    ).toBeVisible();
    await checkFrame(page, testInfo);
  });

  test("approved through the form, as the browser sends it", async ({
    page,
  }, testInfo) => {
    await open(page, "request=waiting");

    await approveWith(page, "7q4k 29xm");

    await expect(notice(page)).toContainText(
      "Approved. The connector links within a minute.",
    );
    await expect(enroll(page)).toContainText(
      "No connector is asking to enroll.",
    );
    await checkFrame(page, testInfo);
  });

  test("not pending: a newer request replaced the one shown", async ({
    page,
  }, testInfo) => {
    await open(page, "request=waiting");
    await page.request.get("/dev/newer-request");

    await approveWith(page, CODE);

    await expect(notice(page)).toContainText("a newer one replaced it");
    await expect(enroll(page).locator(".code")).toHaveText(NEWER_CODE);
    await checkFrame(page, testInfo);
  });

  test("a wrong code approves nothing", async ({ page }, testInfo) => {
    await open(page, "request=waiting");

    await approveWith(page, "AAAA-BBBB");

    await expect(notice(page)).toContainText("does not match");
    await expect(enroll(page).locator(".code")).toHaveText(CODE);
    await checkFrame(page, testInfo);
  });

  test("a sign-in more than 5 minutes old: sign in again first", async ({
    page,
  }, testInfo) => {
    await open(page, "request=waiting&sign_in=stale");

    await expect(
      enroll(page).getByRole("link", { name: "Sign in again" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Type the code from the connector's log"),
    ).toHaveCount(0);
    await checkFrame(page, testInfo);
  });

  test("signed out by the user: the sign-in page says so", async ({
    page,
  }, testInfo) => {
    await open(page, "health=ok");

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page.getByText("You are signed out.")).toBeVisible();
    await checkFrame(page, testInfo);
  });
});

test.describe("the admin page keeps what the owner typed", () => {
  test("through the 15-second poll, which changes the Health section only", async ({
    page,
  }) => {
    await page.clock.install();
    await open(page, "request=waiting");
    const field = page.getByLabel("Type the code from the connector's log");
    await field.fill("7Q4K");
    const before = await health(page).locator(".as-of").textContent();

    await page.clock.fastForward(POLL_MS);

    await expect(health(page).locator(".as-of")).not.toHaveText(before ?? "");
    await expect(field).toHaveValue("7Q4K");
  });

  test("through Refresh, which fetches the Health section again", async ({
    page,
  }) => {
    await open(page, "request=waiting");
    const field = page.getByLabel("Type the code from the connector's log");
    await field.fill("7Q4K");
    const before = await health(page).locator(".as-of").textContent();

    await health(page).getByRole("link", { name: "Refresh" }).click();

    await expect(health(page).locator(".as-of")).not.toHaveText(before ?? "");
    await expect(field).toHaveValue("7Q4K");
  });

  test("through the theme switch, which is remembered", async ({ page }) => {
    await open(page, "request=waiting");
    const field = page.getByLabel("Type the code from the connector's log");
    await field.fill("7Q4K");
    const theme = await page.locator("html").getAttribute("data-theme");

    await page.locator("form[data-theme-switch] button").click();

    const switched = theme === "light" ? "dark" : "light";
    await expect(page.locator("html")).toHaveAttribute("data-theme", switched);
    await expect(field).toHaveValue("7Q4K");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", switched);
  });

  test("when the phone is unfolded mid-task: the side menu replaces the menu button", async ({
    page,
  }) => {
    await page.setViewportSize(FOLDED);
    await open(page, "request=waiting");
    await expect(page.locator("summary")).toBeVisible();
    const field = page.getByLabel("Type the code from the connector's log");
    await field.fill("7Q4K");

    await page.setViewportSize(UNFOLDED);

    await expect(field).toHaveValue("7Q4K");
    await expect(page.locator(".side nav")).toBeVisible();
    await expect(page.locator("summary")).toBeHidden();
  });
});

test.describe("the admin page from the keyboard", () => {
  test("skips to the content, shows where focus is, and approves with keys alone", async ({
    page,
  }) => {
    await open(page, "request=waiting");
    // The sign-in lands on `/admin#health`, which moves where Tab starts; a plain load does not.
    await page.goto("/admin");

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to the content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    const field = page.getByLabel("Type the code from the connector's log");
    for (let tabs = 0; tabs < MAX_TABS; tabs += 1) {
      if ((await page.evaluate(FOCUSED_ID)) === "confirmation") {
        break;
      }
      await page.keyboard.press("Tab");
      expect(await page.evaluate(FOCUS_OUTLINE)).not.toBe("none");
    }
    await expect(field).toBeFocused();
    await page.keyboard.type(CODE);
    await page.keyboard.press("Enter");

    await expect(notice(page)).toContainText("Approved.");
  });
});
