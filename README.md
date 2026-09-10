# lakotaloop.stream

A minimal video page: a black screen with a centered play button. Click play
to enter fullscreen and start the video with sound. The picture stays centered, with black
bars wherever the viewport and video proportions differ. When the video ends,
fullscreen closes and the initial play button returns, ready to replay from the
beginning. Shaka Player handles all stream playback,
with the browser's built-in controls for pausing, seeking, volume, and fullscreen.

### Getting started

Follow the steps below to get the app up and running in no time.

#### Node setup (NVM and npm)

Install [nvm](https://github.com/nvm-sh/nvm) to manage Node versions:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.4/install.sh | bash
```

From the repository root, install and activate the Node version selected by
`.nvmrc`, which matches the Node 26 version used in CI:

```sh
nvm install
nvm use
```

npm is installed with Node and is only used to install pnpm globally.

#### pnpm setup

This project requires [pnpm](https://pnpm.io/) 12 or newer. Install it globally with:

```sh
npm install -g pnpm
```

#### Project setup

Run the following command to install the dependencies of the app:

```sh
pnpm install
```

#### Build and run in development mode

Run the app in development mode, and listen on all network interfaces:

```sh
pnpm dev
```

This command uses Vite to fire up a local server, with Hot Reloading support. Visit the provided link in your web browser to see the app in action.

#### Build the app for production

Create an optimized and minified version of the app:

```sh
pnpm build
```

This will create a production version of the app in the `dist` folder.

The build uses TypeScript 7 through the `@typescript/native` npm alias, which
provides the `tsc` command. The `typescript` dependency aliases Microsoft's
`@typescript/typescript6` compatibility package because typescript-eslint still
requires the TypeScript 6 compiler API. This follows Microsoft's
[side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

#### Run test cases

Run the test cases to ensure everything is working as expected:

```sh
pnpm test
```

#### Run the linter

Run the linter to check for code quality and style issues:

```sh
pnpm lint
```

#### Run the formatter

Run the formatter to ensure code is formatted consistently:

```sh
pnpm format
```

#### Audit new dependencies

After adding new dependencies, check for security issues with:

```sh
pnpm audit-ci
```
