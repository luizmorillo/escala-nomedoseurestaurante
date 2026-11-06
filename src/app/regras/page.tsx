"use client";

import { useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Configuracao, Turno } from "@/lib/tipos";
import { DIAS_SEMANA_CURTO } from "@/lib/datas";
import { CHAVE_DOMINGOS, CHAVE_FECHAR_E_ABRIR, CHAVE_FOLGAS, lerConfiguracoes } from "@/lib/regras";
import { cobertura, grupos, horarios, type RegraCobertura } from "@/config/restaurante";

function rotuloDias(dias?: number[]): string {
  if (!dias) return "todos os dias";
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const lista = ordem.filter((d) => dias.includes(d));
  if (lista.join() === "1,2,3,4,5") return "segunda a sexta";
  if (lista.join() === "6,0") return "sábado e domingo";
  return lista.map((d) => DIAS_SEMANA_CURTO[d]).join(", ");
}

function rotuloRegra(r: RegraCobertura): string {
  const horario = r.de && r.ate ? `das ${r.de} às ${r.ate}` : "sempre";
  return `${horario}, ${rotuloDias(r.dias)}`;
}

export default function RegrasDaCasa() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [folgas, setFolgas] = useState(2);
  const [fecharEAbrir, setFecharEAbrir] = useState(true);
  const [domingos, setDomingos] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null); // o que está sendo salvo

  const semVariaveis = !variaveisConfiguradas();

  useEffect(() => {
    if (semVariaveis) return;
    async function buscar() {
      const db = supabase();
      const [t, c] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("configuracoes").select("chave, valor"),
      ]);
      const falha = t.error ?? c.error;
      if (falha) {
        setErro(`Não foi possível carregar as regras. Detalhe: ${falha.message}`);
      } else {
        setTurnos(t.data ?? []);
        const conf = lerConfiguracoes((c.data ?? []) as Configuracao[]);
        setFolgas(conf.folgasMinimas);
        setFecharEAbrir(conf.avisarFecharEAbrir);
        setDomingos(conf.domingosFolgaMes);
      }
      setCarregando(false);
    }
    buscar();
  }, [semVariaveis]);

  async function salvarConfiguracao(chave: string, valor: string) {
    setOcupado(chave);
    setErro(null);
    const { error } = await supabase().from("configuracoes").upsert({ chave, valor });
    setOcupado(null);
    if (error) {
      setErro(`Não foi possível salvar. Detalhe: ${error.message}`);
      return false;
    }
    return true;
  }

  async function mudarFolgas(valor: number) {
    if (valor < 0 || valor > 6) return;
    if (await salvarConfiguracao(CHAVE_FOLGAS, String(valor))) setFolgas(valor);
  }

  async function mudarDomingos(valor: number) {
    if (valor < 0 || valor > 5) return;
    if (await salvarConfiguracao(CHAVE_DOMINGOS, String(valor))) setDomingos(valor);
  }

  async function mudarFecharEAbrir(valor: boolean) {
    if (await salvarConfiguracao(CHAVE_FECHAR_E_ABRIR, String(valor))) setFecharEAbrir(valor);
  }

  const primeiroTurno = turnos[0]?.nome ?? "primeiro turno";
  const ultimoTurno = turnos[turnos.length - 1]?.nome ?? "último turno";

  const coberturaPorGrupo = Object.keys(grupos).map((g) => ({
    grupo: g,
    funcoes: grupos[g],
    normal: cobertura.filter((r) => r.grupo === g && !r.pico),
    pico: cobertura.filter((r) => r.grupo === g && r.pico),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Regras da casa</h1>
        <p className="mt-1 text-neutral-700">
          A Escala da semana usa estas regras para mostrar alertas.
        </p>
      </div>

      {semVariaveis && (
        <p className="cartao border-red-300 text-red-700">
          As variáveis do Supabase não estão configuradas. Veja a página Início.
        </p>
      )}
      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}
      {carregando && !semVariaveis && <p className="text-neutral-600">Carregando...</p>}

      {!carregando && !semVariaveis && (
        <>
          <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Muda aqui, salva na hora
          </p>

          <section className="cartao space-y-3">
            <h2 className="text-lg font-semibold">Folgas por semana</h2>
            <p className="text-sm text-neutral-600">
              Cada funcionário precisa de pelo menos este número de dias sem trabalhar na semana.
            </p>
            <Contador
              valor={folgas}
              minimo={0}
              maximo={6}
              ocupado={ocupado === CHAVE_FOLGAS}
              onMudar={mudarFolgas}
              rotulo="folgas"
            />
          </section>

          <section className="cartao space-y-3">
            <h2 className="text-lg font-semibold">Domingos de folga por mês</h2>
            <p className="text-sm text-neutral-600">
              Cada funcionário precisa de pelo menos este número de domingos sem trabalhar no mês.
            </p>
            <Contador
              valor={domingos}
              minimo={0}
              maximo={5}
              ocupado={ocupado === CHAVE_DOMINGOS}
              onMudar={mudarDomingos}
              rotulo="domingos de folga"
            />
          </section>

          <section className="cartao space-y-3">
            <h2 className="text-lg font-semibold">Fechar e abrir</h2>
            <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border border-neutral-300 px-4 py-3">
              <input
                type="checkbox"
                className="h-6 w-6 shrink-0"
                style={{ accentColor: "var(--cor-principal)" }}
                checked={fecharEAbrir}
                disabled={ocupado === CHAVE_FECHAR_E_ABRIR}
                onChange={(e) => mudarFecharEAbrir(e.target.checked)}
              />
              <span className="text-base">
                Avisar quando alguém trabalha no {ultimoTurno} e na {primeiroTurno} do dia seguinte
              </span>
            </label>
          </section>

          <p className="pt-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Muda no arquivo src/config/restaurante.ts
          </p>

          <section className="cartao space-y-3">
            <h2 className="text-lg font-semibold">Cobertura mínima</h2>
            <p className="text-sm text-neutral-600">
              Quantas pessoas precisam estar trabalhando ao mesmo tempo. &quot;Sempre&quot; vai do
              primeiro ao último horário das funções do grupo.
            </p>
            {coberturaPorGrupo.map(({ grupo, funcoes, normal, pico }) => (
              <div key={grupo} className="border-t border-neutral-100 pt-2">
                <p className="font-semibold">
                  {grupo}
                  {funcoes.length > 1 && (
                    <span className="font-normal text-neutral-600"> ({funcoes.join(" + ")})</span>
                  )}
                </p>
                <ul className="text-sm text-neutral-700">
                  {normal.map((r, i) => (
                    <li key={i}>
                      <strong>{r.minimo}</strong> {rotuloRegra(r)}
                    </li>
                  ))}
                  {pico.map((r, i) => (
                    <li key={`p${i}`}>
                      <strong>{r.minimo}</strong> no pico, {rotuloRegra(r)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="cartao space-y-3">
            <h2 className="text-lg font-semibold">Horários por função</h2>
            {Object.entries(horarios).map(([funcao, porTurno]) => (
              <div key={funcao} className="border-t border-neutral-100 pt-2">
                <p className="font-semibold">{funcao}</p>
                <ul className="text-sm text-neutral-700">
                  {turnos
                    .filter((t) => porTurno[t.nome])
                    .map((t) => (
                      <li key={t.id}>
                        {t.nome}: {porTurno[t.nome].inicio}–{porTurno[t.nome].fim}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

/** Número com botões grandes de – e +. */
function Contador({
  valor,
  minimo,
  maximo,
  ocupado,
  onMudar,
  rotulo,
}: {
  valor: number;
  minimo: number;
  maximo: number;
  ocupado: boolean;
  onMudar: (v: number) => void;
  rotulo: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="botao-secundario h-12 w-12 !p-0 text-2xl"
        onClick={() => onMudar(valor - 1)}
        disabled={ocupado || valor <= minimo}
        aria-label={`Diminuir ${rotulo}`}
      >
        –
      </button>
      <span className="w-10 text-center text-xl font-bold" aria-live="polite">
        {valor}
      </span>
      <button
        type="button"
        className="botao-secundario h-12 w-12 !p-0 text-2xl"
        onClick={() => onMudar(valor + 1)}
        disabled={ocupado || valor >= maximo}
        aria-label={`Aumentar ${rotulo}`}
      >
        +
      </button>
    </div>
  );
}
