"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Funcionario } from "@/lib/tipos";

type Formulario = {
  id: string | null; // null = funcionário novo
  nome: string;
  funcao: string;
  telefone: string;
};

const FORMULARIO_VAZIO: Formulario = { id: null, nome: "", funcao: "", telefone: "" };

export default function Equipe() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarDesativados, setMostrarDesativados] = useState(false);

  const semVariaveis = !variaveisConfiguradas();

  // Aumentar este número faz a lista ser buscada de novo no banco.
  const [versao, setVersao] = useState(0);
  const carregar = () => setVersao((v) => v + 1);

  useEffect(() => {
    if (semVariaveis) return;
    async function buscar() {
      const { data, error } = await supabase()
        .from("funcionarios")
        .select("id, nome, funcao, telefone, cpf, ativo")
        .order("nome");
      if (error) setErro(`Não foi possível carregar a equipe. Detalhe: ${error.message}`);
      else setFuncionarios(data ?? []);
      setCarregando(false);
    }
    buscar();
  }, [versao, semVariaveis]);

  const ativos = funcionarios.filter((f) => f.ativo);
  const desativados = funcionarios.filter((f) => !f.ativo);

  // Funções que já existem no banco + funções padrão, sem repetir.
  const funcoes = useMemo(() => {
    const todas = new Set([...FUNCOES_PADRAO, ...funcionarios.map((f) => f.funcao)]);
    return Array.from(todas).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [funcionarios]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!formulario) return;
    const nome = formulario.nome.trim();
    const funcao = formulario.funcao.trim();
    if (!nome || !funcao) {
      setErro("Preencha o nome e a função.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const dados = { nome, funcao, telefone: formulario.telefone.trim() || null };
    const consulta = formulario.id
      ? supabase().from("funcionarios").update(dados).eq("id", formulario.id)
      : supabase().from("funcionarios").insert(dados);
    const { error } = await consulta;
    setSalvando(false);
    if (error) {
      setErro(`Não foi possível salvar. Detalhe: ${error.message}`);
      return;
    }
    setFormulario(null);
    carregar();
  }

  async function mudarAtivo(funcionario: Funcionario, ativo: boolean) {
    if (!ativo && !confirm(`Desativar ${funcionario.nome}? Ele(a) sai da lista e da escala, mas pode ser reativado(a) depois.`)) {
      return;
    }
    setErro(null);
    const { error } = await supabase()
      .from("funcionarios")
      .update({ ativo })
      .eq("id", funcionario.id);
    if (error) {
      setErro(`Não foi possível atualizar. Detalhe: ${error.message}`);
      return;
    }
    carregar();
  }

  function editar(f: Funcionario) {
    setErro(null);
    setFormulario({ id: f.id, nome: f.nome, funcao: f.funcao, telefone: f.telefone ?? "" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Equipe</h1>
        <span className="text-sm text-neutral-600">{ativos.length} ativos</span>
      </div>

      {semVariaveis && (
        <p className="cartao border-red-300 text-red-700">
          As variáveis do Supabase não estão configuradas. Veja a página Início.
        </p>
      )}
      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      {!semVariaveis && !formulario && (
        <button
          className="botao w-full"
          onClick={() => {
            setErro(null);
            setFormulario(FORMULARIO_VAZIO);
          }}
        >
          + Adicionar funcionário
        </button>
      )}

      {formulario && (
        <form onSubmit={salvar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">
            {formulario.id ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Nome</span>
            <input
              className="campo"
              value={formulario.nome}
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Função</span>
            <select
              className="campo"
              value={formulario.funcao}
              onChange={(e) => setFormulario({ ...formulario, funcao: e.target.value })}
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
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Telefone</span>
            <input
              className="campo"
              type="tel"
              inputMode="tel"
              placeholder="(11) 90000-0000"
              value={formulario.telefone}
              onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              className="botao-secundario"
              onClick={() => setFormulario(null)}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button type="submit" className="botao" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {carregando && !semVariaveis && <p className="text-neutral-600">Carregando...</p>}

      {!carregando && ativos.length === 0 && !erro && (
        <p className="cartao text-neutral-600">Nenhum funcionário ativo ainda.</p>
      )}

      <ul className="space-y-3">
        {ativos.map((f) => (
          <li key={f.id} className="cartao">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-lg font-semibold">{f.nome}</span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium">
                {f.funcao}
              </span>
            </div>
            {f.telefone ? (
              <a href={`tel:${f.telefone.replace(/[^\d+]/g, "")}`} className="mt-1 block text-neutral-700 underline">
                {f.telefone}
              </a>
            ) : (
              <p className="mt-1 text-neutral-500">Sem telefone</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button className="botao-secundario" onClick={() => editar(f)}>
                Editar
              </button>
              <button
                className="botao-secundario !border-red-300 !text-red-700"
                onClick={() => mudarAtivo(f, false)}
              >
                Desativar
              </button>
            </div>
          </li>
        ))}
      </ul>

      {desativados.length > 0 && (
        <section className="space-y-3 pt-2">
          <button
            className="botao-secundario w-full"
            onClick={() => setMostrarDesativados(!mostrarDesativados)}
          >
            {mostrarDesativados ? "Esconder" : "Ver"} desativados ({desativados.length})
          </button>
          {mostrarDesativados && (
            <ul className="space-y-3">
              {desativados.map((f) => (
                <li key={f.id} className="cartao flex items-center justify-between gap-3 opacity-80">
                  <div>
                    <p className="font-semibold">{f.nome}</p>
                    <p className="text-sm text-neutral-600">{f.funcao}</p>
                  </div>
                  <button className="botao-secundario" onClick={() => mudarAtivo(f, true)}>
                    Reativar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
