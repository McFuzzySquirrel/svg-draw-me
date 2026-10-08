# Contributing

Thank you for helping improve SVG Draw Me. Contributions should preserve the
project's browser-first drawing workflows and keep the document model,
viewport rendering, and SVG export responsibilities separate.

## Development setup

Install the locked dependencies and start the development server:

```bash
npm install
npm run dev
```

## Before opening a pull request

Run the relevant checks locally:

```bash
npm test
npm run build
git diff --check
```

Behavior changes should include or update tests where practical. Keep changes
focused, describe user-visible behavior and known limitations in the pull
request, and update directly related documentation.

## Pull requests and issues

Use the repository issue tracker for reproducible bug reports and feature
discussions. Pull requests should explain the motivation, summarize the
implementation, and call out any browser or SVG compatibility considerations.
Do not include private artwork, secrets, or other sensitive data.

## License

By contributing, you agree that your contributions are submitted under the
same [Apache License 2.0](LICENSE) terms that apply to this project, unless a
separate written agreement states otherwise.
