# Fase 1 — teste local

O ambiente descrito aqui usa apenas containers locais. Nenhum comando desta página aplica migrations ou funções no projeto remoto.

## Preparar uma vez

```sh
npm run local:start
npm run local:setup
```

O primeiro comando pode demorar porque baixa as imagens Docker do Supabase. O segundo cria `.env.local`, dados de demonstração e dois usuários:

| Perfil | E-mail | Senha |
|---|---|---|
| Super admin | `admin@local.test` | `TesteLocal123!` |
| Produtor | `produtor@local.test` | `TesteLocal123!` |

## Abrir o site

```sh
npm run dev
```

- Site: <http://127.0.0.1:8080>
- Painel: <http://127.0.0.1:8080/admin>
- Supabase Studio local: <http://127.0.0.1:54323>

## Checklist manual

1. Abra a home e confirme os dois produtos de teste.
2. Entre em `/admin` como super admin e crie um produtor.
3. Cadastre um produto com uma imagem; no Studio, confirme que `products.image` contém uma URL e não `data:image/...`.
4. No Storage, confirme que o arquivo está no bucket `catalog-images` e em formato WebP.
5. Saia e entre como produtor; altere sua loja e seu produto.
6. Confirme que o produtor não consegue alterar itens do outro produtor.

## Validação automatizada

```sh
npm run validate:phase1
```

Esse comando testa papéis, RLS entre produtores, políticas do Storage, catálogo público e criação administrativa pela Edge Function.

Para recriar o banco local do zero:

```sh
npm run local:reset
npm run local:setup
```

Para encerrar os containers:

```sh
npm run local:stop
```
