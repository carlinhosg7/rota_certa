from pathlib import Path
from datetime import datetime
import subprocess
import shutil
import sys

ROOT = Path(r"D:\KIDY_AJUSTES_LOTE_20261119")

API = Path("src/app/api/campanha/route.ts")
UI = Path("src/app/campanha/CampanhaClient.tsx")

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = ROOT / ("_backup_pontos_reativacao_" + stamp)

arquivos = [API, UI]
originais = {}

def trocar(texto, antigo, novo, descricao):
    ocorrencias = texto.count(antigo)
    if ocorrencias != 1:
        raise RuntimeError(
            f"{descricao}: esperado 1 trecho, encontrado {ocorrencias}"
        )
    return texto.replace(antigo, novo, 1)

def executar(args):
    resultado = subprocess.run(args, cwd=ROOT)
    if resultado.returncode != 0:
        raise RuntimeError(
            f"Falha na validacao: {' '.join(args)}"
        )

try:
    for relativo in arquivos:
        caminho = ROOT / relativo
        if not caminho.is_file():
            raise RuntimeError(f"Arquivo ausente: {caminho}")
        originais[relativo] = caminho.read_text(encoding="utf-8")

    alterados = dict(originais)

    # ==================================================
    # 1. API: METAS DE TODOS OS MESES
    # ==================================================
    texto = alterados[API]

    inicio = texto.find("    const codigosVisiveis = new Set(")
    fim = texto.find("    const metasPorRepresentante", inicio)

    if inicio < 0 or fim <= inicio:
        raise RuntimeError(
            "Bloco de visibilidade das metas nao encontrado. "
            "Confirme se a API ja consulta as metas oficiais."
        )

    bloco = '''
    // Metas independentes dos realizados comerciais.
    // Assim, os seis meses aparecem mesmo sem pedidos.
    const codigosVisiveis = new Set(
      cadastroVisivel
        .filter(r =>
          (!representante ||
            cod(r.codigo_rep) === representante) &&
          (!supervisor ||
            cod(r.codigo_supervisor) === supervisor)
        )
        .map(r => cod(r.codigo_rep))
        .filter(Boolean)
    );

'''

    texto = texto[:inicio] + bloco + texto[fim:]

    # ==================================================
    # 2. API: PONTUACAO POR REPRESENTANTE
    # ==================================================

    marcador = '    indicadores.push({\n      chave:"REATIVACAO"'

    if texto.count(marcador) != 1:
        raise RuntimeError(
            "Bloco do indicador REATIVACAO nao encontrado."
        )

    calculo = '''
    // Uma reativacao por codigo de cliente e representante.
    // Os pedidos repetidos nao multiplicam pontos.
    const clientesPorRep = new Map<string, Set<string>>();
    const clientesConfirmadosPorRep = new Map<string, Set<string>>();

    for (const evento of aptos) {
      const rep = normalizarRepresentante(
        cod(evento.codigo_representante),
        mapaOficial
      ).codigo;

      if (!metasPorRepresentante.has(rep)) continue;

      if (!clientesPorRep.has(rep)) {
        clientesPorRep.set(rep, new Set<string>());
      }

      clientesPorRep.get(rep)!.add(
        cod(evento.codigo_cliente)
      );

      if (evento.confirmado) {
        if (!clientesConfirmadosPorRep.has(rep)) {
          clientesConfirmadosPorRep.set(rep, new Set<string>());
        }
        clientesConfirmadosPorRep.get(rep)!.add(
          cod(evento.codigo_cliente)
        );
      }
    }

    // 100% da meta = 30 pontos. Abaixo = zero.
    // Nunca conceder pontos fracionados.
    const pontosProjetadosReativacao =
      [...metasPorRepresentante.entries()].reduce(
        (total, [rep, meta]) => {
          const quantidade = clientesPorRep.get(rep)?.size ?? 0;
          return total + (
            meta > 0 && quantidade >= meta ? 30 : 0
          );
        },
        0
      );

    // Pontuacao oficial somente com eventos confirmados
    // e competencia validada.
    const { data: validacaoMes, error: erroValidacao } =
      await supabase
        .from("kidy_reativacao_competencias")
        .select("status")
        .eq("competencia", competencia)
        .maybeSingle();

    if (erroValidacao) {
      throw new Error(erroValidacao.message);
    }

    const competenciaHomologada =
      String(validacaoMes?.status ?? "").toUpperCase() ===
      "VALIDADO";

    const pontosHomologadosReativacao =
      competenciaHomologada
        ? [...metasPorRepresentante.entries()].reduce(
            (total, [rep, meta]) => {
              const quantidade =
                clientesConfirmadosPorRep.get(rep)?.size ?? 0;
              return total + (
                meta > 0 && quantidade >= meta ? 30 : 0
              );
            },
            0
          )
        : 0;

'''

    texto = trocar(
        texto, marcador,
        calculo + marcador,
        "Insercao da regra de pontos"
    )

    # Acrescentar informacoes ao indicador, preservando os
    # campos existentes utilizados pelas outras telas.
    antigo = (
        'status:"DETECTADO_NAO_HOMOLOGADO",pontosConcedidos:0,'
    )

    novo = (
        'status:"DETECTADO_NAO_HOMOLOGADO",'
        'pontosConcedidos:pontosHomologadosReativacao,'
        'pontosProjetados:pontosProjetadosReativacao,'
    )

    texto = trocar(
        texto, antigo, novo,
        "Pontuacao do indicador REATIVACAO"
    )

    # Compatibilidade da tipagem dos indicadores da campanha.
    # Preserva a pontuacao original das demais modalidades.
    texto = trocar(
        texto,
        "return {\n        ...indicador,",
        "return {\n        ...indicador,\n        pontosProjetados: 0,",
        "Tipagem dos indicadores comerciais"
    )

    texto = trocar(
        texto,
        "pontosConcedidos: pontosTreinamentos,",
        "pontosConcedidos: pontosTreinamentos,\n      pontosProjetados: 0,",
        "Tipagem do indicador de treinamentos"
    )

    alterados[API] = texto

    # ==================================================
    # 3. PAINEL: INCLUIR PONTOS CONQUISTADOS
    # ==================================================
    texto = alterados[UI]

    texto = trocar(
        texto,
        'status: string; pontosConcedidos: number;',
        'status: string; pontosConcedidos: number; pontosProjetados?: number;',
        "Tipo do indicador"
    )

    inicio = texto.find("  const situacaoMes = (chave: string) => {")
    fim = texto.find("  const geralHomologado", inicio)

    if inicio < 0 or fim <= inicio:
        raise RuntimeError("Calculo mensal nao encontrado.")

    parte = texto[inicio:fim]

    marcadorRetorno = "    return {"

    posicao = parte.rfind(marcadorRetorno)

    if posicao < 0:
        raise RuntimeError("Retorno da pontuacao mensal nao encontrado.")

    adicao = '''
    // Incluir os 30 pontos conquistados ao atingir
    // a meta individual de reativacao.
    // Enquanto nao homologados, fazem parte da previa.
    const reativacao = resposta.indicadores.find(
      i => i.chave === "REATIVACAO"
    );

    const pontosReativacao =
      reativacao?.pontosProjetados ?? 0;

    if (pontosReativacao > 0) {
      possuiDados = true;
      soma += pontosReativacao;
    }

'''

    parte = parte[:posicao] + adicao + parte[posicao:]
    texto = texto[:inicio] + parte + texto[fim:]

    texto = trocar(
        texto,
        'tipo.chave === "REATIVACAO" ? "Reativados" : "Homologados"',
        'tipo.chave === "REATIVACAO" ? "Detectados" : "Homologados"',
        "Rotulo de reativacoes"
    )

    texto = trocar(
        texto,
        '"Reativações detectadas na Carteira 02 → 01 · pontos não homologados"',
        '`Pontos conquistados: ${qtd.format(i.pontosProjetados ?? 0)} · homologados: ${qtd.format(i.pontosConcedidos)} · ${i.status === "DETECTADO_NAO_HOMOLOGADO" ? "validação pendente" : i.status}`',
        "Pontos do indicador"
    )

    texto = trocar(
        texto,
        '"Histórico preservado · pontos não homologados"',
        '`Pontos conquistados: ${qtd.format(registros.reduce((s, x) => s + (x?.pontosProjetados ?? 0), 0))} · homologados: ${qtd.format(pontosTotal)}`',
        "Total de pontos de reativacao"
    )

    alterados[UI] = texto

    # ==================================================
    # 4. BACKUP E VALIDACAO
    # ==================================================
    backup.mkdir(parents=True, exist_ok=False)

    for relativo, conteudo in originais.items():
        destino = backup / relativo
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(conteudo, encoding="utf-8")

    for relativo, conteudo in alterados.items():
        (ROOT / relativo).write_text(conteudo, encoding="utf-8")

    print("AJUSTES APLICADOS LOCALMENTE")
    print("BACKUP:", backup)

    executar(["npx.cmd", "next", "typegen"])
    executar(["npx.cmd", "tsc", "--noEmit"])
    executar([
        "git", "diff", "--check", "--",
        API.as_posix(),
        UI.as_posix()
    ])

    print()
    print("VALIDACOES APROVADAS")
    print("METAS OFICIAIS: SUPABASE")
    print("PONTOS: 100% DA META = 30; ABAIXO = 0")
    print("TODOS OS SEIS MESES HABILITADOS")
    print("SEM COMMIT - SEM PUSH - SEM DEPLOY")

except Exception as erro:
    print("ERRO:", erro, file=sys.stderr)

    if backup.exists():
        for relativo in arquivos:
            origem = backup / relativo
            if origem.exists():
                shutil.copy2(origem, ROOT / relativo)

        print("ARQUIVOS RESTAURADOS DO BACKUP")

    sys.exit(1)