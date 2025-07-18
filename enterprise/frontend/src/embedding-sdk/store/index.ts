/* eslint-disable no-restricted-imports */
import {
  type AnyAction,
  type Reducer,
  type Store,
  combineReducers,
} from "@reduxjs/toolkit";
import { useContext } from "react";

import {
  MetabaseReduxContext,
  useDispatch,
  useStore,
} from "metabase/lib/redux";
import { PLUGIN_REDUCERS } from "metabase/plugins";
import * as qb from "metabase/query_builder/reducers";
import { commonReducers } from "metabase/reducers-common";
import { DEFAULT_EMBEDDING_ENTITY_TYPES } from "metabase/redux/embedding-data-picker";
import { getStore } from "metabase/store";
import { reducer as visualizer } from "metabase/visualizer/visualizer.slice";

import { sdk } from "./reducer";
import type { SdkStoreState } from "./types";

export const sdkReducers = {
  ...commonReducers,
  qb: combineReducers(qb),
  visualizer,
  sdk,
  plugins: combineReducers({
    metabotPlugin: PLUGIN_REDUCERS.metabotPlugin,
  }),
} as unknown as Record<string, Reducer>;

export const getSdkStore = () =>
  getStore(sdkReducers, null, {
    embed: {
      options: {
        entity_types: DEFAULT_EMBEDDING_ENTITY_TYPES,
      },
    },
    app: {
      isDndAvailable: false,
    },
  }) as unknown as Store<SdkStoreState, AnyAction>;

export const useSdkDispatch = () => {
  useCheckSdkReduxContext();

  return useDispatch();
};

export const useSdkStore = () => {
  useCheckSdkReduxContext();

  return useStore();
};

const useCheckSdkReduxContext = () => {
  const context = useContext(MetabaseReduxContext);

  if (!context) {
    console.warn(
      // eslint-disable-next-line no-literal-metabase-strings -- not UI string
      "Cannot find react-redux context. Make sure component or hook is wrapped into MetabaseProvider",
    );
  }
};

export { useSdkSelector } from "./use-sdk-selector";
