'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const client = () => true;
const server = () => false;

/** Native SSR controls stay unavailable until their React event handlers are attached. */
export function useClientReady() {
  return useSyncExternalStore(subscribe, client, server);
}
