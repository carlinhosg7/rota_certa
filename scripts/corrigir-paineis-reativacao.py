from pathlib import Path
from datetime import datetime
import shutil
import subprocess
import sys

ROOT = Path(r"D:\KIDY_AJUSTES_LOTE_20261119")

arquivos = [
    "src/app/api/reativacao/indicador/route.ts",
    "src/app/api/campanha/route.ts",
    "src/components/CartaoTaxaReativacao.tsx",
    "src/components/CartaoClientesReativados.tsx",
    "src/app/carteira/reativados/page.tsx",
]

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = ROOT / f"_backup_reativacao_paineis_{stamp}"

originais = {}

def substituir(texto, antigo, novo, nome):
    quantidade = texto.count(antigo)

    if quantidade != 1:
        raise RuntimeError(
            f"{nome}: esperado 1 trecho, encontrados {quantidade}. "
            "Alteracao interrompida."
        )

    return texto.replace(antigo, novo, 1)


try:
    for nome in arquivos:
        p = ROOT / nome

        if not p.is_file():
            raise RuntimeError(f"Arquivo inexistente: {p}")

        originais[nome] = p.read_text(encoding="utf-8")

    a = dict(originais)

    # ====================================================
    # API GESTAO DA CARTEIRA
    # ====================================================

    nome = arquivos[0]
    texto = a[nome]

    antigo = "  const reativados=elegiveis.filter(x=>x.reativado).length;"

    novo = """
  // Eventos de compra da campanha, separados da homologacao.
  type Evento = {
    codigo_cliente: string;
    codigo_representante: string;
    codigo_supervisor: string;
    confirmado: boolean;
  };

  const eventos: Evento[] = [];

  for (let offset = 0; offset < 20000; offset += 1000) {
    const {data, error} = await supabase
      .from("kidy_reativacao_eventos")
      .select("codigo_cliente,codigo_representante,codigo_supervisor,confirmado")
      .eq("competencia", "2026-11-01")
      .order("codigo_cliente")
      .order("codigo_representante")
      .range(offset, offset + 999);

    if (error) throw error;

    eventos.push(...((data ?? []) as Evento[]));

    if ((data ?? []).length < 1000) break;
    if (offset >= 19000) throw Error("Limite de eventos atingido");
  }

  const elegiveisPorCodigo = new Map(
    elegiveis.map(x => [codigo(x.codigo_cliente), x])
  );

  const eventosVisiveis = eventos.filter(e => {
    const cliente = elegiveisPorCodigo.get(codigo(e.codigo_cliente));
    if (!cliente) return false;

    const reps = codigos(cliente.representantes);
    const sups = codigos(cliente.supervisores);

    return reps.includes(codigo(e.codigo_representante)) &&
      sups.includes(codigo(e.codigo_supervisor)) &&
      (!rep || codigo(e.codigo_representante) === rep) &&
      (!sup || codigo(e.codigo_supervisor) === sup) &&
      (!grupo.length || grupo.includes(codigo(e.codigo_supervisor)));
  });

  const detectados = new Set(
    eventosVisiveis.map(e => codigo(e.codigo_cliente))
  ).size;

  const {data: competenciaAtual, error: erroCompetencia} = await supabase
    .from("kidy_reativacao_competencias")
    .select("status")
    .eq("competencia", "2026-11-01")
    .maybeSingle();

  if (erroCompetencia) throw erroCompetencia;

  const competenciaValidada =
    String(competenciaAtual?.status ?? "").toUpperCase() === "VALIDADO";

  const confirmados = competenciaValidada
    ? new Set(
        eventosVisiveis
          .filter(e => e.confirmado)
          .map(e => codigo(e.codigo_cliente))
      ).size
    : 0;

  const reativados = elegiveis.filter(x => x.reativado).length;
"""

    texto = substituir(texto, antigo, novo, nome)

    antigo = "elegiveis:elegiveis.length,reativados,percentual:"

    novo = (
        "elegiveis:elegiveis.length,reativados,detectados,confirmados,"
        "percentualDetectado:elegiveis.length?"
        "100*detectados/elegiveis.length:null,percentual:"
    )

    texto = substituir(texto, antigo, novo, nome)
    a[nome] = texto

    # ====================================================
    # CARTAO TAXA DE REATIVACAO
    # ====================================================

    nome = arquivos[2]
    texto = a[nome]

    antigo = "reativados:number|null; percentual:number|null;"
    novo = (
        "reativados:number|null; detectados?:number; "
        "confirmados?:number; percentualDetectado?:number|null; "
        "percentual:number|null;"
    )

    texto = substituir(texto, antigo, novo, nome)

    antigo = 'dados.percentual.toFixed(2).replace(".",",")'
    novo = 'Number(dados.percentualDetectado ?? dados.percentual).toFixed(2).replace(".",",")'

    # Preservar o restante da expressao original.
    texto = substituir(
        texto,
        'dados?.disponivel && dados.percentual !== null ?',
        'dados?.disponivel && (dados.percentualDetectado ?? dados.percentual) != null ?',
        nome
    )

    texto = substituir(texto, antigo, novo, nome)

    antigo = '${n(dados.reativados ?? 0)} reativados de ${n(dados.elegiveis ?? 0)} clientes elegíveis na base de 27/10/2026'

    novo = '${n(dados.detectados ?? 0)} detectados de ${n(dados.elegiveis ?? 0)} clientes da base original de 27/10/2026 · ${n(dados.confirmados ?? 0)} homologados'

    texto = substituir(texto, antigo, novo, nome)
    a[nome] = texto

    # ====================================================
    # CARTAO CLIENTES REATIVADOS
    # ====================================================

    nome = arquivos[3]
    texto = a[nome]

    texto = substituir(
        texto,
        "reativados?: number | null; motivo?: string",
        "reativados?: number | null; detectados?: number; motivo?: string",
        nome
    )

    texto = substituir(
        texto,
        "(dados.reativados??0).toLocaleString",
        "(dados.detectados??0).toLocaleString",
        nome
    )

    texto = substituir(
        texto,
        ">Clientes reativados</div>",
        ">Reativações detectadas</div>",
        nome
    )

    texto = substituir(
        texto,
        "Desde a base de 27/10/2026 · detecção provisória",
        "Pedidos desde 09/11/2026 · aguardando homologação",
        nome
    )

    a[nome] = texto

    # ====================================================
    # API CAMPANHA
    # ====================================================

    nome = arquivos[1]
    texto = a[nome]

    inicio = texto.find(
        "    // A campanha registra reativacoes detectadas"
    )

    fim = texto.find(
        "    // Metas do arquivo META REATIVICAO:",
        inicio
    )

    if inicio < 0 or fim <= inicio:
        raise RuntimeError(
            "Bloco da campanha nao localizado com seguranca."
        )

    bloco = """
    // Eventos de pedidos detectados. Nao sao pontos homologados.
    type Reat = {
      codigo_cliente: string;
      codigo_representante: string;
      codigo_supervisor: string;
      confirmado: boolean;
    };

    const eventos: Reat[] = [];

    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data: lote, error: erroReat } = await supabase
        .from("kidy_reativacao_eventos")
        .select("codigo_cliente,codigo_representante,codigo_supervisor,confirmado")
        .eq("competencia", competencia)
        .order("codigo_cliente")
        .order("codigo_representante")
        .range(offset, offset + 999);

      if (erroReat) throw new Error(
        `Eventos de reativacao: ${erroReat.message}`
      );

      eventos.push(...((lote ?? []) as Reat[]));

      if ((lote ?? []).length < 1000) break;
      if (offset >= 19000) throw Error("Limite de eventos atingido");
    }

    const consultaNacional =
      permitidos === null &&
      regionais === null &&
      !representante &&
      !supervisor;

    const aptos = eventos.filter(e => {
      const rep = normalizarRepresentante(
        cod(e.codigo_representante), mapaOficial
      ).codigo;

      if (consultaNacional) return true;

      const oficial = oficiais.get(rep);
      if (!oficial) return false;

      const supAtual = cod(oficial.codigo_supervisor);

      return (!representante || representante === rep) &&
        (!supervisor || supervisor === supAtual) &&
        (permitidos === null || permitidos.includes(rep)) &&
        (regionais === null || regionais.has(supAtual));
    });

    const clientesDetectados = new Set(
      aptos.map(e => cod(e.codigo_cliente))
    ).size;

"""

    texto = texto[:inicio] + bloco + texto[fim:]

    texto = substituir(
        texto,
        "realizadoPares:aptos.length,realizadoValor:0,",
        "realizadoPares:clientesDetectados,realizadoValor:0,",
        nome
    )

    texto = substituir(
        texto,
        "100 * aptos.length / metaReativacao",
        "100 * clientesDetectados / metaReativacao",
        nome
    )

    a[nome] = texto

    # ====================================================
    # TELA DE DETALHAMENTO DOS CLIENTES
    # ====================================================

    nome = arquivos[4]
    texto = a[nome]

    ancora = '  return <div className="app-shell">'

    blocoDetalhes = """
  // Compras detectadas na campanha de novembro/2026.
  type EventoDetectado = {
    codigo_cliente: string;
    codigo_representante: string;
    codigo_supervisor: string;
    data_compra: string;
    numero_pedido: string;
    confirmado: boolean;
  };

  const eventosDetectados: EventoDetectado[] = [];

  for (let offset = 0; offset < 20000; offset += 1000) {
    const {data, error} = await supabase
      .from("kidy_reativacao_eventos")
      .select("codigo_cliente,codigo_representante,codigo_supervisor,data_compra,numero_pedido,confirmado")
      .eq("competencia", "2026-11-01")
      .order("codigo_cliente")
      .order("codigo_representante")
      .range(offset, offset + 999);

    if (error) throw Error("Falha ao consultar eventos da campanha");

    eventosDetectados.push(...((data ?? []) as EventoDetectado[]));

    if ((data ?? []).length < 1000) break;
    if (offset >= 19000) throw Error("Limite de eventos atingido");
  }

  const detectadosVisiveis = eventosDetectados.filter(e => {
    const r = codigo(e.codigo_representante);
    const s = codigo(e.codigo_supervisor);

    return (permitidos === null || permitidos.includes(r)) &&
      (regionais === null || regionais.has(s)) &&
      (!rep || rep === r) &&
      (!sup || sup === s) &&
      (!grupo.length || grupo.includes(s));
  });

"""

    texto = substituir(
        texto, ancora, blocoDetalhes + ancora, nome
    )

    ancora = '<p style={{color:"#64748b",fontSize:13}}>Base histórica de 27/10/2026'

    painel = """
        <section style={{
          background:"#fff",
          border:"1px solid #e2e8f0",
          borderRadius:12,
          padding:18,
          marginTop:16,
          marginBottom:20
        }}>
          <h2 style={{fontSize:18,marginBottom:8}}>
            Pedidos detectados — Novembro/2026
          </h2>
          <p style={{fontSize:13,color:"#64748b"}}>
            {detectadosVisiveis.length} clientes com pedidos.
            Registros preliminares; não representam homologação.
          </p>
          <div style={{overflowX:"auto"}}>
            <table style={{
              width:"100%",
              borderCollapse:"collapse",
              fontSize:13
            }}>
              <thead>
                <tr>
                  {[
                    "Cliente",
                    "Pedido",
                    "Data da compra",
                    "Representante",
                    "Supervisor",
                    "Situação"
                  ].map(coluna =>
                    <th key={coluna} style={{
                      textAlign:"left",
                      padding:10,
                      borderBottom:"1px solid #e2e8f0"
                    }}>{coluna}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {detectadosVisiveis.map(e =>
                  <tr key={`${e.codigo_cliente}-${e.codigo_representante}`}>
                    <td style={{padding:10}}>{e.codigo_cliente}</td>
                    <td style={{padding:10}}>{e.numero_pedido}</td>
                    <td style={{padding:10}}>{exibirData(e.data_compra)}</td>
                    <td style={{padding:10}}>{e.codigo_representante}</td>
                    <td style={{padding:10}}>{e.codigo_supervisor}</td>
                    <td style={{padding:10}}>
                      {e.confirmado
                        ? "Confirmação registrada; verificar competência"
                        : "Aguardando homologação"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        """

    texto = substituir(
        texto, ancora, painel + ancora, nome
    )

    a[nome] = texto

    # ====================================================
    # BACKUP E APLICACAO
    # ====================================================

    backup.mkdir(parents=True, exist_ok=False)

    for nome, conteudo in originais.items():
        destino = backup / nome
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(conteudo, encoding="utf-8")

    for nome, conteudo in a.items():
        (ROOT / nome).write_text(conteudo, encoding="utf-8")

    print("CORRECOES APLICADAS LOCALMENTE")
    print("BACKUP:", backup)

    # Validacao de sintaxe e tipos.
    resultado = subprocess.run(
        ["npx.cmd", "tsc", "--noEmit"],
        cwd=ROOT,
        shell=False
    )

    if resultado.returncode != 0:
        raise RuntimeError("Falha na validacao TypeScript.")

    print("TYPESCRIPT VALIDADO")
    print("SEM COMMIT, SEM PUSH, SEM DEPLOY")

except Exception as erro:
    print("ERRO:", erro, file=sys.stderr)

    if backup.exists():
        for nome in arquivos:
            origem = backup / nome

            if origem.exists():
                shutil.copy2(origem, ROOT / nome)

        print("ARQUIVOS RESTAURADOS DO BACKUP")

    sys.exit(1)
