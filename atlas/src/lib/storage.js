let promise;
function database() {
  return (promise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("calderos-atlas", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("workspaces");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function loadWorkspace(scope) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const r = db.transaction("workspaces").objectStore("workspaces").get(scope);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveWorkspace(scope, data) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspaces", "readwrite");
    tx.objectStore("workspaces").put(data, scope);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
