import { ArrowUpRight, BookOpen, Play, WifiOff } from "lucide-react";
import { Card, LinkButton, Notice } from "../components/ui";
export default function Learn({ online }) {
  return (
    <>
      <Card className="learn-card">
        <div className="video-frame">
          {online ? (
            <iframe
              src="https://www.youtube-nocookie.com/embed/ebEGDQ3V0yk?start=35"
              title="Aprende de trading · video de YouTube"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <div className="offline-video">
              <WifiOff size={35} />
              <h2>Este video necesita internet</h2>
              <p>Las calculadoras y tu registro siguen disponibles.</p>
            </div>
          )}
        </div>
        <div className="learn-info">
          <div>
            <span className="eyebrow">BIBLIOTECA DE APRENDIZAJE</span>
            <h2>Haz espacio para aprender.</h2>
            <p className="muted">
              Reproduce desde el segundo 35 o continúa en YouTube.
            </p>
          </div>
          <LinkButton href="https://www.youtube.com/watch?v=ebEGDQ3V0yk&t=35s">
            Ver en YouTube
          </LinkButton>
        </div>
      </Card>
      <div className="learning-note">
        <BookOpen size={20} />
        <p>
          Aprende a tu ritmo. Lleva tus ideas al plan y revisa tu gestión de
          riesgo antes de operar.
        </p>
      </div>
    </>
  );
}
