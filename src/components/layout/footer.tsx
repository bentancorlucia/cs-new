import Link from "next/link";
import { Instagram, Facebook, Twitter } from "lucide-react";

const CLUB_LINKS = [
  { href: "/club/directiva", label: "Directiva" },
  { href: "/club/instalaciones", label: "Instalaciones" },
  { href: "/club/estatuto", label: "Estatuto" },
  { href: "/club/reglamento", label: "Reglamento" },
  { href: "/club/memorias", label: "Memorias" },
];

const DEPORTES_LINKS = [
  { href: "/deportes/basquetbol", label: "Básquetbol" },
  { href: "/deportes/corredores", label: "Corredores" },
  { href: "/deportes/handball", label: "Handball" },
  { href: "/deportes/hockey", label: "Hockey" },
  { href: "/deportes/futbol", label: "Fútbol" },
  { href: "/deportes/rugby", label: "Rugby" },
  { href: "/deportes/voley", label: "Vóleibol" },
];

const SOCIOS_LINKS = [
  { href: "/socios", label: "Hacete socio" },
  { href: "/beneficios", label: "Beneficios" },
  { href: "/tienda", label: "Tienda" },
];

const SOCIAL_LINKS = [
  {
    href: "https://www.instagram.com/clubseminario",
    label: "Instagram",
    icon: Instagram,
  },
  {
    href: "https://www.facebook.com/clubseminario",
    label: "Facebook",
    icon: Facebook,
  },
  {
    href: "https://x.com/clubseminario",
    label: "X",
    icon: Twitter,
  },
];

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-heading uppercase tracking-editorial text-xs text-dorado-300/60 mb-4">
        {title}
      </h3>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="font-body text-sm text-white/50 hover:text-white transition-colors duration-200"
    >
      {label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="relative bg-bordo-800 noise-overlay overflow-hidden border-t-4 border-dorado-400" role="contentinfo" aria-label="Pie de página">
      <div className="absolute top-0 left-0 w-[30rem] h-[30rem] bg-gradient-to-br from-dorado-400/40 via-dorado-300/15 to-transparent rounded-full blur-3xl -translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 right-0 w-[34rem] h-[34rem] bg-gradient-to-tl from-dorado-400/35 via-dorado-300/15 to-transparent rounded-full blur-3xl translate-x-1/4 translate-y-1/4" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        {/* Top section — Club name */}
        <div className="mb-12">
          <h2 className="font-display text-display uppercase text-dorado-300 leading-none">
            Club
            <br />
            Seminario
          </h2>
          <p className="mt-4 font-body text-sm text-white/40 max-w-xs">
            Club deportivo, social y cultural de la comunidad jesuita en
            Uruguay.
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-bordo-800/30 mb-10" />

        {/* Columns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 lg:gap-12">
          <FooterColumn title="El Club">
            {CLUB_LINKS.map((link) => (
              <FooterLink key={link.href} {...link} />
            ))}
          </FooterColumn>

          <FooterColumn title="Deportes">
            {DEPORTES_LINKS.map((link) => (
              <FooterLink key={link.href} {...link} />
            ))}
          </FooterColumn>

          <FooterColumn title="Socios">
            {SOCIOS_LINKS.map((link) => (
              <FooterLink key={link.href} {...link} />
            ))}
          </FooterColumn>

          <FooterColumn title="Contacto">
            <a
              href="tel:099613671"
              className="font-body text-sm text-white/50 hover:text-white transition-colors duration-200"
            >
              099 613 671
            </a>
            <a
              href="mailto:secretaria@clubseminario.com.uy"
              className="font-body text-sm text-white/50 hover:text-white transition-colors duration-200 break-all"
            >
              secretaria@clubseminario.com.uy
            </a>
            <span className="font-body text-sm text-white/40">
              Soriano 1472, Montevideo
            </span>

            <div className="mt-2">
              <span className="font-heading uppercase tracking-editorial text-xs text-dorado-300/60">
                Horario
              </span>
              <p className="font-body text-sm text-white/40 mt-1">
                Mar, Jue, Vie
                <br />
                10 a 13 hs
              </p>
            </div>
          </FooterColumn>
        </div>

        {/* Bottom divider */}
        <div className="h-px bg-bordo-800/30 mt-12 mb-6" />

        {/* Bottom section */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Social links */}
          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                className="size-9 rounded-full border border-white/15 flex items-center justify-center text-white/40 hover:border-dorado-300 hover:text-dorado-300 hover:bg-dorado-300/10 transition-all duration-200"
              >
                <social.icon className="size-4" strokeWidth={1.5} />
              </a>
            ))}
          </div>

          {/* Copyright */}
          <p className="font-body text-xs text-white/30">
            &copy; {new Date().getFullYear()} Club Seminario. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
