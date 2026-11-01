import { lazy, Suspense, useEffect, useRef, useState, Component } from "react";
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Calculator,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  GraduationCap,
  House,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sun,
  Target,
  UserRound,
  WifiOff,
  Wrench,
  X,
  Clock3,
} from "lucide-react";
import { Button, Help, Modal, Notice } from "./components/ui";
import Auth from "./components/Auth";
import Home from "./views/Home";
import { supabase } from "./lib/supabase";
import { useWorkspace } from "./hooks/useWorkspace";
const Calculators = lazy(() => import("./views/Calculators")),
  Consistency = lazy(() => import("./views/Consistency")),
  Tools = lazy(() => import("./views/Tools")),
  Sessions = lazy(() => import("./views/Sessions")),
  Learn = lazy(() => import("./views/Learn")),
  Settings = lazy(() => import("./views/Settings"));
const routes = [
  {
    id: "home",
    label: "Inicio",
    icon: House,
    help: "Tu balance, resultados y objetivos en un solo lugar.",
  },
  {
    id: "cfd",
    label: "Lotaje CFD",
    icon: Calculator,
    help: "Calcula el volumen de tu posición según capital, riesgo y stop loss.",
  },
  {
    id: "futures",
    label: "Futuros",
    icon: ChartNoAxesCombined,
    help: "Encuentra cuántos contratos de futuros caben dentro de tu riesgo.",
  },
  {
    id: "consistency",
    label: "Consistencia",
    icon: Target,
    help: "Registra tus días y sigue tus objetivos de beneficio y consistencia.",
  },
  {
    id: "tools",
    label: "Herramientas",
    icon: Wrench,
    help: "Porcentajes, recuperación de pérdidas y referencia Oro / Nasdaq.",
  },
  {
    id: "sessions",
    label: "Sesiones",
    icon: Clock3,
    help: "Consulta las ventanas de Tokio, Londres y Nueva York en hora dominicana.",
  },
  {
    id: "learn",
    label: "Aprende de trading",
    icon: GraduationCap,
    help: "Mira videos de trading aquí o continúa en YouTube.",
  },
  {
    id: "settings",
    label: "Ajustes",
    icon: Settings2,
    help: "Personaliza tu espacio y gestiona respaldos y sincronización.",
  },
];
const titles = {
  cfd: [
    "CALCULA ANTES DE OPERAR",
    "Calculadora de lotaje",
    "La posición correcta empieza por el riesgo correcto.",
  ],
  futures: [
    "PRECISIÓN EN CADA CONTRATO",
    "Futuros",
    "Dimensiona tu posición. Respeta tu presupuesto.",
  ],
  consistency: [
    "CADA DÍA CUENTA",
    "Construye consistencia",
    "Mide tu progreso y mantén tu disciplina.",
  ],
  tools: [
    "MENOS CÁLCULOS, MÁS CLARIDAD",
    "Tu caja de herramientas",
    "Resuelve los números que acompañan tu operativa.",
  ],
  sessions: [
    "TU RELOJ DEL MERCADO",
    "Sesiones de trading",
    "El mundo se mueve. Encuentra tu horario.",
  ],
  learn: [
    "INVIERTE EN TU CONOCIMIENTO",
    "Aprende de trading",
    "Ideas para crecer, a tu ritmo.",
  ],
  settings: [
    "UN ESPACIO A TU MEDIDA",
    "Ajustes",
    "Tu cuenta. Tus preferencias. Tus datos.",
  ],
};
class ViewBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Notice tone="error">
        No se pudo cargar esta vista.{" "}
        <button className="text-button" onClick={() => location.reload()}>
          Volver a cargar
        </button>
      </Notice>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const [showSpecs, setShowSpecs] = useState(false),
    [view, setView] = useState(
      routes.some((r) => r.id === location.hash.slice(1))
        ? location.hash.slice(1)
        : "home",
    ),
    [theme, setTheme] = useState(
      document.documentElement.dataset.theme === "light" ? "light" : "dark",
    ),
    [user, setUser] = useState(() => {
      try {
        return !navigator.onLine
          ? JSON.parse(localStorage.getItem("atlas-offline-user") || "null")
          : null;
      } catch {
        return null;
      }
    }),
    [authReady, setAuthReady] = useState(!supabase || !navigator.onLine),
    [auth, setAuth] = useState(false),
    [recovery, setRecovery] = useState(false),
    [menu, setMenu] = useState(false),
    [bell, setBell] = useState(false),
    [install, setInstall] = useState(null),
    [installHelp, setInstallHelp] = useState(false),
    [updateReady, setUpdateReady] = useState(null),
    [offlineReady, setOfflineReady] = useState(false),
    [notice, setNotice] = useState("");
  const wrap = useRef(null),
    bellRef = useRef(null);
  const workspace = useWorkspace(authReady ? user : null),
    { data, update, status, online, sync, conflict, resolveConflict } =
      workspace;
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error)
        setNotice(
          "No se pudo restaurar tu sesión. Puedes seguir en modo local.",
        );
      if (navigator.onLine || data.session?.user)
        setUser(data.session?.user || null);
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (navigator.onLine || session?.user || event === "SIGNED_OUT")
        setUser(session?.user || null);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setAuth(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!authReady) return;
    try {
      if (user)
        localStorage.setItem(
          "atlas-offline-user",
          JSON.stringify({ id: user.id, email: user.email }),
        );
      else localStorage.removeItem("atlas-offline-user");
    } catch {}
  }, [user, authReady]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content =
      theme === "light" ? "#f6f7f8" : "#0b0c0c";
    try {
      localStorage.setItem("atlas-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    const handler = () =>
      setView(
        routes.some((r) => r.id === location.hash.slice(1))
          ? location.hash.slice(1)
          : "home",
      );
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstall(null));
    if ("serviceWorker" in navigator && import.meta.env.PROD)
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (reg.waiting) setUpdateReady(reg);
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed") {
                setOfflineReady(true);
                if (navigator.serviceWorker.controller) setUpdateReady(reg);
              }
            });
          });
          if (reg.active) setOfflineReady(true);
        })
        .catch(() =>
          setNotice(
            "No se pudo preparar el modo sin conexión. Reintenta con una conexión estable.",
          ),
        );
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  useEffect(() => {
    function outside(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setBell(false);
    }
    function esc(e) {
      if (e.key === "Escape") {
        if (bell) bellRef.current?.focus();
        setBell(false);
        setMenu(false);
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [bell]);
  function go(id) {
    setShowSpecs(false);
    setView(id);
    location.hash = id;
    setMenu(false);
    setBell(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function installApp() {
    if (install) {
      await install.prompt();
      setInstall(null);
    } else setInstallHelp(true);
  }
  async function logout() {
    if (!online)
      return setNotice(
        "Conéctate a internet para cerrar tu sesión de forma segura.",
      );
    if (
      ["pending", "syncing", "sync-error", "conflict"].includes(status) &&
      !confirm(
        "Hay cambios sin sincronizar. Seguirán guardados en este dispositivo para tu cuenta. ¿Cerrar sesión?",
      )
    )
      return;
    const { error } = await supabase.auth.signOut();
    if (error) setNotice("No se pudo cerrar sesión. Inténtalo otra vez.");
    else setUser(null);
  }
  const statusLabel = !online
    ? "Sin conexión"
    : status === "loading"
      ? "Cargando…"
      : status === "saving"
        ? "Guardando…"
        : status === "synced"
          ? "Sincronizado"
          : status === "syncing"
            ? "Sincronizando…"
            : status === "pending"
              ? "Cambios pendientes"
              : status === "conflict"
                ? "Revisar versiones"
                : status === "storage-error"
                  ? "Error de guardado"
                  : status === "sync-error"
                    ? "Guardado local · reintentar"
                    : "Guardado local";
  const nav = (mobile = false) =>
    routes
      .filter(
        (r) =>
          !mobile || ["home", "cfd", "consistency", "learn"].includes(r.id),
      )
      .map((r) => (
        <Help key={r.id} text={r.help}>
          <button
            className={`nav-item ${view === r.id ? "active" : ""}`}
            onClick={() => go(r.id)}
            aria-current={view === r.id ? "page" : undefined}
          >
            <r.icon size={19} />
            <span>
              {mobile
                ? {
                    home: "Inicio",
                    cfd: "Lotaje",
                    consistency: "Registro",
                    learn: "Aprende",
                  }[r.id]
                : r.label}
            </span>
            {!mobile && view === r.id && <ChevronRight size={14} />}
          </button>
        </Help>
      ));
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a href="#home" className="brand" onClick={() => go("home")}>
          <img src="/logo.jpg" alt="Calderos Trading · Cocina tu futuro" />
          <div>
            <strong>
              CALDEROS<span>TRADING</span>
            </strong>
            <small>ATLAS PRO</small>
          </div>
        </a>
        <div className="nav-section-label">TU ESPACIO DE TRADING</div>
        <nav aria-label="Menú principal">{nav()}</nav>
        <div className="sidebar-bottom">
          <span className="pro-badge">A</span>
          <div>
            <strong>
              ATLAS PRO<span>3.0</span>
            </strong>
            <p>Diseñado para tu disciplina.</p>
          </div>
        </div>
        <button
          className="sidebar-account"
          onClick={() => (user ? go("settings") : setAuth(true))}
        >
          <span className="avatar">
            <UserRound size={17} />
          </span>
          <span>
            <strong>
              {user ? data?.profile.name || "Mi cuenta" : "Espacio local"}
            </strong>
            <small>
              {user ? "Cuenta conectada" : "Entra para sincronizar"}
            </small>
          </span>
          <ChevronRight size={14} />
        </button>
      </aside>
      {menu && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMenu(false)}
          aria-label="Cerrar menú"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>WORKSPACE</span>
            <ChevronRight size={12} />
            <strong>{routes.find((r) => r.id === view)?.label}</strong>
          </div>
          <a href="#home" className="mobile-brand" onClick={() => go("home")}>
            <img src="/icon.svg" alt="" />
            <strong>
              ATLAS<span>PRO</span>
            </strong>
          </a>
          <div className="top-actions">
            <button
              className={`sync-indicator ${["sync-error", "storage-error", "conflict"].includes(status) ? "warning" : ""}`}
              onClick={sync}
              title={statusLabel}
            >
              {online ? <Cloud size={14} /> : <WifiOff size={14} />}
              <span>{statusLabel}</span>
            </button>
            <Help
              text={
                theme === "dark"
                  ? "Cambiar a modo blanco"
                  : "Cambiar a modo oscuro"
              }
            >
              <button
                className="icon-button"
                aria-label={
                  theme === "dark"
                    ? "Activar modo blanco"
                    : "Activar modo oscuro"
                }
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </Help>
            <div className="notification-wrap" ref={wrap}>
              <button
                ref={bellRef}
                className="icon-button bell-button"
                aria-label="Notificaciones: recordatorio del bróker"
                aria-expanded={bell}
                aria-controls="notifications"
                onClick={() => setBell(!bell)}
              >
                <Bell size={18} />
                <i />
              </button>
              {bell && (
                <section
                  className="notification-panel"
                  id="notifications"
                  aria-label="Notificaciones"
                >
                  <div className="card-heading">
                    <h2>Notificaciones</h2>
                    <button
                      className="icon-button"
                      aria-label="Cerrar notificaciones"
                      onClick={() => setBell(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <span className="eyebrow">RECORDATORIO FIJO</span>
                  <h3>Revisa el contrato de tu activo</h3>
                  <p>
                    Antes de calcular, confirma en tu bróker las{" "}
                    <strong>
                      unidades por lote, tick, lote mínimo e incremento
                      permitido
                    </strong>
                    .
                  </p>
                  <p>
                    Varían entre brókeres y cuentas. Una especificación
                    incorrecta cambia el riesgo calculado.
                  </p>
                  <Button
                    primary
                    onClick={() => {
                      go("cfd");
                      setShowSpecs(true);
                    }}
                  >
                    Revisar especificaciones
                    <ArrowUpRight size={14} />
                  </Button>
                </section>
              )}
            </div>
            <button
              className="account-button"
              onClick={() => (user ? go("settings") : setAuth(true))}
            >
              <UserRound size={16} />
              <span>{user ? "Mi cuenta" : "Entrar"}</span>
            </button>
          </div>
        </header>
        <main id="main-content">
          {!online && (
            <Notice>
              <WifiOff size={16} />
              Modo sin conexión. Los cambios se guardan en este dispositivo.
            </Notice>
          )}
          {notice && (
            <Notice>
              {notice}
              <button
                className="icon-button"
                aria-label="Cerrar aviso"
                onClick={() => setNotice("")}
              >
                <X size={14} />
              </button>
            </Notice>
          )}
          {status === "storage-error" && (
            <Notice tone="error">
              No se pudo guardar en este dispositivo. Exporta un respaldo desde
              Ajustes antes de cerrar.
            </Notice>
          )}
          {updateReady && (
            <Notice>
              Nueva versión disponible.
              <Button
                onClick={() => {
                  navigator.serviceWorker.addEventListener(
                    "controllerchange",
                    () => location.reload(),
                    { once: true },
                  );
                  updateReady.waiting?.postMessage({ type: "SKIP_WAITING" });
                }}
              >
                Actualizar
              </Button>
            </Notice>
          )}
          {conflict && (
            <Notice tone="error">
              <div>
                <strong>Hay otra versión de tus datos en la nube.</strong>
                <p>Exporta tu respaldo antes de decidir cuál conservar.</p>
                <div className="button-row">
                  <Button onClick={() => resolveConflict("cloud")}>
                    Usar versión de la nube
                  </Button>
                  <Button
                    onClick={() => {
                      if (
                        confirm(
                          "¿Reemplazar la nube por los datos de este dispositivo?",
                        )
                      )
                        resolveConflict("local");
                    }}
                  >
                    Conservar este dispositivo
                  </Button>
                </div>
              </div>
            </Notice>
          )}
          {view !== "home" && (
            <div className="page-head">
              <span className="eyebrow">{titles[view]?.[0]}</span>
              <h1>{titles[view]?.[1]}</h1>
              <p>{titles[view]?.[2]}</p>
            </div>
          )}
          {!authReady || !data ? (
            <div className="loading-view">
              <span className="spinner" />
              Preparando tu espacio…
            </div>
          ) : (
            <ViewBoundary key={view}>
              <Suspense
                fallback={
                  <div className="loading-view">
                    <span className="spinner" />
                    Cargando herramientas…
                  </div>
                }
              >
                <div key={view} className="view-enter">
                  {view === "home" ? (
                    <Home data={data} go={go} online={online} />
                  ) : ["cfd", "futures"].includes(view) ? (
                    <Calculators
                      key={view}
                      mode={view}
                      data={data}
                      update={update}
                      openSpecs={showSpecs}
                    />
                  ) : view === "consistency" ? (
                    <Consistency data={data} update={update} />
                  ) : view === "tools" ? (
                    <Tools data={data} update={update} />
                  ) : view === "sessions" ? (
                    <Sessions />
                  ) : view === "learn" ? (
                    <Learn online={online} />
                  ) : (
                    <>
                      <Settings
                        data={data}
                        update={update}
                        theme={theme}
                        setTheme={setTheme}
                        user={user}
                        onAuth={() => setAuth(true)}
                        status={status}
                        onSync={sync}
                        onInstall={installApp}
                      />
                      {user && (
                        <Button className="logout" onClick={logout}>
                          <LogOut size={15} />
                          Cerrar sesión
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Suspense>
            </ViewBoundary>
          )}
          <footer>
            <span>© Calderos Trading · Cocina tu futuro.</span>
            <span>
              {offlineReady ? (
                <>
                  <Check size={12} />
                  Lista para usar sin conexión
                </>
              ) : (
                "ATLAS PRO · 3.0"
              )}
            </span>
          </footer>
          <p className="risk-footer">
            Herramienta de apoyo. Las cifras son estimaciones; no
            recomendaciones de inversión.
          </p>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {nav(true)}
        <button
          className="nav-item"
          onClick={() => setMenu(!menu)}
          aria-label="Ver todas las secciones"
        >
          <Menu size={19} />
          <span>Más</span>
        </button>
      </nav>
      {auth && (
        <Auth
          recovery={recovery}
          onClose={() => {
            setAuth(false);
            setRecovery(false);
          }}
        />
      )}
      {installHelp && (
        <Modal
          title="Lleva ATLAS PRO contigo"
          onClose={() => setInstallHelp(false)}
        >
          <p className="muted">
            En Chrome o Edge, abre el menú del navegador y elige{" "}
            <strong>Instalar aplicación</strong>. En iPhone o iPad, usa Safari →
            Compartir → Añadir a pantalla de inicio.
          </p>
          <Notice>
            Abre la app con internet y espera el aviso «Lista para usar sin
            conexión». Los videos de YouTube necesitan internet.
          </Notice>
        </Modal>
      )}
    </div>
  );
}
