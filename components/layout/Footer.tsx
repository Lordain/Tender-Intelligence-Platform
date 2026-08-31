export function Footer() {
  return (
    <footer className="border-t border-zinc-200 py-8 dark:border-zinc-800">
      <div className="mx-auto max-w-6xl px-6 text-xs text-zinc-500 dark:text-zinc-500">
        <p>
          Tender Intelligence Platform — Decision support, not a guarantee of
          eligibility. Every requirement links back to its original source
          document.
        </p>
        <p className="mt-2">
          © {new Date().getFullYear()} Tender Intelligence. Data sourced from
          Compras MX and Diario Oficial de la Federación (DOF).
        </p>
      </div>
    </footer>
  );
}
