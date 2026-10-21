import KidyLoading from "@/components/KidyLoading";

export default function Loading() {
  return (
    <KidyLoading
      mensagem="Carregando Metas..."
      detalhe="Consultando as informações. Aguarde..."
    />
  );
}