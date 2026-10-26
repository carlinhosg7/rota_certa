const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const FONTE =
  "I:\\Meu Drive\\DADOS_SALES_INT\\DADOS PRETIVIA CLIENTES.xlsx";

const DESTINO = path.join(
  process.cwd(),
  "dados-processados",
  "carteira-2027"
);

const REFERENCIA = "2026-10-21";

fs.mkdirSync(DESTINO, { recursive: true });

function txt(v) {
  return v == null ? "" : String(v).trim();
}

function codigo(v) {
  return txt(v).replace(/\.0$/, "");
}

function numero(v) {
  if (typeof v === "number") return v;
  const s = txt(v).replace(/[R$\s]/g, "");
  if (!s) return 0;

  const normalizado = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s;

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

function data(v) {
  if (!v && v !== 0) return null;

  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return [
      d.y,
      String(d.m).padStart(2, "0"),
      String(d.d).padStart(2, "0")
    ].join("-");
  }

  const s = txt(v);

  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  }

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  }

  return null;
}

function mesesEntre(inicio, fim) {
  const [ai, mi, di] = inicio.split("-").map(Number);
  const [af, mf, df] = fim.split("-").map(Number);

  let meses = (af - ai) * 12 + (mf - mi);

  if (df < di) meses--;

  return Math.max(0, meses);
}

function corte24Meses(referencia) {
  const [ano, mes, dia] = referencia.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 - 24, 1));
  const ultimoDia = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth() + 1, 0
  )).getUTCDate();

  d.setUTCDate(Math.min(dia, ultimoDia));
  return d.toISOString().slice(0, 10);
}

function classificar(ultima, referencia, corte) {
  if (!ultima || ultima > referencia) {
    return {
      carteira: "02_REATIVACAO",
      situacao: "PENDENTE_QUALIFICACAO",
      faixa: "SEM_HISTORICO_VALIDADO",
      mesesSemCompra: null
    };
  }

  const meses = mesesEntre(ultima, referencia);

  if (ultima >= corte) {
    return {
      carteira: "01_ATIVA",
      situacao: "ATIVA",
      faixa: "ATE_24_MESES",
      mesesSemCompra: meses
    };
  }

  let faixa = "ACIMA_60_MESES";

  if (meses <= 36) faixa = "25_A_36_MESES";
  else if (meses <= 60) faixa = "37_A_60_MESES";

  return {
    carteira: "02_REATIVACAO",
    situacao: "REATIVACAO",
    faixa,
    mesesSemCompra: meses
  };
}

function sim(v) {
  return ["SIM", "S", "TRUE", "1"].includes(txt(v).toUpperCase());
}

function bloqueado(v) {
  const s = txt(v).toUpperCase();
  return ["SIM", "S", "TRUE", "1", "BLOQUEADO"].includes(s);
}

function executar() {
  if (!fs.existsSync(FONTE)) {
    throw new Error("Cadastro não encontrado: " + FONTE);
  }

  const wb = XLSX.readFile(FONTE);
  const ws = wb.Sheets[wb.SheetNames[0]];

  const matriz = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: ""
  });

  const indice = matriz.findIndex(linha =>
    linha.some(v => txt(v).toLowerCase() === "codigo cliente") &&
    linha.some(v => txt(v).toLowerCase() === "grupo cliente")
  );

  if (indice < 0) {
    throw new Error("Cabeçalho do cadastro não localizado");
  }

  const cabecalho = matriz[indice].map(txt);

  const registros = matriz.slice(indice + 1)
    .filter(linha => linha.some(v => txt(v) !== ""))
    .map(linha => Object.fromEntries(
      cabecalho.map((campo, i) => [campo, linha[i] ?? ""])
    ));

  const clientes = new Map();

  for (const r of registros) {
    const id = codigo(r["Codigo Cliente"]);
    if (!id) continue;

    const ultima = data(r["Data Ultima Compra"]);
    const grupo = txt(r["Grupo Cliente"]);
    const rep = codigo(r["Codigo Representante"]);
    const supervisor = codigo(r["Codigo Supervisor"]);

    if (!clientes.has(id)) {
      clientes.set(id, {
        codigoCliente: id,
        razaoSocial: txt(r["Razao Social Empresa"]),
        cnpj: txt(r["Cnpj"]),
        grupoCliente: grupo,
        codigoGrupoCliente: codigo(r["Codigo Grupo Cliente"]),
        ultimaCompra: null,
        representantes: new Map(),
        supervisores: new Map(),
        bloqueadoFinanceiro: false,
        limiteDisponivel: 0,
        clienteAtivoCadastro: null,
        cadastroDivergente: false
      });
    }

    const c = clientes.get(id);

    if (ultima && (!c.ultimaCompra || ultima > c.ultimaCompra)) {
      c.ultimaCompra = ultima;
    }

    if (rep) {
      c.representantes.set(
        rep,
        txt(r["Representante"])
      );
    }

    if (supervisor) {
      c.supervisores.set(
        supervisor,
        txt(r["Supervisor"])
      );
    }

    if (grupo && c.grupoCliente &&
        grupo.toUpperCase() !== c.grupoCliente.toUpperCase()) {
      c.cadastroDivergente = true;
    }

    c.bloqueadoFinanceiro ||= bloqueado(
      r["Bloqueado Financeiro"]
    );

    c.limiteDisponivel = Math.max(
      c.limiteDisponivel,
      numero(r["Limite Disponivel"])
    );

    if (txt(r["Cliente Ativo"])) {
      c.clienteAtivoCadastro = sim(r["Cliente Ativo"]);
    }
  }

  const corte = corte24Meses(REFERENCIA);
  const saida = [];

  for (const c of clientes.values()) {
    const status = classificar(
      c.ultimaCompra,
      REFERENCIA,
      corte
    );

    const flags = [];

    if (c.bloqueadoFinanceiro) {
      flags.push("BLOQUEIO_FINANCEIRO");
    }

    if (c.limiteDisponivel > 0) {
      flags.push("LIMITE_DISPONIVEL");
    }

    if (c.cadastroDivergente) {
      flags.push("CADASTRO_A_VALIDAR");
    }

    if (c.representantes.size === 0) {
      flags.push("SEM_REPRESENTANTE");
    }

    if (c.representantes.size > 1) {
      flags.push("MULTIPLOS_REPRESENTANTES");
    }

    saida.push({
      codigoCliente: c.codigoCliente,
      razaoSocial: c.razaoSocial,
      cnpj: c.cnpj,
      grupoCliente: c.grupoCliente,
      codigoGrupoCliente: c.codigoGrupoCliente,
      ultimaCompra: c.ultimaCompra,
      ...status,
      representantes: [...c.representantes].map(
        ([codigo, nome]) => ({ codigo, nome })
      ),
      supervisores: [...c.supervisores].map(
        ([codigo, nome]) => ({ codigo, nome })
      ),
      bloqueadoFinanceiro: c.bloqueadoFinanceiro,
      limiteDisponivel: c.limiteDisponivel,
      clienteAtivoCadastro: c.clienteAtivoCadastro,
      situacaoEmpresa: "NAO_VERIFICADA",
      compraFaturadaConfirmada: false,
      classificacaoProvisoria: true,
      flags,
      acompanhamento: {
        status: "NAO_INICIADO",
        potencial: "NAO_AVALIADO",
        ultimaColecao: null,
        ultimoContato: null,
        motivoNaoCompra: null,
        proximaAcao: null,
        prazo: null,
        responsavel: null,
        resultado: null
      }
    });
  }

  const resumo = {
    referencia: REFERENCIA,
    corte24Meses: corte,
    fonte: FONTE,
    totalClientes: saida.length,
    gruposDistintos: new Set(
      saida.map(c => c.grupoCliente.trim().toUpperCase())
        .filter(Boolean)
    ).size,
    ativa: saida.filter(
      c => c.situacao === "ATIVA"
    ).length,
    reativacao: saida.filter(
      c => c.situacao === "REATIVACAO"
    ).length,
    pendenteQualificacao: saida.filter(
      c => c.situacao === "PENDENTE_QUALIFICACAO"
    ).length,
    faixas: {
      meses25a36: saida.filter(
        c => c.faixa === "25_A_36_MESES"
      ).length,
      meses37a60: saida.filter(
        c => c.faixa === "37_A_60_MESES"
      ).length,
      acima60: saida.filter(
        c => c.faixa === "ACIMA_60_MESES"
      ).length
    },
    bloqueados: saida.filter(
      c => c.bloqueadoFinanceiro
    ).length,
    comLimiteDisponivel: saida.filter(
      c => c.limiteDisponivel > 0
    ).length,
    multiplosRepresentantes: saida.filter(
      c => c.representantes.length > 1
    ).length,
    cadastroDivergente: saida.filter(
      c => c.cadastroDivergente
    ).length,
    statusValidacao: "PROVISORIO_SEM_CONFIRMACAO_FATURAMENTO"
  };

  fs.writeFileSync(
    path.join(DESTINO, "clientes.json"),
    JSON.stringify(saida, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    path.join(DESTINO, "resumo.json"),
    JSON.stringify(resumo, null, 2),
    "utf8"
  );

  console.log("\n=== CARTEIRA KIDY 2027 ===");
  console.log(JSON.stringify(resumo, null, 2));
  console.log("\nArquivos gerados em:", DESTINO);
  console.log("\nATENCAO: classificação provisória.");
  console.log("Compra faturada ainda não confirmada.");
}

try {
  executar();
} catch (erro) {
  console.error(erro.stack || erro.message);
  process.exitCode = 1;
}
