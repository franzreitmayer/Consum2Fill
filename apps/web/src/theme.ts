import { createTheme } from "@mui/material/styles";

const MIN_TOUCH_TARGET_PX = 48;

export const theme = createTheme({
  components: {
    MuiButton: {
      styleOverrides: { root: { minHeight: MIN_TOUCH_TARGET_PX } },
    },
    MuiIconButton: {
      styleOverrides: { root: { minWidth: MIN_TOUCH_TARGET_PX, minHeight: MIN_TOUCH_TARGET_PX } },
    },
  },
});
