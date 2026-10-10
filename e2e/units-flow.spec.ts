import { expect, test, type Page } from "@playwright/test";

const unitsResponse = {
  data: [
    {
      id: "1234567",
      name: "UPA Vila Mariana",
      unitType: "PRONTO ATENDIMENTO",
      address: {
        street: "Rua Diogo de Faria",
        number: "609",
        district: "Vila Clementino",
        postalCode: "04037-002",
        city: "São Paulo",
        state: "SP",
      },
      location: {
        latitude: -23.596,
        longitude: -46.643,
        precision: "source",
        original: null,
        referenceMonth: null,
        correctedAt: null,
      },
      serviceHours: "Atendimento contínuo de 24 horas por dia",
      lastUpdatedAt: "2026-09-20",
      sources: [
        {
          name: "Cadastro Nacional de Estabelecimentos de Saúde (CNES)",
          url: "https://cnes.datasus.gov.br/",
          fields: ["identity", "address", "location", "serviceHours"],
          lastUpdatedAt: "2026-09-20",
        },
      ],
    },
    {
      id: "7654321",
      name: "Pronto Atendimento Osasco",
      unitType: "PRONTO SOCORRO GERAL",
      address: {
        street: "Rua Teste",
        number: "100",
        district: "Centro",
        postalCode: "06000-000",
        city: "Osasco",
        state: "SP",
      },
      location: {
        latitude: -23.532,
        longitude: -46.792,
        precision: "source",
        original: null,
        referenceMonth: null,
        correctedAt: null,
      },
      serviceHours: null,
      lastUpdatedAt: "2026-09-18",
      sources: [
        {
          name: "Cadastro Nacional de Estabelecimentos de Saúde (CNES)",
          url: "https://cnes.datasus.gov.br/",
          fields: ["identity", "address", "location", "serviceHours"],
          lastUpdatedAt: "2026-09-18",
        },
      ],
    },
  ],
  metadata: {
    count: 2,
    state: "SP",
    dataOrigin: "live",
    isStale: false,
    retrievedAt: "2026-09-21T12:00:00-03:00",
    latestSourceUpdate: "2026-09-20",
    source: {
      name: "Cadastro Nacional de Estabelecimentos de Saúde (CNES)",
      url: "https://cnes.datasus.gov.br/",
    },
  },
};

async function openUnitsPage(page: Page) {
  await page.route("**/api/units?state=SP", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(unitsResponse),
    }),
  );
  await page.goto("/units?uf=SP");
  await expect(page.getByText("2 unidades encontradas")).toBeVisible();
}

test("busca uma unidade e exibe seus detalhes e sua fonte", async ({
  page,
}) => {
  await openUnitsPage(page);

  await page
    .getByRole("searchbox", {
      name: "Buscar por unidade, cidade ou bairro",
    })
    .fill("Vila Mariana");

  await expect(page.getByText("1 unidade encontrada")).toBeVisible();
  const unit = page
    .getByRole("article")
    .filter({ hasText: "UPA Vila Mariana" });
  await expect(
    unit.getByRole("heading", { name: "UPA Vila Mariana" }),
  ).toBeVisible();
  await expect(
    unit.getByText(
      "Rua Diogo de Faria, 609 · Vila Clementino · São Paulo - SP",
    ),
  ).toBeVisible();
  await expect(
    unit.getByRole("link", {
      name: "Cadastro Nacional de Estabelecimentos de Saúde (CNES)",
    }),
  ).toHaveAttribute("href", "https://cnes.datasus.gov.br/");
  await expect(unit).toContainText("atualizado em 20/09/2026");
});

test("informa quando a busca não encontra unidades", async ({ page }) => {
  await openUnitsPage(page);

  await page
    .getByRole("searchbox", {
      name: "Buscar por unidade, cidade ou bairro",
    })
    .fill("Unidade inexistente");

  await expect(page.getByText("0 unidades encontradas")).toBeVisible();
  await expect(
    page.getByText(
      "Nenhuma unidade corresponde à busca. Tente outro nome, cidade ou bairro.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("leva a busca do mapa para a lista", async ({ page }) => {
  await page.route("**/api/units?state=ALL", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...unitsResponse,
        metadata: {
          ...unitsResponse.metadata,
          state: "BR",
          dataOrigin: "fallback",
          isStale: true,
        },
      }),
    }),
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Mapa das unidades de pronto atendimento",
    }),
  ).toBeAttached();
  await expect(page.getByText("2 unidades no mapa.")).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Buscar no mapa" })
    .fill("Vila Mariana");
  await expect(page.getByText("1 unidade no mapa.")).toBeVisible();
  // The URL follows the field once typing pauses.
  await expect(page).toHaveURL(/\?q=Vila\+Mariana$/);

  await page
    .getByRole("navigation", { name: "Forma de visualização" })
    .getByRole("link", { name: "Lista" })
    .click();

  await expect(page).toHaveURL(/\/units\?q=Vila\+Mariana$/);
  await expect(
    page.getByRole("searchbox", {
      name: "Buscar por unidade, cidade ou bairro",
    }),
  ).toHaveValue("Vila Mariana");
  await expect(page.getByText("1 unidade encontrada")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "UPA Vila Mariana" }),
  ).toBeVisible();
});

test("redireciona /map e caminhos desconhecidos para o mapa, mantendo a busca", async ({
  page,
}) => {
  await page.route("**/api/units?state=ALL", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...unitsResponse,
        metadata: { ...unitsResponse.metadata, state: "BR" },
      }),
    }),
  );

  await page.goto("/map?uf=SP&q=osasco");
  await expect(page).toHaveURL(/\/\?uf=SP&q=osasco$/);
  await expect(page.getByRole("searchbox", { name: "Buscar no mapa" })).toHaveValue(
    "osasco",
  );

  await page.goto("/caminho-que-nao-existe");
  await expect(page).toHaveURL(/\/$/);
});

test("mantém a busca ao ler Sobre os dados e voltar ao mapa", async ({ page }) => {
  await page.route("**/api/units?state=ALL", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...unitsResponse,
        metadata: { ...unitsResponse.metadata, state: "BR" },
      }),
    }),
  );

  await page.goto("/");
  const field = page.getByRole("searchbox", { name: "Buscar no mapa" });
  await field.fill("Osasco");
  await expect(page.getByText("1 unidade no mapa.")).toBeVisible();

  await page.getByRole("link", { name: "Sobre os dados" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sobre os dados" }),
  ).toBeFocused();

  await page.getByRole("link", { name: "Voltar ao mapa" }).click();
  await expect(page).toHaveURL(/\/\?q=Osasco$/);
  await expect(
    page.getByRole("searchbox", { name: "Buscar no mapa" }),
  ).toHaveValue("Osasco");
  await expect(page.getByText("1 unidade no mapa.")).toBeVisible();
});
