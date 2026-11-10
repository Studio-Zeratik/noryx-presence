# Contributing

Thanks for wanting to help with NoryxBot Presence.

- **Bugs and ideas:** open an issue with what you expected, what happened, and how to reproduce it.
- **Changes:** open a pull request against `main`. Keep it focused on one thing, and explain why.
- **Before sending:** `npm run check` (types) and `npm test` must pass. Add a test when you fix a bug or
  add a feature.
- **Compatibility:** the API answers in the same format as the usual presence APIs. Don't rename or remove
  fields; new fields are welcome.
- **Privacy first:** nothing may be written to disk, and no more data than needed may be kept, even in
  memory.
- **Never commit secrets.** The `.githooks` pre-commit check blocks tokens; keep yours in `.env`.

By contributing, you agree that your contribution is licensed under the project's licence (AGPL-3.0). You also
grant Studio Zératik inc. a permanent, worldwide and free right to use, change and share your contribution under
other licence terms too, including in its own services and paid offers. You confirm that the contribution is your
own work and that you have the right to give it.
