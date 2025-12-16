// DOM/container related app-layer service.
// Thin wrapper around `invokeAction`, so UI modules don't know CLI details.

export function createDomService({ invokeAction, resolveCurrentPageUrl }) {
  if (typeof invokeAction !== 'function') {
    throw new Error('createDomService requires invokeAction');
  }

  const getUrl = () => (typeof resolveCurrentPageUrl === 'function' ? resolveCurrentPageUrl() : null);

  const buildPayload = (payload = {}) => ({
    ...payload,
    url: payload.url || getUrl(),
  });

  return {
    async createChildContainer(params = {}) {
      return invokeAction('containers:create-child', buildPayload(params));
    },
    async updateContainerAlias(params = {}) {
      return invokeAction('containers:update-alias', buildPayload(params));
    },
  };
}
