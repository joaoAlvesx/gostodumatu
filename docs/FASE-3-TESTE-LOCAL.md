# Fase 3 — teste local

O ambiente descrito aqui usa apenas containers locais. Os e-mails locais aparecem no Mailpit e não são enviados pelo Resend.

## Preparar uma vez

Depois de alterar configurações de autenticação, reinicie os containers:

```sh
npm run local:stop
npm run local:start
npm run local:setup
```

O setup cria dados de demonstração, um endereço, um pedido e três usuários:

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
- Login: <http://127.0.0.1:8080/entrar>
- Minha conta: <http://127.0.0.1:8080/minha-conta>
- E-mails locais: <http://127.0.0.1:54324>
- Supabase Studio local: <http://127.0.0.1:54323>

## Checklist manual local

1. Entre como `cliente@local.test` e confirme que **Minha conta** mostra os dados e o endereço de demonstração.
2. Altere os dados pessoais, cadastre outro endereço e marque-o como principal.
3. Abra **Pedidos**, confira o pedido de demonstração e acesse seus itens, valores e endereço de entrega.
4. Saia, abra `/cadastro` e crie uma conta com outro e-mail.
5. No Mailpit, abra a confirmação recebida e confirme que o link retorna ao site com a sessão ativa.
6. Saia novamente, use **Esqueci minha senha**, abra o e-mail no Mailpit e defina uma nova senha.
7. Tente abrir `/minha-conta` sem sessão e confirme o redirecionamento para `/entrar`.

## Validação automatizada

```sh
npm run validate:phase3
```

Esse comando testa login por senha, isolamento de perfis, cadastro protegido de endereços, leitura exclusiva dos próprios pedidos e itens, bloqueio para visitantes e impossibilidade de o cliente alterar o estado do pedido diretamente.

## Checklist do ambiente remoto

No Supabase, confirme antes de testar no domínio publicado:

- **Authentication > URL Configuration:** Site URL `https://gostodumatu.com.br` e `http://127.0.0.1:8080/auth/callback`, `https://gostodumatu.com.br/auth/callback` e `https://gostudumatu.vercel.app/auth/callback` na lista de redirecionamentos;
- **Authentication > Providers > Email:** cadastro e confirmação de e-mail habilitados;
- **Authentication > Providers > Google:** Client ID e Client Secret do Google cadastrados;
- **Authentication > SMTP:** SMTP personalizado habilitado com remetente verificado no Resend.

Colocar chaves em **Edge Function Secrets** não substitui as configurações de Google e SMTP nas telas de Authentication.

No Google Cloud, a URI autorizada do cliente OAuth deve ser a callback do Supabase Auth:

```text
https://vzvbcewvdqcerogwsjeu.supabase.co/auth/v1/callback
```

Depois confirme no site publicado:

1. criação e confirmação de uma conta usando um e-mail real;
2. recuperação de senha recebida pelo Resend;
3. entrada com Google e retorno para `/minha-conta`;
4. acesso restrito aos pedidos da conta autenticada.

Para encerrar os containers:

```sh
npm run local:stop
```
