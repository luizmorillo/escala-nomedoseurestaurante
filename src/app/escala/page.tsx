"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Escala, Funcionario, Turno } from "@/lib/tipos";
import {
  DIAS_SEMANA,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  rotuloDia,
  somarDias,
} from "@/lib/datas";

/** "Ana Souza" -> "Ana S." para caber na grade. */
function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0];
}

type CelulaAberta = { data: string; turno: Turno };

export default function EscalaDaSemana() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [celula, setCelula] = useState<CelulaAberta | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const semVariaveis = !variaveisConfiguradas();
  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const hoje = hojeISO();

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    async function carregarBase() {
      const db = supabase();
      const [t, f] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
      ]);
      if (t.error || f.error) {
        setErro(`Não foi possível carregar turnos e equipe. Detalhe: ${(t.error ?? f.error)?.message}`);
        return;
      }
      setTurnos(t.data ?? []);
      setFuncionarios(f.data ?? []);
    }
    if (!semVariaveis) carregarBase();
  }, [semVariaveis]);

  // Escala da semana: recarregada a cada troca de semana.
  useEffect(() => {
    if (semVariaveis) return;
    // Se a semana mudar antes da resposta chegar, a resposta antiga é ignorada.
    let ignorar = false;
    async function buscar() {
      const { data, error } = await supabase()
        .from("escalas")
        .select("id, data, turno_id, funcionario_id")
        .gte("data", segunda)
        .lte("data", somarDias(segunda, 6));
      if (ignorar) return;
      if (error) setErro(`Não foi possível carregar a escala. Detalhe: ${error.message}`);
      else setEscalas(data ?? []);
      setCarregando(false);
    }
    buscar();
    return () => {
      ignorar = true;
    };
  }, [segunda, semVariaveis]);

  function irParaSemana(novaSegunda: string) {
    if (novaSegunda === segunda) return;
    setCarregando(true);
    setSegunda(novaSegunda);
  }

  const porId = useMemo(() => new Map(funcionarios.map((f) => [f.id, f])), [funcionarios]);

  function escaladosNa(data: string, turnoId: string): Funcionario[] {
    return escalas
      .filter((e) => e.data === data && e.turno_id === turnoId)
      .map((e) => porId.get(e.funcionario_id))
      .filter((f): f is Funcionario => Boolean(f))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async function alternar(funcionario: Funcionario) {
    if (!celula) return;
    const { data, turno } = celula;
    const existente = escalas.find(
      (e) => e.data === data && e.turno_id === turno.id && e.funcionario_id === funcionario.id,
    );
    setSalvandoId(funcionario.id);
    setErro(null);
    if (existente) {
      const { error } = await supabase().from("escalas").delete().eq("id", existente.id);
      if (error) setErro(`Não foi possível remover. Detalhe: ${error.message}`);
      else setEscalas((atual) => atual.filter((e) => e.id !== existente.id));
    } else {
      const { data: nova, error } = await supabase()
        .from("escalas")
        .insert({ data, turno_id: turno.id, funcionario_id: funcionario.id })
        .select("id, data, turno_id, funcionario_id")
        .single();
      if (error) setErro(`Não foi possível salvar. Detalhe: ${error.message}`);
      else if (nova) setEscalas((atual) => [...atual, nova]);
    }
    setSalvandoId(null);
  }

  // Lista da janela: ativos agrupados por função, mais quem estiver desativado
  // mas já escalado nesta célula (para poder tirar).
  const grupos = useMemo(() => {
    if (!celula) return [];
    const escaladosIds = new Set(
      escalas
        .filter((e) => e.data === celula.data && e.turno_id === celula.turno.id)
        .map((e) => e.funcionario_id),
    );
    const lista = funcionarios.filter((f) => f.ativo || escaladosIds.has(f.id));
    const mapa = new Map<string, Funcionario[]>();
    for (const f of lista) {
      if (!mapa.has(f.funcao)) mapa.set(f.funcao, []);
      mapa.get(f.funcao)!.push(f);
    }
    return Array.from(mapa.entries())
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([funcao, pessoas]) => ({ funcao, pessoas, escaladosIds }));
  }, [celula, escalas, funcionarios]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao space-y-3">
        <p className="text-center text-lg font-semibold">
          {diaMes(segunda)} a {diaMes(somarDias(segunda, 6))}
          <span className="ml-1 text-neutral-500">/{segunda.slice(0, 4)}</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button className="botao-secundario" onClick={() => irParaSemana(somarDias(segunda, -7))}>
            ◀ Anterior
          </button>
          <button className="botao-secundario" onClick={() => irParaSemana(somarDias(segunda, 7))}>
            Próxima ▶
          </button>
        </div>
        {segunda !== inicioDaSemana(hoje) && (
          <button className="botao w-full" onClick={() => irParaSemana(inicioDaSemana(hoje))}>
            Voltar para esta semana
          </button>
        )}
      </div>

      {semVariaveis && (
        <p className="cartao border-red-300 text-red-700">
          As variáveis do Supabase não estão configuradas. Veja a página Início.
        </p>
      )}
      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      <p className="text-sm text-neutral-600">
        Toque em um quadro para escolher quem trabalha. Arraste a grade para o lado para ver
        todos os dias.
      </p>

      <div className={`overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm ${carregando && !semVariaveis ? "opacity-60" : ""}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-[84px] border-b border-r border-neutral-200 bg-white p-2 text-left">
                Turno
              </th>
              {dias.map((d) => (
                <th
                  key={d}
                  className={`min-w-[110px] border-b border-neutral-200 p-2 text-center font-semibold ${
                    d === hoje ? "bg-neutral-100" : ""
                  }`}
                >
                  {rotuloDia(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turnos.map((turno) => (
              <tr key={turno.id}>
                <th className="sticky left-0 z-[1] border-r border-b border-neutral-200 bg-white p-2 text-left align-top">
                  <span className="block font-semibold">{turno.nome}</span>
                  <span className="block text-xs font-normal text-neutral-500">
                    {horaCurta(turno.hora_inicio)}–{horaCurta(turno.hora_fim)}
                  </span>
                </th>
                {dias.map((d) => {
                  const pessoas = escaladosNa(d, turno.id);
                  return (
                    <td key={d} className={`border-b border-neutral-200 p-1 align-top ${d === hoje ? "bg-neutral-50" : ""}`}>
                      <button
                        className="flex min-h-[96px] w-full flex-col items-stretch gap-1 rounded-lg p-1 text-left active:bg-neutral-100"
                        onClick={() => setCelula({ data: d, turno })}
                        aria-label={`${turno.nome} de ${rotuloDia(d)}: ${pessoas.length} pessoas. Tocar para escolher.`}
                      >
                        {pessoas.length === 0 ? (
                          <span className="m-auto text-2xl text-neutral-300">+</span>
                        ) : (
                          pessoas.map((p) => (
                            <span
                              key={p.id}
                              className="truncate rounded-md px-2 py-1 text-xs font-medium text-white"
                              style={{ background: "var(--cor-principal)" }}
                            >
                              {nomeCurto(p.nome)}
                            </span>
                          ))
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {celula && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setCelula(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="border-b border-neutral-200 p-4">
              <p className="text-lg font-bold">
                {celula.turno.nome} · {DIAS_SEMANA[paraData(celula.data).getDay()]} {diaMes(celula.data)}
              </p>
              <p className="text-sm text-neutral-600">Marque quem trabalha. Salva na hora.</p>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {grupos.length === 0 && (
                <p className="text-neutral-600">Nenhum funcionário ativo. Cadastre na tela Equipe.</p>
              )}
              {grupos.map(({ funcao, pessoas, escaladosIds }) => (
                <div key={funcao}>
                  <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    {funcao}
                  </p>
                  <div className="space-y-2">
                    {pessoas.map((p) => {
                      const marcado = escaladosIds.has(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
                            marcado ? "border-neutral-800 bg-neutral-100" : "border-neutral-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-6 w-6 shrink-0"
                            style={{ accentColor: "var(--cor-principal)" }}
                            checked={marcado}
                            disabled={salvandoId !== null}
                            onChange={() => alternar(p)}
                          />
                          <span className="flex-1 text-base">
                            {p.nome}
                            {!p.ativo && <span className="ml-2 text-sm text-neutral-500">(desativado)</span>}
                          </span>
                          {salvandoId === p.id && <span className="text-sm text-neutral-500">salvando...</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-200 p-4">
              <button className="botao w-full" onClick={() => setCelula(null)}>
                Pronto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
