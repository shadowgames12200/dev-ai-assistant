/**
 * Guardrail de Honestidade v1
 * Intercepta o contexto para detectar se a IA precisa de mais informações.
 */
export type GuardrailResult = {
  isSufficient: boolean;
  missingInfo?: string;
};

export function checkContextSufficiency(content: string, history: any[]): GuardrailResult {
  const contentLower = content.toLowerCase();
  
  // Padrões que indicam falta de informação em contextos específicos
  const freelancerKeywords = ["freela", "99freelas", "workana", "projeto", "proposta"];
  const transcriptionKeywords = ["transcrever", "áudio", "vídeo", "arquivo"];
  
  const isFreelancerContext = freelancerKeywords.some(k => contentLower.includes(k));
  const isTranscriptionContext = transcriptionKeywords.some(k => contentLower.includes(k));

  if (isFreelancerContext) {
    const hasProjectLink = contentLower.includes("http") || contentLower.includes("www");
    const hasDescription = content.length > 50;
    
    if (!hasProjectLink && !hasDescription) {
      return {
        isSufficient: false,
        missingInfo: "Para ajudar com o projeto no 99Freelas/Workana, eu preciso do link do projeto ou de uma descrição detalhada do que o cliente está pedindo."
      };
    }
  }

  if (isTranscriptionContext) {
    const hasFileMention = contentLower.includes("anexo") || contentLower.includes("arquivo") || contentLower.includes("link");
    
    if (!hasFileMention) {
      return {
        isSufficient: false,
        missingInfo: "Para realizar a transcrição, eu preciso que você anexe o arquivo de áudio/vídeo ou forneça o link para download."
      };
    }
  }

  return { isSufficient: true };
}
