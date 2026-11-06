// =====================================================================
// FICHA DA CASA · Padaria Bossa Bakery
// Este arquivo é o lugar para mudar funções, horários e cobertura mínima.
// Horários no formato "HH:MM". Dias da semana: 0 = domingo, 1 = segunda ... 6 = sábado.
// Folgas por semana, "fecha e abre" e domingos de folga ficam na tela "Regras da casa".
// =====================================================================

export const restaurante = {
  nome: "Bossa Bakery",
};

/** Funções da equipe (aparecem na tela Equipe). */
export const funcoes = [
  "Garçom",
  "Commis",
  "Cozinha",
  "Padaria produção",
  "Confeitaria",
  "Estoque",
  "Limpeza",
  "Atendente padaria",
  "Copa",
  "Chapeiro",
  "Coordenador",
  "Auxiliar adm",
  "Motorista",
  "Caixa",
  "Gerente",
];

type Horario = { inicio: string; fim: string };

/** Horário de cada função em cada turno.
 *  Os nomes dos turnos precisam ser iguais aos do banco: Abertura, Intermediário, Fechamento.
 *  Função sem horário aqui (ex.: Gerente, Confeitaria) pode ser escalada,
 *  mas não entra na conferência de cobertura. */
export const horarios: Record<string, Record<string, Horario>> = {
  Chapeiro: {
    Abertura: { inicio: "05:15", fim: "13:50" },
    Intermediário: { inicio: "06:00", fim: "14:20" },
    Fechamento: { inicio: "14:00", fim: "22:20" },
  },
  Copa: {
    Abertura: { inicio: "06:00", fim: "14:20" },
    Fechamento: { inicio: "14:00", fim: "22:20" },
  },
  Garçom: {
    Abertura: { inicio: "05:30", fim: "13:50" },
    Intermediário: { inicio: "06:00", fim: "14:20" }, // há também 07:00–15:20
    Fechamento: { inicio: "14:00", fim: "22:20" },
  },
  Commis: {
    Abertura: { inicio: "10:00", fim: "19:00" },
    Fechamento: { inicio: "11:00", fim: "20:20" },
  },
  Cozinha: {
    Abertura: { inicio: "06:00", fim: "14:20" },
    Intermediário: { inicio: "07:00", fim: "15:20" },
    Fechamento: { inicio: "14:00", fim: "22:20" },
  },
  "Padaria produção": {
    Abertura: { inicio: "04:20", fim: "12:00" }, // há também 05:15–13:20
    Intermediário: { inicio: "06:00", fim: "14:00" },
    Fechamento: { inicio: "13:00", fim: "21:30" },
  },
  Coordenador: {
    Abertura: { inicio: "06:00", fim: "14:20" },
    Fechamento: { inicio: "14:00", fim: "22:20" },
  },
  Motorista: {
    Intermediário: { inicio: "07:00", fim: "15:00" },
  },
  Caixa: {
    Abertura: { inicio: "05:30", fim: "13:50" },
    Intermediário: { inicio: "12:00", fim: "20:20" },
    Fechamento: { inicio: "14:00", fim: "22:20" },
  },
  Limpeza: {
    Abertura: { inicio: "06:00", fim: "14:20" },
    Intermediário: { inicio: "08:00", fim: "16:00" },
    Fechamento: { inicio: "14:00", fim: "22:20" },
  },
  "Atendente padaria": {
    Abertura: { inicio: "05:30", fim: "13:50" }, // há também 06:00–14:20
    Intermediário: { inicio: "08:00", fim: "16:20" },
    Fechamento: { inicio: "14:00", fim: "22:20" }, // há também 13:00–21:20
  },
  "Auxiliar adm": {
    Intermediário: { inicio: "07:00", fim: "15:00" }, // segunda a sexta
  },
  Estoque: {
    Intermediário: { inicio: "07:00", fim: "15:00" },
  },
};

/** Grupos usados nas regras de cobertura: nome do grupo -> funções que contam. */
export const grupos: Record<string, string[]> = {
  Salão: ["Garçom", "Commis"],
  Chapa: ["Chapeiro"],
  Copa: ["Copa"],
  "Atendente padaria": ["Atendente padaria"],
  Cozinha: ["Cozinha"],
  "Padaria produção": ["Padaria produção"],
};

export type RegraCobertura = {
  grupo: string;
  minimo: number;
  /** Sem "de" e "ate" = sempre (do primeiro ao último horário das funções do grupo). */
  de?: string;
  ate?: string;
  /** Sem "dias" = todos os dias. */
  dias?: number[];
  pico?: boolean;
};

/** Horários de pico. */
export const horariosDePico: { dias: number[]; de: string; ate: string }[] = [
  { dias: [1, 2, 3, 4, 5], de: "11:00", ate: "14:00" }, // segunda a sexta
  { dias: [6, 0], de: "08:00", ate: "14:00" }, // sábado e domingo
];

/** Cria a regra de um grupo valendo em todos os horários de pico. */
function noPico(grupo: string, minimo: number): RegraCobertura[] {
  return horariosDePico.map((p) => ({ grupo, minimo, de: p.de, ate: p.ate, dias: p.dias, pico: true }));
}

/** Mínimo de pessoas presentes ao mesmo tempo. Quando duas regras valem no
 *  mesmo horário, vale a de maior número. */
export const cobertura: RegraCobertura[] = [
  // Mínimo normal
  { grupo: "Salão", minimo: 3 },
  { grupo: "Chapa", minimo: 1 },
  { grupo: "Copa", minimo: 1 },
  { grupo: "Atendente padaria", minimo: 1 },
  { grupo: "Cozinha", minimo: 4, de: "06:00", ate: "14:00" }, // manhã
  { grupo: "Cozinha", minimo: 1 },
  { grupo: "Padaria produção", minimo: 1 },

  // Pico: por enquanto com os mesmos números do mínimo normal. Ajuste aqui.
  ...noPico("Salão", 3),
  ...noPico("Chapa", 1),
  ...noPico("Copa", 1),
  ...noPico("Atendente padaria", 1),
  ...noPico("Cozinha", 4),
  ...noPico("Padaria produção", 1),
];
