/* Local stand-in for the Claude runtime (claude.use("db"|"user"|"assets"|"downloads")).
   Talks to local/serve.py. Only loaded when the page is not running inside Claude. */
(() => {
  if (window.claude) return;
  const ROLE_KEY = "sp-role";
  const role = () => { try { return localStorage.getItem(ROLE_KEY) || "owner"; } catch (e) { return "owner"; } };
  const ME = () => (role() === "owner" ? "local-manager" : "local-site");
  const NAMES = { "local-manager": "Manager", "local-site": "Site engineer" };

  async function api(method, path, body, raw) {
    let r;
    try {
      r = await fetch(path, { method, headers: body && !raw ? { "content-type": "application/json" } : {}, body: raw ? body : body ? JSON.stringify(body) : undefined });
    } catch (e) { throw { code: "unavailable", message: "Offline" }; }
    if (!r.ok) throw { code: r.status === 400 ? "invalid_argument" : r.status === 404 ? "not_found" : "unavailable" };
    return r.json();
  }

  const listeners = new Set();
  const poke = () => listeners.forEach(f => f());
  const cacheKey = col => "sp-cache-" + col;

  function docRef(col, id) {
    const p = `/_db/${encodeURIComponent(col)}/${encodeURIComponent(id)}`;
    return {
      id,
      set: d => api("PUT", p, d).then(poke),
      update: d => api("PATCH", p, d).then(poke),
      delete: () => api("DELETE", p).then(poke),
    };
  }
  function query(col, filters) {
    return {
      where: (f, _op, v) => query(col, [...filters, [f, v]]),
      doc: id => docRef(col, id),
      onSnapshot(cb, onErr) {
        let stop = false, last = null;
        const emit = (rows, fromCache) => {
          const docs = rows.filter(r => filters.every(([f, v]) => r.data[f] === v));
          const sig = JSON.stringify(docs);
          if (sig === last && fromCache === false && last !== null) return;
          last = sig;
          cb({ docs: docs.map(r => ({ id: r.id, data: () => r.data })), metadata: { fromCache } });
        };
        // show the last copy we saw straight away (so the app opens with no connection)
        try { const c = JSON.parse(localStorage.getItem(cacheKey(col)) || "null"); if (c) emit(c, true); } catch (e) {}
        const tick = async () => {
          if (stop) return;
          try {
            const rows = await api("GET", `/_db/${encodeURIComponent(col)}`);
            try { localStorage.setItem(cacheKey(col), JSON.stringify(rows)); } catch (e) {}
            emit(rows, false);
          } catch (e) { /* offline: keep showing the cached copy */ }
        };
        listeners.add(tick); tick();
        const iv = setInterval(tick, 3000);
        return () => { stop = true; clearInterval(iv); listeners.delete(tick); };
      },
    };
  }
  const db = {
    collection: col => query(col, []),
    doc: path => { const [col, id] = path.split("/"); return docRef(col, id); },
  };
  const user = {
    isOwner: async () => role() === "owner",
    id: async () => ME(),
    can: async () => true,
    profiles: async ids => Object.fromEntries(ids.map(i => [i, { name: NAMES[i] || "" }])),
  };
  const assets = { upload: async blob => api("POST", "/_blob", blob, true) };
  const downloads = {
    save: async ({ filename, data }) => {
      const url = URL.createObjectURL(new Blob([data]));
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
  };
  const svc = { db, user, assets, downloads };
  window.claude = { use: async name => svc[name] || null, local: true };

  // "Viewing as" switch: lets you test the manager and the site engineer screens on one machine.
  addEventListener("DOMContentLoaded", () => {
    const box = document.createElement("label");
    box.className = "pill";
    box.title = "Local test: switch between the manager and site engineer screens";
    box.innerHTML = `<select aria-label="View as" style="border:0;background:none;font:inherit;padding:2px;min-height:32px">
      <option value="owner">Manager</option><option value="site">Site engineer</option></select>`;
    const sel = box.querySelector("select");
    sel.value = role();
    sel.onchange = () => {
      try { localStorage.setItem(ROLE_KEY, sel.value); localStorage.removeItem("sp-lang"); } catch (e) {}
      location.reload();
    };
    const lb = document.getElementById("langBtn");
    if (lb) lb.before(box); else document.body.append(box);
  });
})();
