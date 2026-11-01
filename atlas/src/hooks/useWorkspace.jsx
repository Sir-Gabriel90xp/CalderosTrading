import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { initial, validateBackup } from "../lib/trading.mjs";
import { loadWorkspace, saveWorkspace } from "../lib/storage";
export function useWorkspace(user) {
  const scope = user?.id || "guest",
    [record, setRecord] = useState(null),
    [status, setStatus] = useState("loading"),
    [conflict, setConflict] = useState(null),
    [online, setOnline] = useState(navigator.onLine);
  const current = useRef(null),
    identity = useRef(scope),
    queue = useRef(Promise.resolve()),
    busy = useRef(false),
    ready = useRef(false);
  identity.current = scope;
  const persist = useCallback(
    (next) => {
      const owner = scope;
      current.current = next;
      setRecord(next);
      setStatus(next.pending ? "pending" : "saving");
      queue.current = queue.current
        .catch(() => {})
        .then(() => saveWorkspace(owner, next));
      queue.current
        .then(() => {
          if (
            identity.current === owner &&
            current.current === next &&
            !next.pending
          )
            setStatus("local");
        })
        .catch(() => {
          if (identity.current === owner) setStatus("storage-error");
        });
      return queue.current;
    },
    [scope],
  );
  const fetchRemote = useCallback(async () => {
    const { data, error } = await supabase
      .from("atlas_workspaces")
      .select("prefs,revision,atlas_journal(id,date,pnl,note)")
      .eq("user_id", scope)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          data: validateBackup({
            ...data.prefs,
            days: data.atlas_journal.map((d) => ({ ...d, pnl: Number(d.pnl) })),
          }),
          revision: Number(data.revision),
          pending: false,
        }
      : null;
  }, [scope]);
  const sync = useCallback(async () => {
    if (
      !user ||
      !supabase ||
      !navigator.onLine ||
      busy.current ||
      !ready.current
    )
      return;
    const owner = scope;
    busy.current = true;
    try {
      await queue.current;
      const local = current.current;
      if (!local) return;
      setStatus("syncing");
      const remote = await fetchRemote();
      if (identity.current !== owner) return;
      if (current.current !== local) {
        setStatus("pending");
        return;
      }
      if (local.pending) {
        if (remote && remote.revision !== local.revision) {
          setConflict(remote);
          setStatus("conflict");
          return;
        }
        const { days, ...prefs } = local.data;
        const { data: rev, error } = await supabase.rpc("atlas_sync", {
          p_prefs: prefs,
          p_days: days,
          p_expected_revision: local.revision,
        });
        if (error) {
          if (error.message.includes("ATLAS_CONFLICT")) {
            setConflict(await fetchRemote());
            setStatus("conflict");
            return;
          }
          throw error;
        }
        if (identity.current !== owner) return;
        const latest = current.current;
        await persist({
          ...latest,
          revision: Number(rev),
          pending: latest !== local,
        });
        setStatus(latest === local ? "synced" : "pending");
      } else if (remote) {
        await persist(remote);
        setStatus("synced");
      } else {
        setStatus("local");
      }
    } catch (error) {
      if (identity.current === owner)
        setStatus(navigator.onLine ? "sync-error" : "offline");
    } finally {
      busy.current = false;
    }
  }, [scope, user, fetchRemote, persist]);
  useEffect(() => {
    let live = true;
    ready.current = false;
    setRecord(null);
    setConflict(null);
    current.current = null;
    setStatus("loading");
    (async () => {
      try {
        const saved = await loadWorkspace(scope);
        if (!live) return;
        const rec = saved
          ? { ...saved, data: validateBackup(saved.data) }
          : { data: initial(), revision: 0, pending: false };
        current.current = rec;
        setRecord(rec);
        ready.current = true;
        setStatus(navigator.onLine ? "local" : "offline");
      } catch {
        if (live) {
          const rec = { data: initial(), revision: 0, pending: false };
          current.current = rec;
          setRecord(rec);
          ready.current = true;
          setStatus("storage-error");
        }
      }
    })();
    return () => {
      live = false;
      ready.current = false;
    };
  }, [scope]);
  useEffect(() => {
    const on = () => {
        setOnline(true);
        sync();
      },
      off = () => {
        setOnline(false);
        setStatus("offline");
      };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const interval = setInterval(() => sync(), 30000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(interval);
    };
  }, [sync]);
  useEffect(() => {
    if (!record || !user || conflict) return;
    const timer = setTimeout(sync, 900);
    return () => clearTimeout(timer);
  }, [record?.pending, record?.updatedAt, user, sync, conflict]);
  const update = useCallback(
    (fn) => {
      if (!current.current || !ready.current) return;
      const data =
        typeof fn === "function"
          ? fn(structuredClone(current.current.data))
          : fn;
      persist({
        ...current.current,
        data,
        pending: Boolean(user),
        updatedAt: Date.now(),
      });
    },
    [persist, user],
  );
  async function resolveConflict(choice) {
    if (!conflict) return;
    if (choice === "cloud") {
      await persist(conflict);
      setConflict(null);
      setStatus("synced");
    } else {
      await persist({
        ...current.current,
        revision: conflict.revision,
        pending: true,
      });
      setConflict(null);
    }
  }
  return {
    data: record?.data,
    update,
    status,
    online,
    sync,
    conflict,
    resolveConflict,
  };
}
