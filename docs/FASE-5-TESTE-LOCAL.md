# Fase 5 — checkout, Mercado Pago e teste local

Esta fase substitui a finalização pelo WhatsApp por um checkout no site com endereço, frete por produtor, Pix e cartão. A validação automatizada usa respostas simuladas do Mercado Pago e do Melhor Envio e **não cria cobrança nem etiqueta externa**.

## O que foi implementado

- rota protegida `/checkout` com endereço, cotação, seleção de frete, revisão e pagamento;
- `checkout-session`: recota o frete, recarrega os preços e reserva o estoque durante 30 minutos;
- `process-payment`: cria e consulta pagamentos Pix e cartão pela Orders API do Mercado Pago;
- Card Payment Brick oficial: número, validade e CVV são tokenizados pelo Mercado Pago e não chegam ao banco;
- QR Code Pix, Copia e Cola e consulta automática do estado do pagamento;
- `mercadopago-webhook`: valida `x-signature`, deduplica o evento e consulta a order no provedor antes de atualizar o pedido;
- idempotência de pedido, pagamento, webhook, baixa de estoque, etiqueta e estorno;
- cron a cada minuto para expirar reservas abandonadas;
- reentrada segura de pagamento: se a aprovação chegar após a expiração, o backend tenta reservar novamente e faz estorno integral automático quando já não há estoque;
- limite de tentativas de pagamento e respostas do provedor protegidas por RLS.

## Preparar o Supabase local

```sh
npm run local:reset
npm run local:setup
```

O setup cria um cliente completo, endereço, produtos com estoque e duas origens de envio.

## Validação automatizada segura

```sh
npm run validate:phase5
```

O comando inicia temporariamente as Edge Functions com `MELHOR_ENVIO_MOCK=true` e `MERCADOPAGO_MOCK=true` e testa:

1. bloqueio do checkout para visitante;
2. preço, frete e total calculados no backend;
3. reserva de estoque;
4. Pix pendente com QR Code;
5. repetição idempotente sem criar outra cobrança;
6. recusa de webhook sem assinatura;
7. confirmação por webhook assinado e deduplicação;
8. baixa única de estoque e criação do trabalho de etiqueta;
9. cartão recusado sem armazenar o token;
10. nova tentativa por Pix;
11. aprovação tardia sem estoque e estorno automático;
12. bloqueio das respostas privadas do provedor para o cliente.

Ao final deve aparecer:

```text
Fase 5 validada localmente com Mercado Pago e Melhor Envio simulados; nenhuma API externa foi chamada.
```

## Teste visual local

Copie `supabase/functions/.env.example` para um arquivo local ignorado pelo Git e mantenha os dois mocks habilitados. Depois execute, em terminais separados:

```sh
npx --yes supabase@latest functions serve --env-file CAMINHO_DO_ENV_LOCAL
npm run dev
```

Entre com `cliente@local.test` / `TesteLocal123!`, adicione produtos ao carrinho e abra <http://127.0.0.1:8080/checkout>.

O Pix pode ser percorrido inteiramente no mock. Para o Card Payment Brick carregar e tokenizar um cartão no navegador, `MERCADOPAGO_PUBLIC_KEY` precisa ser uma Public Key de teste válida; essa tokenização chama o sandbox do Mercado Pago, mesmo que o backend permaneça simulado.

## Webhook correto do projeto remoto

Cadastre exatamente esta URL na aplicação de **teste** do Mercado Pago:

```text
https://vzvbcewvdqcerogwsjeu.supabase.co/functions/v1/mercadopago-webhook
```

Selecione o tópico **Order (Mercado Pago)**. Depois de salvar, copie a assinatura secreta fornecida pelo painel. A função não usa a callback do Supabase Auth nem a callback OAuth do Melhor Envio.

## Variáveis do projeto remoto

Em **Supabase > Edge Functions > Secrets**, use exatamente estes nomes:

```env
MERCADOPAGO_ACCESS_TOKEN=TEST-...
MERCADOPAGO_PUBLIC_KEY=TEST-...
MERCADOPAGO_WEBHOOK_SECRET=...
```

Para homologação, todos os valores devem pertencer à mesma aplicação e ao mesmo ambiente de teste. Não use nomes com espaços, não use prefixo `VITE_` no Access Token ou no Webhook Secret e não habilite `MERCADOPAGO_MOCK` no projeto remoto.

`MERCADOPAGO_PUBLIC_KEY` não concede acesso administrativo, mas a implementação a entrega ao navegador somente pela sessão de checkout. `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` nunca podem chegar ao frontend.

## Homologação real do sandbox

Depois de aplicar a migration, publicar as três novas Edge Functions e cadastrar os secrets:

1. crie ou confirme um vendedor de teste e um comprador de teste diferentes;
2. entre no site publicado com uma conta de cliente da Gostudumatu;
3. faça um pedido pequeno via Pix e confirme que começa como aguardando pagamento;
4. pague no ambiente de teste e confirme que o webhook muda o pedido para pago uma única vez;
5. faça pagamentos com cartões de teste para cenários aprovado e recusado;
6. repita uma requisição ou um webhook e confira que não existe cobrança nem baixa duplicada;
7. confira no painel do Supabase que o pedido pago criou um `fulfillment_job` para cada produtor;
8. confira no painel do Mercado Pago as tarifas, parcelamento e prazo de recebimento antes da produção.

A fase só estará homologada externamente depois dos cenários aprovado, recusado, pendente e expirado funcionarem com as credenciais de teste reais.

Para encerrar os containers locais:

```sh
npm run local:stop
```
