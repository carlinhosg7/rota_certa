import KidyLoading from "@/components/KidyLoading";

export default function Loading() {
  return (
    <KidyLoading
      mensagem="Carregando informações..."
      detalhe="Consultando as informações. Aguarde..."
    />
  );
}