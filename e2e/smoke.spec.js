const { test, expect } = require("@playwright/test");

test.describe("img-to-svg", () => {
  test("loads and shows source heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Raster/ })).toBeVisible();
    await expect(page.getByText(/Choose image or drop here/i)).toBeVisible();
    await expect(page.locator("#maskToolbar")).toBeHidden();
  });

  test("mask toolbox hidden until image loaded", async ({ page }) => {
    await page.goto("/");
    const toolbox = page.locator("#sourcePreviewToolbox");
    await expect(toolbox).toBeHidden();
  });
});
