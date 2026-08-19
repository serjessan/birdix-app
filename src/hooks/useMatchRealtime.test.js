import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribeToMatchHoles } from "./useMatchRealtime";

/**
 * Fake mínimo del cliente de Supabase Realtime: `.channel(name).on(...).subscribe(cb)`.
 * Cada llamada a `.channel()` crea un canal nuevo (como el real, tras un
 * `removeChannel` de reconexión) y `current()` siempre apunta al más reciente,
 * para poder disparar sus callbacks (`triggerChange`/`setStatus`) desde el test.
 */
const createFakeClient = () => {
  const channels = [];
  const removeChannel = vi.fn();
  const client = {
    channel: (name) => {
      const ch = { name, onCb: null, statusCb: null };
      ch.on = (event, config, cb) => {
        ch.event = event;
        ch.config = config;
        ch.onCb = cb;
        return ch;
      };
      ch.subscribe = (cb) => {
        ch.statusCb = cb;
        return ch;
      };
      channels.push(ch);
      return ch;
    },
    removeChannel,
  };
  return {
    client,
    removeChannel,
    channels,
    current: () => channels[channels.length - 1],
  };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("subscribeToMatchHoles", () => {
  it("se suscribe a match_holes filtrado por match_id", () => {
    const { client, current } = createFakeClient();
    subscribeToMatchHoles({ matchId: "m1", onChange: vi.fn(), client });

    expect(current().name).toBe("match_holes:m1");
    expect(current().event).toBe("postgres_changes");
    expect(current().config).toEqual({
      event: "UPDATE",
      schema: "public",
      table: "match_holes",
      filter: "match_id=eq.m1",
    });
  });

  it("recibe UPDATE de match_holes y llama a onChange con el payload", () => {
    const { client, current } = createFakeClient();
    const onChange = vi.fn();
    subscribeToMatchHoles({ matchId: "m1", onChange, client });

    const payload = { new: { hole_number: 3, player_a_card: "double" }, old: {} };
    current().onCb(payload);

    expect(onChange).toHaveBeenCalledWith(payload);
  });

  it("anuncia 'connected' solo cuando el canal confirma SUBSCRIBED", () => {
    const { client, current } = createFakeClient();
    const onStatusChange = vi.fn();
    subscribeToMatchHoles({ matchId: "m1", onChange: vi.fn(), onStatusChange, client });

    expect(onStatusChange).not.toHaveBeenCalled();
    current().statusCb("SUBSCRIBED");
    expect(onStatusChange).toHaveBeenCalledWith("connected");
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "reconexión: %s anuncia 'reconectando' y crea un canal nuevo tras el delay",
    (badStatus) => {
      const { client, current, removeChannel, channels } = createFakeClient();
      const onStatusChange = vi.fn();
      subscribeToMatchHoles({ matchId: "m1", onChange: vi.fn(), onStatusChange, client, reconnectDelayMs: 2000 });

      const firstChannel = current();
      firstChannel.statusCb(badStatus);
      expect(onStatusChange).toHaveBeenCalledWith("reconnecting");
      expect(removeChannel).toHaveBeenCalledWith(firstChannel);

      // no reconecta antes de tiempo
      vi.advanceTimersByTime(1000);
      expect(channels.length).toBe(1);

      vi.advanceTimersByTime(1000);
      expect(channels.length).toBe(2);
      expect(current()).not.toBe(firstChannel);

      // el canal nuevo confirmando SUBSCRIBED vuelve a anunciar 'connected'
      current().statusCb("SUBSCRIBED");
      expect(onStatusChange).toHaveBeenCalledWith("connected");
    }
  );

  it("una vez reconectado, los UPDATE siguen llegando por el canal nuevo", () => {
    const { client, current } = createFakeClient();
    const onChange = vi.fn();
    subscribeToMatchHoles({ matchId: "m1", onChange, client, reconnectDelayMs: 500 });

    current().statusCb("CHANNEL_ERROR");
    vi.advanceTimersByTime(500);

    const payload = { new: { hole_number: 5 } };
    current().onCb(payload);
    expect(onChange).toHaveBeenCalledWith(payload);
  });

  it("desuscribe al desmontar: quita el canal y no reconecta más", () => {
    const { client, current, removeChannel } = createFakeClient();
    const onStatusChange = vi.fn();
    const unsubscribe = subscribeToMatchHoles({ matchId: "m1", onChange: vi.fn(), onStatusChange, client });

    const channel = current();
    unsubscribe();
    expect(removeChannel).toHaveBeenCalledWith(channel);

    // un evento tardío del canal ya desmontado no debe hacer nada
    onStatusChange.mockClear();
    channel.statusCb("CHANNEL_ERROR");
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("desuscribir mientras hay una reconexión pendiente cancela el reintento (no acumula listeners)", () => {
    const { client, current, channels } = createFakeClient();
    const unsubscribe = subscribeToMatchHoles({ matchId: "m1", onChange: vi.fn(), client, reconnectDelayMs: 2000 });

    current().statusCb("CHANNEL_ERROR");
    unsubscribe();

    vi.advanceTimersByTime(5000);
    expect(channels.length).toBe(1); // nunca llegó a crear el segundo canal
  });

  it("un doble desmontaje no revienta (removeChannel solo se llama una vez con el canal real)", () => {
    const { client, removeChannel } = createFakeClient();
    const unsubscribe = subscribeToMatchHoles({ matchId: "m1", onChange: vi.fn(), client });

    unsubscribe();
    unsubscribe();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
