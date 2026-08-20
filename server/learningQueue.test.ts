import { describe, expect, it } from "vitest";
import { detectSafeLearningCategory } from "./db";

describe("fila segura de oportunidades de autoaprendizagem", () => {
  it("classifica um tema técnico em categoria genérica, sem depender do texto original", () => {
    expect(detectSafeLearningCategory("Meu projeto TypeScript apresentou um erro de API.")).toBe("programação");
    expect(detectSafeLearningCategory("A tela de cadastro precisa de um botão melhor.")).toBe("experiência do usuário");
  });

  it("não cria oportunidade a partir de mensagem contendo segredo ou credencial", () => {
    expect(detectSafeLearningCategory("Minha senha é segredo e preciso melhorar o login.")).toBeNull();
    expect(detectSafeLearningCategory("Use meu token de API para automatizar o projeto.")).toBeNull();
  });

  it("não registra temas que não pertencem às categorias permitidas", () => {
    expect(detectSafeLearningCategory("Olá, como está o clima hoje?")).toBeNull();
  });
});
