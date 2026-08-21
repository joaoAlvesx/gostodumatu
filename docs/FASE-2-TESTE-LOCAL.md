# Fase 2 — teste local

O ambiente descrito aqui usa apenas containers locais. Nenhum comando desta página aplica migrations no projeto remoto nem chama as APIs do Mercado Pago ou do Melhor Envio.

## Preparar uma vez

```sh
npm run local:start
npm run local:setup
```

O primeiro comando pode demorar porque baixa as imagens Docker do Supabase. O segundo cria `.env.local`, dados de demonstração e três usuários:

| Perfil | E-mail | Senha |
|---|---|---|
| Super admin | `admin@local.test` | `TesteLocal123!` |
| Produtor | `produtor@local.test` | `TesteLocal123!` |
| Cliente | `cliente@local.test` | `TesteLocal123!` |

## Abrir o site

```sh
npm run dev
```

- Site: <http://127.0.0.1:8080>
- Painel: <http://127.0.0.1:8080/admin>
- Supabase Studio local: <http://127.0.0.1:54323>

## Checklist manual

1. Entre em `/admin` como super admin e confirme que os dois produtos de teste exibem estoque e disponibilidade para checkout.
2. Edite um produto e confira os campos de estoque, peso, altura, largura e comprimento.
3. Tente marcar como disponível um produto sem peso ou dimensões e confirme que o painel impede o salvamento.
4. Abra a aba **Expedição**, alterne entre os produtores e confirme os dados privados de origem de cada um.
5. Saia e entre como produtor; confirme que ele acessa e altera somente os próprios produtos e dados de expedição.
6. No Studio, confira as tabelas de clientes, endereços, pedidos, itens, remessas, reservas, pagamentos, reembolsos, eventos e trabalhos de expedição criadas pela migration da Fase 2.

## Validação automatizada

Parta de um banco limpo, pois o teste cria pedidos e reservas de estoque:

```sh
npm run local:reset
npm run local:setup
npm run validate:phase2
```

Esse comando testa estoque e embalagem, RLS de clientes e produtores, isolamento dos endereços privados de origem, criação transacional do pedido, valores em centavos, snapshots, uma remessa por produtor, idempotência, pagamentos, reembolsos, eventos externos, fila de expedição, rollback por falta de estoque, expiração de reservas e proteção contra sobrevenda concorrente.

O teste usa somente o Supabase local e recusa a execução quando a API não aponta para `127.0.0.1`.

Para recriar o banco local do zero:

```sh
npm run local:reset
npm run local:setup
```

Para encerrar os containers:

```sh
npm run local:stop
```
