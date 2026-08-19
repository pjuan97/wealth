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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Ayuda
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Guía rápida de Wealth — qué es cada cosa y cómo usarla
        </p>
      </div>

      <div className="page-body" style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: '780px' }}>

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

        <Section title="Cómo funciona cada módulo, a fondo">
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Plan vs Real</p>
          <p style={{ marginBottom: '14px' }}>
            <strong>Qué hay:</strong> una tabla con tus categorías de ingreso y gasto, mes por mes,
            mostrando &ldquo;Plan&rdquo; (lo que esperabas) contra &ldquo;Executed&rdquo; (lo que
            realmente pasó) y la diferencia. <strong>Cómo se llena:</strong> el Plan lo escribes tú
            directamente en la tabla (das clic en el número y lo cambias) — es tu presupuesto. El
            Executed se llena solo, a medida que registras transacciones reales en Transactions o
            AI Import. También puedes subir o descargar todo el Plan de una vez con los botones
            &ldquo;Export CSV&rdquo; / &ldquo;Import CSV&rdquo; de esta misma página.{' '}
            <strong>Para qué sirve:</strong> para saber si te estás pasando o quedando corto en
            cada categoría, comparado con lo planeado.
          </p>

          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Cashflow</p>
          <p style={{ marginBottom: '14px' }}>
            <strong>Qué hay:</strong> el año completo, mes por mes, con saldo de apertura, ingreso
            y gasto totales, y un balance acumulado (cuánto te va quedando, sumando mes tras mes).{' '}
            <strong>Cómo se llena:</strong> el &ldquo;Executed&rdquo; viene automático de
            Transactions, igual que en Plan vs Real. El &ldquo;Plan&rdquo; que ves aquí{' '}
            <strong>es el mismo</strong> que en Plan vs Real — es la misma información, solo que
            Cashflow te la muestra como flujo de caja acumulado. Puedes editarlo directamente aquí
            (doble clic en la celda) para simular &ldquo;qué pasaría si cambio el plan de un mes
            futuro&rdquo; y ver cómo mueve el balance de los meses siguientes; si te gusta el
            resultado, le das &ldquo;Save&rdquo; y queda guardado también en Plan vs Real (o
            &ldquo;Discard&rdquo; si solo estabas probando). <strong>Para qué sirve:</strong> ver
            la foto completa del año y jugar con el plan futuro sin perder de vista el saldo.
          </p>

          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Balances</p>
          <p style={{ marginBottom: '14px' }}>
            <strong>Qué hay:</strong> el saldo actual de cada cuenta (bancos, inversiones, deudas)
            y tu patrimonio neto total. <strong>Cómo se llena:</strong> no se llena a mano — se
            calcula solo, sumando todas las transacciones que ya registraste.{' '}
            <strong>Para qué sirve:</strong> ver de un vistazo cuánta plata tienes hoy, en dónde, y qué debes.
          </p>

          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Equity</p>
          <p style={{ marginBottom: '14px' }}>
            <strong>Qué hay:</strong> el valor proyectado vs. el real de tus cuentas de inversión,
            mes por mes. <strong>Cómo se llena:</strong> el valor planeado se proyecta solo con una
            tasa de rendimiento; el valor real lo actualizas tú cuando revisas el estado de cuenta
            de esa inversión. <strong>Para qué sirve:</strong> comparar cómo va tu portafolio real
            contra lo que esperabas que rindiera.
          </p>

          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>FX Rates</p>
          <p style={{ marginBottom: '14px' }}>
            <strong>Qué hay:</strong> el historial de la tasa de cambio USD/COP, día por día.{' '}
            <strong>Cómo se llena:</strong> sola — un proceso automático la trae una vez al día.{' '}
            <strong>Para qué sirve:</strong> es lo que usa la app por detrás para convertir montos
            entre monedas (por ejemplo, el switch COP/USD).
          </p>

          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Data Source</p>
          <p>
            <strong>Qué hay:</strong> la configuración de fondo — tus cuentas (bancos, tarjetas,
            inversiones), tus categorías de ingreso/gasto, y la config de AI Import por cuenta.{' '}
            <strong>Cómo se llena:</strong> la llenas una sola vez al principio, o cuando abres una
            cuenta nueva (por ejemplo, una tarjeta de crédito nueva). <strong>Para qué sirve:</strong>{' '}
            es el &ldquo;mapa&rdquo; de tu vida financiera antes de empezar a registrar movimientos.
          </p>
        </Section>

        <Section title="Cómo registrar transacciones — a mano, o en bloque">
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Una por una</p>
          <Step n={1}>Entra a <strong>Transactions</strong>.</Step>
          <Step n={2}>Dale clic al botón <strong>&ldquo;+ New Transaction&rdquo;</strong>.</Step>
          <Step n={3}>Llena: fecha, tipo (Ingreso/Gasto/etc.), categoría, cuenta de origen o destino, y el monto.</Step>
          <Step n={4}>Guarda. Aparece de inmediato en la lista y se refleja en Dashboard, Balances, etc.</Step>

          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '16px', marginBottom: '4px' }}>
            En bloque (varias de una vez)
          </p>
          <p>
            Tanto en <strong>Transactions</strong> como en <strong>Plan vs Real</strong> hay
            botones <strong>&ldquo;Export CSV&rdquo;</strong> y <strong>&ldquo;Import CSV&rdquo;</strong>{' '}
            en la parte de arriba. Export te descarga un archivo de Excel/CSV con lo que ya tienes
            (puedes elegir el mes actual, todo el historial, o un rango de fechas); Import te deja
            subir un CSV para crear muchas transacciones (o filas de Plan) de una sola vez. Es útil
            cuando prefieres armar o corregir varias filas en Excel antes de subirlas, en vez de
            escribirlas una por una en la app.
          </p>
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
            <strong>¿Cómo registro una deuda que ya tenía antes de usar Wealth (ej. saldo existente en una tarjeta de crédito)?</strong>{' '}
            En <strong>Transactions</strong>, crea una transacción tipo <strong>Opening Balance</strong>,
            con cuenta de origen = la tarjeta (ej. &ldquo;TC Bac&rdquo;), cuenta de destino = vacía,
            y el monto = lo que ya debes hoy. Con eso, Balances la muestra como deuda desde el primer día.
            (La cuenta debe existir primero en Data Source → Accounts, tipo &ldquo;Deuda&rdquo;.)
          </p>
          <p style={{ marginBottom: '10px' }}>
            <strong>¿Cómo registro un pago a esa tarjeta desde mi cuenta de ahorros?</strong>{' '}
            Con una sola transacción tipo <strong>Debt Payment</strong>: cuenta de origen = tu
            cuenta de ahorros, cuenta de destino = la tarjeta, monto = lo pagado. Esa única
            transacción reduce el saldo del banco y la deuda al mismo tiempo — no hace falta
            registrar dos movimientos.
          </p>
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
