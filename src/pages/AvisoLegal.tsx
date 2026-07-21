import { Link } from "react-router-dom";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl text-foreground">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

// ─── FILL IN THESE DETAILS ────────────────────────────────────────────────────
// Required under LSSI Article 10. Update before going live.
const COMPANY_NAME    = "[RAZÓN SOCIAL]";       // e.g. "Olia Technologies S.L."
const CIF             = "[CIF]";                // e.g. "B12345678"
const ADDRESS         = "[DOMICILIO SOCIAL]";   // e.g. "Carrer de Example 1, 1º 1ª, 08001 Barcelona"
const REGISTRO        = "[REGISTRO MERCANTIL]"; // e.g. "Registro Mercantil de Barcelona, Tomo X, Folio Y, Hoja Z"
// ─────────────────────────────────────────────────────────────────────────────

export default function AvisoLegal() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">

        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Olia
        </Link>

        <div className="space-y-2">
          <h1 className="font-display text-4xl text-foreground">Aviso Legal</h1>
          <p className="text-sm text-muted-foreground">
            Legal Notice — requerido por el artículo 10 de la Ley 34/2002, LSSI-CE.
            Última actualización: 21 de julio de 2026.
          </p>
        </div>

        <Section title="1. Datos identificativos del titular">
          <p>
            En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la
            Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se facilitan los
            siguientes datos identificativos:
          </p>
          <ul className="space-y-1 not-prose">
            <li><strong className="text-foreground">Denominación social:</strong> {COMPANY_NAME}</li>
            <li><strong className="text-foreground">NIF/CIF:</strong> {CIF}</li>
            <li><strong className="text-foreground">Domicilio social:</strong> {ADDRESS}</li>
            <li><strong className="text-foreground">Correo electrónico:</strong>{" "}
              <a href="mailto:hello@oliahq.com" className="underline underline-offset-2 hover:text-foreground transition-colors">
                hello@oliahq.com
              </a>
            </li>
            <li><strong className="text-foreground">Sitio web:</strong> oliahq.com</li>
            <li><strong className="text-foreground">Registro Mercantil:</strong> {REGISTRO}</li>
          </ul>
        </Section>

        <Section title="2. Objeto y ámbito de aplicación">
          <p>
            El presente Aviso Legal regula el acceso y uso del sitio web oliahq.com y de la
            aplicación Olia (en adelante, "el Servicio"), titularidad de {COMPANY_NAME}.
          </p>
          <p>
            El acceso y uso del Servicio atribuye la condición de usuario e implica la aceptación
            plena de las condiciones incluidas en este Aviso Legal.
          </p>
        </Section>

        <Section title="3. Propiedad intelectual e industrial">
          <p>
            Todos los contenidos del Servicio —incluyendo, sin carácter limitativo, textos,
            fotografías, gráficos, imágenes, iconos, tecnología, software, diseño gráfico y
            códigos fuente— son propiedad intelectual de {COMPANY_NAME} o de terceros que han
            autorizado su uso, y están protegidos por la legislación española e internacional de
            propiedad intelectual e industrial.
          </p>
          <p>
            Queda expresamente prohibida la reproducción, distribución, comunicación pública y
            transformación de los contenidos del Servicio sin la autorización previa y por escrito
            del titular.
          </p>
          <p>
            El contenido que el usuario crea dentro de Olia (listas de verificación, documentos,
            materiales de formación) es propiedad del usuario.
          </p>
        </Section>

        <Section title="4. Condiciones de uso">
          <p>El usuario se compromete a hacer un uso adecuado del Servicio y, en particular, a no:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Utilizar el Servicio con fines ilícitos o contrarios a la ley</li>
            <li>Introducir virus, malware u otros elementos dañinos</li>
            <li>Intentar acceder sin autorización a datos de otras organizaciones</li>
            <li>Reproducir o explotar comercialmente los contenidos sin autorización</li>
          </ul>
        </Section>

        <Section title="5. Exclusión de responsabilidad">
          <p>
            {COMPANY_NAME} no se hace responsable de los daños y perjuicios de cualquier
            naturaleza que puedan derivarse del acceso o uso del Servicio, de la imposibilidad de
            acceso o de fallos en la seguridad que pudieran afectar a la información transmitida.
          </p>
          <p>
            En la medida permitida por la ley española, la responsabilidad total de {COMPANY_NAME}
            frente al usuario por cualquier reclamación derivada del uso del Servicio quedará
            limitada al importe abonado por el usuario en los tres meses anteriores a la
            reclamación.
          </p>
        </Section>

        <Section title="6. Protección de datos">
          <p>
            El tratamiento de los datos personales de los usuarios del Servicio se rige por la
            Política de Privacidad disponible en{" "}
            <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
              oliahq.com/privacy
            </Link>
            , elaborada de conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica
            3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los
            derechos digitales (LOPDGDD).
          </p>
          <p>
            La autoridad de control competente en España es la Agencia Española de Protección de
            Datos (AEPD), con sede en C/ Jorge Juan, 6, 28001 Madrid —{" "}
            <a
              href="https://www.aepd.es"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              www.aepd.es
            </a>.
          </p>
        </Section>

        <Section title="7. Cookies">
          <p>
            El Servicio utiliza cookies propias y de terceros. Para más información, consulte
            nuestra{" "}
            <Link to="/cookies" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Política de Cookies
            </Link>
            , elaborada de conformidad con el artículo 22.2 de la LSSI-CE y las directrices de la AEPD.
          </p>
        </Section>

        <Section title="8. Ley aplicable y jurisdicción">
          <p>
            El presente Aviso Legal se rige por la legislación española. Para la resolución de
            cualquier controversia derivada del acceso o uso del Servicio, las partes se someten,
            con renuncia expresa a cualquier otro fuero que pudiera corresponderles, a la
            jurisdicción de los Juzgados y Tribunales de la ciudad de Barcelona.
          </p>
        </Section>

        <div className="pt-6 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground transition-colors">Política de Privacidad</Link>
          <Link to="/cookies" className="hover:text-foreground transition-colors">Política de Cookies</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Términos de Servicio</Link>
        </div>
      </div>
    </div>
  );
}
