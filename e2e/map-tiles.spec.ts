import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

// The API is not running here, so the outline comes from its own file, in the
// shape of GET /boundaries/brazil (both levels with the full geometry).
const boundaryFile = JSON.parse(
  readFileSync(
    join(__dirname, "../apps/api/src/boundaries/brazil-boundary.json"),
    "utf8",
  ),
) as { geometry: unknown };
const boundaryUrl = "**/api/boundaries/brazil?**";

function fulfillBoundary(route: Route) {
  const detail = new URL(route.request().url()).searchParams.get("detail");
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      data: { type: "Feature", properties: {}, geometry: boundaryFile.geometry },
      metadata: {
        detail,
        boundaryYear: 2025,
        source: { name: "IBGE", url: "https://www.ibge.gov.br/" },
      },
    }),
  });
}

// Same box as TILE_BOUNDS in apps/web/src/UnitsMap.tsx: south, west, north, east.
const tileBounds = { south: -33.8, west: -74, north: 5.3, east: -28.8 };

// A 1×1 transparent PNG, so the test never reaches the OpenStreetMap servers.
const emptyTile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

interface Tile {
  z: number;
  x: number;
  y: number;
}

function tileLongitude(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}

function tileLatitude(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** True when the tile overlaps the box, so part of it can be inside Brazil. */
function overlapsBrazil({ z, x, y }: Tile) {
  return (
    tileLongitude(x, z) < tileBounds.east &&
    tileLongitude(x + 1, z) > tileBounds.west &&
    tileLatitude(y + 1, z) < tileBounds.north &&
    tileLatitude(y, z) > tileBounds.south
  );
}

async function recordTiles(page: Page) {
  const tiles: Tile[] = [];
  await page.route(boundaryUrl, fulfillBoundary);
  await page.route("https://*.tile.openstreetmap.org/**", (route) => {
    const match = /\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(route.request().url());
    if (match) {
      const [z, x, y] = match.slice(1).map(Number);
      tiles.push({ z, x, y });
    }
    return route.fulfill({ status: 200, contentType: "image/png", body: emptyTile });
  });
  await page.route("**/api/units?state=ALL", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        metadata: {
          count: 0,
          state: "BR",
          dataOrigin: "live",
          isStale: false,
          retrievedAt: "2026-09-21T12:00:00-03:00",
          latestSourceUpdate: "2026-09-20",
          source: {
            name: "Cadastro Nacional de Estabelecimentos de Saúde (CNES)",
            url: "https://cnes.datasus.gov.br/",
          },
        },
      }),
    }),
  );
  return tiles;
}

const key = ({ z, x, y }: Tile) => `${z}/${x}/${y}`;

test.use({ viewport: { width: 1920, height: 1080 } });

test("pede só os tiles do Brasil, no zoom final", async ({ page }) => {
  const tiles = await recordTiles(page);
  await page.goto("/");

  // Zoom 5 is the minimum for this window: columns 9 to 13, rows 15 to 19.
  const expected = [];
  for (let x = 9; x <= 13; x++) {
    for (let y = 15; y <= 19; y++) expected.push(`5/${x}/${y}`);
  }
  await expect
    .poll(() => new Set(tiles.map(key)).size)
    .toBe(expected.length);
  expect(new Set(tiles.map(key))).toEqual(new Set(expected));
  expect(tiles.every(overlapsBrazil)).toBe(true);
});

test("só pede tiles depois que a máscara do Brasil chega", async ({ page }) => {
  let isBoundaryServed = false;
  let tilesBeforeBoundary = 0;
  const tiles = await recordTiles(page);
  await page.route(boundaryUrl, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    isBoundaryServed = true;
    // StrictMode aborts the first request; it can no longer be fulfilled.
    await fulfillBoundary(route).catch(() => {});
  });
  page.on("request", (request) => {
    if (request.url().includes("tile.openstreetmap.org") && !isBoundaryServed) {
      tilesBeforeBoundary += 1;
    }
  });

  await page.goto("/");

  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  expect(tilesBeforeBoundary).toBe(0);
});

test("mostra a base mesmo sem o contorno do Brasil", async ({ page }) => {
  const tiles = await recordTiles(page);
  await page.route(boundaryUrl, (route) => route.abort());

  await page.goto("/");

  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  expect(tiles.every(overlapsBrazil)).toBe(true);
});

test("mostra a base se o contorno do Brasil travar", async ({ page }) => {
  const tiles = await recordTiles(page);
  // Never answered, like a request stuck behind a proxy.
  await page.route(boundaryUrl, () => {});
  await page.clock.install();

  await page.goto("/");
  await page.clock.fastForward(5_000);
  expect(tiles).toHaveLength(0);
  await page.clock.fastForward(5_000);

  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  expect(tiles.every(overlapsBrazil)).toBe(true);
});

test("baixa o contorno completo só com o mapa aproximado", async ({ page }) => {
  const details: (string | null)[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/boundaries/brazil")) {
      details.push(new URL(request.url()).searchParams.get("detail"));
    }
  });
  const tiles = await recordTiles(page);
  await page.goto("/");
  await expect.poll(() => tiles.length).toBeGreaterThan(0);

  expect(details).not.toContain("high");
  expect(details).toContain("low");

  // Zoom 5 to 8 and beyond: the full outline is fetched once.
  const map = page.locator(".leaflet-container");
  await map.hover({ position: { x: 1100, y: 700 } });
  for (let step = 0; step < 4; step++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(400);
  }
  await expect.poll(() => details.filter((d) => d === "high")).toHaveLength(1);
});

test("mantém o contorno leve se o completo falhar", async ({ page }) => {
  let isHighRequested = false;
  const tiles = await recordTiles(page);
  await page.route("**/api/boundaries/brazil?detail=high", (route) => {
    isHighRequested = true;
    return route.abort();
  });
  await page.goto("/");
  await expect.poll(() => tiles.length).toBeGreaterThan(0);

  const map = page.locator(".leaflet-container");
  await map.hover({ position: { x: 1100, y: 700 } });
  for (let step = 0; step < 4; step++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(400);
  }

  await expect.poll(() => isHighRequested).toBe(true);
  await expect(page.locator(".leaflet-brazilBoundary-pane canvas")).toBeAttached();
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "Contorno: IBGE",
  );
});

test("não pede tiles fora do Brasil ao arrastar o mapa", async ({ page }) => {
  const tiles = await recordTiles(page);
  await page.goto("/");
  await expect.poll(() => tiles.length).toBeGreaterThan(0);

  // Right of the filter panel, which sits on the left in a wide window.
  await page.mouse.move(1400, 540);
  await page.mouse.down();
  await page.mouse.move(600, 540, { steps: 20 });
  await page.waitForTimeout(500);
  const whileDragging = [...tiles];
  await page.mouse.up();

  expect(whileDragging.every(overlapsBrazil)).toBe(true);
});

test("recorta na caixa do Brasil os tiles da borda", async ({ page }) => {
  const tiles = await recordTiles(page);
  await page.goto("/");
  await expect.poll(() => tiles.length).toBe(25);

  const clipOf = (tile: string) =>
    page
      .locator(`img.leaflet-tile[src$="/${tile}.png"]`)
      .evaluate((img) => img.style.clipPath);
  const inset = (clip: string) =>
    (/inset\((.+)\)/.exec(clip)?.[1] ?? "0px 0px 0px 0px")
      .split(" ")
      .map((value) => Number.parseFloat(value));

  // Top-left corner: the box starts inside it from the north and the west.
  const [top, , , left] = inset(await clipOf("5/9/15"));
  expect(top).toBeGreaterThan(0);
  expect(left).toBeGreaterThan(0);
  // Bottom-right corner: the box ends inside it to the south and the east.
  const [, right, bottom] = inset(await clipOf("5/13/19"));
  expect(right).toBeGreaterThan(0);
  expect(bottom).toBeGreaterThan(0);
  // A tile fully inside the box is not clipped.
  expect(await clipOf("5/11/17")).toBe("");
});

test("a máscara acompanha o arrasto com o mapa aproximado", async ({
  page,
}) => {
  const tiles = await recordTiles(page);
  await page.goto("/");
  await expect.poll(() => tiles.length).toBeGreaterThan(0);

  const map = page.locator(".leaflet-container");
  await map.hover({ position: { x: 1100, y: 700 } });
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(1000);

  // Longer than the canvas padding (10% of the view) in both directions.
  await page.mouse.move(600, 300);
  await page.mouse.down();
  await page.mouse.move(1400, 900, { steps: 20 });
  // With no units there are no markers, so the only canvas is the mask's.
  const mask = page.locator(".leaflet-map-pane canvas");
  const [canvasBox, mapBox] = await Promise.all([
    mask.boundingBox(),
    map.boundingBox(),
  ]);
  await page.mouse.up();

  expect(canvasBox!.x).toBeLessThanOrEqual(mapBox!.x);
  expect(canvasBox!.y).toBeLessThanOrEqual(mapBox!.y);
  expect(canvasBox!.x + canvasBox!.width).toBeGreaterThanOrEqual(
    mapBox!.x + mapBox!.width,
  );
  expect(canvasBox!.y + canvasBox!.height).toBeGreaterThanOrEqual(
    mapBox!.y + mapBox!.height,
  );
});

test("mostra o anel de foco do mapa só para o teclado", async ({ page }) => {
  const tiles = await recordTiles(page);
  await page.goto("/");
  await expect.poll(() => tiles.length).toBeGreaterThan(0);

  const map = page.locator(".leaflet-container");
  const ring = () =>
    map.evaluate((element) => getComputedStyle(element, "::after").boxShadow);

  // Keyboard focus: the map follows the filter panel in the tab order.
  await page.getByRole("searchbox", { name: "Buscar no mapa" }).focus();
  const isMapFocused = () =>
    map.evaluate((element) => element === document.activeElement);
  for (let presses = 0; presses < 10 && !(await isMapFocused()); presses++) {
    await page.keyboard.press("Tab");
  }
  expect(await isMapFocused()).toBe(true);
  expect(await ring()).toContain("3px");

  await map.click({ position: { x: 1100, y: 500 } });
  expect(await ring()).toBe("none");

  // Shift alone belongs to a mouse gesture (Shift+drag zooms to a box).
  await page.keyboard.press("Shift");
  expect(await ring()).toBe("none");

  // Panning with the arrows is keyboard use, so the ring comes back.
  await page.keyboard.press("ArrowLeft");
  expect(await ring()).toContain("3px");
});
