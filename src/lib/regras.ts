// Regras da casa: conferem a escala e devolvem alertas.
// Os números (mínimos, folgas, liga/desliga) vêm do Supabase e são editados na
// tela "Regras da casa". Para criar uma regra nova, escreva uma função no mesmo
// formato das abaixo e chame-a em verificarEscala().

import type { Configuracao, Escala, Funcionario, Regra, Turno } from "./tipos";
import { DIAS_SEMANA, paraData, rotuloDia, somarDias } from "./datas";

// Chaves usadas na tabela "configuracoes".
export const CHAVE_FOLGAS = "folgas_minimas_semana";
export const CHAVE_FECHAR_E_ABRIR = "bloquear_fechar_e_abrir";

export type ConfigRegras = {
  minimos: Regra[];
  folgasMinimas: number;
  avisarFecharEAbrir: boolean;
};

export type TipoAlerta = "minimo" | "folga" | "fechar-abrir";

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
  minimo: "Falta gente",
  folga: "Sem folga",
  "fechar-abrir": "Fecha e abre",
};

export function chaveCelula(data: string, turnoId: string): string {
  return `${data}|${turnoId}`;
}

/** Lê as configurações do banco, usando valores padrão se faltar alguma. */
export function lerConfiguracoes(lista: Configuracao[]): Pick<ConfigRegras, "folgasMinimas" | "avisarFecharEAbrir"> {
  const valor = (chave: string) => lista.find((c) => c.chave === chave)?.valor;
  const folgas = Number(valor(CHAVE_FOLGAS));
  return {
    folgasMinimas: Number.isFinite(folgas) && folgas >= 0 ? folgas : 1,
    avisarFecharEAbrir: (valor(CHAVE_FECHAR_E_ABRIR) ?? "true") !== "false",
  };
}

/** "Ana Souza" -> "Ana S." */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0];
}

/** Mínimo de cada função para um turno num dia da semana.
 *  Uma regra de dia específico vale no lugar da regra "todos os dias". */
export function minimosDoTurno(regras: Regra[], turnoId: string, diaSemana: number): Map<string, number> {
  const mapa = new Map<string, number>();
  const doTurno = regras.filter((r) => r.turno_id === turnoId);
  for (const r of doTurno) if (r.dia_semana === null) mapa.set(r.funcao, r.minimo);
  for (const r of doTurno) if (r.dia_semana === diaSemana) mapa.set(r.funcao, r.minimo);
  return mapa;
}

type Dados = {
  dias: string[]; // os 7 dias da semana (segunda a domingo)
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[]; // pode incluir o domingo anterior, para a regra 3
  config: ConfigRegras;
};

// Regra 1: mínimo de pessoas por turno e função.
function regraMinimos({ dias, turnos, funcionarios, escalas, config }: Dados): Alerta[] {
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const alertas: Alerta[] = [];
  for (const dia of dias) {
    for (const turno of turnos) {
      const minimos = minimosDoTurno(config.minimos, turno.id, paraData(dia).getDay());
      if (minimos.size === 0) continue;
      const contagem = new Map<string, number>();
      for (const e of escalas) {
        if (e.data !== dia || e.turno_id !== turno.id) continue;
        const funcao = porId.get(e.funcionario_id)?.funcao;
        if (funcao) contagem.set(funcao, (contagem.get(funcao) ?? 0) + 1);
      }
      for (const [funcao, minimo] of minimos) {
        const tem = contagem.get(funcao) ?? 0;
        if (tem >= minimo) continue;
        const falta = minimo - tem;
        alertas.push({
          tipo: "minimo",
          curta: `${funcao}: falta${falta > 1 ? "m" : ""} ${falta}`,
          mensagem: `${turno.nome} ${rotuloDia(dia)}: ${funcao} com ${tem} de ${minimo}`,
          celulas: [chaveCelula(dia, turno.id)],
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
          : `${f.nome} tem só ${folgas} folga${folgas > 1 ? "s" : ""} (mínimo ${config.folgasMinimas})`,
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

/** Confere a semana inteira e devolve todos os alertas. */
export function verificarEscala(dados: Dados): Alerta[] {
  return [...regraMinimos(dados), ...regraFolgas(dados), ...regraFecharEAbrir(dados)];
}
