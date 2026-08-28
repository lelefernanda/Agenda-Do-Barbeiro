/**
 * Tipos das tabelas do banco.
 *
 * O modulo @nuxtjs/supabase procura este arquivo em ~/types/database.types.ts.
 *
 * IMPORTANTE: tudo aqui usa "type", nunca "interface".
 * O supabase-js exige que cada Row seja compativel com Record<string, unknown>.
 * O TypeScript da indice implicito a "type", mas nao a "interface" — usar
 * interface faz toda consulta virar "never" e todo insert quebrar.
 *
 * Para gerar automaticamente no futuro:
 *   npx supabase gen types typescript --project-id SEU_ID > app/types/database.types.ts
 */

export type StatusBarbearia = 'ativa' | 'suspensa' | 'cancelada'
export type StatusPessoa = 'ativo' | 'bloqueado'
export type PapelUsuario = 'master' | 'dono' | 'barbeiro'
export type StatusAgendamento =
  | 'pendente' | 'confirmado' | 'concluido' | 'cancelado' | 'faltou'
export type StatusSolicitacao = 'pendente' | 'aprovada' | 'recusada'
export type FormaPagamento = 'mensal' | 'semestral'

export type Barbearia = {
  id: string
  nome: string
  slug: string
  status: StatusBarbearia
  telefone: string | null
  endereco: string | null
  cidade: string | null
  instagram: string | null
  logo_url: string | null
  capa_url: string | null
  capa_pos: number | null
  sobre: string | null
  cor: string | null
  pagamento: FormaPagamento
  vence_em: string | null
  criada_em: string
}

export type Perfil = {
  comissao_pct: number | null
  meta_mes: number | null
  id: string
  barbearia_id: string | null
  papel: PapelUsuario
  nome: string
  telefone: string | null
  foto_url: string | null
  bio: string | null
  status: StatusPessoa
  atende: boolean
  criado_em: string
}

export type Cliente = {
  id: string
  barbearia_id: string
  nome: string
  telefone: string
  observacao: string | null
  criado_em: string
}

export type Servico = {
  id: string
  barbearia_id: string
  nome: string
  descricao: string | null
  duracao_min: number
  preco: number
  foto_url: string | null
  ativo: boolean
  ordem: number
}

export type Jornada = {
  id: string
  barbeiro_id: string
  dia_semana: number
  inicio: string
  fim: string
}

export type Bloqueio = {
  id: string
  barbeiro_id: string
  inicio: string
  fim: string
  motivo: string | null
}

export type Agendamento = {
  id: string
  barbearia_id: string
  cliente_id: string
  barbeiro_id: string
  servico_id: string
  inicio: string
  fim: string
  status: StatusAgendamento
  preco_cobrado: number | null
  observacao: string | null
  criado_em: string
}

export type Avaliacao = {
  id: string
  agendamento_id: string
  estrelas: number
  comentario: string | null
  criada_em: string
}

export type SolicitacaoBarbeiro = {
  id: string
  barbearia_id: string
  nome: string
  email: string
  telefone: string | null
  status: StatusSolicitacao
  pedida_por: string | null
  perfil_criado: string | null
  observacao: string | null
  criada_em: string
  resolvida_em: string | null
}

/** O que a funcao meu_contexto() devolve */
export type Contexto = {
  perfil_id: string
  papel: PapelUsuario
  nome: string
  telefone: string | null
  foto_url: string | null
  status_usuario: StatusPessoa
  barbearia_id: string | null
  barbearia_nome: string | null
  barbearia_slug: string | null
  status_barbearia: StatusBarbearia | null
  acesso: boolean
  motivo:
    | 'usuario_bloqueado'
    | 'sem_barbearia'
    | 'barbearia_suspensa'
    | 'barbearia_cancelada'
    | null
}

/** Monta Row / Insert / Update a partir de um type */
type Tabela<T> = {
  Row: T
  Insert: Partial<T>
  Update: Partial<T>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      barbearias:            Tabela<Barbearia>
      perfis:                Tabela<Perfil>
      clientes:              Tabela<Cliente>
      servicos:              Tabela<Servico>
      jornadas:              Tabela<Jornada>
      bloqueios:             Tabela<Bloqueio>
      agendamentos:          Tabela<Agendamento>
      avaliacoes:            Tabela<Avaliacao>
      solicitacoes_barbeiro: Tabela<SolicitacaoBarbeiro>
      slugs_reservados:      Tabela<{ slug: string }>
    }
    Views: {
      ocupacao: {
        Row: { barbeiro_id: string; inicio: string; fim: string }
        Relationships: []
      }
      notas_barbeiro: {
        Row: { barbeiro_id: string; media: number; total: number }
        Relationships: []
      }
    }
    Functions: {
      meu_contexto: { Args: Record<PropertyKey, never>; Returns: Contexto }
      e_master:     { Args: Record<PropertyKey, never>; Returns: boolean }
      tenho_acesso: { Args: Record<PropertyKey, never>; Returns: boolean }
    }
    Enums: {
      status_barbearia:   StatusBarbearia
      status_pessoa:      StatusPessoa
      papel_usuario:      PapelUsuario
      status_agendamento: StatusAgendamento
      status_solicitacao: StatusSolicitacao
      forma_pagamento:    FormaPagamento
    }
    CompositeTypes: { [_ in never]: never }
  }
}