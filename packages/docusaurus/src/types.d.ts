/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {HelmetServerState} from 'react-helmet-async';
import type {Manifest} from 'react-loadable-ssr-addon-v5-slorber';

export type ServerEntryParams = {
  manifest: Manifest;
  headTags: string;
  preBodyTags: string;
  postBodyTags: string;
  onLinksCollected: (params: {
    staticPagePath: string;
    links: string[];
    anchors: string[];
  }) => void;
  onHeadTagsCollected: (
    staticPagePath: string,
    tags: HelmetServerState,
  ) => void;
  outDir: string;
  baseUrl: string;
  ssrTemplate: string;
  noIndex: boolean;
  DOCUSAURUS_VERSION: string;
};