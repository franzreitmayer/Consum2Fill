import { act, configure, getConfig } from "@testing-library/react";

// React runs passive effects after the commit that a findBy* query reacts to. MUI lifts aria-hidden
// from the page in such an effect when a dialog unmounts, so a role query right after a findBy*
// could still miss the page under load. Waiting in act() here makes that very unlikely.
const { asyncWrapper } = getConfig();
configure({
  asyncWrapper: async (callback) => {
    const result = await asyncWrapper(callback);
    await act(async () => undefined);
    return result;
  },
});
