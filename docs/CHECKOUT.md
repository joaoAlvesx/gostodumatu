# Checkout no Site — Gostudumatu

> Documento de arquitetura e preparação operacional. Revisado em **18 de agosto de 2026**. Valores e limites de serviços externos devem ser conferidos novamente antes do lançamento.

## 1. Objetivo

Substituir a finalização atual pelo WhatsApp por um checkout completo no site:

1. cliente entra com Google ou e-mail e senha;
2. informa ou escolhe um endereço;
3. o sistema separa o carrinho por produtor;
4. o Melhor Envio calcula um frete real para cada origem;
5. o cliente escolhe o serviço de cada remessa;
6. a Gostudumatu recebe um único pagamento por Pix ou cartão;
7. o sistema reserva e baixa o estoque, registra o pedido e gera uma etiqueta para cada produtor;
8. cliente, produtor e super admin acompanham apenas os dados permitidos para seus perfis.

### Decisões já definidas

| Assunto | Decisão |
|---|---|
| Recebedor do pagamento | A conta Mercado Pago da Gostudumatu recebe o valor total; repasses aos produtores ficam fora do checkout no MVP |
| Produtos de vários produtores | Permitidos no mesmo carrinho |
| Expedição | Cada produtor envia sua parte do pedido |
| Frete | Cotação real, compra e geração de etiquetas pelo Melhor Envio |
| Pagamento | Pix e cartão em até 12 vezes com juros para o comprador |
| Estoque | Reserva transacional de 30 minutos |
| Conta do cliente | Google em destaque; e-mail e senha como alternativa; e-mail precisa ser confirmado antes do pagamento |
| Área do cliente | Histórico e acompanhamento somente após login |
| Operação | Produtor gerencia suas remessas; super admin gerencia tudo |
| Pós-venda | Reembolso total ou parcial por remessa |
| E-mail | Resend para autenticação e mensagens transacionais |
| Interface | Página dedicada `/checkout`, não um modal |

---

## 2. Arquitetura recomendada

### Durante implementação e homologação

```text
Frontend Vite/React             Vercel Hobby
Backend seguro e webhooks       Supabase Edge Functions
Banco, Auth, Storage e Cron     Supabase
Pagamentos de teste             Mercado Pago sandbox
Fretes de teste                 Melhor Envio sandbox
E-mails                         Resend
```

**A Vercel pode e deve continuar sendo usada durante o desenvolvimento.** Tecnicamente, o plano Hobby oferece bastante capacidade, mas a própria Vercel o restringe a projetos pessoais e não comerciais. Portanto, ele não deve ser o plano definitivo quando o checkout começar a receber vendas reais. Consulte [Vercel Hobby](https://vercel.com/docs/plans/hobby) e [Vercel Pricing](https://vercel.com/pricing).

O backend será criado nas Edge Functions do Supabase desde o início. Isso evita implementar funções na Vercel agora e reescrevê-las na migração.

### No lançamento comercial

Opção recomendada para manter custo fixo próximo de zero:

```text
Frontend estático               Cloudflare Pages Free
Backend seguro e webhooks       Supabase Edge Functions
Banco, Auth, Storage e Cron     Supabase Free ou Pro
```

O Cloudflare Pages atende bem a um projeto Vite: requisições e banda de arquivos estáticos são gratuitas e ilimitadas, com até 500 builds mensais no plano Free. Consulte [Cloudflare Pages Pricing](https://developers.cloudflare.com/pages/functions/pricing/) e [limites do Pages](https://developers.cloudflare.com/pages/platform/limits/).

Alternativa sem migração de hospedagem: atualizar a Vercel para **Pro**, atualmente a partir de **US$ 20/mês**, com crédito mensal de uso. Nesse caso o domínio, o front e o deploy continuam exatamente onde estão.

### Por que não colocar o backend no Cloudflare agora

Cloudflare Workers também é uma boa opção, mas não é necessária neste estágio. O Supabase já será responsável por banco, autenticação, RLS, reservas de estoque e cron; manter as funções no mesmo ecossistema reduz segredos duplicados e pontos de falha.

Se no futuro as Edge Functions virarem um gargalo, Workers Paid começa em aproximadamente **US$ 5/mês**, inclui 10 milhões de requisições mensais e não cobra tráfego de saída. Consulte [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/).

---

## 3. O que os planos gratuitos suportam

### 3.1 Supabase Free

Limites atuais mais relevantes:

| Recurso | Limite gratuito |
|---|---:|
| Projetos ativos | 2 |
| Banco de dados | 500 MB por projeto |
| Tráfego/egress | 5 GB/mês |
| Storage de arquivos | 1 GB |
| Tráfego em cache do Storage | 5 GB/mês |
| Usuários ativos mensais | 50.000 |
| Edge Functions | 500.000 chamadas/mês |
| Realtime | 2 milhões de mensagens/mês e pico de 200 conexões |
| Retenção de logs | 1 dia |
| Backups automáticos | Não incluídos |
| Pausa por inatividade | Após uma semana sem atividade |

Fontes: [Supabase Pricing](https://supabase.com/pricing) e [Supabase Billing](https://supabase.com/docs/guides/platform/billing-on-supabase).

O plano gratuito é suficiente para desenvolver, homologar e iniciar uma operação pequena. As limitações mais preocupantes para uma loja não são quantidade de usuários nem chamadas de função: são **ausência de backup automático, pausa por inatividade, 500 MB de banco e 5 GB de tráfego**.

No plano Free, passar de 500 MB pode deixar o banco em modo somente leitura. Consulte [Database Size](https://supabase.com/docs/guides/platform/database-size).

### 3.2 Problema atual das imagens

Hoje as telas administrativas transformam as imagens em Base64 e salvam esse conteúdo diretamente nas colunas `products.image` e `producers.image`.

Na inspeção atual:

- uma linha de produto com duas imagens possui aproximadamente **464 KB somente de imagem**;
- uma linha de produtor possui aproximadamente **134 KB de imagem**;
- o catálogo tem apenas 7 produtos, mas a resposta pública completa já ultrapassa **1 MB**.

Isso consome banco e tráfego em toda abertura do catálogo. Com respostas de 1 MB, 5 GB representam aproximadamente 5.000 carregamentos completos, antes de considerar outras consultas.

**Correção obrigatória antes do checkout:**

1. converter imagens para WebP/JPEG otimizado;
2. enviar arquivos para Supabase Storage;
3. salvar no banco somente caminho/URL e metadados;
4. migrar as imagens Base64 existentes;
5. limitar tamanho e dimensões no upload;
6. gerar miniaturas no navegador antes do upload ou em processamento separado.

Depois dessa migração, as respostas JSON devem cair de centenas de KB para poucos KB e o CDN poderá armazenar as imagens em cache.

### 3.3 Estimativa prática de capacidade gratuita

Não existe conversão exata entre limites e quantidade de pedidos. O consumo depende de acessos ao catálogo, imagens, itens por pedido, tentativas de pagamento e número de e-mails.

Após corrigir as imagens e mantendo payloads enxutos:

- 500.000 Edge Functions/mês permitem dezenas de milhares de checkouts; não deve ser o primeiro gargalo;
- considerando 20–40 KB de banco por pedido, 500 MB comportariam teoricamente mais de 10 mil pedidos acumulados, mas o upgrade deve ocorrer muito antes disso;
- 5 GB de egress são suficientes para uma operação pequena se imagens forem servidas pelo Storage/CDN e as consultas não trouxerem payloads desnecessários;
- o Resend Free normalmente será o limite operacional mais fácil de visualizar.

Faixa prudente para permanecer inteiramente nos serviços gratuitos: **aproximadamente 200–500 pedidos por mês**, desde que o catálogo esteja otimizado e o uso seja monitorado. Isso não é garantia nem limite técnico; é uma faixa de operação recomendada para não trabalhar perto das cotas.

### 3.4 Resend Free

O plano gratuito permite **3.000 e-mails por mês e 100 por dia**. Se cada pedido gerar quatro mensagens — confirmação, pagamento, postagem e entrega — o teto teórico seria 750 pedidos/mês, sem contar confirmação de conta, recuperação de senha, reenvios e mensagens administrativas.

Por segurança, planejar upgrade quando atingir 70% do limite diário ou mensal. O Pro atualmente começa em **US$ 20/mês para 50.000 e-mails**. Consulte [Resend Pricing](https://resend.com/pricing) e [limites de conta](https://resend.com/docs/knowledge-base/account-quotas-and-limits).

### 3.5 Mercado Pago e Melhor Envio

- A API do Mercado Pago não possui mensalidade de integração, mas **cada pagamento aprovado tem tarifa**. A taxa depende do meio, prazo de recebimento e política de parcelamento da conta. Conferir no painel antes do lançamento; não fixar uma porcentagem no código ou neste documento. Consulte [custos e credenciais do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/getting-started).
- A API do Melhor Envio não cobra taxa nem mensalidade. A Gostudumatu paga as etiquetas efetivamente compradas e precisa manter saldo disponível. Sandbox e produção são contas e aplicações separadas. Consulte [Introdução à API Melhor Envio](https://docs.melhorenvio.com.br/reference/introducao-api-melhor-envio).

---

## 4. Plano de custos por estágio

Valores em dólar, sem conversão, impostos ou tarifas variáveis de pagamento/frete.

| Estágio | Hospedagem | Supabase | E-mail | Custo fixo estimado |
|---|---|---|---|---:|
| Desenvolvimento | Vercel Hobby | Free | Resend Free | US$ 0/mês |
| Lançamento econômico | Cloudflare Pages Free | Free | Resend Free | US$ 0/mês |
| Produção recomendada | Cloudflare Pages Free | Pro | Resend Free | a partir de US$ 25/mês |
| Crescimento | Cloudflare Pages Free | Pro | Resend Pro | a partir de US$ 45/mês |
| Permanecer na Vercel | Vercel Pro | Free ou Pro | Free ou Pro | adicionar a partir de US$ 20/mês |

Mesmo que seja possível lançar com Supabase Free, o **Supabase Pro é o primeiro upgrade recomendado quando vendas reais se tornarem recorrentes**, pois evita pausa por inatividade e inclui backups diários por sete dias, além de 8 GB de disco e 250 GB de egress.

### Gatilhos objetivos para upgrade

Atualizar o Supabase quando ocorrer primeiro:

- vendas recorrentes que não possam depender de backup manual;
- banco acima de 300–350 MB;
- egress ou Storage acima de 70% por dois meses;
- lentidão frequente ou necessidade de suporte;
- necessidade de ambiente de produção separado sem consumir o limite de projetos gratuitos.

Atualizar o Resend quando ocorrer primeiro:

- mais de 70 e-mails em um dia;
- mais de 2.100 e-mails no mês;
- campanhas ou mensagens que não sejam estritamente transacionais.

Atualizar a Vercel para Pro somente se a decisão for manter a produção nela. Se o front migrar para Cloudflare Pages, a Vercel Hobby pode continuar apenas para desenvolvimento pessoal e previews sem operação comercial.

---

## 5. Responsabilidades: o que depende de você

Legenda:

- **VOCÊ:** cadastro, validação, decisão comercial ou acesso a painel externo.
- **IMPLEMENTAÇÃO:** código, migrations, integração, validações e testes.

### 5.1 Domínio e hospedagem

#### Agora

- [ ] **VOCÊ:** manter o projeto atual na Vercel Hobby para desenvolvimento.
- [ ] **VOCÊ:** confirmar acesso ao registrador/DNS de `gostodumatu.com.br`.
- [ ] **IMPLEMENTAÇÃO:** usar `gostodumatu.com.br` como domínio canônico; `gostudumatu.vercel.app` será apenas preview.

#### Antes do lançamento

Escolher uma das opções:

- [ ] **VOCÊ — recomendada:** criar conta Cloudflare, conectar o repositório ao Pages e permitir a alteração do DNS; ou
- [ ] **VOCÊ — alternativa:** informar que prefere Vercel Pro e cadastrar o meio de pagamento na Vercel.

Migração para Cloudflare Pages:

1. conectar o mesmo repositório Git;
2. configurar build `npm run build` e diretório de saída `dist`;
3. copiar apenas as variáveis públicas do frontend;
4. configurar fallback SPA para `index.html`;
5. validar um domínio temporário `*.pages.dev`;
6. apontar `gostodumatu.com.br` e `www` para o Pages;
7. atualizar URLs permitidas do Supabase Auth;
8. validar login, checkout e retornos antes de remover o domínio da Vercel.

Como os webhooks e o backend estarão no Supabase, eles não mudam de endereço nessa migração.

### 5.2 Supabase

- [ ] **VOCÊ:** garantir acesso de Owner ao projeto atual.
- [ ] **VOCÊ:** criar uma nova chave pública `sb_publishable_...` e uma chave secreta `sb_secret_...` no painel; as chaves legadas atuais serão migradas gradualmente. Consulte [migração de chaves](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
- [ ] **VOCÊ:** não enviar chaves secretas por mensagem, commit ou variável iniciada com `VITE_`.
- [ ] **VOCÊ:** adicionar `http://localhost:8080`, URL da Vercel, URL do Cloudflare preview e domínio final na lista de redirects do Auth.
- [ ] **VOCÊ:** desativar confirmação automática de e-mail quando Resend estiver configurado.
- [ ] **VOCÊ:** habilitar Google no painel após criar as credenciais descritas abaixo.
- [ ] **IMPLEMENTAÇÃO:** versionar migrations, RLS, tipos TypeScript, Edge Functions, Storage, Cron e políticas de acesso.
- [ ] **IMPLEMENTAÇÃO:** migrar imagens Base64 para Storage.
- [ ] **IMPLEMENTAÇÃO:** usar Vault para tokens rotativos do Melhor Envio. O Vault armazena segredos criptografados: [Supabase Vault](https://supabase.com/docs/guides/database/vault).

Enquanto estiver no Free:

- [ ] **VOCÊ:** exportar backup antes de cada alteração estrutural e ao menos semanalmente depois que houver pedidos reais.
- [ ] **VOCÊ:** acompanhar Database, Egress, Storage, Auth e Edge Functions na tela de Usage.

### 5.3 Login com Google

- [ ] **VOCÊ:** entrar no Google Cloud Console e criar um projeto da Gostudumatu.
- [ ] **VOCÊ:** configurar a tela de consentimento com audiência `External`.
- [ ] **VOCÊ:** preencher nome, logo, domínio, e-mail de suporte e contato técnico.
- [ ] **VOCÊ:** publicar páginas de Política de Privacidade e Termos de Uso no domínio antes de solicitar publicação do OAuth.
- [ ] **VOCÊ:** solicitar apenas os escopos `openid`, `email` e `profile`.
- [ ] **VOCÊ:** criar um OAuth Client do tipo `Web application`.
- [ ] **VOCÊ:** cadastrar origens autorizadas do domínio e ambiente de teste.
- [ ] **VOCÊ:** copiar exatamente a callback exibida pelo provedor Google no painel do Supabase para `Authorized redirect URIs`.
- [ ] **VOCÊ:** colocar o aplicativo em produção; no modo Testing, somente usuários adicionados à lista de teste entram e as autorizações expiram.
- [ ] **VOCÊ:** cadastrar Client ID e Client Secret diretamente no painel Supabase Auth — nunca no frontend.
- [ ] **IMPLEMENTAÇÃO:** criar telas de login, cadastro, confirmação, recuperação de senha e callback.

Guia oficial: [Supabase Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google).

### 5.4 Resend e domínio de e-mail

- [ ] **VOCÊ:** criar conta no Resend.
- [ ] **VOCÊ:** adicionar um subdomínio de envio, por exemplo `mail.gostodumatu.com.br`.
- [ ] **VOCÊ:** adicionar no DNS os registros SPF e DKIM fornecidos pelo Resend e configurar DMARC.
- [ ] **VOCÊ:** criar uma API Key de produção com o menor escopo possível.
- [ ] **VOCÊ:** escolher remetentes, por exemplo `nao-responda@gostodumatu.com.br` e `pedidos@gostodumatu.com.br`.
- [ ] **VOCÊ:** conectar o Resend como SMTP personalizado no Supabase Auth. O SMTP padrão do Supabase não serve para produção e atualmente limita envios a destinatários autorizados e cerca de duas mensagens por hora. Consulte [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- [ ] **IMPLEMENTAÇÃO:** criar templates e fila idempotente para confirmação de pagamento, postagem, entrega, cancelamento e reembolso.

### 5.5 Mercado Pago

- [ ] **VOCÊ:** criar ou validar uma conta de vendedor da Gostudumatu com os dados jurídicos e bancários corretos.
- [ ] **VOCÊ:** cadastrar uma chave Pix na conta.
- [ ] **VOCÊ:** acessar Mercado Pago Developers > Suas integrações > Criar aplicação.
- [ ] **VOCÊ:** selecionar pagamentos online, loja própria e **Checkout Transparente**.
- [ ] **VOCÊ:** obter Public Key e Access Token de teste.
- [ ] **VOCÊ:** criar/usar as contas de teste de vendedor e comprador fornecidas pelo Mercado Pago.
- [ ] **VOCÊ:** depois da homologação, ativar credenciais de produção.
- [ ] **VOCÊ:** cadastrar o webhook de teste e o de produção apontando para a Edge Function do Supabase.
- [ ] **VOCÊ:** selecionar eventos de criação e atualização de pagamentos/orders.
- [ ] **VOCÊ:** copiar o segredo de assinatura do webhook para os Secrets do Supabase.
- [ ] **VOCÊ:** conferir no painel as tarifas reais de Pix, cartão, prazo de recebimento e parcelamento antes de definir preços.
- [ ] **IMPLEMENTAÇÃO:** integrar Card Payment Brick para cartão e o fluxo Pix por QR Code.
- [ ] **IMPLEMENTAÇÃO:** usar a **Orders API**, atualmente recomendada pelo Mercado Pago; a Payments API está marcada como legada. Consulte [referência do Checkout Transparente](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/overview).
- [ ] **IMPLEMENTAÇÃO:** usar `X-Idempotency-Key`, validar `x-signature`, nunca confiar no valor do navegador e nunca armazenar número/CVV de cartão.

### 5.6 Melhor Envio

Sandbox e produção são ambientes separados; será necessário repetir o cadastro nos dois.

- [ ] **VOCÊ:** criar uma conta no sandbox do Melhor Envio.
- [ ] **VOCÊ:** criar uma aplicação em Integrações > Área Dev.
- [ ] **VOCÊ:** informar site, contatos técnico/comercial e a callback fornecida pela implementação.
- [ ] **VOCÊ:** autorizar somente os escopos necessários: cotação, carrinho, checkout, geração, impressão, cancelamento e rastreio de etiquetas.
- [ ] **VOCÊ:** fornecer Client ID e Client Secret por meio seguro para cadastro nos Secrets.
- [ ] **VOCÊ:** autorizar a aplicação para gerar o primeiro access token e refresh token.
- [ ] **VOCÊ:** repetir o processo no ambiente de produção após homologar.
- [ ] **VOCÊ:** manter saldo suficiente na Melhor Carteira para compra automática das etiquetas.
- [ ] **IMPLEMENTAÇÃO:** renovar access token automaticamente; ele dura 30 dias e o refresh token, 45 dias. Consulte [autenticação Melhor Envio](https://docs.melhorenvio.com.br/docs/autenticacao).
- [ ] **IMPLEMENTAÇÃO:** guardar os tokens rotativos no Vault, nunca no navegador.

Para cada produtor, **VOCÊ** deverá obter e validar:

- nome/razão social;
- CPF ou CNPJ e inscrição estadual quando aplicável;
- telefone e e-mail;
- endereço completo e CEP de origem;
- agência/ponto de postagem preferencial quando o serviço exigir;
- tipo de envio comercial ou não comercial;
- emissão e chave de nota fiscal quando exigida;
- peso e dimensões reais de cada produto embalado.

O Melhor Envio exige peso e dimensões para cotação e dados completos para emissão de etiqueta. Consulte [interface e dados obrigatórios](https://docs.melhorenvio.com.br/docs/interface-de-usuario).

### 5.7 Textos jurídicos e operação

- [ ] **VOCÊ:** fornecer Política de Privacidade, Termos de Uso, Política de Trocas/Cancelamento e Política de Entrega revisadas para o negócio.
- [ ] **VOCÊ:** definir quem atende pedidos com falha, disputa, chargeback ou etiqueta não gerada.
- [ ] **VOCÊ:** definir prazo máximo de preparo de cada produtor.
- [ ] **VOCÊ:** confirmar como será feito o repasse financeiro aos produtores fora do sistema no MVP.
- [ ] **VOCÊ:** validar com contador a emissão de nota e responsabilidade tributária da venda centralizada na Gostudumatu.

---

## 6. Variáveis e segredos

### Podem existir no frontend

Estas variáveis entram no bundle público e **não são secretas**:

```env
VITE_APP_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

### Secrets das Supabase Edge Functions

Nunca usar prefixo `VITE_` nestas variáveis:

```env
APP_URL=
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=
MERCADOPAGO_WEBHOOK_SECRET=
MERCADOPAGO_ENV=test
MELHOR_ENVIO_ENV=sandbox
MELHOR_ENVIO_CLIENT_ID=
MELHOR_ENVIO_CLIENT_SECRET=
MELHOR_ENVIO_REDIRECT_URI=
MELHOR_ENVIO_USER_AGENT=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
CRON_SECRET=
```

O Supabase já disponibiliza às Edge Functions `SUPABASE_URL`, chaves públicas e chaves secretas do projeto. A chave secreta nunca deve chegar ao navegador. Consulte [Secrets de Edge Functions](https://supabase.com/docs/guides/functions/secrets).

### Configurados diretamente nos painéis

| Credencial | Onde fica |
|---|---|
| Google Client ID e Client Secret | Supabase Auth > Providers > Google |
| SMTP host, porta, usuário e senha do Resend | Supabase Auth > SMTP Settings |
| Melhor Envio access/refresh tokens | Supabase Vault, gravados pelo fluxo OAuth |
| DNS SPF/DKIM/DMARC | Provedor DNS do domínio |
| Webhook secret Mercado Pago | Supabase Edge Function Secrets |

Não colocar valores reais neste documento, no GitHub, em issues ou no código.

---

## 7. Implementação técnica

As contas, dados externos e responsabilidades que precisam estar prontos em cada fase estão enumerados no [guia de contas e serviços externos](./CONTAS-E-SERVICOS-EXTERNOS.md#roteiro-enumerado-por-fases-de-desenvolvimento).

<a id="checkout-fase-1"></a>

### Fase 1 — Base, Storage e segurança

> Antes de iniciar: deixe prontos os acessos indicados na [Fase 1 do guia de contas e serviços externos](./CONTAS-E-SERVICOS-EXTERNOS.md#contas-fase-1).

- Versionar o schema remoto atual como baseline e criar migrations incrementais.
- Gerar tipos TypeScript do banco.
- Migrar imagens Base64 para Supabase Storage.
- Separar cliente Supabase público do cliente administrativo das Edge Functions.
- Substituir super admin baseado em `user_metadata`/e-mail por papéis protegidos.
- Mover criação de usuários produtores para uma função administrativa server-side.
- Corrigir RLS de produtos, produtores, perfis e Storage.

<a id="checkout-fase-2"></a>

### Fase 2 — Dados comerciais e estoque

> Antes de iniciar: conclua a criação antecipada das contas e reúna os dados indicados na [Fase 2 do guia de contas e serviços externos](./CONTAS-E-SERVICOS-EXTERNOS.md#contas-fase-2).

> **Status em 21/08/2026:** implementação e validação concluídas somente no Supabase local. A migration `20260821000100_phase_2_commerce_and_inventory.sql` ainda não foi aplicada em produção.

Ampliar `products` com:

- [x] `stock_quantity`;
- [x] peso, altura, largura e comprimento;
- [x] estado de disponibilidade para checkout.

Criar:

- [x] `customer_profiles` e `customer_addresses`;
- [x] `producer_fulfillment_profiles`, separado de `producers` para não expor documentos e endereço de origem;
- [x] `orders` e `order_items` com valores em centavos e snapshots;
- [x] `shipments`, uma por produtor;
- [x] `inventory_reservations`;
- [x] `payment_attempts` e `refunds`;
- [x] `order_events`, `webhook_events` e `fulfillment_jobs`.

- [x] Reservar estoque em função SQL transacional com bloqueio de linhas. Nunca calcular disponibilidade apenas no React.

Validação local reproduzível:

```bash
npm run local:reset
npm run local:setup
npm run validate:phase2
```

O teste cobre RLS, isolamento dos endereços privados de origem, valores em centavos, snapshots, uma remessa por produtor, idempotência, rollback por falta de estoque e liberação após expiração. Ele recusa execução quando a API do Supabase não aponta para `127.0.0.1`.

<a id="checkout-fase-3"></a>

### Fase 3 — Autenticação e conta do cliente

> Antes de iniciar: deixe Resend, domínio de e-mail e Google Cloud OAuth prontos conforme a [Fase 3 do guia de contas e serviços externos](./CONTAS-E-SERVICOS-EXTERNOS.md#contas-fase-3).

> **Status em 21/08/2026:** implementação e validação concluídas no ambiente local. A homologação do Google e do SMTP/Resend permanece pendente no projeto remoto.

- [x] Login Google e e-mail/senha.
- [x] Confirmação e recuperação de e-mail via Supabase Auth e SMTP.
- [x] Cadastro de dados pessoais e endereços do cliente.
- [x] Página `/minha-conta/pedidos`.
- [x] Página `/minha-conta/pedidos/:id`.
- [x] RLS garantindo que cada cliente veja somente os próprios pedidos.
- [ ] Homologar Google, confirmação e recuperação de senha no domínio publicado.

Validação local reproduzível:

```bash
npm run local:setup
npm run validate:phase3
```

O roteiro manual está em [`FASE-3-TESTE-LOCAL.md`](./FASE-3-TESTE-LOCAL.md).

<a id="checkout-fase-4"></a>

### Fase 4 — Frete multi-origem

> Antes de iniciar: deixe o aplicativo e as credenciais do Melhor Envio Sandbox prontos conforme a [Fase 4 do guia de contas e serviços externos](./CONTAS-E-SERVICOS-EXTERNOS.md#contas-fase-4).

- [x] Backend recarrega os produtos e agrupa por produtor.
- [x] Cada grupo usa o CEP e os dados protegidos daquele produtor.
- [x] Melhor Envio retorna opções por grupo.
- [x] Backend aceita uma opção para cada remessa.
- [x] O backend recota; mudança de valor retorna `QUOTE_CHANGED`.
- [x] Após pagamento, criar, comprar, gerar e imprimir uma etiqueta por remessa.
- [x] Falta de saldo ou falha externa cria `label_error` e permite nova tentativa.
- [x] OAuth com `state`, Vault e renovação automática dos tokens.
- [x] Aplicar no projeto remoto e autorizar a conta.
- [ ] Homologar a compra completa da etiqueta na API sandbox real.

> **Status em 21/08/2026:** migration e Edge Functions aplicadas no projeto remoto; OAuth autorizado e tokens guardados no Vault. A cotação real foi exercitada. A compra completa de uma etiqueta no sandbox continua como homologação operacional pendente.

Validação local reproduzível, sem chamada externa:

```bash
npm run local:setup
npm run validate:phase4
```

O roteiro completo está em [`FASE-4-TESTE-LOCAL.md`](./FASE-4-TESTE-LOCAL.md).

<a id="checkout-fase-5"></a>

### Fase 5 — Checkout e pagamento

> Antes de iniciar: deixe a aplicação, as credenciais e os usuários de teste do Mercado Pago prontos conforme a [Fase 5 do guia de contas e serviços externos](./CONTAS-E-SERVICOS-EXTERNOS.md#contas-fase-5).

- [x] Criar rota `/checkout` com endereço, fretes, revisão, pagamento e confirmação.
- [x] Usar Card Payment Brick somente para tokenizar cartão.
- [x] Criar Pix pela Orders API e mostrar QR Code/Copia e Cola.
- [x] Backend recalcula produtos, estoque, fretes e total.
- [x] Criar order do Mercado Pago com chave de idempotência.
- [x] Webhook valida assinatura e consulta o estado real antes de atualizar o pedido.
- [x] Pix e reserva expiram em 30 minutos.
- [x] Pagamento aprovado após expiração tenta reservar novamente; sem estoque, estorna e registra alerta operacional.
- [ ] Aplicar no projeto remoto e homologar Pix/cartão/webhook com as credenciais de teste reais.

> **Status em 21/08/2026:** implementação e validação local concluídas com mocks, incluindo aprovação, recusa, pendência, idempotência e estorno automático. Consulte [`FASE-5-TESTE-LOCAL.md`](./FASE-5-TESTE-LOCAL.md).

Validação local reproduzível, sem chamada externa:

```bash
npm run local:setup
npm run validate:phase5
```

<a id="checkout-fase-6"></a>

### Fase 6 — Painéis e pós-venda

> Antes de iniciar: deixe usuários, responsabilidades operacionais e regras de atendimento prontos conforme a [Fase 6 do guia de contas e serviços externos](./CONTAS-E-SERVICOS-EXTERNOS.md#contas-fase-6).

- Super admin vê pedidos, pagamentos, falhas, remessas e reembolsos.
- Produtor vê somente itens e remessas que pertencem a ele.
- Produtor baixa etiqueta e registra preparo/postagem.
- Reembolso parcial ocorre por remessa completa, nunca por valor livre digitado.
- Remessa já postada bloqueia estorno automático e exige tratamento manual.
- E-mails são enviados por fila idempotente.

<a id="checkout-fase-7"></a>

### Fase 7 — Migração de hospedagem e produção

> Antes de iniciar: conclua a definição fiscal e prepare contas, credenciais, domínio e hospedagem de produção conforme a [Fase 7 do guia de contas e serviços externos](./CONTAS-E-SERVICOS-EXTERNOS.md#contas-fase-7).

- Publicar o mesmo build Vite no Cloudflare Pages ou atualizar Vercel para Pro.
- Atualizar domínio, redirects do Supabase e origens autorizadas do Google.
- Trocar credenciais sandbox por produção somente nos Secrets.
- Registrar webhooks de produção.
- Executar compra real controlada de baixo valor.
- Ativar alertas de uso nos serviços.

Estimativa realista para todo o escopo: **20–30 dias úteis para um desenvolvedor**, sem contar espera por validação de contas, OAuth, textos jurídicos ou dados dos produtores.

---

## 8. Interfaces principais

As rotas serão implementadas como Supabase Edge Functions, não em `/api` da Vercel:

| Função | Responsabilidade |
|---|---|
| `shipping-quotes` | Validar carrinho/endereço e cotar uma origem por produtor |
| `checkout-session` | Recotar, reservar estoque e criar sessão com total server-side |
| `process-payment` | Criar a order Pix/cartão no Mercado Pago |
| `mercadopago-webhook` | Validar e conciliar notificações |
| `melhor-envio-oauth` | Callback e renovação de tokens |
| `fulfillment-worker` | Comprar/gerar etiquetas e processar retentativas |
| `orders` | Listar/detalhar pedidos do cliente autenticado |
| `admin-orders` | Operação administrativa, postagem e reembolsos |

Todas as funções públicas devem:

- validar método HTTP, origem e schema do payload;
- validar JWT quando exigido;
- aplicar rate limit por usuário/IP conforme risco;
- retornar erros no formato `{ "error": { "code": "...", "message": "..." } }`;
- mascarar CPF, e-mail, telefone e tokens nos logs;
- possuir idempotência para pagamento, webhook, estoque, etiqueta, e-mail e estorno.

---

## 9. Critérios para lançamento

O checkout só pode receber clientes reais quando:

1. imagens estiverem fora das linhas do banco;
2. migrations e RLS estiverem versionadas e testadas;
3. todos os produtores ativos tiverem origem, documento, peso, dimensões e estoque preenchidos;
4. Google, confirmação de e-mail e recuperação de senha funcionarem no domínio final;
5. Pix e cartão funcionarem em sandbox;
6. webhook duplicado não duplicar estoque, pedido, etiqueta ou e-mail;
7. duas compras concorrentes não venderem a última unidade duas vezes;
8. cotação e etiqueta funcionarem para dois produtores no mesmo carrinho;
9. produtor não conseguir acessar remessa de outro produtor;
10. cliente não conseguir acessar pedido de outro cliente;
11. manipular preço/frete no navegador não alterar o valor cobrado;
12. reembolso total e parcial estiverem testados;
13. domínio final, HTTPS, termos e privacidade estiverem publicados;
14. hospedagem de produção for Cloudflare Pages ou Vercel Pro;
15. houver backup recente e plano operacional para falhas externas;
16. `npm run build` e `npm run lint` passarem sem erros.

---

## 10. Ordem recomendada

1. Continuar usando a Vercel Hobby durante toda a implementação.
2. Corrigir Storage, migrations e autorização antes de criar pagamentos.
3. Configurar Google e Resend.
4. Criar contas e aplicações sandbox no Mercado Pago e Melhor Envio.
5. Implementar estoque, frete e checkout usando Edge Functions.
6. Homologar o fluxo completo na URL da Vercel.
7. Criar Cloudflare Pages e validar `*.pages.dev` sem mexer no domínio.
8. Obter credenciais de produção e concluir textos/dados operacionais.
9. Migrar o domínio para Cloudflare Pages — ou atualizar Vercel para Pro.
10. Executar compra real controlada e abrir gradualmente ao público.

Essa ordem mantém custo zero durante o desenvolvimento e deixa a migração de hospedagem para o final, sem obrigar a mover o backend ou alterar webhooks.
