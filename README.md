# React Component Hover Inspector

A Manifest V3 Chrome extension for identifying React component names directly
on local React and Next.js pages.

## How it works

- Click the extension toolbar button to enable or disable inspection for the
  current tab.
- While enabled, move the pointer over an element to highlight it and display
  the DOM tag, nearest meaningful React component name, and element dimensions.
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

## Troubleshooting

- After changing extension files, run `npm run build` and click **Reload** on
  the extension card in `chrome://extensions`.
- If the badge displays `ON` but an old extension version is still active,
  click once to turn it off and once more to turn it on. Version `1.0.4` can
  inject itself into an already-open localhost tab without reloading the page.
- Open the extension card's **Errors** section if Chrome reports a blocked
  script or invalid manifest.

## Limitations

- React internals are private implementation details and can change between
  React versions.
- Component names may be unavailable in minified production builds.
- Host DOM rendered by portals or third-party renderers can produce an unknown
  result.
- If no meaningful component can be identified, the tooltip displays
  `Unknown React component`.

## Releases

Releases are managed by Release Please through
`.github/workflows/release.yml`.

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
