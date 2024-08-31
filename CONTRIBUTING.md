# Contributing to rapid

First off, thank you for considering contributing to rapid! Your help is essential to keep improving the project.

## Development Setup

This project uses [`pnpm`](https://pnpm.io) as the package manager, make sure to [install](https://pnpm.io/installation) it first!
```bash
git clone git@github.com:nlfmt/rapid.git
cd rapid
pnpm install
pnpm build
```

### How to test
First, run the dev script:
```bash
pnpm dev
```

This will rebuild the package on changes, and link it globally. \
In any project where you want to test the changes, run
```bash
pnpm link -g @nlfmt/rapid
```

This will use the local version of the package instead of the one from the registry.
You can also do this in the rapid project itself to test the changes in the [examples](examples).

### Linting

Before submitting a pull request, make sure to lint your code:
```bash
pnpm lint
```

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue [here](https://github.com/nlfmt/rapid/issues) and use the bug report template.

### Suggesting Enhancements

Suggestions are always welcome! Please open an issue [here](https://github.com/nlfmt/rapid/issues) and use the feature request template.

### Submitting Pull Requests

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/YourFeature`).
3. Make your changes.
4. Create a changeset describing your changes (`pnpm changeset`).
5. Commit your changes (`git commit -m 'Add some feature'`).
6. Push to the branch (`git push origin feature/YourFeature`).
7. Open a pull request.

## Style Guides

### Code Style

Please follow the coding style used in the project. There is a `.prettierrc` config, \
so if you're using an editor with Prettier support, it should format the code correctly. \

This project uses:
- 2 spaces for indentation
- double quotes for strings
- no semicolons
- spacing in braces and brackets

### Commit Messages

- Use the present tense ("add feature" not "added feature").
- Use the imperative mood ("move code to..." not "moves code to...").
- Limit the first line to 72 characters or less.

### Branch Naming

- Use `feature/` for new features.
- Use `fix/` for bug fixes.
- Use `chore/` for changes to the build process or auxiliary tools.
- Use `docs/` for changes to documentation.


If you have any questions, feel free to ask in the [Discussions](https://github.com/nlfmt/rapid/discussions).