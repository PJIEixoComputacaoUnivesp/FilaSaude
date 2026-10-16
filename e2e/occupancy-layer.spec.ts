import { expect, test, type Page } from "@playwright/test";

function unit(id: string, name: string, city: string) {
  return {
    id,
    name,
    unitType: "PRONTO ATENDIMENTO",
    address: {
      street: "Rua Teste",
      number: "100",
      district: "Centro",
      postalCode: "01000-000",
      city,
      state: "SP",
    },
    location: {
      latitude: -23.55,
      longitude: -46.63,
      precision: "source",
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
        fields: ["identity", "address", "location", "serviceHours"],
        lastUpdatedAt: "2026-09-20",
      },
    ],
  };
}

const unitsResponse = {
  data: [
    unit("1234567", "UPA Vila Mariana", "São Paulo"),
    unit("2345678", "UPA Mooca", "São Paulo"),
    unit("7654321", "Pronto Atendimento Osasco", "Osasco"),
  ],
  metadata: {
    count: 3,
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

const metadata = {
  simulated: true,
  source: {
    name: "Simulador de ocupação do FilaSaúde",
    description: "Dados sintéticos gerados para demonstração acadêmica.",
  },
  generatedAt: "2026-10-15T15:00:00.000Z",
  staleAfterMinutes: 20,
  thresholds: { moderate: 0.6, high: 0.85 },
};

const highOccupancy = {
  unitCnes: "1234567",
  percentage: 90,
  level: "high",
  confirmation: "recent",
  categories: [
    { code: "observation", capacity: 20, occupied: 18 },
    { code: "inpatient", capacity: 10, occupied: 9 },
  ],
  occurredAt: "2026-10-15T14:59:00.000Z",
  observedAt: "2026-10-15T14:59:01.000Z",
  receivedAt: "2026-10-15T14:59:02.000Z",
};

const staleOccupancy = {
  ...highOccupancy,
  unitCnes: "2345678",
  percentage: 70,
  level: null,
  confirmation: "stale",
  observedAt: "2026-10-15T14:00:01.000Z",
};

async function mockApi(page: Page, occupancyStatus = 200) {
  await page.route("**/api/units?state=SP", (route) =>
    route.fulfill({ json: unitsResponse }),
  );
  await page.route("**/api/occupancy", (route) =>
    occupancyStatus === 200
      ? route.fulfill({
          json: { data: [highOccupancy, staleOccupancy], metadata },
        })
      : route.fulfill({ status: occupancyStatus, body: "" }),
  );
  await page.route("**/api/units/1234567/occupancy-history", (route) =>
    route.fulfill({
      json: {
        data: {
          unitCnes: "1234567",
          current: highOccupancy,
          history: [
            {
              percentage: 40,
              level: "low",
              categories: highOccupancy.categories,
              occurredAt: "2026-10-15T13:00:00.000Z",
              observedAt: "2026-10-15T13:00:01.000Z",
            },
            {
              percentage: 90,
              level: "high",
              categories: highOccupancy.categories,
              occurredAt: highOccupancy.occurredAt,
              observedAt: highOccupancy.observedAt,
            },
          ],
        },
        metadata: { ...metadata, periodHours: 24 },
      },
    }),
  );
}

test("sem a demonstração na API, a camada não aparece", async ({ page }) => {
  await mockApi(page, 404);
  await page.goto("/units?uf=SP");

  await expect(page.getByText("3 unidades encontradas")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Ocupação simulada" }),
  ).toHaveCount(0);
});

test("a camada começa desligada e mostra só dados cadastrais", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/units?uf=SP");

  const toggle = page.getByRole("switch", { name: "Ocupação simulada" });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText("Dado simulado")).toHaveCount(0);
});

test("ligada, mostra a faixa em texto, a marca de simulação e filtra a amostra", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/units?uf=SP");

  // Keyboard: the switch is a native checkbox.
  await page.getByRole("switch", { name: "Ocupação simulada" }).focus();
  await page.keyboard.press("Space");

  const mariana = page
    .getByRole("article")
    .filter({ hasText: "UPA Vila Mariana" });
  await expect(mariana.getByText("Ocupação alta (90%)")).toBeVisible();
  await expect(mariana.getByText("Dado simulado")).toBeVisible();

  const mooca = page.getByRole("article").filter({ hasText: "UPA Mooca" });
  await expect(mooca.getByText("Sem confirmação recente")).toBeVisible();
  await expect(mooca.getByText(/\d+%/)).toHaveCount(0);

  const osasco = page
    .getByRole("article")
    .filter({ hasText: "Pronto Atendimento Osasco" });
  await expect(osasco.getByText("Dado simulado")).toHaveCount(0);

  await page
    .getByRole("checkbox", {
      name: "Mostrar só unidades com ocupação simulada",
    })
    .check();
  await expect(page.getByText("2 unidades encontradas")).toBeVisible();
});

test("o detalhe traz as categorias e o histórico em tabela", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/units?uf=SP");
  await page.getByText("Ocupação simulada", { exact: true }).first().click();
  await page
    .getByRole("article")
    .filter({ hasText: "UPA Vila Mariana" })
    .getByRole("link", { name: /Ver detalhes/ })
    .click();

  const section = page.getByRole("region", { name: "Ocupação simulada" });
  await expect(section.getByText("Dados simulados")).toBeVisible();
  await expect(
    section.getByText(/Não mede fila nem tempo de espera/),
  ).toBeVisible();
  await expect(
    section.getByRole("row", { name: /Observação 18 20 90%/ }),
  ).toBeVisible();
  // The level is computed on the total of the categories.
  await expect(
    section.getByRole("row", { name: /Total 27 30 90%/ }),
  ).toBeVisible();
  await expect(
    section.getByRole("img", {
      name: /Ocupação simulada nas últimas 24 horas/,
    }),
  ).toBeVisible();

  await section
    .locator("summary", { hasText: "Ver histórico em tabela" })
    .click();
  await expect(
    section.getByRole("cell", { name: "Ocupação baixa" }),
  ).toBeVisible();
});

test("qualquer visitante troca o cenário, com aviso de que vale para todos", async ({
  page,
}) => {
  await mockApi(page);
  const control = (scenario: string) => ({
    data: {
      scenario,
      changedAt: scenario === "showcase" ? null : "2026-10-15T15:00:00.000Z",
      expiresAt: scenario === "showcase" ? null : "2026-10-15T15:15:00.000Z",
      nextChangeAt: null,
      scenarios: [
        {
          id: "showcase",
          label: "Demonstração completa",
          description: "Todas as faixas ao mesmo tempo.",
        },
        {
          id: "surge",
          label: "Pico de ocupação",
          description: "A ocupação sobe até a faixa alta.",
        },
      ],
    },
    metadata: { simulated: true, defaultScenario: "showcase" },
  });
  let puts = 0;
  let current = "showcase";
  await page.route("**/api/occupancy/simulation", (route) => {
    if (route.request().method() === "PUT") {
      puts += 1;
      if (puts === 1) current = "surge";
      return puts === 1
        ? route.fulfill({ json: control(current) })
        : route.fulfill({
            status: 429,
            headers: { "Retry-After": "12" },
            json: { code: "scenario_cooldown" },
          });
    }
    return route.fulfill({ json: control(current) });
  });
  await page.goto("/units?uf=SP");
  await page.getByText("Ocupação simulada", { exact: true }).first().click();

  const picker = page.getByRole("combobox", { name: "Cenário da simulação" });
  await expect(picker).toHaveValue("showcase");
  await expect(
    page.getByText(/A escolha vale para todos que estão vendo o site/),
  ).toBeVisible();

  await picker.selectOption("surge");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Cenário trocado para "Pico de ocupação"/ }),
  ).toBeVisible();
  expect(puts).toBe(1);

  await picker.selectOption("showcase");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText(/Tente de novo em 12 segundos/)).toBeVisible();
});
