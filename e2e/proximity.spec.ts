import { expect, test, type Page } from "@playwright/test";

function unit(
  id: string,
  name: string,
  latitude: number | null,
  longitude: number | null,
  precision: "source" | "municipality" = "source",
  state = "SP",
  city = "São Paulo",
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
      city,
      state,
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
  unit("1000005", "UPA em outra UF", -23.0, -46.7, "source", "MG", "Extrema"),
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
  await expect(page.getByRole("article")).toHaveCount(5);
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
    "UPA em outra UF",
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
    "UPA em outra UF",
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
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(sort).toHaveCount(0);
  await expect(page.getByText("Distância de você", { exact: true })).toHaveCount(
    0,
  );
  expect(await cardNames(page)).toEqual([
    "UPA em outra UF",
    "AMA Distante",
    "Pronto Atendimento Central",
    "UPA Município",
    "UPA Sem Coordenadas",
  ]);
});

test("descarta a ordenação antiga quando perde a posição sem sair da lista", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as {
      rejectLocation: () => void;
      restoreLocation: () => void;
    };
    const permission = Object.assign(new EventTarget(), { state: "granted" });
    let requests = 0;
    let latitude = -23.5505;
    let longitude = -46.6333;
    Object.defineProperty(navigator, "permissions", {
      value: { query: async () => permission },
    });
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(success: PositionCallback, error: PositionErrorCallback) {
          requests += 1;
          // The quick reading succeeds; the pending precise reading may
          // still report that permission was revoked in browser settings.
          if (requests === 2) {
            state.rejectLocation = () => {
              permission.state = "denied";
              error({ code: 1 } as GeolocationPositionError);
            };
            return;
          }
          success({ coords: { latitude, longitude, accuracy: 50 } } as GeolocationPosition);
        },
      },
    });
    state.restoreLocation = () => {
      latitude = -23.65;
      longitude = -46.75;
      permission.state = "granted";
      permission.dispatchEvent(new Event("change"));
    };
  });
  await page.goto("/units");
  const sort = page.getByRole("combobox", { name: "Ordenar por" });
  await sort.selectOption("distance");
  await expect(page.getByRole("article").first()).toContainText("Pronto Atendimento Central");

  await page.evaluate("window.rejectLocation()");
  await expect(sort).toHaveCount(0);
  await page.evaluate("window.restoreLocation()");
  await expect(sort).toHaveValue("default");
  await expect(page.getByRole("article").first()).toContainText("UPA em outra UF");
  await expect(
    page.getByRole("article").filter({ hasText: "AMA Distante" }),
  ).toContainText("menos de 0,5 km em linha reta");
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

test("filtra por raio adaptativo, cruza UFs e compartilha o modo com o mapa", async ({
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

  await page.getByRole("combobox", { name: "Estado" }).selectOption("NEARBY");
  const radius = page.getByRole("combobox", { name: "Distância de você" });
  await expect(radius).toHaveValue("25");
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByText("UPA em outra UF")).toHaveCount(0);

  await radius.selectOption("100");
  await expect(page.getByRole("article")).toHaveCount(4);
  await expect(
    page.getByRole("article").filter({ hasText: "UPA em outra UF" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/(?:latitude|longitude|radius|nearby)=/);

  await page.getByRole("link", { name: "Mapa", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Estado" })).toHaveValue(
    "NEARBY",
  );
  await expect(
    page.getByRole("combobox", { name: "Distância de você" }),
  ).toHaveValue("100");
  await page.getByRole("searchbox", { name: "Buscar no mapa" }).fill("Rio Branco");
  await page.getByRole("button", { name: "Buscar em todo o Brasil" }).click();
  await expect(page.getByRole("combobox", { name: "Estado" })).toHaveValue("ALL");
  await expect(page).toHaveURL(/q=Rio\+Branco/);
});

test("um raio com poucos resultados oferece a busca nacional sem apagar o texto", async ({
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
  await page.getByRole("combobox", { name: "Estado" }).selectOption("NEARBY");
  await page.getByRole("searchbox", { name: "Buscar por unidade, cidade ou bairro" }).fill("Extrema");
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText(/Nenhuma unidade com “Extrema” a até/)).toBeVisible();
  await page.getByRole("button", { name: "Buscar em todo o Brasil" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("searchbox", { name: "Buscar por unidade, cidade ou bairro" })).toHaveValue("Extrema");
  await expect(page).toHaveURL(/q=Extrema/);
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

test("sem posição por tempo esgotado, a lista diz o motivo", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(_: PositionCallback, error: PositionErrorCallback) {
          error({ code: 3 } as GeolocationPositionError);
        },
      },
    });
  });
  await page.goto("/units");
  await expect(
    page.getByText(/A localização demorou para responder/),
  ).toBeVisible();
});

test("ao redor de você no celular, estado e raio lado a lado e o primeiro resultado à vista", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setGeolocation({
    latitude: -23.5505,
    longitude: -46.6333,
    accuracy: 50,
  });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/units");
  const stateSelect = page.getByRole("combobox", { name: "Estado" });
  await stateSelect.selectOption("NEARBY");
  const radius = page.getByRole("combobox", { name: "Distância" });
  await expect(radius).toBeVisible();
  const [a, b] = await Promise.all([
    stateSelect.boundingBox(),
    radius.boundingBox(),
  ]);
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  await page
    .getByRole("combobox", { name: "Ordenar por" })
    .selectOption("distance");
  const first = page.getByRole("article").first();
  expect((await first.boundingBox())!.y).toBeLessThan(844);
});

test("no detalhe com distância, os dados preenchem duas colunas", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await context.setGeolocation({
    latitude: -23.5505,
    longitude: -46.6333,
    accuracy: 50,
  });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/units");
  await page
    .getByRole("article")
    .filter({ hasText: "Pronto Atendimento Central" })
    .getByRole("link", { name: /Ver detalhes/ })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Pronto Atendimento Central" }),
  ).toBeVisible();
  await expect(
    page.getByRole("term").filter({ hasText: "Distância de você" }),
  ).toBeVisible();
  const [hours, position] = await Promise.all([
    page.getByText("Horário informado", { exact: true }).boundingBox(),
    page.getByText("Localização no mapa", { exact: true }).boundingBox(),
  ]);
  expect(Math.abs(hours!.y - position!.y)).toBeLessThan(2);
});

test("sem unidades no enquadramento da posição, avisa e oferece a busca ao redor", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setGeolocation({ latitude: -23.3, longitude: -46.95, accuracy: 50 });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/");
  const location = page.getByRole("region", { name: "Sua localização", exact: true });
  await expect(location.getByText("Nenhuma unidade nesta parte do mapa.")).toBeVisible();
  await location
    .getByRole("button", { name: "Mostrar unidades ao redor de você" })
    .click();
  await expect(
    page.getByRole("button", { name: /^Filtros e legenda: até \d+ km/ }),
  ).toBeVisible();
  await expect(location.getByText("Nenhuma unidade nesta parte do mapa.")).toHaveCount(0);
});

test("no celular, o painel resume o aviso do catálogo e a folha o mostra inteiro", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setGeolocation({ latitude: -23.5505, longitude: -46.6333, accuracy: 50 });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/");
  await expect(page.locator(".user-location-marker")).toBeVisible();
  await page.getByRole("button", { name: /^Filtros e legenda/ }).click();
  const dialog = page.getByRole("dialog", { name: "Filtros e legenda" });
  await dialog.getByRole("combobox", { name: "Estado" }).selectOption("NEARBY");
  await dialog.getByRole("combobox", { name: "Distância de você" }).selectOption("100");
  await expect(dialog.getByText(/O catálogo reúne UPAs e prontos-socorros/)).toBeVisible();
  await dialog.getByRole("button", { name: "Voltar ao mapa" }).click();
  const panel = page.getByRole("region", { name: "Controles do mapa" });
  await expect(
    panel.getByText("Sem unidades aqui não indica ausência de atendimento."),
  ).toBeVisible();
  await expect(panel.getByText(/O catálogo reúne/)).toBeHidden();
});

test("em telas largas e baixas, a folha de filtros é um cartão estreito", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Filtros e legenda/ }).click();
  const box = (await page
    .getByRole("dialog", { name: "Filtros e legenda" })
    .boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(450);
  expect(box.x).toBeLessThanOrEqual(20);
  expect(box.y).toBeGreaterThanOrEqual(0);
});
