import Link from "next/link";
import Image from "next/image";
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

const SPONSORS_PRINCIPALES = [
  { nombre: "Renato Conti", logo: "/images/sponsors/logo-rc.png", url: "https://renatoconti.uy/" },
  { nombre: "Itaú", logo: "/images/sponsors/logo-itau.png", url: "https://www.itau.com.uy/inst/" },
  { nombre: "UCU", logo: "/images/sponsors/logo-ucu.png", url: "https://www.ucu.edu.uy/" },
  { nombre: "Summum", logo: "/images/sponsors/logo-summum.png", url: "https://summum.com.uy/" },
];
const SPONSORS_SECUNDARIOS = [
  { nombre: "Zillertal", logo: "/images/sponsors/logo-zillertal.png", url: "https://www.fnc.com.uy/" },
  { nombre: "SUAT", logo: "/images/sponsors/logo-suat.png", url: "https://www.suat.com.uy/" },
  { nombre: "Gatorade", logo: "/images/sponsors/logo-gatorade.png", url: "https://www.gatorade-uruguay.com/" },
];

const SOCIAL_LINKS = [
  {
    href: "https://www.instagram.com/club.seminario",
    label: "Instagram",
    icon: Instagram,
  },
  {
    href: "https://www.facebook.com/clubseminario",
    label: "Facebook",
    icon: Facebook,
  },
  {
    href: "https://x.com/clubseminariouy",
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
              href="tel:+59891965438"
              className="font-body text-sm text-white/50 hover:text-white transition-colors duration-200"
            >
              +598 91 965 438
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
                Martes, Jueves y Viernes
                <br />
                12:30 a 15:30 hs
              </p>
            </div>
          </FooterColumn>
        </div>

        {/* Sponsors */}
        <div className="mt-16 mb-2">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-dorado-400/20 to-transparent" />
            <span className="font-heading uppercase tracking-[0.25em] text-[10px] text-dorado-300/40">
              Nos acompañan
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-dorado-400/20 to-transparent" />
          </div>
          {/* Principales — más grandes y visibles */}
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 sm:gap-x-16 mb-6">
            {SPONSORS_PRINCIPALES.map((sponsor) => (
              <a
                key={sponsor.nombre}
                href={sponsor.url}
                target="_blank"
                rel="noopener noreferrer"
                title={sponsor.nombre}
              >
                <div
                  className="sponsor-logo h-8 w-24 sm:h-10 sm:w-32 opacity-40 hover:opacity-70 transition-opacity duration-300"
                  style={
                    {
                      "--logo-src": `url(${sponsor.logo})`,
                      backgroundColor: "rgba(247, 182, 67, 0.9)",
                    } as React.CSSProperties
                  }
                  role="img"
                  aria-label={sponsor.nombre}
                />
              </a>
            ))}
          </div>
          {/* Secundarios — más chicos y sutiles */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12">
            {SPONSORS_SECUNDARIOS.map((sponsor) => (
              <a
                key={sponsor.nombre}
                href={sponsor.url}
                target="_blank"
                rel="noopener noreferrer"
                title={sponsor.nombre}
              >
                <div
                  className="sponsor-logo h-5 w-16 sm:h-6 sm:w-20 opacity-25 hover:opacity-50 transition-opacity duration-300"
                  style={
                    {
                      "--logo-src": `url(${sponsor.logo})`,
                      backgroundColor: "rgba(247, 182, 67, 0.9)",
                    } as React.CSSProperties
                  }
                  role="img"
                  aria-label={sponsor.nombre}
                />
              </a>
            ))}
          </div>
        </div>

        {/* Bottom divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-dorado-400/10 to-transparent mt-10 mb-6" />

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
