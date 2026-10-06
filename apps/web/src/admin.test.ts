import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminApiError,
  actionLabel,
  adminErrorMessage,
  coordinateError,
  extractCoordinatePair,
  fetchAdminLogin,
  formatCoordinate,
  formatCoordinateInput,
  formatDateTime,
  isCorrection,
  isCorrectionEvent,
  listCorrectionEvents,
  listCorrections,
  methodError,
  normalizeCnesCode,
  parseCoordinate,
  removeCorrection,
  saveCorrection,
  type AdminErrorKind,
} from "./admin";

const TOKEN = "t".repeat(48);

function respondWith(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
    ),
  );
}

async function kindOf(promise: Promise<unknown>): Promise<AdminErrorKind> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AdminApiError) return error.kind;
    throw error;
  }
  throw new Error("expected the call to fail");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseCoordinate", () => {
  it.each([
    ["-23,5343", -23.5343],
    ["-23.5343", -23.5343],
    ["−23,5343", -23.5343],
    ["–23.5343", -23.5343],
    ["  -46.8368  ", -46.8368],
    ["0", 0],
    ["10", 10],
  ])("reads %j as %d", (text, expected) => {
    expect(parseCoordinate(text)).toBe(expected);
  });

  it.each(["", "  ", "abc", "1,2,3", "--1", "12.", ".5", "1e3", "-23,5343,", "- 23"])(
    "rejects %j",
    (text) => {
      expect(parseCoordinate(text)).toBeNull();
    },
  );
});

describe("extractCoordinatePair", () => {
  it.each([
    ["-23.5343, -46.8368", ["-23.5343", "-46.8368"]],
    ["-23,5343, -46,8368", ["-23,5343", "-46,8368"]],
    ["-23,5343; -46,8368", ["-23,5343", "-46,8368"]],
    ["-23.5343 -46.8368", ["-23.5343", "-46.8368"]],
    ["−23,5343, −46,8368", ["-23,5343", "-46,8368"]],
    ["(-23.5343, -46.8368)", ["-23.5343", "-46.8368"]],
    ["-23.5343,-46.8368", ["-23.5343", "-46.8368"]],
  ])("splits %j", (text, expected) => {
    expect(extractCoordinatePair(text)).toEqual(expected);
  });

  it.each([
    "",
    "-23,5343",
    "-23.5343",
    "1, 2, 3",
    "sem números",
    "10\u201320",
    "10-20",
    "5 - 7",
    "06/10/2026",
    "Lat: -23.5343 Lon: -46.8368",
  ])(
    "leaves %j alone",
    (text) => {
      expect(extractCoordinatePair(text)).toBeNull();
    },
  );
});

describe("form rules", () => {
  it("accepts a position inside Brazil", () => {
    expect(coordinateError("-23,5343", "latitude")).toBeNull();
    expect(coordinateError("-46,8368", "longitude")).toBeNull();
  });

  it.each([
    ["", "latitude", "obrigatória"],
    ["abc", "latitude", "número"],
    ["48,85", "latitude", "entre -34 e 6"],
    ["-46,84", "latitude", "entre -34 e 6"],
    ["2,35", "longitude", "entre -75 e -28"],
    ["-23,53", "longitude", "entre -75 e -28"],
  ] as const)("explains %j as a %s", (text, kind, message) => {
    expect(coordinateError(text, kind)).toContain(message);
  });

  it("requires a method of up to 500 characters", () => {
    expect(methodError("")).not.toBeNull();
    expect(methodError("   ")).not.toBeNull();
    expect(methodError("Conferido no mapa oficial")).toBeNull();
    expect(methodError("x".repeat(500))).toBeNull();
    expect(methodError("x".repeat(501))).not.toBeNull();
  });

  it("accepts a multi-line method, which the text area allows", () => {
    expect(methodError("Primeira linha\nSegunda linha")).toBeNull();
    expect(methodError("a\r\nb")).toBeNull();
    expect(methodError("a\tb")).toBeNull();
  });

  it("refuses control characters other than line breaks and tabs", () => {
    expect(methodError("a\u0007b")).toContain("caracteres especiais");
    expect(methodError("a\u0000b")).not.toBeNull();
    expect(methodError("a\u007fb")).not.toBeNull();
  });

  it.each([
    ["5563704", "5563704"],
    ["113360", "0113360"],
    [" 0113360 ", "0113360"],
  ])("reads the CNES code %j as %s", (text, expected) => {
    expect(normalizeCnesCode(text)).toBe(expected);
  });

  it.each(["", "abc", "12345678", "-1", "1.5"])("does not read %j as a CNES code", (text) => {
    expect(normalizeCnesCode(text)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats a coordinate the Brazilian way", () => {
    expect(formatCoordinate({ latitude: -23.5343, longitude: -46.8368 })).toBe(
      "-23,5343, -46,8368",
    );
  });

  it("shows the time in the Brasília calendar day", () => {
    // 01:30 UTC is still the evening of the 7th in Brasília.
    expect(formatDateTime("2026-10-08T01:30:00Z")).toMatch(/07\/10\/2026.*22:30/);
  });

  it("keeps a value it cannot read", () => {
    expect(formatDateTime("not a date")).toBe("not a date");
  });

  it.each([
    ["set", "Definida"],
    ["replace", "Substituída"],
    ["remove", "Removida"],
  ] as const)("labels %s as %s", (action, label) => {
    expect(actionLabel(action)).toBe(label);
  });
});

describe("response shapes", () => {
  const correction = {
    cnesCode: "5563704",
    latitude: -23.5,
    longitude: -46.8,
    verifiedBy: "maria",
    method: "Conferido",
    correctedAt: "2026-10-07T15:00:00.000Z",
  };
  const event = {
    id: 1,
    action: "set",
    actor: "maria",
    occurredAt: "2026-10-07T15:00:00.000Z",
    method: "Conferido",
    previous: null,
    next: { latitude: -23.5, longitude: -46.8 },
  };

  it("accepts what the API sends", () => {
    expect(isCorrection(correction)).toBe(true);
    expect(isCorrection({ ...correction, anchor: { municipalityCode: "351060" } })).toBe(true);
    expect(isCorrectionEvent(event)).toBe(true);
  });

  it.each([
    ["a string latitude", { ...correction, latitude: "-23.5" }],
    ["no verifier", { ...correction, verifiedBy: undefined }],
    ["null", null],
    ["an array", []],
  ])("rejects a correction with %s", (_label, value) => {
    expect(isCorrection(value)).toBe(false);
  });

  it.each([
    ["an unknown action", { ...event, action: "explode" }],
    ["a malformed position", { ...event, next: { latitude: 1 } }],
    ["a missing method", { ...event, method: undefined }],
  ])("rejects an event with %s", (_label, value) => {
    expect(isCorrectionEvent(value)).toBe(false);
  });
});

describe("admin API calls", () => {
  it("sends the token in the header and never in the URL", async () => {
    const fetch = respondWith([]);

    await listCorrections(TOKEN);

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("/api/admin/location-corrections");
    expect(String(url)).not.toContain(TOKEN);
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(init!.cache).toBe("no-store");
  });

  it("saves a correction with a JSON body that carries no token", async () => {
    const fetch = respondWith({ correction: {}, boundaryChecked: true });

    await saveCorrection(TOKEN, "5563704", {
      latitude: -23.5,
      longitude: -46.8,
      method: "Conferido",
    });

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("/api/admin/location-corrections/5563704");
    expect(init!.method).toBe("PUT");
    expect(JSON.parse(String(init!.body))).toEqual({
      latitude: -23.5,
      longitude: -46.8,
      method: "Conferido",
    });
    expect(String(init!.body)).not.toContain(TOKEN);
  });

  it("removes a correction", async () => {
    const fetch = respondWith(null, 204);

    await removeCorrection(TOKEN, "5563704");

    expect(fetch.mock.calls[0]![1]!.method).toBe("DELETE");
  });

  it("reads the events of a unit", async () => {
    const fetch = respondWith([]);

    await expect(listCorrectionEvents(TOKEN, "0113360")).resolves.toEqual([]);
    expect(String(fetch.mock.calls[0]![0])).toBe(
      "/api/admin/location-corrections/0113360/events",
    );
  });

  it.each([
    [400, "invalid"],
    [401, "unauthorized"],
    [404, "notFound"],
    [422, "outsideMunicipality"],
    [429, "tooManyAttempts"],
    [503, "unavailable"],
    [500, "unexpected"],
    [502, "unexpected"],
  ] as const)("maps HTTP %d to %s", async (status, kind) => {
    respondWith({ message: "Internal detail" }, status);

    expect(await kindOf(listCorrections(TOKEN))).toBe(kind);
  });

  it("tells an administration that was switched off from a unit that does not exist", async () => {
    const save = () =>
      saveCorrection(TOKEN, "5563704", {
        latitude: -23.5,
        longitude: -46.8,
        method: "x",
      });

    respondWith({ statusCode: 404, error: "AdminDisabled" }, 404);
    expect(await kindOf(save())).toBe("disabled");

    respondWith({ statusCode: 404, message: "Unit not found" }, 404);
    expect(await kindOf(save())).toBe("notFound");
  });

  it("reports a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await kindOf(listCorrections(TOKEN))).toBe("network");
  });

  it("rejects a list that is not shaped as expected", async () => {
    respondWith([{ cnesCode: 5563704 }]);

    expect(await kindOf(listCorrections(TOKEN))).toBe("unexpected");
  });

  it("never lets the message of the server through", async () => {
    respondWith({ message: "connect ECONNREFUSED 10.0.0.1:5432" }, 500);

    const error = await listCorrections(TOKEN).catch((e: unknown) => e);

    expect(String((error as Error).message)).not.toContain("ECONNREFUSED");
  });

  describe("fetchAdminLogin", () => {
    it("returns the login of the token", async () => {
      respondWith({ login: "maria" });

      await expect(fetchAdminLogin(TOKEN)).resolves.toBe("maria");
    });

    it("says the administration is off when the route does not exist", async () => {
      respondWith({}, 404);

      expect(await kindOf(fetchAdminLogin(TOKEN))).toBe("disabled");
    });

    it("rejects an invalid token", async () => {
      respondWith({}, 401);

      expect(await kindOf(fetchAdminLogin(TOKEN))).toBe("unauthorized");
    });

    it("rejects an answer without a login", async () => {
      respondWith({ nope: true });

      expect(await kindOf(fetchAdminLogin(TOKEN))).toBe("unexpected");
    });
  });
});

describe("adminErrorMessage", () => {
  const kinds: AdminErrorKind[] = [
    "disabled",
    "unauthorized",
    "invalid",
    "notFound",
    "outsideMunicipality",
    "tooManyAttempts",
    "unavailable",
    "network",
    "unexpected",
  ];

  it.each(kinds)("has a message for %s", (kind) => {
    expect(adminErrorMessage(kind).length).toBeGreaterThan(10);
  });

  it("says a refused token at sign-in was wrong, even when the server is busy", () => {
    expect(adminErrorMessage("tooManyAttempts", "signIn")).toContain("Token inválido");
    expect(adminErrorMessage("tooManyAttempts", "read")).toContain("Aguarde");
  });

  it("tells a rejected token at sign-in from an expired session", () => {
    expect(adminErrorMessage("unauthorized", "signIn")).toContain("Token inválido");
    expect(adminErrorMessage("unauthorized", "read")).toContain("Entre novamente");
  });

  it("says what a missing unit means for each action", () => {
    expect(adminErrorMessage("notFound", "save")).toContain("não encontrada");
    expect(adminErrorMessage("notFound", "remove")).toContain("não tem posição corrigida");
  });
});

describe("formatCoordinateInput", () => {
  it("formats a clicked point the way the fields take it", () => {
    expect(formatCoordinateInput(-23.534299999)).toBe("-23,534300");
    expect(formatCoordinateInput(-46.8368)).toBe("-46,836800");
  });

  it("reads back as the same coordinate", () => {
    expect(parseCoordinate(formatCoordinateInput(-23.5343))).toBe(-23.5343);
  });
});
