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
      location: { latitude: -23.596, longitude: -46.643 },
      serviceHours: "Atendimento contínuo de 24 horas por dia",
      lastUpdatedAt: "2026-09-20",
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
      location: { latitude: -23.532, longitude: -46.792 },
      serviceHours: null,
      lastUpdatedAt: "2026-09-18",
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
  await page.goto("/units");
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
