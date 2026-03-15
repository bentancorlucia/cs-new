export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Panel izquierdo — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-bordo">
        {/* Círculos decorativos */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-bordo-900/40 blur-3xl" />
        <div className="absolute bottom-20 right-10 w-72 h-72 rounded-full bg-dorado-300/10 blur-2xl" />
        <div className="absolute top-1/3 right-1/4 w-48 h-48 rounded-full bg-dorado-400/8 blur-xl" />

        {/* Línea decorativa dorada */}
        <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-transparent via-dorado-300/40 to-transparent" />

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="mb-6">
            <div className="inline-block px-3 py-1 rounded-full bg-dorado-300/20 border border-dorado-300/30 mb-6">
              <span className="text-dorado-200 text-sm font-heading font-medium tracking-wide uppercase">
                Desde 2010
              </span>
            </div>
            <h1 className="font-display text-5xl xl:text-6xl font-bold tracking-tightest leading-[0.95]">
              Club
              <br />
              <span className="text-dorado-300">Seminario</span>
            </h1>
          </div>
          <p className="text-white/70 text-lg font-body max-w-sm leading-relaxed">
            Deporte, cultura y comunidad.
            <br />
            Tu club, tu lugar.
          </p>

          {/* Línea decorativa */}
          <div className="mt-8 flex items-center gap-3">
            <div className="h-px w-12 bg-dorado-300/50" />
            <div className="h-1.5 w-1.5 rounded-full bg-dorado-300" />
            <div className="h-px w-24 bg-dorado-300/30" />
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center bg-fondo relative">
        {/* Sutil mesh de fondo */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(115,13,50,0.04)_0%,_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(247,182,67,0.04)_0%,_transparent_50%)]" />

        <div className="relative z-10 w-full flex items-center justify-center">
          {children}
        </div>
      </div>
    </div>
  );
}
