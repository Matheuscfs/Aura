import React, { useState, useEffect, createContext, useContext, Component } from 'react';
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
  Mic,
  Pill,
  Clock,
  ChevronLeft,
  Camera,
  Upload,
  File,
  Loader2,
  Zap,
  Calendar
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
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
  doc,
  deleteDoc
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
  type: string;
  dosage?: string;
  intensity?: string;
  unit?: string;
  shape?: string;
  colors?: { left: string; right: string; background: string };
  schedule?: { frequency: string; times: string[] };
  duration?: { startDate: string; endDate?: string };
  instructions: string;
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
  type: string;
  intensity: 'Não Presente' | 'Presente' | 'Suave' | 'Moderado' | 'Grave';
  timestamp: string;
  endDate?: string;
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

interface Exam {
  id: string;
  type: string;
  examName: string;
  doctorName: string;
  date: string;
  fileData: string; // Base64
  fileType: string;
  analysis?: string;
  timestamp: string;
  metrics?: {
    type: string;
    value: number;
    unit: string;
  }[];
}

interface HealthContextType {
  user: User | null;
  samples: HealthSample[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  symptomLogs: SymptomLog[];
  cycles: TreatmentCycle[];
  exams: Exam[];
  loading: boolean;
  addSample: (type: string, value: number, unit: string) => Promise<void>;
  addMedication: (med: Omit<Medication, 'id'>) => Promise<void>;
  addMedicationLog: (medId: string, name: string, status: 'Taken' | 'Skipped') => Promise<void>;
  addSymptomLog: (type: string, intensity: SymptomLog['intensity'], timestamp?: string, endDate?: string, notes?: string) => Promise<void>;
  addExam: (exam: Omit<Exam, 'id'>) => Promise<void>;
  deleteExam: (id: string) => Promise<void>;
}

const HealthContext = createContext<HealthContextType | undefined>(undefined);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

const analyzeExam = async (fileData: string, fileType: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const model = "gemini-3-flash-preview";
  
  const prompt = `Analise este documento médico (exame ou laudo). 
  Extraia as seguintes informações em formato JSON:
  - type: O tipo do documento (ex: 'Laudo', 'Exame de Sangue', 'Raio-X', etc)
  - examName: O nome do exame realizado
  - doctorName: O nome do médico responsável (se houver)
  - date: A data do exame no formato YYYY-MM-DD
  - analysis: Um resumo curto (máximo 2 parágrafos) do que o exame diz, em termos simples.
  - metrics: Uma lista de métricas numéricas importantes encontradas (ex: plaquetas, leucócitos, hemoglobina, etc).
    Cada métrica deve ter:
    - type: O nome da métrica (ex: 'Plaquetas', 'Leucócitos', 'Hemoglobina', 'Glicose', etc)
    - value: O valor numérico (apenas o número)
    - unit: A unidade de medida (ex: 'mil/mm3', 'g/dL', 'mg/dL', etc)
  
  Responda APENAS o JSON.`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { data: fileData, mimeType: fileType } }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          examName: { type: Type.STRING },
          doctorName: { type: Type.STRING },
          date: { type: Type.STRING },
          analysis: { type: Type.STRING },
          metrics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                value: { type: Type.NUMBER },
                unit: { type: Type.STRING }
              },
              required: ["type", "value", "unit"]
            }
          }
        },
        required: ["type", "examName", "doctorName", "date", "analysis"]
      }
    }
  });

  return JSON.parse(response.text!);
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error) errorMessage = `Erro de Permissão: ${parsed.operationType} em ${parsed.path}`;
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-apple-background text-center">
          <div className="bg-white p-8 rounded-[32px] shadow-sm max-w-sm">
            <X size={48} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Ops! Algo deu errado</h2>
            <p className="text-apple-text-secondary mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-blue-500 text-white font-bold py-3 rounded-2xl active:scale-95 transition-transform"
            >
              Recarregar App
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// --- Provider ---
export const HealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [samples, setSamples] = useState<HealthSample[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [symptomLogs, setSymptomLogs] = useState<SymptomLog[]>([]);
  const [cycles, setCycles] = useState<TreatmentCycle[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
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
      setExams([]);
      return;
    }

    const unsubSamples = onSnapshot(query(collection(db, `users/${user.uid}/health_samples`), orderBy('timestamp', 'desc'), limit(100)), (s) => {
      setSamples(s.docs.map(d => ({ id: d.id, ...d.data() })) as HealthSample[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/health_samples`));

    const unsubMeds = onSnapshot(collection(db, `users/${user.uid}/medications`), (s) => {
      setMedications(s.docs.map(d => ({ id: d.id, ...d.data() })) as Medication[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/medications`));

    const unsubLogs = onSnapshot(query(collection(db, `users/${user.uid}/medication_logs`), orderBy('timestamp', 'desc'), limit(50)), (s) => {
      setMedicationLogs(s.docs.map(d => ({ id: d.id, ...d.data() })) as MedicationLog[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/medication_logs`));

    const unsubSymptoms = onSnapshot(query(collection(db, `users/${user.uid}/symptom_logs`), orderBy('timestamp', 'desc'), limit(50)), (s) => {
      setSymptomLogs(s.docs.map(d => ({ id: d.id, ...d.data() })) as SymptomLog[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/symptom_logs`));

    const unsubCycles = onSnapshot(collection(db, `users/${user.uid}/treatment_cycles`), (s) => {
      setCycles(s.docs.map(d => ({ id: d.id, ...d.data() })) as TreatmentCycle[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/treatment_cycles`));

    const unsubExams = onSnapshot(query(collection(db, `users/${user.uid}/exams`), orderBy('timestamp', 'desc')), (s) => {
      setExams(s.docs.map(d => ({ id: d.id, ...d.data() })) as Exam[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/exams`));

    return () => {
      unsubSamples();
      unsubMeds();
      unsubLogs();
      unsubSymptoms();
      unsubCycles();
      unsubExams();
    };
  }, [user]);

  const addSample = async (type: string, value: number, unit: string) => {
    if (!user) return;
    const path = `users/${user.uid}/health_samples`;
    try {
      await addDoc(collection(db, path), {
        uid: user.uid, type, value, unit, timestamp: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const addMedication = async (med: Omit<Medication, 'id'>) => {
    if (!user) return;
    const path = `users/${user.uid}/medications`;
    try {
      await addDoc(collection(db, path), med);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const addMedicationLog = async (medicationId: string, medicationName: string, status: 'Taken' | 'Skipped') => {
    if (!user) return;
    const path = `users/${user.uid}/medication_logs`;
    try {
      await addDoc(collection(db, path), {
        medicationId, medicationName, status, timestamp: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const addSymptomLog = async (type: string, intensity: SymptomLog['intensity'], timestamp?: string, endDate?: string, notes?: string) => {
    if (!user) return;
    const path = `users/${user.uid}/symptom_logs`;
    try {
      await addDoc(collection(db, path), {
        type, 
        intensity, 
        notes: notes || '', 
        timestamp: timestamp || new Date().toISOString(),
        endDate: endDate || timestamp || new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const addExam = async (exam: Omit<Exam, 'id'>) => {
    if (!user) return;
    const path = `users/${user.uid}/exams`;
    try {
      await addDoc(collection(db, path), exam);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteExam = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/exams/${id}`;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/exams`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  return (
    <HealthContext.Provider value={{ 
      user, samples, medications, medicationLogs, symptomLogs, cycles, exams, loading, 
      addSample, addMedication, addMedicationLog, addSymptomLog, addExam, deleteExam 
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

const MedicalIDView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useHealth();
  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-apple-background z-[150] overflow-y-auto pb-32"
    >
      <div className="p-5 pt-12">
        <div className="flex justify-between items-center mb-6">
          <button onClick={onClose} className="text-blue-500 font-medium">Cancelar</button>
          <span className="font-bold">Ficha Médica</span>
          <button className="text-blue-500 font-bold">Editar</button>
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
          <p className="text-apple-text-secondary font-medium">28 anos</p>
        </div>

        <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border mb-6">
          <div className="p-4">
            <h3 className="text-red-500 font-bold text-xs uppercase tracking-wider mb-2">Condições Médicas</h3>
            <p className="font-semibold">Linfoma de Hodgkin (Em tratamento)</p>
          </div>
          <div className="p-4">
            <h3 className="text-red-500 font-bold text-xs uppercase tracking-wider mb-2">Alergias e Reações</h3>
            <p className="font-semibold">Nenhuma conhecida</p>
          </div>
          <div className="p-4">
            <h3 className="text-red-500 font-bold text-xs uppercase tracking-wider mb-2">Medicamentos</h3>
            <p className="font-semibold">Dexametasona, Ondansetrona</p>
          </div>
        </div>

        <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border mb-6">
          <div className="p-4 flex justify-between">
            <span className="text-apple-text-secondary font-medium">Tipo Sanguíneo</span>
            <span className="font-bold">O+</span>
          </div>
          <div className="p-4 flex justify-between">
            <span className="text-apple-text-secondary font-medium">Doador de Órgãos</span>
            <span className="font-bold">Sim</span>
          </div>
          <div className="p-4 flex justify-between">
            <span className="text-apple-text-secondary font-medium">Peso</span>
            <span className="font-bold">72 kg</span>
          </div>
          <div className="p-4 flex justify-between">
            <span className="text-apple-text-secondary font-medium">Altura</span>
            <span className="font-bold">1,78 m</span>
          </div>
        </div>

        <h3 className="text-apple-text-secondary font-bold text-xs uppercase tracking-wider mb-3 ml-4">Contatos de Emergência</h3>
        <div className="apple-card p-4 flex justify-between items-center mb-8">
          <div>
            <p className="font-bold">Ana Silva</p>
            <p className="text-xs text-apple-text-secondary">Mãe</p>
          </div>
          <button className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center shadow-sm">
            <Smartphone size={20} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const GenericDetailView: React.FC<{ title: string, onClose: () => void }> = ({ title, onClose }) => {
  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-apple-background z-[150] overflow-y-auto"
    >
      <div className="p-5 pt-12">
        <div className="flex items-center mb-6">
          <button onClick={onClose} className="text-blue-500 flex items-center gap-1 font-medium">
            <ChevronLeft size={24} />
            Perfil
          </button>
        </div>

        <h1 className="text-3xl font-black mb-8">{title}</h1>

        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-apple-border rounded-full flex items-center justify-center text-apple-text-muted mb-4 opacity-50">
            <Search size={32} />
          </div>
          <p className="text-apple-text-secondary font-medium px-10">
            Nenhuma informação disponível para {title} no momento.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

const ProfileView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useHealth();
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

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
      <AnimatePresence>
        {selectedItem === 'Ficha Médica' && <MedicalIDView onClose={() => setSelectedItem(null)} />}
        {selectedItem && selectedItem !== 'Ficha Médica' && (
          <GenericDetailView title={selectedItem} onClose={() => setSelectedItem(null)} />
        )}
      </AnimatePresence>

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
                <div 
                  key={i} 
                  onClick={() => setSelectedItem(item.label)}
                  className="flex items-center justify-between p-4 active:bg-apple-background transition-colors cursor-pointer"
                >
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
  onClick?: () => void;
}> = ({ title, value, unit, icon, color, data, lastUpdated, subtitle, onClick }) => {
  return (
    <motion.div 
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="apple-card flex flex-col cursor-pointer"
    >
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div style={{ color }}>
            {React.cloneElement(icon as any, { size: 18, fill: 'currentColor' })}
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

  const handleLogSymptom = async (type: string) => {
    const intensityMap: Record<number, SymptomLog['intensity']> = {
      1: 'Não Presente', 2: 'Não Presente',
      3: 'Presente', 4: 'Presente',
      5: 'Suave', 6: 'Suave',
      7: 'Moderado', 8: 'Moderado',
      9: 'Grave', 10: 'Grave'
    };
    await addSymptomLog(type, intensityMap[intensity] || 'Presente');
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

const SummaryView = ({ onOpenProfile, onSelectCategory, onSelectTab, onSelectExam }: { 
  onOpenProfile: () => void, 
  onSelectCategory: (cat: string) => void,
  onSelectTab: (tab: string) => void,
  onSelectExam: (exam: Exam) => void
}) => {
  const { samples, user, cycles, medications, medicationLogs, exams, symptomLogs } = useHealth();
  
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
  const platelets = getLatest('Plaquetas');
  const leukocytes = getLatest('Leucócitos');
  const hemoglobin = getLatest('Hemoglobina');
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

      {currentCycle && (() => {
        const startDate = new Date(currentCycle.startDate);
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - startDate.getTime());
        const currentDay = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const progress = Math.min(100, (currentDay / currentCycle.totalDays) * 100);
        const remainingDays = Math.max(0, currentCycle.totalDays - currentDay);
        
        return (
          <div 
            onClick={() => onSelectCategory('Acompanhamento de Ciclo de Quimioterapia')}
            className="apple-card p-6 mb-8 relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
          >
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-apple-activity/5 rounded-full -mr-16 -mt-16 blur-2xl" />
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-apple-activity animate-pulse" />
                  <h3 className="text-apple-text-secondary text-[10px] font-bold uppercase tracking-[0.1em]">Ciclo em Andamento</h3>
                </div>
                <p className="text-2xl font-black text-apple-text-primary tracking-tight">{currentCycle.name}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-apple-activity leading-none">{currentDay}</p>
                <p className="text-[10px] font-bold text-apple-text-muted uppercase">Dia do Ciclo</p>
              </div>
            </div>

            {/* Detailed Progress Bar */}
            <div className="relative mb-6">
              <div className="w-full h-4 bg-apple-border/30 rounded-full overflow-hidden backdrop-blur-sm">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-apple-activity to-[#FF5E7D] relative"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[shimmer_2s_linear_infinite]" />
                </motion.div>
              </div>
              
              {/* Milestone Markers */}
              <div className="absolute top-0 left-0 w-full h-full flex justify-between px-1 pointer-events-none">
                {[0, 25, 50, 75, 100].map((mark) => (
                  <div 
                    key={mark} 
                    className={`w-0.5 h-full ${mark <= progress ? 'bg-white/30' : 'bg-apple-border/50'}`} 
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <p className="text-xs font-bold text-apple-text-primary">{currentCycle.currentCycle} de {currentCycle.totalCycles}</p>
                <p className="text-[9px] font-bold text-apple-text-muted uppercase">Ciclo Atual</p>
              </div>
              <div className="text-center border-x border-apple-border">
                <p className="text-xs font-bold text-apple-text-primary">{remainingDays} dias</p>
                <p className="text-[9px] font-bold text-apple-text-muted uppercase">Restantes</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-apple-text-primary">{currentCycle.totalDays} dias</p>
                <p className="text-[9px] font-bold text-apple-text-muted uppercase">Duração Total</p>
              </div>
            </div>

            <div className="bg-apple-background/50 rounded-2xl p-4 border border-apple-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-apple-activity">
                  <Calendar size={20} />
                </div>
                <div className="flex-grow">
                  <p className="text-[10px] font-bold text-apple-text-muted uppercase">Próximo Marco</p>
                  <p className="text-sm font-bold text-apple-text-primary">Infusão de Manutenção</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-apple-activity">Em 12 dias</p>
                  <p className="text-[9px] font-bold text-apple-text-muted uppercase">16 de Abr</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
            onClick={() => onSelectCategory('Sinais Vitais')}
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
          onClick={() => onSelectCategory('Atividade')}
        />
        
        <MetricCard 
          title="Batimentos" 
          value={heartRate?.value || "--"} 
          unit="BPM" 
          icon={<Heart />} 
          color="#FF3B30"
          data={getHistory('heart_rate')}
          lastUpdated={heartRate ? new Date(heartRate.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined}
          onClick={() => onSelectCategory('Coração')}
        />

        {(platelets || leukocytes || hemoglobin) && (
          <div className="mt-8">
            <h2 className="apple-section-header mb-4">Hemograma</h2>
            <div className="grid grid-cols-2 gap-4">
              {platelets && (
                <div className="apple-card p-4 cursor-pointer active:scale-95 transition-transform" onClick={() => onSelectCategory('Sinais Vitais')}>
                  <p className="text-[10px] font-bold text-apple-text-muted uppercase mb-1">Plaquetas</p>
                  <p className="text-xl font-black text-blue-500">{platelets.value.toLocaleString()}</p>
                  <p className="text-[10px] text-apple-text-muted">mil/mm³</p>
                </div>
              )}
              {leukocytes && (
                <div className="apple-card p-4 cursor-pointer active:scale-95 transition-transform" onClick={() => onSelectCategory('Sinais Vitais')}>
                  <p className="text-[10px] font-bold text-apple-text-muted uppercase mb-1">Leucócitos</p>
                  <p className="text-xl font-black text-green-500">{leukocytes.value.toLocaleString()}</p>
                  <p className="text-[10px] text-apple-text-muted">/mm³</p>
                </div>
              )}
              {hemoglobin && (
                <div className="apple-card p-4 cursor-pointer active:scale-95 transition-transform" onClick={() => onSelectCategory('Sinais Vitais')}>
                  <p className="text-[10px] font-bold text-apple-text-muted uppercase mb-1">Hemoglobina</p>
                  <p className="text-xl font-black text-red-500">{hemoglobin.value}</p>
                  <p className="text-[10px] text-apple-text-muted">g/dL</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="apple-section-header">Medicamentos</h2>
        <div className="space-y-3">
          {medications.filter(m => !m.isSOS && m.active).slice(0, 2).map(m => (
            <div key={m.id} className="apple-card p-4 flex justify-between items-center">
              <div>
                <div className="font-bold">{m.name}</div>
                <div className="text-apple-text-secondary text-xs">
                  {m.intensity} {m.unit} • {m.type}
                </div>
              </div>
              <button 
                onClick={() => onSelectTab('medications')}
                className="bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold"
              >
                Registrar
              </button>
            </div>
          ))}
          <div 
            onClick={() => onSelectTab('medications')}
            className="apple-card flex items-center justify-between p-4 cursor-pointer active:bg-apple-background transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="text-blue-500"><Activity size={20} /></div>
              <span className="font-semibold">Ver Toda a Medicação</span>
            </div>
            <ChevronRight size={18} className="text-apple-text-muted" />
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="apple-section-header">Sintomas Recentes</h2>
        <div className="space-y-3">
          {symptomLogs.slice(0, 2).map(log => (
            <div key={log.id} className="apple-card p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-500">
                <Activity size={20} />
              </div>
              <div className="flex-grow">
                <p className="font-bold text-sm">{log.type}</p>
                <p className="text-[10px] text-apple-text-secondary uppercase font-bold">{log.intensity} • {new Date(log.timestamp).toLocaleDateString('pt-BR')}</p>
              </div>
              <ChevronRight size={16} className="text-apple-text-muted" />
            </div>
          ))}
          {symptomLogs.length === 0 && (
            <div className="apple-card p-4 text-center text-apple-text-secondary text-sm">
              Nenhum sintoma registrado.
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="apple-section-header">Exames Recentes</h2>
        <div className="space-y-3">
          {exams.slice(0, 2).map(exam => (
            <div 
              key={exam.id} 
              onClick={() => onSelectExam(exam)}
              className="apple-card p-4 flex items-center gap-4 cursor-pointer active:bg-apple-background transition-colors"
            >
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500">
                <FileText size={20} />
              </div>
              <div className="flex-grow">
                <p className="font-bold text-sm">{exam.examName}</p>
                <p className="text-[10px] text-apple-text-secondary uppercase font-bold">{exam.type} • {new Date(exam.date).toLocaleDateString('pt-BR')}</p>
              </div>
              <ChevronRight size={16} className="text-apple-text-muted" />
            </div>
          ))}
          {exams.length === 0 && (
            <div className="apple-card p-4 text-center text-apple-text-secondary text-sm">
              Nenhum exame registrado.
            </div>
          )}
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

const MedicationsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { medications, addMedication } = useHealth();
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<Medication>>({
    name: '',
    type: '',
    intensity: '',
    unit: 'mg',
    shape: 'capsule',
    colors: { left: '#FF3B30', right: '#FF9500', background: '#E5E5EA' },
    schedule: { frequency: 'Todos os Dias', times: ['08:00'] },
    duration: { startDate: new Date().toISOString() },
    instructions: '',
    isSOS: false,
    active: true
  });

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => step > 1 ? setStep(s => s - 1) : setShowAddFlow(false);

  const saveMedication = async () => {
    await addMedication(formData as Omit<Medication, 'id'>);
    setShowAddFlow(false);
    setStep(1);
  };

  if (showAddFlow) {
    return (
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="fixed inset-0 bg-white z-[150] flex flex-col"
      >
        <div className="p-5 flex justify-between items-center border-b border-apple-border">
          <button onClick={handleBack} className="text-blue-500 flex items-center gap-1">
            <ChevronLeft size={24} />
          </button>
          <div className="text-center">
            <p className="text-xs font-bold text-apple-text-secondary uppercase tracking-widest">
              {formData.name || 'Novo Medicamento'}
            </p>
            {formData.type && <p className="text-[10px] text-apple-text-muted">{formData.type}</p>}
          </div>
          <button onClick={() => setShowAddFlow(false)} className="text-apple-text-muted">
            <X size={24} />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="flex justify-center mb-8">
                  <div className="w-24 h-24 bg-apple-background rounded-3xl flex items-center justify-center shadow-inner">
                    <Pill size={48} className="text-blue-500" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-6">Nome do Medicamento</h2>
                <input 
                  type="text" 
                  placeholder="Nome do Medicamento"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-apple-background p-4 rounded-2xl text-lg outline-none focus:ring-2 focus:ring-blue-500/20"
                  autoFocus
                />
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <h2 className="text-2xl font-bold mb-6">Escolha o Tipo de Medicamento</h2>
                <p className="text-apple-text-secondary font-bold text-sm mb-4">Formas Comuns</p>
                <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border mb-6">
                  {['Cápsula', 'Comprimido', 'Líquido', 'Tópico'].map(t => (
                    <button 
                      key={t}
                      onClick={() => { setFormData({ ...formData, type: t }); handleNext(); }}
                      className="w-full p-4 text-left flex justify-between items-center active:bg-apple-background"
                    >
                      <span className="font-semibold">{t}</span>
                      {formData.type === t && <CheckCircle size={20} className="text-blue-500" />}
                    </button>
                  ))}
                </div>
                <p className="text-apple-text-secondary font-bold text-sm mb-4">Mais Formas</p>
                <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
                  {['Adesivo', 'Creme', 'Inalador', 'Injeção'].map(t => (
                    <button 
                      key={t}
                      onClick={() => { setFormData({ ...formData, type: t }); handleNext(); }}
                      className="w-full p-4 text-left flex justify-between items-center active:bg-apple-background"
                    >
                      <span className="font-semibold">{t}</span>
                      {formData.type === t && <CheckCircle size={20} className="text-blue-500" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <h2 className="text-2xl font-bold mb-2">Adicione a Intensidade do Medicamento</h2>
                <p className="text-apple-text-secondary mb-8">Intensidade</p>
                <input 
                  type="text" 
                  placeholder="Adicionar Intensidade"
                  value={formData.intensity}
                  onChange={e => setFormData({ ...formData, intensity: e.target.value })}
                  className="w-full bg-apple-background p-4 rounded-2xl text-lg outline-none mb-8"
                />
                <p className="text-apple-text-secondary font-bold text-sm mb-4">Escolha a Unidade</p>
                <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
                  {['mg', 'mcg', 'g', 'mL', 'UI'].map(u => (
                    <button 
                      key={u}
                      onClick={() => setFormData({ ...formData, unit: u })}
                      className="w-full p-4 text-left flex justify-between items-center active:bg-apple-background"
                    >
                      <span className="font-semibold">{u}</span>
                      {formData.unit === u && <CheckCircle size={20} className="text-blue-500" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <h2 className="text-2xl font-bold mb-8">Escolha a Forma</h2>
                <div className="grid grid-cols-4 gap-4 mb-8">
                  {['capsule', 'pill', 'oval', 'round', 'bottle', 'vial', 'cup', 'tube'].map(s => (
                    <button 
                      key={s}
                      onClick={() => setFormData({ ...formData, shape: s })}
                      className={`aspect-square rounded-full flex items-center justify-center transition-all ${formData.shape === s ? 'bg-blue-500 text-white scale-110 shadow-lg' : 'bg-apple-background text-apple-text-muted'}`}
                    >
                      <Pill size={24} />
                    </button>
                  ))}
                </div>
                <button onClick={handleNext} className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl">Seguinte</button>
                <button onClick={handleNext} className="w-full text-apple-text-muted font-bold py-4 mt-2">Ignorar</button>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div key="step5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <h2 className="text-2xl font-bold mb-8">Escolha as Cores</h2>
                <div className="space-y-8">
                  <div>
                    <p className="font-bold mb-4">Lado Esquerdo</p>
                    <div className="flex flex-wrap gap-3">
                      {['#FFFFFF', '#E5E5EA', '#FFD60A', '#FF9500', '#FF3B30', '#FF2D55', '#AF52DE', '#5856D6', '#007AFF', '#32ADE6', '#34C759'].map(c => (
                        <button 
                          key={c}
                          onClick={() => setFormData({ ...formData, colors: { ...formData.colors!, left: c } })}
                          className={`w-8 h-8 rounded-full border-2 ${formData.colors?.left === c ? 'border-blue-500 scale-125' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-bold mb-4">Lado Direito</p>
                    <div className="flex flex-wrap gap-3">
                      {['#FFFFFF', '#E5E5EA', '#FFD60A', '#FF9500', '#FF3B30', '#FF2D55', '#AF52DE', '#5856D6', '#007AFF', '#32ADE6', '#34C759'].map(c => (
                        <button 
                          key={c}
                          onClick={() => setFormData({ ...formData, colors: { ...formData.colors!, right: c } })}
                          className={`w-8 h-8 rounded-full border-2 ${formData.colors?.right === c ? 'border-blue-500 scale-125' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={handleNext} className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl mt-12">Seguinte</button>
              </motion.div>
            )}

            {step === 6 && (
              <motion.div key="step6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <h2 className="text-2xl font-bold mb-8">Defina Horários</h2>
                <div className="apple-card p-4 mb-8">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-semibold">Quando você tomará?</span>
                  </div>
                  <div className="flex justify-between items-center bg-apple-background p-4 rounded-xl">
                    <span className="font-medium">Todos os Dias</span>
                    <button className="text-blue-500 font-bold">Alterar</button>
                  </div>
                </div>
                <div className="apple-card p-4">
                  <p className="font-bold mb-4">Que horas?</p>
                  <div className="flex items-center gap-4 bg-apple-background p-3 rounded-xl mb-4">
                    <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white">
                      <X size={14} strokeWidth={4} />
                    </div>
                    <span className="font-bold text-lg">08:00</span>
                    <span className="ml-auto text-blue-500 font-medium">1 aplicação</span>
                  </div>
                  <button className="flex items-center gap-2 text-blue-500 font-bold">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white">
                      <Plus size={14} strokeWidth={4} />
                    </div>
                    Adicione um Horário
                  </button>
                </div>
                <p className="text-xs text-apple-text-muted mt-6 px-2">
                  Se você agendar um horário, o app Saúde enviará uma notificação para você tomar os seus medicamentos.
                </p>
                <button onClick={handleNext} className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl mt-8">Seguinte</button>
              </motion.div>
            )}

            {step === 7 && (
              <motion.div key="step7" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <h2 className="text-2xl font-bold mb-8">Duração</h2>
                <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
                  <div className="p-4 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold text-apple-text-muted uppercase">Data de Início</p>
                      <p className="font-semibold">3 de abril (Hoje)</p>
                    </div>
                    <button className="text-blue-500 font-bold text-sm">Editar</button>
                  </div>
                  <div className="p-4 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold text-apple-text-muted uppercase">Data do Término</p>
                      <p className="font-semibold text-apple-text-muted">Nenhuma</p>
                    </div>
                    <button className="text-blue-500 font-bold text-sm">Editar</button>
                  </div>
                </div>
                <button onClick={saveMedication} className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl mt-12">Finalizar</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {step < 7 && step !== 4 && step !== 5 && step !== 6 && (
          <div className="p-6 border-t border-apple-border">
            <button 
              onClick={handleNext}
              disabled={!formData.name && step === 1}
              className="w-full bg-blue-500 disabled:bg-apple-border text-white font-bold py-4 rounded-2xl active:scale-95 transition-transform"
            >
              Seguinte
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="pb-24 pt-8 px-5">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={onBack} className="text-blue-500">
          <ChevronLeft size={28} />
        </button>
        <h1 className="apple-title mb-0">Medicamentos</h1>
      </div>

      {medications.length === 0 ? (
        <div className="apple-card p-6 mb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 bg-apple-background rounded-full flex items-center justify-center">
                <Pill size={40} className="text-blue-500" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center">
                <Clock size={16} className="text-blue-500" />
              </div>
            </div>
          </div>
          <h2 className="text-2xl font-black mb-4">Configure Seus Medicamentos</h2>
          <div className="space-y-4 text-left mb-8">
            <div className="flex items-start gap-4">
              <Pill className="text-blue-500 mt-1" size={24} />
              <div>
                <p className="font-bold">Controle todos os seus medicamentos em apenas um lugar.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <Clock className="text-blue-400 mt-1" size={24} />
              <div>
                <p className="font-bold text-apple-text-secondary">Defina horários e receba lembretes.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 bg-red-500 rounded-lg flex items-center justify-center text-white mt-1">
                <Lock size={14} />
              </div>
              <div>
                <p className="font-bold text-apple-text-secondary">
                  As informações sobre os seus medicamentos são criptografadas e não podem ser lidas por ninguém, incluindo a Apple, sem a sua permissão.
                </p>
              </div>
            </div>
          </div>
          <button 
            onClick={() => setShowAddFlow(true)}
            className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
          >
            Adicionar um Medicamento
          </button>
        </div>
      ) : (
        <div className="mb-8">
          <div className="flex justify-between items-end mb-4">
            <h2 className="apple-section-header mb-0">Seus Medicamentos</h2>
            <button onClick={() => setShowAddFlow(true)} className="text-blue-500 font-bold text-sm">Adicionar</button>
          </div>
          <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
            {medications.map(m => (
              <div key={m.id} className="p-4 flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: m.colors?.background || '#F2F2F7', color: m.colors?.left || '#007AFF' }}
                >
                  <Pill size={24} />
                </div>
                <div className="flex-grow">
                  <p className="font-bold">{m.name}</p>
                  <p className="text-xs text-apple-text-secondary">
                    {m.intensity} {m.unit} • {m.type}
                  </p>
                </div>
                <ChevronRight size={18} className="text-apple-text-muted" />
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="apple-section-header">Sobre Medicamentos</h2>
      <div className="apple-card p-0 overflow-hidden mb-8">
        <div className="bg-slate-800 p-8 flex flex-wrap gap-4 justify-center">
          <Activity className="text-blue-300" size={32} />
          <Pill className="text-orange-400" size={32} />
          <Utensils className="text-blue-200" size={32} />
          <Heart className="text-red-400" size={32} />
        </div>
        <div className="p-5">
          <h3 className="text-xl font-bold mb-2">Monitorando seus medicamentos</h3>
          <p className="text-apple-text-secondary">Por que é importante saber o que você está tomando.</p>
        </div>
      </div>

      <h2 className="apple-section-header">Mais</h2>
      <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
        <button className="w-full p-4 flex justify-between items-center active:bg-apple-background">
          <span className="font-semibold text-[17px]">Fixar no Resumo</span>
          <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center text-white">
            <Plus size={12} strokeWidth={4} />
          </div>
        </button>
        <button className="w-full p-4 flex justify-between items-center active:bg-apple-background">
          <span className="font-semibold text-[17px] text-blue-500">Exportar PDF</span>
        </button>
        <button className="w-full p-4 flex justify-between items-center active:bg-apple-background">
          <span className="font-semibold text-[17px]">Opções</span>
          <ChevronRight size={18} className="text-apple-text-muted" />
        </button>
      </div>
    </div>
  );
};

const ExamsView: React.FC<{ onBack?: () => void, onSelectExam: (exam: Exam) => void }> = ({ onBack, onSelectExam }) => {
  const { exams, addExam, addSample } = useHealth();
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState(1); // 1: Choose Source, 2: Review/Edit
  const [formData, setFormData] = useState<Partial<Exam>>({
    type: '',
    examName: '',
    doctorName: '',
    date: new Date().toISOString().split('T')[0],
    fileData: '',
    fileType: '',
    analysis: '',
    timestamp: new Date().toISOString(),
    metrics: []
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setFormData(prev => ({ ...prev, fileData: base64, fileType: file.type }));
      
      setIsAnalyzing(true);
      try {
        const analysis = await analyzeExam(base64, file.type);
        setFormData(prev => ({
          ...prev,
          ...analysis,
          timestamp: new Date().toISOString()
        }));
        setStep(2);
      } catch (error) {
        console.error("AI Analysis Error:", error);
        // Fallback to manual entry if AI fails
        setStep(2);
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const saveExam = async () => {
    await addExam(formData as Omit<Exam, 'id'>);
    
    // Save metrics as health samples
    if (formData.metrics && Array.isArray(formData.metrics)) {
      for (const metric of formData.metrics) {
        await addSample(metric.type, metric.value, metric.unit);
      }
    }

    setShowAddFlow(false);
    setStep(1);
    setFormData({
      type: '',
      examName: '',
      doctorName: '',
      date: new Date().toISOString().split('T')[0],
      fileData: '',
      fileType: '',
      analysis: '',
      timestamp: new Date().toISOString(),
      metrics: []
    });
  };

  if (showAddFlow) {
    return (
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.05}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100) setShowAddFlow(false);
        }}
        className="fixed inset-0 bg-white z-[150] flex flex-col rounded-t-[40px] shadow-2xl overflow-hidden"
      >
        <div className="w-12 h-1.5 bg-apple-border rounded-full mx-auto mt-3 mb-1 shrink-0" />
        <div className="p-5 flex justify-between items-center border-b border-apple-border">
          <button onClick={() => setShowAddFlow(false)} className="text-blue-500">
            Cancelar
          </button>
          <span className="font-bold">Adicionar Exame</span>
          <div className="w-10" />
        </div>

        <div className="flex-grow overflow-y-auto p-6">
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="text-blue-500 mb-6"
              >
                <Loader2 size={64} />
              </motion.div>
              <h2 className="text-2xl font-bold mb-2">Analisando com IA</h2>
              <p className="text-apple-text-secondary">
                O Gemini está processando seu documento para extrair as informações automaticamente...
              </p>
            </div>
          ) : step === 1 ? (
            <div className="space-y-6">
              <div className="text-center mb-10">
                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <FileText size={40} className="text-blue-500" />
                </div>
                <h2 className="text-2xl font-bold">Como deseja adicionar?</h2>
                <p className="text-apple-text-secondary mt-2">Tire uma foto ou anexe um arquivo PDF/Imagem</p>
              </div>

              <div className="grid gap-4">
                <label className="apple-card p-6 flex items-center gap-4 cursor-pointer active:bg-apple-background transition-colors">
                  <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center text-white">
                    <Camera size={24} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-lg">Tirar Foto</p>
                    <p className="text-sm text-apple-text-secondary">Use a câmera para capturar o laudo</p>
                  </div>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
                </label>

                <label className="apple-card p-6 flex items-center gap-4 cursor-pointer active:bg-apple-background transition-colors">
                  <div className="w-12 h-12 bg-purple-500 rounded-2xl flex items-center justify-center text-white">
                    <Upload size={24} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-lg">Arquivos ou Fotos</p>
                    <p className="text-sm text-apple-text-secondary">Selecione da galeria ou arquivos PDF</p>
                  </div>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-6 pb-20">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <CheckCircle size={32} className="text-green-500" />
                </div>
                <h2 className="text-xl font-bold">Informações Coletadas</h2>
                <p className="text-sm text-apple-text-secondary">Revise os dados extraídos pela IA</p>
              </div>

              <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
                <div className="p-4">
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase mb-1 block">Tipo de Documento</label>
                  <input 
                    type="text" 
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                    className="w-full font-semibold outline-none"
                  />
                </div>
                <div className="p-4">
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase mb-1 block">Nome do Exame</label>
                  <input 
                    type="text" 
                    value={formData.examName}
                    onChange={e => setFormData({...formData, examName: e.target.value})}
                    className="w-full font-semibold outline-none"
                  />
                </div>
                <div className="p-4">
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase mb-1 block">Médico</label>
                  <input 
                    type="text" 
                    value={formData.doctorName}
                    onChange={e => setFormData({...formData, doctorName: e.target.value})}
                    className="w-full font-semibold outline-none"
                  />
                </div>
                <div className="p-4">
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase mb-1 block">Data</label>
                  <input 
                    type="date" 
                    value={formData.date}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full font-semibold outline-none"
                  />
                </div>
              </div>

              {formData.analysis && (
                <div className="apple-card p-4 bg-blue-50/50 border-blue-100">
                  <div className="flex items-center gap-2 mb-2 text-blue-600">
                    <Zap size={16} fill="currentColor" />
                    <span className="text-xs font-bold uppercase tracking-wider">Análise da IA</span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">
                    {formData.analysis}
                  </p>
                </div>
              )}

              {formData.metrics && formData.metrics.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-apple-text-muted uppercase px-1">Métricas Identificadas</h3>
                  <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
                    {formData.metrics.map((m, i) => (
                <div key={i} className="p-4 flex justify-between items-center gap-4">
                  <span className="font-semibold truncate min-w-0 flex-grow">{m.type}</span>
                  <span className="font-bold text-blue-500 flex-shrink-0">{m.value} <span className="text-xs text-apple-text-muted">{m.unit}</span></span>
                </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-apple-text-muted px-1">
                    * Estas métricas serão adicionadas automaticamente aos seus gráficos de saúde.
                  </p>
                </div>
              )}

              <button 
                onClick={saveExam}
                className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20"
              >
                Salvar Exame
              </button>
              <button 
                onClick={() => setStep(1)}
                className="w-full text-apple-text-muted font-bold py-2"
              >
                Tentar Novamente
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="pb-24 pt-8 px-5">
      <div className="flex items-center gap-2 mb-6">
        {onBack && (
          <button onClick={onBack} className="text-blue-500">
            <ChevronLeft size={28} />
          </button>
        )}
        <h1 className="apple-title mb-0">Exames</h1>
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-end mb-4">
          <h2 className="apple-section-header mb-0">Laudos e Exames</h2>
          <button onClick={() => setShowAddFlow(true)} className="text-blue-500 font-bold text-sm">Adicionar</button>
        </div>

        {exams.length === 0 ? (
          <div className="apple-card p-8 text-center">
            <div className="w-16 h-16 bg-apple-background rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText size={32} className="text-blue-500" />
            </div>
            <h3 className="font-bold text-lg mb-2">Nenhum exame ainda</h3>
            <p className="text-apple-text-secondary text-sm mb-6">
              Adicione seus laudos e exames para ter um histórico completo analisado por IA.
            </p>
            <motion.button 
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowAddFlow(true)}
              className="w-full bg-[#007AFF] text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-colors active:bg-[#0062CC]"
            >
              Adicionar Primeiro Exame
            </motion.button>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map(exam => (
              <motion.div 
                key={exam.id} 
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectExam(exam)}
                className="apple-card p-4 cursor-pointer active:bg-apple-background transition-colors"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500">
                      <File size={20} />
                    </div>
                    <div>
                      <p className="font-bold">{exam.examName}</p>
                      <p className="text-[10px] font-bold text-apple-text-muted uppercase">{exam.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-apple-text-secondary">
                      {new Date(exam.date).toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-[10px] text-apple-text-muted">{exam.doctorName}</p>
                  </div>
                </div>
                
                {exam.analysis && (
                  <div className="mt-3 pt-3 border-t border-apple-border">
                    <div className="flex items-center gap-1.5 mb-1 text-blue-500">
                      <Zap size={12} fill="currentColor" />
                      <span className="text-[10px] font-bold uppercase">Resumo IA</span>
                    </div>
                    <p className="text-xs text-apple-text-secondary line-clamp-2">
                      {exam.analysis}
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <h2 className="apple-section-header">Sobre seus Exames</h2>
      <div className="apple-card p-5">
        <div className="flex gap-4 items-start">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white shrink-0">
            <Zap size={20} fill="currentColor" />
          </div>
          <div>
            <h3 className="font-bold mb-1">Análise Inteligente</h3>
            <p className="text-sm text-apple-text-secondary">
              Nossa IA analisa seus laudos para extrair informações importantes e criar resumos fáceis de entender.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const ExamDetailView: React.FC<{ exam: Exam; onClose: () => void }> = ({ exam, onClose }) => {
  const { exams: allExams, deleteExam } = useHealth();
  const [showOriginal, setShowOriginal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteExam(exam.id);
      onClose();
    } catch (error) {
      console.error("Error deleting exam:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getMetricHistory = (metricType: string) => {
    return allExams
      .filter(e => e.metrics && e.metrics.some(m => m.type === metricType))
      .map(e => {
        const metric = e.metrics.find(m => m.type === metricType);
        return {
          date: new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          fullDate: new Date(e.date).toLocaleDateString('pt-BR'),
          timestamp: new Date(e.date).getTime(),
          value: metric?.value
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  };

  useEffect(() => {
    if (showOriginal && exam.fileType.includes('pdf')) {
      try {
        const byteCharacters = atob(exam.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: exam.fileType });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        
        return () => {
          URL.revokeObjectURL(url);
          setBlobUrl(null);
        };
      } catch (e) {
        console.error("Error creating blob URL", e);
      }
    }
  }, [showOriginal, exam.fileData, exam.fileType]);

  return (
    <>
      <motion.div 
        initial={isIOS ? { x: '100%' } : { opacity: 0, y: 50 }}
        animate={isIOS ? { x: 0 } : { opacity: 1, y: 0 }}
        exit={isIOS ? { x: '100%' } : { opacity: 0, y: 50 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-0 bg-apple-background z-[160] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="p-5 pt-12 flex justify-between items-center border-b border-apple-border bg-white">
          <button onClick={onClose} className="text-blue-500 flex items-center gap-1 font-medium">
            <ChevronLeft size={24} />
            Exames
          </button>
          <span className="font-bold text-sm">Detalhes</span>
          <div className="w-12" />
        </div>

        <div className="flex-grow overflow-y-auto p-6">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-500 mb-4">
              <FileText size={40} />
            </div>
            <h1 className="text-2xl font-bold text-center">{exam.examName}</h1>
            <p className="text-apple-text-muted font-bold uppercase tracking-wider text-xs mt-1">{exam.type}</p>
          </div>

          <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border mb-8">
            <div className="p-4 flex justify-between">
              <span className="text-apple-text-secondary font-medium">Médico</span>
              <span className="font-bold">{exam.doctorName}</span>
            </div>
            <div className="p-4 flex justify-between">
              <span className="text-apple-text-secondary font-medium">Data</span>
              <span className="font-bold">{new Date(exam.date).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>

          {exam.analysis && (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-3 px-1">Análise da IA</h2>
              <div className="apple-card p-6 bg-blue-50/30 border border-blue-100">
                <p className="text-slate-700 leading-relaxed italic">
                  "{exam.analysis}"
                </p>
              </div>
            </div>
          )}

          {exam.metrics && exam.metrics.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-3 px-1">Métricas Extraídas</h2>
              <div className="space-y-6">
                {exam.metrics.map((m, i) => {
                  const history = getMetricHistory(m.type);
                  return (
                    <div key={i} className="apple-card p-0 overflow-hidden">
                      <div className="p-4 flex justify-between items-center border-b border-apple-border">
                        <span className="font-semibold text-apple-text-primary">{m.type}</span>
                        <div className="text-right">
                          <span className="font-bold text-blue-500">{m.value}</span>
                          <span className="text-xs text-apple-text-muted ml-1">{m.unit}</span>
                        </div>
                      </div>
                      
                      {history.length > 1 ? (
                        <div className="h-40 w-full p-4 bg-apple-background/30">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
                              <defs>
                                <linearGradient id={`colorMetric-${i}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#007AFF" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#007AFF" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <XAxis 
                                dataKey="date" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 10, fill: '#8E8E93' }}
                              />
                              <YAxis 
                                hide={true} 
                                domain={['auto', 'auto']}
                              />
                              <Tooltip 
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    return (
                                      <div className="bg-white p-2 rounded-lg shadow-lg border border-apple-border text-[10px]">
                                        <p className="font-bold">{payload[0].payload.fullDate}</p>
                                        <p className="text-blue-500 font-bold">{payload[0].value} {m.unit}</p>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Area 
                                type="monotone" 
                                dataKey="value" 
                                stroke="#007AFF" 
                                strokeWidth={2}
                                fillOpacity={1} 
                                fill={`url(#colorMetric-${i})`} 
                                animationDuration={1000}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="p-4 bg-apple-background/30 text-center">
                          <p className="text-[10px] text-apple-text-muted italic">
                            Histórico indisponível. Adicione mais exames para ver a evolução desta métrica.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button 
            onClick={() => setShowOriginal(true)}
            className="w-full bg-white text-blue-500 font-bold py-4 rounded-2xl border border-apple-border active:bg-apple-background transition-colors mb-4"
          >
            Ver Documento Original
          </button>
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full bg-white text-red-500 font-bold py-4 rounded-2xl border border-apple-border active:bg-apple-background transition-colors"
          >
            Excluir Registro
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-6 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[24px] p-6 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                <X size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">Excluir Exame?</h3>
              <p className="text-apple-text-secondary text-sm mb-6">
                Esta ação não pode ser desfeita. O documento e suas métricas serão removidos permanentemente.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full bg-red-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-500/20 active:scale-95 transition-transform flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 size={20} className="animate-spin" /> : "Sim, Excluir"}
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="w-full bg-apple-background text-apple-text-primary font-bold py-3 rounded-xl active:scale-95 transition-transform"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOriginal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[200] flex flex-col"
          >
            <div className="p-5 flex justify-between items-center text-white">
              <button onClick={() => setShowOriginal(false)} className="text-white font-bold">Fechar</button>
              <span className="font-bold">Documento Original</span>
              <div className="w-10" />
            </div>
            <div className="flex-grow flex items-center justify-center p-4">
              {exam.fileType.includes('pdf') ? (
                blobUrl ? (
                  <iframe 
                    src={blobUrl} 
                    className="w-full h-full rounded-xl bg-white"
                    title="PDF Viewer"
                  />
                ) : (
                  <div className="text-white flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Carregando PDF...</p>
                  </div>
                )
              ) : (
                <img 
                  src={`data:${exam.fileType};base64,${exam.fileData}`} 
                  alt="Original Exam" 
                  className="max-w-full max-h-full object-contain rounded-xl"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const SharingView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-apple-background z-[150] overflow-y-auto pb-32"
    >
      <div className="p-5 pt-12">
        <div className="flex justify-between items-center mb-6">
          <button onClick={onBack} className="text-blue-500 flex items-center gap-1 font-medium">
            <ChevronLeft size={24} />
            Buscar
          </button>
        </div>

        <h1 className="text-3xl font-black mb-8">Compartilhamento</h1>

        <div className="flex flex-col items-center text-center mb-12">
          <div className="w-24 h-24 bg-gradient-to-br from-purple-400 to-blue-400 rounded-full flex items-center justify-center mb-6 shadow-xl">
            <Users size={48} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Você Tem o Controle</h2>
          <p className="text-apple-text-secondary leading-relaxed px-4">
            Compartilhe dados de Saúde com segurança e mantenha seus amigos e familiares atualizados sobre sua jornada.
          </p>
        </div>

        <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border mb-8">
          <div className="p-5 flex gap-4 items-start">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
              <Lock size={20} />
            </div>
            <div>
              <h3 className="font-bold mb-1">Privado e Seguro</h3>
              <p className="text-xs text-apple-text-secondary">
                As informações são criptografadas e você pode parar de compartilhar a qualquer momento.
              </p>
            </div>
          </div>
          <div className="p-5 flex gap-4 items-start">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-500 shrink-0">
              <CheckCircle size={20} />
            </div>
            <div>
              <h3 className="font-bold mb-1">Sempre Atualizado</h3>
              <p className="text-xs text-apple-text-secondary">
                Seus contatos recebem notificações quando novos dados importantes são registrados.
              </p>
            </div>
          </div>
        </div>

        <button className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
          Compartilhar com Alguém
        </button>
      </div>
    </motion.div>
  );
};

const BrowseView = ({ searchQuery, onSelectCategory, onOpenSharing }: { 
  searchQuery: string, 
  onSelectCategory: (cat: string) => void,
  onOpenSharing: () => void
}) => {
  const categories = [
    { name: 'Acompanhamento de Ciclo de Quimioterapia', icon: <Activity />, color: '#FF2D55' },
    { name: 'Radioterapia', icon: <Activity />, color: '#FF2D55' },
    { name: 'Hormonoterapia', icon: <Activity />, color: '#FF2D55' },
    { name: 'Atividade', icon: <Activity />, color: '#FF2D55' },
    { name: 'Coração', icon: <Heart />, color: '#FF3B30' },
    { name: 'Sono', icon: <Moon />, color: '#5E5CE6' },
    { name: 'Nutrição', icon: <Utensils />, color: '#34C759' },
    { name: 'Sintomas', icon: <Activity />, color: '#FF9500' },
    { name: 'Sinais Vitais', icon: <Activity />, color: '#FF3B30' },
    { name: 'Medicamentos', icon: <Pill />, color: '#32ADE6' },
    { name: 'Exames', icon: <FileText />, color: '#007AFF' },
  ];

  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="pb-24 pt-12 px-5">
      <h2 className="apple-section-header">
        {searchQuery ? 'Resultados da Busca' : 'Categorias de Saúde'}
      </h2>
      <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border mb-12">
        {filteredCategories.map((cat) => (
          <motion.div 
            key={cat.name}
            whileTap={{ backgroundColor: '#F2F2F7' }}
            onClick={() => onSelectCategory(cat.name)}
            className="flex items-center justify-between p-4 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div style={{ color: cat.color }}>
                {React.cloneElement(cat.icon as any, { size: 20, fill: 'currentColor' })}
              </div>
              <span className="font-semibold text-[17px]">{cat.name}</span>
            </div>
            <ChevronRight size={18} className="text-apple-text-muted" />
          </motion.div>
        ))}
        {filteredCategories.length === 0 && (
          <div className="p-8 text-center text-apple-text-muted">
            Nenhuma categoria encontrada para "{searchQuery}"
          </div>
        )}
      </div>

      {!searchQuery && (
        <div className="mt-12 pt-8 border-t border-apple-border">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-blue-400 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <Users size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold mb-4">Compartilhamento de Saúde</h2>
            
            <div className="space-y-6 text-left w-full mb-8">
              <div className="flex gap-3">
                <div className="text-blue-500 mt-1"><CheckCircle size={20} /></div>
                <div>
                  <h3 className="font-bold text-sm">Você Tem o Controle</h3>
                  <p className="text-apple-text-secondary text-xs">
                    Compartilhe dados de Saúde com segurança e mantenha seus amigos e familiares atualizados.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="text-blue-500 mt-1"><Lock size={20} /></div>
                <div>
                  <h3 className="font-bold text-sm">Privado e Seguro</h3>
                  <p className="text-apple-text-secondary text-xs">
                    As informações são criptografadas e você pode parar de compartilhar a qualquer momento.
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={onOpenSharing}
              className="w-full bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
            >
              Compartilhar com Alguém
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SYMPTOMS_LIST = [
  "Acne", "Alterações de Apetite", "Alterações de Humor", "Alterações de Sono",
  "Aperto ou Dor no Peito", "Azia", "Batimentos Rápidos ou Palpitantes", "Calafrios",
  "Cólicas Abdominais", "Congestão", "Desmaio", "Diarreia", "Dor Corporal e Muscular",
  "Dor de Cabeça", "Dor de Garganta", "Dor na Região Lombar", "Dor no Seio",
  "Dor Pélvica", "Nariz Escorrendo", "Náusea", "Ondas de Calor", "Palpitações",
  "Pele Seca", "Perda de Cabelo", "Perda de Memória", "Perda do Olfato",
  "Perda do Paladar", "Prisão de Ventre", "Secura Vaginal", "Suor Noturno",
  "Tosse", "Vômito"
];

const SYMPTOM_DESCRIPTIONS: Record<string, string> = {
  "Vômito": "O vômito ocorre quando o estômago se contrai e força seu conteúdo a sair pela boca. Muitas condições e situações podem causar a necessidade de vomitar, desde uma viagem de carro turbulenta ou gravidez até intoxicação alimentar e uma grande variedade de outras doenças.",
  "Náusea": "A náusea é uma sensação de desconforto no estômago que muitas vezes vem antes do vômito.",
  "Dor de Cabeça": "A dor de cabeça é uma dor ou desconforto na cabeça, couro cabeludo ou pescoço.",
  // Add more as needed
};

const CategoryDetailView: React.FC<{ category: string; onBack: () => void }> = ({ category, onBack }) => {
  const { samples, addSample } = useHealth();
  const [timeRange, setTimeRange] = useState<'D' | 'S' | 'M' | '6M' | 'A'>('S');
  const [showAddData, setShowAddData] = useState(false);
  const [newValue, setNewValue] = useState('');

  const sampleTypeMap: Record<string, string> = {
    'Atividade': 'steps',
    'Coração': 'heart_rate',
    'Sono': 'sleep_hours',
    'Nutrição': 'calories',
    'Sinais Vitais': 'blood_pressure',
    'Acompanhamento de Ciclo de Quimioterapia': 'chemo_cycle',
    'Radioterapia': 'radio_session',
    'Hormonoterapia': 'hormone_dose'
  };

  const unitMap: Record<string, string> = {
    'Atividade': 'passos',
    'Coração': 'BPM',
    'Sono': 'horas',
    'Nutrição': 'kcal',
    'Sinais Vitais': 'mmHg',
    'Acompanhamento de Ciclo de Quimioterapia': 'dia',
    'Radioterapia': 'sessão',
    'Hormonoterapia': 'dose'
  };

  const type = sampleTypeMap[category] || category.toLowerCase().replace(/ /g, '_');
  const unit = unitMap[category] || '';
  const categorySamples = samples.filter(s => s.type === type);
  const latestSample = categorySamples[0];

  const chartData = categorySamples
    .slice(0, 10)
    .reverse()
    .map(s => ({ 
      date: new Date(s.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      value: s.value 
    }));

  const handleAddData = async () => {
    if (!newValue) return;
    await addSample(type, parseFloat(newValue), unit);
    setNewValue('');
    setShowAddData(false);
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-apple-background z-[150] overflow-y-auto pb-32"
    >
      <div className="p-5 pt-12">
        <div className="flex justify-between items-center mb-6">
          <button onClick={onBack} className="text-blue-500 flex items-center gap-1 font-medium">
            <ChevronLeft size={24} />
            Buscar
          </button>
          <button 
            onClick={() => setShowAddData(true)}
            className="text-blue-500 font-bold"
          >
            Adicionar
          </button>
        </div>

        <h1 className="text-3xl font-black mb-6">{category}</h1>

        <div className="apple-card p-4 mb-8">
          <div className="flex justify-between mb-6 bg-apple-background p-1 rounded-xl">
            {['D', 'S', 'M', '6M', 'A'].map(r => (
              <button 
                key={r}
                onClick={() => setTimeRange(r as any)}
                className={`flex-grow py-1.5 rounded-lg text-xs font-bold transition-all ${
                  timeRange === r ? 'bg-white shadow-sm text-apple-text-primary' : 'text-apple-text-muted'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="mb-4">
            <p className="text-apple-text-secondary text-xs font-bold uppercase tracking-wider">Média</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black">
                {categorySamples.length > 0 
                  ? (categorySamples.reduce((acc, s) => acc + s.value, 0) / categorySamples.length).toFixed(1)
                  : '--'}
              </span>
              <span className="text-apple-text-muted font-bold text-sm">{unit}</span>
            </div>
          </div>

          <div className="h-48 w-full mt-4">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#007AFF" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#007AFF" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#007AFF" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-apple-text-muted text-sm italic">
                Nenhum dado para exibir no gráfico
              </div>
            )}
          </div>
        </div>

        <h2 className="apple-section-header">Destaques</h2>
        <div className="apple-card p-4 mb-8">
          {latestSample ? (
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-apple-text-muted uppercase">Último Registro</p>
                <p className="text-lg font-bold">{latestSample.value} {unit}</p>
              </div>
              <p className="text-xs text-apple-text-muted">
                {new Date(latestSample.timestamp).toLocaleDateString('pt-BR')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-apple-text-secondary italic">Nenhum registro encontrado.</p>
          )}
        </div>

        <h2 className="apple-section-header">Sobre {category}</h2>
        <div className="apple-card p-5">
          <p className="text-sm text-apple-text-secondary leading-relaxed">
            O acompanhamento regular de {category.toLowerCase()} é fundamental para o sucesso do seu tratamento oncológico. 
            Mantenha seus registros atualizados para que sua equipe médica possa monitorar sua evolução com precisão.
          </p>
        </div>
      </div>

      <AnimatePresence>
        {showAddData && (
          <div className="fixed inset-0 bg-black/40 z-[200] flex items-end justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Adicionar {category}</h3>
                <button onClick={() => setShowAddData(false)} className="text-apple-text-muted"><X /></button>
              </div>
              
              <div className="mb-6">
                <label className="block text-xs font-bold text-apple-text-muted uppercase mb-2">Valor ({unit})</label>
                <input 
                  type="number" 
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="0.0"
                  className="w-full bg-apple-background rounded-2xl p-4 text-2xl font-black outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <button 
                onClick={handleAddData}
                className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
              >
                Salvar Registro
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
const SymptomsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { symptomLogs } = useHealth();
  const [selectedSymptom, setSelectedSymptom] = useState<string | null>(null);

  const todayLogs = symptomLogs.filter(log => {
    const logDate = new Date(log.timestamp).toDateString();
    const today = new Date().toDateString();
    return logDate === today;
  });

  const symptomsWithData = Array.from(new Set(symptomLogs.map(l => l.type)));
  const symptomsWithoutData = SYMPTOMS_LIST.filter(s => !symptomsWithData.includes(s));

  if (selectedSymptom) {
    return <SymptomDetailView symptom={selectedSymptom} onBack={() => setSelectedSymptom(null)} />;
  }

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.05}
      onDragEnd={(_, info) => {
        if (info.offset.y > 100) onBack();
      }}
      className="fixed inset-0 bg-apple-background z-[120] overflow-y-auto pb-20 rounded-t-[40px] shadow-2xl"
    >
      <div className="w-12 h-1.5 bg-apple-border rounded-full mx-auto mt-3 mb-1 shrink-0" />
      <div className="p-5 pt-4">
        <div className="flex items-center gap-2 mb-6">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-3xl font-bold">Sintomas</h1>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Hoje</h2>
          <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
            {todayLogs.length > 0 ? (
              todayLogs.map(log => (
                <div 
                  key={log.id} 
                  onClick={() => setSelectedSymptom(log.type)}
                  className="p-4 flex items-center justify-between active:bg-apple-background transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-apple-mindfulness/10 flex items-center justify-center text-apple-mindfulness">
                      <Activity size={18} />
                    </div>
                    <div>
                      <p className="font-bold text-apple-mindfulness">{log.type}</p>
                      <p className="text-xs text-apple-text-secondary">{log.intensity}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-apple-text-muted">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <ChevronRight size={16} className="text-apple-text-muted" />
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-apple-text-secondary">
                Nenhum sintoma registrado hoje.
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-4">Não Há Dados Disponíveis</h2>
          <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
            {symptomsWithoutData.map(symptom => (
              <div 
                key={symptom}
                onClick={() => setSelectedSymptom(symptom)}
                className="p-4 flex items-center justify-between active:bg-apple-background transition-colors cursor-pointer"
              >
                <span className="font-medium">{symptom}</span>
                <ChevronRight size={18} className="text-apple-text-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const SymptomDetailView: React.FC<{ symptom: string; onBack: () => void }> = ({ symptom, onBack }) => {
  const { symptomLogs } = useHealth();
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [timeRange, setTimeRange] = useState<'D' | 'S' | 'M' | '6M' | 'A'>('S');

  const logs = symptomLogs.filter(l => l.type === symptom);
  const description = SYMPTOM_DESCRIPTIONS[symptom] || "Informações sobre este sintoma estarão disponíveis em breve.";

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.05}
      onDragEnd={(_, info) => {
        if (info.offset.y > 100) onBack();
      }}
      className="fixed inset-0 bg-apple-background z-[130] overflow-y-auto pb-20 rounded-t-[40px] shadow-2xl"
    >
      <div className="w-12 h-1.5 bg-apple-border rounded-full mx-auto mt-3 mb-1 shrink-0" />
      <div className="p-5 pt-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-2xl font-bold">{symptom}</h1>
          </div>
          <button 
            onClick={() => setShowAddFlow(true)}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-blue-500"
          >
            <Plus size={24} />
          </button>
        </div>

        <div className="apple-card p-4 mb-8">
          <div className="flex justify-between mb-6 bg-apple-background p-1 rounded-xl">
            {['D', 'S', 'M', '6M', 'A'].map(r => (
              <button 
                key={r}
                onClick={() => setTimeRange(r as any)}
                className={`flex-grow py-1.5 rounded-lg text-xs font-bold transition-all ${
                  timeRange === r ? 'bg-white shadow-sm text-apple-text-primary' : 'text-apple-text-muted'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="h-64 flex flex-col justify-between relative">
            {['Grave', 'Moderado', 'Suave', 'Presente', 'Não Presente'].map((label, i) => (
              <div key={label} className="flex items-center gap-3 border-b border-apple-border/50 py-2 last:border-0">
                <span className="text-[10px] font-bold text-apple-text-muted w-20">{label}</span>
                <div className="flex-grow h-px bg-apple-border/20" />
              </div>
            ))}
            
            {logs.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-black text-apple-text-primary">Sem Dados</p>
                <p className="text-xs text-apple-text-muted">29 de mar. — 4 de abr. de 2026</p>
              </div>
            )}
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Sobre {symptom}</h2>
          <div className="apple-card p-6">
            <p className="text-apple-text-primary leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAddFlow && (
          <AddSymptomFlow symptom={symptom} onClose={() => setShowAddFlow(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const AddSymptomFlow: React.FC<{ symptom: string; onClose: () => void }> = ({ symptom, onClose }) => {
  const { addSymptomLog } = useHealth();
  const [intensity, setIntensity] = useState<SymptomLog['intensity']>('Presente');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [endTime, setEndTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const start = `${startDate}T${startTime}:00Z`;
    const end = `${endDate}T${endTime}:00Z`;
    await addSymptomLog(symptom, intensity, start, end);
    setIsSaving(false);
    onClose();
  };

  const intensities: SymptomLog['intensity'][] = ['Não Presente', 'Presente', 'Suave', 'Moderado', 'Grave'];

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.05}
      onDragEnd={(_, info) => {
        if (info.offset.y > 100) onClose();
      }}
      className="fixed inset-0 bg-apple-background z-[200] flex flex-col rounded-t-[40px] shadow-2xl overflow-hidden"
    >
      <div className="w-12 h-1.5 bg-apple-border rounded-full mx-auto mt-3 mb-1 shrink-0" />
      <div className="p-5 flex justify-between items-center border-b border-apple-border bg-white">
        <button onClick={onClose} className="text-blue-500">
          <X size={24} />
        </button>
        <h2 className="text-lg font-bold">{symptom}</h2>
        <button 
          onClick={handleSave} 
          disabled={isSaving}
          className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={24} />}
        </button>
      </div>

      <div className="flex-grow overflow-y-auto p-6">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-full bg-apple-mindfulness/10 flex items-center justify-center text-apple-mindfulness mb-4">
            <Activity size={40} />
          </div>
          <h1 className="text-3xl font-bold">{symptom}</h1>
        </div>

        <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border mb-8">
          {intensities.map((level) => (
            <button 
              key={level}
              onClick={() => setIntensity(level)}
              className="w-full p-4 flex justify-between items-center active:bg-apple-background transition-colors"
            >
              <span className="font-medium">{level}</span>
              {intensity === level && <CheckCircle size={20} className="text-blue-500" />}
            </button>
          ))}
        </div>

        <div className="apple-card p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <span className="text-apple-text-secondary font-medium text-[10px] uppercase tracking-wider">Começa</span>
            <div className="flex flex-wrap gap-2">
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
                className="bg-apple-background px-2 py-2 rounded-lg text-sm font-bold border-none outline-none flex-grow min-w-[120px]"
              />
              <input 
                type="time" 
                value={startTime} 
                onChange={e => setStartTime(e.target.value)}
                className="bg-apple-background px-2 py-2 rounded-lg text-sm font-bold border-none outline-none w-20 flex-shrink-0"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-apple-text-secondary font-medium text-[10px] uppercase tracking-wider">Termina</span>
            <div className="flex flex-wrap gap-2">
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                className="bg-apple-background px-2 py-2 rounded-lg text-sm font-bold border-none outline-none flex-grow min-w-[120px]"
              />
              <input 
                type="time" 
                value={endTime} 
                onChange={e => setEndTime(e.target.value)}
                className="bg-apple-background px-2 py-2 rounded-lg text-sm font-bold border-none outline-none w-20 flex-shrink-0"
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const BottomNav: React.FC<{ 
  activeTab: string; 
  setActiveTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}> = ({ activeTab, setActiveTab, searchQuery, setSearchQuery }) => {
  const tabs = [
    { id: 'summary', label: 'Resumo', icon: <Heart /> },
    { id: 'exams', label: 'Exames', icon: <FileText /> },
  ];

  const isBrowse = activeTab === 'browse';

  return (
    <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none px-6">
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
                  {React.cloneElement(tab.icon as any, { size: 22, fill: activeTab === tab.id ? 'currentColor' : 'none' })}
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
            className="flex items-center gap-3 w-full max-w-xl pointer-events-auto"
          >
            <button
              onClick={() => {
                setActiveTab('summary');
                setSearchQuery('');
              }}
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg bg-white text-apple-text-primary transition-all active:scale-90 flex-shrink-0"
            >
              <Heart size={28} fill="currentColor" />
            </button>
            
            <div className="glass-pill flex-grow flex items-center px-3 py-2.5 gap-2 min-w-0">
              <Search size={20} className="text-apple-text-primary flex-shrink-0" />
              <input 
                type="text" 
                placeholder="Buscar" 
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none flex-grow min-w-0 text-base font-medium text-apple-text-primary placeholder:text-apple-text-muted"
              />
              <Mic size={20} className="text-apple-text-primary flex-shrink-0" />
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

const OnboardingView: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);

  const steps = [
    {
      title: "Bem-vindo ao Saúde",
      description: "Sua jornada de tratamento organizada e segura, seguindo os padrões do Apple Health.",
      icon: <Heart size={64} className="text-apple-activity" fill="currentColor" />,
      color: "text-apple-activity"
    },
    {
      title: "Ciclos de Tratamento",
      description: "Acompanhe cada fase do seu tratamento com indicadores visuais claros e contagem de dias.",
      icon: <Activity size={64} className="text-apple-activity" />,
      color: "text-apple-activity"
    },
    {
      title: "Gestão de Medicamentos",
      description: "Receba lembretes e registre sua adesão. Nunca perca uma dose importante.",
      icon: <Pill size={64} className="text-blue-500" />,
      color: "text-blue-500"
    },
    {
      title: "Registro de Sintomas",
      description: "Monitore como você se sente diariamente. Dados precisos ajudam sua equipe médica.",
      icon: <ClipboardCheck size={64} className="text-orange-500" />,
      color: "text-orange-500"
    },
    {
      title: "Compartilhamento Seguro",
      description: "Mantenha sua família e médicos atualizados com o compartilhamento seguro de dados.",
      icon: <Users size={64} className="text-purple-500" />,
      color: "text-purple-500"
    }
  ];

  const nextStep = () => {
    if (step < steps.length - 1) {
      setDirection(1);
      setStep(s => s + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (step > 0) {
      setDirection(-1);
      setStep(s => s - 1);
    }
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0
    })
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-white z-[200] flex flex-col overflow-hidden"
    >
      <div className="absolute top-12 right-8 z-[210]">
        <button 
          onClick={onComplete}
          className="text-apple-text-muted font-bold text-sm bg-apple-background px-4 py-2 rounded-full active:scale-95 transition-transform"
        >
          Pular
        </button>
      </div>

      <div className="flex-grow relative flex flex-col items-center justify-center p-8 text-center">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 }
            }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragEnd={(e, { offset, velocity }) => {
              const swipe = Math.abs(offset.x) * velocity.x;
              if (swipe < -10000) {
                nextStep();
              } else if (swipe > 10000) {
                prevStep();
              }
            }}
            className="flex flex-col items-center w-full cursor-grab active:cursor-grabbing"
          >
            <div className="mb-8 p-8 rounded-[40px] bg-apple-background shadow-inner">
              {steps[step].icon}
            </div>
            <h1 className="text-3xl font-black tracking-tighter mb-4 text-apple-text-primary">
              {steps[step].title}
            </h1>
            <p className="text-apple-text-secondary text-lg leading-relaxed max-w-xs mx-auto">
              {steps[step].description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="p-8 pb-12 flex flex-col gap-4 bg-white z-10">
        <div className="flex justify-center gap-2 mb-4">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-blue-500' : 'w-1.5 bg-apple-border'
              }`} 
            />
          ))}
        </div>
        
        <button 
          onClick={nextStep}
          className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
        >
          {step === steps.length - 1 ? "Começar Agora" : "Próximo"}
        </button>
        
        {step > 0 && (
          <button 
            onClick={prevStep}
            className="text-apple-text-muted font-semibold text-sm"
          >
            Voltar
          </button>
        )}
      </div>
    </motion.div>
  );
};

const AppContent = () => {
  const { user, loading, addSample } = useHealth();
  const [activeTab, setActiveTab] = useState('summary');
  const [showProfile, setShowProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [showSharing, setShowSharing] = useState(false);

  useEffect(() => {
    if (user) {
      const onboardingDone = localStorage.getItem(`onboarding_${user.uid}`);
      if (!onboardingDone) {
        setShowOnboarding(true);
      }
    }
  }, [user]);

  const completeOnboarding = () => {
    if (user) {
      localStorage.setItem(`onboarding_${user.uid}`, 'true');
      setShowOnboarding(false);
    }
  };

  // Add some mock data on first load for demo
  useEffect(() => {
    if (user) {
      const seedData = async () => {
        const medsRef = collection(db, `users/${user.uid}/medications`);
        const cyclesRef = collection(db, `users/${user.uid}/treatment_cycles`);
        
        // Check if data exists - simple check to avoid duplicates
        // In a real app, we'd check properly
        try {
          // We'll just add if they don't exist (simplified for demo)
          await addDoc(medsRef, {
            name: 'Dexametasona',
            type: 'Comprimido',
            intensity: '4',
            unit: 'mg',
            schedule: { frequency: 'Todos os Dias', times: ['08:00'] },
            instructions: 'Com comida',
            isSOS: false,
            active: true
          });
          await addDoc(medsRef, {
            name: 'Ondansetrona',
            type: 'Comprimido',
            intensity: '8',
            unit: 'mg',
            schedule: { frequency: 'Se necessário', times: [] },
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
        } catch (error) {
          console.error("Error seeding data:", error);
        }
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
        {showOnboarding && <OnboardingView onComplete={completeOnboarding} />}
        {showProfile && <ProfileView onClose={() => setShowProfile(false)} />}
        {showSharing && <SharingView onBack={() => setShowSharing(false)} />}
        {selectedCategory && (
          <CategoryDetailView 
            category={selectedCategory} 
            onBack={() => setSelectedCategory(null)} 
          />
        )}
        {selectedExam && (
          <ExamDetailView 
            exam={selectedExam} 
            onClose={() => setSelectedExam(null)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {activeTab === 'summary' && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <SummaryView 
              onOpenProfile={() => setShowProfile(true)} 
              onSelectCategory={(cat) => setSelectedCategory(cat)}
              onSelectTab={(tab) => setActiveTab(tab)}
              onSelectExam={(exam) => setSelectedExam(exam)}
            />
          </motion.div>
        )}
        {activeTab === 'browse' && (
          <motion.div
            key="browse"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <BrowseView 
              searchQuery={searchQuery} 
              onSelectCategory={(cat) => {
                if (cat === 'Medicamentos') setActiveTab('medications');
                else if (cat === 'Exames') setActiveTab('exams');
                else if (cat === 'Sintomas') setActiveTab('symptoms');
                else setSelectedCategory(cat);
              }} 
              onOpenSharing={() => setShowSharing(true)}
            />
          </motion.div>
        )}
        {activeTab === 'medications' && (
          <motion.div
            key="medications"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <MedicationsView onBack={() => setActiveTab('browse')} />
          </motion.div>
        )}
        {activeTab === 'exams' && (
          <motion.div
            key="exams"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <ExamsView 
              onBack={activeTab === 'exams' ? undefined : () => setActiveTab('browse')} 
              onSelectExam={(exam) => setSelectedExam(exam)}
            />
          </motion.div>
        )}
        {activeTab === 'symptoms' && (
          <motion.div
            key="symptoms"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <SymptomsView onBack={() => setActiveTab('browse')} />
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <HealthProvider>
        <AppContent />
      </HealthProvider>
    </ErrorBoundary>
  );
}
