import { describe, expect, it } from "vitest";
import { buildResumeDataRequest, getMissingResumeData } from "./systemPrompt";

describe("barreira de currículo incompleto", () => {
  it("bloqueia uma versão final quando empresa, datas e escola não foram informadas", () => {
    const missing = getMissingResumeData(
      "Faça um currículo pronto para enviar. Meu nome é João da Silva, e-mail joao@email.com, telefone (11) 99999-0000. Trabalhei dois anos como vendedor em uma loja de materiais. Tenho ensino médio completo e informática básica. Quero vaga de auxiliar administrativo."
    );

    expect(missing).toEqual(
      expect.arrayContaining([
        "nome real da empresa onde trabalhou",
        "mês/ano de início e término da experiência",
        "nome da escola ou instituição de formação",
      ])
    );
    expect(buildResumeDataRequest(missing ?? [])).toContain("RASCUNHO BLOQUEADO — NÃO ENVIAR");
  });

  it("não interfere em pedidos que não são de criação de currículo", () => {
    expect(getMissingResumeData("Explique como fazer uma boa entrevista de emprego.")).toBeNull();
  });
});
