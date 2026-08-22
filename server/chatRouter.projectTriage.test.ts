import { describe, expect, it } from "vitest";
import {
  buildFreelancerProjectTriageRequest,
  getFreelancerProjectTriage,
} from "./systemPrompt";

describe("triagem determinística de projetos freelancer", () => {
  it("bloqueia uma redação tecnicamente completa que não informa prazo e aceite", () => {
    const triage = getFreelancerProjectTriage(
      "Crie um artigo de 800 palavras sobre educação financeira para jovens adultos, com objetivo de informar, em .docx."
    );

    expect(triage?.service).toBe("redação");
    expect(triage?.missing).toEqual(
      expect.arrayContaining([
        "prazo ou data de entrega",
        "critério de aceite ou forma de conferência do cliente",
      ])
    );
  });

  it("bloqueia uma planilha sem dados de entrada e regras de cálculo", () => {
    const triage = getFreelancerProjectTriage(
      "Crie uma planilha de controle financeiro em Excel e entregue para o cliente até amanhã."
    );

    expect(triage?.service).toBe("planilha");
    expect(triage?.missing).toEqual(
      expect.arrayContaining([
        "dados de entrada, colunas ou exemplo real",
        "regras de cálculo e conferência",
        "critério de aceite ou forma de conferência do cliente",
      ])
    );
  });

  it("libera um briefing de redação com escopo, prazo, formato e aceite confirmados", () => {
    const triage = getFreelancerProjectTriage(
      "Crie um artigo de 800 palavras sobre educação financeira para jovens adultos, com objetivo de informar. Entregue o artigo em .docx até amanhã; o cliente aprova após conferir tema, extensão, ortografia e chamada para ação."
    );

    expect(triage).toBeNull();
  });

  it("não interfere em uma pergunta geral que não pede execução profissional", () => {
    expect(getFreelancerProjectTriage("Como posso montar uma planilha de gastos?"))
      .toBeNull();
  });

  it("bloqueia automação que pretende publicar externamente sem confirmação e teste", () => {
    const triage = getFreelancerProjectTriage(
      "Crie uma automação para ler uma planilha CSV, gerar relatório PDF e publicar o resultado em produção até amanhã. O cliente aprova após conferir o arquivo."
    );

    expect(triage?.risks).toEqual(
      expect.arrayContaining([
        "a automação prevê ação externa ou difícil de reverter; exija confirmação explícita por escrito e valide primeiro em ambiente de teste",
      ])
    );
  });

  it("sinaliza revisão contratual para validação jurídica, mesmo com briefing completo", () => {
    const triage = getFreelancerProjectTriage(
      "Revise o contrato anexado, entregue as sugestões em .docx até amanhã e considere aceito após conferência do cliente."
    );

    expect(triage?.risks).toEqual(
      expect.arrayContaining([
        "o pedido tem impacto jurídico; limite a organização textual e exija validação de profissional habilitado antes de qualquer uso oficial",
      ])
    );
  });

  it("bloqueia processamento de dados sensíveis até haver autorização e canal seguro", () => {
    const triage = getFreelancerProjectTriage(
      "Revise a proposta anexada que contém CPF e token de API, entregue em .docx até amanhã e considere aceito após conferência do cliente."
    );

    expect(triage?.risks).toEqual(
      expect.arrayContaining([
        "há dados sensíveis; confirme autorização, minimização dos dados e canal seguro antes de processar",
      ])
    );
  });

  it("bloqueia uma senha enviada em um pedido de revisão", () => {
    const triage = getFreelancerProjectTriage(
      "Revise o manual que contém a senha do sistema, entregue em .docx até amanhã e considere aceito após conferência do cliente."
    );

    expect(triage?.risks).toContain(
      "há dados sensíveis; confirme autorização, minimização dos dados e canal seguro antes de processar"
    );
  });

  it("bloqueia chave SSH enviada em um pedido de automação", () => {
    const triage = getFreelancerProjectTriage(
      "Crie um script para ler um CSV e gerar um relatório PDF em .pdf até amanhã; a chave SSH está no anexo e o cliente aprova após conferência."
    );

    expect(triage?.risks).toContain(
      "há dados sensíveis; confirme autorização, minimização dos dados e canal seguro antes de processar"
    );
  });

  it("bloqueia planilha contábil até haver conferência humana qualificada", () => {
    const triage = getFreelancerProjectTriage(
      "Crie uma planilha contábil em Excel a partir do CSV anexado, calcule os totais e entregue até amanhã. O cliente aprova após conferência."
    );

    expect(triage?.risks).toEqual(
      expect.arrayContaining([
        "o pedido envolve dados ou decisão financeira; exija conferência humana qualificada e não faça movimentações, declarações ou recomendações personalizadas",
      ])
    );
  });

  it("produz uma resposta bloqueada que deixa claro que não pode haver entrega", () => {
    const response = buildFreelancerProjectTriageRequest({
      service: "redação",
      missing: ["prazo ou data de entrega"],
      risks: [],
    });

    expect(response).toContain("EXECUÇÃO BLOQUEADA");
    expect(response).toContain("NÃO INICIE NEM ENVIE AO CLIENTE AINDA");
  });
});
