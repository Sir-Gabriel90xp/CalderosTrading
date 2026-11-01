import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = dir + "/" + e.name;
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}
const files = (await walk("dist")).filter((f) => !f.endsWith("/sw.js")),
  hash = createHash("sha256");
for (const f of files) hash.update(await readFile(f));
const cache = "atlas-shell-" + hash.digest("hex").slice(0, 12),
  urls = files.map((f) => "/" + f.slice(5));
urls.push("/");
await writeFile(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(cache)}, ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('atlas-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{const req=event.request,u=new URL(req.url);if(req.method!=='GET'||u.origin!==self.location.origin)return;if(req.mode==='navigate'){event.respondWith(fetch(req).then(r=>r.ok?r:caches.match('/index.html')).catch(()=>caches.match('/index.html')));return}if(ASSETS.includes(u.pathname))event.respondWith(caches.match(u.pathname).then(r=>r||fetch(req)));});
`,
);
console.log("Offline shell:", files.length, "resources;", cache);
