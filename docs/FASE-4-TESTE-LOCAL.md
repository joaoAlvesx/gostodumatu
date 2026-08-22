# Fase 4 — Melhor Envio e teste local

Esta fase implementa a callback OAuth real, armazenamento dos tokens no Vault, renovação automática, cotação por produtor, recotação e o ciclo de etiquetas. A validação automatizada usa respostas locais simuladas e **não chama o Melhor Envio**.

## O que foi implementado

- `melhor-envio-oauth`: inicia a autorização, recebe o `code`, troca pelos tokens e renova o Access Token;
- `shipping-quotes`: recarrega produtos/estoque no backend, separa o carrinho por produtor e faz uma cotação para cada CEP de origem;
- `fulfillment-worker`: aplica o frete à remessa e executa carrinho, compra, geração, impressão e rastreio da etiqueta;
- Supabase Vault: guarda Access Token e Refresh Token criptografados, sem devolvê-los ao navegador;
- aba **Integrações** no painel do super admin: mostra a callback, o estado da conexão e o botão de autorização;
- snapshots de cotação privados, validade de 15 minutos, recotação e erro `QUOTE_CHANGED`;
- estado `label_error`, trilha em `order_events` e operações idempotentes para permitir nova tentativa.

Opções de Correios, J&T ou Loggi que exijam vários volumes na mesma remessa são omitidas nesta versão, pois essas transportadoras exigem uma chamada de carrinho para cada volume. Isso evita oferecer um serviço que o modelo atual de uma etiqueta por remessa não consegue comprar corretamente.

## Preparar o Supabase local

```sh
npm run local:reset
npm run local:setup
```

O setup cria dois produtos de produtores diferentes, perfis de expedição, um cliente e uma remessa paga para o teste da etiqueta.

## Validação automatizada segura

```sh
npm run validate:phase4
```

O comando inicia as Edge Functions temporariamente com `MELHOR_ENVIO_MOCK=true`, se necessário, e testa:

1. armazenamento e leitura server-side dos tokens pelo Vault;
2. bloqueio dos tokens para visitante e navegador;
3. callback e URL de autorização OAuth com `state` de uso único;
4. bloqueio da configuração OAuth para quem não é super admin;
5. duas origens gerando dois grupos e preços de frete próprios;
6. ausência de endereço privado, documento e token na resposta;
7. recotação das opções escolhidas;
8. simulação de carrinho, compra, geração e impressão da etiqueta;
9. idempotência e trilha de auditoria.

Ao final deve aparecer:

```text
Fase 4 validada localmente com respostas mock; nenhuma API externa foi chamada.
```

## Teste visual local

O teste visual da tela de integração pode ser feito com as funções em modo mock. Copie `supabase/functions/.env.example` para um arquivo local ignorado pelo Git, preencha somente valores fictícios e use:

```sh
npx --yes supabase@latest functions serve --env-file CAMINHO_DO_ENV_LOCAL
npm run dev
```

Abra <http://127.0.0.1:8080/admin>, entre com `admin@local.test` / `TesteLocal123!` e acesse **Integrações**. Não conclua a autorização OAuth usando a callback local, a menos que ela também esteja cadastrada no aplicativo sandbox.

## Callback correta do projeto remoto

Cadastre exatamente esta URL no aplicativo **sandbox** do Melhor Envio:

```text
https://vzvbcewvdqcerogwsjeu.supabase.co/functions/v1/melhor-envio-oauth
```

Ela agora corresponde à Edge Function implementada. Não use a callback do Google/Supabase Auth (`/auth/v1/callback`), pois ela pertence a outro fluxo OAuth.

O Melhor Envio exige que a callback enviada na autorização seja idêntica à cadastrada no aplicativo. Uma diferença de protocolo, domínio, caminho ou barra final pode causar `Client invalid`. Consulte o [fluxo de autorização oficial](https://docs.melhorenvio.com.br/reference/fluxo-de-autoriza%C3%A7%C3%A3o).

## Secrets do projeto remoto

Confirme em **Supabase > Edge Functions > Secrets**:

```env
APP_URL=https://www.gostodumatu.com.br
MELHOR_ENVIO_ENV=sandbox
MELHOR_ENVIO_CLIENT_ID=...
MELHOR_ENVIO_CLIENT_SECRET=...
MELHOR_ENVIO_REDIRECT_URI=https://vzvbcewvdqcerogwsjeu.supabase.co/functions/v1/melhor-envio-oauth
MELHOR_ENVIO_USER_AGENT=Gostudumatu email-real-de-suporte@gostudumatu.com.br
```

`MELHOR_ENVIO_USER_AGENT` precisa conter o nome da aplicação e um e-mail de contato. Não configure `MELHOR_ENVIO_MOCK=true` no projeto remoto. O cabeçalho User-Agent é obrigatório nas chamadas, conforme a [solicitação de token](https://docs.melhorenvio.com.br/reference/solicitacao-do-token).

Os escopos padrão solicitados pela implementação são:

```text
cart-read cart-write orders-read purchases-read shipping-calculate shipping-cancel shipping-checkout shipping-generate shipping-preview shipping-print shipping-tracking
```

## O que falta para obter os tokens reais

Depois que a migration e as três Edge Functions forem aplicadas ao Supabase remoto:

1. abra o site publicado e entre em `/admin` como super admin;
2. acesse **Integrações**;
3. confira se ambiente e callback estão corretos;
4. clique em **Autorizar no Melhor Envio**;
5. aceite os escopos no sandbox;
6. aguarde o retorno para `/admin` com a mensagem **Melhor Envio conectado**.

Nesse retorno, o código de autorização é consumido uma única vez pelo backend. O Access Token e o Refresh Token são criados automaticamente e guardados no Vault; não é preciso copiá-los manualmente e eles não aparecem na interface.

## Homologação real do sandbox

A validação automatizada comprova o nosso código sem depender de serviço externo. Depois da autorização real, ainda será necessário testar no sandbox:

- uma cotação real para cada um dos dois produtores;
- dados de CEP, peso e dimensões aceitos;
- um remetente e destinatário com CPF, telefone, e-mail e endereço completos;
- saldo sandbox suficiente para o checkout da etiqueta;
- carrinho, compra, geração, impressão e rastreio;
- comportamento de uma etiqueta que ainda não ficou pronta para impressão e sua nova tentativa.

Desde 6 de abril de 2026, o Melhor Envio exige os produtos completos no carrinho para o fluxo de DC-e. A implementação já envia nome, quantidade e valor unitário, mas a definição fiscal para produção continua pendente. Consulte [inserir fretes no carrinho](https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho).

Para encerrar os containers locais:

```sh
npm run local:stop
```
