import { expect, test, type Page } from "@playwright/test";

function unit(
  id: string,
  name: string,
  latitude: number | null,
  longitude: number | null,
  precision: "source" | "municipality" = "source",
) {
  return {
    id,
    name,
    unitType: "PRONTO ATENDIMENTO",
    address: {
      street: null,
      number: null,
      district: null,
      postalCode: null,
      city: "São Paulo",
      state: "SP",
    },
    location: {
      latitude,
      longitude,
      precision,
      original: null,
      referenceMonth: null,
      correctedAt: null,
    },
    serviceHours: null,
    lastUpdatedAt: "2026-09-20",
    sources: [
      {
        name: "Cadastro Nacional de Estabelecimentos de Saúde (CNES)",
        url: "https://cnes.datasus.gov.br/",
        fields: ["identity", "address", "location"],
        lastUpdatedAt: "2026-09-20",
      },
    ],
  };
}

// Alphabetical order differs from the order by distance on purpose.
const units = [
  unit("1000001", "AMA Distante", -23.65, -46.75),
  unit("1000002", "Pronto Atendimento Central", -23.552, -46.634),
  unit("1000003", "UPA Sem Coordenadas", null, null),
  unit("1000004", "UPA Município", -23.6, -46.6, "municipality"),
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/units?*", (route) =>
    route.fulfill({
      json: {
        data: units,
        metadata: {
          count: units.length,
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

const cardNames = (page: Page) =>
  page.getByRole("article").getByRole("heading", { level: 2 }).allTextContents();

test("ordena por distância da posição real só quando a pessoa escolhe", async ({
  page,
  context,
}) => {
  await context.setGeolocation({
    latitude: -23.5505,
    longitude: -46.6333,
    accuracy: 50,
  });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/units");
  await expect(page.getByRole("article")).toHaveCount(4);
  const sort = page.getByRole("combobox", { name: "Ordenar por" });
  await expect(sort).toHaveValue("default");
  const card = (name: string) =>
    page.getByRole("article").filter({ hasText: name });
  // The distance shows as soon as the position is known; the order changes
  // only when the person asks for it.
  await expect(card("Pronto Atendimento Central")).toContainText(
    "menos de 0,5 km em linha reta",
  );
  expect(await cardNames(page)).toEqual([
    "AMA Distante",
    "Pronto Atendimento Central",
    "UPA Município",
    "UPA Sem Coordenadas",
  ]);

  await sort.selectOption({ label: "Distância de você (em linha reta)" });
  expect(await cardNames(page)).toEqual([
    "Pronto Atendimento Central",
    "UPA Município",
    "AMA Distante",
    "UPA Sem Coordenadas",
  ]);
  await expect(card("UPA Município")).toContainText(
    "até o centro do município",
  );
  await expect(card("UPA Sem Coordenadas")).toContainText(
    "Distância indisponível",
  );
  await expect(sort).toHaveAccessibleDescription(
    "Distância em linha reta, só como informação. Não indica qual unidade procurar.",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "ordenados por distância" }),
  ).toBeAttached();

  // The map popup and the unit page show it too.
  await card("Pronto Atendimento Central")
    .getByRole("link", { name: /Ver detalhes/ })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Pronto Atendimento Central" }),
  ).toBeVisible();
  await expect(page.getByText("Distância de você", { exact: true })).toBeVisible();
  await expect(page.getByText("menos de 0,5 km em linha reta")).toBeVisible();
  await page.goBack();

  // Without the position, the list goes back to the default order.
  await page.getByRole("link", { name: "Mapa", exact: true }).click();
  await page.getByRole("button", { name: "Remover localização" }).click();
  await page.getByRole("link", { name: "Lista", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(4);
  await expect(sort).toHaveCount(0);
  await expect(page.getByText("Distância de você", { exact: true })).toHaveCount(
    0,
  );
  expect(await cardNames(page)).toEqual([
    "AMA Distante",
    "Pronto Atendimento Central",
    "UPA Município",
    "UPA Sem Coordenadas",
  ]);
});

test("sem permissão, explica como liberar e não oferece a distância", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(_: PositionCallback, error: PositionErrorCallback) {
          error({ code: 1 } as GeolocationPositionError);
        },
      },
    });
  });
  await page.goto("/units");
  await expect(
    page.getByText(
      "Localização não permitida. Para ordenar por distância, permita o acesso nas configurações do navegador.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ordenar por" })).toHaveCount(
    0,
  );
});

test("uma posição muito imprecisa não ordena a lista", async ({
  page,
  context,
}) => {
  await context.setGeolocation({
    latitude: -23.5505,
    longitude: -46.6333,
    accuracy: 20_000,
  });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/units");
  await expect(page.getByRole("article").first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ordenar por" })).toHaveCount(
    0,
  );
});

test("o popup da unidade no mapa mostra a distância", async ({
  page,
  context,
}) => {
  await context.setGeolocation({
    latitude: -23.5505,
    longitude: -46.6333,
    accuracy: 50,
  });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/units");
  await page
    .getByRole("article")
    .filter({ hasText: "AMA Distante" })
    .getByRole("link", { name: /Ver no mapa/ })
    .click();
  await expect(page.locator(".leaflet-popup")).toContainText(
    "Distância de você: ≈ 16 km em linha reta",
  );
});
