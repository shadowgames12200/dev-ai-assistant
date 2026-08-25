import { describe, expect, it } from "vitest";
import { readLLMStreamContent } from "./llm";

describe("readLLMStreamContent", () => {
  it("lê uma resposta JSON não streaming", async () => {
    const response = new Response(
      JSON.stringify({
        choices: [{ message: { content: "Resposta JSON" } }],
      }),
    );

    await expect(readLLMStreamContent(response)).resolves.toBe("Resposta JSON");
  });

  it("lê deltas de uma resposta SSE", async () => {
    const response = new Response(
      [
        'data: {"choices":[{"delta":{"content":"Olá"}}]}',
        'data: {"choices":[{"delta":{"content":", mundo"}}]}',
        "data: [DONE]",
        "",
      ].join("\n"),
    );

    await expect(readLLMStreamContent(response)).resolves.toBe("Olá, mundo");
  });

  it("remove repetição de snapshots cumulativos", async () => {
    const response = new Response(
      [
        'data: {"choices":[{"message":{"content":"Olá"}}]}',
        'data: {"choices":[{"message":{"content":"Olá, mundo"}}]}',
        'data: {"choices":[{"message":{"content":"Olá, mundo!"}}]}',
        "data: [DONE]",
        "",
      ].join("\n"),
    );

    await expect(readLLMStreamContent(response)).resolves.toBe("Olá, mundo!");
  });
});
