import { describe, expect, it } from "vitest";
import {
  consumeStreamContentChunk,
  stripThinkingContent,
  type StreamContentState,
} from "./systemPrompt";

const initialState = (): StreamContentState => ({
  accumulatedContent: "",
  mode: "unknown",
});

describe("consumeStreamContentChunk", () => {
  it("preserva streams que já enviam deltas", () => {
    let state = initialState();
    const first = consumeStreamContentChunk(state, "Olá");
    state = first.state;
    const second = consumeStreamContentChunk(state, ", mundo");
    state = second.state;
    const third = consumeStreamContentChunk(state, "!");

    expect([first.delta, second.delta, third.delta].join("")).toBe("Olá, mundo!");
    expect(third.state).toEqual({
      accumulatedContent: "Olá, mundo!",
      mode: "delta",
    });
  });

  it("remove a repetição quando o provedor envia snapshots cumulativos", () => {
    let state = initialState();
    const first = consumeStreamContentChunk(state, "Olá");
    state = first.state;
    const second = consumeStreamContentChunk(state, "Olá, mundo");
    state = second.state;
    const third = consumeStreamContentChunk(state, "Olá, mundo!");

    expect([first.delta, second.delta, third.delta].join("")).toBe("Olá, mundo!");
    expect(third.state).toEqual({
      accumulatedContent: "Olá, mundo!",
      mode: "cumulative",
    });
  });

  it("ignora snapshots antigos repetidos após detectar o modo cumulativo", () => {
    let state = initialState();
    state = consumeStreamContentChunk(state, "Parte inicial").state;
    state = consumeStreamContentChunk(state, "Parte inicial e final").state;
    const repeated = consumeStreamContentChunk(state, "Parte inicial");

    expect(repeated.delta).toBe("");
    expect(repeated.state.accumulatedContent).toBe("Parte inicial e final");
    expect(repeated.state.mode).toBe("cumulative");
  });

  it("detecta snapshots cumulativos mesmo se o provedor adiciona markdown", () => {
    let state = initialState();
    state = consumeStreamContentChunk(state, "Aqui está o ").state;
    const next = consumeStreamContentChunk(
      state,
      "**Aqui está o currículo** profissional"
    );

    expect(next.state.mode).toBe("cumulative");
    expect(next.state.accumulatedContent).toBe(
      "**Aqui está o currículo** profissional"
    );
  });

  it("remove blocos internos de raciocínio antes da entrega", () => {
    expect(stripThinkingContent("Resposta <thinking>rascunho interno</thinking> final")).toBe(
      "Resposta  final"
    );
  });
});
