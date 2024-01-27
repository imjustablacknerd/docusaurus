/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs-extra';
import path from 'path';
import evaluate from 'eval';
import pMap from 'p-map';

import {DOCUSAURUS_VERSION} from '@docusaurus/utils';
import ssrDefaultTemplate from './webpack/templates/ssr.html.template';
import type {Props} from '@docusaurus/types';
import type {ServerEntryParams} from './types';

// Secret way to set SSR plugin concurrency option
// Waiting for feedback before documenting this officially?
const Concurrency = process.env.DOCUSAURUS_SSR_CONCURRENCY
  ? parseInt(process.env.DOCUSAURUS_SSR_CONCURRENCY, 10)
  : // Not easy to define a reasonable option default
    // Will still be better than Infinity
    // See also https://github.com/sindresorhus/p-map/issues/24
    32;

type Options = {
  params: ServerEntryParams;
  pathnames: string[];
  trailingSlash?: boolean;
};

type Renderer = (
  params: ServerEntryParams & {pathname: string},
) => Promise<string>;

async function loadServerEntryRenderer({
  serverBundlePath,
}: {
  serverBundlePath: string;
}): Promise<Renderer> {
  const source = await fs.readFile(serverBundlePath);

  const filename = path.basename(serverBundlePath);

  // When using "new URL('file.js', import.meta.url)", Webpack will emit
  // __filename, and this plugin will throw. not sure the __filename value
  // has any importance for this plugin, just using an empty string to
  // avoid the error. See https://github.com/facebook/docusaurus/issues/4922
  const globals = {__filename: ''};

  const serverEntry = evaluate(
    source,
    /* filename: */ filename,
    /* scope: */ globals,
    /* includeGlobals: */ true,
  ) as {default?: Renderer};
  if (!serverEntry?.default || typeof serverEntry.default !== 'function') {
    throw new Error(
      `Server bundle export from "${filename}" must be a function that returns an HTML string.`,
    );
  }
  return serverEntry.default;
}

function pathnameToFilename({
  pathname,
  trailingSlash,
}: {
  pathname: string;
  trailingSlash?: boolean;
}): string {
  const outputFileName = pathname.replace(/^[/\\]/, ''); // Remove leading slashes for webpack-dev-server
  // Paths ending with .html are left untouched
  if (/\.html?$/i.test(outputFileName)) {
    return outputFileName;
  }
  // Legacy retro-compatible behavior
  if (typeof trailingSlash === 'undefined') {
    return path.join(outputFileName, 'index.html');
  }
  // New behavior: we can say if we prefer file/folder output
  // Useful resource: https://github.com/slorber/trailing-slash-guide
  if (pathname === '' || pathname.endsWith('/') || trailingSlash) {
    return path.join(outputFileName, 'index.html');
  }
  return `${outputFileName}.html`;
}

export async function generateStaticFiles({
  serverBundlePath,
  options,
}: {
  serverBundlePath: string;
  options: Options;
}): Promise<void> {
  const renderer = await loadServerEntryRenderer({
    serverBundlePath,
  });

  // TODO throw aggregate error
  await pMap(
    options.pathnames,
    async (pathname) =>
      generateStaticFile({
        pathname,
        renderer,
        options,
      }),
    {concurrency: Concurrency},
  );
}

async function generateStaticFile({
  pathname,
  renderer,
  options,
}: {
  pathname: string;
  renderer: Renderer;
  options: Options;
}) {
  try {
    const html = await renderer({pathname, ...options.params});
    const filename = pathnameToFilename({
      pathname,
      trailingSlash: options.trailingSlash,
    });

    // TODO stream write to disk
    const filePath = path.join(options.params.outDir, filename);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, html);
  } catch (errorUnknown) {
    // TODO throw aggregate error?
    throw new Error(`Can't render static file for pathname=${pathname}`, {
      cause: errorUnknown as Error,
    });
  }
}

// TODO do we really need this?
//   routesLocation looks useless to me
function buildRoutesLocation({
  routesPaths,
  baseUrl,
}: {
  routesPaths: string[];
  baseUrl: string;
}) {
  const routesLocation: {[filePath: string]: string} = {};
  // Array of paths to be rendered. Relative to output directory
  routesPaths.forEach((str) => {
    const ssgPath =
      baseUrl === '/' ? str : str.replace(new RegExp(`^${baseUrl}`), '/');
    routesLocation[ssgPath] = str;
    return ssgPath;
  });
  return routesLocation;
}

export function createServerEntryParams(
  params: Pick<
    ServerEntryParams,
    'onLinksCollected' | 'onHeadTagsCollected'
  > & {
    props: Props;
  },
): ServerEntryParams {
  const {props, onLinksCollected, onHeadTagsCollected} = params;
  const {
    baseUrl,
    generatedFilesDir,
    headTags,
    preBodyTags,
    postBodyTags,
    outDir,
    siteConfig: {noIndex, ssrTemplate},
  } = props;

  const routesLocation: {[filePath: string]: string} =
    buildRoutesLocation(props);

  const manifestPath = path.join(generatedFilesDir, 'client-manifest.json');

  return {
    outDir,
    baseUrl,
    manifestPath,
    routesLocation,
    headTags,
    preBodyTags,
    postBodyTags,
    onLinksCollected,
    onHeadTagsCollected,
    ssrTemplate: ssrTemplate ?? ssrDefaultTemplate,
    noIndex,
    DOCUSAURUS_VERSION,
  };
}
