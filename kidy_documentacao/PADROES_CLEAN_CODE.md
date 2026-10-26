# KIDY SALES INTELLIGENCE — PADRÕES DE CLEAN CODE

**Objetivo:** orientar manutenção segura, legível, testável e rastreável, preservando as regras de negócio do aplicativo.

## 1. Princípios

1. **Responsabilidade única:** separar acesso a fontes, transformação, regras comerciais, autenticação e apresentação.
2. **Nomes explícitos:** preferir `atualizarCatalogoDrive`, `carregarVendas`, `validarToken` a abreviações obscuras.
3. **Tipos definidos:** reduzir `any`; criar interfaces para cliente, venda, carteira, perfil, evento e respostas de API.
4. **Funções pequenas e testáveis:** isolar leitura de arquivo, normalização, consolidação, filtros e cálculos.
5. **Evitar duplicação:** regras de negócio compartilhadas devem existir em um único módulo.
6. **Erros previsíveis:** capturar exceções nos limites do sistema e retornar mensagens seguras e consistentes.
7. **Sem efeitos colaterais ocultos:** funções de consulta não devem alterar estado global sem contrato claro.
8. **Desempenho medido:** otimizar somente com baseline e teste de regressão.
9. **Segurança por padrão:** autorização no servidor, segredos isolados, validação de entrada e logs mínimos.
10. **Mudanças reversíveis:** backup ou commit, escopo pequeno e validação após cada alteração.

## 2. Organização de módulos — proposta de evolução

> **Proposta**, não representa diretórios já existentes. Refatorar gradualmente, sem mudar tudo de uma vez.

```text
src/
├── app/                     # Rotas, páginas e handlers HTTP
├── components/              # Componentes de interface
├── domain/                  # Entidades, tipos e regras de negócio
│   ├── cliente/
│   ├── vendas/
│   ├── rota/
│   └── comercial/
├── services/                # Orquestração de casos de uso
├── repositories/            # Acesso a Drive, Supabase e arquivos
├── lib/                     # Utilitários transversais
└── tests/                   # Testes unitários e de integração
```

**Refatoração prioritária, se necessária:** reduzir o acoplamento do grande `comercial-data.ts` separando loaders, transformações e cache, com testes antes de mover funções.

## 3. Convenções de nomenclatura

| Elemento | Convenção | Exemplo |
|---|---|---|
| Funções e variáveis | `camelCase` | `carregarDadosAtualizados` |
| Tipos, classes e componentes | `PascalCase` | `Venda`, `DashboardClient` |
| Constantes globais | `UPPER_SNAKE_CASE` | `CACHE_INTERVALO_MS` |
| Arquivos de serviço | `kebab-case` | `google-drive-adapter.ts` |
| Booleanos | Prefixo semântico | `cacheValido`, `usandoDrive` |
| Eventos | `UPPER_SNAKE_CASE` | `ABRIU_CLIENTE` |

Usar português ou inglês de forma consistente por domínio; evitar misturas dentro da mesma interface pública.

## 4. Contratos e tipagem

- Definir tipos para resultados de leitura e dados consolidados.
- Distinguir dados brutos de dados normalizados.
- Representar ausência explicitamente com `null` / campos opcionais.
- Validar JSON recebido nas APIs antes de usar valores.
- Não usar `as` para esconder incompatibilidades sem justificativa.
- Padronizar respostas de API, por exemplo `{ sucesso: true, dados }` e `{ sucesso: false, erro: { codigo, mensagem } }` em futuras rotas; migrar sem quebrar clientes existentes.

## 5. Cache e concorrência

- Documentar TTL, chave de cache, escopo (processo), política de invalidação e fallback.
- Comparar versões **somente após** atualização bem-sucedida do catálogo.
- Atualizar assinatura processada **somente após** carga completa bem-sucedida.
- Preservar referência do cache quando as fontes não mudarem.
- Evitar múltiplos recarregamentos simultâneos.
- Diferenciar logs de `CACHE_HIT`, `CACHE_REFRESH`, `CACHE_REUSE`, `CACHE_ERROR` em evolução futura.
- Testar reinício, atualização simultânea, falha de Drive e múltiplas instâncias.

## 6. Tratamento de erros e observabilidade

- Mensagens de erro ao usuário devem ser claras e não revelar detalhes internos.
- Logs técnicos devem incluir módulo, operação, duração e código do erro, sem credenciais.
- Não silenciar exceções inesperadas; registrar e aplicar fallback quando seguro.
- Medir tempo com `performance.now()` e memória com `process.memoryUsage()` apenas onde necessário.
- Instrumentação detalhada de cada Parquet pode ser reduzida em produção após estabilização, se gerar excesso de logs.

## 7. Segurança e permissões

- Nunca importar módulo com chave secreta em componente de navegador.
- Validar sessão **e autorização** em toda rota protegida.
- Não confiar no perfil, representante ou supervisor enviado pelo cliente sem checagem no servidor.
- Proteger logs de acesso e dados de clientes.
- Restringir origens, políticas e permissões do Supabase ao mínimo necessário.
- Não armazenar senhas em texto puro nem imprimir segredos.

## 8. Estratégia de testes

### Testes unitários — sugeridos

- Normalização de códigos e referências (`cleanCode`, `cleanReferencia`, `norm`).
- Cálculo de indicadores e regras de classificação.
- Agrupamento de vendas por cliente.
- Comparação de assinaturas do catálogo.
- Filtragem de eventos permitidos.

### Testes de integração — sugeridos

- Leitura de arquivos de amostra e validação de esquema.
- Simulação de Drive sem alterações, com alteração e indisponível.
- API comercial com cache frio e quente.
- API de eventos com sessão válida, inválida e evento não permitido.

### Testes ponta a ponta — sugeridos

- Login → dashboard → supervisor → representante → cidade → cliente → mapa → logout.
- Usuário sem permissão tentando acessar recurso protegido.
- Acesso simultâneo e retorno após expiração de cache.

**Ferramentas:** escolher ferramentas de teste compatíveis com o repositório após inspecionar `package.json`; não presumir que Jest, Vitest ou Playwright já estão instalados.

## 9. Checklist obrigatório antes de merge/deploy

- [ ] Alteração vinculada a requisito ou incidente.
- [ ] Backup ou commit realizado.
- [ ] Sem segredos, tokens ou dados pessoais no diff.
- [ ] `npx tsc --noEmit` sem erros.
- [ ] Build de produção executado quando aplicável.
- [ ] Testes unitários/integração pertinentes executados.
- [ ] Rotas e permissões afetadas testadas manualmente.
- [ ] Dados e contagens comparados quando houver mudança de processamento.
- [ ] Logs sem erro inesperado.
- [ ] Plano de rollback documentado.
- [ ] `REGISTRO_DE_TESTES.md` atualizado com evidências.

## 10. Como documentar uma alteração

```markdown
## CHANGE-AAAA-NNN — Título
- Data:
- Objetivo:
- Arquivos alterados:
- Comportamento anterior:
- Comportamento novo:
- Impacto em dados e permissões:
- Testes executados (IDs):
- Métricas antes/depois:
- Backup / commit:
- Rollback:
- Pendências:
```

## 11. Dívida técnica conhecida ou a avaliar

| Item | Estado | Orientação |
|---|---|---|
| Reprocessamento integral quando qualquer arquivo muda | Conhecido | Avaliar atualização incremental somente com testes |
| Pico variável de memória no carregamento | Conhecido | Monitorar; não refatorar sem necessidade |
| Erro intermitente `PGRST303` | A acompanhar | Capturar evidência de recorrência e investigar causa |
| Cache em memória por processo | Conhecido | Avaliar arquitetura de produção com múltiplas instâncias |
| Validação do cache após TTL | Pendente | Executar roteiro R-003 |
| Cobertura automatizada de testes | Não confirmada | Inventariar testes existentes antes de adicionar ferramentas |
| Tipagem `any` em utilitários | Observada | Melhorar gradualmente, com testes |

**Regra de manutenção:** preservar comportamento funcional e medir impacto. Uma refatoração só é concluída quando passa pelos mesmos testes de regressão da versão anterior.
