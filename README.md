# Gostodumatu

**Sabores artesanais de Jardim, Mato Grosso do Sul, direto de quem produz.**

A [Gostodumatu](https://www.gostodumatu.com.br/) reúne produtores locais e seus produtos em uma vitrine online. O site apresenta as histórias de quem faz, permite explorar o catálogo e oferece uma jornada de compra com conta do cliente, carrinho, frete e pagamento.

## O que você encontra no site

- Catálogo de produtos artesanais, como doces, geleias, mel e outras delícias da região.
- Páginas dos produtores com suas histórias e produtos.
- Lista de favoritos e carrinho de compras.
- Cadastro e acesso por e-mail ou Google, endereços e histórico de pedidos.
- Checkout com frete por produtor e pagamento por Pix ou cartão.

O projeto nasceu em **Jardim/MS** para aproximar quem produz de quem valoriza o sabor da roça e o trabalho artesanal.

## Tecnologias

O frontend usa **React**, **TypeScript** e **Vite**, com **Tailwind CSS** e componentes **shadcn/ui**. O **Supabase** fornece banco de dados, autenticação, armazenamento e Edge Functions. O fluxo de compra integra **Melhor Envio** para fretes e **Mercado Pago** para pagamentos. O repositório inclui configuração de deploy na **Vercel**.

## Rodar localmente

Requisitos: Node.js, npm e, para usar o backend local, Supabase CLI e Docker.

```bash
npm install
npm run local:start
npm run local:reset
npm run local:setup
npm run dev
```

O site abre em <http://127.0.0.1:8080>. O comando `local:setup` cria `.env.local` com as chaves públicas do Supabase local e cadastra dados de teste. Use as contas e a senha descritas nos [guias de teste local](docs/FASE-1-TESTE-LOCAL.md).

Se você já tiver um projeto Supabase configurado, pode iniciar só o frontend: copie `.env.example` para `.env.local`, preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` e execute `npm run dev`. Essas variáveis são públicas; credenciais administrativas e tokens de serviços externos pertencem às Edge Functions, nunca ao frontend.

## Comandos úteis

| Comando | Função |
| --- | --- |
| `npm run dev` | Inicia o frontend em modo de desenvolvimento. |
| `npm run build` | Gera a versão de produção em `dist/`. |
| `npm run preview` | Abre a versão gerada localmente. |
| `npm run lint` | Executa o ESLint. |
| `npm run local:reset` | Recria o banco local e aplica as migrations. |
| `npm run local:setup` | Configura o frontend e cadastra dados locais de teste. |
| `npm run local:stop` | Encerra o Supabase local. |

## Estrutura do repositório

| Caminho | Conteúdo |
| --- | --- |
| `src/pages/` | Páginas da loja, checkout, conta do cliente e administração. |
| `src/components/` | Componentes da interface. |
| `src/context/` | Estado de autenticação, carrinho e favoritos. |
| `src/lib/` | Acesso a produtos, pedidos, fretes e outros dados. |
| `supabase/migrations/` | Estrutura e regras do banco de dados. |
| `supabase/functions/` | Funções de frete, pagamento e processamento de pedidos. |
| `docs/` | Planejamento e roteiros de validação por fase. |

## Estado das integrações

O código do checkout, das cotações de frete e dos pagamentos está no repositório. Os [testes da fase 5](docs/FASE-5-TESTE-LOCAL.md) usam simulações de Mercado Pago e Melhor Envio; a homologação completa com contas de teste externas ainda depende dos cenários descritos nesse guia. Para entender o fluxo e a preparação operacional, consulte [CHECKOUT.md](docs/CHECKOUT.md) e [CONTAS-E-SERVICOS-EXTERNOS.md](docs/CONTAS-E-SERVICOS-EXTERNOS.md).

**Site:** [www.gostodumatu.com.br](https://www.gostodumatu.com.br/)
