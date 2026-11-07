# Sleep tracker API

A small REST API for learning Node and Express back-end skills.
Stack: Node, Express, TypeScript (ES modules), PostgreSQL (pg), Vitest + supertest.

## How to work with me
- I'm a front-end developer learning back-end. Explain each step in plain
  language before writing code, and keep changes small.
- Don't add libraries without telling me why.
- If I can't explain a piece of code, I'll ask. Teach me, don't just fix it.

## Security rules
- Never read, print or commit `.env` or any file containing secrets.
- Database credentials come from environment variables only.
- Use parameterised SQL queries only, never build SQL from user input.
- `.env` stays in `.gitignore`. Keep `.env.example` updated with names only.

## Code conventions
- Structure: routes/, controllers/, db/ (one small module for the pool).
- One central error handler. Async errors must reach it.
- Validate all input, return correct status codes.
- Tests for each endpoint.

## Commands
- `npm run dev` start locally
- `npm test` run tests