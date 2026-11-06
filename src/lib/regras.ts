// Regras da casa: conferem a escala e devolvem alertas.
// - Horários e cobertura mínima vêm de src/config/restaurante.ts.
// - Folgas, "fecha e abre" e domingos de folga vêm do Supabase (tela "Regras da casa").
// Para criar uma regra nova, escreva uma função no mesmo formato das abaixo e
// chame-a em verificarEscala().

import type { Configuracao, Escala, Funcionario, Turno } from "./tipos";
import { DIAS_SEMANA, horaParaMinutos, paraData, rotuloDia, somarDias } from "./datas";
import { cobertura, grupos, horarios, type RegraCobertura } from "@/config/restaurante";

// Chaves usadas na tabela "configuracoes".
export const CHAVE_FOLGAS = "folgas_minimas_semana";
export const CHAVE_FECHAR_E_ABRIR = "bloquear_fechar_e_abrir";
export const CHAVE_DOMINGOS = "domingos_folga_mes";

export type ConfigRegras = {
  folgasMinimas: number;
  avisarFecharEAbrir: boolean;
  domingosFolgaMes: number;
};

export type TipoAlerta = "cobertura" | "folga" | "fechar-abrir" | "domingo";

export type Alerta = {
  tipo: TipoAlerta;
  /** Texto curto que aparece dentro da célula. */
  curta: string;
  /** Texto completo para o resumo no topo. */
  mensagem: string;
  /** Células afetadas (veja chaveCelula). Vazio = alerta só no resumo. */
  celulas: string[];
};

export const NOME_TIPO: Record<TipoAlerta, string> = {
  cobertura: "Descoberto",
  folga: "Sem folga",
  "fechar-abrir": "Fecha e abre",
  domingo: "Domingo",
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function chaveCelula(data: string, turnoId: string): string {
  return `${data}|${turnoId}`;
}

function numero(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return valor !== undefined && Number.isFinite(n) && n >= 0 ? n : padrao;
}

/** Lê as configurações do banco, usando valores padrão se faltar alguma. */
export function lerConfiguracoes(lista: Configuracao[]): ConfigRegras {
  const valor = (chave: string) => lista.find((c) => c.chave === chave)?.valor;
  return {
    folgasMinimas: numero(valor(CHAVE_FOLGAS), 2),
    avisarFecharEAbrir: (valor(CHAVE_FECHAR_E_ABRIR) ?? "true") !== "false",
    domingosFolgaMes: numero(valor(CHAVE_DOMINGOS), 1),
  };
}

/** "Ana Souza" -> "Ana S." */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0];
}

/** Horário de uma função num turno (pelo nome do turno), ou null. */
export function horarioDe(funcao: string, turnoNome: string): { inicio: number; fim: number; texto: string } | null {
  const h = horarios[funcao]?.[turnoNome];
  if (!h) return null;
  return { inicio: horaParaMinutos(h.inicio), fim: horaParaMinutos(h.fim), texto: `${h.inicio}–${h.fim}` };
}

/** "22:20" a partir de minutos. */
function hora(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Janela "sempre" de um grupo: do primeiro início ao último fim das suas funções. */
function janelaDoGrupo(nomeGrupo: string): [number, number] | null {
  let ini = Infinity;
  let fim = -Infinity;
  for (const funcao of grupos[nomeGrupo] ?? []) {
    for (const h of Object.values(horarios[funcao] ?? {})) {
      ini = Math.min(ini, horaParaMinutos(h.inicio));
      fim = Math.max(fim, horaParaMinutos(h.fim));
    }
  }
  return ini < fim ? [ini, fim] : null;
}

function janelaDaRegra(r: RegraCobertura): [number, number] | null {
  if (r.de && r.ate) return [horaParaMinutos(r.de), horaParaMinutos(r.ate)];
  return janelaDoGrupo(r.grupo);
}

type Dados = {
  dias: string[]; // os 7 dias da semana (segunda a domingo)
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[]; // pode incluir outros dias (domingo anterior, domingos do mês)
  config: ConfigRegras;
};

// Regra 1: cobertura mínima por horário (turno descoberto).
function regraCobertura({ dias, turnos, funcionarios, escalas }: Dados): Alerta[] {
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const turnoPorId = new Map(turnos.map((t) => [t.id, t]));
  const ordenados = [...turnos].sort((a, b) => a.ordem - b.ordem);
  const alertas: Alerta[] = [];

  for (const dia of dias) {
    const diaSemana = paraData(dia).getDay();
    const regrasDoDia = cobertura.filter((r) => !r.dias || r.dias.includes(diaSemana));

    for (const nomeGrupo of new Set(regrasDoDia.map((r) => r.grupo))) {
      const funcoesDoGrupo = grupos[nomeGrupo] ?? [];
      const regras = regrasDoDia
        .filter((r) => r.grupo === nomeGrupo)
        .map((r) => ({ regra: r, janela: janelaDaRegra(r) }))
        .filter((x): x is { regra: RegraCobertura; janela: [number, number] } => x.janela !== null);
      if (regras.length === 0) continue;

      // Quem do grupo está presente, e em que horário.
      const presencas: [number, number][] = [];
      for (const e of escalas) {
        if (e.data !== dia) continue;
        const f = porId.get(e.funcionario_id);
        const t = turnoPorId.get(e.turno_id);
        if (!f || !t || !funcoesDoGrupo.includes(f.funcao)) continue;
        const h = horarioDe(f.funcao, t.nome);
        if (h) presencas.push([h.inicio, h.fim]);
      }

      // Divide o dia nos pontos em que algo muda e confere cada pedaço.
      const marcos = new Set<number>();
      for (const { janela } of regras) janela.forEach((m) => marcos.add(m));
      for (const p of presencas) p.forEach((m) => marcos.add(m));
      const pontos = [...marcos].sort((a, b) => a - b);

      type Buraco = { de: number; ate: number; precisa: number; tem: number; pico: boolean };
      const buracos: Buraco[] = [];
      for (let i = 0; i < pontos.length - 1; i++) {
        const de = pontos[i];
        const ate = pontos[i + 1];
        const valendo = regras.filter(({ janela }) => janela[0] <= de && de < janela[1]);
        if (valendo.length === 0) continue;
        const precisa = Math.max(...valendo.map((v) => v.regra.minimo));
        const pico = valendo.every((v) => v.regra.minimo < precisa || v.regra.pico);
        const tem = presencas.filter(([a, b]) => a <= de && de < b).length;
        if (tem >= precisa) continue;
        const ultimo = buracos[buracos.length - 1];
        if (ultimo && ultimo.ate === de && ultimo.precisa === precisa && ultimo.pico === pico) {
          ultimo.ate = ate;
          ultimo.tem = Math.min(ultimo.tem, tem);
        } else {
          buracos.push({ de, ate, precisa, tem, pico });
        }
      }

      for (const b of buracos) {
        // Pinta o primeiro turno em que o grupo trabalha no começo do buraco.
        const turno =
          ordenados.find((t) =>
            funcoesDoGrupo.some((f) => {
              const h = horarioDe(f, t.nome);
              return h !== null && h.inicio <= b.de && b.de < h.fim;
            }),
          ) ?? ordenados[0];
        const faixa = `${hora(b.de)}–${hora(b.ate)}`;
        alertas.push({
          tipo: "cobertura",
          curta: `${nomeGrupo} ${b.tem}/${b.precisa} ${faixa}`,
          mensagem: `${rotuloDia(dia)} · ${nomeGrupo}: ${b.tem} de ${b.precisa} das ${hora(b.de)} às ${hora(b.ate)}${
            b.pico ? " (pico)" : ""
          }`,
          celulas: turno ? [chaveCelula(dia, turno.id)] : [],
        });
      }
    }
  }
  return alertas;
}

// Regra 2: folgas mínimas por semana (dia sem nenhum turno).
function regraFolgas({ dias, funcionarios, escalas, config }: Dados): Alerta[] {
  if (config.folgasMinimas <= 0) return [];
  const diasTrabalhados = new Map<string, Set<string>>();
  for (const e of escalas) {
    if (!dias.includes(e.data)) continue;
    if (!diasTrabalhados.has(e.funcionario_id)) diasTrabalhados.set(e.funcionario_id, new Set());
    diasTrabalhados.get(e.funcionario_id)!.add(e.data);
  }
  const alertas: Alerta[] = [];
  for (const f of funcionarios) {
    const trabalhados = diasTrabalhados.get(f.id)?.size ?? 0;
    if (trabalhados === 0) continue;
    const folgas = dias.length - trabalhados;
    if (folgas >= config.folgasMinimas) continue;
    alertas.push({
      tipo: "folga",
      curta: `${nomeCurto(f.nome)} sem folga`,
      mensagem:
        folgas === 0
          ? `${f.nome} está sem folga na semana (mínimo ${config.folgasMinimas})`
          : `${f.nome} tem só ${folgas} folga${folgas > 1 ? "s" : ""} na semana (mínimo ${config.folgasMinimas})`,
      celulas: [],
    });
  }
  return alertas;
}

// Regra 3: quem fecha um dia (último turno) não abre o dia seguinte (primeiro turno).
function regraFecharEAbrir({ dias, turnos, funcionarios, escalas, config }: Dados): Alerta[] {
  if (!config.avisarFecharEAbrir || turnos.length < 2) return [];
  const ordenados = [...turnos].sort((a, b) => a.ordem - b.ordem);
  const abre = ordenados[0];
  const fecha = ordenados[ordenados.length - 1];
  const nomes = new Map(funcionarios.map((f) => [f.id, f.nome]));
  const pessoasEm = (data: string, turnoId: string) =>
    new Set(escalas.filter((e) => e.data === data && e.turno_id === turnoId).map((e) => e.funcionario_id));

  const alertas: Alerta[] = [];
  for (const diaAbre of dias) {
    const diaFecha = somarDias(diaAbre, -1); // na segunda, olha o domingo anterior
    const fecharam = pessoasEm(diaFecha, fecha.id);
    for (const id of pessoasEm(diaAbre, abre.id)) {
      if (!fecharam.has(id)) continue;
      const nome = nomes.get(id) ?? "Alguém";
      const celulas = [chaveCelula(diaAbre, abre.id)];
      if (dias.includes(diaFecha)) celulas.push(chaveCelula(diaFecha, fecha.id));
      alertas.push({
        tipo: "fechar-abrir",
        curta: `${nomeCurto(nome)} fecha e abre`,
        mensagem: `${nome} fecha ${DIAS_SEMANA[paraData(diaFecha).getDay()].toLowerCase()} ${rotuloDia(diaFecha).slice(4)} (${fecha.nome}) e abre ${rotuloDia(diaAbre)} (${abre.nome})`,
        celulas,
      });
    }
  }
  return alertas;
}

/** Todos os domingos de um mês ("2026-11"). */
export function domingosDoMes(anoMes: string): string[] {
  const [a, m] = anoMes.split("-").map(Number);
  const lista: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const data = new Date(a, m - 1, d);
    if (data.getMonth() !== m - 1) break;
    if (data.getDay() === 0) lista.push(`${anoMes}-${String(d).padStart(2, "0")}`);
  }
  return lista;
}

/** Domingos de todos os meses que a semana toca. */
export function domingosDosMeses(dias: string[]): string[] {
  const meses = [...new Set(dias.map((d) => d.slice(0, 7)))];
  return meses.flatMap(domingosDoMes);
}

// Regra 4: pelo menos N domingos de folga no mês.
// Só avisa quando a pessoa já está escalada em domingos demais naquele mês.
function regraDomingos({ dias, funcionarios, escalas, config }: Dados): Alerta[] {
  if (config.domingosFolgaMes <= 0) return [];
  const alertas: Alerta[] = [];
  for (const anoMes of new Set(dias.map((d) => d.slice(0, 7)))) {
    const domingos = domingosDoMes(anoMes);
    const limite = domingos.length - config.domingosFolgaMes;
    const nomeMes = MESES[Number(anoMes.slice(5)) - 1];
    for (const f of funcionarios) {
      const trabalhados = new Set(
        escalas.filter((e) => e.funcionario_id === f.id && domingos.includes(e.data)).map((e) => e.data),
      ).size;
      if (trabalhados === 0 || trabalhados <= limite) continue;
      alertas.push({
        tipo: "domingo",
        curta: `${nomeCurto(f.nome)} sem domingo de folga`,
        mensagem: `${f.nome} trabalha ${trabalhados} de ${domingos.length} domingos de ${nomeMes} (precisa de ${config.domingosFolgaMes} de folga)`,
        celulas: [],
      });
    }
  }
  return alertas;
}

/** Confere a semana inteira e devolve todos os alertas. */
export function verificarEscala(dados: Dados): Alerta[] {
  return [
    ...regraCobertura(dados),
    ...regraFolgas(dados),
    ...regraFecharEAbrir(dados),
    ...regraDomingos(dados),
  ];
}
