import { CuentaForm } from "@/components/tesoreria/cuenta-form";

export default function NuevaCuentaPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Nueva cuenta
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-body">
          Cuentas bancarias ITAÚ (UYU o USD) o caja chica para efectivo.
        </p>
      </div>
      <CuentaForm />
    </div>
  );
}
