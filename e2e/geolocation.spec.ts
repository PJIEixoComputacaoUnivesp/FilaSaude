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
  test(`localiza ao abrir, enquadra e remove a posição em ${viewport.width}×${viewport.height}`, async ({
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
          centerY > 12 &&
          centerY < viewport.height - 12 &&
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
      page.getByRole("region", { name: "Sua localização", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: /Mapa das unidades/ }),
    ).toBeFocused();
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
      readings: { success: PositionCallback; options?: PositionOptions }[];
    };
    state.locationRequests = 0;
    state.readings = [];
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(
          success: PositionCallback,
          error: PositionErrorCallback,
          options?: PositionOptions,
        ) {
          state.locationRequests += 1;
          state.readings.push({ success, options });
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

test("recusar a permissão não mostra aviso nem pede de novo", async ({
  page,
}) => {
  await mockLocation(page, 1);
  await page.goto("/");
  await expect.poll(() => page.evaluate("window.locationRequests")).toBe(2);
  await expect(
    page.getByRole("region", { name: "Sua localização", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".user-location-marker")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /localização/ })).toHaveCount(0);
});

for (const [mode, message, canRetry] of [
  [2, "Não foi possível obter sua localização", true],
  [3, "A localização demorou para responder", true],
  [4, "Sua posição está fora da área exibida", false],
  ["unsupported", "Este navegador não oferece localização", false],
  ["insecure", "Para usar a localização, acesse o site por HTTPS", false],
  ["throw", "Não foi possível acessar a localização", false],
] as const) {
  test(`informa falha de localização ao abrir: ${mode}`, async ({ page }) => {
    await mockLocation(page, mode);
    await page.goto("/");
    await expect(
      page.getByRole("status").filter({ hasText: message }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tentar novamente" }),
    ).toHaveCount(canRetry ? 1 : 0);
    await expect(page.locator(".user-location-marker")).toHaveCount(0);
    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(
      page.getByRole("region", { name: "Sua localização", exact: true }),
    ).toHaveCount(0);
  });
}

test("solicita ao abrir e ignora a resposta após cancelar", async ({
  page,
}) => {
  await mockLocation(page, "pending");
  await page.goto("/");
  await expect.poll(() => page.evaluate("window.locationRequests")).toBe(2);
  await expect(
    page.getByRole("status").filter({ hasText: "Obtendo sua localização" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar localização" }).click();
  await page.evaluate("window.completeLocation()");
  await expect(page.locator(".user-location-marker")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Sua localização", exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate("window.locationRequests")).toBe(2);
});

test("encerra uma solicitação sem resposta e permite nova tentativa", async ({
  page,
}) => {
  await mockLocation(page, "pending");
  await page.clock.install();
  await page.goto("/");
  await page.clock.fastForward(20_001);
  await expect(
    page.getByRole("status").filter({ hasText: "A localização demorou" }),
  ).toBeVisible();
  await page.evaluate("window.completeLocation()");
  await expect(page.locator(".user-location-marker")).toHaveCount(0);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await page.evaluate("window.completeLocation()");
  await expect(page.locator(".user-location-marker")).toBeVisible();
  expect(await page.evaluate("window.locationRequests")).toBe(4);
  await page.reload();
  await expect(page.locator(".user-location-marker")).toHaveCount(0);
  await expect.poll(() => page.evaluate("window.locationRequests")).toBe(2);
});

async function resolveReading(page: Page, index: number, accuracy: number) {
  await page.evaluate(
    ([index, accuracy]) => {
      const { readings } = window as unknown as {
        readings: { success: PositionCallback }[];
      };
      readings[index].success({
        coords: { latitude: -23.55, longitude: -46.63, accuracy },
      } as GeolocationPosition);
    },
    [index, accuracy],
  );
}

test("marca a posição rápida e depois a ajusta com a leitura precisa", async ({
  page,
}) => {
  await mockLocation(page, "pending");
  await page.goto("/?uf=SP");
  await expect.poll(() => page.evaluate("window.locationRequests")).toBe(2);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { readings: { options?: PositionOptions }[] }
      ).readings.map(({ options }) => options?.enableHighAccuracy),
    ),
  ).toEqual([false, true]);
  await resolveReading(page, 0, 2000);
  const status = page
    .getByRole("region", { name: "Sua localização", exact: true })
    .getByRole("status");
  await expect(status).toContainText("Precisão aproximada: 2.000 m.");
  await expect(status).toContainText("Ajustando a precisão");
  await expect(page.locator(".user-location-marker")).toBeVisible();
  await resolveReading(page, 1, 15);
  await expect(status).toContainText("Precisão aproximada: 15 m.");
  await expect(status).not.toContainText("Ajustando");
});

test("uma leitura precisa pior não substitui a rápida", async ({ page }) => {
  await mockLocation(page, "pending");
  await page.goto("/?uf=SP");
  await expect.poll(() => page.evaluate("window.locationRequests")).toBe(2);
  await resolveReading(page, 0, 40);
  await resolveReading(page, 1, 900);
  const status = page
    .getByRole("region", { name: "Sua localização", exact: true })
    .getByRole("status");
  await expect(status).toContainText("Precisão aproximada: 40 m.");
  await expect(status).not.toContainText("Ajustando");
});

test("o ajuste preciso não desfaz um movimento do mapa", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockLocation(page, "pending");
  await page.goto("/?uf=SP");
  await expect.poll(() => page.evaluate("window.locationRequests")).toBe(2);
  await resolveReading(page, 0, 2000);
  const marker = page.locator(".user-location-marker");
  await expect(marker).toBeVisible();
  const map = page.locator(".leaflet-container");
  const box = await map.boundingBox();
  if (!box) throw new Error("O mapa não foi exibido.");
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, {
    steps: 5,
  });
  await page.mouse.up();
  const pane = page.locator(".leaflet-map-pane");
  // Leaflet's drag inertia keeps panning a little after the mouse is up.
  let moved: string | null = null;
  await expect
    .poll(async () => {
      const before = await pane.getAttribute("style");
      await page.waitForTimeout(300);
      moved = await pane.getAttribute("style");
      return moved === before;
    })
    .toBe(true);
  await resolveReading(page, 1, 15);
  await expect(
    page.getByRole("status").filter({ hasText: "Precisão aproximada: 15 m." }),
  ).toBeVisible();
  expect(await pane.getAttribute("style")).toBe(moved);
});

test("pede ao entrar pela lista e leva a posição ao mapa sem pedir de novo", async ({
  page,
}) => {
  await mockLocation(page, "pending");
  await page.goto("/units");
  await expect.poll(() => page.evaluate("window.locationRequests")).toBe(2);
  await resolveReading(page, 0, 300);
  await page.getByRole("link", { name: "Mapa", exact: true }).click();
  await expect(page.locator(".user-location-marker")).toBeVisible();
  expect(await page.evaluate("window.locationRequests")).toBe(2);
});

test("não pede a localização na página de administração", async ({ page }) => {
  await mockLocation(page, "pending");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate("window.locationRequests")).toBe(0);
});

test("um filtro escolhido depois da posição volta a enquadrar as unidades", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockLocation(page, "pending");
  await page.goto("/?uf=SP");
  await expect.poll(() => page.evaluate("window.locationRequests")).toBe(2);
  await resolveReading(page, 0, 80);
  await expect(page.locator(".user-location-marker")).toBeVisible();
  const tileZoom = () =>
    page
      .locator(".leaflet-tile-pane img")
      .evaluateAll((tiles) =>
        Math.max(
          ...tiles.map((tile) =>
            Number(/\/(\d+)\/\d+\/\d+\.png/.exec(tile.getAttribute("src") ?? "")?.[1] ?? 0),
          ),
        ),
      );
  await expect.poll(tileZoom).toBeGreaterThan(12);
  // No unit in RJ in this mock: the map goes back to the whole country.
  await page.getByRole("combobox", { name: "Estado" }).selectOption("RJ");
  await expect.poll(tileZoom).toBeLessThan(7);
  // A later precise reading does not take the view back to the person.
  await resolveReading(page, 1, 15);
  await expect(
    page.getByRole("status").filter({ hasText: "Precisão aproximada: 15 m." }),
  ).toBeVisible();
  await expect.poll(tileZoom).toBeLessThan(7);
});

test("mantém a posição visível após a resposta tardia do catálogo e a rotação", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setGeolocation({
    latitude: -23.55,
    longitude: -46.63,
    accuracy: 5000,
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
  const marker = page.locator(".user-location-marker");
  await expect(marker).toBeVisible();
  releaseCatalog();
  await expect(
    page.getByRole("region", { name: "Controles do mapa" }),
  ).not.toContainText("Carregando");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 667, height: 375 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
    { width: 320, height: 640 },
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
