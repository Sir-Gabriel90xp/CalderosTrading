import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import SiteNavigation from '@/components/SiteNavigation';
export const metadata:Metadata={title:{default:'CalderosTrading | Academia',template:'%s | CalderosTrading'},description:'Formación estructurada en trading y mercados financieros.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body><header className="header"><div className="shell header-inner"><Link className="brand" href="/"><img src="/logo.jpeg" alt=""/>CalderosTrading</Link><nav className="nav" aria-label="Principal"><SiteNavigation/></nav></div></header>{children}<footer className="footer"><div className="shell"><div><b>CalderosTrading</b><p className="tiny">Cocina tu futuro.</p></div><p className="tiny" style={{maxWidth:560}}>Contenido educativo. No constituye asesoramiento financiero, recomendación de inversión ni garantía de resultados. Operar en mercados financieros implica riesgo de pérdida.</p></div></footer></body></html>}
