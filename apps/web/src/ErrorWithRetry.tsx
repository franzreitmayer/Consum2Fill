import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

interface ErrorWithRetryProps {
  message: string;
  onRetry: () => void;
}

export function ErrorWithRetry({ message, onRetry }: ErrorWithRetryProps) {
  return (
    <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
      <Alert severity="error" sx={{ width: "100%" }}>
        {message}
      </Alert>
      <Button variant="outlined" onClick={onRetry}>
        Erneut versuchen
      </Button>
    </Stack>
  );
}
