# React Component Hover Inspector

https://github.com/user-attachments/assets/1c3d663d-2521-4174-9c67-9835e83770c2

A Manifest V3 Chrome extension for identifying React component names directly
on local React and Next.js pages.

## How it works

- Click the extension toolbar button to enable or disable inspection for the
  current tab.
- While enabled, move the pointer over an element to highlight it and display
  the DOM tag, nearest meaningful React component name, and element dimensions.
- Click an inspected element to pin the selection. Click the pinned element
  again to release it and resume normal hover inspection.
- Press `Ctrl+Shift+X` to move from the nearest accepted React component to its
  next meaningful owner. Pinning first keeps the inspected DOM element stable
  while navigating through wrapper components.
- Use the clipboard button in the pinned label to copy the resolved component
  name.
- Use the source button to open the inspected JSX node in your configured IDE
  when `code-inspector-plugin` metadata is available.
- The inspector checks React DOM properties such as `__reactFiber$`,
  `__reactInternalInstance$`, and `__reactProps$`, then walks up the Fiber tree.
- React 19 Server Components are resolved through React DevTools metadata when
  available and Fiber `_debugInfo` virtual component entries otherwise.
- Intrinsic-style library wrappers such as `motion.div` and `styled.div` are
  skipped so traversal continues to the nearest uppercase user component.
- The toolbar badge displays `ON` while the inspector is active.

The extension is intentionally limited to `localhost` and `127.0.0.1` over HTTP
or HTTPS. Chrome match patterns apply to every port, including `3000` and
`3004`.

## Build

Requires Node.js 18 or newer.

```bash
npm install
npm run check
npm run build
```

The loadable extension is generated in `dist/`.

For continuous rebuilding during development:

```bash
npm run dev
```

After a rebuild, click **Reload** on the extension card in
`chrome://extensions`. The localhost page can remain open; the next toolbar
click injects the updated inspector automatically.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the upper-right corner.
3. Click **Load unpacked**.
4. Select this project's `dist` directory.
5. Pin **React Component Hover Inspector** from Chrome's Extensions menu.
6. Open or reload a supported local React page.
7. Click the toolbar icon. The `ON` badge confirms that hover inspection is
   active.

Click the icon again to turn the inspector off.

## Open JSX Source

The source button integrates with
[`code-inspector-plugin`](https://github.com/zh-lx/code-inspector). The plugin
injects exact JSX file, line, and column metadata and runs a localhost server
that opens the configured IDE. No VS Code extension is required.

Install it in the React or Next.js project being inspected:

```bash
npm install --save-dev code-inspector-plugin
```

For Next.js 15.3 or newer with Turbopack:

```ts
// next.config.ts
import type { NextConfig } from "next";
import { codeInspectorPlugin } from "code-inspector-plugin";

const inspector = {
  bundler: "turbopack" as const,
  hideConsole: true,
  hotKeys: false as const,
  showSwitch: false,
};

const nextConfig: NextConfig = {
  turbopack: {
    rules: codeInspectorPlugin(inspector),
  },
};

export default nextConfig;
```

For Next.js using Webpack:

```js
// next.config.js
const { codeInspectorPlugin } = require("code-inspector-plugin");

module.exports = {
  webpack(config) {
    config.plugins.push(
      codeInspectorPlugin({
        bundler: "webpack",
        hideConsole: true,
        hotKeys: false,
        showSwitch: false,
      }),
    );
    return config;
  },
};
```

Restart the development server after changing the configuration. The source
button is disabled when no `data-insp-path` metadata is available.

This first integration opens the JSX location associated with the inspected DOM
element. Navigating component owners with `Ctrl+Shift+X` changes the displayed
component name, but it does not change that JSX source location.

## Troubleshooting

- After changing extension files, run `npm run build` and click **Reload** on
  the extension card in `chrome://extensions`.
- If the badge displays `ON` but an old extension version is still active,
  click once to turn it off and once more to turn it on. Version `1.0.4` can
  inject itself into an already-open localhost tab without reloading the page.
- Open the extension card's **Errors** section if Chrome reports a blocked
  script or invalid manifest.
- If the source button reports an error, confirm that the development server
  using `code-inspector-plugin` is still running.

## Limitations

- React internals are private implementation details and can change between
  React versions.
- Components with debug source paths under `node_modules` are skipped. React 19
  does not always expose source paths, so dependency filtering falls back to
  known framework and Radix UI implementation names in those cases. This
  fallback includes generated collection wrappers and low-level components such
  as `MenuAnchor`, `PopperAnchor`, and `FocusScope`.
- Component names may be unavailable in minified production builds.
- Host DOM rendered by portals or third-party renderers can produce an unknown
  result.
- If no meaningful component can be identified, the tooltip displays
  `Unknown React component`.

## Releases

Releases are managed by Release Please through
`.github/workflows/release.yml`.

The workflow uses the `RELEASE_PLEASE_TOKEN` repository secret when available.
This should contain a GitHub personal access token with permission to manage
contents and pull requests for this repository.

Use Conventional Commit messages so changes are grouped correctly:

```text
fix: correct component name resolution
feat: add iframe inspection support
feat!: change the extension activation behavior
```

- `fix:` creates a patch release.
- `feat:` creates a minor release.
- A type followed by `!` creates a major release.

On pushes to `master`, Release Please creates or updates a release pull
request containing the version bump and generated `CHANGELOG.md`. Merging that
pull request creates the `vX.Y.Z` tag and GitHub Release. The workflow also
builds, tests, and attaches a loadable extension ZIP to the release.
