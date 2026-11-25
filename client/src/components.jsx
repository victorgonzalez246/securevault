// Componentes compartidos. React escapa todo el texto que se renderiza con {}:
// nunca se usa dangerouslySetInnerHTML (A05: XSS).
export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <article className="msg msg-error" role="alert">
      <strong>{error.message}</strong>
      {error.fields?.length > 0 && (
        <ul>
          {error.fields.map((f, i) => (
            <li key={i}>{f.message}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function Notice({ children }) {
  if (!children) return null;
  return (
    <article className="msg msg-ok" role="status">
      {children}
    </article>
  );
}

export const PASSWORD_HINT = 'Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo.';
