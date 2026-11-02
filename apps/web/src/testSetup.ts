import { act, configure, getConfig } from "@testing-library/react";

// React runs passive effects after the commit that a findBy* query reacts to. MUI lifts aria-hidden
// from the page in such an effect when a dialog unmounts, so a role query right after a findBy*
// could still miss the page under load. Waiting in act() here makes that very unlikely.
const { asyncWrapper } = getConfig();
configure({
  // The default of one second is too short on a busy machine, as views load several lists in turn.
  asyncUtilTimeout: 5000,
  asyncWrapper: async (callback) => {
    const result = await asyncWrapper(callback);
    await act(async () => undefined);
    return result;
  },
});
