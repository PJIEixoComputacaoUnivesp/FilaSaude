import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import {
  AdminApiError,
  actionLabel,
  adminErrorMessage,
  coordinateError,
  extractCoordinatePair,
  fetchAdminLogin,
  formatCoordinate,
  formatCoordinateInput,
  formatDateTime,
  listCorrectionEvents,
  listCorrections,
  methodError,
  METHOD_MAX_LENGTH,
  normalizeCnesCode,
  parseCoordinate,
  removeCorrection,
  saveCorrection,
  type Correction,
  type CorrectionEvent,
} from "./admin";
import { NationalStateCode } from "./brazilianStates";
import { PositionPicker } from "./PositionPicker";
import { formatAddress, formatPosition, type HealthUnit } from "./units";
import { clearUnitsCache, useUnits } from "./useUnits";

interface Session {
  token: string;
  login: string;
}

type Load<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

const fieldClass =
  "w-full rounded-xl border bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-fila-blue focus:ring-2 focus:ring-blue-100";
// aria-disabled, not disabled, for buttons that stay focused while they work:
// a disabled button loses focus and the browser does not give it back.
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-fila-blue px-5 py-2 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 transition hover:border-fila-blue hover:text-fila-blue disabled:cursor-not-allowed disabled:opacity-60";
const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-4 sm:p-6";

/** Keeps search engines away from a page that is not meant to be found. */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.append(meta);
    return () => meta.remove();
  }, []);
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-red-800">
      {message}
    </p>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950"
      role="alert"
    >
      {children}
    </div>
  );
}

// ---- sign in ----

function SignIn({
  notice,
  onSignedIn,
}: {
  notice: string | null;
  onSignedIn: (session: Session) => void;
}) {
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const pendingNow = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const tokenId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pendingNow.current) return;
    const value = token.trim();
    if (!value) {
      setError("Informe o seu token de administrador.");
      return;
    }
    pendingNow.current = true;
    setPending(true);
    setError(null);
    fetchAdminLogin(value)
      .then((login) => {
        setToken("");
        onSignedIn({ token: value, login });
      })
      .catch((failure: unknown) => {
        setError(
          adminErrorMessage(
            failure instanceof AdminApiError ? failure.kind : "unexpected",
            "signIn",
          ),
        );
        pendingNow.current = false;
        setPending(false);
      });
  };

  return (
    <form onSubmit={submit} className={`${cardClass} max-w-xl`} noValidate>
      <h2 className="text-xl font-bold text-slate-900">Entrar</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Use o token pessoal que a equipe entregou a você. Ele fica apenas na
        memória desta aba e não é salvo: ao recarregar a página, informe-o de
        novo.
      </p>

      {notice && (
        <div
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          {notice}
        </div>
      )}

      <label htmlFor={tokenId} className="mt-5 block">
        <span className="mb-2 block text-sm font-semibold text-slate-800">
          Token de administrador
        </span>
        <input
          id={tokenId}
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${tokenId}-error` : undefined}
          className={`${fieldClass} ${error ? "border-red-400" : "border-slate-300"}`}
        />
      </label>
      <div id={`${tokenId}-error`} aria-live="polite">
        {error && <p className="mt-2 text-sm font-medium text-red-800">{error}</p>}
      </div>

      <button
        type="submit"
        aria-disabled={pending}
        className={`${primaryButton} mt-5`}
      >
        {pending ? "Verificando…" : "Entrar"}
      </button>
    </form>
  );
}

// ---- the form that sets a position ----

function CorrectionForm({
  token,
  units,
  onSaved,
  onSessionLost,
}: {
  token: string;
  units: HealthUnit[];
  onSaved: (cnesCode: string) => void;
  onSessionLost: () => void;
}) {
  const [unitText, setUnitText] = useState("");
  const [chosen, setChosen] = useState<HealthUnit | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [method, setMethod] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  // State updates after the event, so a second click in the same tick would
  // still read `saving` as false; the ref is read and written at once.
  const savingNow = useRef(false);
  const [result, setResult] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);
  const ids = useId();
  const unitRef = useRef<HTMLInputElement>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);
  const methodRef = useRef<HTMLTextAreaElement>(null);

  // The unit as picked is only a fallback while the list reloads: after a
  // change the list holds the current position, and that is what to show.
  const selected = chosen
    ? (units.find((unit) => unit.id === chosen.id) ?? chosen)
    : null;
  const typedCode = normalizeCnesCode(unitText);
  const code = selected?.id ?? typedCode;
  // A typed code can still be one of the units the page knows.
  const known = selected ?? units.find((unit) => unit.id === typedCode);

  const matches = useMemo(() => {
    const query = unitText.trim().toLocaleLowerCase("pt-BR");
    if (selected || typedCode || query.length < 3) return [];
    return units
      .filter((unit) =>
        `${unit.name} ${unit.address.city} ${unit.address.state}`
          .toLocaleLowerCase("pt-BR")
          .includes(query),
      )
      .slice(0, 8);
  }, [selected, typedCode, unitText, units]);

  const latitudeValue = parseCoordinate(latitude);
  const longitudeValue = parseCoordinate(longitude);
  const proposed =
    latitudeValue !== null && longitudeValue !== null
      ? { latitude: latitudeValue, longitude: longitudeValue }
      : null;
  const current =
    known && known.location.latitude !== null && known.location.longitude !== null
      ? { latitude: known.location.latitude, longitude: known.location.longitude }
      : null;

  const errors = {
    unit: code
      ? null
      : "Informe o código CNES (até 7 números) ou escolha uma unidade da lista.",
    latitude: coordinateError(latitude, "latitude"),
    longitude: coordinateError(longitude, "longitude"),
    method: methodError(method),
  };
  const visible = attempted ? errors : { unit: null, latitude: null, longitude: null, method: null };

  // Pasting "latitude, longitude" from a map fills both fields. Only a real
  // paste is split: while typing, "-23,5343, -46" would already look like a
  // pair and scramble what is being typed.
  const pastePair = (event: ClipboardEvent<HTMLInputElement>) => {
    const pair = extractCoordinatePair(event.clipboardData.getData("text"));
    if (!pair) return;
    event.preventDefault();
    setLatitude(pair[0]);
    setLongitude(pair[1]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (savingNow.current) return;
    setResult(null);
    const firstInvalid = errors.unit
      ? unitRef
      : errors.latitude
        ? latitudeRef
        : errors.longitude
          ? longitudeRef
          : errors.method
            ? methodRef
            : null;
    if (firstInvalid) {
      setAttempted(true);
      firstInvalid.current?.focus();
      return;
    }

    savingNow.current = true;
    setSaving(true);
    saveCorrection(token, code!, {
      latitude: latitudeValue!,
      longitude: longitudeValue!,
      method: method.trim(),
    })
      .then(() => {
        setResult({
          kind: "success",
          // The national view comes from a snapshot that may not hold the unit.
          message: known
            ? `Posição salva para ${known.name}. A lista abaixo avisa se a correção não estiver sendo aplicada.`
            : `Posição salva para a unidade ${code}. Ela aparece como corrigida manualmente na consulta por estado; a visão nacional só mostra as unidades da lista local.`,
        });
        setLatitude("");
        setLongitude("");
        setMethod("");
        setAttempted(false);
        onSaved(code!);
      })
      .catch((failure: unknown) => {
        const kind = failure instanceof AdminApiError ? failure.kind : "unexpected";
        if (kind === "unauthorized") {
          onSessionLost();
          return;
        }
        setResult({ kind: "error", message: adminErrorMessage(kind, "save") });
      })
      .finally(() => {
        savingNow.current = false;
        setSaving(false);
      });
  };

  const choose = (unit: HealthUnit) => {
    setChosen(unit);
    setUnitText("");
    setResult(null);
  };

  return (
    <section aria-labelledby={`${ids}-title`} className={cardClass}>
      <h2 id={`${ids}-title`} className="text-xl font-bold text-slate-900">
        Corrigir a posição de uma unidade
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Use quando a coordenada do CNES estiver errada e você tiver conferido o
        local em uma fonte confiável. A posição aparece para o público como
        “corrigida manualmente”, com a data, e substitui a do CNES.
      </p>

      <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-5" noValidate>
        <div>
          {selected ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="wrap-anywhere text-sm font-semibold text-slate-900">
                {selected.name}{" "}
                <span className="font-normal text-slate-600">
                  · CNES {selected.id}
                </span>
              </p>
              <p className="mt-1 wrap-anywhere text-sm text-slate-600">
                {formatAddress(selected.address)}
              </p>
              <button
                type="button"
                onClick={() => setChosen(null)}
                className={`${secondaryButton} mt-3`}
              >
                Escolher outra unidade
              </button>
            </div>
          ) : (
            <>
              <label htmlFor={`${ids}-unit`} className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-800">
                  Unidade (nome, cidade ou código CNES)
                </span>
                <input
                  id={`${ids}-unit`}
                  ref={unitRef}
                  value={unitText}
                  onChange={(event) => setUnitText(event.target.value)}
                  autoComplete="off"
                  aria-invalid={visible.unit ? true : undefined}
                  aria-describedby={`${ids}-unit-help${visible.unit ? ` ${ids}-unit-error` : ""}`}
                  placeholder="Ex.: UPA Bruno Covas ou 5563704"
                  className={`${fieldClass} ${visible.unit ? "border-red-400" : "border-slate-300"}`}
                />
              </label>
              <p id={`${ids}-unit-help`} className="mt-1.5 text-sm text-slate-600">
                {typedCode
                  ? known
                    ? `CNES ${typedCode}: ${known.name}, ${known.address.city} - ${known.address.state}.`
                    : `CNES ${typedCode}. A unidade não está na lista local; o servidor confere no CNES ao salvar.`
                  : matches.length > 0
                    ? "Escolha uma unidade abaixo."
                    : "Digite pelo menos 3 letras do nome ou da cidade, ou o código CNES."}
              </p>
              <FieldError id={`${ids}-unit-error`} message={visible.unit} />
              {matches.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {matches.map((unit) => (
                    <li key={unit.id}>
                      <button
                        type="button"
                        onClick={() => choose(unit)}
                        className="flex min-h-11 w-full flex-col items-start px-4 py-2 text-left hover:bg-slate-50"
                      >
                        <span className="wrap-anywhere font-medium text-slate-900">
                          {unit.name}
                        </span>
                        <span className="text-sm text-slate-600">
                          {unit.address.city} - {unit.address.state} · CNES {unit.id}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {known && (
            <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Posição mostrada hoje:</span>{" "}
                {formatPosition(known)}
                {current && ` (${formatCoordinate(current)})`}
              </p>
              {known.location.original && (
                <p>
                  <span className="font-semibold">Coordenada informada pelo CNES:</span>{" "}
                  {formatCoordinate(known.location.original)}
                </p>
              )}
            </div>
          )}
        </div>

        <PositionPicker
          current={current}
          proposed={proposed}
          focusKey={known?.id ?? null}
          onPick={(position) => {
            setLatitude(formatCoordinateInput(position.latitude));
            setLongitude(formatCoordinateInput(position.longitude));
          }}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-lat`} className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-800">
                Latitude
              </span>
              <input
                id={`${ids}-lat`}
                ref={latitudeRef}
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                onPaste={pastePair}
                autoComplete="off"
                placeholder="-23,5343"
                aria-invalid={visible.latitude ? true : undefined}
                aria-describedby={visible.latitude ? `${ids}-lat-error` : undefined}
                className={`${fieldClass} ${visible.latitude ? "border-red-400" : "border-slate-300"}`}
              />
            </label>
            <FieldError id={`${ids}-lat-error`} message={visible.latitude} />
          </div>
          <div>
            <label htmlFor={`${ids}-lon`} className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-800">
                Longitude
              </span>
              <input
                id={`${ids}-lon`}
                ref={longitudeRef}
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                onPaste={pastePair}
                autoComplete="off"
                placeholder="-46,8368"
                aria-invalid={visible.longitude ? true : undefined}
                aria-describedby={visible.longitude ? `${ids}-lon-error` : undefined}
                className={`${fieldClass} ${visible.longitude ? "border-red-400" : "border-slate-300"}`}
              />
            </label>
            <FieldError id={`${ids}-lon-error`} message={visible.longitude} />
          </div>
          <p className="text-sm text-slate-600 sm:col-span-2">
            Pode colar “latitude, longitude” copiados de um mapa em qualquer um
            dos campos. Vírgula ou ponto como separador decimal.
          </p>
        </div>

        <div>
          <label htmlFor={`${ids}-method`} className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">
              Como a posição foi verificada
            </span>
            <textarea
              id={`${ids}-method`}
              ref={methodRef}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              rows={3}
              maxLength={METHOD_MAX_LENGTH + 100}
              placeholder="Ex.: Conferido no mapa oficial da prefeitura, na Rua Serra Agulhas Negras, 100."
              aria-invalid={visible.method ? true : undefined}
              aria-describedby={`${ids}-method-count${visible.method ? ` ${ids}-method-error` : ""}`}
              className={`${fieldClass} ${visible.method ? "border-red-400" : "border-slate-300"}`}
            />
          </label>
          <p id={`${ids}-method-count`} className="mt-1.5 text-sm text-slate-600">
            {method.trim().length} de {METHOD_MAX_LENGTH} caracteres
          </p>
          <FieldError id={`${ids}-method-error`} message={visible.method} />
        </div>

        <div>
          <button type="submit" aria-disabled={saving} className={primaryButton}>
            {saving ? "Salvando…" : "Salvar posição"}
          </button>
        </div>

        <div aria-live="polite">
          {result?.kind === "success" && (
            <div
              className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-950"
              role="status"
            >
              <strong>Salvo.</strong> {result.message}
            </div>
          )}
          {result?.kind === "error" && <Alert>{result.message}</Alert>}
        </div>
      </form>
    </section>
  );
}

// ---- the corrections in force ----

function CorrectionRow({
  correction,
  unit,
  unitsReady,
  token,
  onRemoved,
  onShowHistory,
  onSessionLost,
}: {
  correction: Correction;
  unit: HealthUnit | undefined;
  /** False while the unit list reloads, when what it says is about to change. */
  unitsReady: boolean;
  token: string;
  onRemoved: (message: string, cnesCode: string) => void;
  onShowHistory: (cnesCode: string) => void;
  onSessionLost: () => void;
}) {
  // The server applies a correction only while the unit has the municipality and
  // address it had when the correction was made, and the national list can be
  // older than CNES. Saved is not the same as shown.
  const notApplied = unitsReady && !!unit && unit.location.precision !== "manual";
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removingNow = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const name = unit?.name ?? `Unidade ${correction.cnesCode}`;

  useEffect(() => {
    // The confirmation is a new context, so focus goes to its safe choice.
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const remove = () => {
    if (removingNow.current) return;
    removingNow.current = true;
    setRemoving(true);
    setError(null);
    removeCorrection(token, correction.cnesCode)
      .then(() =>
        onRemoved(`Posição corrigida removida de ${name}.`, correction.cnesCode),
      )
      .catch((failure: unknown) => {
        const kind = failure instanceof AdminApiError ? failure.kind : "unexpected";
        if (kind === "unauthorized") {
          onSessionLost();
          return;
        }
        setError(adminErrorMessage(kind, "remove"));
        removingNow.current = false;
        setRemoving(false);
      });
  };

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="wrap-anywhere font-semibold text-slate-900">{name}</p>
          <p className="wrap-anywhere text-sm text-slate-600">
            CNES {correction.cnesCode}
            {unit && ` · ${unit.address.city} - ${unit.address.state}`}
          </p>
        </div>
        <p className="text-sm font-medium text-slate-900">
          {formatCoordinate(correction)}
        </p>
      </div>
      <p className="mt-2 text-sm text-slate-700">
        Corrigida em {formatDateTime(correction.correctedAt)} por{" "}
        <span className="font-medium">{correction.verifiedBy}</span>
      </p>
      <p className="mt-1 whitespace-pre-line wrap-anywhere text-sm text-slate-600">
        {correction.method}
      </p>
      {notApplied && (
        <p
          className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <strong>Salva, mas ainda não aparece na visão nacional.</strong> O
          endereço desta unidade no CNES pode ter mudado desde a última
          atualização da lista, e nesse caso a correção não é aplicada. Se
          isso persistir, defina a posição de novo.
        </p>
      )}

      {confirming ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p>
            Remover a posição corrigida de <strong>{name}</strong>? A unidade
            volta a usar a posição do CNES, ou uma aproximação. Isso fica
            registrado no histórico.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={remove}
              aria-disabled={removing}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-red-800 bg-red-800 px-4 py-2 font-semibold text-white hover:bg-red-900 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            >
              {removing ? "Removendo…" : "Confirmar remoção"}
            </button>
            <button
              type="button"
              ref={cancelRef}
              onClick={() => setConfirming(false)}
              disabled={removing}
              className={secondaryButton}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onShowHistory(correction.cnesCode)}
            className={secondaryButton}
          >
            Ver histórico
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={secondaryButton}
          >
            Remover
          </button>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </li>
  );
}

function CorrectionsList({
  load,
  units,
  unitsReady,
  token,
  headingRef,
  onRetry,
  onRemoved,
  onShowHistory,
  onSessionLost,
}: {
  load: Load<Correction[]>;
  units: Map<string, HealthUnit>;
  unitsReady: boolean;
  token: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  onRetry: () => void;
  onRemoved: (message: string, cnesCode: string) => void;
  onShowHistory: (cnesCode: string) => void;
  onSessionLost: () => void;
}) {
  return (
    <section aria-labelledby="corrections-title" className={cardClass}>
      <h2
        id="corrections-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-bold text-slate-900 outline-none"
      >
        Posições corrigidas em vigor
      </h2>

      {load.status === "loading" && (
        <p className="mt-4 text-slate-600" role="status">
          Carregando as correções…
        </p>
      )}
      {load.status === "error" && (
        <div className="mt-4 grid grid-cols-1 gap-3">
          <Alert>{load.message}</Alert>
          <div>
            <button type="button" onClick={onRetry} className={primaryButton}>
              Tentar novamente
            </button>
          </div>
        </div>
      )}
      {load.status === "success" && load.data.length === 0 && (
        <p className="mt-4 text-slate-600">
          Nenhuma posição foi corrigida manualmente até agora.
        </p>
      )}
      {load.status === "success" && load.data.length > 0 && (
        <>
          <p className="mt-2 text-sm text-slate-600" aria-live="polite">
            {load.data.length}{" "}
            {load.data.length === 1 ? "unidade corrigida" : "unidades corrigidas"}
          </p>
          <ul className="mt-4 divide-y divide-slate-100">
            {load.data.map((correction) => (
              <CorrectionRow
                key={correction.cnesCode}
                correction={correction}
                unit={units.get(correction.cnesCode)}
                unitsReady={unitsReady}
                token={token}
                onRemoved={onRemoved}
                onShowHistory={onShowHistory}
                onSessionLost={onSessionLost}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---- the audit trail ----

/** A unit whose history to show, and whether focus should follow it. */
interface HistoryRequest {
  code: string;
  focus: boolean;
}

function HistoryPanel({
  token,
  request,
  units,
  onSessionLost,
}: {
  token: string;
  request: HistoryRequest | null;
  units: Map<string, HealthUnit>;
  onSessionLost: () => void;
}) {
  const [text, setText] = useState("");
  const [load, setLoad] = useState<Load<CorrectionEvent[]> | null>(null);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const textId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Each consultation gets a number, and only the latest may show its answer:
  // a slow response for one unit must not appear under the heading of another.
  const latest = useRef(0);

  const consult = useCallback(
    (value: string) => {
      const normalized = normalizeCnesCode(value);
      if (!normalized) {
        setFormError("Informe o código CNES, com até 7 números.");
        return;
      }
      setFormError(null);
      setShownCode(normalized);
      setLoad({ status: "loading" });
      const sequence = ++latest.current;
      listCorrectionEvents(token, normalized)
        .then((data) => {
          if (sequence === latest.current) setLoad({ status: "success", data });
        })
        .catch((failure: unknown) => {
          const kind = failure instanceof AdminApiError ? failure.kind : "unexpected";
          // A rejected token is true whichever consultation found out.
          if (kind === "unauthorized") {
            onSessionLost();
            return;
          }
          if (sequence !== latest.current) return;
          setLoad({ status: "error", message: adminErrorMessage(kind, "read") });
        });
    },
    [token, onSessionLost],
  );

  // A unit chosen elsewhere on the page is shown right away. Focus moves here
  // only when the person asked for the history; after a save it stays put.
  useEffect(() => {
    if (!request) return;
    // oxlint-disable-next-line react/set-state-in-effect
    setText(request.code);
    consult(request.code);
    if (request.focus) headingRef.current?.focus();
  }, [request, consult]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    consult(text);
  };

  const name = shownCode ? units.get(shownCode)?.name : undefined;

  return (
    <section aria-labelledby={`${textId}-title`} className={cardClass}>
      <h2
        id={`${textId}-title`}
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-bold text-slate-900 outline-none"
      >
        Histórico de alterações
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Quem definiu, substituiu ou removeu a posição de uma unidade, e quando.
        Remoções também ficam registradas.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
        <label htmlFor={`${textId}-code`} className="block min-w-48 flex-1">
          <span className="mb-2 block text-sm font-semibold text-slate-800">
            Código CNES
          </span>
          <input
            id={`${textId}-code`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ex.: 5563704"
            aria-invalid={formError ? true : undefined}
            aria-describedby={formError ? `${textId}-error` : undefined}
            className={`${fieldClass} ${formError ? "border-red-400" : "border-slate-300"}`}
          />
        </label>
        <button type="submit" className={primaryButton}>
          Consultar
        </button>
      </form>
      <FieldError id={`${textId}-error`} message={formError} />

      <div aria-live="polite" className="mt-4">
        {load?.status === "loading" && (
          <p className="text-slate-600" role="status">
            Consultando o histórico…
          </p>
        )}
        {load?.status === "error" && <Alert>{load.message}</Alert>}
        {load?.status === "success" && (
          <>
            <p className="text-sm font-semibold text-slate-900">
              {name ?? `Unidade ${shownCode}`}
              <span className="font-normal text-slate-600"> · CNES {shownCode}</span>
            </p>
            {load.data.length === 0 ? (
              <p className="mt-2 text-slate-600">
                Nenhuma alteração registrada para esta unidade.
              </p>
            ) : (
              <ol className="mt-3 divide-y divide-slate-100">
                {load.data.map((event) => (
                  <li key={event.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm text-slate-900">
                      <span className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold">
                        {actionLabel(event.action)}
                      </span>{" "}
                      por{" "}
                      <span className="wrap-anywhere font-medium">{event.actor}</span> em{" "}
                      {formatDateTime(event.occurredAt)}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {event.previous
                        ? `De ${formatCoordinate(event.previous)}`
                        : "Sem posição anterior"}
                      {event.next
                        ? ` para ${formatCoordinate(event.next)}`
                        : ", removida"}
                    </p>
                    {event.method && (
                      <p className="mt-1 whitespace-pre-line wrap-anywhere text-sm text-slate-600">
                        {event.method}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ---- the signed-in page ----

function Console({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: (notice?: string) => void;
}) {
  const { token } = session;
  const { state: unitsState, retry: reloadUnits } = useUnits(NationalStateCode.All);
  const units = useMemo(
    () => (unitsState.status === "success" ? unitsState.response.data : []),
    [unitsState],
  );
  const unitsById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units],
  );

  const [corrections, setCorrections] = useState<Load<Correction[]>>({
    status: "loading",
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [historyRequest, setHistoryRequest] = useState<HistoryRequest | null>(
    null,
  );
  const listHeadingRef = useRef<HTMLHeadingElement>(null);

  const sessionLost = useCallback(
    () => onSignOut(adminErrorMessage("unauthorized", "read")),
    [onSignOut],
  );

  useEffect(() => {
    let cancelled = false;
    listCorrections(token)
      .then((data) => {
        if (!cancelled) setCorrections({ status: "success", data });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const kind = failure instanceof AdminApiError ? failure.kind : "unexpected";
        if (kind === "unauthorized") {
          sessionLost();
          return;
        }
        setCorrections({ status: "error", message: adminErrorMessage(kind, "read") });
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey, sessionLost]);

  // After a change, what the public pages cached is outdated.
  const changed = useCallback(() => {
    clearUnitsCache();
    reloadUnits();
    setReloadKey((key) => key + 1);
  }, [reloadUnits]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-6">
        <p className="text-sm text-slate-700">
          Conectado como <strong>{session.login}</strong>. As alterações ficam
          registradas em seu nome.
        </p>
        <button type="button" onClick={() => onSignOut()} className={secondaryButton}>
          Sair
        </button>
      </div>

      {unitsState.status === "error" && (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          Não foi possível carregar a lista de unidades. Você ainda pode
          trabalhar pelo código CNES.
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <CorrectionForm
        token={token}
        units={units}
        onSaved={(code) => {
          setAnnouncement("");
          setHistoryRequest({ code, focus: false });
          changed();
        }}
        onSessionLost={sessionLost}
      />
      <CorrectionsList
        load={corrections}
        units={unitsById}
        unitsReady={unitsState.status === "success"}
        token={token}
        headingRef={listHeadingRef}
        onRetry={() => {
          setCorrections({ status: "loading" });
          setReloadKey((key) => key + 1);
        }}
        onRemoved={(message, code) => {
          setAnnouncement(message);
          // The removal is part of the history, so the panel shows it too.
          setHistoryRequest({ code, focus: false });
          changed();
          listHeadingRef.current?.focus();
        }}
        onShowHistory={(code) => setHistoryRequest({ code, focus: true })}
        onSessionLost={sessionLost}
      />
      <HistoryPanel
        token={token}
        request={historyRequest}
        units={unitsById}
        onSessionLost={sessionLost}
      />
    </div>
  );
}

export function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNoIndex();

  const signOut = useCallback((reason?: string) => {
    // Cached units may include positions only an administrator has seen.
    clearUnitsCache();
    setSession(null);
    setNotice(reason ?? null);
  }, []);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 md:py-12">
      <p className="mb-2 text-sm font-bold uppercase tracking-widest text-fila-green">
        Administração
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-fila-blue sm:text-4xl">
        Posições corrigidas manualmente
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
        Área restrita à equipe. Aqui se corrige a posição de uma unidade quando a
        coordenada do cadastro do CNES está errada.
      </p>

      <div className="mt-8">
        {session ? (
          <Console session={session} onSignOut={signOut} />
        ) : (
          <SignIn
            notice={notice}
            onSignedIn={(next) => {
              setNotice(null);
              setSession(next);
            }}
          />
        )}
      </div>
    </main>
  );
}
