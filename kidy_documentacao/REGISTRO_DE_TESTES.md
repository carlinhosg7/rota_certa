# KIDY SALES INTELLIGENCE — REGISTRO DE TESTES

**Data-base:** 20/10/2026  
**Origem das evidências:** logs de terminal e trechos de código compartilhados durante o desenvolvimento.  
**Convenção:** **APROVADO** = evidência observada; **PARCIAL** = passou em um cenário, falta abrangência; **PENDENTE** = sem evidência conclusiva; **REVERTIDO** = experimento descartado.

## 1. Matriz de testes executados

| ID | Área | Teste / evidência | Resultado | Status |
|---|---|---|---|---|
| T-001 | Build | `npx tsc --noEmit` após integração de cache | Comando terminou sem erros reportados | APROVADO |
| T-002 | Inicialização | `npm run dev` / Next.js 16.3.5 | `Ready in 1085ms` | APROVADO |
| T-003 | Dashboard | `GET /dashboard` | HTTP 200 (626ms na primeira chamada; 39ms após login em outro teste) | APROVADO |
| T-004 | API comercial — frio | `GET /api/comercial?` | HTTP 200 em ~15,0s e ~16,2s em execuções observadas | APROVADO |
| T-005 | API comercial — quente | `GET /api/comercial?` | HTTP 200 em 142ms e 176ms | APROVADO |
| T-006 | Google Drive | Consulta de catálogo | 11 arquivos encontrados; consulta observada em 4.094ms | APROVADO |
| T-007 | Cache físico | Reutilização dos Parquets | Logs `DRIVE CACHE Reutilizando` nos seis arquivos | APROVADO |
| T-008 | Carga de vendas | Leitura de seis Parquets | 1.191.830 registros | APROVADO |
| T-009 | Outras bases | Carteira, financeiro, produtos, referências, municípios | 22.831 / 18.239 / 3.420 / 940 / 5.570 | APROVADO |
| T-010 | Autenticação | `POST /api/auth` | HTTP 200 em 558ms | APROVADO |
| T-011 | Logout | `POST /api/auth/logout` | HTTP 200 em 1197ms | APROVADO |
| T-012 | Registro de eventos | `POST /api/evento` após novo login | HTTP 200 em 268ms e 333ms | PARCIAL |
| T-013 | Registro de eventos | Erro anterior no Supabase | `PGRST303: JWT issued at future`, HTTP 500 em uma tentativa; outra retornou 200 | INTERMITENTE / ACOMPANHAR |
| T-014 | Mapas / SSR | Remoção de importação estática do Leaflet no servidor | Dashboard voltou a responder HTTP 200 | APROVADO |
| T-015 | Índice de vendas | Memoização por identidade do cache | Medições históricas aproximadas de ~300ms para ~5–7ms na consulta quente | APROVADO EM TESTE LOCAL |
| T-016 | Cache de 15 minutos | Consulta forçada ao Drive após TTL e reutilização se inalterado | Código integrado e compilado; **não há log do ciclo de 15 min** | PENDENTE |
| T-017 | Atualização de fonte | Alterar arquivo Drive e validar atualização comercial | Não demonstrado | PENDENTE |
| T-018 | Resiliência | Falha de rede do Drive e uso de cache anterior | Estratégia existe no código; cenário de falha não demonstrado | PENDENTE |
| T-019 | Controle de acesso | Tentativas com diferentes perfis | Não demonstrado neste ciclo | PENDENTE |
| T-020 | Carga concorrente | Muitas sessões simultâneas | Não demonstrado | PENDENTE |

## 2. Medições de desempenho

### Execução A — carga inicial

| Etapa | Tempo |
|---|---:|
| Catálogo Drive | 4.094 ms |
| Preparação dos Parquets | 12 ms |
| Preparação total | 4.115 ms |
| Vendas | 10.125 ms |
| Leitura e processamento das bases | 10.130 ms |
| Consolidação | 99 ms |
| **Total** | **14.346 ms** |

### Execução B — nova carga inicial

| Etapa | Tempo |
|---|---:|
| Vendas | 10.664 ms |
| Leitura e processamento das bases | 10.668 ms |
| Consolidação | 154 ms |
| **Total** | **15.631 ms** |

**Interpretação:** o tempo de carga fria permanece na faixa de 14–16 segundos nos exemplos observados; o ganho mais relevante está na resposta com cache aquecido.

### Consumo de memória

| Execução | RSS ao atualizar cache | Heap usado |
|---|---:|---:|
| A | 786,84 MB | 545,57 MB |
| B | 1.290,01 MB | 832,62 MB |

Os números variam entre execuções. Oscilações durante a leitura são compatíveis com alocação e coleta de lixo do Node.js, mas **não provam ausência de vazamentos**. A equipe decidiu não realizar novas alterações de memória neste momento.

## 3. Incidentes e decisões

### INC-001 — `window is not defined` no Leaflet

- **Sintoma:** erro de renderização no servidor por importação estática de biblioteca dependente do navegador.
- **Mudança:** carregar `VendaMaisMap` dinamicamente com `{ ssr: false }` no componente cliente.
- **Evidência posterior:** `GET /dashboard 200`.
- **Situação:** corrigido nos testes observados.

### INC-002 — `PGRST303: JWT issued at future`

- **Sintoma:** `POST /api/evento` retornou HTTP 500 ao inserir em `log_acesso`.
- **Contexto:** cliente Supabase servidor com `SUPABASE_SECRET_KEY` no formato moderno `sb_secret_`; `persistSession: false`, `autoRefreshToken: false`.
- **Relógio local:** sincronizado com `KIDY-AD01.kidy.local`.
- **Comparação NTP externa:** cinco amostras com desvio aproximado de +0,93s frente a `time.google.com`.
- **Evidência posterior:** duas chamadas `POST /api/evento` retornaram HTTP 200 após login.
- **Conclusão:** erro não reproduzido no teste posterior; **causa-raiz não confirmada**. Não houve correção comprovada no código nem evidência suficiente para atribuir a falha exclusivamente ao desvio de horário.
- **Ação futura:** registrar timestamp UTC do servidor e metadados não sensíveis quando ocorrer novamente; comparar ambiente e horário do Supabase sem expor JWT.

### EXP-001 — Leitura dos Parquets em lotes de 25 mil linhas

- **Hipótese:** reduzir pico de memória.
- **Resultado observado:** tempo de carga aumentou aproximadamente de 15s para 25s.
- **Decisão:** experimento revertido; manter leitura atual por arquivo até existir benchmark que justifique mudança.

### EXP-002 — Instrumentação por arquivo e por base

- **Objetivo:** identificar gargalos.
- **Resultado:** carregamento das vendas domina o processamento (~10s); consulta inicial do catálogo Drive acrescenta ~4–5s.
- **Observação:** medições de loaders em `Promise.all` não equivalem necessariamente a tempos de CPU independentes, pois há bloqueio/concorrência no mesmo processo.

### EXP-003 — Cache comercial por versão de arquivos

- **Mudança:** assinatura de versões do catálogo e atualização forçada do Drive quando o TTL comercial expira.
- **Evidência:** compilação TypeScript sem erros; carga fria normal.
- **Situação:** funcionalidade implementada, **teste de reutilização após TTL pendente**.

## 4. Roteiros de regressão para futuras versões

### R-001 — Login e sessão

1. Abrir a aplicação sem sessão; verificar redirecionamento esperado.
2. Autenticar com usuário de teste autorizado.
3. Abrir `/dashboard`; confirmar HTTP 200.
4. Fazer logout; confirmar invalidação da sessão.
5. Reabrir URL protegida; confirmar bloqueio.
6. Repetir para representante, supervisor e administrador, respeitando escopos.

**Critério de aprovação:** nenhum usuário acessa dados fora do perfil/escopo; sessão inválida não autoriza chamadas.

### R-002 — Integridade dos dados

1. Iniciar servidor sem cache comercial em memória.
2. Confirmar catálogo e 11 arquivos esperados.
3. Comparar contagens de vendas, carteira e demais bases com a origem no mesmo instante.
4. Verificar amostra de clientes e valores agregados.
5. Confirmar que a API comercial não apresenta erro.

**Critério de aprovação:** contagens e agregações coincidem com fontes de referência, considerando filtros e datas de atualização.

### R-003 — Cache inteligente

1. Fazer carga fria e registrar horário de `[CACHE] Bases comerciais atualizadas`.
2. Fazer chamadas repetidas antes de 15 minutos; verificar resposta com cache.
3. Após expiração, solicitar API sem alterar arquivos do Drive.
4. Confirmar logs `[CACHE] Verificacao Drive`, `Nenhum arquivo alterado` e `Cache comercial mantido`.
5. Confirmar **ausência** de nova leitura de seis Parquets nessa verificação.
6. Alterar controladamente um arquivo de homologação no Drive; repetir e verificar atualização.
7. Simular falha de rede e verificar preservação do cache anterior e retry.

**Critério de aprovação:** dados inalterados não são reprocessados; dados alterados são refletidos; falhas não apagam cache válido.

### R-004 — Eventos

1. Acessar dashboard, selecionar supervisor, representante e cidade.
2. Verificar `POST /api/evento 200`.
3. Conferir registros correspondentes em `log_acesso`.
4. Tentar evento fora da allowlist; esperar HTTP 400.
5. Tentar sem sessão; esperar HTTP 401.

**Critério de aprovação:** gravação confiável, nenhuma informação sensível exposta, autorização consistente.

### R-005 — Mapas

1. Abrir dashboard em carregamento frio.
2. Confirmar ausência de `window is not defined`.
3. Navegar até mapa e validar renderização.
4. Validar cidades sem coordenadas e rota vazia.

**Critério de aprovação:** SSR e cliente não quebram, mapa trata dados incompletos.

## 5. Modelo de registro para novos testes

```markdown
### TESTE-AAAA-NNN — Nome do teste
- Data/hora e fuso:
- Versão / commit Git:
- Ambiente: local / homologação / produção
- Responsável:
- Objetivo:
- Pré-condições:
- Dados de teste (sem credenciais):
- Procedimento:
- Resultado esperado:
- Resultado observado:
- Tempo e memória (se aplicável):
- Status: APROVADO / REPROVADO / PENDENTE
- Evidência: caminho de log, captura ou relatório
- Incidente relacionado:
- Ação corretiva / próximo passo:
```

## 6. Recomendações de evidência

- Guardar data/hora, commit e ambiente de cada teste.
- Registrar resultados reais, não somente mensagens de sucesso.
- Não incluir `.env.local`, tokens, dados pessoais de clientes ou chaves nos relatórios.
- Distinguir **teste automatizado**, **teste manual** e **inspeção de código**.
- Repetir testes críticos após mudanças de autenticação, Drive, Parquet ou cache.
