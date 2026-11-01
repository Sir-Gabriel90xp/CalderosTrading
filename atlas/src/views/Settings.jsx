import { useRef, useState } from "react";
import {
  Cloud,
  Download,
  Monitor,
  Sun,
  Moon,
  Upload,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { Button, Card, Notice } from "../components/ui";
import { initial, validateBackup } from "../lib/trading.mjs";
export default function Settings({
  data,
  update,
  theme,
  setTheme,
  user,
  onAuth,
  status,
  onSync,
  onInstall,
}) {
  const file = useRef(null),
    [message, setMessage] = useState("");
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ ...data, app: "Calderos Atlas Pro" }, null, 2)],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-pro-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Respaldo descargado.");
  }
  async function read(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (f.size > 2000000) throw Error("El respaldo supera 2 MB.");
      const raw = JSON.parse(await f.text()),
        clean = validateBackup(raw);
      if (!confirm("¿Reemplazar los datos de este espacio por el respaldo?"))
        return;
      update(clean);
      setMessage(
        raw.version === 1
          ? "Importado. Los días antiguos recibieron fechas de referencia; puedes editarlas."
          : "Respaldo importado correctamente.",
      );
    } catch (err) {
      setMessage("No se pudo importar: " + err.message);
    } finally {
      e.target.value = "";
    }
  }
  return (
    <div className="settings-grid">
      <Card title="Tu espacio">
        <label className="field">
          <span>¿Cómo te llamas?</span>
          <input
            value={data.profile.name}
            maxLength={60}
            onChange={(e) =>
              update((s) => {
                s.profile.name = e.target.value;
                return s;
              })
            }
          />
        </label>
        <label className="field">
          <span>Nombre de tu cuenta</span>
          <input
            value={data.profile.account}
            maxLength={60}
            onChange={(e) =>
              update((s) => {
                s.profile.account = e.target.value;
                return s;
              })
            }
          />
        </label>
        <div className="divider" />
        <h3>Apariencia</h3>
        <div className="segmented">
          <button
            className={theme === "dark" ? "selected" : ""}
            onClick={() => setTheme("dark")}
          >
            <Moon size={15} />
            Oscuro
          </button>
          <button
            className={theme === "light" ? "selected" : ""}
            onClick={() => setTheme("light")}
          >
            <Sun size={15} />
            Blanco
          </button>
        </div>
      </Card>
      <Card title="Respaldo y datos">
        <p className="muted">
          Lleva tus datos contigo. Compatible con los respaldos de tu
          calculadora anterior.
        </p>
        <div className="button-row">
          <Button onClick={download}>
            <Download size={16} />
            Exportar respaldo
          </Button>
          <Button onClick={() => file.current.click()}>
            <Upload size={16} />
            Importar
          </Button>
        </div>
        <input
          type="file"
          ref={file}
          accept="application/json,.json"
          hidden
          onChange={read}
        />
        <div className="divider" />
        <Button
          onClick={() => {
            if (
              confirm(
                "¿Restablecer los ajustes y borrar el historial de este espacio? Exporta antes tu respaldo.",
              )
            ) {
              update(initial());
              setMessage("Datos restablecidos.");
            }
          }}
        >
          <RotateCcw size={15} />
          Restablecer este espacio
        </Button>
        {message && <Notice>{message}</Notice>}
        <p className="caption">
          Si iniciaste sesión, los cambios se sincronizan con tu cuenta.
        </p>
      </Card>
      <Card title="Tu cuenta y sincronización">
        <div className="account-block">
          <span className="avatar">
            <UserRound size={20} />
          </span>
          <div>
            <strong>{user?.email || "Modo local"}</strong>
            <p className="caption">
              {user
                ? "Conectado a tu espacio personal"
                : "Sin cuenta. Los datos se guardan en este dispositivo."}
            </p>
          </div>
        </div>
        <Button primary onClick={user ? onSync : onAuth}>
          <Cloud size={16} />
          {user ? "Sincronizar ahora" : "Iniciar sesión"}
        </Button>
        <Notice>
          Los datos locales de cada cuenta y del modo invitado se guardan por
          separado. Exporta e importa tu respaldo para moverlos entre espacios.
        </Notice>
      </Card>
      <Card className="brand-card">
        <span className="eyebrow">HECHO PARA TU DÍA A DÍA</span>
        <h2>
          ATLAS <span>PRO.</span>
        </h2>
        <p>
          Menos ruido.
          <br />
          Más control.
        </p>
        <Button onClick={onInstall}>
          <Monitor size={16} />
          Instalar aplicación
        </Button>
        <p className="caption">
          Tras la primera carga completa, las herramientas están disponibles sin
          internet. YouTube requiere conexión.
        </p>
      </Card>
    </div>
  );
}
