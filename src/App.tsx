import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  Activity, 
  Heart, 
  Moon, 
  Utensils, 
  Search, 
  Users, 
  ChevronRight, 
  Plus, 
  User as UserIcon,
  LogOut,
  LogIn,
  Bell,
  Lock,
  CheckCircle,
  X,
  FileText,
  Smartphone,
  ClipboardCheck,
  ShieldCheck,
  Mic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  orderBy,
  limit,
  getDocFromServer,
  doc
} from 'firebase/firestore';
import { 
  LineChart, 
  Line, 
  ResponsiveContainer, 
  YAxis, 
  XAxis, 
  Tooltip, 
  Area, 
  AreaChart 
} from 'recharts';
import { auth, db } from './firebase';

// --- Types ---
interface HealthSample {
  id: string;
  type: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions: 'Com comida' | 'Em jejum' | 'Indiferente';
  isSOS: boolean;
  active: boolean;
}

interface MedicationLog {
  id: string;
  medicationId: string;
  medicationName: string;
  status: 'Taken' | 'Skipped';
  timestamp: string;
}

interface SymptomLog {
  id: string;
  type: 'Dor' | 'Fadiga' | 'Náusea' | 'Neuropatia';
  intensity: number;
  timestamp: string;
  notes?: string;
}

interface TreatmentCycle {
  id: string;
  name: string;
  startDate: string;
  totalDays: number;
  currentCycle: number;
  totalCycles: number;
}

interface HealthContextType {
  user: User | null;
  samples: HealthSample[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  symptomLogs: SymptomLog[];
  cycles: TreatmentCycle[];
  loading: boolean;
  addSample: (type: string, value: number, unit: string) => Promise<void>;
  addMedicationLog: (medId: string, name: string, status: 'Taken' | 'Skipped') => Promise<void>;
  addSymptomLog: (type: SymptomLog['type'], intensity: number, notes?: string) => Promise<void>;
}

const HealthContext = createContext<HealthContextType | undefined>(undefined);

// --- Provider ---
export const HealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [samples, setSamples] = useState<HealthSample[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>([]);
  const [cycles, setCycles] = useState<TreatmentCycle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      setSamples([]);
      setMedications([]);
      setMedicationLogs([]);
      setSymptomLogs([]);
      setCycles([]);
      return;
    }

    const unsubSamples = onSnapshot(query(collection(db, `users/${user.uid}/health_samples`), orderBy('timestamp', 'desc'), limit(100)), (s) => {
      setSamples(s.docs.map(d => ({ id: d.id, ...d.data() })) as HealthSample[]);
    });

    const unsubMeds = onSnapshot(collection(db, `users/${user.uid}/medications`), (s) => {
      setMedications(s.docs.map(d => ({ id: d.id, ...d.data() })) as Medication[]);
    });

    const unsubLogs = onSnapshot(query(collection(db, `users/${user.uid}/medication_logs`), orderBy('timestamp', 'desc'), limit(50)), (s) => {
      setMedicationLogs(s.docs.map(d => ({ id: d.id, ...d.data() })) as MedicationLog[]);
    });

    const unsubSymptoms = onSnapshot(query(collection(db, `users/${user.uid}/symptom_logs`), orderBy('timestamp', 'desc'), limit(50)), (s) => {
      setSymptomLogs(s.docs.map(d => ({ id: d.id, ...d.data() })) as SymptomLog[]);
    });

    const unsubCycles = onSnapshot(collection(db, `users/${user.uid}/treatment_cycles`), (s) => {
      setCycles(s.docs.map(d => ({ id: d.id, ...d.data() })) as TreatmentCycle[]);
    });

    return () => {
      unsubSamples();
      unsubMeds();
      unsubLogs();
      unsubSymptoms();
      unsubCycles();
    };
  }, [user]);

  const addSample = async (type: string, value: number, unit: string) => {
    if (!user) return;
    await addDoc(collection(db, `users/${user.uid}/health_samples`), {
      uid: user.uid, type, value, unit, timestamp: new Date().toISOString(),
    });
  };

  const addMedicationLog = async (medicationId: string, medicationName: string, status: 'Taken' | 'Skipped') => {
    if (!user) return;
    await addDoc(collection(db, `users/${user.uid}/medication_logs`), {
      medicationId, medicationName, status, timestamp: new Date().toISOString(),
    });
  };

  const addSymptomLog = async (type: SymptomLog['type'], intensity: number, notes?: string) => {
    if (!user) return;
    await addDoc(collection(db, `users/${user.uid}/symptom_logs`), {
      type, intensity, notes, timestamp: new Date().toISOString(),
    });
  };

  return (
    <HealthContext.Provider value={{ 
      user, samples, medications, medicationLogs, symptomLogs, cycles, loading, 
      addSample, addMedicationLog, addSymptomLog 
    }}>
      {children}
    </HealthContext.Provider>
  );
};

const useHealth = () => {
  const context = useContext(HealthContext);
  if (!context) throw new Error('useHealth must be used within a HealthProvider');
  return context;
};

// --- Components ---

const ProfileView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useHealth();

  const sections = [
    {
      items: [
        { label: 'Dados de Saúde', icon: <Activity size={20} className="text-apple-activity" /> },
        { label: 'Ficha Médica', icon: <FileText size={20} className="text-apple-activity" /> },
      ]
    },
    {
      title: 'Recursos',
      items: [
        { label: 'Checklist de Saúde', icon: <ClipboardCheck size={20} className="text-apple-mindfulness" /> },
        { label: 'Notificações', icon: <Bell size={20} className="text-red-500" /> },
      ]
    },
    {
      title: 'Privacidade',
      items: [
        { label: 'Apps', icon: <Smartphone size={20} className="text-blue-500" /> },
        { label: 'Estudos de Pesquisa', icon: <Search size={20} className="text-blue-500" /> },
        { label: 'Dispositivos', icon: <Smartphone size={20} className="text-blue-500" /> },
      ]
    }
  ];

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-apple-background z-[100] overflow-y-auto"
    >
      <div className="p-5 max-w-md mx-auto">
        <div className="flex justify-start mb-4">
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-full bg-apple-border overflow-hidden mb-4 border-4 border-white shadow-sm">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon size={48} className="text-apple-text-secondary w-full h-full p-4" />
            )}
          </div>
          <h2 className="text-2xl font-bold">{user?.displayName || 'Matheus Celso'}</h2>
        </div>

        {sections.map((section, idx) => (
          <div key={idx} className="mb-6">
            {section.title && (
              <h3 className="text-xl font-bold mb-2 ml-4">{section.title}</h3>
            )}
            <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
              {section.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 active:bg-apple-background transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="font-medium text-[17px]">{item.label}</span>
                  </div>
                  <ChevronRight size={18} className="text-apple-text-muted" />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="px-4 mb-8">
          <p className="text-apple-text-secondary text-xs leading-relaxed text-center">
            Seus dados são criptografados no dispositivo e só podem ser compartilhados com a sua permissão. 
            <span className="text-blue-500 font-medium ml-1 cursor-pointer">Saiba mais sobre o app Saúde e Privacidade...</span>
          </p>
        </div>

        <button 
          onClick={() => signOut(auth)}
          className="w-full flex items-center justify-center gap-2 text-red-500 font-bold py-4 rounded-2xl bg-white mb-10 active:scale-95 transition-transform shadow-sm"
        >
          <LogOut size={20} />
          Sair da Conta
        </button>
      </div>
    </motion.div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  unit: string;
  icon: React.ReactNode;
  color: string;
  data?: any[];
  lastUpdated?: string;
  subtitle?: string;
}> = ({ title, value, unit, icon, color, data, lastUpdated, subtitle }) => {
  return (
    <motion.div 
      whileTap={{ scale: 0.98 }}
      className="apple-card flex flex-col"
    >
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div style={{ color }}>
            {React.cloneElement(icon as React.ReactElement, { size: 18, fill: 'currentColor' })}
          </div>
          <span className="font-bold text-sm uppercase tracking-wider" style={{ color }}>{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-apple-text-muted text-xs font-medium">{lastUpdated}</span>
          <ChevronRight size={14} className="text-apple-text-muted" />
        </div>
      </div>
      
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-apple-text-primary">{value}</span>
        <span className="text-apple-text-secondary text-base font-bold">{unit}</span>
      </div>

      {subtitle && (
        <div className="text-apple-text-secondary text-sm mt-1 font-medium">
          {subtitle}
        </div>
      )}
      
      {data && data.length > 0 && (
        <div className="h-14 w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={color} 
                strokeWidth={3}
                fillOpacity={0.15} 
                fill={color} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

const QuickActionFAB: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [loggingType, setLoggingType] = useState<'symptom' | 'temp' | 'med' | null>(null);
  const { addSample, addSymptomLog, medications, addMedicationLog } = useHealth();
  const [intensity, setIntensity] = useState(5);
  const [temp, setTemp] = useState(36.5);

  const actions = [
    { id: 'symptom', label: 'Registrar Sintoma', icon: <Activity size={24} />, color: 'bg-orange-500' },
    { id: 'med', label: 'Tomar Medicação SOS', icon: <Utensils size={24} />, color: 'bg-blue-500' },
    { id: 'temp', label: 'Registrar Temperatura', icon: <Activity size={24} />, color: 'bg-red-500' },
  ];

  const handleLogSymptom = async (type: SymptomLog['type']) => {
    await addSymptomLog(type, intensity);
    setLoggingType(null);
    setIsOpen(false);
  };

  const handleLogTemp = async () => {
    await addSample('temperature', temp, 'Celsius');
    setLoggingType(null);
    setIsOpen(false);
  };

  const handleLogSOS = async (med: Medication) => {
    await addMedicationLog(med.id, med.name, 'Taken');
    setLoggingType(null);
    setIsOpen(false);
  };

  return (
    <>
      <div className="fixed right-6 bottom-24 z-50 flex flex-col items-end gap-4">
        <AnimatePresence>
          {isOpen && !loggingType && (
            <div className="flex flex-col gap-3 mb-2">
              {actions.map((action, idx) => (
                <motion.button
                  key={action.id}
                  initial={{ opacity: 0, scale: 0.5, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.5, y: 20 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => setLoggingType(action.id as any)}
                  className="flex items-center gap-3 pr-4"
                >
                  <span className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">
                    {action.label}
                  </span>
                  <div className={`${action.color} text-white p-3 rounded-full shadow-lg`}>
                    {action.icon}
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => {
            if (loggingType) setLoggingType(null);
            else setIsOpen(!isOpen);
          }}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
            isOpen ? 'bg-apple-border text-apple-text-primary rotate-45' : 'bg-blue-500 text-white'
          }`}
        >
          <Plus size={32} />
        </button>
      </div>

      <AnimatePresence>
        {loggingType && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end justify-center p-4"
            onClick={() => setLoggingType(null)}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-apple-background w-full max-w-md rounded-t-[32px] p-6 pb-12"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 bg-apple-border rounded-full mx-auto mb-6" />
              
              {loggingType === 'symptom' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Como você está se sentindo?</h3>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="font-bold">Intensidade</span>
                        <span className="text-blue-500 font-bold">{intensity}</span>
                      </div>
                      <input 
                        type="range" min="1" max="10" value={intensity} 
                        onChange={e => setIntensity(parseInt(e.target.value))}
                        className="w-full h-2 bg-apple-border rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {['Dor', 'Fadiga', 'Náusea', 'Neuropatia'].map(s => (
                        <button 
                          key={s}
                          onClick={() => handleLogSymptom(s as any)}
                          className="bg-white p-4 rounded-2xl font-bold text-center active:scale-95 transition-transform shadow-sm"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {loggingType === 'temp' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Registrar Temperatura</h3>
                  <div className="flex flex-col items-center gap-8">
                    <div className="text-5xl font-black text-apple-text-primary">
                      {temp.toFixed(1)}°C
                    </div>
                    <input 
                      type="range" min="35" max="42" step="0.1" value={temp} 
                      onChange={e => setTemp(parseFloat(e.target.value))}
                      className="w-full h-2 bg-apple-border rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                    <button 
                      onClick={handleLogTemp}
                      className={`w-full py-4 rounded-2xl font-bold text-white transition-all ${
                        temp > 37.8 ? 'bg-red-500 shadow-lg shadow-red-500/30' : 'bg-blue-500'
                      }`}
                    >
                      Salvar Temperatura
                    </button>
                    {temp > 37.8 && (
                      <p className="text-red-500 font-bold text-center text-sm">
                        Atenção: Febre detectada. Entre em contato com sua equipe médica.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {loggingType === 'med' && (
                <div>
                  <h3 className="text-2xl font-bold mb-6">Medicação SOS</h3>
                  <div className="space-y-3">
                    {medications.filter(m => m.isSOS).map(m => (
                      <button 
                        key={m.id}
                        onClick={() => handleLogSOS(m)}
                        className="w-full bg-white p-4 rounded-2xl flex justify-between items-center active:scale-95 transition-transform shadow-sm"
                      >
                        <div className="text-left">
                          <div className="font-bold">{m.name}</div>
                          <div className="text-apple-text-secondary text-sm">{m.dosage}</div>
                        </div>
                        <Plus size={20} className="text-blue-500" />
                      </button>
                    ))}
                    {medications.filter(m => m.isSOS).length === 0 && (
                      <p className="text-apple-text-secondary text-center py-8">Nenhuma medicação SOS cadastrada.</p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const SummaryView = ({ onOpenProfile }: { onOpenProfile: () => void }) => {
  const { samples, user, cycles, medications, medicationLogs } = useHealth();
  
  const getLatest = (type: string) => {
    const filtered = samples.filter(s => s.type === type);
    return filtered.length > 0 ? filtered[0] : null;
  };

  const getHistory = (type: string) => {
    return samples
      .filter(s => s.type === type)
      .slice(0, 7)
      .reverse()
      .map(s => ({ value: s.value }));
  };

  const steps = getLatest('steps');
  const heartRate = getLatest('heart_rate');
  const tumorSize = getLatest('tumor_size');
  const temp = getLatest('temperature');
  const currentCycle = cycles[0];

  return (
    <div className="pb-32 pt-20 px-5">
      <div className="flex justify-between items-center mb-10">
        <h1 className="apple-title mb-0">Resumo</h1>
        <button 
          onClick={onOpenProfile}
          className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm active:scale-90 transition-transform"
        >
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="text-blue-600 font-bold text-sm">
              {user?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'MC'}
            </span>
          )}
        </button>
      </div>

      {currentCycle && (
        <div className="apple-card p-5 mb-8 border-l-4 border-apple-activity">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-apple-text-secondary text-xs font-bold uppercase tracking-wider mb-1">Ciclo de Tratamento</h3>
              <p className="text-xl font-black text-apple-text-primary">{currentCycle.name}</p>
            </div>
            <div className="bg-apple-activity/10 text-apple-activity px-3 py-1 rounded-full text-xs font-black">
              Dia {Math.ceil((new Date().getTime() - new Date(currentCycle.startDate).getTime()) / (1000 * 60 * 60 * 24))} de {currentCycle.totalDays}
            </div>
          </div>
          <div className="w-full h-2 bg-apple-border rounded-full overflow-hidden">
            <div 
              className="h-full bg-apple-activity" 
              style={{ width: `${Math.min(100, (Math.ceil((new Date().getTime() - new Date(currentCycle.startDate).getTime()) / (1000 * 60 * 60 * 24)) / currentCycle.totalDays) * 100)}%` }} 
            />
          </div>
          <p className="text-apple-text-secondary text-xs mt-3 font-medium">
            Ciclo {currentCycle.currentCycle} de {currentCycle.totalCycles} • Próxima infusão em 12 dias
          </p>
        </div>
      )}

      <div className="mb-8">
        <div className="flex justify-between items-end mb-4">
          <h2 className="apple-section-header mb-0">Fixados</h2>
          <button className="text-blue-500 font-medium text-sm">Editar</button>
        </div>
        
        {temp && (
          <MetricCard 
            title="Temperatura" 
            value={temp.value.toFixed(1)} 
            unit="°C" 
            icon={<Activity />} 
            color={temp.value > 37.8 ? "#FF3B30" : "#FF9500"}
            lastUpdated={new Date(temp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            subtitle={temp.value > 37.8 ? "Febre detectada" : "Normal"}
          />
        )}

        <MetricCard 
          title="Atividade" 
          value={steps?.value.toLocaleString() || "0"} 
          unit="passos" 
          icon={<Activity />} 
          color="#FF2D55"
          data={getHistory('steps')}
          lastUpdated={steps ? new Date(steps.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "00:00"}
        />
        
        <MetricCard 
          title="Batimentos" 
          value={heartRate?.value || "--"} 
          unit="BPM" 
          icon={<Heart />} 
          color="#FF3B30"
          data={getHistory('heart_rate')}
          lastUpdated={heartRate ? new Date(heartRate.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined}
        />
      </div>

      <div className="mb-8">
        <h2 className="apple-section-header">Medicamentos</h2>
        <div className="space-y-3">
          {medications.filter(m => !m.isSOS && m.active).slice(0, 2).map(m => (
            <div key={m.id} className="apple-card p-4 flex justify-between items-center">
              <div>
                <div className="font-bold">{m.name}</div>
                <div className="text-apple-text-secondary text-xs">{m.dosage} • {m.instructions}</div>
              </div>
              <button className="bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold">
                Registrar
              </button>
            </div>
          ))}
          <div className="apple-card flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="text-blue-500"><Activity size={20} /></div>
              <span className="font-semibold">Ver Toda a Medicação</span>
            </div>
            <ChevronRight size={18} className="text-apple-text-muted" />
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="apple-section-header">Destaques</h2>
        <MetricCard 
          title="Evolução do Tumor" 
          value={tumorSize?.value || "--"} 
          unit="mm" 
          icon={<Activity />} 
          color="#5E5CE6"
          data={getHistory('tumor_size')}
          subtitle={tumorSize ? `A última medição foi de ${tumorSize.value}mm em ${new Date(tumorSize.timestamp).toLocaleDateString()}.` : "Nenhum dado registrado ainda."}
          lastUpdated={tumorSize ? "Ontem" : undefined}
        />
      </div>
    </div>
  );
};

const BrowseView = () => {
  const categories = [
    { name: 'Acompanhamento de Ciclo', icon: <Activity />, color: '#FF2D55' },
    { name: 'Atividade', icon: <Activity />, color: '#FF2D55' },
    { name: 'Coração', icon: <Heart />, color: '#FF3B30' },
    { name: 'Sono', icon: <Moon />, color: '#5E5CE6' },
    { name: 'Nutrição', icon: <Utensils />, color: '#34C759' },
    { name: 'Sintomas', icon: <Activity />, color: '#FF9500' },
    { name: 'Sinais Vitais', icon: <Activity />, color: '#FF3B30' },
    { name: 'Medicamentos', icon: <Activity />, color: '#32ADE6' },
  ];

  return (
    <div className="pb-24 pt-8 px-5">
      <h1 className="apple-title">Buscar</h1>
      
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-apple-text-muted" size={18} />
        <input 
          type="text" 
          placeholder="Buscar" 
          className="w-full bg-apple-border/50 rounded-xl py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
        />
      </div>

      <h2 className="apple-section-header">Categorias de Saúde</h2>
      <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
        {categories.map((cat) => (
          <motion.div 
            key={cat.name}
            whileTap={{ backgroundColor: '#F2F2F7' }}
            className="flex items-center justify-between p-4 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div style={{ color: cat.color }}>
                {React.cloneElement(cat.icon as React.ReactElement, { size: 20, fill: 'currentColor' })}
              </div>
              <span className="font-semibold text-[17px]">{cat.name}</span>
            </div>
            <ChevronRight size={18} className="text-apple-text-muted" />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const SharingView = () => {
  return (
    <div className="pb-24 pt-8 px-5">
      <div className="flex flex-col items-center text-center">
        <div className="text-apple-text-primary font-bold text-sm mb-4">Compartilhar</div>
        <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-blue-400 rounded-full flex items-center justify-center mb-6 shadow-lg">
          <Users size={40} className="text-white" />
        </div>
        <h1 className="apple-title text-2xl mb-6">Compartilhamento de Dados de Saúde</h1>
        
        <div className="space-y-8 text-left w-full mb-10">
          <div className="flex gap-4">
            <div className="text-blue-500 mt-1"><CheckCircle size={24} /></div>
            <div>
              <h3 className="font-bold text-lg">Você Tem o Controle</h3>
              <p className="text-apple-text-secondary text-[15px]">
                Compartilhe dados de Saúde com segurança e mantenha seus amigos e familiares atualizados de como você está.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="text-blue-500 mt-1"><Bell size={24} /></div>
            <div>
              <h3 className="font-bold text-lg">Painel e Notificações</h3>
              <p className="text-apple-text-secondary text-[15px]">
                Os dados que você compartilhar aparecerão no app Saúde de cada pessoa. Elas também poderão receber notificações se houver uma atualização.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="text-blue-500 mt-1"><Lock size={24} /></div>
            <div>
              <h3 className="font-bold text-lg">Privado e Seguro</h3>
              <p className="text-apple-text-secondary text-[15px]">
                Apenas um resumo de cada tópico é compartilhado, e não os detalhes. As informações são criptografadas e você pode parar de compartilhar a qualquer momento.
              </p>
            </div>
          </div>
        </div>

        <button className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 mb-4 active:scale-95 transition-transform">
          Compartilhar com Alguém
        </button>
        <button className="text-blue-500 font-semibold text-sm active:opacity-70">
          Convidar Alguém para compartilhar com você
        </button>
      </div>
    </div>
  );
};

const BottomNav: React.FC<{ activeTab: string; setActiveTab: (tab: string) => void }> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'summary', label: 'Resumo', icon: <Heart /> },
    { id: 'sharing', label: 'Compartilhamento', icon: <Users /> },
  ];

  const isBrowse = activeTab === 'browse';

  return (
    <div className="fixed bottom-8 left-0 right-0 flex justify-center items-center gap-3 px-6 z-50 pointer-events-none">
      <AnimatePresence mode="wait">
        {!isBrowse ? (
          <motion.div 
            key="tabs"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="flex items-center gap-3 pointer-events-auto"
          >
            <div className="glass-pill flex items-center px-1.5 py-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1 px-5 py-2 transition-all rounded-full ${
                    activeTab === tab.id ? 'bg-white/40 text-apple-text-primary' : 'text-apple-text-muted'
                  }`}
                >
                  {React.cloneElement(tab.icon as React.ReactElement, { size: 22, fill: activeTab === tab.id ? 'currentColor' : 'none' })}
                  <span className="text-[10px] font-bold">{tab.label}</span>
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setActiveTab('browse')}
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg bg-white/80 backdrop-blur-xl text-blue-500 transition-all active:scale-90"
            >
              <Search size={28} />
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="search"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="flex items-center gap-3 w-full max-w-md pointer-events-auto"
          >
            <button
              onClick={() => setActiveTab('summary')}
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg bg-white text-apple-text-primary transition-all active:scale-90 flex-shrink-0"
            >
              <Heart size={28} fill="currentColor" />
            </button>
            
            <div className="glass-pill flex-grow flex items-center px-4 py-3 gap-3">
              <Search size={22} className="text-apple-text-primary" />
              <input 
                type="text" 
                placeholder="Buscar" 
                autoFocus
                className="bg-transparent border-none outline-none flex-grow text-lg font-medium text-apple-text-primary placeholder:text-apple-text-muted"
              />
              <Mic size={22} className="text-apple-text-primary" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const LoginScreen = () => {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-white">
      <div className="w-24 h-24 bg-apple-activity rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-apple-activity/20">
        <Heart size={48} color="white" fill="white" />
      </div>
      <h1 className="text-4xl font-extrabold mb-4 text-center">Saúde</h1>
      <p className="text-apple-text-secondary text-center mb-12 max-w-xs">
        Seus dados de saúde, organizados e seguros. Replicado com os padrões do Apple Health.
      </p>
      <button 
        onClick={handleLogin}
        className="w-full max-w-xs flex items-center justify-center gap-3 bg-black text-white font-bold py-4 rounded-2xl transition-transform active:scale-95"
      >
        <LogIn size={20} />
        Entrar com Google
      </button>
    </div>
  );
};

const AppContent = () => {
  const { user, loading, addSample } = useHealth();
  const [activeTab, setActiveTab] = useState('summary');
  const [showProfile, setShowProfile] = useState(false);

  // Add some mock data on first load for demo
  useEffect(() => {
    if (user) {
      const seedData = async () => {
        const medsRef = collection(db, `users/${user.uid}/medications`);
        const cyclesRef = collection(db, `users/${user.uid}/treatment_cycles`);
        
        // Check if data exists
        const medsSnap = await getDocFromServer(doc(db, 'test', 'connection')); // Just a dummy check
        
        // We'll just add if they don't exist (simplified for demo)
        // In a real app, we'd check properly
        await addDoc(medsRef, {
          name: 'Dexametasona',
          dosage: '4mg',
          frequency: '1x ao dia',
          instructions: 'Com comida',
          isSOS: false,
          active: true
        });
        await addDoc(medsRef, {
          name: 'Ondansetrona',
          dosage: '8mg',
          frequency: 'Se necessário',
          instructions: 'Indiferente',
          isSOS: true,
          active: true
        });
        await addDoc(cyclesRef, {
          name: 'Quimioterapia Branca',
          startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          totalDays: 21,
          currentCycle: 2,
          totalCycles: 6
        });
      };
      
      seedData();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-apple-background">
        <motion.div 
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-apple-activity"
        >
          <Heart size={48} fill="currentColor" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen max-w-md mx-auto bg-apple-background apple-gradient-bg relative">
      <AnimatePresence>
        {showProfile && <ProfileView onClose={() => setShowProfile(false)} />}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {activeTab === 'summary' && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <SummaryView onOpenProfile={() => setShowProfile(true)} />
          </motion.div>
        )}
        {activeTab === 'sharing' && (
          <motion.div
            key="sharing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
          >
            <SharingView />
          </motion.div>
        )}
        {activeTab === 'browse' && (
          <motion.div
            key="browse"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <BrowseView />
          </motion.div>
        )}
      </AnimatePresence>

      <QuickActionFAB />
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};

export default function App() {
  return (
    <HealthProvider>
      <AppContent />
    </HealthProvider>
  );
}
