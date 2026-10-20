import { expect, test, type Page } from "@playwright/test";

const emptyTile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "image/png", body: emptyTile }),
  );
  await page.route("**/api/boundaries/brazil?**", (route) =>
    route.fulfill({
      json: {
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-74, -34],
                [-34, -34],
                [-34, 6],
                [-74, 6],
                [-74, -34],
              ],
            ],
          },
        },
        metadata: {
          detail: "low",
          boundaryYear: 2025,
          source: { name: "IBGE", url: "https://www.ibge.gov.br/" },
        },
      },
    }),
  );
  await page.route("**/api/units?*", (route) =>
    route.fulfill({
      json: {
        data: [],
        metadata: {
          count: 0,
          state: "BR",
          dataOrigin: "live",
          isStale: false,
          retrievedAt: "2026-10-19T12:00:00Z",
          latestSourceUpdate: "2026-10-19",
          source: { name: "CNES", url: "https://cnes.datasus.gov.br/" },
        },
      },
    }),
  );
  await page.route("**/api/occupancy**", (route) =>
    route.fulfill({ status: 404 }),
  );
});

for (const viewport of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 1280, height: 800 },
]) {
  test(`localiza, enquadra e remove a posição em ${viewport.width}×${viewport.height}`, async ({
    page,
    context,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await context.setGeolocation({
      latitude: -23.55,
      longitude: -46.63,
      accuracy: 80,
    });
    await context.grantPermissions(["geolocation"]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?uf=SP&q=Centro");
    const marker = page.locator(".user-location-marker");
    await expect(marker).toHaveCount(0);
    await page
      .getByRole("button", { name: "Usar minha localização", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Precisão aproximada: 80 m" }),
    ).toBeVisible();
    await expect(marker).toBeVisible();
    await expect(page).toHaveURL(/\?uf=SP&q=Centro$/);
    await expect
      .poll(async () => {
        const [point, panel, map] = await Promise.all([
          marker.boundingBox(),
          page.getByRole("region", { name: "Controles do mapa" }).boundingBox(),
          page.locator(".leaflet-container").boundingBox(),
        ]);
        if (!point || !panel || !map) return false;
        const centerX = point.x + point.width / 2;
        const centerY = point.y + point.height / 2;
        return (
          centerX > map.x &&
          centerX < map.x + map.width &&
          centerY > map.y &&
          centerY < map.y + map.height &&
          (centerX > panel.x + panel.width || centerY > panel.y + panel.height)
        );
      })
      .toBe(true);
    await testInfo.attach(`gps-${viewport.width}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await page.getByRole("button", { name: "Remover localização" }).click();
    await expect(marker).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Usar minha localização", exact: true }),
    ).toBeVisible();
  });
}

async function mockLocation(
  page: Page,
  mode: "pending" | "unsupported" | "insecure" | "throw" | number,
) {
  await page.addInitScript((mode) => {
    if (mode === "insecure") {
      Object.defineProperty(window, "isSecureContext", { value: false });
      return;
    }
    if (mode === "unsupported") {
      Object.defineProperty(navigator, "geolocation", { value: undefined });
      return;
    }
    const state = window as unknown as {
      locationRequests: number;
      completeLocation: () => void;
    };
    state.locationRequests = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(
          success: PositionCallback,
          error: PositionErrorCallback,
        ) {
          state.locationRequests += 1;
          if (mode === "throw") throw new Error("Blocked");
          state.completeLocation = () =>
            success({
              coords: {
                latitude: -23.55,
                longitude: -46.63,
                accuracy: 120,
              },
            } as GeolocationPosition);
          if (mode === "pending") return;
          if (mode === 4) {
            success({
              coords: { latitude: 48.85, longitude: 2.35, accuracy: 10 },
            } as GeolocationPosition);
          } else {
            error({ code: mode } as GeolocationPositionError);
          }
        },
      },
    });
  }, mode);
}

for (const [mode, message] of [
  [1, "Permissão de localização negada"],
  [2, "Não foi possível obter sua localização"],
  [3, "A localização demorou para responder"],
  [4, "Sua posição está fora da área exibida"],
  ["unsupported", "Este navegador não oferece localização"],
  ["insecure", "Para usar a localização, acesse o site por HTTPS"],
  ["throw", "Não foi possível acessar a localização"],
] as const) {
  test(`informa falha de localização: ${mode}`, async ({ page }) => {
    await mockLocation(page, mode);
    await page.goto("/");
    const button = page.getByRole("button", {
      name: "Usar minha localização",
      exact: true,
    });
    await button.click();
    await expect(
      page.getByRole("status").filter({ hasText: message }),
    ).toBeVisible();
    await expect(button).toBeFocused();
    await expect(button).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".user-location-marker")).toHaveCount(0);
  });
}

test("solicita apenas ao clicar, bloqueia duplicatas e ignora resposta após cancelar", async ({
  page,
}) => {
  await mockLocation(page, "pending");
  await page.goto("/");
  await expect.poll(() => page.evaluate("window.locationRequests")).toBe(0);
  await page
    .getByRole("button", { name: "Usar minha localização", exact: true })
    .click();
  const loading = page.getByRole("button", { name: "Obtendo localização…" });
  await expect(loading).toHaveAttribute("aria-disabled", "true");
  await loading.click({ force: true });
  expect(await page.evaluate("window.locationRequests")).toBe(1);
  await page.getByRole("button", { name: "Cancelar localização" }).click();
  await page.evaluate("window.completeLocation()");
  await expect(page.locator(".user-location-marker")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Usar minha localização", exact: true })
    .click();
  await page.evaluate("window.completeLocation()");
  await expect(page.locator(".user-location-marker")).toBeVisible();
  expect(await page.evaluate("window.locationRequests")).toBe(2);
});

test("encerra uma solicitação sem resposta e permite nova tentativa", async ({
  page,
}) => {
  await mockLocation(page, "pending");
  await page.clock.install();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Usar minha localização", exact: true })
    .click();
  await page.clock.fastForward(20_001);
  await expect(
    page.getByRole("status").filter({ hasText: "A localização demorou" }),
  ).toBeVisible();
  await page.evaluate("window.completeLocation()");
  await expect(page.locator(".user-location-marker")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Usar minha localização", exact: true })
    .click();
  await page.evaluate("window.completeLocation()");
  await expect(page.locator(".user-location-marker")).toBeVisible();
  await page.reload();
  await expect(page.locator(".user-location-marker")).toHaveCount(0);
  expect(await page.evaluate("window.locationRequests")).toBe(0);
});

test("mantém a posição visível após a resposta tardia do catálogo e a rotação", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setGeolocation({
    latitude: -23.55,
    longitude: -46.63,
    accuracy: 80,
  });
  await context.grantPermissions(["geolocation"]);
  let releaseCatalog!: () => void;
  const catalogReady = new Promise<void>((resolve) => {
    releaseCatalog = resolve;
  });
  await page.route("**/api/units?*", async (route) => {
    await catalogReady;
    await route.fallback();
  });
  await page.goto("/?uf=SP");
  const locate = page.getByRole("button", {
    name: "Usar minha localização",
    exact: true,
  });
  await locate.focus();
  await page.keyboard.press("Enter");
  const marker = page.locator(".user-location-marker");
  await expect(marker).toBeVisible();
  releaseCatalog();
  await expect(
    page.getByRole("region", { name: "Controles do mapa" }),
  ).not.toContainText("Carregando");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const point = await marker.boundingBox();
        const map = await page.locator(".leaflet-container").boundingBox();
        const panels = await Promise.all([
          page.getByRole("region", { name: "Controles do mapa" }).boundingBox(),
          page
            .getByRole("region", { name: "Sua localização", exact: true })
            .boundingBox(),
        ]);
        if (!point || !map || panels.some((panel) => !panel)) return false;
        return (
          point.x > map.x &&
          point.x + point.width < map.x + map.width &&
          point.y > map.y &&
          point.y + point.height < map.y + map.height &&
          panels.every(
            (panel) =>
              panel &&
              (point.x > panel.x + panel.width ||
                point.y > panel.y + panel.height ||
                point.y + point.height < panel.y),
          )
        );
      })
      .toBe(true);
  }
});
