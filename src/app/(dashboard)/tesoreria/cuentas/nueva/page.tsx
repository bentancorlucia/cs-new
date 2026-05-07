import { CuentaForm } from "@/components/tesoreria/cuenta-form";

export default function NuevaCuentaPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="font-heading text-xl text-bordo-900">Nueva cuenta</h2>
        <p className="text-sm text-muted-foreground">
          Cuentas bancarias ITAÚ (UYU o USD) o caja chica para efectivo.
        </p>
      </div>
      <CuentaForm />
    </div>
  );
}
