function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '20px 24px', marginBottom: '16px',
    }}>
      <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
        {title}
      </p>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
        background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)',
        color: 'var(--accent)', fontSize: '11px', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {n}
      </span>
      <span style={{ paddingTop: '2px' }}>{children}</span>
    </div>
  )
}

function ModuleRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)', minWidth: '150px', flexShrink: 0 }}>
        {name}
      </span>
      <span>{desc}</span>
    </div>
  )
}

export default function AyudaPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Ayuda
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Guía rápida de Wealth — qué es cada cosa y cómo usarla
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: '780px' }}>

        <Section title="¿Qué es Wealth?">
          Es una app privada (solo para ustedes dos) para llevar el control de sus finanzas
          personales: cuánto entra, cuánto sale, en qué cuentas está la plata, y cómo va el
          plan del mes comparado con lo que realmente pasó. Cada uno tiene su propia cuenta y
          su propia data — lo de Juan y lo de Dani nunca se mezclan.
        </Section>

        <Section title="El menú de la izquierda — qué hace cada pestaña">
          <ModuleRow name="Dashboard" desc="Resumen general: cuánto entró y salió por mes, ingresos por fuente, gastos por categoría, y tu patrimonio neto." />
          <ModuleRow name="Transactions" desc="La lista completa de todos tus movimientos (ingresos, gastos, transferencias). Aquí también agregas uno nuevo a mano." />
          <ModuleRow name="AI Import" desc="Sube una foto o captura de tu estado de cuenta y una IA extrae las transacciones automáticamente, para no digitarlas una por una." />
          <ModuleRow name="Balances" desc="Cuánta plata tienes en cada cuenta (bancos, inversiones, tarjetas) y tu patrimonio total." />
          <ModuleRow name="Plan vs Real" desc="Compara lo que planeaste gastar/ganar cada mes contra lo que realmente pasó, categoría por categoría." />
          <ModuleRow name="Cashflow" desc="Vista mes a mes de todo el flujo de caja del año — parecido a Plan vs Real, pero enfocado en el saldo acumulado." />
          <ModuleRow name="Equity" desc="Seguimiento de tus inversiones/portafolio a lo largo del tiempo." />
          <ModuleRow name="FX Rates" desc="Historial de la tasa de cambio USD/COP que usa la app para convertir montos." />
          <ModuleRow name="Data Source" desc="Configuración de fondo: tus cuentas, categorías, y cómo se importan los estados de cuenta. Normalmente no necesitas entrar aquí seguido." />
        </Section>

        <Section title="El botón COP / USD (arriba del todo, en el menú de la izquierda)">
          Ese switch decide en qué moneda ves TODOS los números de la app, sin importar en qué
          moneda hayas registrado cada transacción originalmente. Si algo estaba en otra
          moneda, la app lo convierte usando la tasa de cambio real del mes correspondiente.
          Es solo para <em>ver</em> — no cambia nada guardado en la base de datos.
        </Section>

        <Section title="Cómo registrar una transacción a mano">
          <Step n={1}>Entra a <strong>Transactions</strong>.</Step>
          <Step n={2}>Dale clic al botón <strong>&ldquo;+ New Transaction&rdquo;</strong>.</Step>
          <Step n={3}>Llena: fecha, tipo (Ingreso/Gasto/etc.), categoría, cuenta de origen o destino, y el monto.</Step>
          <Step n={4}>Guarda. Aparece de inmediato en la lista y se refleja en Dashboard, Balances, etc.</Step>
        </Section>

        <Section title="Cómo usar AI Import paso a paso">
          <Step n={1}>
            La primera vez, alguien (Juan) debe entrar a <strong>Data Source → Accounts</strong>{' '}
            y activar &ldquo;Configure Import&rdquo; en la cuenta que quieras importar — esto solo se hace una vez por cuenta.
          </Step>
          <Step n={2}>Entra a <strong>AI Import</strong> y elige la cuenta (&ldquo;Select Account&rdquo;).</Step>
          <Step n={3}>Sube la foto o captura de pantalla del estado de cuenta (arrastra el archivo o haz clic para elegirlo).</Step>
          <Step n={4}>
            Pega tu propia API key de Claude, ChatGPT o Gemini (la que tú misma hayas generado
            en la web de ese proveedor). La app nunca la guarda — solo la usa para esa consulta.
          </Step>
          <Step n={5}>Dale clic a <strong>&ldquo;Run Analysis&rdquo;</strong> y espera unos segundos mientras la IA lee el estado de cuenta.</Step>
          <Step n={6}>Revisa las transacciones que se extrajeron — puedes corregir cualquier cosa antes de confirmar.</Step>
          <Step n={7}>Confirma, y quedan agregadas a tu lista de Transactions.</Step>
        </Section>

        <Section title="Preguntas frecuentes">
          <p style={{ marginBottom: '10px' }}>
            <strong>¿Necesito internet?</strong> Sí, la app vive en internet ahora (ya no en un
            computador local) — entras desde cualquier navegador, en cualquier computador.
          </p>
          <p style={{ marginBottom: '10px' }}>
            <strong>¿Mis datos se mezclan con los de Juan?</strong> No, nunca — cada cuenta ve
            solo su propia información.
          </p>
          <p style={{ marginBottom: '10px' }}>
            <strong>¿Qué hago si algo no carga o se ve raro?</strong> Avísale a Juan — probablemente
            sea algo puntual y rápido de revisar.
          </p>
          <p>
            <strong>¿La API key de AI Import cuesta algo?</strong> Sí, ese costo es directo con
            el proveedor (Anthropic, OpenAI o Google), según cuánto la uses — no es un costo de Wealth.
          </p>
        </Section>

      </div>
    </div>
  )
}
