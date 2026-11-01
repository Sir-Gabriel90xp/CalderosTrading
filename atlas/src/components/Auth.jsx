import { useState } from "react";
import { Cloud, LogIn, Mail, ShieldCheck } from "lucide-react";
import { Button, Modal, Notice } from "./ui";
import { supabase, cloudEnabled } from "../lib/supabase";
export default function Auth({ onClose, recovery = false }) {
  const [mode, setMode] = useState(recovery ? "new-password" : "login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!cloudEnabled)
        throw Error("La conexión de cuentas aún no está configurada.");
      let result;
      if (mode === "signup")
        result = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin },
        });
      else if (mode === "reset")
        result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/?recovery=1",
        });
      else if (mode === "new-password")
        result = await supabase.auth.updateUser({ password });
      else result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setError(false);
      if (mode === "login" || mode === "new-password" || result.data?.session)
        onClose();
      else
        setMessage(
          mode === "signup"
            ? "Revisa tu correo para confirmar tu cuenta. Luego vuelve aquí e inicia sesión."
            : "Si existe esa cuenta, recibirás un enlace para restablecer tu contraseña.",
        );
    } catch (err) {
      setError(true);
      setMessage(
        err.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        mode === "signup"
          ? "Crea tu cuenta"
          : mode === "reset"
            ? "Recupera tu acceso"
            : mode === "new-password"
              ? "Nueva contraseña"
              : "Tu espacio, en cualquier lugar"
      }
      onClose={onClose}
    >
      <div className="auth-intro">
        <Cloud size={28} />
        <p>
          Guarda tu historial y ajustes en tu cuenta. Tus cálculos también
          funcionan sin conexión.
        </p>
      </div>
      <form onSubmit={submit}>
        {mode !== "new-password" && (
          <label className="field">
            <span>Correo electrónico</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
            />
          </label>
        )}
        {mode !== "reset" && (
          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </label>
        )}
        {message && <Notice tone={error ? "error" : ""}>{message}</Notice>}
        <Button primary className="full" disabled={busy || !navigator.onLine}>
          {busy
            ? "Un momento…"
            : mode === "signup"
              ? "Crear cuenta"
              : mode === "reset"
                ? "Enviar enlace"
                : mode === "new-password"
                  ? "Guardar contraseña"
                  : "Iniciar sesión"}
        </Button>
        {!navigator.onLine && (
          <p className="caption">
            Conéctate a internet para entrar a tu cuenta.
          </p>
        )}
      </form>
      {mode !== "new-password" && (
        <div className="auth-links">
          <button
            onClick={() => {
              setMessage("");
              setMode(mode === "signup" ? "login" : "signup");
            }}
          >
            {mode === "signup" ? "Ya tengo cuenta" : "Crear una cuenta"}
          </button>
          <button
            onClick={() => {
              setMessage("");
              setMode("reset");
            }}
          >
            Olvidé mi contraseña
          </button>
        </div>
      )}
      <p className="caption center">
        <ShieldCheck size={13} /> Tus datos están separados de los de otros
        usuarios.
      </p>
    </Modal>
  );
}
