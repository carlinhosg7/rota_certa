"use client";

import { useState } from "react";

export default function ExportarCliente360PDF({ codigoCliente }: { codigoCliente: string }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  async function gerar() {
    if (gerando) return;
    setGerando(true);
    setErro("");
    try {
      const raiz = document.querySelector("main");
      if (!raiz) throw new Error("ConteÃºdo principal do Cliente 360 nÃ£o encontrado.");
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(raiz as HTMLElement, {
        backgroundColor: "#fffdf9",
        useCORS: true,
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        windowWidth: Math.max(document.documentElement.scrollWidth, raiz.scrollWidth),
        windowHeight: Math.max(document.documentElement.scrollHeight, raiz.scrollHeight),
        ignoreElements: (element) => element instanceof HTMLElement &&
          Boolean(element.closest('[data-ignorar-no-pdf="true"]')),
      });
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error("NÃ£o foi possÃ­vel capturar o Cliente 360.");
      }

      const larguraMM = 210;
      const alturaMM = larguraMM * canvas.height / canvas.width;
      // Limite pratico de uma pagina no PDF: 14.400 pontos (~5080 mm).
      if (alturaMM > 5000) {
        throw new Error("O conteÃºdo excedeu o tamanho mÃ¡ximo de uma pÃ¡gina PDF. Reduza o zoom ou o conteÃºdo exibido.");
      }
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [larguraMM, alturaMM],
        compress: true,
      });
      const imagem = canvas.toDataURL("image/jpeg", 0.88);
      pdf.addImage(imagem, "JPEG", 0, 0, larguraMM, alturaMM);
      pdf.save(`KIDY_CLIENTE_360_${codigoCliente}.pdf`);
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Erro ao gerar o PDF.";
      setErro(mensagem);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div data-ignorar-no-pdf="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, margin: "28px 0 35px" }}>
      <button type="button" onClick={gerar} disabled={gerando} style={{
        padding: "14px 26px", border: 0, borderRadius: 12,
        background: "#f57c00", color: "white", fontWeight: 800,
        fontSize: 15, cursor: gerando ? "wait" : "pointer",
      }}>
Gerar PDF do Cliente 360 - 1 página
      </button>
      {erro && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{erro}</p>}
    </div>
  );
}