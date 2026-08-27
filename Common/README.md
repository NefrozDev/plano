# Plano Common

This directory contains framework-independent contracts and deterministic mock data shared by the Angular frontend and NestJS backend.

Do not place Angular- or NestJS-specific implementation code here.

`PlanoDataAdapter` is the persistence port. The frontend currently supplies an
in-memory adapter for isolated tests and a browser `localStorage` adapter at
runtime. A future REST/database implementation can satisfy the same contract.
