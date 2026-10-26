# KIDY SALES INTELLIGENCE
## Documentação técnica, arquitetura e operação

**Versão do documento:** 1.0  
**Data de referência:** 20/10/2026  
**Status:** documentação do estado conhecido, com itens a confirmar no repositório  
**Repositório:** `https://github.com/carlinhosg7/rota_certa` (branch `master`, conforme histórico do projeto)  
**Ambiente local:** `D:\Kidy_sales_Intelligence`

> **Escopo e confiabilidade:** este material foi construído a partir do histórico de desenvolvimento, dos trechos de código e dos logs compartilhados. Não representa uma auditoria integral do repositório. Quando um comportamento não foi demonstrado por testes ou código, ele está marcado como **a confirmar**.

---

## 1. Objetivo do aplicativo

O **KIDY Sales Intelligence** é uma aplicação web de inteligência comercial destinada a apoiar representantes, supervisores e administradores no acompanhamento de clientes, identificação de oportunidades de venda e planejamento de rotas comerciais.

### Funcionalidades conhecidas

- Autenticação e sessão de usuário.
- Dashboard comercial com navegação por supervisor, representante e cidade.
- Consulta de clientes e indicadores comerciais.
- Análise individual de cliente, incluindo informações preditivas e produtos/referências.
- Sugestão de rota comercial e visualização em mapa.
- Registro de eventos de navegação e uso na tabela `log_acesso` do Supabase.
- Atualização de dados comerciais a partir de arquivos do Google Drive, com cache em memória e cache técnico local de arquivos.

**A confirmar no código atual:** matriz completa de permissões por perfil, todas as regras de negócio da análise preditiva, algoritmos de priorização de rota e páginas adicionais.

## 2. Tecnologias e integrações

| Camada | Tecnologia / serviço | Finalidade |
|---|---|---|
| Front-end e servidor | Next.js 16.3.5, Turbopack | Interface, páginas e APIs |
| Linguagem | TypeScript | Tipagem e implementação |
| Autenticação / registros | Supabase | Validação de usuários, sessão e logs |
| Dados comerciais | Google Drive | Origem operacional dos arquivos |
| Fonte alternativa | GitHub RAW | Modo de carregamento alternativo |
| Leitura de planilhas | `xlsx` | Excel |
| Leitura de Parquet | `hyparquet`, `hyparquet-compressors` | Vendas |
| Mapas | Leaflet | Visualização de rotas |
| Controle de versão | Git / GitHub | Histórico de alterações |

A integração com Supabase utiliza variáveis de ambiente `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. A chave secreta é usada no servidor e **nunca deve ser exposta no navegador, em logs ou no repositório**.

## 3. Estrutura de código conhecida

```text
D:\Kidy_sales_Intelligence\
├── src\
│   ├── app\
│   │   ├── api\
│   │   │   ├── comercial\       # Consulta comercial
│   │   │   ├── evento\route.ts  # Registro de eventos
│   │   │   └── auth\           # Autenticação / logout
│   │   ├── dashboard\         # Dashboard
│   │   └── cliente\[codigo]\page.tsx
│   ├── components\
│   │   ├── DashboardClient.tsx
│   │   └── VendaMaisMap.tsx
│   └── lib\
│       ├── comercial-data.ts
│       ├── google-drive-adapter.ts
│       ├── supabase.ts
│       └── auth.ts
├── .env.local                # Segredos locais: NÃO versionar
└── next.config.ts
```

A estrutura acima é parcial, não uma listagem completa do repositório.

### Responsabilidades principais

**`src/lib/google-drive-adapter.ts`** — consulta catálogo do Drive, compara metadados dos arquivos, prepara arquivos Parquet para leitura local e reutiliza cópias válidas. O catálogo tem TTL de 15 minutos e suporta consulta forçada com `atualizarCatalogoDrive(true)`. A função `versoesCatalogoDrive()` produz uma assinatura ordenada com nome, ID, tamanho e data de atualização dos arquivos.

**`src/lib/comercial-data.ts`** — prepara fontes, carrega carteira, vendas, financeiro, produtos, referências e municípios; consolida os dados e fornece `getData()`. Implementa cache em memória, atualização assíncrona e índice de vendas por cliente.

**`src/lib/auth.ts`** — valida a sessão da aplicação, conforme importação `validarToken()` utilizada na API de eventos. A implementação interna deve ser auditada antes de documentar algoritmo, expiração e assinatura.

**`src/lib/supabase.ts`** — cria cliente Supabase de servidor com `persistSession: false` e `autoRefreshToken: false`.

**`src/app/api/evento/route.ts`** — valida cookie `kidy_session`, identifica sessão, restringe tipos de evento e insere registro em `log_acesso`.

**`src/components/DashboardClient.tsx`** — interface interativa e emissão de eventos. O mapa é importado dinamicamente com SSR desabilitado para evitar acesso a `window` durante renderização no servidor.

## 4. Fontes de dados

| Arquivo | Quantidade observada | Papel |
|---|---:|---|
| `DADOS_PREDITIVA_1.parquet` | 198.639 linhas | Vendas |
| `DADOS_PREDITIVA_2.parquet` | 198.639 linhas | Vendas |
| `DADOS_PREDITIVA_3.parquet` | 198.638 linhas | Vendas |
| `DADOS_PREDITIVA_4.parquet` | 198.638 linhas | Vendas |
| `DADOS_PREDITIVA_5.parquet` | 198.638 linhas | Vendas |
| `DADOS_PREDITIVA_6.parquet` | 198.638 linhas | Vendas |
| `base clientes.xlsx` | 22.831 registros válidos | Carteira |
| `DADOS PRDITIVA LIMITE.xlsx` | 18.239 registros | Informações financeiras |
| `DADOS PREDITIVA PRODUTOS EM LINHA.xlsx` | 3.420 registros | Produtos autorizados |
| `NOME_REFERENCIAS.xlsx` | 940 registros | Classificação de referências |
| `municipios_com_lat_lon.csv` | 5.570 registros | Geolocalização |

**Total de vendas observado:** **1.191.830 registros**. As quantidades são resultados de um carregamento específico e podem mudar com a atualização das fontes.

**Configuração conhecida:** `KIDY_DATA_SOURCE=drive` seleciona Google Drive; o código também contém caminho alternativo para GitHub.

## 5. Fluxo de carregamento e cache

```text
Requisição ao dashboard / API
          |
          v
        getData()
          |
          +-- Sem cache? --> Consultar catálogo Drive
          |                    Preparar arquivos
          |                    Ler seis Parquets e outras bases
          |                    Consolidar e guardar em memória
          |
          +-- Cache dentro do TTL? --> Retornar dados em memória
          |
          +-- Cache vencido? --> Iniciar atualização assíncrona
                                   |
                                   v
                            Consultar Drive (forçada)
                                   |
                     +-------------+-------------+
                     |                           |
              Versões iguais               Versões diferentes
                     |                           |
              Reutilizar objeto            Reprocessar bases
              do cache existente          e substituir cache
```

### Regras implementadas

- **TTL comercial:** 15 minutos (`CACHE_INTERVALO_MS`).
- **Nova tentativa após falha:** 60 segundos (`CACHE_RETRY_MS`).
- **Stale-while-revalidate:** quando já existem dados em memória, `getData()` retorna o cache anterior enquanto a atualização ocorre em segundo plano.
- **Deduplicação de atualização:** a variável `atualizacaoEmAndamento` evita múltiplas cargas simultâneas no mesmo processo.
- **Comparação de versões:** `versoesCatalogoDrive()` é comparada à assinatura da última carga bem-sucedida; se igual, preserva-se o mesmo objeto de cache.
- **Índice de vendas:** `getIndiceVendas(dados)` reutiliza um `Map` por identidade do objeto `Cache`, evitando reconstrução a cada consulta.
- **Primeira carga após reinício:** continua sendo uma carga completa.

**Importante:** a lógica foi compilada e a carga inicial foi testada, mas **a reutilização após expiração dos 15 minutos ainda não foi comprovada por log compartilhado**. Também é necessário avaliar comportamento de cache em múltiplas instâncias de produção: memória de processo não é compartilhada entre instâncias.

### Limitação conhecida

Quando qualquer arquivo do catálogo muda, a implementação atual executa **reprocessamento completo** das bases. A atualização seletiva por arquivo é uma possível melhoria futura, não implementada.

## 6. Autenticação e auditoria

### Sessão

- Cookie de sessão conhecido: `kidy_session`.
- Identificador de sessão para logs: `kidy_sid`.
- A API de eventos chama `validarToken(token)` antes de gravar.
- Existem perfis conhecidos de negócio: representante, supervisor e administrador. A matriz de autorização real precisa ser conferida nas rotas.

### Eventos permitidos pela API

```text
ACESSO_DASHBOARD
SELECIONOU_SUPERVISOR
SELECIONOU_REPRESENTANTE
SELECIONOU_CIDADE
ABRIU_CLIENTE
GEROU_ROTA
ACESSO_ANALISE_CLIENTE
```

O log inclui campos como usuário, nome, perfil, código de representante, IP encaminhado, navegador, sistema operacional, dispositivo, ID de sessão e evento. O IP obtido de `x-forwarded-for` depende da configuração do proxy; não deve ser tratado automaticamente como identidade confiável.

**Privacidade:** evitar dados sensíveis em logs e aplicar retenção e acesso restrito aos registros de auditoria.

## 7. Comandos operacionais

```powershell
cd D:\Kidy_sales_Intelligence
npx tsc --noEmit
npm run dev
```

Ambiente local observado: `http://localhost:3000`.

### Antes de alterar arquivos

1. Confirmar caminho e arquivo.
2. Criar backup datado ou commit Git.
3. Fazer uma alteração delimitada.
4. Executar `npx tsc --noEmit`.
5. Testar rota afetada, verificar logs e comparar resultados.
6. Registrar mudança, evidência e plano de reversão.

## 8. Segurança operacional

- Não versionar `.env.local`, chaves `sb_secret_`, senhas, tokens ou arquivos de sessão.
- Manter chaves secretas apenas em módulos de servidor.
- Não imprimir credenciais nem JWTs completos no terminal.
- Não tratar autenticação válida como autorização suficiente: validar perfil e escopo em cada API protegida.
- Validar entrada de APIs e usar allowlists para eventos.
- Tratar erros sem revelar detalhes internos aos clientes.
- Evitar logs com dados pessoais desnecessários.
- Em produção, verificar políticas de RLS e o alcance da chave secreta no Supabase.

## 9. Pendências de documentação e validação

- [ ] Inspecionar todas as rotas e construir inventário definitivo de endpoints.
- [ ] Conferir regras completas de perfis, filtros e escopo por representante/supervisor.
- [ ] Documentar esquema das tabelas Supabase e políticas de acesso.
- [ ] Confirmar contratos de entrada/saída das APIs.
- [ ] Registrar o algoritmo e critérios da sugestão de rota e análise preditiva.
- [ ] Validar reutilização do cache após 15 minutos.
- [ ] Validar alteração real de um arquivo no Drive e atualização da aplicação.
- [ ] Executar testes de carga e concorrência em ambiente de homologação.
- [ ] Confirmar pipeline de deploy, configuração de produção e rollback.

---

**Documentos complementares:** `REGISTRO_DE_TESTES.md` e `PADROES_CLEAN_CODE.md`.
