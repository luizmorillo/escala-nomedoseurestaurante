"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Configuracao, type Regra, type Turno } from "@/lib/tipos";
import { DIAS_SEMANA } from "@/lib/datas";
import { CHAVE_FECHAR_E_ABRIR, CHAVE_FOLGAS, lerConfiguracoes } from "@/lib/regras";

type NovaRegra = { dia: string; turnoId: string; funcao: string; minimo: number };

const rotuloDiaRegra = (dia: number | null) => (dia === null ? "Todos os dias" : DIAS_SEMANA[dia]);

export default function RegrasDaCasa() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [funcoesEquipe, setFuncoesEquipe] = useState<string[]>([]);
  const [folgas, setFolgas] = useState(1);
  const [fecharEAbrir, setFecharEAbrir] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null); // o que está sendo salvo
  const [nova, setNova] = useState<NovaRegra | null>(null);

  const semVariaveis = !variaveisConfiguradas();

  useEffect(() => {
    if (semVariaveis) return;
    async function buscar() {
      const db = supabase();
      const [t, r, c, f] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("regras").select("id, dia_semana, turno_id, funcao, minimo"),
        db.from("configuracoes").select("chave, valor"),
        db.from("funcionarios").select("funcao"),
      ]);
      const falha = t.error ?? r.error ?? c.error ?? f.error;
      if (falha) {
        setErro(`Não foi possível carregar as regras. Detalhe: ${falha.message}`);
      } else {
        setTurnos(t.data ?? []);
        setRegras((r.data ?? []) as Regra[]);
        const conf = lerConfiguracoes((c.data ?? []) as Configuracao[]);
        setFolgas(conf.folgasMinimas);
        setFecharEAbrir(conf.avisarFecharEAbrir);
        setFuncoesEquipe((f.data ?? []).map((x: { funcao: string }) => x.funcao));
      }
      setCarregando(false);
    }
    buscar();
  }, [semVariaveis]);

  const funcoes = useMemo(() => {
    const todas = new Set([...FUNCOES_PADRAO, ...funcoesEquipe, ...regras.map((r) => r.funcao)]);
    return Array.from(todas).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [funcoesEquipe, regras]);

  // Regras agrupadas por turno; "todos os dias" primeiro, depois de segunda a domingo.
  const ordemDia = (d: number | null) => (d === null ? -1 : (d + 6) % 7);
  const porTurno = turnos.map((t) => ({
    turno: t,
    lista: regras
      .filter((r) => r.turno_id === t.id)
      .sort((a, b) => ordemDia(a.dia_semana) - ordemDia(b.dia_semana) || a.funcao.localeCompare(b.funcao, "pt-BR")),
  }));

  async function mudarMinimo(regra: Regra, minimo: number) {
    if (minimo < 1) return;
    setOcupado(regra.id);
    setErro(null);
    const { error } = await supabase().from("regras").update({ minimo }).eq("id", regra.id);
    if (error) setErro(`Não foi possível salvar. Detalhe: ${error.message}`);
    else setRegras((atual) => atual.map((r) => (r.id === regra.id ? { ...r, minimo } : r)));
    setOcupado(null);
  }

  async function remover(regra: Regra, turno: Turno) {
    if (!confirm(`Remover o mínimo de ${regra.funcao} no ${turno.nome} (${rotuloDiaRegra(regra.dia_semana)})?`)) return;
    setOcupado(regra.id);
    setErro(null);
    const { error } = await supabase().from("regras").delete().eq("id", regra.id);
    if (error) setErro(`Não foi possível remover. Detalhe: ${error.message}`);
    else setRegras((atual) => atual.filter((r) => r.id !== regra.id));
    setOcupado(null);
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nova || !nova.turnoId || !nova.funcao) {
      setErro("Escolha o turno e a função.");
      return;
    }
    const dia_semana = nova.dia === "" ? null : Number(nova.dia);
    const repetida = regras.some(
      (r) => r.turno_id === nova.turnoId && r.funcao === nova.funcao && r.dia_semana === dia_semana,
    );
    if (repetida) {
      setErro("Essa regra já existe. Ajuste o número dela na lista.");
      return;
    }
    setOcupado("nova");
    setErro(null);
    const { data, error } = await supabase()
      .from("regras")
      .insert({ dia_semana, turno_id: nova.turnoId, funcao: nova.funcao, minimo: Math.max(1, nova.minimo) })
      .select("id, dia_semana, turno_id, funcao, minimo")
      .single();
    setOcupado(null);
    if (error) {
      setErro(`Não foi possível adicionar. Detalhe: ${error.message}`);
      return;
    }
    if (data) setRegras((atual) => [...atual, data as Regra]);
    setNova(null);
  }

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

  async function mudarFecharEAbrir(valor: boolean) {
    if (await salvarConfiguracao(CHAVE_FECHAR_E_ABRIR, String(valor))) setFecharEAbrir(valor);
  }

  const primeiroTurno = turnos[0]?.nome ?? "primeiro turno";
  const ultimoTurno = turnos[turnos.length - 1]?.nome ?? "último turno";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Regras da casa</h1>
        <p className="mt-1 text-neutral-700">
          A Escala da semana usa estas regras para mostrar alertas. Tudo salva na hora.
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
          {/* Folgas */}
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

          {/* Fecha e abre */}
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
                Avisar quando alguém trabalha no {ultimoTurno} e no {primeiroTurno} do dia seguinte
              </span>
            </label>
          </section>

          {/* Mínimos */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Mínimo de pessoas por turno e função</h2>
            <p className="text-sm text-neutral-600">
              Uma regra de um dia específico (ex.: Sexta) vale no lugar da regra de &quot;Todos os
              dias&quot; daquele turno e função.
            </p>

            {porTurno.map(({ turno, lista }) => (
              <div key={turno.id} className="cartao space-y-2">
                <h3 className="text-base font-bold">{turno.nome}</h3>
                {lista.length === 0 && <p className="text-sm text-neutral-500">Nenhuma regra neste turno.</p>}
                {lista.map((r) => (
                  <div key={r.id} className="space-y-2 border-t border-neutral-100 pt-3">
                    <p>
                      <span className="font-semibold">{r.funcao}</span>
                      <span className="text-neutral-600"> · {rotuloDiaRegra(r.dia_semana)}</span>
                    </p>
                    <div className="flex items-center justify-between gap-3">
                    <Contador
                      valor={r.minimo}
                      minimo={1}
                      maximo={50}
                      ocupado={ocupado === r.id}
                      onMudar={(v) => mudarMinimo(r, v)}
                      rotulo={`mínimo de ${r.funcao}`}
                    />
                    <button
                      className="botao-secundario !border-red-300 !px-3 !text-red-700"
                      onClick={() => remover(r, turno)}
                      disabled={ocupado === r.id}
                      aria-label={`Remover regra de ${r.funcao}, ${rotuloDiaRegra(r.dia_semana)}`}
                    >
                      Remover
                    </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {!nova && (
              <button
                className="botao w-full"
                onClick={() => {
                  setErro(null);
                  setNova({ dia: "", turnoId: turnos[0]?.id ?? "", funcao: "", minimo: 1 });
                }}
              >
                + Adicionar mínimo
              </button>
            )}

            {nova && (
              <form onSubmit={adicionar} className="cartao space-y-3">
                <h3 className="text-base font-bold">Novo mínimo</h3>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Dia</span>
                  <select className="campo" value={nova.dia} onChange={(e) => setNova({ ...nova, dia: e.target.value })}>
                    <option value="">Todos os dias</option>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>
                        {DIAS_SEMANA[d]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Turno</span>
                  <select
                    className="campo"
                    value={nova.turnoId}
                    onChange={(e) => setNova({ ...nova, turnoId: e.target.value })}
                  >
                    {turnos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Função</span>
                  <select
                    className="campo"
                    value={nova.funcao}
                    onChange={(e) => setNova({ ...nova, funcao: e.target.value })}
                    required
                  >
                    <option value="">Escolha a função</option>
                    {funcoes.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <span className="mb-1 block text-sm font-medium">Mínimo de pessoas</span>
                  <Contador
                    valor={nova.minimo}
                    minimo={1}
                    maximo={50}
                    ocupado={false}
                    onMudar={(v) => setNova({ ...nova, minimo: v })}
                    rotulo="mínimo de pessoas"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button type="button" className="botao-secundario" onClick={() => setNova(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="botao" disabled={ocupado === "nova"}>
                    {ocupado === "nova" ? "Salvando..." : "Adicionar"}
                  </button>
                </div>
              </form>
            )}
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
