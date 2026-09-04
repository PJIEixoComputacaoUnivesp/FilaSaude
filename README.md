# FilaSaúde 🏥

**Informação pública sobre unidades de pronto atendimento, de forma simples e acessível.**

O **FilaSaúde** é uma plataforma web desenvolvida como **Projeto Integrador da UNIVESP**, com o objetivo de facilitar a consulta de informações públicas sobre unidades que realizam pronto atendimento pelo SUS em determinada região.

[![React](https://img.shields.io/badge/React-TypeScript-61DAFB.svg)](https://react.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-API-E0234E.svg)](https://nestjs.com/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33.svg)](https://playwright.dev/)

---

## 💡 O que é o FilaSaúde?

Informações sobre unidades públicas de saúde podem estar distribuídas entre diferentes portais e bases governamentais.

O **FilaSaúde** busca centralizar essas informações e apresentá-las de maneira clara, organizada e acessível.

### Pergunta do projeto

> **Como facilitar a consulta de informações sobre unidades públicas de pronto atendimento disponíveis em determinada região?**

A plataforma terá caráter **exclusivamente informativo**, utilizando dados provenientes de fontes públicas.

### Objetivos

* 🏥 Facilitar a consulta de unidades de pronto atendimento
* 📍 Permitir buscas por região ou localização
* 🗺️ Apresentar unidades e suas localizações
* 📋 Organizar informações públicas em uma única interface
* 🔎 Facilitar o acesso à fonte original dos dados

---

## ⚠️ Importante

O **FilaSaúde não é uma plataforma de orientação médica**.

A aplicação:

* não realiza diagnóstico;
* não realiza triagem;
* não avalia sintomas;
* não fornece orientação médica;
* não recomenda qual estabelecimento o usuário deve procurar;
* não determina qual unidade é mais adequada para uma situação clínica;
* não substitui os canais oficiais de saúde ou emergência.

As informações exibidas dependem da disponibilidade e atualização das respectivas fontes públicas.

---

## ✨ Funcionalidades

### Inicialmente

✅ Consulta de unidades de pronto atendimento
✅ Busca por localização
✅ Listagem de estabelecimentos
✅ Visualização de endereço e localização
✅ Consulta de informações públicas disponíveis
✅ Identificação da fonte dos dados

### Possíveis evoluções

🚧 Visualização das unidades em mapa
🚧 Busca por proximidade geográfica
🚧 Filtros por características da unidade
🚧 Integração com diferentes fontes públicas
🚧 Melhorias de acessibilidade e experiência mobile

> A proximidade geográfica será apresentada apenas como informação e não como recomendação médica.

---

## 🛠️ Tecnologias

**Frontend:** React, TypeScript
**Backend:** NestJS, TypeScript
**Testes E2E:** Playwright
**Testes:** Jest / Vitest
**Banco de dados:** PostgreSQL
**Infraestrutura:** Docker

---

## 🏗️ Arquitetura

O projeto será dividido principalmente entre uma aplicação frontend e uma API backend.

```text
┌─────────────────────┐
│       Usuário       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│        React        │
│      Frontend       │
└──────────┬──────────┘
           │
           │ HTTP / REST
           ▼
┌─────────────────────┐
│       NestJS        │
│        API          │
└───────┬───────┬─────┘
        │       │
        ▼       ▼
┌────────────┐  ┌──────────────────┐
│ PostgreSQL │  │  Fontes públicas │
│            │  │  de informações │
└────────────┘  └──────────────────┘
```

O backend será responsável por integrar, organizar e padronizar os dados públicos antes de disponibilizá-los para o frontend.

---

## 📁 Estrutura

```text
fila-saude/
├── apps/
│   ├── web/          # React
│   └── api/          # NestJS
│
├── e2e/              # Playwright
├── docs/
├── docker-compose.yml
├── package.json
└── README.md
```

---

## 🚀 Executando o projeto

```bash
git clone <url-do-repositorio>
cd fila-saude

pnpm install
pnpm dev
```

Com Docker:

```bash
docker compose up
```

---

## 🧪 Testes

```bash
# Testes
pnpm test

# Testes end-to-end
pnpm playwright test
```

Os testes E2E com **Playwright** serão utilizados para validar os principais fluxos da aplicação, como pesquisa, visualização de unidades e tratamento de resultados.

---

## 📊 Dados

O FilaSaúde utilizará informações provenientes de **fontes públicas**, priorizando dados disponibilizados por órgãos e instituições oficiais.

Sempre que possível, a aplicação apresentará também informações sobre a origem dos dados, permitindo maior transparência e rastreabilidade.

```text
Fonte pública
     │
     ▼
Coleta dos dados
     │
     ▼
Normalização
     │
     ▼
API FilaSaúde
     │
     ▼
Interface Web
```

---



**FilaSaúde 🏥 — facilitando o acesso a informações públicas sobre pronto atendimento pelo SUS.**
