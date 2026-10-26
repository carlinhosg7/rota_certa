const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");
const drive = require("./src/lib/google-drive-data.cjs");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error("Credenciais do Supabase nÃ£o encontradas");
}

const supabase = createClient(url, key);

const cod = x => String(x ?? "").trim().replace(/\.0+$/, "");
const num = x => Number(x) || 0;

(async () => {
  const [cadResp, deParaResp] = await Promise.all([
    supabase.from("representantes_cadastro")
      .select("codigo_rep,nome_rep,codigo_supervisor,regional"),
    supabase.from("representantes_de_para")
      .select("codigo_antigo,codigo_atual")
  ]);

  if (cadResp.error) throw cadResp.error;
  if (deParaResp.error) throw deParaResp.error;

  const cadastro = new Map(
    cadResp.data.map(r => [cod(r.codigo_rep), r])
  );

  const dePara = new Map(
    deParaResp.data.map(r => [
      cod(r.codigo_antigo),
      cod(r.codigo_atual)
    ])
  );

  function oficial(codigo) {
    const c = cod(codigo);
    return cadastro.has(c) ? c : dePara.get(c) || c;
  }

  const arquivos = await drive.listarArquivos();

  async function ler(nome, aba) {
    const arquivo = arquivos.find(a => a.nome === nome);
    if (!arquivo) throw new Error("Arquivo ausente: " + nome);

    const buffer = await drive.baixarArquivo(arquivo);
    const wb = XLSX.read(buffer, { type: "buffer" });

    return XLSX.utils.sheet_to_json(wb.Sheets[aba], {
      header: 1,
      defval: null
    });
  }

  const [metas, realizados] = await Promise.all([
    ler("META FATURAMENTO.xlsx", "Mes Atual_MAIO_23"),
    ler("INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx", "MES")
  ]);

  const metasOutubro = metas.slice(1)
    .filter(r =>
      num(r[5]) === 2026 &&
      num(r[6]) === 10 &&
      num(r[7]) === 1 &&
      r[9] === "ENTREGA_PEDIDO" &&
      String(r[12] ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() === "NAO"
    )
    .map(r => ({
      original: cod(r[2]),
      oficial: oficial(r[2]),
      nome: r[3],
      pares: num(r[8]),
      valor: num(r[10])
    }));

  const realizadosOutubro = realizados
    .filter(r => /^\d+$/.test(cod(r[0])))
    .map(r => ({
      original: cod(r[0]),
      oficial: oficial(r[0]),
      nome: r[1],
      supervisor: cod(r[2]),
      pares: num(r[10]),
      valor: num(r[4]),
      metaParesFonte: num(r[9]),
      metaValorFonte: num(r[3])
    }));

  const supervisores = new Set(["9902", "9914"]);

  const metasEscopo = metasOutubro.filter(r => {
    const cadastroRep = cadastro.get(r.oficial);
    return cadastroRep &&
      supervisores.has(cod(cadastroRep.codigo_supervisor));
  });

  const agrupamento = linhas => {
    const mapa = new Map();

    for (const r of linhas) {
      const atual = mapa.get(r.oficial) || {
        codigo: r.oficial,
        originais: new Set(),
        linhas: 0,
        pares: 0,
        valor: 0
      };

      atual.originais.add(r.original);
      atual.linhas++;
      atual.pares += r.pares;
      atual.valor += r.valor;
      mapa.set(r.oficial, atual);
    }

    return mapa;
  };

  const gm = agrupamento(metasEscopo);
  const gr = agrupamento(realizadosOutubro);

  const todos = [...new Set([...gm.keys(), ...gr.keys()])]
    .sort((a, b) => Number(a) - Number(b));

  console.log("\n=== AUDITORIA FATURAMENTO OUTUBRO 2026 ===");
  console.log("Escopo metas: supervisores 9902 e 9914");
  console.log("Linhas de meta:", metasEscopo.length);
  console.log("Representantes com meta:", gm.size);
  console.log("Linhas realizado:", realizadosOutubro.length);
  console.log("Representantes realizado:", gr.size);

  console.log("\nCODIGO | ORIGINAIS META | ORIGINAIS REALIZADO | META PARES | REAL PARES | META R$ | REAL R$");

  for (const c of todos) {
    const m = gm.get(c);
    const r = gr.get(c);

    console.log([
      c,
      m ? [...m.originais].join(",") : "-",
      r ? [...r.originais].join(",") : "-",
      (m?.pares || 0).toFixed(2),
      (r?.pares || 0).toFixed(2),
      (m?.valor || 0).toFixed(2),
      (r?.valor || 0).toFixed(2)
    ].join(" | "));
  }

  console.log("\n=== MULTIPLOS CODIGOS ORIGINAIS NO MESMO REPRESENTANTE ===");

  for (const [c, r] of gr) {
    if (r.originais.size > 1) {
      console.log(
        "REALIZADO", c,
        "ORIGINAIS:", [...r.originais].join(","),
        "LINHAS:", r.linhas
      );
    }
  }

  console.log("\n=== TOTALIZACAO ===");

  const soma = mapa => [...mapa.values()].reduce(
    (s, r) => ({
      pares: s.pares + r.pares,
      valor: s.valor + r.valor
    }),
    { pares: 0, valor: 0 }
  );

  console.log("META:", soma(gm));
  console.log("REALIZADO:", soma(gr));

  console.log("\n=== META DO PROPRIO RELATORIO DE FATURAMENTO ===");
  console.log({
    pares: realizadosOutubro.reduce(
      (s, r) => s + r.metaParesFonte, 0
    ),
    valor: realizadosOutubro.reduce(
      (s, r) => s + r.metaValorFonte, 0
    )
  });


  console.log("\n=== DIFERENCA DE META POR REPRESENTANTE ===");

  const metasRelatorio = new Map();

  for (const r of realizadosOutubro) {
    const atual = metasRelatorio.get(r.oficial) || {
      pares: 0,
      valor: 0
    };

    atual.pares += r.metaParesFonte;
    atual.valor += r.metaValorFonte;

    metasRelatorio.set(r.oficial, atual);
  }

  for (const c of todos) {
    const metaExcel = gm.get(c);
    const metaRelatorio = metasRelatorio.get(c);

    const valorExcel = metaExcel?.valor || 0;
    const valorRelatorio = metaRelatorio?.valor || 0;
    const diferenca = valorExcel - valorRelatorio;

    if (Math.abs(diferenca) > 0.01) {
      console.log([
        "REP:", c,
        "META EXCEL:", valorExcel.toFixed(2),
        "META RELATORIO:", valorRelatorio.toFixed(2),
        "DIFERENCA:", diferenca.toFixed(2)
      ].join(" | "));
    }
  }

})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
