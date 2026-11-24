import "server-only";

import type { ClienteCarteira } from "./carteira-2027-data";
import {
  carregarMapaRepresentantes,
  supervisorOficial,
} from "./representantes-oficiais";

type ResultadoCarteira = {
  clientes: ClienteCarteira[];
  resumo: Record<string, unknown>;
};

const REPRESENTANTE_DESTINO = "41";

const CLIENTES_CARIOCA_CONFIRMADOS = new Set([
  "9964",
  "17738",
  "18591",
  "912018",
  "86090",
  "3560",
  "909044",
  "12234",
  "94175",
  "94176",
  "903197",
  "906171",
  "912019",
  "78396",
  "78397",
  "94177",
  "2567",
  "3565",
  "9965",
]);

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function codigo(valor: unknown): string {
  return String(valor ?? "").trim().replace(/\.0+$/, "");
}

function pertenceAoCarioca(cliente: ClienteCarteira): boolean {
  return (
    normalizar(cliente.grupoCliente) === "CARIOCA" ||
    CLIENTES_CARIOCA_CONFIRMADOS.has(codigo(cliente.codigoCliente))
  );
}

export async function aplicarRegraGrupoCarioca(
  resultado: ResultadoCarteira
): Promise<ResultadoCarteira> {

  const quantidade = resultado.clientes.filter(
    pertenceAoCarioca
  ).length;

  if (quantidade === 0) {
    return resultado;
  }

  const mapa = await carregarMapaRepresentantes();
  const cadastro = mapa.cadastro.get(REPRESENTANTE_DESTINO);

  if (!cadastro || !cadastro.ativo) {
    throw new Error(
      "Regra Carioca: representante 41 inexistente ou inativo."
    );
  }

  const codigoSupervisor =
    cadastro.codigo_supervisor ||
    supervisorOficial(cadastro.regional);

  if (!codigoSupervisor) {
    throw new Error(
      "Regra Carioca: supervisor oficial do representante 41 nao identificado."
    );
  }

  const representante = {
    codigo: REPRESENTANTE_DESTINO,
    nome: cadastro.nome_rep || "R.C.ROTHEMBERGER REPRES. LTDA",
  };

  const supervisor = {
    codigo: codigoSupervisor,
    nome: cadastro.regional || codigoSupervisor,
  };

  const clientes = resultado.clientes.map(cliente => {
    if (!pertenceAoCarioca(cliente)) {
      return cliente;
    }

    return {
      ...cliente,

      // Vinculo comercial exclusivo com representante 41.
      representantes: [{ ...representante }],
      representanteAtual: [{ ...representante }],
      demaisRepresentantes: [],

      // Regional do representante 41.
      supervisores: [{ ...supervisor }],

      // Remove indicador de multiplos representantes.
      flags: (cliente.flags ?? []).filter(
        flag => flag !== "MULTIPLOS_REPRESENTANTES"
      ),
    };
  });

  console.info(
    `[CARTEIRA 2027] Grupo Carioca: ${quantidade} clientes atribuidos ao representante 41.`
  );

  return {
    ...resultado,
    clientes,
  };
}