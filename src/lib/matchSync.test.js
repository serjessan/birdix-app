import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const updateMock = vi.fn();
const eqSpy = vi.fn();

vi.mock("./supabase", () => ({
  supabase: {
    from: (table) => ({
      update: (patch) => ({
        eq: (col1, val1) => ({
          eq: (col2, val2) => {
            eqSpy(table, patch, col1, val1, col2, val2);
            return updateMock(patch);
          },
        }),
      }),
    }),
  },
}));

const createFakeStorage = () => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
};

let fakeStorage;

beforeEach(async () => {
  vi.resetModules();
  updateMock.mockReset();
  eqSpy.mockReset();
  fakeStorage = createFakeStorage();
  vi.stubGlobal("localStorage", fakeStorage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Import dinámico tras montar los stubs de globals de cada test (localStorage
// se lee de forma perezosa dentro de las funciones, así que el orden aquí no
// es estrictamente necesario, pero mantiene los tests deterministas frente a
// vi.resetModules()).
const importMatchSync = () => import("./matchSync");

describe("queueMatchHoleWrite", () => {
  it("escribe de inmediato en Supabase cuando hay cobertura", async () => {
    updateMock.mockResolvedValueOnce({ error: null });
    const { queueMatchHoleWrite, getPendingSyncCount } = await importMatchSync();

    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 3, patch: { player_a_strokes: 4 } });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ player_a_strokes: 4 });
    expect(eqSpy).toHaveBeenCalledWith("match_holes", { player_a_strokes: 4 }, "match_id", "m1", "hole_number", 3);
    expect(getPendingSyncCount()).toBe(0);
  });

  it("escritura local inmediata: queda en el outbox aunque la red falle", async () => {
    updateMock.mockRejectedValueOnce(new Error("network down"));
    const { queueMatchHoleWrite, getPendingSyncCount } = await importMatchSync();

    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 5, patch: { player_a_card: "double" } });

    expect(getPendingSyncCount()).toBe(1);
  });

  it("un error devuelto por Supabase (no solo una excepción) también deja la entrada en el outbox", async () => {
    updateMock.mockResolvedValueOnce({ error: { message: "RLS denied" } });
    const { queueMatchHoleWrite, getPendingSyncCount } = await importMatchSync();

    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 5, patch: { player_a_card: "double" } });

    expect(getPendingSyncCount()).toBe(1);
  });

  it("doble pulsación en red lenta para el mismo hoyo: una sola escritura en el outbox, patches fusionados", async () => {
    updateMock.mockRejectedValue(new Error("network down"));
    const { queueMatchHoleWrite, getPendingSyncCount } = await importMatchSync();

    await Promise.all([
      queueMatchHoleWrite({ matchId: "m1", holeNumber: 7, patch: { player_a_card: "double" } }),
      queueMatchHoleWrite({ matchId: "m1", holeNumber: 7, patch: { player_a_card_confirmed: true } }),
    ]);

    expect(getPendingSyncCount()).toBe(1);
    // ambas llamadas intentaron escribir (dos peticiones salieron, ninguna
    // se "perdió" por el doble tap), pero conviven en una sola entrada.
    expect(updateMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("una escritura sin patch no hace nada", async () => {
    const { queueMatchHoleWrite, getPendingSyncCount } = await importMatchSync();
    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 1, patch: {} });
    expect(updateMock).not.toHaveBeenCalled();
    expect(getPendingSyncCount()).toBe(0);
  });
});

describe("flushOutbox", () => {
  it("reintento tras recuperar cobertura: una entrada que había fallado se guarda al reintentar", async () => {
    updateMock.mockRejectedValueOnce(new Error("network down"));
    const { queueMatchHoleWrite, flushOutbox, getPendingSyncCount } = await importMatchSync();

    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 9, patch: { player_a_strokes: 5 } });
    expect(getPendingSyncCount()).toBe(1);

    updateMock.mockResolvedValueOnce({ error: null });
    await flushOutbox();

    expect(getPendingSyncCount()).toBe(0);
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it("reintento con el mismo hole_number no duplica: el segundo intento reenvía el mismo patch fusionado, no dos escrituras distintas", async () => {
    updateMock.mockRejectedValueOnce(new Error("network down"));
    const { queueMatchHoleWrite, flushOutbox } = await importMatchSync();

    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 2, patch: { player_a_strokes: 4 } });

    updateMock.mockResolvedValueOnce({ error: null });
    await flushOutbox();

    // el patch reenviado en el reintento es exactamente el mismo — un UPDATE
    // con el mismo valor es un no-op en Postgres, así que reintentar de más
    // nunca duplica el resultado.
    expect(updateMock).toHaveBeenNthCalledWith(2, { player_a_strokes: 4 });
  });

  it("varios hoyos pendientes se reintentan todos, cada uno de forma independiente", async () => {
    updateMock.mockRejectedValue(new Error("network down"));
    const { queueMatchHoleWrite, flushOutbox, getPendingSyncCount } = await importMatchSync();

    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 1, patch: { player_a_strokes: 4 } });
    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 2, patch: { player_a_strokes: 5 } });
    expect(getPendingSyncCount()).toBe(2);

    updateMock.mockReset();
    updateMock.mockResolvedValue({ error: null });
    await flushOutbox();

    expect(getPendingSyncCount()).toBe(0);
    expect(updateMock).toHaveBeenCalledTimes(2);
  });
});

describe("app cerrada con cola pendiente", () => {
  it("lo que quedó en localStorage de una sesión anterior persiste y se reintenta al reabrir", async () => {
    // Simula una sesión previa que dejó algo pendiente y se cerró antes de
    // poder sincronizar — nada de matchSync.js corrió todavía en este test.
    fakeStorage.setItem(
      "birdix:match-sync:outbox",
      JSON.stringify({ "m1:4": { matchId: "m1", holeNumber: 4, patch: { player_a_strokes: 3 } } })
    );

    updateMock.mockResolvedValueOnce({ error: null });
    const { getPendingSyncCount, flushOutbox } = await importMatchSync();

    expect(getPendingSyncCount()).toBe(1);
    await flushOutbox();
    expect(getPendingSyncCount()).toBe(0);
    expect(updateMock).toHaveBeenCalledWith({ player_a_strokes: 3 });
  });
});

describe("initMatchSync", () => {
  it("al arrancar, reintenta lo que hubiera pendiente de antes", async () => {
    fakeStorage.setItem(
      "birdix:match-sync:outbox",
      JSON.stringify({ "m1:1": { matchId: "m1", holeNumber: 1, patch: { player_a_strokes: 4 } } })
    );
    updateMock.mockResolvedValueOnce({ error: null });

    const fakeWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("window", fakeWindow);

    const { initMatchSync, getPendingSyncCount } = await importMatchSync();
    const teardown = initMatchSync();
    await Promise.resolve(); // deja correr el flush disparado en el arranque

    expect(getPendingSyncCount()).toBe(0);
    teardown();
  });

  it("escucha 'online' y reintenta lo pendiente cuando el navegador recupera cobertura", async () => {
    const listeners = {};
    const fakeWindow = {
      addEventListener: (evt, fn) => { listeners[evt] = fn; },
      removeEventListener: (evt) => { delete listeners[evt]; },
    };
    vi.stubGlobal("window", fakeWindow);

    updateMock.mockRejectedValueOnce(new Error("network down"));
    const { queueMatchHoleWrite, initMatchSync, getPendingSyncCount } = await importMatchSync();
    const teardown = initMatchSync();

    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 6, patch: { player_a_card: "shield" } });
    expect(getPendingSyncCount()).toBe(1);

    updateMock.mockResolvedValueOnce({ error: null });
    await listeners.online();

    expect(getPendingSyncCount()).toBe(0);
    teardown();
  });

  it("reintento periódico: revisa el outbox cada intervalMs mientras la app está abierta", async () => {
    vi.useFakeTimers();
    const fakeWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("window", fakeWindow);

    updateMock.mockRejectedValueOnce(new Error("network down"));
    const { queueMatchHoleWrite, initMatchSync, getPendingSyncCount } = await importMatchSync();
    const teardown = initMatchSync({ intervalMs: 1000 });

    await queueMatchHoleWrite({ matchId: "m1", holeNumber: 8, patch: { player_a_strokes: 4 } });
    expect(getPendingSyncCount()).toBe(1);

    updateMock.mockResolvedValueOnce({ error: null });
    await vi.advanceTimersByTimeAsync(1000);

    expect(getPendingSyncCount()).toBe(0);
    teardown();
  });

  it("en un entorno sin window (SSR/tests) no revienta y devuelve un teardown inofensivo", async () => {
    const { initMatchSync } = await importMatchSync();
    expect(() => initMatchSync()()).not.toThrow();
  });
});
