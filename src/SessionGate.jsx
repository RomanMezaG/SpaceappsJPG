import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Activity } from 'lucide-react';
import EveaOnboarding from './EveaOnboarding';

const SessionContext = createContext(null);
export const useWatchSession = () => useContext(SessionContext);
let preparacionInicial = null;

const opciones = {
  edad: Array.from({ length: 83 }, (_, i) => 18 + i),
  estatura_cm: Array.from({ length: 111 }, (_, i) => 120 + i),
  peso_kg: Array.from({ length: 441 }, (_, i) => 30 + i * 0.5),
};

export default function SessionGate({ children }) {
  const [sessionId, setSessionId] = useState(null);
  const [form, setForm] = useState({ edad: '', estatura_cm: '', peso_kg: '' });
  const [step, setStep] = useState('profile');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [eveaAnswers, updateEveaAnswers] = useState(() => Array(16).fill(null));
  const [eveaHistory, updateEveaHistory] = useState([]);
  const [eveaCurrentSaved, setEveaCurrentSaved] = useState(false);
  const [preparando, setPreparando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const sessionRef = useRef(null);

  const expireSession = useCallback(() => {
    sessionRef.current = null;
    setSessionId(null);
    setForm({ edad: '', estatura_cm: '', peso_kg: '' });
    setStep('profile');
    setQuestionIndex(0);
    updateEveaAnswers(Array(16).fill(null));
    updateEveaHistory([]);
    setEveaCurrentSaved(false);
    setError('Your session ended. Complete your profile to reconnect.');
  }, []);

  useEffect(() => {
    let activo = true;
    // Una nueva entrada a la página deja el único reloj local esperando el perfil.
    if (!preparacionInicial) {
      preparacionInicial = fetch('/api/watch/session/reset', { method: 'POST' });
    }
    preparacionInicial
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error('Start the model API and watch service.');
      })
      .catch((fallo) => { if (activo) setError(fallo.message); })
      .finally(() => { if (activo) setPreparando(false); });
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    function cerrarAlSalir() {
      const id = sessionRef.current;
      if (id) {
        navigator.sendBeacon('/api/watch/session/close', new Blob(
          [JSON.stringify({ session_id: id })], { type: 'application/json' },
        ));
      }
    }
    function volver(evento) {
      if (evento.persisted) expireSession();
    }
    window.addEventListener('pagehide', cerrarAlSalir);
    window.addEventListener('pageshow', volver);
    return () => {
      window.removeEventListener('pagehide', cerrarAlSalir);
      window.removeEventListener('pageshow', volver);
    };
  }, [expireSession]);

  useEffect(() => {
    if (!sessionId) return;
    let activo = true;
    const timer = setInterval(async () => {
      try {
        const respuesta = await fetch('/api/watch/session/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (activo && respuesta.status === 409) expireSession();
      } catch {
        // El panel del reloj muestra los errores de conexión; el servidor vence la sesión.
      }
    }, 10000);
    return () => { activo = false; clearInterval(timer); };
  }, [sessionId, expireSession]);

  const setEveaAnswers = useCallback((values) => {
    updateEveaAnswers(values);
    setEveaCurrentSaved(false);
  }, []);
  const setEveaHistory = useCallback((values) => {
    updateEveaHistory(values);
    setEveaCurrentSaved(false);
  }, []);
  const saveEveaAssessment = useCallback(() => {
    if (eveaCurrentSaved || !eveaAnswers.every((value) => Number.isInteger(value) && value >= 0 && value <= 10)) return;
    updateEveaHistory((previous) => [...previous.slice(-14), [...eveaAnswers]]);
    setEveaCurrentSaved(true);
  }, [eveaAnswers, eveaCurrentSaved]);

  function continuarPerfil(evento) {
    evento.preventDefault();
    if (enviando || preparando || Object.values(form).some((value) => !value)) return;
    setError('');
    setStep('evea');
  }

  async function conectar() {
    if (enviando || preparando) return;
    if (!eveaAnswers.every((value) => Number.isInteger(value) && value >= 0 && value <= 10)) {
      setError('Answer all 16 questions before connecting.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const respuesta = await fetch('/api/watch/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(
          Object.entries(form).map(([clave, valor]) => [clave, Number(valor)]),
        )),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        throw new Error(typeof datos.detail === 'string' ? datos.detail : 'Check your profile values.');
      }
      if (!datos.session_id) throw new Error('Could not start the watch session.');
      sessionRef.current = datos.session_id;
      updateEveaHistory([[...eveaAnswers]]);
      setEveaCurrentSaved(true);
      setSessionId(datos.session_id);
      setForm({ edad: '', estatura_cm: '', peso_kg: '' });
    } catch (fallo) {
      setError(fallo.message || 'Could not connect. Check that both services are running.');
    } finally {
      setEnviando(false);
    }
  }

  const contexto = useMemo(() => ({
    sessionId, expireSession, eveaAnswers, setEveaAnswers, eveaHistory,
    setEveaHistory, eveaCurrentSaved, saveEveaAssessment,
  }), [sessionId, expireSession, eveaAnswers, setEveaAnswers, eveaHistory, setEveaHistory, eveaCurrentSaved, saveEveaAssessment]);
  if (sessionId) return <SessionContext.Provider value={contexto}>{children}</SessionContext.Provider>;
  if (step === 'evea') return <EveaOnboarding
    answers={eveaAnswers} index={questionIndex}
    onAnswer={(index, value) => setEveaAnswers((previous) => previous.map((answer, i) => i === index ? value : answer))}
    onIndex={setQuestionIndex}
    onBack={() => { setStep('profile'); setError(''); }}
    onFinish={conectar} submitting={enviando} error={error}
  />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F2F2F7] px-5 py-10 text-slate-900">
      <section className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <div className="mb-9 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-slate-500">
          <Activity className="h-4 w-4" /> Ridge Support System
        </div>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-400">Step 1 of 2 · Profile</p>
        <h1 className="text-3xl font-semibold tracking-tight">Before you begin</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Complete your profile, then take a short mood check-in before connecting your watch.
        </p>
        <form onSubmit={continuarPerfil} className="mt-8 space-y-5">
          {[
            ['edad', 'Age', 'years'],
            ['estatura_cm', 'Height', 'cm'],
            ['peso_kg', 'Weight', 'kg'],
          ].map(([clave, etiqueta, unidad]) => (
            <label key={clave} className="block">
              <span className="mb-2 block text-sm font-medium">{etiqueta}</span>
              <select
                required
                disabled={enviando}
                value={form[clave]}
                onChange={(evento) => setForm((anterior) => ({ ...anterior, [clave]: evento.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
              >
                <option value="" disabled>Select {etiqueta.toLowerCase()}</option>
                {opciones[clave].map((valor) => <option key={valor} value={valor}>{valor} {unidad}</option>)}
              </select>
            </label>
          ))}
          {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
          <button
            type="submit"
            disabled={preparando || enviando || Object.values(form).some((valor) => !valor)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {preparando ? 'Getting ready…' : 'Continue to mood check-in'}
            {!preparando && !enviando && <ArrowRight className="h-4 w-4" />}
          </button>
          <p className="text-center text-xs leading-5 text-slate-400">
            Reloading the page starts a new profile and mood check-in.
          </p>
        </form>
      </section>
    </main>
  );
}
