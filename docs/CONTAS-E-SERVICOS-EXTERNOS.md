# Contas e serviços externos — guia do responsável

> Guia operacional da Gostudumatu. Revisado em **18 de agosto de 2026**. As telas, regras fiscais e condições comerciais dos serviços podem mudar; confira novamente antes do lançamento.

Este guia complementa o [planejamento técnico do checkout](./CHECKOUT.md).

Este documento explica:

- quais contas precisam ser criadas;
- em qual site criar cada conta;
- qual tipo de conta escolher;
- o que a implementação precisa receber de cada serviço;
- quais credenciais são secretas;
- o que pode ser feito agora, mesmo sem CNPJ;
- o que precisa ser resolvido antes de aceitar pedidos reais.

## Resposta rápida sobre CNPJ e nota fiscal

Podemos continuar desenvolvendo e testando o checkout **sem CNPJ**:

- o Mercado Pago permite ativar uma Conta Negócio usando CPF;
- o Melhor Envio possui sandbox e aceita cadastro de pessoa física;
- pagamentos, fretes, autenticação e e-mails podem ser integrados primeiro em ambiente de teste;
- Vercel e Supabase podem continuar sendo usados durante a implementação.

Isso, porém, não significa que uma operação comercial recorrente possa ser enviada como “não comercial”. Para os envios reais, existem duas situações diferentes:

| Situação do envio | Documento de transporte |
|---|---|
| Venda comercial sujeita a documento fiscal | Nota fiscal; o Melhor Envio solicita os dados do emitente e a chave da NF-e |
| Remessa que legalmente não exige nota fiscal | DC-e — Declaração de Conteúdo Eletrônica |

Desde **6 de abril de 2026**, a declaração usada nas remessas sem nota passou a ser eletrônica. A DC-e não é um substituto opcional para a nota fiscal: ela só pode ser usada quando o remetente e a operação realmente estiverem dispensados de emitir nota.

Como a Gostudumatu pretende receber pagamentos de vendas recorrentes e organizar envios de vários produtores, não devemos classificar automaticamente os pacotes como “envio não comercial” apenas porque ainda não existe CNPJ. Podemos finalizar todo o código e os testes agora, mas a definição de quem é o vendedor fiscal e quem emite a nota deve ser uma condição para o lançamento público.

Fontes oficiais: [Mercado Pago — Conta Negócio com CPF ou CNPJ](https://www.mercadopago.com.br/blog/como-abrir-conta-pj-tendo-conta-pessoal), [Melhor Envio — compra de fretes e documentos fiscais](https://docs.melhorenvio.com.br/docs/compra-de-fretes), [Melhor Envio — NF-e e DC-e na API](https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho) e [Correios — obrigatoriedade da DC-e em 2026](https://saladeimprensa.correios.com.br/arquivos/13666).

## O que criar agora

| Prioridade | Serviço | Criar agora? | Finalidade |
|---:|---|---|---|
| 1 | Mercado Pago | Sim, com CPF | Testar Pix, cartão, estorno e webhooks |
| 2 | Melhor Envio Sandbox | Sim, com CPF | Calcular frete e simular o ciclo das etiquetas |
| 3 | Resend | Sim | Enviar confirmação de conta, pedido e recuperação de senha |
| 4 | Google Cloud | Sim | Permitir login com Google |
| 5 | Supabase | Já existe | Banco, autenticação, funções e segredos do backend |
| 6 | Vercel | Já existe | Hospedar o site durante o desenvolvimento |
| 7 | Melhor Envio Produção | Depois dos testes | Comprar etiquetas reais |
| 8 | Mercado Pago Produção | Depois dos testes | Receber pagamentos reais |
| 9 | Cloudflare Pages | Somente perto do lançamento | Alternativa de hospedagem pública; não é necessária agora |
| 10 | Contador/formalização | Antes do lançamento | Definir CNPJ, emissão fiscal, produtores e repasses |
| 11 | Gov.br/aplicativo DC-e do remetente | Somente se autorizado | Emitir DC-e quando a operação for legalmente dispensada de nota |

## Roteiro enumerado por fases de desenvolvimento

Este roteiro usa as mesmas sete fases do [planejamento técnico](./CHECKOUT.md#7-implementação-técnica). Uma conta pode ser criada antes da fase em que será usada para evitar que aprovação de identidade, DNS ou OAuth paralise o desenvolvimento.

### Mapa rápido

| Fase | O que você precisa providenciar | Para que será usado |
|---:|---|---|
| 1 | Confirmar acessos ao Supabase, Vercel e domínio | Organizar banco, segurança, imagens e ambientes |
| 2 | Criar Mercado Pago com CPF e Melhor Envio Sandbox; entregar dados dos produtos e produtores | Antecipar validações e preparar estoque, pedidos, frete e pagamento |
| 3 | Criar Resend e Google Cloud OAuth | Login, confirmação de e-mail e recuperação de senha |
| 4 | Criar aplicativo OAuth no Melhor Envio Sandbox | Cotar fretes e simular etiquetas de vários produtores |
| 5 | Finalizar aplicação e credenciais de teste do Mercado Pago | Testar Pix, cartão, webhooks e estornos |
| 6 | Preparar usuários de teste e regras operacionais | Validar painéis, separação, postagem, e-mails e reembolsos |
| 7 | Resolver situação fiscal e ativar contas de produção | Fazer compra real controlada e preparar o lançamento |

<a id="contas-fase-1"></a>

### Fase 1 — Base, acessos e segurança

> Esta preparação deve estar concluída antes da [Fase 1 — Base, Storage e segurança do checkout](./CHECKOUT.md#checkout-fase-1).

**Objetivo:** organizar o projeto existente antes de adicionar pedidos e pagamentos.

Você precisa ter pronto:

- [x] acesso de proprietário ao projeto atual do Supabase;
- [x] acesso de proprietário ao projeto da Vercel;
- [x] acesso ao provedor de DNS de `gostodumatu.com.br`;
- [x] autenticação em dois fatores ativada nessas contas;
- [x] confirmação de quem pode receber convites administrativos.

Não é necessário criar Mercado Pago ou Melhor Envio para iniciar esta fase.

A implementação fará:

- baseline e migrations do banco;
- correção das políticas de segurança/RLS;
- separação das chaves públicas e administrativas;
- migração das imagens para o Supabase Storage;
- proteção da criação e administração dos produtores.

**A fase termina quando:** banco e Storage estiverem versionados, acessos administrativos estiverem protegidos e o site atual continuar funcionando.

<a id="contas-fase-2"></a>

### Fase 2 — Produtos, produtores, estoque e preparação das integrações

> Esta preparação deve estar concluída antes da [Fase 2 — Dados comerciais e estoque do checkout](./CHECKOUT.md#checkout-fase-2).

**Objetivo:** transformar produtos estáticos em dados suficientes para reservar estoque, calcular frete e criar pedidos.

Você precisa ter pronto:

- [x] criar a [Conta Negócio do Mercado Pago](#1-mercado-pago) com CPF;
- [x] concluir a validação de identidade e ativar dois fatores no Mercado Pago;
- [x] criar a conta do [Melhor Envio Sandbox](#2-melhor-envio) com CPF;
- [x] informar cada produtor, endereço/CEP de origem e contato operacional;
- [x] informar estoque, peso, altura, largura e comprimento embalado de cada produto;
- [x] informar se algum produto precisa de embalagem ou restrição especial;
- [x] iniciar a consulta com o contador sobre quem será o vendedor fiscal, sem precisar concluir ainda.

O Mercado Pago é criado nesta fase para que a validação da conta não bloqueie a Fase 5. O Melhor Envio Sandbox é criado agora para estar disponível quando a callback OAuth for implementada na Fase 4. Nenhuma cobrança ou etiqueta real será feita.

A implementação fará:

- tabelas de pedidos, itens, pacotes, pagamentos e eventos;
- dados protegidos de expedição por produtor;
- estoque e reservas transacionais;
- snapshots de preços e endereços;
- campos de peso e dimensões usados pelo frete.

**A fase termina quando:** um produto tiver estoque e embalagem completos, cada item estiver ligado ao produtor correto e um pedido puder ser registrado no banco sem pagamento real.

<a id="contas-fase-3"></a>

### Fase 3 — Login, conta do cliente e e-mails

> Esta preparação deve estar concluída antes da [Fase 3 — Autenticação e conta do cliente do checkout](./CHECKOUT.md#checkout-fase-3).

**Objetivo:** identificar o cliente com segurança e permitir que ele acompanhe os próprios pedidos.

Você precisa ter pronto:

- [ ] criar a conta do [Resend](#3-resend);
- [ ] liberar os registros DNS necessários para validar `mail.gostodumatu.com.br`;
- [ ] criar o projeto no [Google Cloud](#4-google-cloud-para-login-com-google);
- [ ] fornecer os textos/nome da tela de consentimento e e-mail de suporte;
- [ ] aprovar os remetentes `nao-responda@...` e `pedidos@...`.

A implementação fará:

- login com Google e e-mail/senha;
- confirmação e recuperação de conta por SMTP;
- cadastro de endereço do cliente;
- páginas de lista e detalhe dos pedidos;
- políticas para cada cliente ver somente seus próprios dados.

**A fase termina quando:** um usuário de teste conseguir criar e recuperar a conta, entrar com Google e visualizar somente os próprios pedidos.

<a id="contas-fase-4"></a>

### Fase 4 — Frete e Melhor Envio Sandbox

> Esta preparação deve estar concluída antes da [Fase 4 — Frete multi-origem do checkout](./CHECKOUT.md#checkout-fase-4).

**Objetivo:** calcular uma remessa por produtor e simular todo o ciclo de uma etiqueta.

Você precisa ter pronto:

- [ ] conta do Melhor Envio Sandbox criada na Fase 2;
- [ ] criar o aplicativo OAuth usando a callback entregue pela implementação;
- [ ] cadastrar Client ID e Client Secret de forma segura;
- [ ] autorizar o aplicativo e permitir o armazenamento seguro dos tokens;
- [ ] revisar endereço, CEP, peso e embalagem de cada produtor/produto;
- [ ] indicar quais transportadoras ou modalidades não devem aparecer ao cliente.

Não precisamos de nota fiscal, CNPJ, saldo ou DC-e real para as simulações do sandbox.

A implementação fará:

- cotação agrupada por produtor;
- nova cotação no servidor antes de fechar o pedido;
- escolha de frete separada por pacote;
- renovação automática dos tokens OAuth;
- simulação de compra, geração, impressão e rastreio da etiqueta.

**A fase termina quando:** um carrinho com dois produtores gerar dois pacotes, cada um com opções e preço de frete próprios, sem expor endereço ou tokens no navegador.

<a id="contas-fase-5"></a>

### Fase 5 — Checkout e Mercado Pago

> Esta preparação deve estar concluída antes da [Fase 5 — Checkout e pagamento](./CHECKOUT.md#checkout-fase-5).

**Objetivo:** substituir a finalização pelo WhatsApp por Pix e cartão integrados ao pedido.

Você precisa ter pronto:

- [ ] Conta Negócio do Mercado Pago criada e validada na Fase 2;
- [ ] aplicação `Gostudumatu Checkout` criada no painel de desenvolvedores;
- [ ] Public Key e Access Token de **teste** cadastrados nos ambientes corretos;
- [ ] comprador e vendedor de teste disponíveis;
- [ ] webhook de teste cadastrado usando a URL entregue pela implementação;
- [ ] definir meios de pagamento aceitos, parcelamento e prazo do Pix;
- [ ] definir quem absorve juros/tarifas quando houver.

Não cadastre ainda o Access Token de produção.

A implementação fará:

- página completa de checkout;
- recálculo de preço, estoque e frete no backend;
- Pix com QR Code e código Copia e Cola;
- cartão tokenizado pelo componente oficial;
- idempotência e validação do webhook;
- expiração da reserva e estorno quando necessário.

**A fase termina quando:** pagamentos de teste aprovados, recusados, pendentes e expirados atualizarem corretamente o pedido, sem duplicar cobrança ou estoque.

<a id="contas-fase-6"></a>

### Fase 6 — Painéis, postagem e pós-venda

> Esta preparação deve estar concluída antes da [Fase 6 — Painéis e pós-venda do checkout](./CHECKOUT.md#checkout-fase-6).

**Objetivo:** dar à equipe e a cada produtor as ferramentas necessárias depois do pagamento.

Você precisa ter pronto:

- [ ] um usuário de teste para o super administrador;
- [ ] um usuário de teste para cada perfil de produtor;
- [ ] definir quem embala, imprime etiqueta, posta e informa problemas;
- [ ] definir prazos de preparo e regras de cancelamento/reembolso;
- [ ] aprovar os modelos de e-mail de pedido, pagamento, postagem e cancelamento;
- [ ] definir um contato de suporte ao cliente.

Nenhuma conta externa nova é obrigatória nesta fase; usamos Supabase, Resend e os sandboxes já configurados.

A implementação fará:

- painel geral de pedidos, pagamentos, pacotes e falhas;
- visão limitada de cada produtor;
- download de etiqueta e registro de preparo/postagem;
- rastreio, retentativas e e-mails transacionais;
- reembolso por remessa e trilha de eventos.

**A fase termina quando:** cada perfil enxergar somente o que lhe pertence e um pedido de teste puder percorrer pagamento, separação, etiqueta, postagem, rastreio e eventual estorno.

<a id="contas-fase-7"></a>

### Fase 7 — Fiscal, produção e lançamento controlado

> Esta preparação deve estar concluída antes da [Fase 7 — Migração de hospedagem e produção do checkout](./CHECKOUT.md#checkout-fase-7).

**Objetivo:** trocar os ambientes de teste por produção com segurança jurídica e operacional.

Você precisa ter pronto:

- [ ] decisão do contador sobre a Gostudumatu ser vendedora ou intermediadora;
- [ ] definição de quem emite a NF-e ou, quando legalmente permitido, a DC-e de cada pacote;
- [ ] CPF/CNPJ, inscrição estadual e documentos de cada remetente exigidos pelo modelo escolhido;
- [ ] conta/aplicação de produção do Melhor Envio e forma de pagamento das etiquetas;
- [ ] credenciais de produção do Mercado Pago;
- [ ] domínio verificado no Resend e Google OAuth fora do modo de teste;
- [ ] termos de uso, privacidade, troca, devolução e atendimento publicados;
- [ ] escolha final entre Vercel em plano comercial compatível ou Cloudflare Pages;
- [ ] alertas de cobrança/limite ativados em todos os serviços.

A implementação fará:

- configuração dos segredos de produção sem alterar o código do checkout;
- webhooks e redirects definitivos;
- domínio e hospedagem final;
- documento fiscal/DC-e ligado a cada remessa conforme a decisão aprovada;
- monitoramento, logs protegidos e alertas;
- uma compra real controlada de baixo valor, seguida de conferência e eventual estorno.

**A fase termina quando:** a compra controlada gerar pagamento, pedido, documento aplicável, etiqueta, e-mail e painel corretos; nenhuma credencial de teste estiver em produção; e o checklist de lançamento estiver aprovado.

### Regra para avançar entre as fases

- Podemos preparar contas de uma fase futura antecipadamente.
- Credenciais de produção só entram na Fase 7.
- Se uma conta externa atrasar, continuamos os módulos independentes e usamos mocks/sandbox quando possível.
- Uma fase só é considerada concluída quando seu critério de término foi testado, não apenas quando o código foi escrito.
- A falta de CNPJ não bloqueia as Fases 1 a 6; a definição fiscal bloqueia somente a entrada em produção da Fase 7.

## 1. Mercado Pago

### Onde criar

- Conta: [Mercado Pago](https://www.mercadopago.com.br/)
- Aplicação de integração: [Painel Mercado Pago Developers](https://www.mercadopago.com.br/developers/panel/app)
- Guia da aplicação: [criar aplicação para Checkout Transparente](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/create-application)

### Qual conta escolher agora

Ative uma **Conta Negócio com CPF** em nome da pessoa responsável pela operação. O próprio Mercado Pago informa que a Conta Negócio pode começar com CPF e depois ser migrada para CNPJ.

Use dados reais do titular:

- nome e CPF;
- telefone e e-mail exclusivos da empresa, se possível;
- validação de identidade solicitada pelo Mercado Pago;
- conta bancária ou chave Pix para retiradas;
- autenticação em dois fatores.

Não é necessário ter CNPJ para começar os testes. A abertura da conta não tem mensalidade, mas pagamentos aprovados têm tarifas conforme o meio e o prazo de recebimento.

### Como criar a integração

1. Entre no painel de desenvolvedores com a conta que receberá os pagamentos.
2. Crie uma aplicação chamada, por exemplo, `Gostudumatu Checkout`.
3. Informe que é uma loja própria desenvolvida por nós.
4. Selecione **Checkout Transparente / Checkout API**, usando a API de Orders quando essa opção aparecer.
5. Abra a área de credenciais e use primeiro as credenciais de teste.
6. Crie as contas de teste de vendedor e comprador indicadas pelo painel.
7. Não ative credenciais de produção no site antes de os testes e a situação fiscal estarem aprovados.

### O que precisamos dessa conta

| Dado | Uso | É secreto? |
|---|---|---|
| Public Key de teste | Inicialização segura do checkout no navegador | Não, pode ficar no frontend |
| Access Token de teste | Criação e consulta dos pagamentos pelo backend | **Sim** |
| Conta de comprador de teste | Testar pagamentos aprovados, recusados e pendentes | Tratar como privada |
| Webhook Secret | Validar que as notificações vieram do Mercado Pago | **Sim** |
| Public Key de produção | Checkout real | Não, mas somente no ambiente de produção |
| Access Token de produção | Cobranças reais | **Sim, crítico** |

A URL do webhook será criada no Supabase. Quando a função estiver pronta, a implementação fornecerá o endereço exato para cadastrar no painel do Mercado Pago.

### Como entregar acesso com segurança

- Convide o desenvolvedor pelo recurso de compartilhamento de credenciais do Mercado Pago, se ele estiver disponível na conta; ou
- cadastre você mesmo os valores secretos no painel do Supabase, nos nomes informados pela implementação.

Nunca envie Access Token, Webhook Secret, senha ou código de autenticação por WhatsApp, e-mail, documentação do repositório ou variável iniciada por `VITE_`.

## 2. Melhor Envio

Sandbox e produção são ambientes separados. Uma conta/aplicação de sandbox não compra etiquetas reais e não substitui a conta de produção.

### Onde criar

- Testes: [Melhor Envio Sandbox](https://sandbox.melhorenvio.com.br/register)
- Produção: [Melhor Envio](https://melhorenvio.com.br/cadastre-se)
- Guia oficial: [criar um aplicativo](https://docs.melhorenvio.com.br/docs/criando-um-novo-aplicativo)
- Autenticação: [OAuth 2 no Melhor Envio](https://docs.melhorenvio.com.br/reference/autenticacao)

### O que fazer agora no sandbox

1. Crie a conta do sandbox com CPF e os dados do responsável.
2. Confirme o e-mail.
3. No painel de integrações, crie um aplicativo chamado `Gostudumatu Sandbox`.
4. A implementação fornecerá a URL exata de retorno OAuth antes de salvar a aplicação.
5. Autorize somente as permissões necessárias para:
   - calcular fretes;
   - inserir, ler e remover itens do carrinho;
   - comprar, gerar, imprimir, cancelar e rastrear etiquetas;
   - consultar os dados do usuário necessários à integração.
6. Autorize o aplicativo para obter Access Token e Refresh Token.
7. Faça todos os testes sem colocar saldo real.

### O que precisamos dessa conta

| Dado | Uso | É secreto? |
|---|---|---|
| Client ID do sandbox | Identificar a aplicação | Evite divulgar sem necessidade |
| Client Secret do sandbox | Autenticar a aplicação | **Sim** |
| Access Token | Chamar a API | **Sim** |
| Refresh Token | Renovar o acesso automaticamente | **Sim, crítico** |
| Endereço de cada produtor | Origem correta do frete | Dado pessoal/operacional |
| Peso e dimensões dos produtos | Cálculo do frete | Não |
| Dados fiscais do remetente | Comprar etiquetas reais | Dado fiscal/pessoal |

O token do Melhor Envio expira e deve ser renovado pelo backend. Os tokens nunca irão para o navegador.

### Quando criar a conta de produção

Crie a conta e uma nova aplicação de produção depois que:

- o cálculo de frete estiver aprovado no sandbox;
- o fluxo de pedido estiver funcionando;
- tivermos definido quem é o remetente fiscal de cada pacote;
- os dados de CPF/CNPJ, inscrição estadual e nota/DC-e estiverem confirmados;
- cada produtor tiver endereço, embalagem, peso e dimensões cadastrados.

Na produção, também será necessário colocar saldo ou usar a forma de pagamento permitida pelo Melhor Envio para comprar etiquetas. A API não cobra mensalidade; o custo é das etiquetas efetivamente compradas e de eventuais serviços contratados.

## 3. Resend

### Onde criar

- Conta: [Resend](https://resend.com/signup)
- Domínios: [configurar domínio de envio](https://resend.com/docs/dashboard/domains/introduction)
- Supabase: [configurar SMTP personalizado](https://supabase.com/docs/guides/auth/auth-smtp)

### Como configurar

1. Crie a conta Resend.
2. Adicione um subdomínio de envio, de preferência `mail.gostodumatu.com.br`.
3. Copie para o provedor de DNS todos os registros solicitados pelo Resend.
4. Aguarde o domínio ficar como verificado.
5. Crie uma API Key exclusiva para a aplicação.
6. Defina remetentes como:
   - `nao-responda@gostodumatu.com.br` para autenticação;
   - `pedidos@gostodumatu.com.br` para pedidos.
7. Configure no Supabase o SMTP do Resend para os e-mails de autenticação.

### O que precisamos dessa conta

| Dado | Uso | É secreto? |
|---|---|---|
| API Key | E-mails transacionais enviados pelo backend | **Sim** |
| Usuário e senha SMTP | E-mails de autenticação do Supabase | **Sim** |
| Domínio verificado | Autorizar os remetentes | Não |
| Endereços `From` | Identificar o remetente | Não |

O plano gratuito pode ser usado no desenvolvimento e em um lançamento pequeno, respeitando os limites atuais do Resend. O limite deve ser conferido novamente antes de abrir o site ao público.

## 4. Google Cloud para login com Google

### Onde criar

- Console: [Google Cloud Console](https://console.cloud.google.com/)
- Instruções específicas: [Supabase Auth com Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

### Como configurar

1. Crie um projeto chamado `Gostudumatu` no Google Cloud.
2. Configure a tela de consentimento OAuth.
3. Informe nome, logotipo, e-mail de suporte, domínio e política de privacidade.
4. Solicite apenas os escopos básicos `openid`, `email` e `profile`.
5. Crie um cliente OAuth do tipo **Web application**.
6. Cadastre as origens do site local, da Vercel e, futuramente, do domínio oficial.
7. Cadastre como URI de redirecionamento a URL exibida pelo provedor Google no painel do Supabase.
8. Copie Client ID e Client Secret para o painel de autenticação do Supabase.

### O que precisamos dessa conta

| Dado | Uso | É secreto? |
|---|---|---|
| Google Client ID | Identificar a aplicação | Não é uma senha |
| Google Client Secret | Troca segura dos códigos OAuth | **Sim** |
| Acesso ao projeto | Ajustar domínio e consentimento | Conceder por convite, nunca compartilhar senha |

O Google poderá manter o aplicativo em modo de teste até os domínios e a tela de consentimento estarem completos. Isso não impede a implementação inicial.

## 5. Supabase — conta já existente

Não crie outro projeto. Primeiro confirme que o projeto atual está em uma organização controlada pela pessoa responsável pela Gostudumatu.

### O que conferir

- a pessoa responsável deve ter função Owner;
- autenticação em dois fatores deve estar ativa;
- os ambientes autorizados devem incluir desenvolvimento, Vercel e domínio oficial;
- backups, limites de uso e e-mails de alerta devem ser revisados antes do lançamento;
- todas as funções do backend devem ser implantadas nesse projeto ou em um projeto separado de homologação, se decidirmos criá-lo.

### O que a implementação usa

| Dado | Onde pode ser usado | É secreto? |
|---|---|---|
| Project URL | Frontend e backend | Não |
| Publishable/anon key | Frontend | Não; ainda depende de RLS correta |
| Secret/service role key | Somente backend | **Sim, crítico** |
| Senha do banco | Migrações e administração | **Sim, crítico** |
| Segredos das Edge Functions | Somente backend | **Sim, crítico** |

É preferível convidar o desenvolvedor para a organização/projeto. Não compartilhe a senha da conta do proprietário.

## 6. Vercel, domínio e Cloudflare

### Vercel

Mantenha a Vercel durante toda a implementação. Ela é suficiente para hospedar o frontend e gerar previews, enquanto o backend sensível fica nas Supabase Edge Functions.

Não precisamos criar outra hospedagem agora. Antes do lançamento, decidiremos entre:

- continuar na Vercel com um plano compatível com uso comercial; ou
- migrar somente o frontend para Cloudflare Pages.

Essa decisão não altera Mercado Pago, Melhor Envio, Supabase ou o banco de dados.

### Domínio e DNS

Precisamos de acesso administrativo ao provedor que controla `gostodumatu.com.br` para:

- apontar o domínio para a hospedagem escolhida;
- validar o domínio no Resend;
- adicionar registros de e-mail, como SPF e DKIM;
- validar o domínio no Google OAuth;
- criar subdomínios se necessário.

O acesso deve ser concedido por convite quando o provedor permitir. Nunca registre senha de domínio no repositório.

### Cloudflare

Não crie a conta agora. Se escolhermos Cloudflare Pages no lançamento, a conta será criada perto da migração e receberá o domínio ou somente os registros DNS necessários.

## Nota fiscal, DC-e e o modelo da Gostudumatu

### O Melhor Envio exige nota fiscal?

Para uma **venda comercial**, sim: a documentação atual do Melhor Envio orienta informar CNPJ, inscrição estadual quando aplicável e a chave da nota fiscal.

Para uma remessa **legalmente dispensada de nota**, o Melhor Envio admite o fluxo não comercial com CPF e DC-e. Transportadora, estado de origem, categoria do produto e condição do remetente podem limitar esse fluxo.

A orientação fiscal oficial também proíbe o uso da DC-e por quem realiza operações frequentes ou em quantidade que revele caráter comercial. Veja [SEFAZ-SP — Declaração de Conteúdo Eletrônica](https://portal.fazenda.sp.gov.br/servicos/dce). A regra decorre do modelo nacional da DC-e, não apenas do sistema de uma transportadora.

Portanto:

- cadastro com CPF não transforma uma venda em remessa não comercial;
- DC-e não deve ser usada para ocultar uma venda habitual;
- emitir uma etiqueta tecnicamente não comprova que a operação está fiscalmente correta;
- no sandbox não precisamos emitir NF-e nem DC-e real;
- no lançamento, cada pacote deve carregar o documento correspondente à operação real.

### Podemos prosseguir sem CNPJ?

**Na implementação e no sandbox: sim.**

**Em vendas reais recorrentes: somente depois de validação contábil/fiscal.** O problema não é a tecnologia ou a criação das contas; é definir corretamente quem vende, quem recebe, quem remete e quem emite cada documento.

O governo informa que o MEI possui dispensas específicas ao vender para pessoa física, mas também apresenta regra própria para produto enviado em venda não presencial. Além disso, a operação da Gostudumatu envolve vários produtores e possível intermediação, o que pode não caber no modelo mais simples sem análise. Consulte [as orientações oficiais sobre nota do MEI](https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/servicos-para-mei/nota-fiscal) e [as perguntas frequentes do Portal do Empreendedor](https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/perguntas-frequentes/nota-fiscal-inscricao-estadual-e-ou-municipal/o-microempreendedor-individual-mei-e-obrigado-1).

### Modelos que o contador deve avaliar

#### Modelo A — Gostudumatu é a vendedora

A Gostudumatu recebe a venda como comércio, emite o documento do produto para o consumidor e depois paga os produtores conforme contratos e documentos de compra.

Consequências prováveis:

- formalização da Gostudumatu;
- conta de produção e dados fiscais em nome da empresa;
- emissão de NF-e do produto;
- escrituração de compras, vendas, estoque e repasses.

#### Modelo B — cada produtor é o vendedor

Cada produtor vende e emite o documento fiscal para o consumidor; a Gostudumatu atua como plataforma/intermediadora e cobra uma comissão ou serviço.

Consequências prováveis:

- cada produtor precisa estar fiscalmente apto a vender e enviar;
- a nota do produto acompanha o pacote daquele produtor;
- a Gostudumatu documenta sua comissão/serviço;
- pagamento centralizado e repasses precisam de tratamento contratual, contábil e tributário;
- produtores rurais que emitem NF-e usando CPF e inscrição estadual precisam ter a compatibilidade confirmada com o Melhor Envio e com a transportadora escolhida.

Como o carrinho pode gerar pacotes de vários produtores, este modelo combina melhor com a origem física dos envios, mas é também mais trabalhoso operacionalmente.

#### Modelo C — uso temporário de DC-e

Só é válido para o produtor/remetente que esteja realmente dispensado de nota naquela operação. Antes de usar esse modelo, o contador ou a SEFAZ-MS deve confirmar por escrito:

- que o remetente não está obrigado a emitir nota;
- que a operação pode usar DC-e;
- que a transportadora aceita esse remetente e tipo de mercadoria;
- quem emitirá a DC-e eletrônica e como a chave chegará ao pedido.

Não adotaremos esse modelo apenas como atalho para lançar sem CNPJ.

Se a SEFAZ-MS ou o contador confirmar que um remetente pode usar DC-e:

1. o remetente deve ter acesso à própria conta de identificação digital vinculada ao CPF;
2. deve usar o emissor/aplicativo oficial da DC-e ou autorizar a emissão pelo fluxo integrado do Melhor Envio;
3. nome, CPF, endereço, destinatário, produtos, quantidades, valores, peso e finalidade precisam corresponder ao pacote real;
4. a chave da DC-e deve ser salva no pacote/pedido antes da compra da etiqueta;
5. a DACE com QR Code deve acompanhar fisicamente a encomenda conforme a orientação da transportadora.

Não crie uma conta compartilhada de DC-e para todos os produtores: cada documento precisa identificar o remetente real. O modo exato de credenciamento deve ser confirmado com a SEFAZ-MS, pois a implementação pode usar o aplicativo do Fisco ou a integração disponibilizada pelo Melhor Envio.

### Perguntas para levar ao contador

Apresente o fluxo descrito no [planejamento técnico do checkout](./CHECKOUT.md) e peça respostas objetivas para:

1. A Gostudumatu será revendedora ou marketplace/intermediadora?
2. Quem é o vendedor fiscal de cada item?
3. Quem deve emitir a NF-e entregue ao consumidor?
4. Cada produtor rural pode emitir NF-e com CPF e inscrição estadual em Mato Grosso do Sul?
5. O Melhor Envio e as transportadoras aceitam esse emitente no fluxo comercial?
6. Como documentar a compra dos produtores, os repasses e a comissão da plataforma?
7. Qual natureza jurídica, atividade e regime tributário são adequados? MEI realmente atende ao modelo, atividades e faturamento previsto?
8. A Gostudumatu precisa emitir NF-e de mercadoria, NFS-e de comissão/serviço ou os dois em situações diferentes?
9. Algum produtor pode usar DC-e? Em quais situações exatas?
10. Quais mudanças de cadastro e documentos eletrônicos de 2026 afetam pessoa física, produtor rural e plataforma?

Para orientação estadual, consulte também a [SEFAZ-MS — documentos fiscais eletrônicos](https://www.sefaz.ms.gov.br/documentos-fiscais-eletronicos/nf-e/). Este guia não substitui a análise de um contador com acesso aos dados reais dos responsáveis e produtores.

## Regras para credenciais e acessos

Nunca colocar no Git, em arquivos `.env` versionados, em mensagens ou em variáveis públicas do frontend:

- Mercado Pago Access Token e Webhook Secret;
- Melhor Envio Client Secret, Access Token e Refresh Token;
- Resend API Key e senha SMTP;
- Google Client Secret;
- Supabase service role/secret key e senha do banco;
- senhas, códigos de autenticação e documentos pessoais.

Credenciais privadas serão cadastradas como segredos das Supabase Edge Functions. Apenas chaves explicitamente públicas, como a Public Key do Mercado Pago e a publishable/anon key do Supabase, podem ir ao frontend.

## Ordem prática recomendada

1. Criar a Conta Negócio do Mercado Pago com CPF e ativar dois fatores.
2. Criar a aplicação e separar as credenciais de teste.
3. Criar a conta do Melhor Envio Sandbox com CPF.
4. Aguardar a implementação fornecer a callback e então criar o aplicativo OAuth.
5. Criar o Resend e validar `mail.gostodumatu.com.br`.
6. Criar o projeto Google Cloud e o cliente OAuth.
7. Confirmar propriedade e convites no Supabase, Vercel e provedor de domínio.
8. Desenvolver e validar todo o checkout em sandbox.
9. Levar o modelo de venda e envio ao contador/SEFAZ-MS.
10. Somente depois da decisão fiscal, criar/ativar credenciais de produção e comprar a primeira etiqueta real.

## Checklist do responsável

- [ ] Mercado Pago Conta Negócio criada com CPF e identidade validada.
- [ ] Autenticação em dois fatores ativada no Mercado Pago.
- [ ] Aplicação `Gostudumatu Checkout` criada com credenciais de teste.
- [ ] Melhor Envio Sandbox criado com CPF.
- [ ] Aplicação OAuth do sandbox criada após receber a callback.
- [ ] Resend criado e domínio de e-mail validado.
- [ ] Google Cloud e cliente OAuth criados.
- [ ] Responsável confirmado como Owner do Supabase e Vercel.
- [ ] Acesso ao DNS de `gostodumatu.com.br` confirmado.
- [ ] Segredos cadastrados diretamente no Supabase, sem entrar no Git.
- [ ] Contador escolhido e reunião fiscal realizada antes do lançamento.
- [ ] Definido quem emite o documento de cada pacote.
- [ ] Credenciais de produção ativadas somente após os testes e a validação fiscal.
