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

test("abre o detalhe da unidade em uma URL própria", async ({ page }) => {
  await openUnitsPage(page);

  const card = page
    .getByRole("article")
    .filter({ hasText: "UPA Vila Mariana" });
  await card
    .getByRole("link", { name: /Ver detalhes\s*: UPA Vila Mariana/ })
    .click();

  await expect(page).toHaveURL(/\/units\/1234567\?uf=SP$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "UPA Vila Mariana" }),
  ).toBeFocused();
  await expect(page.getByText("CNES 1234567")).toBeVisible();
  await expect(
    page.getByText("Atendimento contínuo de 24 horas por dia"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Cadastro Nacional de Estabelecimentos de Saúde (CNES)",
    }),
  ).toHaveAttribute("href", "https://cnes.datasus.gov.br/");
});

test("liga o cartão ao popup do mapa e volta ao mesmo cartão", async ({
  page,
}) => {
  await openUnitsPage(page);

  const card = page
    .getByRole("article")
    .filter({ hasText: "UPA Vila Mariana" });
  await card
    .getByRole("link", { name: /Ver no mapa\s*: UPA Vila Mariana/ })
    .click();

  await expect(page).toHaveURL(/\/\?uf=SP&unidade=1234567$/);
  const popup = page.locator(".leaflet-popup");
  await expect(popup).toContainText("UPA Vila Mariana");
  await expect(
    popup.getByText("UPA Vila Mariana", { exact: true }),
  ).toBeFocused();
  await expect(
    popup.getByRole("link", { name: /Ver na lista\s*: UPA Vila Mariana/ }),
  ).toBeVisible();

  await popup
    .getByRole("link", { name: /Ver na lista\s*: UPA Vila Mariana/ })
    .click();

  await expect(page).toHaveURL(/\/units\?uf=SP#unit-1234567$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "UPA Vila Mariana" }),
  ).toBeFocused();

  const searchbox = page.getByRole("searchbox", {
    name: "Buscar por unidade, cidade ou bairro",
  });
  await searchbox.fill("Vila");
  await expect(page.getByText("1 unidade encontrada")).toBeVisible();
  await expect(searchbox).toBeFocused();
});

test("mantém o popup selecionado dentro da área útil no celular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const historicalUnit = {
    ...unitsResponse.data[0],
    location: {
      ...unitsResponse.data[0].location,
      precision: "history",
      referenceMonth: "2026-08",
    },
  };
  await page.route("**/api/units?state=SP", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...unitsResponse,
        data: [historicalUnit],
        metadata: {
          ...unitsResponse.metadata,
          dataOrigin: "fallback",
          isStale: true,
        },
      }),
    }),
  );

  await page.goto("/?uf=SP&unidade=1234567");

  const popup = page.locator(".leaflet-popup");
  await expect(popup).toBeVisible();
  const panel = page
    .getByRole("search", { name: "Buscar no mapa" })
    .locator("..");
  const map = page.locator(".leaflet-container");
  await expect
    .poll(async () => {
      const [popupBox, panelBox, mapBox] = await Promise.all([
        popup.boundingBox(),
        panel.boundingBox(),
        map.boundingBox(),
      ]);
      return (
        popupBox !== null &&
        panelBox !== null &&
        mapBox !== null &&
        popupBox.x >= 0 &&
        popupBox.x + popupBox.width <= 320 &&
        popupBox.y >= panelBox.y + panelBox.height &&
        popupBox.y + popupBox.height <= mapBox.y + mapBox.height
      );
    })
    .toBe(true);

  const listLink = popup.getByRole("link", {
    name: /Ver na lista\s*: UPA Vila Mariana/,
  });
  await listLink.scrollIntoViewIfNeeded();
  await listLink.click();
  await expect(page).toHaveURL(/\/units\?uf=SP#unit-1234567$/);
});

test("mostra unidade não encontrada e dado desatualizado no detalhe", async ({
  page,
}) => {
  await page.route("**/api/units?state=SP", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...unitsResponse,
        metadata: { ...unitsResponse.metadata, isStale: true },
      }),
    }),
  );

  await page.goto("/units/0000000?uf=SP");

  await expect(
    page.getByRole("heading", { level: 1, name: "Unidade não encontrada" }),
  ).toBeVisible();
  await expect(page.getByText("Não encontramos uma unidade")).toBeVisible();

  await page.goto("/units/1234567?uf=SP");
  await expect(
    page.getByText(/A fonte oficial está temporariamente indisponível/),
  ).toBeVisible();
});

test("revela e foca um cartão além da primeira página da lista", async ({
  page,
}) => {
  const units = Array.from({ length: 25 }, (_, index) => ({
    ...unitsResponse.data[0],
    id: String(index + 1).padStart(7, "0"),
    name: `UPA ${String(index + 1).padStart(2, "0")}`,
  }));
  await page.route("**/api/units?state=SP", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...unitsResponse,
        data: units,
        metadata: { ...unitsResponse.metadata, count: units.length },
      }),
    }),
  );

  await page.goto("/units?uf=SP#unit-0000025");

  await expect(page.getByRole("article")).toHaveCount(25);
  await expect(
    page.getByRole("heading", { level: 2, name: "UPA 25" }),
  ).toBeFocused();
});

test("ignora fragmento de unidade malformado", async ({ page }) => {
  await page.route("**/api/units?state=SP", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(unitsResponse),
    }),
  );

  await page.goto("/units?uf=SP#unit-%E0%A4%A");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Unidades de pronto atendimento",
    }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(2);
});

test("restaura a UF correta ao voltar entre detalhes", async ({ page }) => {
  const rioUnit = {
    ...unitsResponse.data[0],
    id: "2222222",
    name: "UPA Rio",
    address: {
      ...unitsResponse.data[0].address,
      city: "Rio de Janeiro",
      state: "RJ",
    },
  };
  await page.route("**/api/units?state=*", (route) => {
    const state = new URL(route.request().url()).searchParams.get("state");
    const data = state === "RJ" ? [rioUnit] : unitsResponse.data;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...unitsResponse,
        data,
        metadata: { ...unitsResponse.metadata, count: data.length, state },
      }),
    });
  });

  await page.goto("/units?uf=SP");
  await page
    .getByRole("heading", { level: 2, name: "UPA Vila Mariana" })
    .getByRole("link")
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "UPA Vila Mariana" }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Forma de visualização" })
    .getByRole("link", { name: "Lista" })
    .click();
  await page.getByRole("combobox", { name: "Estado" }).selectOption("RJ");
  await page.getByRole("link", { name: /Ver detalhes\s*: UPA Rio/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "UPA Rio" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/units\?uf=RJ$/);
  await page.goBack();

  await expect(page).toHaveURL(/\/units\/1234567\?uf=SP$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "UPA Vila Mariana" }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("searchbox", { name: "Buscar no mapa" }),
  ).toHaveValue("osasco");

  await page.goto("/caminho-que-nao-existe");
  await expect(page).toHaveURL(/\/$/);
});

test("mantém a busca ao ler Sobre os dados e voltar ao mapa", async ({
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

test("no celular, o aviso informativo abre por inteiro e leva a Sobre os dados", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("**/api/units?state=ALL", (route) =>
    route.fulfill({ json: unitsResponse }),
  );
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText("sem orientação médica")).toBeVisible();
  const notice = page.getByRole("note", { name: "Aviso informativo" });
  await expect(notice).toBeHidden();

  const open = footer.getByRole("button", { name: "Saiba mais" });
  await open.click();
  await expect(notice).toBeVisible();
  await expect(
    notice.getByText(/não faz diagnóstico, triagem nem recomendação médica/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(notice).toBeHidden();
  await expect(open).toBeFocused();

  await open.click();
  await notice.getByRole("button", { name: "Fechar" }).click();
  await expect(notice).toBeHidden();
  await expect(open).toBeFocused();

  // Leaving it with the keyboard closes it, so it never covers the map
  // controls that receive focus next.
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(notice).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(notice).toBeHidden();

  await open.click();
  await notice.getByRole("link", { name: "Sobre os dados" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sobre os dados" }),
  ).toBeVisible();
  await expect(notice).toBeHidden();
});

test("trata /units/ com barra final como a lista e grava a busca na URL", async ({
  page,
}) => {
  await page.route("**/api/units?state=SP", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(unitsResponse),
    }),
  );

  await page.goto("/units/?uf=SP");
  await expect(page.getByText("2 unidades encontradas")).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Buscar por unidade, cidade ou bairro" })
    .fill("Osasco");

  await expect(page.getByText("1 unidade encontrada")).toBeVisible();
  await expect(page).toHaveURL(/\?uf=SP&q=Osasco$/);
});
