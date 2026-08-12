# Checkout no Site — Gostudumatu

Documento de planejamento para substituir o fluxo atual de finalização via WhatsApp por um checkout completo integrado no site `https://gostodumatu.vercel.app/`, com pagamento processado pelo próprio site.

---

## 1. Contexto e Motivação

Hoje, o único caminho de compra é o `CartDrawer` montar uma mensagem e abrir o WhatsApp (`src/components/CartDrawer.tsx:14-24`). Pagamento, frete e confirmação são combinados manualmente. Esse fluxo:

- Não gera pedido registrado, dificultando controle de estoque, financeiro e histórico do cliente.
- Depende 100% da disponibilidade do vendedor para fechar a venda.
- Não permite pagamento online (Pix/cartão/boleto) — pagamento é combinado por fora.

A meta é manter o site como ponto único de venda: o cliente escolhe produtos, preenche dados de entrega, paga online e recebe confirmação automática.

---

## 2. Premissas e Decisões Técnicas

| Decisão | Escolha | Justificativa |
|---|---|---|
| Gateway de pagamento | **Mercado Pago Checkout Bricks** (embed no site) | Suporta Pix, cartão e boleto; não redireciona para domínio externo; boa documentação; funciona com CNPJ/MEI. |
| Backend de pagamento | **Vercel Serverless Functions** (`/api/*`) | Mantém tudo dentro do mesmo deploy, sem custo extra, secret keys nunca vão pro front. |
| Persistência de pedidos | **Supabase** (já em uso) | Tabela `orders` + `order_items` + `order_events`. |
| Notificação de pagamento aprovado | **Webhook Mercado Pago → Vercel Function → Supabase** | Idempotente, com verificação de assinatura. |
| Cálculo de frete | **Melhor Envio** (agregador de Correios + transportadoras) | API REST unificada, sem contrato mínimo, sandbox completo, gratuito (paga só por venda processada). Correios direto exige contrato PJ e só vale para alto volume. |
| Fallback de frete | Tabela fixa por região para MVP | Se Melhor Envio cair, evita travar checkout. |
| Armazenamento de dados sensíveis | **Nenhum dado de cartão no nosso banco** | Mercado Pago tokeniza; só guardamos `payment_id` e últimos 4 dígitos se necessário. |

> **Substituível depois:** qualquer gateway com API similar (Stripe, PagSeguro, Asaas) encaixa nesta mesma arquitetura.

---

## 3. Fases de Implementação

Estimativa total: **~5 a 8 dias úteis** para um dev solo experiente no stack. Pode ser paralelizado por 2 devs em ~3-4 dias.

### Fase 0 — Preparação e Compliance (½ dia)

**Objetivo:** liberar a conta no Mercado Pago e configurar a Vercel.

Tarefas:
- [ ] Criar conta de vendedor no Mercado Pago (CNPJ ou MEI). Validar conta, dados bancários, antifraude.
- [ ] Obter `Access Token` de produção e de sandbox (teste).
- [ ] Configurar webhook URL no painel do MP apontando para `https://gostodumatu.vercel.app/api/webhooks/mercadopago`.
- [ ] No painel Vercel, adicionar variáveis:
  - `MERCADOPAGO_ACCESS_TOKEN` (production)
  - `MERCADOPAGO_WEBHOOK_SECRET` (opcional, recomendado)
  - `MERCADOPAGO_PUBLIC_KEY` (usado no front)
- [ ] Criar conta no **Melhor Envio** (melhorenvio.com.br), gerar token de aplicação e cadastrar dimensões padrão dos pacotes (peso médio dos produtos artesanais).
- [ ] Adicionar `MELHORENVIO_TOKEN` e `MELHORENVIO_SANDBOX=true` (na dev) nas env vars da Vercel.
- [ ] Cadastrar CEP de origem (endereço de envio dos produtores — perguntar ao João).

**Entregável:** credenciais configuradas e webhook registrado em modo teste.

---

### Fase 1 — Modelo de Dados no Supabase (½ dia)

**Objetivo:** tabelas para registrar pedidos.

Tarefas:
- [ ] Migration SQL com tabelas:
  - `orders` (id, customer_name, customer_email, customer_phone, customer_cpf, shipping_cep, shipping_street, shipping_number, shipping_city, shipping_state, subtotal, shipping_cost, total, status, payment_provider, payment_id, payment_method, created_at, updated_at)
  - `order_items` (id, order_id FK, product_id FK, product_name_snapshot, unit_price, quantity, line_total)
  - `order_events` (id, order_id FK, event_type, payload JSONB, created_at) — auditoria
- [ ] Status enum: `pending_payment`, `paid`, `rejected`, `cancelled`, `shipped`, `delivered`.
- [ ] RLS: leitura pública desabilitada; leitura pelo `service_role`; escrita só via backend.
- [ ] Função RPC `get_order_for_tracking(order_id, email)` para página pública de rastreio (sem expor tudo).

**Entregável:** migrations aplicadas em dev; tipos TS gerados.

---

### Fase 2 — Backend de Pagamento (Vercel Functions) (1–1.5 dias)

**Objetivo:** três endpoints serverless.

Arquivos a criar em `/api`:
- `api/payments/create-preference.ts` — POST: recebe `{ items, customer, shipping }`, valida, recalcula preços consultando Supabase (nunca confiar no preço do front), cria preferência no MP, retorna `init_point` + `preference_id` + `order_id` interno.
- `api/webhooks/mercadopago.ts` — POST: recebe notificação, valida assinatura, busca status do pagamento na API do MP, atualiza `orders` + insere em `order_events`. Idempotente (checar `order_events.event_type` único por `payment_id`).
- `api/orders/[id].ts` — GET: retorna pedido para a página de sucesso (via token assinado gerado no momento da criação).

Padrões:
- TypeScript com `vercel.json` config.
- Cliente MP: SDK oficial `mercadopago` no Node runtime.
- Logs estruturados (`console.info`/`console.error` com JSON).
- Variáveis de ambiente validadas no boot da função.
- Erros padronizados: `{ error: { code, message } }`.

**Entregável:** 3 endpoints testáveis via curl/Postman em ambiente de dev.

---

### Fase 3 — UI de Checkout (2 dias)

**Objetivo:** telas para finalizar compra dentro do site.

Componentes novos em `src/components/checkout/`:
- `CheckoutDialog.tsx` — modal/wizard de 3 passos (Endereço → Pagamento → Confirmação).
- `AddressForm.tsx` — campos: nome, email, telefone, CPF, CEP (com busca ViaCEP para auto-preencher rua/cidade/UF), número, complemento.
- `PaymentBrick.tsx` — wrapper do `PaymentBrick` do Mercado Pago Bricks. Props: `amount`, `publicKey`, `preferenceId`.
- `OrderSuccess.tsx` — tela pós-pagamento com número do pedido e link de rastreio.
- `OrderTracking.tsx` — página pública `/pedido/:id` (acessível sem login, via token).

Refatorar `src/components/CartDrawer.tsx`:
- Trocar botão "Finalizar pelo WhatsApp" por "Finalizar compra".
- Adicionar botão secundário "Continuar comprando" e link para checkout.

Nova rota: `src/pages/OrderTracking.tsx` e registro em `App.tsx`/router.

Bibliotecas adicionais:
- `react-hook-form` + `zod` (já instalados) para validação do formulário.
- `@mercadopago/sdk-react` para carregar o Brick no front.

**Entregável:** fluxo visual completo, do carrinho até a tela de sucesso.

---

### Fase 4 — Integração End-to-End e Sandbox (1 dia)

**Objetivo:** fluxo real em modo de teste.

Tarefas:
- [ ] Usar `MERCADOPAGO_ACCESS_TOKEN` de sandbox.
- [ ] Cartão de teste do MP (`5031 4332 1540 6351`, qualquer CVV, futuro) para validar fluxo de cartão.
- [ ] Pix teste via QR gerado pelo Brick.
- [ ] Validar webhook em dev: usar `ngrok` ou `vercel dev --listen` para expor `localhost` ao MP.
- [ ] Testar idempotência: enviar webhook duplicado e confirmar que o pedido não muda de estado duas vezes.
- [ ] Edge cases: usuário fecha a janela durante o pagamento → pedido fica `pending_payment` → webhook converte para `paid` mesmo assim.
- [ ] Confirmar que voltar do Brick (botão "voltar") leva à tela "Pagamento pendente" com opção de tentar de novo.

**Entregável:** todos os fluxos validados com transações de teste reais.

---

### Fase 5 — Endurecimento e Produção (1 dia)

**Objetivo:** código pronto para receber dinheiro real.

Checklist de segurança:
- [ ] **Nunca confiar no preço enviado pelo front** — sempre recalcular via Supabase antes de criar preferência.
- [ ] Validar assinatura do webhook (`x-signature` header com HMAC SHA256).
- [ ] Rate-limit básico nas rotas públicas (`/api/payments/create-preference`).
- [ ] Logs não expõem dados sensíveis (mascarar CPF, cartão, email).
- [ ] CORS restrito ao domínio `gostodumatu.vercel.app`.
- [ ] Timeout de sessão: pedido `pending_payment` expira em 30 min → libera estoque e marca como `expired`.

Checklist funcional:
- [ ] Página `/admin/pedidos` (já existe `Admin.tsx`) — listar pedidos com filtros por status e data.
- [ ] Email transacional de confirmação (envio via Supabase Edge Function + Resend/SendGrid — opcional no MVP, pode ir como `toast` + número na tela).
- [ ] Botão "Ajuda" WhatsApp mantido em página de suporte para casos excepcionais.

Deploy:
- [ ] Variáveis de produção configuradas na Vercel.
- [ ] Webhook de produção registrado.
- [ ] Teste com Pix real de R$ 0,01.

**Entregável:** produção estável com primeira venda real.

---

### Fase 6 — Pós-Produção (contínuo, fora do escopo inicial)

Melhorias incrementais:
- Cálculo real de frete via Correios (substituir tabela fixa).
- Cupons de desconto (campo `coupon_code` em `orders`, validação server-side).
- Parcelamento sem juros customizado.
- Painel do cliente com histórico (`/minhas-compras`).
- Split de pagamento com produtores (Marketplace API do MP).
- Sistema de rastreamento real (integração com transportadora).

---

## 4. Estimativa Consolidada

| Fase | Descrição | Tempo | Dependência |
|---|---|---|---|
| 0 | Preparação/compliance (MP + Melhor Envio) | 0.5 dia | — |
| 1 | Modelo de dados Supabase | 0.5 dia | — |
| 2 | Backend Vercel Functions | 1–1.5 dias | Fase 0, 1 |
| 3 | UI de checkout | 2 dias | Fase 1 |
| 4 | Integração end-to-end (sandbox) | 1 dia | Fase 2, 3 |
| 5 | Endurecimento + produção | 1 dia | Fase 4 |
| **Total** | **Solo dev** | **~5.5–7 dias úteis** | |
| **Total** | **2 devs paralelos** | **~3–4 dias úteis** | |

---

## 5. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Conta MP reprovada por inconsistência cadastral | Média | Alto | Fase 0 começa validando conta antes de codar. |
| Webhook perdido (MP caiu, rede) | Baixa | Médio | Cron diário (`/api/cron/reconcile-orders`) que consulta pagamentos `pending_payment` > 30 min na API do MP. |
| Cliente fecha o browser antes do webhook | Alta | Médio | Pedido fica `pending_payment` no banco; ao reentrar `/pedido/:id`, botão "Já paguei? Verificar" força re-sync via API do MP. |
| Mudança no frete quebra checkout | Média | Médio | Fallback de tabela fixa por região se Melhor Envio retornar erro/timeout (>3s). |
| Bug de cálculo no front permite pagar menos | Baixa | Crítico | Recalcular preço SEMPRE no backend a partir do `product_id` salvo no Supabase. |

---

## 6. Arquivos que Serão Criados/Modificados

**Novos:**
```
api/
  payments/
    create-preference.ts
  webhooks/
    mercadopago.ts
  orders/
    [id].ts
  cron/
    reconcile-orders.ts          # Fase 5+
supabase/
  migrations/
    20260812_create_orders.sql
src/
  components/
    checkout/
      CheckoutDialog.tsx
      AddressForm.tsx
      PaymentBrick.tsx
  pages/
    OrderTracking.tsx
  lib/
    checkout.ts                  # cliente para chamar /api/payments
    shipping.ts                  # wrapper do Melhor Envio (chamada client-side)
docs/
  CHECKOUT.md                    # este arquivo
```

**Modificados:**
```
src/components/CartDrawer.tsx    # botão WhatsApp → "Finalizar compra"
src/pages/Admin.tsx              # nova aba Pedidos
src/App.tsx (ou router)          # rota /pedido/:id
package.json                     # adiciona: mercadopago, @mercadopago/sdk-react
```

---

## 7. Critérios de Pronto (Definition of Done)

A feature é considerada entregue quando:

1. Cliente consegue comprar sem sair do site, em celular e desktop.
2. Pagamento por Pix e cartão funcionam em sandbox.
3. Webhook atualiza o status do pedido em até 30 segundos após pagamento.
4. Pedido aparece no painel admin com todos os dados corretos.
5. Tentativa de manipular preço no front é bloqueada (teste manual com DevTools).
6. Build passa, lint sem novos warnings, deploy em produção sem erro.
7. Documentação deste arquivo reflete o que foi feito (atualizar após cada fase).

---

## 8. Como Iniciar

Ordem recomendada de execução real:

1. **Validar Fase 0** — abrir conta MP HOJE, leva 1-3 dias úteis para aprovar.
2. Em paralelo, começar **Fase 1** (migrations) e **Fase 3** (UI estática sem pagamento) — não dependem do MP.
3. Quando MP aprovar, implementar **Fase 2** (backend) usando credenciais sandbox.
4. Conectar front com back (**Fase 4**).
5. Subir para produção (**Fase 5**) quando estiver 1 semana estável em sandbox.

Essa ordem minimiza tempo ocioso aguardando aprovação do gateway.
