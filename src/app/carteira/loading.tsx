import KidyLoading from "@/components/KidyLoading";

export default function Loading() {
  return (
    <KidyLoading
      mensagem="Carregando Gestão de Carteira..."
      detalhe="Consultando as informações. Aguarde..."
    />
  );
}