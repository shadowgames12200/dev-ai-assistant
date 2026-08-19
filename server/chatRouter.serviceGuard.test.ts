import { describe, expect, it } from "vitest";
import { getProfessionalServiceGate } from "./chatRouter";

describe("guardas de escopo para serviços profissionais", () => {
  it("pede a fonte e o formato antes de prometer uma transcrição", () => {
    const gate = getProfessionalServiceGate("Transcreva essa reunião e deixe pronto para enviar ao cliente.");
    expect(gate?.service).toBe("transcrição");
    expect(gate?.missing).toEqual(expect.arrayContaining([
      "arquivo de áudio/vídeo ou conteúdo a transcrever",
      "formato de entrega desejado (por exemplo, .docx, .txt ou .srt)",
    ]));
  });

  it("pede escopo de uma redação antes da versão final", () => {
    const gate = getProfessionalServiceGate("Crie um artigo profissional pronto para enviar.");
    expect(gate?.service).toBe("redação");
    expect(gate?.missing).toEqual(expect.arrayContaining(["público-alvo", "objetivo do texto", "extensão desejada"]));
  });

  it("pede entrada e saída antes de uma automação", () => {
    const gate = getProfessionalServiceGate("Faça uma automação pronta para o cliente.");
    expect(gate?.service).toBe("automação");
    expect(gate?.missing).toEqual(expect.arrayContaining(["origem dos dados ou sistema de entrada", "resultado esperado e destino da saída"]));
  });

  it("não bloqueia transcrição quando fonte, formato e preferências foram confirmados", () => {
    const gate = getProfessionalServiceGate(
      "Transcreva o áudio anexado em .docx, com falantes, timestamps e versão limpa.",
      1
    );
    expect(gate).toBeNull();
  });

  it("não bloqueia redação com briefing completo", () => {
    const gate = getProfessionalServiceGate(
      "Crie um artigo de 800 palavras sobre educação financeira para jovens adultos, com objetivo de informar e tom didático."
    );
    expect(gate).toBeNull();
  });

  it("não bloqueia automação com tarefa, origem e saída confirmadas", () => {
    const gate = getProfessionalServiceGate(
      "Crie um script para ler uma planilha CSV e gerar um relatório PDF salvo na pasta de saída."
    );
    expect(gate).toBeNull();
  });
});
