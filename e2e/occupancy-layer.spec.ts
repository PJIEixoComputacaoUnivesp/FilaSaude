import { expect, test, type Page } from "@playwright/test";

function unit(id: string, name: string, city: string, state = "SP") {
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
      state,
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

async function mockOccupancyStream(page: Page) {
  await page.addInitScript(() => {
    const streams: EventTarget[] = [];
    Object.assign(window, { occupancyTestStreams: streams });
    class MockEventSource extends EventTarget {
      constructor() {
        super();
        streams.push(this);
        queueMicrotask(() => this.dispatchEvent(new Event("open")));
      }
      close() {
        const index = streams.indexOf(this);
        if (index >= 0) streams.splice(index, 1);
      }
    }
    Object.defineProperty(window, "EventSource", { value: MockEventSource });
  });
}

async function emitOccupancyEvent(page: Page, type: string, payload?: unknown) {
  await page.evaluate(
    ({ eventType, data }) => {
      const streams = (
        window as unknown as { occupancyTestStreams: EventTarget[] }
      ).occupancyTestStreams;
      for (const stream of streams)
        stream.dispatchEvent(
          new MessageEvent(eventType, { data: JSON.stringify(data) }),
        );
    },
    { eventType: type, data: payload },
  );
}

async function mockApi(page: Page, occupancyStatus = 200) {
  await mockOccupancyStream(page);
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
    page.getByRole("switch", { name: "Ocupação simulada de leitos" }),
  ).toHaveCount(0);
});

test("a camada começa desligada e mostra só dados cadastrais", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/units?uf=SP");

  const toggle = page.getByRole("switch", {
    name: "Ocupação simulada de leitos",
  });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText("Dado simulado de leitos")).toHaveCount(0);
});

test("ligada, mostra a faixa em texto, a marca de simulação e filtra a amostra", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/units?uf=SP");

  // Keyboard: the switch is a native checkbox.
  await page
    .getByRole("switch", { name: "Ocupação simulada de leitos" })
    .focus();
  await page.keyboard.press("Space");

  const mariana = page
    .getByRole("article")
    .filter({ hasText: "UPA Vila Mariana" });
  await expect(mariana.getByText("Ocupação alta (90%)")).toBeVisible();
  await expect(mariana.getByText("Dado simulado de leitos")).toBeVisible();

  const mooca = page.getByRole("article").filter({ hasText: "UPA Mooca" });
  await expect(mooca.getByText("Sem confirmação recente")).toBeVisible();
  await expect(mooca.getByText(/\d+%/)).toHaveCount(0);

  const osasco = page
    .getByRole("article")
    .filter({ hasText: "Pronto Atendimento Osasco" });
  await expect(osasco.getByText("Dado simulado de leitos")).toHaveCount(0);

  await page
    .getByRole("checkbox", {
      name: "Mostrar só unidades com ocupação simulada de leitos",
    })
    .check();
  await expect(page.getByText("2 unidades encontradas")).toBeVisible();
});

test("o detalhe traz as categorias e o histórico em tabela", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/units?uf=SP");
  await page
    .getByText("Ocupação simulada de leitos", { exact: true })
    .first()
    .click();
  await page
    .getByRole("article")
    .filter({ hasText: "UPA Vila Mariana" })
    .getByRole("link", { name: /Ver detalhes/ })
    .click();

  const section = page.getByRole("region", {
    name: "Ocupação simulada de leitos",
  });
  await expect(section.getByText("Dados simulados")).toBeVisible();
  await expect(
    section.getByText(
      /Não representam fila, tempo de espera nem capacidade de atendimento/,
    ),
  ).toBeVisible();
  await expect(
    section.getByRole("row", { name: /Observação 18 20 90%/ }),
  ).toBeVisible();
  // The level is computed on the total of the categories.
  await expect(
    section.getByRole("row", { name: /Total das categorias 27 30 90%/ }),
  ).toBeVisible();
  await expect(
    section.getByRole("img", {
      name: /Ocupação simulada de leitos nas últimas 24 horas/,
    }),
  ).toBeVisible();

  await section
    .locator("summary", { hasText: "Ver histórico em tabela" })
    .click();
  await expect(
    section.getByRole("cell", { name: "Ocupação baixa" }),
  ).toBeVisible();
});

test("filtros locais preservam a leitura nacional sem controlar as fontes", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page);
  const rio = unit("3456789", "UPA Tijuca", "Rio de Janeiro", "RJ");
  await page.route("**/api/units?state=RJ", (route) =>
    route.fulfill({
      json: {
        data: [rio],
        metadata: { ...unitsResponse.metadata, count: 1, state: "RJ" },
      },
    }),
  );
  let rioPercentage = 40;
  const occupancyRequests: { method: string; search: string }[] = [];
  await page.route("**/api/occupancy", (route) => {
    const request = route.request();
    occupancyRequests.push({
      method: request.method(),
      search: new URL(request.url()).search,
    });
    return route.fulfill({
      json: {
        data: [
          highOccupancy,
          staleOccupancy,
          {
            ...highOccupancy,
            unitCnes: rio.id,
            percentage: rioPercentage,
            level: rioPercentage >= 85 ? "high" : "low",
          },
        ],
        metadata,
      },
    });
  });
  const controlRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/occupancy/simulation"))
      controlRequests.push(request.method());
  });

  await page.goto("/units?uf=SP");
  await page
    .getByRole("switch", { name: "Ocupação simulada de leitos" })
    .focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("combobox", { name: "Cenário da simulação" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "UPA Vila Mariana" })
      .getByText("Ocupação alta (90%)"),
  ).toBeVisible();
  await expect(
    page.getByText(/3 unidades com ocupação simulada de leitos no Brasil$/),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Estado" }).selectOption("RJ");
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: rio.name })
      .getByText("Ocupação baixa (40%)"),
  ).toBeVisible();

  // Sources keep producing while the visitor looks at a different state.
  const requestsBefore = occupancyRequests.length;
  rioPercentage = 95;
  await page.clock.fastForward(60_000);
  expect(occupancyRequests).toHaveLength(requestsBefore);
  await emitOccupancyEvent(page, "occupancy.updated", {
    data: [
      {
        ...highOccupancy,
        unitCnes: rio.id,
        percentage: rioPercentage,
        level: "high",
      },
    ],
    metadata,
  });
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: rio.name })
      .getByText("Ocupação alta (95%)"),
  ).toBeVisible();
  expect(occupancyRequests).toHaveLength(requestsBefore);
  expect(
    occupancyRequests.every(
      ({ method, search }) => method === "GET" && search === "",
    ),
  ).toBe(true);
  expect(controlRequests).toEqual([]);
});

test("SSE reconecta pela consulta REST e encerra ao desligar a camada", async ({
  page,
}) => {
  await mockApi(page);
  let percentage = 90;
  let reads = 0;
  await page.route("**/api/occupancy", (route) => {
    reads++;
    return route.fulfill({
      json: { data: [{ ...highOccupancy, percentage }], metadata },
    });
  });
  await page.goto("/units?uf=SP");
  const toggle = page.getByRole("switch", {
    name: "Ocupação simulada de leitos",
  });
  await toggle.focus();
  await page.keyboard.press("Space");
  const card = page
    .getByRole("article")
    .filter({ hasText: "UPA Vila Mariana" });
  await expect(card.getByText("Ocupação alta (90%)")).toBeVisible();
  const beforeReconnect = reads;
  await emitOccupancyEvent(page, "error");
  await expect(
    page.getByText(/A atualização em tempo real foi interrompida/),
  ).toBeVisible();
  percentage = 95;
  await emitOccupancyEvent(page, "open");
  await expect(card.getByText("Ocupação alta (95%)")).toBeVisible();
  expect(reads).toBeGreaterThan(beforeReconnect);
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { occupancyTestStreams: EventTarget[] })
          .occupancyTestStreams.length,
    ),
  ).toBe(0);
});

test("SSE atualiza o histórico da unidade mesmo quando o estado atual não muda", async ({
  page,
}) => {
  await mockApi(page);
  const points = [{ ...highOccupancy, percentage: 90, level: "high" }];
  let reads = 0;
  await page.route("**/api/units/1234567/occupancy-history", (route) => {
    reads++;
    return route.fulfill({
      json: {
        data: { unitCnes: "1234567", current: highOccupancy, history: points },
        metadata: { ...metadata, periodHours: 24 },
      },
    });
  });
  await page.goto("/units?uf=SP");
  await page
    .getByRole("switch", { name: "Ocupação simulada de leitos" })
    .focus();
  await page.keyboard.press("Space");
  await page
    .getByRole("article")
    .filter({ hasText: "UPA Vila Mariana" })
    .getByRole("link", { name: /Ver detalhes/ })
    .click();
  const section = page.getByRole("region", {
    name: "Ocupação simulada de leitos",
  });
  await section
    .locator("summary", { hasText: "Ver histórico em tabela" })
    .click();
  await expect(
    section.locator("details").getByRole("cell", { name: "90%", exact: true }),
  ).toBeVisible();
  const beforeUpdate = reads;
  // An out-of-order event changes history but preserves the current projection.
  points.unshift({
    ...highOccupancy,
    occurredAt: "2026-10-15T13:00:00Z",
    percentage: 20,
    level: "low",
  });
  await emitOccupancyEvent(page, "occupancy.updated", {
    data: [highOccupancy],
    metadata,
  });
  await expect(
    section.locator("details").getByRole("cell", { name: "20%", exact: true }),
  ).toBeVisible();
  expect(reads).toBeGreaterThan(beforeUpdate);
  await expect(section.getByText("Ocupação alta (90%)")).toBeVisible();
});
