# Plano

Plano is a full-stack learning and showcase application organized as a single repository.

## Repository structure

```text
plano/
├── Backend/   # NestJS API (to be scaffolded)
├── Common/    # Shared contracts and framework-independent types
└── Frontend/  # Angular application
```

The three boundaries are intentionally separate. `Frontend` and `Backend` may depend on `Common`; `Common` must not depend on either application.

## Frontend

Install and run from the repository root:

```bash
npm --prefix Frontend install
npm run start:front
```

Other root commands:

```bash
npm run frontend:build
npm run frontend:test
```

The development server is available at `http://localhost:4200/`.

Once the NestJS project is scaffolded in `Backend`, run it with:

```bash
npm run start:back
```
