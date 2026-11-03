import { API_PATHS, type Material, type StorageLocation, type User } from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ApiClient } from "./api";
import { type CaptureLookups, canManageOrders, type LookupCheck } from "./captureLookups";
import { ConsumptionsAdmin } from "./ConsumptionsAdmin";
import { ErrorWithRetry } from "./ErrorWithRetry";
import { OrdersAdmin } from "./OrdersAdmin";
import { useApiResource } from "./useApiResource";

type CaptureTab = "consumptions" | "orders";

const LOST_ORDERS_NOTICE =
  "Die Berechtigung für die Bestellungen wurde entzogen. Eine offene Änderung wurde nicht gespeichert.";

interface CaptureAreaProps {
  api: ApiClient;
  user: User;
  /** A change loads the lists again in the background. */
  reloadSignal?: number;
  onCurrentUserChange: (user: User) => void;
}

/** Consumptions for everyone; ADMIN and MANAGER also get the orders in a second tab. */
export function CaptureArea({ api, user, reloadSignal, onCurrentUserChange }: CaptureAreaProps) {
  const locations = useApiResource<StorageLocation[]>(api, API_PATHS.storageLocations);
  const materials = useApiResource<Material[]>(api, API_PATHS.materials);
  const [lookupCheck, setLookupCheck] = useState<LookupCheck>({ kind: "idle" });
  const latestCheck = useRef(0);
  const seenReloadSignal = useRef(reloadSignal);
  const [tab, setTab] = useState<CaptureTab>("consumptions");
  // The orders are loaded with the first visit of their tab, then they stay mounted like the
  // consumptions, so that switching tabs keeps filter and notices.
  const [ordersVisited, setOrdersVisited] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mayOrder = canManageOrders(user);
  // Checked against the role as well: a USER never sees the orders, whatever the state says.
  const activeTab: CaptureTab = mayOrder ? tab : "consumptions";

  /** Unlike refreshLookups, this reports the outcome for the hint about missing master data. */
  function checkLookups() {
    latestCheck.current += 1;
    const check = latestCheck.current;
    setLookupCheck({ kind: "checking" });
    void Promise.all([locations.refreshWithResult(), materials.refreshWithResult()]).then(
      (results) => {
        if (check !== latestCheck.current) return;
        const failed = results.find((result) => result.kind === "failed");
        if (failed) setLookupCheck({ kind: "failed", message: failed.message });
        else if (results.some((result) => result.kind === "cancelled")) {
          setLookupCheck({ kind: "idle" });
        } else setLookupCheck({ kind: "checked" });
      },
    );
  }

  useEffect(() => {
    if (seenReloadSignal.current === reloadSignal) return;
    seenReloadSignal.current = reloadSignal;
    if (locations.state.kind !== "loading" && materials.state.kind !== "loading") checkLookups();
    // Only the signal starts this; the rest is read as of that moment.
  }, [reloadSignal]);

  function changeTab(next: CaptureTab) {
    setNotice(null);
    setTab(next);
    if (next === "orders") setOrdersVisited(true);
  }

  /** A 403 reloads the own user. Without the role, the orders give way to the consumptions. */
  function handleUserChange(updated: User) {
    if (activeTab === "orders" && !canManageOrders(updated)) {
      setTab("consumptions");
      setNotice(LOST_ORDERS_NOTICE);
    }
    onCurrentUserChange(updated);
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        Erfassung
      </Typography>
      {mayOrder ? (
        <Tabs
          value={activeTab}
          onChange={(_event, value: CaptureTab) => changeTab(value)}
          variant="fullWidth"
          aria-label="Erfassungsbereiche"
        >
          {/* Little padding: "Verbrauch/Bedarf" fits into half of 360 px in one line. */}
          <Tab
            value="consumptions"
            label="Verbrauch/Bedarf"
            id="capture-tab-consumptions"
            aria-controls="capture-panel-consumptions"
            sx={{ px: 1 }}
          />
          <Tab
            value="orders"
            label="Bestellungen"
            id="capture-tab-orders"
            aria-controls="capture-panel-orders"
            sx={{ px: 1 }}
          />
        </Tabs>
      ) : (
        <Typography variant="h6" component="h2">
          Verbrauch/Bedarf
        </Typography>
      )}
      {notice && (
        <Alert severity="warning" closeText="Meldung schließen" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      <CaptureContent
        lookupStates={[locations, materials]}
        check={lookupCheck}
        onCheck={checkLookups}
        render={(lookups) => {
          // Always in the same place, so that a lost role does not remount the consumptions.
          return (
            <>
              <Box
                role={mayOrder ? "tabpanel" : undefined}
                id="capture-panel-consumptions"
                aria-labelledby={mayOrder ? "capture-tab-consumptions" : undefined}
                hidden={activeTab !== "consumptions"}
              >
                <ConsumptionsAdmin
                  api={api}
                  user={user}
                  lookups={lookups}
                  active={activeTab === "consumptions"}
                  reloadSignal={reloadSignal}
                  onCurrentUserChange={handleUserChange}
                />
              </Box>
              {mayOrder && (ordersVisited || activeTab === "orders") && (
                <Box
                  role="tabpanel"
                  id="capture-panel-orders"
                  aria-labelledby="capture-tab-orders"
                  hidden={activeTab !== "orders"}
                >
                  <OrdersAdmin
                    api={api}
                    user={user}
                    lookups={lookups}
                    active={activeTab === "orders"}
                    reloadSignal={reloadSignal}
                    onCurrentUserChange={handleUserChange}
                  />
                </Box>
              )}
            </>
          );
        }}
      />
    </Stack>
  );
}

type LookupResource<T> = ReturnType<typeof useApiResource<T>>;

interface CaptureContentProps {
  lookupStates: [LookupResource<StorageLocation[]>, LookupResource<Material[]>];
  check: LookupCheck;
  onCheck: () => void;
  render: (lookups: CaptureLookups) => ReactNode;
}

/**
 * Names, filters and dialogs depend on both lists, and a failed list must not look like an empty
 * one. So the records only appear with both lists. A failed refresh later keeps the old lists.
 */
function CaptureContent({ lookupStates, check, onCheck, render }: CaptureContentProps) {
  const [locations, materials] = lookupStates;
  const failed = [locations.state, materials.state].find((state) => state.kind === "failed");
  if (failed) {
    return (
      <ErrorWithRetry
        message={failed.message}
        onRetry={() => {
          if (locations.state.kind === "failed") locations.reload();
          if (materials.state.kind === "failed") materials.reload();
        }}
      />
    );
  }
  if (locations.state.kind !== "loaded" || materials.state.kind !== "loaded") {
    return <CircularProgress aria-label="Lagerorte und Material werden geladen" />;
  }
  return render({
    locations: locations.state.data,
    materials: materials.state.data,
    refresh: () => {
      locations.refresh();
      materials.refresh();
    },
    runCheck: onCheck,
    check,
  });
}
