# Contributing to Larder

- Quantities are stored in base units: grams, millilitres or a plain count. Convert at the edges, never in the database.
- Every schema change goes in `db/schema.sql`, with a migration note in the pull request.
- Route handlers stay thin. Logic lives in `src/lib/`, where it can be tested without a server.
- Run `npm test` and `npm run compass` before every commit.
