import React, { useState, useEffect, createContext, useContext, Component, useRef } from 'react';
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
  File as FileIcon,
  Loader2,
  Zap,
  Calendar,
  Check,
  Pin,
  Menu,
  Trash2,
  GripVertical,
  Archive,
  Share2,
  Layers,
  Maximize,
  Scale,
  Droplets,
  Wind,
  Zap as ZapIcon,
  Flame
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence, Reorder } from 'motion/react';
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
  getDoc,
  doc,
  deleteDoc,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer, 
  YAxis, 
  XAxis, 
  Tooltip, 
  Area, 
  AreaChart,
  CartesianGrid
} from 'recharts';
import { auth, db } from './firebase';
import { 
  HealthSample, 
  Medication, 
  MedicationLog, 
  SymptomLog, 
  TreatmentCycle, 
  HealthData, 
  EmergencyContact, 
  MedicalID, 
  ScheduledExam, 
  Exam, 
  TumorProfile, 
  NutritionLog, 
  ActivityGoals, 
  HealthContextType, 
  OperationType, 
  FirestoreErrorInfo 
} from './types';
import { ALL_METRICS, EXAM_TYPES, SYMPTOMS_LIST } from './constants';
import { handleFirestoreError } from './utils';

const HealthContext = createContext<HealthContextType | undefined>(undefined);

const compressImage = (base64: string, mimeType: string, maxWidth = 1000, maxHeight = 1000, quality = 0.6): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = `data:${mimeType};base64,${base64}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      const compressedBase64 = canvas.toDataURL(mimeType, quality).split(',')[1];
      resolve(compressedBase64);
    };
    img.onerror = (err) => reject(err);
  });
};

const analyzeExam = async (fileData: string, fileType: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const model = "gemini-3-flash-preview";
  
  const prompt = `Analise este documento médico (exame ou laudo). 
  Extraia as seguintes informações em formato JSON:
  - type: O tipo do documento. Escolha OBRIGATORIAMENTE um destes: 'Receita', 'Guia Médica', 'Atestado', 'Documento', 'Laudo'.
  - examName: O nome do exame realizado ou título do documento
  - doctorName: O nome do médico responsável (se houver)
  - date: A data do exame no formato YYYY-MM-DD
  - analysis: Um resumo curto (máximo 2 parágrafos) do que o exame diz, em termos simples.
  - metrics: Uma lista de métricas numéricas importantes encontradas (ex: plaquetas, leucócitos, hemoglobina, tumor_size, etc).
    Cada métrica deve ter:
    - type: O nome da métrica (ex: 'Plaquetas', 'Leucócitos', 'Hemoglobina', 'Glicose', 'tumor_size', etc)
    - value: O valor numérico (apenas o número). Se houver dimensões como 26,1 x 18,4 x 25,3 mm, extraia a MAIOR dimensão (ex: 26.1).
    - unit: A unidade de medida (ex: 'mil/mm3', 'g/dL', 'mg/dL', 'mm', etc)
  
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
  const [scheduledExams, setScheduledExams] = useState<ScheduledExam[]>([]);
  const [nutritionLogs, setNutritionLogs] = useState<NutritionLog[]>([]);
  const [tumorProfile, setTumorProfile] = useState<TumorProfile | null>(null);
  const [activityGoals, setActivityGoals] = useState<ActivityGoals>({ steps: 10000, distance: 8, active_energy: 500 });
  const [pinnedMetrics, setPinnedMetrics] = useState<string[]>(['steps', 'heart_rate', 'temperature', 'tumor_size']);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [medicalID, setMedicalID] = useState<MedicalID | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

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

    const unsubMeds = onSnapshot(query(collection(db, `users/${user.uid}/medications`), orderBy('order', 'asc')), (s) => {
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
    
    const unsubScheduledExams = onSnapshot(query(collection(db, `users/${user.uid}/scheduled_exams`), orderBy('date', 'asc')), (s) => {
      setScheduledExams(s.docs.map(d => ({ id: d.id, ...d.data() })) as ScheduledExam[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/scheduled_exams`));

    const unsubNutrition = onSnapshot(query(collection(db, `users/${user.uid}/nutrition_logs`), orderBy('timestamp', 'desc'), limit(50)), (s) => {
      setNutritionLogs(s.docs.map(d => ({ id: d.id, ...d.data() })) as NutritionLog[]);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/nutrition_logs`));

    const unsubPinned = onSnapshot(doc(db, `users/${user.uid}/settings`, 'pinned'), (doc) => {
      if (doc.exists()) {
        setPinnedMetrics(doc.data().metrics || []);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/settings/pinned`));

    const unsubHealthData = onSnapshot(doc(db, `users/${user.uid}/settings`, 'health_data'), (doc) => {
      if (doc.exists()) {
        setHealthData(doc.data() as HealthData);
      } else {
        // Default data
        const defaultData: HealthData = {
          firstName: user.displayName?.split(' ')[0] || '',
          lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
          birthDate: '2000-02-15',
          sex: 'Masculino',
          bloodType: 'Não Definido',
          skinType: 'Não Definido',
          isWheelchairUser: false
        };
        setHealthData(defaultData);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/settings/health_data`));

    const unsubMedicalID = onSnapshot(doc(db, `users/${user.uid}/settings`, 'medical_id'), (doc) => {
      if (doc.exists()) {
        setMedicalID(doc.data() as MedicalID);
      } else {
        const defaultID: MedicalID = {
          showOnLockScreen: true,
          pregnancy: '',
          allergies: '',
          medicalConditions: 'Assuma',
          height: 191,
          weight: 66.5,
          notes: 'Cirurgias:\nPneumotórax\nApendicite\nDesvio de septo\nSinusite',
          emergencyContacts: [
            { relationship: 'pai', name: 'Pai', phone: '+55 (45) 9981-7932' },
            { relationship: 'cônjuge', name: 'Gabrilela Fachim', phone: '+55 (45) 99857-1118' }
          ],
          updatedAt: new Date().toISOString()
        };
        setMedicalID(defaultID);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/settings/medical_id`));

    const unsubProfile = onSnapshot(doc(db, `users/${user.uid}/tumor_profile`, 'current'), (doc) => {
      if (doc.exists()) {
        setTumorProfile({ id: doc.id, ...doc.data() } as TumorProfile);
      } else {
        setTumorProfile(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/tumor_profile/current`));

    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (d) => {
      if (d.exists()) {
        const data = d.data();
        if (data.activityGoals) setActivityGoals(data.activityGoals);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`));

    return () => {
      unsubSamples();
      unsubMeds();
      unsubLogs();
      unsubSymptoms();
      unsubCycles();
      unsubExams();
      unsubScheduledExams();
      unsubNutrition();
      unsubPinned();
      unsubHealthData();
      unsubMedicalID();
      unsubProfile();
      unsubUser();
    };
  }, [user]);

  const updateActivityGoals = async (goals: Partial<ActivityGoals>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        activityGoals: { ...activityGoals, ...goals }
      });
      showToast('Metas atualizadas!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const addSample = async (type: string, value: number, unit: string, timestamp?: string) => {
    if (!user) return;
    const path = `users/${user.uid}/health_samples`;
    try {
      await addDoc(collection(db, path), {
        uid: user.uid, type, value, unit, timestamp: timestamp || new Date().toISOString(),
      });
      showToast('Dado registrado com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const addMedication = async (med: Omit<Medication, 'id'>) => {
    if (!user) return;
    const path = `users/${user.uid}/medications`;
    try {
      const currentMaxOrder = medications.length > 0 ? Math.max(...medications.map(m => m.order || 0)) : 0;
      await addDoc(collection(db, path), { ...med, order: currentMaxOrder + 1 });
      showToast('Medicamento adicionado!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateMedication = async (id: string, med: Partial<Medication>) => {
    if (!user) return;
    const path = `users/${user.uid}/medications/${id}`;
    try {
      await updateDoc(doc(db, path), med);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteMedication = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/medications/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const reorderMedications = async (meds: Medication[]) => {
    if (!user) return;
    const batch = writeBatch(db);
    try {
      meds.forEach((med, index) => {
        const ref = doc(db, `users/${user.uid}/medications/${med.id}`);
        batch.update(ref, { order: index });
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/medications`);
    }
  };

  const addMedicationLog = async (medicationId: string, medicationName: string, status: 'Taken' | 'Skipped', timestamp?: string) => {
    if (!user) return;
    const path = `users/${user.uid}/medication_logs`;
    try {
      await addDoc(collection(db, path), {
        medicationId, medicationName, status, timestamp: timestamp || new Date().toISOString(),
      });
      showToast(status === 'Taken' ? 'Medicamento registrado!' : 'Registro atualizado');
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
      showToast('Sintoma registrado!');
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

  const addScheduledExam = async (exam: Omit<ScheduledExam, 'id'>) => {
    if (!user) return;
    const path = `users/${user.uid}/scheduled_exams`;
    try {
      await addDoc(collection(db, path), { ...exam, timestamp: new Date().toISOString() });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateScheduledExam = async (id: string, exam: Partial<ScheduledExam>) => {
    if (!user) return;
    const path = `users/${user.uid}/scheduled_exams/${id}`;
    try {
      await updateDoc(doc(db, path), exam);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteScheduledExam = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/scheduled_exams/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const addCycle = async (cycle: Omit<TreatmentCycle, 'id'>) => {
    if (!user) return;
    const path = `users/${user.uid}/treatment_cycles`;
    try {
      await addDoc(collection(db, path), cycle);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateCycle = async (id: string, cycle: Partial<TreatmentCycle>) => {
    if (!user) return;
    const path = `users/${user.uid}/treatment_cycles/${id}`;
    try {
      await updateDoc(doc(db, path), cycle);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteCycle = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/treatment_cycles/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
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

  const addNutritionLog = async (log: Omit<NutritionLog, 'id'>) => {
    if (!user) return;
    const path = `users/${user.uid}/nutrition_logs`;
    try {
      await addDoc(collection(db, path), log);
      showToast('Refeição registrada!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteNutritionLog = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/nutrition_logs/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const updateTumorProfile = async (profile: Partial<TumorProfile>) => {
    if (!user) return;
    const path = `users/${user.uid}/tumor_profile/current`;
    try {
      await setDoc(doc(db, path), {
        ...profile,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const togglePinnedMetric = async (metric: string) => {
    if (!user) return;
    const newPinned = pinnedMetrics.includes(metric)
      ? pinnedMetrics.filter(m => m !== metric)
      : [...pinnedMetrics, metric];
    
    const path = `users/${user.uid}/settings/pinned`;
    try {
      await setDoc(doc(db, `users/${user.uid}/settings`, 'pinned'), { metrics: newPinned });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const updateHealthData = async (data: Partial<HealthData>) => {
    if (!user) return;
    const path = `users/${user.uid}/settings/health_data`;
    try {
      await setDoc(doc(db, `users/${user.uid}/settings`, 'health_data'), { ...healthData, ...data }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const updateMedicalID = async (data: Partial<MedicalID>) => {
    if (!user) return;
    const path = `users/${user.uid}/settings/medical_id`;
    try {
      await setDoc(doc(db, `users/${user.uid}/settings`, 'medical_id'), { 
        ...medicalID, 
        ...data,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  return (
    <HealthContext.Provider value={{ 
      user, samples, medications, medicationLogs, symptomLogs, cycles, exams, scheduledExams, nutritionLogs, tumorProfile, activityGoals, loading, pinnedMetrics, healthData, medicalID,
      addSample, addMedication, updateMedication, deleteMedication, reorderMedications, addMedicationLog, addSymptomLog, addExam, deleteExam, addScheduledExam, updateScheduledExam, deleteScheduledExam, addNutritionLog, deleteNutritionLog, updateTumorProfile, updateActivityGoals, togglePinnedMetric, updateHealthData, updateMedicalID, addCycle, updateCycle, deleteCycle,
      showToast
    }}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] bg-apple-text-primary text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 font-bold"
          >
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <Check size={14} strokeWidth={4} />
            </div>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
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
  const { user, medicalID, updateMedicalID, healthData, updateHealthData, medications } = useHealth();
  const [isEditing, setIsEditing] = useState(false);
  const [editID, setEditID] = useState<MedicalID | null>(null);
  const [editHealth, setEditHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    if (medicalID) setEditID(JSON.parse(JSON.stringify(medicalID)));
    if (healthData) setEditHealth(JSON.parse(JSON.stringify(healthData)));
  }, [medicalID, healthData]);

  if (!editID || !editHealth) return null;

  const handleSave = async () => {
    if (editID) await updateMedicalID(editID);
    if (editHealth) await updateHealthData(editHealth);
    setIsEditing(false);
  };

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const SectionHeader = ({ title, onAction, actionLabel = "Editar" }: { title: string, onAction?: () => void, actionLabel?: string }) => (
    <div className="flex justify-between items-center mb-2 mt-6">
      <h3 className="text-red-500 font-bold text-lg">{title}</h3>
      {onAction && !isEditing && (
        <button onClick={onAction} className="text-blue-500 font-medium">{actionLabel}</button>
      )}
    </div>
  );

  const addEmergencyContact = () => {
    if (!editID) return;
    setEditID({
      ...editID,
      emergencyContacts: [
        ...editID.emergencyContacts,
        { name: '', relationship: '', phone: '' }
      ]
    });
  };

  const removeEmergencyContact = (index: number) => {
    if (!editID) return;
    const newContacts = [...editID.emergencyContacts];
    newContacts.splice(index, 1);
    setEditID({ ...editID, emergencyContacts: newContacts });
  };

  const updateEmergencyContact = (index: number, field: keyof EmergencyContact, value: string) => {
    if (!editID) return;
    const newContacts = [...editID.emergencyContacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    setEditID({ ...editID, emergencyContacts: newContacts });
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-white z-[150] overflow-y-auto pb-32"
    >
      <div className="p-5 pt-12">
        <div className="flex justify-between items-center mb-8">
          <button onClick={onClose} className="text-blue-500">
            <ChevronLeft size={28} />
          </button>
          <div className="flex items-center gap-1">
            <span className="text-red-500 text-2xl font-black">*</span>
            <span className="font-bold text-lg text-red-500">Ficha Médica</span>
          </div>
          <button 
            onClick={() => isEditing ? handleSave() : setIsEditing(true)}
            className="text-blue-500 font-bold"
          >
            {isEditing ? 'OK' : 'Editar'}
          </button>
        </div>

        <div className="mb-8">
          <h4 className="text-apple-text-secondary font-medium mb-4">Acesso de Emergência</h4>
          <div className="flex justify-between items-center py-2">
            <span className="text-apple-text-primary text-lg">Mostrar Quando Bloqueado</span>
            <button 
              onClick={() => setEditID({ ...editID, showOnLockScreen: !editID.showOnLockScreen })}
              className={`w-12 h-7 rounded-full transition-colors relative ${editID.showOnLockScreen ? 'bg-green-500' : 'bg-apple-border'}`}
            >
              <motion.div 
                animate={{ x: editID.showOnLockScreen ? 22 : 2 }}
                className="w-6 h-6 bg-white rounded-full shadow-sm absolute top-0.5"
              />
            </button>
          </div>
          <p className="text-apple-text-muted text-sm mt-2 leading-relaxed">
            Para exibir sua Ficha Médica quando o iPhone estiver bloqueado, toque em Emergência e depois em Ficha Médica.
          </p>
        </div>

        <SectionHeader title="Foto e Informações" />
        <div className="flex justify-between items-center py-4">
          <div className="flex-grow mr-4">
            {isEditing ? (
              <div className="space-y-2">
                <input 
                  type="text"
                  value={editHealth.firstName}
                  onChange={(e) => setEditHealth({ ...editHealth, firstName: e.target.value })}
                  className="w-full p-2 bg-apple-background rounded-lg border-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome"
                />
                <input 
                  type="text"
                  value={editHealth.lastName}
                  onChange={(e) => setEditHealth({ ...editHealth, lastName: e.target.value })}
                  className="w-full p-2 bg-apple-background rounded-lg border-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Sobrenome"
                />
                <input 
                  type="date"
                  value={editHealth.birthDate}
                  onChange={(e) => setEditHealth({ ...editHealth, birthDate: e.target.value })}
                  className="w-full p-2 bg-apple-background rounded-lg border-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold">{healthData?.firstName} {healthData?.lastName}</h2>
                <p className="text-apple-text-primary text-lg">{healthData ? calculateAge(healthData.birthDate) : '--'} anos</p>
              </>
            )}
          </div>
          <div className="w-20 h-20 rounded-full bg-apple-border overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon size={40} className="text-apple-text-secondary w-full h-full p-4" />
            )}
          </div>
        </div>

        <SectionHeader title="Gravidez" />
        {isEditing ? (
          <input 
            type="text"
            value={editID.pregnancy}
            onChange={(e) => setEditID({ ...editID, pregnancy: e.target.value })}
            className="w-full p-2 bg-apple-background rounded-lg border-none focus:ring-2 focus:ring-blue-500 mb-4"
            placeholder="Ex: Não"
          />
        ) : (
          <p className="text-apple-text-primary text-lg mb-4">{editID.pregnancy || '--'}</p>
        )}

        <SectionHeader title="Medicamentos" />
        <div className="space-y-1 mb-4">
          {medications.filter(m => m.active).length > 0 ? (
            medications.filter(m => m.active).map(m => (
              <p key={m.id} className="text-apple-text-primary text-lg">{m.name}</p>
            ))
          ) : (
            <p className="text-apple-text-primary text-lg">--</p>
          )}
          <p className="text-apple-text-muted text-xs mt-1 italic">* Gerencie medicamentos na aba Medicamentos</p>
        </div>

        <SectionHeader title="Condições Médicas" />
        {isEditing ? (
          <textarea 
            value={editID.medicalConditions}
            onChange={(e) => setEditID({ ...editID, medicalConditions: e.target.value })}
            className="w-full p-2 bg-apple-background rounded-lg border-none focus:ring-2 focus:ring-blue-500 mb-4 h-24"
            placeholder="Descreva suas condições médicas"
          />
        ) : (
          <p className="text-apple-text-primary text-lg mb-4">{editID.medicalConditions || '--'}</p>
        )}

        <SectionHeader title="Alergias" />
        {isEditing ? (
          <textarea 
            value={editID.allergies}
            onChange={(e) => setEditID({ ...editID, allergies: e.target.value })}
            className="w-full p-2 bg-apple-background rounded-lg border-none focus:ring-2 focus:ring-blue-500 mb-4 h-24"
            placeholder="Descreva suas alergias"
          />
        ) : (
          <p className="text-apple-text-primary text-lg mb-4">{editID.allergies || '--'}</p>
        )}

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div>
            <SectionHeader title="Altura" />
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  value={editID.height}
                  onChange={(e) => setEditID({ ...editID, height: Number(e.target.value) })}
                  className="w-full p-2 bg-apple-background rounded-lg border-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-apple-text-muted font-bold">cm</span>
              </div>
            ) : (
              <p className="text-apple-text-primary text-lg">{editID.height ? `${editID.height} cm` : '--'}</p>
            )}
          </div>
          <div>
            <SectionHeader title="Peso" />
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  value={editID.weight}
                  onChange={(e) => setEditID({ ...editID, weight: Number(e.target.value) })}
                  className="w-full p-2 bg-apple-background rounded-lg border-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-apple-text-muted font-bold">kg</span>
              </div>
            ) : (
              <p className="text-apple-text-primary text-lg">{editID.weight ? `${editID.weight} kg` : '--'}</p>
            )}
          </div>
        </div>

        <SectionHeader title="Notas Adicionais" />
        {isEditing ? (
          <textarea 
            value={editID.notes}
            onChange={(e) => setEditID({ ...editID, notes: e.target.value })}
            className="w-full p-2 bg-apple-background rounded-lg border-none focus:ring-2 focus:ring-blue-500 mb-4 h-24"
            placeholder="Notas importantes"
          />
        ) : (
          <p className="text-apple-text-primary text-lg mb-4">{editID.notes || '--'}</p>
        )}

        <SectionHeader title="Contatos de Emergência" onAction={isEditing ? undefined : () => setIsEditing(true)} />
        <div className="space-y-4 mb-4">
          {editID.emergencyContacts.map((contact, idx) => (
            <div key={idx} className="relative bg-apple-background p-4 rounded-2xl border border-apple-border/30">
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <input 
                      type="text"
                      value={contact.relationship}
                      onChange={(e) => updateEmergencyContact(idx, 'relationship', e.target.value)}
                      className="w-full p-1 bg-transparent border-b border-apple-border focus:outline-none focus:border-blue-500 text-apple-text-muted font-medium"
                      placeholder="Parentesco (ex: Mãe)"
                    />
                    <button onClick={() => removeEmergencyContact(idx)} className="text-red-500 p-1">
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <input 
                    type="text"
                    value={contact.name}
                    onChange={(e) => updateEmergencyContact(idx, 'name', e.target.value)}
                    className="w-full p-1 bg-transparent border-b border-apple-border focus:outline-none focus:border-blue-500 text-apple-text-primary font-bold text-lg"
                    placeholder="Nome do Contato"
                  />
                  <input 
                    type="text"
                    value={contact.phone}
                    onChange={(e) => updateEmergencyContact(idx, 'phone', e.target.value)}
                    className="w-full p-1 bg-transparent border-b border-apple-border focus:outline-none focus:border-blue-500 text-blue-500 text-lg"
                    placeholder="Telefone"
                  />
                </div>
              ) : (
                <>
                  <p className="text-apple-text-muted font-medium">{contact.relationship}</p>
                  <p className="text-apple-text-primary font-bold text-lg">{contact.name}</p>
                  <p className="text-blue-500 text-lg">{contact.phone}</p>
                </>
              )}
            </div>
          ))}
          {isEditing && (
            <button 
              onClick={addEmergencyContact}
              className="w-full py-3 border-2 border-dashed border-apple-border rounded-2xl text-blue-500 font-bold flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Adicionar Contato
            </button>
          )}
        </div>
        <p className="text-apple-text-muted text-sm mt-4 leading-relaxed">
          Quando você usa o SOS de Emergência para ligar para os serviços de emergência, seus contatos de emergência que tenham um número de celular também receberão uma mensagem com a sua localização atual. <span className="text-blue-500">Saiba Mais sobre o SOS de Emergência</span>
        </p>

        <SectionHeader title="Problemas de Saúde" onAction={() => {}} />
        <p className="text-apple-text-primary text-lg mb-4">{editID.medicalConditions || '--'}</p>

        <SectionHeader title="Informações Adicionais" onAction={() => {}} />
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-apple-text-primary text-lg">Altura</span>
            <span className="text-apple-text-primary text-lg">{editID.height} cm</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-apple-text-primary text-lg">Peso</span>
            <span className="text-apple-text-primary text-lg">{editID.weight} kg</span>
          </div>
        </div>

        <SectionHeader title="Notas" onAction={() => {}} />
        <div className="text-apple-text-primary text-lg mb-8 whitespace-pre-line">
          {editID.notes || '--'}
        </div>

        <div className="text-apple-text-muted text-sm mt-12">
          Atualização: {new Date(editID.updatedAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>
    </motion.div>
  );
};

const SchedulingView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { scheduledExams, addScheduledExam, updateScheduledExam, deleteScheduledExam } = useHealth();
  const [showAdd, setShowAdd] = useState(false);
  const [newExam, setNewExam] = useState<Omit<ScheduledExam, 'id' | 'timestamp'>>({
    type: 'Hemograma',
    name: '',
    date: new Date().toISOString().split('T')[0],
    time: '08:00',
    location: '',
    notes: '',
    completed: false
  });

  const examTypes = ['Hemograma', 'Ressonância', 'Tomografia (TC)', 'Cintilografia', 'Ultrassom', 'Biópsia', 'Outro'];

  const handleAdd = async () => {
    if (!newExam.name || !newExam.date) return;
    await addScheduledExam(newExam as any);
    setShowAdd(false);
    setNewExam({
      type: 'Hemograma',
      name: '',
      date: new Date().toISOString().split('T')[0],
      time: '08:00',
      location: '',
      notes: '',
      completed: false
    });
  };

  const toggleComplete = async (exam: ScheduledExam) => {
    await updateScheduledExam(exam.id, { completed: !exam.completed });
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-apple-background z-[150] overflow-y-auto pb-32"
    >
      <div className="p-5 pt-12">
        <div className="flex justify-between items-center mb-8">
          <button onClick={onClose} className="text-blue-500">
            <ChevronLeft size={28} />
          </button>
          <h2 className="text-2xl font-black text-apple-text-primary tracking-tight">Agendamentos</h2>
          <button 
            onClick={() => setShowAdd(true)}
            className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
          >
            <Plus size={24} />
          </button>
        </div>

        <div className="space-y-4">
          {scheduledExams.length === 0 && !showAdd && (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-apple-border/30 rounded-full flex items-center justify-center mx-auto mb-4 text-apple-text-muted">
                <Calendar size={40} />
              </div>
              <p className="text-apple-text-secondary font-bold">Nenhum exame agendado</p>
              <p className="text-apple-text-muted text-sm px-10">Toque no + para agendar seu próximo exame.</p>
            </div>
          )}

          {scheduledExams.map(exam => (
            <div 
              key={exam.id} 
              className={`apple-card p-5 flex items-center gap-4 transition-all ${exam.completed ? 'opacity-60 grayscale' : ''}`}
            >
              <button 
                onClick={() => toggleComplete(exam)}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
                  exam.completed ? 'bg-green-500 border-green-500 text-white' : 'border-apple-border'
                }`}
              >
                {exam.completed && <Check size={18} />}
              </button>
              <div className="flex-grow">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-0.5">{exam.type}</p>
                    <h3 className="font-black text-apple-text-primary">{exam.name}</h3>
                  </div>
                  <button onClick={() => deleteScheduledExam(exam.id)} className="text-apple-text-muted p-1">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs font-bold text-apple-text-secondary">
                  <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(exam.date).toLocaleDateString('pt-BR')}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    {exam.time}
                  </div>
                </div>
                {exam.location && (
                  <p className="text-[10px] text-apple-text-muted mt-1 font-medium">{exam.location}</p>
                )}
                {exam.notes && (
                  <p className="text-[10px] text-apple-text-muted mt-1 italic">Obs: {exam.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[160] flex items-end justify-center p-4"
            onClick={() => setShowAdd(false)}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white w-full max-w-md rounded-[32px] p-8 pb-12 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black text-apple-text-primary tracking-tight">Novo Agendamento</h3>
                <button onClick={() => setShowAdd(false)} className="bg-apple-border/50 p-2 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">Tipo de Exame</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                    {examTypes.map(type => (
                      <button
                        key={type}
                        onClick={() => setNewExam({ ...newExam, type })}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                          newExam.type === type ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-apple-border/30 text-apple-text-secondary'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">Nome / Descrição</label>
                  <input 
                    type="text"
                    value={newExam.name}
                    onChange={e => setNewExam({ ...newExam, name: e.target.value })}
                    className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-blue-500 font-bold"
                    placeholder="Ex: Hemograma Completo"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">Data</label>
                    <input 
                      type="date"
                      value={newExam.date}
                      onChange={e => setNewExam({ ...newExam, date: e.target.value })}
                      className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-blue-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">Hora</label>
                    <input 
                      type="time"
                      value={newExam.time}
                      onChange={e => setNewExam({ ...newExam, time: e.target.value })}
                      className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-blue-500 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">Local</label>
                  <input 
                    type="text"
                    value={newExam.location}
                    onChange={e => setNewExam({ ...newExam, location: e.target.value })}
                    className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-blue-500 font-bold"
                    placeholder="Ex: Laboratório X"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">Observações</label>
                  <textarea 
                    value={newExam.notes}
                    onChange={e => setNewExam({ ...newExam, notes: e.target.value })}
                    className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-blue-500 font-bold min-h-[100px] resize-none"
                    placeholder="Ex: Jejum de 8 horas, levar exames anteriores..."
                  />
                </div>

                <button 
                  onClick={handleAdd}
                  disabled={!newExam.name}
                  className="w-full bg-blue-500 text-white font-black py-5 rounded-[24px] shadow-xl shadow-blue-500/30 active:scale-95 transition-transform disabled:opacity-50 disabled:grayscale"
                >
                  Agendar Exame
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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

const HealthDataView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { healthData, updateHealthData, user } = useHealth();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<HealthData | null>(null);

  useEffect(() => {
    if (healthData) setEditData(healthData);
  }, [healthData]);

  if (!editData) return null;

  const handleSave = async () => {
    await updateHealthData(editData);
    setIsEditing(false);
  };

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-white z-[150] overflow-y-auto pb-32"
    >
      <div className="p-5 pt-12">
        <div className="flex justify-between items-center mb-8">
          <button onClick={onClose} className="text-blue-500">
            <ChevronLeft size={28} />
          </button>
          <span className="font-bold text-lg">Dados de Saúde</span>
          <button 
            onClick={() => isEditing ? handleSave() : setIsEditing(true)}
            className="text-blue-500 font-bold"
          >
            {isEditing ? 'OK' : 'Editar'}
          </button>
        </div>

        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 rounded-full bg-apple-border overflow-hidden mb-4 border-4 border-white shadow-sm">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon size={48} className="text-apple-text-secondary w-full h-full p-4" />
            )}
          </div>
        </div>

        <div className="space-y-1 divide-y divide-apple-border">
          <div className="py-3 flex justify-between items-center">
            <span className="text-apple-text-primary font-medium">Nome</span>
            {isEditing ? (
              <input 
                type="text" 
                value={editData.firstName}
                onChange={e => setEditData({...editData, firstName: e.target.value})}
                className="text-right outline-none text-apple-text-secondary"
              />
            ) : (
              <span className="text-apple-text-secondary">{editData.firstName}</span>
            )}
          </div>
          <div className="py-3 flex justify-between items-center">
            <span className="text-apple-text-primary font-medium">Sobrenome</span>
            {isEditing ? (
              <input 
                type="text" 
                value={editData.lastName}
                onChange={e => setEditData({...editData, lastName: e.target.value})}
                className="text-right outline-none text-apple-text-secondary"
              />
            ) : (
              <span className="text-apple-text-secondary">{editData.lastName}</span>
            )}
          </div>
          <div className="py-3 flex justify-between items-center">
            <span className="text-apple-text-primary font-medium">Data de Nascimento</span>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <input 
                  type="date" 
                  value={editData.birthDate}
                  onChange={e => setEditData({...editData, birthDate: e.target.value})}
                  className="text-right outline-none text-apple-text-secondary"
                />
              ) : (
                <span className="text-apple-text-secondary">
                  {formatDate(editData.birthDate)} ({calculateAge(editData.birthDate)})
                </span>
              )}
              <ChevronRight size={18} className="text-apple-border" />
            </div>
          </div>
          <div className="py-3 flex justify-between items-center">
            <span className="text-apple-text-primary font-medium">Sexo</span>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <select 
                  value={editData.sex}
                  onChange={e => setEditData({...editData, sex: e.target.value})}
                  className="text-right outline-none text-apple-text-secondary bg-transparent"
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Outro">Outro</option>
                  <option value="Não Definido">Não Definido</option>
                </select>
              ) : (
                <span className="text-apple-text-secondary">{editData.sex}</span>
              )}
              <ChevronRight size={18} className="text-apple-border" />
            </div>
          </div>
          <div className="py-3 flex justify-between items-center">
            <span className="text-apple-text-primary font-medium">Grupo Sanguíneo</span>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <select 
                  value={editData.bloodType}
                  onChange={e => setEditData({...editData, bloodType: e.target.value})}
                  className="text-right outline-none text-apple-text-secondary bg-transparent"
                >
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="Não Definido">Não Definido</option>
                </select>
              ) : (
                <span className="text-apple-text-secondary">{editData.bloodType}</span>
              )}
              <ChevronRight size={18} className="text-apple-border" />
            </div>
          </div>
          <div className="py-3 flex justify-between items-center">
            <span className="text-apple-text-primary font-medium">Tipo de Pele (Fitzpatrick)</span>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <select 
                  value={editData.skinType}
                  onChange={e => setEditData({...editData, skinType: e.target.value})}
                  className="text-right outline-none text-apple-text-secondary bg-transparent"
                >
                  <option value="Tipo I">Tipo I</option>
                  <option value="Tipo II">Tipo II</option>
                  <option value="Tipo III">Tipo III</option>
                  <option value="Tipo IV">Tipo IV</option>
                  <option value="Tipo V">Tipo V</option>
                  <option value="Tipo VI">Tipo VI</option>
                  <option value="Não Definido">Não Definido</option>
                </select>
              ) : (
                <span className="text-apple-text-secondary">{editData.skinType}</span>
              )}
              <ChevronRight size={18} className="text-apple-border" />
            </div>
          </div>
          <div className="py-6 flex justify-between items-center border-t-8 border-apple-background">
            <span className="text-apple-text-primary font-medium">Cadeira de Rodas</span>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <select 
                  value={editData.isWheelchairUser ? 'Sim' : 'Não'}
                  onChange={e => setEditData({...editData, isWheelchairUser: e.target.value === 'Sim'})}
                  className="text-right outline-none text-apple-text-secondary bg-transparent"
                >
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              ) : (
                <span className="text-apple-text-secondary">{editData.isWheelchairUser ? 'Sim' : 'Não'}</span>
              )}
              <ChevronRight size={18} className="text-apple-border" />
            </div>
          </div>
        </div>
        
        <p className="text-apple-text-muted text-xs mt-4 leading-relaxed">
          Registre impulsos em vez de passos no Apple Watch no app Atividade e em exercícios com cadeira de rodas no app Exercício. Os impulsos são salvos no app Saúde. Quando esta opção está ativada, o iPhone não registra passos.
        </p>
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
        { label: 'Agendamentos', icon: <Calendar size={20} className="text-blue-500" /> },
      ]
    },
    {
      title: 'Recursos',
      items: [
        { label: 'Notificações', icon: <Bell size={20} className="text-red-500" /> },
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
        {selectedItem === 'Dados de Saúde' && <HealthDataView onClose={() => setSelectedItem(null)} />}
        {selectedItem === 'Agendamentos' && <SchedulingView onClose={() => setSelectedItem(null)} />}
        {selectedItem && !['Ficha Médica', 'Dados de Saúde', 'Agendamentos'].includes(selectedItem) && (
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

const SummaryView = ({ onOpenProfile, onSelectCategory, onSelectTab, onSelectExam, onOpenEditPinned, onOpenSymptomHistory, onOpenTumorDetail, onOpenScheduling }: { 
  onOpenProfile: () => void, 
  onSelectCategory: (cat: string) => void,
  onSelectTab: (tab: string) => void,
  onSelectExam: (exam: Exam) => void,
  onOpenEditPinned: () => void,
  onOpenSymptomHistory: () => void,
  onOpenTumorDetail: () => void,
  onOpenScheduling: () => void
}) => {
  const { samples, user, cycles, medications, medicationLogs, exams, scheduledExams, symptomLogs, pinnedMetrics, tumorProfile } = useHealth();
  
  const getLatest = (type: string) => {
    const filtered = samples.filter(s => s.type === type);
    return filtered.length > 0 ? filtered[0] : null;
  };

  const getHistory = (type: string) => {
    return samples
      .filter(s => s.type === type)
      .slice(0, 7)
      .reverse()
      .map(s => ({ 
        value: s.value,
        date: new Date(s.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      }));
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <p className="text-apple-text-muted text-[10px] font-bold uppercase tracking-widest mb-1">Bom dia,</p>
          <h1 className="apple-title mb-0">{user?.displayName?.split(' ')[0] || 'Paciente'}</h1>
        </div>
        <button 
          onClick={onOpenProfile}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center overflow-hidden border-2 border-white shadow-lg active:scale-90 transition-transform"
        >
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="text-white font-black text-lg">
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
            onClick={() => onSelectCategory('Ciclo de quimioterapia')}
            className="apple-card p-6 mb-8 relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform bg-gradient-to-br from-white to-apple-background"
          >
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-apple-activity/10 rounded-full -mr-20 -mt-20 blur-3xl" />
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-apple-activity animate-pulse" />
                  <h3 className="text-apple-text-secondary text-[10px] font-bold uppercase tracking-[0.1em]">Tratamento Ativo</h3>
                </div>
                <p className="text-2xl font-black text-apple-text-primary tracking-tight">{currentCycle.name}</p>
              </div>
              <div className="bg-apple-activity/10 px-3 py-1 rounded-full">
                <p className="text-sm font-bold text-apple-activity">Dia {currentDay}</p>
              </div>
            </div>

            <div className="relative mb-6">
              <div className="w-full h-3 bg-apple-border/30 rounded-full overflow-hidden backdrop-blur-sm">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-apple-activity to-[#FF5E7D] relative"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/50 rounded-xl p-2 text-center border border-apple-border/50">
                <p className="text-xs font-bold text-apple-text-primary">{currentCycle.currentCycle}/{currentCycle.totalCycles}</p>
                <p className="text-[8px] font-bold text-apple-text-muted uppercase">Ciclo</p>
              </div>
              <div className="bg-white/50 rounded-xl p-2 text-center border border-apple-border/50">
                <p className="text-xs font-bold text-apple-text-primary">{remainingDays}d</p>
                <p className="text-[8px] font-bold text-apple-text-muted uppercase">Restam</p>
              </div>
              <div className="bg-white/50 rounded-xl p-2 text-center border border-apple-border/50">
                <p className="text-xs font-bold text-apple-text-primary">{currentCycle.totalDays}d</p>
                <p className="text-[8px] font-bold text-apple-text-muted uppercase">Total</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Próximos Exames Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black text-apple-text-primary tracking-tight">Próximos Exames</h2>
          <button onClick={onOpenScheduling} className="text-blue-500 text-sm font-bold">Ver Todos</button>
        </div>
        <div className="space-y-3">
          {scheduledExams.filter(e => !e.completed).slice(0, 2).map(exam => (
            <div key={exam.id} className="apple-card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex flex-col items-center justify-center text-blue-500">
                <span className="text-[10px] font-black uppercase leading-none">{new Date(exam.date).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                <span className="text-lg font-black leading-none">{new Date(exam.date).getDate()}</span>
              </div>
              <div className="flex-grow">
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-0.5">{exam.type}</p>
                <h3 className="font-bold text-apple-text-primary text-sm">{exam.name}</h3>
                <p className="text-[10px] text-apple-text-muted font-medium">{exam.time} • {exam.location || 'Local não definido'}</p>
              </div>
              <ChevronRight size={16} className="text-apple-text-muted" />
            </div>
          ))}
          {scheduledExams.filter(e => !e.completed).length === 0 && (
            <button 
              onClick={onOpenScheduling}
              className="w-full py-6 border-2 border-dashed border-apple-border rounded-[24px] text-apple-text-muted flex flex-col items-center gap-2 active:scale-95 transition-all"
            >
              <Calendar size={24} />
              <span className="text-xs font-bold">Nenhum exame agendado</span>
            </button>
          )}
        </div>
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-end mb-4">
          <h2 className="apple-section-header mb-0">Métricas em Foco</h2>
          <button onClick={onOpenEditPinned} className="text-blue-500 font-bold text-[11px] uppercase tracking-wider">Ajustar</button>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {pinnedMetrics.map(metricId => {
            const metricDef = ALL_METRICS.find(m => m.id === metricId);
            if (!metricDef) return null;

            if (metricDef.category === 'Sintomas') {
              const latestSymptom = symptomLogs.find(s => s.type === metricDef.name);
              return (
                <div 
                  key={metricId}
                  onClick={() => onSelectCategory('Sintomas')}
                  className="apple-card p-4 flex flex-col justify-between h-32 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <div className="flex justify-between items-start">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${metricDef.color}15`, color: metricDef.color }}>
                      {metricDef.icon}
                    </div>
                    <ChevronRight size={14} className="text-apple-text-muted" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-apple-text-muted uppercase mb-0.5 tracking-tight">{metricDef.name}</p>
                    <p className="text-sm font-black text-apple-text-primary truncate">
                      {latestSymptom ? latestSymptom.intensity : 'Sem registro'}
                    </p>
                  </div>
                </div>
              );
            }

            const latest = getLatest(metricId);
            if (metricId === 'tumor_size') {
              return (
                <div 
                  key={metricId}
                  onClick={onOpenTumorDetail}
                  className="apple-card p-4 col-span-2 flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform bg-gradient-to-r from-indigo-50/30 to-white"
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                    <Activity size={24} />
                  </div>
                  <div className="flex-grow">
                    <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-wider">Evolução do Tumor</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-apple-text-primary">{latest?.value || "--"}</span>
                      <span className="text-xs font-bold text-apple-text-muted">mm</span>
                    </div>
                  </div>
                  <div className="w-20 h-10">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getHistory('tumor_size')}>
                        <Line type="monotone" dataKey="value" stroke="#5E5CE6" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            }

            if (metricId === 'Plaquetas' || metricId === 'Leucócitos' || metricId === 'Hemoglobina') {
              return (
                <div 
                  key={metricId}
                  className="apple-card p-4 cursor-pointer active:scale-95 transition-transform flex flex-col justify-between h-32" 
                  onClick={() => onSelectCategory('Exames')}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">
                    <FileText size={16} />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-apple-text-muted uppercase mb-0.5 tracking-tight">{metricDef.name}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black" style={{ color: metricDef.color }}>{latest?.value?.toLocaleString() || '--'}</span>
                      <span className="text-[8px] font-bold text-apple-text-muted">{latest?.unit || ''}</span>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div 
                key={metricId}
                onClick={() => {
                  if (metricDef.category === 'Atividade') onSelectTab('activity');
                  else if (metricDef.category === 'Sinais vitais') onSelectTab('vitals');
                  else if (metricDef.category === 'Nutrição') onSelectTab('nutrition');
                  else onSelectCategory(metricDef.category);
                }}
                className="apple-card p-4 flex flex-col justify-between h-32 cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div className="flex justify-between items-start">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${metricDef.color}15`, color: metricDef.color }}>
                    {metricDef.icon}
                  </div>
                  <div className="w-12 h-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getHistory(metricId)}>
                        <Line type="monotone" dataKey="value" stroke={metricDef.color} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-apple-text-muted uppercase mb-0.5 tracking-tight">{metricDef.name}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black text-apple-text-primary">{latest?.value?.toLocaleString() || (metricId === 'temperature' ? "0.0" : "0")}</span>
                    <span className="text-[8px] font-bold text-apple-text-muted">{latest?.unit || (metricId === 'steps' ? 'passos' : metricId === 'heart_rate' ? 'BPM' : '°C')}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-end mb-4">
          <h2 className="apple-section-header mb-0">Perfil do Tumor</h2>
          <button onClick={onOpenTumorDetail} className="text-blue-500 font-bold text-[11px] uppercase tracking-wider">
            {tumorProfile ? 'Ver Detalhes' : 'Adicionar'}
          </button>
        </div>
        
        <div 
          onClick={onOpenTumorDetail}
          className="apple-card p-5 cursor-pointer active:scale-[0.98] transition-transform bg-gradient-to-br from-white to-indigo-50/20 shadow-sm border border-indigo-100/50"
        >
          {tumorProfile ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-200">
                  <Activity size={20} />
                </div>
                <div className="flex-grow">
                  <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-wider mb-0.5">Diagnóstico Principal</p>
                  <p className="text-base font-black text-apple-text-primary leading-tight">
                    {tumorProfile.diagnosis || 'Não informado'}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-apple-border/30">
                <div>
                  <p className="text-[9px] font-bold text-apple-text-muted uppercase tracking-tight mb-0.5">Tipo</p>
                  <p className="text-xs font-bold text-apple-text-primary truncate">
                    {tumorProfile.type || 'Não informado'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-apple-text-muted uppercase tracking-tight mb-0.5">Grau</p>
                  <p className="text-xs font-bold text-apple-text-primary truncate">
                    {tumorProfile.grade || 'Não informado'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-400 mb-3">
                <Activity size={24} />
              </div>
              <p className="text-sm font-bold text-apple-text-primary mb-1">Perfil do Tumor Incompleto</p>
              <p className="text-[11px] text-apple-text-muted max-w-[200px]">
                Adicione informações do seu laudo para acompanhar a evolução detalhada.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-end mb-4">
          <h2 className="apple-section-header mb-0">Evolução Gráfica</h2>
          <button onClick={onOpenTumorDetail} className="text-blue-500 font-bold text-[11px] uppercase tracking-wider">Histórico</button>
        </div>
        
        <div className="apple-card p-6 bg-white shadow-sm border border-apple-border/50">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest">Tamanho do Tumor (mm)</p>
          </div>
          
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={getHistory('tumor_size')}>
                <defs>
                  <linearGradient id="colorTumor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5E5CE6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#5E5CE6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F2F2F7" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#8E8E93', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#8E8E93', fontWeight: 600 }}
                  dx={-10}
                />
                <Tooltip 
                  cursor={{ stroke: '#5E5CE6', strokeWidth: 1, strokeDasharray: '4 4' }}
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    padding: '12px'
                  }}
                  itemStyle={{ fontWeight: 'bold', color: '#5E5CE6' }}
                  labelStyle={{ fontWeight: 'bold', color: '#1C1C1E', marginBottom: '4px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#5E5CE6" 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#colorTumor)" 
                  dot={{ r: 4, fill: '#5E5CE6', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-end mb-4">
          <h2 className="apple-section-header mb-0">Próximas Doses</h2>
          <button onClick={() => onSelectTab('medications')} className="text-blue-500 font-bold text-[11px] uppercase tracking-wider">Ver Todos</button>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 no-scrollbar">
          {medications
            .filter(m => !m.isSOS && m.active)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(m => (
            <div 
              key={m.id} 
              onClick={() => onSelectTab('medications')}
              className="apple-card p-4 min-w-[200px] flex flex-col justify-between h-36 bg-gradient-to-br from-white to-blue-50/30 border-blue-100/50"
            >
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-blue-500">
                  <Pill size={20} />
                </div>
                <div className="bg-blue-500 text-white text-[9px] font-black px-2 py-1 rounded-full">HOJE</div>
              </div>
              <div>
                <p className="font-black text-apple-text-primary leading-tight mb-1">{m.name}</p>
                <p className="text-[10px] font-bold text-apple-text-muted uppercase">
                  {m.intensity} {m.unit} • {m.schedule?.times[0] || 'Manhã'}
                </p>
              </div>
            </div>
          ))}
          {medications.filter(m => !m.isSOS && m.active).length === 0 && (
            <div className="apple-card p-6 w-full text-center text-apple-text-muted text-sm italic">
              Nenhuma medicação agendada para hoje.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="col-span-2">
          <h2 className="apple-section-header mb-4">Atividade Recente</h2>
        </div>
        
        <div 
          onClick={onOpenSymptomHistory}
          className="apple-card p-4 flex flex-col justify-between h-40 cursor-pointer active:scale-[0.98] transition-transform bg-gradient-to-br from-white to-orange-50/20"
        >
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-500">
              <Activity size={22} />
            </div>
            <ChevronRight size={16} className="text-apple-text-muted" />
          </div>
          <div>
            <p className="text-xs font-black text-apple-text-primary mb-1">Sintomas</p>
            {symptomLogs.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-orange-600 truncate">{symptomLogs[0].type}</p>
                <p className="text-[9px] text-apple-text-muted">{new Date(symptomLogs[0].timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
              </div>
            ) : (
              <p className="text-[10px] text-apple-text-muted">Nenhum registro</p>
            )}
          </div>
        </div>

        <div 
          onClick={() => onSelectCategory('Exames')}
          className="apple-card p-4 flex flex-col justify-between h-40 cursor-pointer active:scale-[0.98] transition-transform bg-gradient-to-br from-white to-blue-50/20"
        >
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500">
              <FileText size={22} />
            </div>
            <ChevronRight size={16} className="text-apple-text-muted" />
          </div>
          <div>
            <p className="text-xs font-black text-apple-text-primary mb-1">Exames</p>
            {exams.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-blue-600 truncate">{exams[0].examName}</p>
                <p className="text-[9px] text-apple-text-muted">{new Date(exams[0].date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
              </div>
            ) : (
              <p className="text-[10px] text-apple-text-muted">Nenhum registro</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MedicationLogModal: React.FC<{ 
  medication: Medication, 
  time: string, 
  onClose: () => void,
  onLog: (status: 'Taken' | 'Skipped') => void,
  lastLog?: MedicationLog
}> = ({ medication, time, onClose, onLog, lastLog }) => {
  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="fixed inset-0 bg-white z-[200] flex flex-col"
    >
      <div className="p-5 flex justify-between items-center">
        <button onClick={onClose} className="text-black">
          <X size={32} />
        </button>
        <h2 className="text-lg font-bold">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}
        </h2>
        <div className="w-8" />
      </div>

      <div className="flex-grow min-h-0 overflow-y-auto flex flex-col items-center px-8 pt-12">
        <div className="text-cyan-400 mb-8">
          <Pill size={64} className="rotate-45" />
        </div>
        
        <h1 className="text-4xl font-bold text-center mb-12 leading-tight">
          Medicamento às {time}
        </h1>

        <button className="text-blue-500 font-semibold text-lg mb-12">
          Registrar Todos como Tomados
        </button>

        <div className="w-full flex items-center gap-4 mb-12">
          <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg overflow-hidden">
            <div className="rotate-45 flex scale-150">
              <div className="w-4 h-3 rounded-l-full" style={{ backgroundColor: medication.colors?.left }} />
              <div className="w-4 h-3 rounded-r-full" style={{ backgroundColor: medication.colors?.right }} />
            </div>
          </div>
          <div className="flex-grow">
            <h3 className="text-2xl font-bold">{medication.name}</h3>
            <p className="text-apple-text-secondary text-lg">{medication.type}, {medication.intensity} {medication.unit}</p>
            {lastLog && lastLog.status === 'Taken' && (
              <div className="flex items-center gap-1 text-blue-500 font-medium mt-1">
                <span>1 aplicação, à {new Date(lastLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <ChevronRight size={16} />
              </div>
            )}
          </div>
        </div>

        <div className="w-full space-y-4">
          <button 
            onClick={() => onLog('Skipped')}
            className="w-full py-4 rounded-2xl bg-cyan-50 text-cyan-600 font-bold text-xl active:scale-95 transition-transform"
          >
            Não Tomado
          </button>
          <button 
            onClick={() => onLog('Taken')}
            className="w-full py-4 rounded-2xl bg-cyan-50 text-cyan-600 font-bold text-xl active:scale-95 transition-transform"
          >
            Tomado
          </button>
        </div>
      </div>

      <div className="p-8">
        <button 
          onClick={onClose}
          className="w-full py-4 rounded-full bg-apple-border text-black font-bold text-xl active:scale-95 transition-transform"
        >
          OK
        </button>
      </div>
    </motion.div>
  );
};

const MedicationDetailView: React.FC<{
  medication: Medication,
  logs: MedicationLog[],
  onClose: () => void,
  onUpdate: (id: string, data: Partial<Medication>) => Promise<void>,
  onDelete: (id: string) => Promise<void>,
  onArchive: (id: string) => Promise<void>,
  onLog: (status: 'Taken' | 'Skipped') => Promise<void>
}> = ({ medication, logs, onClose, onUpdate, onDelete, onArchive, onLog }) => {
  const [activeRange, setActiveRange] = useState('S'); // D, S, M, 6 M, A
  
  // Filter logs for the last 7 days for the chart
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const chartData = last7Days.map(date => {
    const dayLogs = logs.filter(l => new Date(l.timestamp).toDateString() === date.toDateString());
    const takenCount = dayLogs.filter(l => l.status === 'Taken').length;
    return {
      name: date.toLocaleDateString('pt-BR', { weekday: 'short' }).toLowerCase().replace('.', ''),
      taken: takenCount,
      date: date
    };
  });

  const averageTaken = logs.length > 0 ? (logs.filter(l => l.status === 'Taken').length / 7).toFixed(1) : 0;
  const averageSkipped = logs.length > 0 ? (logs.filter(l => l.status === 'Skipped').length / 7).toFixed(1) : 0;
  
  const startDate = last7Days[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  const endDate = last7Days[6].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  const dateRangeStr = `${startDate} — ${endDate}`;
  const todayLogs = logs.filter(l => new Date(l.timestamp).toDateString() === new Date().toDateString());

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed inset-0 bg-white z-[200] flex flex-col"
    >
      {/* Header */}
      <div className="p-5 flex items-center justify-between sticky top-0 bg-white z-10">
        <button onClick={onClose} className="text-blue-500">
          <ChevronLeft size={32} />
        </button>
        <h2 className="text-xl font-bold">{medication.name}</h2>
        <div className="w-8" />
      </div>

      <div className="flex-grow min-h-0 overflow-y-auto">
        {/* Time Range Selector */}
        <div className="px-5 mb-8">
          <div className="flex justify-between bg-apple-background p-1 rounded-xl">
            {['D', 'S', 'M', '6 M', 'A'].map(range => (
              <button
                key={range}
                onClick={() => setActiveRange(range)}
                className={`flex-grow py-1.5 text-sm font-bold rounded-lg transition-all ${activeRange === range ? 'bg-white shadow-sm' : 'text-apple-text-muted'}`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="px-5 mb-6">
          <div className="flex gap-8 mb-2">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-[10px] font-bold text-apple-text-muted uppercase tracking-wider">MÉDIA DIÁRIA TOMADO</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{averageTaken}</span>
                <span className="text-apple-text-muted font-medium">aplicação</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full bg-apple-border" />
                <span className="text-[10px] font-bold text-apple-text-muted uppercase tracking-wider">MÉDIA DIÁRIA NÃO TOMADO</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{averageSkipped}</span>
                <span className="text-apple-text-muted font-medium">aplicação</span>
              </div>
            </div>
          </div>
          <p className="text-apple-text-muted text-sm font-medium">
            {dateRangeStr}
          </p>
        </div>

        {/* Chart */}
        <div className="h-64 px-2 mb-12">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#8E8E93', fontSize: 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#8E8E93', fontSize: 12, fontWeight: 500 }}
                domain={[0, 6]}
                ticks={[0, 2, 4, 6]}
              />
              <Bar dataKey="taken" radius={[4, 4, 0, 0]} barSize={32}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.taken > 0 ? '#00E2FF' : '#F2F2F7'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Registro de Hoje */}
        <div className="px-5 mb-12">
          <h3 className="text-3xl font-bold mb-6">Registro de Hoje</h3>
          <div className="space-y-6">
            {todayLogs.map((log, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-sm overflow-hidden">
                    <div className="rotate-45 flex">
                      <div className="w-3 h-2 rounded-l-full" style={{ backgroundColor: medication.colors?.left }} />
                      <div className="w-3 h-2 rounded-r-full" style={{ backgroundColor: medication.colors?.right }} />
                    </div>
                  </div>
                  <span className="text-2xl font-bold">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <button className="text-blue-500">
                  <Plus size={28} strokeWidth={2.5} />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-4">
              <span className="text-xl font-medium">Registrar Nova Dose</span>
              <button onClick={() => onLog('Taken')} className="text-blue-500">
                <Plus size={28} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Horários */}
        <div className="px-5 mb-12">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-3xl font-bold">Horários</h3>
            <button className="text-blue-500 font-medium text-lg">Editar</button>
          </div>
          <div className="space-y-2">
            <p className="text-xl font-bold">{medication.schedule?.frequency}</p>
            {medication.schedule?.times.map((time, i) => (
              <p key={i} className="text-xl font-medium text-apple-text-secondary">
                {time} <span className="text-apple-text-muted ml-2">1 aplicação</span>
              </p>
            ))}
          </div>
          <button className="text-blue-500 font-medium text-lg mt-6">Editar</button>
        </div>

        {/* Detalhes */}
        <div className="px-5 mb-12">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-3xl font-bold">Detalhes</h3>
            <button className="text-blue-500 font-medium text-lg">Editar</button>
          </div>
          <div className="flex flex-col items-start gap-4">
            <div 
              className="w-24 h-24 rounded-3xl flex items-center justify-center relative overflow-hidden shadow-sm"
              style={{ background: `linear-gradient(135deg, ${medication.colors?.background || '#F2F2F7'} 0%, #FFFFFF 100%)` }}
            >
              <div className="relative flex items-center justify-center rotate-45">
                <div 
                  className="w-12 h-6 rounded-l-full shadow-sm" 
                  style={{ backgroundColor: medication.colors?.left || '#FF3B30' }} 
                />
                <div 
                  className="w-12 h-6 rounded-r-full shadow-sm" 
                  style={{ backgroundColor: medication.colors?.right || '#FF9500' }} 
                />
              </div>
            </div>
            <div>
              <h4 className="text-2xl font-bold">{medication.name}</h4>
              <p className="text-apple-text-secondary text-lg">{medication.type}</p>
              <p className="text-apple-text-secondary text-lg">{medication.intensity} {medication.unit}</p>
            </div>
          </div>
        </div>

        {/* Sobre */}
        <div className="px-5 mb-12">
          <h3 className="text-3xl font-bold mb-6">Sobre</h3>
          <div className="space-y-2">
            <p className="text-xl font-bold">Efeitos Colaterais</p>
            <p className="text-xl font-medium text-apple-text-muted">Nenhuma informação disponível</p>
          </div>
        </div>

        {/* Opções */}
        <div className="px-5 mb-12">
          <h3 className="text-3xl font-bold mb-6">Opções</h3>
          <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border mb-12">
            <div className="p-4 flex justify-between items-center active:bg-apple-background transition-colors cursor-pointer">
              <span className="text-lg font-medium">Mostrar Todos os Dados</span>
              <ChevronRight size={20} className="text-apple-text-muted" />
            </div>
            <div className="p-4 flex justify-between items-center active:bg-apple-background transition-colors cursor-pointer">
              <span className="text-lg font-medium">Fontes de Dados e Acesso</span>
              <ChevronRight size={20} className="text-apple-text-muted" />
            </div>
          </div>
          
          <div className="space-y-8">
            <button 
              onClick={() => onArchive(medication.id)}
              className="text-blue-500 font-medium text-xl block"
            >
              Arquivar Medicamento
            </button>
            <button 
              onClick={() => onDelete(medication.id)}
              className="text-red-500 font-medium text-xl block"
            >
              Apagar Medicamento
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const EditMedicationListView: React.FC<{ 
  medications: Medication[], 
  onClose: () => void,
  onUpdate: (id: string, data: Partial<Medication>) => void,
  onDelete: (id: string) => void,
  onReorder: (meds: Medication[]) => void,
  onAdd: () => void
}> = ({ medications, onClose, onUpdate, onDelete, onReorder, onAdd }) => {
  const [activeMeds, setActiveMeds] = useState<Medication[]>([]);
  const archivedMeds = medications.filter(m => m.archived);

  useEffect(() => {
    setActiveMeds(medications.filter(m => !m.archived).sort((a, b) => (a.order || 0) - (b.order || 0)));
  }, [medications]);

  const handleReorder = (newOrder: Medication[]) => {
    setActiveMeds(newOrder);
    onReorder(newOrder);
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="fixed inset-0 bg-white z-[200] flex flex-col"
    >
      <div className="p-5 flex justify-between items-center">
        <div className="w-8" />
        <h2 className="text-lg font-bold">Editar Lista de Medicamentos</h2>
        <button onClick={onClose} className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-sm">
          <Check size={24} />
        </button>
      </div>

      <div className="flex-grow min-h-0 overflow-y-auto px-5 pt-8">
        <button 
          onClick={onAdd}
          className="text-blue-500 font-medium text-lg mb-10 block"
        >
          Adicionar Medicamento
        </button>

        <div className="mb-10">
          <h3 className="text-apple-text-muted font-bold text-lg mb-6">Medicamentos Atuais</h3>
          <Reorder.Group axis="y" values={activeMeds} onReorder={handleReorder} className="space-y-6">
            {activeMeds.map((m) => (
              <Reorder.Item key={m.id} value={m} className="flex items-center gap-4 bg-white">
                <button 
                  onClick={() => onUpdate(m.id, { archived: true })}
                  className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white shadow-sm shrink-0"
                >
                  <Archive size={16} />
                </button>
                <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-sm overflow-hidden shrink-0">
                  <div className="rotate-45 flex">
                    <div className="w-3 h-2 rounded-l-full" style={{ backgroundColor: m.colors?.left }} />
                    <div className="w-3 h-2 rounded-r-full" style={{ backgroundColor: m.colors?.right }} />
                  </div>
                </div>
                <div className="flex-grow min-w-0">
                  <h4 className="font-bold text-lg truncate">{m.name}</h4>
                  <p className="text-apple-text-secondary truncate">{m.type}, {m.intensity} {m.unit}</p>
                </div>
                <div className="text-apple-text-muted cursor-grab active:cursor-grabbing shrink-0">
                  <GripVertical size={24} />
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
          {activeMeds.length === 0 && (
            <p className="text-apple-text-muted italic">Nenhum medicamento ativo.</p>
          )}
        </div>

        <div className="mb-10">
          <h3 className="text-apple-text-muted font-bold text-lg mb-6">Medicamentos Arquivados</h3>
          <div className="space-y-6">
            {archivedMeds.map((m, i) => (
              <div key={m.id} className="flex items-center gap-4 opacity-60">
                <button 
                  onClick={() => onDelete(m.id)}
                  className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center text-white shadow-sm"
                >
                  <Trash2 size={16} />
                </button>
                <div className="w-12 h-12 rounded-full bg-apple-border flex items-center justify-center text-white shadow-sm overflow-hidden">
                  <div className="rotate-45 flex">
                    <div className="w-3 h-2 rounded-l-full" style={{ backgroundColor: m.colors?.left }} />
                    <div className="w-3 h-2 rounded-r-full" style={{ backgroundColor: m.colors?.right }} />
                  </div>
                </div>
                <div className="flex-grow">
                  <h4 className="font-bold text-lg">{m.name}</h4>
                  <p className="text-apple-text-secondary">{m.type}, {m.intensity} {m.unit}</p>
                </div>
                <button 
                  onClick={() => onUpdate(m.id, { archived: false })}
                  className="text-blue-500 font-bold"
                >
                  Restaurar
                </button>
              </div>
            ))}
            {archivedMeds.length === 0 && (
              <div className="apple-card p-6 text-center text-apple-text-muted">
                Nenhum
              </div>
            )}
          </div>
        </div>

        <p className="text-sm text-apple-text-muted leading-relaxed">
          Os medicamentos arquivados não aparecerão na lista de medicamentos nem nos horários e não poderão ser adicionados aos favoritos.
        </p>
      </div>
    </motion.div>
  );
};

const ActivityView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { samples, addSample, activityGoals, updateActivityGoals } = useHealth();
  const [showAddSteps, setShowAddSteps] = useState(false);
  const [showAddDistance, setShowAddDistance] = useState(false);
  const [showAddEnergy, setShowAddEnergy] = useState(false);
  const [showEditGoals, setShowEditGoals] = useState(false);
  
  const [stepsValue, setStepsValue] = useState('');
  const [distanceValue, setDistanceValue] = useState('');
  const [energyValue, setEnergyValue] = useState('');

  const [editGoals, setEditGoals] = useState<ActivityGoals>(activityGoals);

  useEffect(() => {
    setEditGoals(activityGoals);
  }, [activityGoals]);

  const today = new Date().toDateString();
  
  const todaySteps = samples
    .filter(s => s.type === 'steps' && new Date(s.timestamp).toDateString() === today)
    .reduce((acc, s) => acc + s.value, 0);

  const todayDistance = samples
    .filter(s => s.type === 'distance' && new Date(s.timestamp).toDateString() === today)
    .reduce((acc, s) => acc + s.value, 0);

  const todayEnergy = samples
    .filter(s => s.type === 'active_energy' && new Date(s.timestamp).toDateString() === today)
    .reduce((acc, s) => acc + s.value, 0);

  const handleAddSteps = async () => {
    if (!stepsValue) return;
    await addSample('steps', parseFloat(stepsValue), 'passos');
    setShowAddSteps(false);
    setStepsValue('');
  };

  const handleAddDistance = async () => {
    if (!distanceValue) return;
    await addSample('distance', parseFloat(distanceValue), 'km');
    setShowAddDistance(false);
    setDistanceValue('');
  };

  const handleAddEnergy = async () => {
    if (!energyValue) return;
    await addSample('active_energy', parseFloat(energyValue), 'kcal');
    setShowAddEnergy(false);
    setEnergyValue('');
  };

  const handleSaveGoals = async () => {
    await updateActivityGoals(editGoals);
    setShowEditGoals(false);
  };

  return (
    <div className="pb-32 pt-8 bg-apple-background min-h-screen">
      <div className="px-5 flex items-center justify-between mb-8">
        <button onClick={onBack} className="text-blue-500">
          <ChevronLeft size={32} />
        </button>
        <h1 className="text-xl font-bold text-apple-text-primary">Atividade</h1>
        <button onClick={() => setShowEditGoals(true)} className="text-blue-500 font-bold text-sm">Metas</button>
      </div>

      <div className="px-5 space-y-6">
        {/* Rings Simulation or Summary Cards */}
        <div className="apple-card p-6 bg-gradient-to-br from-rose-500 to-orange-500 text-white border-none shadow-xl shadow-rose-500/20">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Hoje</p>
              <h2 className="text-3xl font-black tracking-tight">Atividade</h2>
            </div>
            <Activity size={32} className="opacity-80" />
          </div>
          
          <div className="space-y-4">
            <div 
              onClick={() => setShowAddSteps(true)}
              className="flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 bg-white/30 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{ height: `${Math.min((todaySteps/activityGoals.steps)*100, 100)}%` }} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Passos</p>
                  <p className="text-xl font-black">{todaySteps.toLocaleString()} <span className="text-xs font-bold opacity-70">/ {activityGoals.steps.toLocaleString()}</span></p>
                </div>
              </div>
            </div>

            <div 
              onClick={() => setShowAddDistance(true)}
              className="flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 bg-white/30 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{ height: `${Math.min((todayDistance/activityGoals.distance)*100, 100)}%` }} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Distância</p>
                  <p className="text-xl font-black">{todayDistance.toFixed(2)} <span className="text-xs font-bold opacity-70">/ {activityGoals.distance} km</span></p>
                </div>
              </div>
            </div>

            <div 
              onClick={() => setShowAddEnergy(true)}
              className="flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 bg-white/30 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{ height: `${Math.min((todayEnergy/activityGoals.active_energy)*100, 100)}%` }} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Energia Ativa</p>
                  <p className="text-xl font-black">{todayEnergy} <span className="text-xs font-bold opacity-70">/ {activityGoals.active_energy} kcal</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* History Section */}
        <div>
          <h2 className="text-lg font-black text-apple-text-primary tracking-tight mb-4 px-1">Histórico Recente</h2>
          <div className="space-y-3">
            {samples.filter(s => ['steps', 'distance', 'active_energy'].includes(s.type)).slice(0, 10).map(s => (
              <div key={s.id} className="apple-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${s.type === 'steps' ? 'bg-rose-50 text-rose-500' : s.type === 'distance' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'}`}>
                    {s.type === 'steps' ? <Activity size={18} /> : s.type === 'distance' ? <Activity size={18} /> : <Flame size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-apple-text-primary">
                      {s.type === 'steps' ? 'Passos' : s.type === 'distance' ? 'Distância' : 'Energia Ativa'}
                    </p>
                    <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest">
                      {new Date(s.timestamp).toLocaleDateString('pt-BR')} às {new Date(s.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <p className="font-black text-apple-text-primary">{s.value} <span className="text-[10px] font-bold text-apple-text-muted uppercase">{s.unit}</span></p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddSteps || showAddDistance || showAddEnergy ? (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => { setShowAddSteps(false); setShowAddDistance(false); setShowAddEnergy(false); }}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black text-center mb-6">
                {showAddSteps ? 'Registrar Passos' : showAddDistance ? 'Registrar Distância' : 'Registrar Energia'}
              </h3>
              <div className="relative mb-6">
                <input 
                  type="number"
                  value={showAddSteps ? stepsValue : showAddDistance ? distanceValue : energyValue}
                  onChange={e => {
                    if (showAddSteps) setStepsValue(e.target.value);
                    else if (showAddDistance) setDistanceValue(e.target.value);
                    else setEnergyValue(e.target.value);
                  }}
                  className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-rose-500 font-black text-center text-2xl"
                  placeholder="0"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-apple-text-muted">
                  {showAddSteps ? 'passos' : showAddDistance ? 'km' : 'kcal'}
                </span>
              </div>
              <button 
                onClick={showAddSteps ? handleAddSteps : showAddDistance ? handleAddDistance : handleAddEnergy}
                className="w-full bg-rose-500 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
              >
                Salvar
              </button>
            </motion.div>
          </motion.div>
        ) : showEditGoals ? (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setShowEditGoals(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black text-center mb-6">Editar Metas Diárias</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest ml-1">Passos</label>
                  <input 
                    type="number"
                    value={editGoals.steps}
                    onChange={e => setEditGoals({ ...editGoals, steps: parseInt(e.target.value) || 0 })}
                    className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-rose-500 font-black text-center text-xl"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest ml-1">Distância (km)</label>
                  <input 
                    type="number"
                    value={editGoals.distance}
                    onChange={e => setEditGoals({ ...editGoals, distance: parseFloat(e.target.value) || 0 })}
                    className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-rose-500 font-black text-center text-xl"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest ml-1">Energia (kcal)</label>
                  <input 
                    type="number"
                    value={editGoals.active_energy}
                    onChange={e => setEditGoals({ ...editGoals, active_energy: parseInt(e.target.value) || 0 })}
                    className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-rose-500 font-black text-center text-xl"
                  />
                </div>
              </div>
              <button 
                onClick={handleSaveGoals}
                className="w-full bg-rose-500 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
              >
                Salvar Metas
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

const VitalSignsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { samples, addSample } = useHealth();
  const [showAddHeart, setShowAddHeart] = useState(false);
  const [showAddBP, setShowAddBP] = useState(false);
  const [showAddOxygen, setShowAddOxygen] = useState(false);
  const [showAddTemp, setShowAddTemp] = useState(false);
  
  const [heartValue, setHeartValue] = useState('');
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [oxygenValue, setOxygenValue] = useState('');
  const [tempValue, setTempValue] = useState('');

  const latestHeart = samples.find(s => s.type === 'heart_rate');
  const latestBP_sys = samples.find(s => s.type === 'blood_pressure_sys');
  const latestBP_dia = samples.find(s => s.type === 'blood_pressure_dia');
  const latestOxygen = samples.find(s => s.type === 'oxygen_saturation');
  const latestTemp = samples.find(s => s.type === 'temperature');

  const handleAddHeart = async () => {
    if (!heartValue) return;
    await addSample('heart_rate', parseFloat(heartValue), 'bpm');
    setShowAddHeart(false);
    setHeartValue('');
  };

  const handleAddBP = async () => {
    if (!bpSys || !bpDia) return;
    await addSample('blood_pressure_sys', parseFloat(bpSys), 'mmHg');
    await addSample('blood_pressure_dia', parseFloat(bpDia), 'mmHg');
    setShowAddBP(false);
    setBpSys('');
    setBpDia('');
  };

  const handleAddOxygen = async () => {
    if (!oxygenValue) return;
    await addSample('oxygen_saturation', parseFloat(oxygenValue), '%');
    setShowAddOxygen(false);
    setOxygenValue('');
  };

  const handleAddTemp = async () => {
    if (!tempValue) return;
    await addSample('temperature', parseFloat(tempValue), '°C');
    setShowAddTemp(false);
    setTempValue('');
  };

  return (
    <div className="pb-32 pt-8 bg-apple-background min-h-screen">
      <div className="px-5 flex items-center justify-between mb-8">
        <button onClick={onBack} className="text-blue-500">
          <ChevronLeft size={32} />
        </button>
        <h1 className="text-xl font-bold text-apple-text-primary">Sinais Vitais</h1>
        <div className="w-8" />
      </div>

      <div className="px-5 space-y-4">
        {/* Heart Rate Card */}
        <div 
          onClick={() => setShowAddHeart(true)}
          className="apple-card p-5 flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500">
              <Heart size={24} fill="currentColor" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-0.5">Batimentos</p>
              <p className="text-2xl font-black text-apple-text-primary">{latestHeart?.value || '--'} <span className="text-sm font-bold text-apple-text-muted uppercase">bpm</span></p>
              <p className="text-[10px] font-bold text-apple-text-muted">
                {latestHeart ? `Último: ${new Date(latestHeart.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Nenhum registro'}
              </p>
            </div>
          </div>
        </div>

        {/* Blood Pressure Card */}
        <div 
          onClick={() => setShowAddBP(true)}
          className="apple-card p-5 flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-0.5">Pressão Arterial</p>
              <p className="text-2xl font-black text-apple-text-primary">
                {latestBP_sys?.value || '--'}/{latestBP_dia?.value || '--'} <span className="text-sm font-bold text-apple-text-muted uppercase">mmHg</span>
              </p>
              <p className="text-[10px] font-bold text-apple-text-muted">
                {latestBP_sys ? `Último: ${new Date(latestBP_sys.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Nenhum registro'}
              </p>
            </div>
          </div>
        </div>

        {/* Oxygen Card */}
        <div 
          onClick={() => setShowAddOxygen(true)}
          className="apple-card p-5 flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500">
              <Wind size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-0.5">Oxigênio</p>
              <p className="text-2xl font-black text-apple-text-primary">{latestOxygen?.value || '--'} <span className="text-sm font-bold text-apple-text-muted uppercase">%</span></p>
              <p className="text-[10px] font-bold text-apple-text-muted">
                {latestOxygen ? `Último: ${new Date(latestOxygen.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Nenhum registro'}
              </p>
            </div>
          </div>
        </div>

        {/* Temperature Card */}
        <div 
          onClick={() => setShowAddTemp(true)}
          className="apple-card p-5 flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-0.5">Temperatura</p>
              <p className="text-2xl font-black text-apple-text-primary">{latestTemp?.value || '--'} <span className="text-sm font-bold text-apple-text-muted uppercase">°C</span></p>
              <p className="text-[10px] font-bold text-apple-text-muted">
                {latestTemp ? `Último: ${new Date(latestTemp.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Nenhum registro'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddHeart && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setShowAddHeart(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black text-center mb-6">Batimentos</h3>
              <div className="relative mb-6">
                <input 
                  type="number"
                  value={heartValue}
                  onChange={e => setHeartValue(e.target.value)}
                  className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-rose-500 font-black text-center text-2xl"
                  placeholder="0"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-apple-text-muted uppercase">bpm</span>
              </div>
              <button onClick={handleAddHeart} className="w-full bg-rose-500 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">Salvar</button>
            </motion.div>
          </motion.div>
        )}

        {showAddBP && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setShowAddBP(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black text-center mb-6">Pressão Arterial</h3>
              <div className="space-y-4 mb-6">
                <div className="relative">
                  <input 
                    type="number"
                    value={bpSys}
                    onChange={e => setBpSys(e.target.value)}
                    className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-blue-500 font-black text-center text-2xl"
                    placeholder="Sistólica"
                    autoFocus
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-apple-text-muted text-[10px]">SYS</span>
                </div>
                <div className="relative">
                  <input 
                    type="number"
                    value={bpDia}
                    onChange={e => setBpDia(e.target.value)}
                    className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-blue-500 font-black text-center text-2xl"
                    placeholder="Diastólica"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-apple-text-muted text-[10px]">DIA</span>
                </div>
              </div>
              <button onClick={handleAddBP} className="w-full bg-blue-500 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">Salvar</button>
            </motion.div>
          </motion.div>
        )}

        {showAddOxygen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setShowAddOxygen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black text-center mb-6">Oxigênio</h3>
              <div className="relative mb-6">
                <input 
                  type="number"
                  value={oxygenValue}
                  onChange={e => setOxygenValue(e.target.value)}
                  className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-indigo-500 font-black text-center text-2xl"
                  placeholder="0"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-apple-text-muted">%</span>
              </div>
              <button onClick={handleAddOxygen} className="w-full bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">Salvar</button>
            </motion.div>
          </motion.div>
        )}

        {showAddTemp && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setShowAddTemp(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black text-center mb-6">Temperatura</h3>
              <div className="relative mb-6">
                <input 
                  type="number"
                  step="0.1"
                  value={tempValue}
                  onChange={e => setTempValue(e.target.value)}
                  className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-orange-500 font-black text-center text-2xl"
                  placeholder="00.0"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-apple-text-muted">°C</span>
              </div>
              <button onClick={handleAddTemp} className="w-full bg-orange-500 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">Salvar</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NutritionView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { nutritionLogs, addNutritionLog, deleteNutritionLog, samples, addSample } = useHealth();
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showAddWater, setShowAddWater] = useState(false);
  const [showAddWeight, setShowAddWeight] = useState(false);
  
  const [newMeal, setNewMeal] = useState<Omit<NutritionLog, 'id' | 'timestamp'>>({
    mealType: 'Almoço',
    content: '',
    calories: undefined,
    notes: ''
  });

  const [waterAmount, setWaterAmount] = useState('250');
  const [weightValue, setWeightValue] = useState('');

  const mealTypes: NutritionLog['mealType'][] = ['Café da Manhã', 'Almoço', 'Jantar', 'Lanche'];

  const handleAddMeal = async () => {
    if (!newMeal.content) return;
    await addNutritionLog({
      ...newMeal,
      timestamp: new Date().toISOString()
    });
    setShowAddMeal(false);
    setNewMeal({ mealType: 'Almoço', content: '', calories: undefined, notes: '' });
  };

  const handleAddWater = async () => {
    if (!waterAmount) return;
    await addSample('water_intake', parseFloat(waterAmount), 'ml');
    setShowAddWater(false);
  };

  const handleAddWeight = async () => {
    if (!weightValue) return;
    await addSample('weight', parseFloat(weightValue), 'kg');
    setShowAddWeight(false);
    setWeightValue('');
  };

  const todayWater = samples
    .filter(s => s.type === 'water_intake' && new Date(s.timestamp).toDateString() === new Date().toDateString())
    .reduce((acc, s) => acc + s.value, 0);

  const latestWeight = samples.filter(s => s.type === 'weight')[0];

  return (
    <div className="pb-32 pt-8 bg-apple-background min-h-screen">
      <div className="px-5 flex items-center justify-between mb-8">
        <button onClick={onBack} className="text-blue-500">
          <ChevronLeft size={32} />
        </button>
        <h1 className="text-xl font-bold">Nutrição</h1>
        <div className="w-8" />
      </div>

      <div className="px-5 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div 
            onClick={() => setShowAddWater(true)}
            className="apple-card p-4 bg-blue-50/50 border-blue-100 cursor-pointer active:scale-95 transition-transform"
          >
            <div className="flex items-center gap-2 mb-2 text-blue-500">
              <Droplets size={18} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Água Hoje</span>
            </div>
            <p className="text-2xl font-black text-apple-text-primary">{todayWater} <span className="text-sm font-bold text-apple-text-muted">ml</span></p>
          </div>

          <div 
            onClick={() => setShowAddWeight(true)}
            className="apple-card p-4 bg-green-50/50 border-green-100 cursor-pointer active:scale-95 transition-transform"
          >
            <div className="flex items-center gap-2 mb-2 text-green-600">
              <Scale size={18} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Peso Atual</span>
            </div>
            <p className="text-2xl font-black text-apple-text-primary">{latestWeight?.value || '--'} <span className="text-sm font-bold text-apple-text-muted">kg</span></p>
          </div>
        </div>

        {/* Meals Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-black text-apple-text-primary tracking-tight">Diário Alimentar</h2>
            <button 
              onClick={() => setShowAddMeal(true)}
              className="text-blue-500 text-sm font-bold flex items-center gap-1"
            >
              <Plus size={16} />
              Refeição
            </button>
          </div>

          <div className="space-y-4">
            {nutritionLogs.length === 0 ? (
              <div className="apple-card p-8 text-center">
                <Utensils size={32} className="mx-auto mb-2 text-apple-text-muted opacity-30" />
                <p className="text-apple-text-muted font-bold text-sm">Nenhuma refeição registrada</p>
              </div>
            ) : (
              nutritionLogs.map(log => (
                <div key={log.id} className="apple-card p-4 flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500">
                    <Utensils size={24} />
                  </div>
                  <div className="flex-grow">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">{log.mealType}</p>
                        <h3 className="font-bold text-apple-text-primary text-sm">{log.content}</h3>
                      </div>
                      <button onClick={() => deleteNutritionLog(log.id)} className="text-apple-text-muted">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-[10px] text-apple-text-muted font-bold">
                        {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {log.calories && (
                        <p className="text-[10px] text-apple-text-muted font-bold">• {log.calories} kcal</p>
                      )}
                    </div>
                    {log.notes && (
                      <p className="text-[10px] text-apple-text-muted mt-1 italic">Obs: {log.notes}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddMeal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-end justify-center p-4"
            onClick={() => setShowAddMeal(false)}
          >
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="bg-white w-full max-w-md rounded-[32px] p-8 pb-12 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black text-apple-text-primary tracking-tight">Nova Refeição</h3>
                <button onClick={() => setShowAddMeal(false)} className="bg-apple-border/50 p-2 rounded-full"><X size={20} /></button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">Tipo</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                    {mealTypes.map(t => (
                      <button 
                        key={t}
                        onClick={() => setNewMeal({ ...newMeal, mealType: t })}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                          newMeal.mealType === t ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-apple-border/30 text-apple-text-secondary'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">O que você comeu?</label>
                  <input 
                    type="text"
                    value={newMeal.content}
                    onChange={e => setNewMeal({ ...newMeal, content: e.target.value })}
                    className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-orange-500 font-bold"
                    placeholder="Ex: Salada de frutas com iogurte"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">Calorias (opcional)</label>
                    <input 
                      type="number"
                      value={newMeal.calories || ''}
                      onChange={e => setNewMeal({ ...newMeal, calories: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-orange-500 font-bold"
                      placeholder="Ex: 350"
                    />
                  </div>
                </div>

                <button 
                  onClick={handleAddMeal}
                  disabled={!newMeal.content}
                  className="w-full bg-orange-500 text-white font-black py-5 rounded-[24px] shadow-xl shadow-orange-500/30 active:scale-95 transition-transform disabled:opacity-50"
                >
                  Registrar Refeição
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showAddWater && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setShowAddWater(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black text-center mb-6">Beber Água</h3>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {['150', '250', '350', '500'].map(amount => (
                  <button 
                    key={amount}
                    onClick={() => { setWaterAmount(amount); }}
                    className={`py-3 rounded-2xl font-bold transition-all ${waterAmount === amount ? 'bg-blue-500 text-white shadow-lg' : 'bg-apple-background text-apple-text-primary'}`}
                  >
                    {amount}ml
                  </button>
                ))}
              </div>
              <button 
                onClick={handleAddWater}
                className="w-full bg-blue-500 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
              >
                Confirmar
              </button>
            </motion.div>
          </motion.div>
        )}

        {showAddWeight && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setShowAddWeight(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black text-center mb-6">Registrar Peso</h3>
              <div className="relative mb-6">
                <input 
                  type="number"
                  step="0.1"
                  value={weightValue}
                  onChange={e => setWeightValue(e.target.value)}
                  className="w-full p-4 bg-apple-background rounded-2xl border-none focus:ring-2 focus:ring-green-500 font-black text-center text-2xl"
                  placeholder="00.0"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-apple-text-muted">kg</span>
              </div>
              <button 
                onClick={handleAddWeight}
                disabled={!weightValue}
                className="w-full bg-green-600 text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                Salvar Peso
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MedicationsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { medications, addMedication, addMedicationLog, medicationLogs, updateMedication, deleteMedication, reorderMedications } = useHealth();
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [showEditList, setShowEditList] = useState(false);
  const [selectedMedicationDetails, setSelectedMedicationDetails] = useState<Medication | null>(null);
  const [selectedLogMedication, setSelectedLogMedication] = useState<{ med: Medication, time: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
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

  const getDaysOfWeek = () => {
    const days = [];
    const start = new Date(selectedDate);
    start.setDate(selectedDate.getDate() - 3);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const days = getDaysOfWeek();
  const dayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  const MedicationIcon = ({ colors, shape, size = "md" }: { colors?: Medication['colors'], shape?: string, size?: "sm" | "md" | "lg" }) => {
    const s = size === "sm" ? "w-10 h-10" : size === "lg" ? "w-24 h-24" : "w-16 h-16";
    const iconSize = size === "sm" ? 20 : size === "lg" ? 48 : 32;
    
    return (
      <div 
        className={`${s} rounded-3xl flex items-center justify-center relative overflow-hidden shadow-sm`}
        style={{ background: `linear-gradient(135deg, ${colors?.background || '#F2F2F7'} 0%, #FFFFFF 100%)` }}
      >
        <div className="relative flex items-center justify-center rotate-45">
          <div 
            className="w-8 h-4 rounded-l-full shadow-sm" 
            style={{ backgroundColor: colors?.left || '#FF3B30' }} 
          />
          <div 
            className="w-8 h-4 rounded-r-full shadow-sm" 
            style={{ backgroundColor: colors?.right || '#FF9500' }} 
          />
        </div>
      </div>
    );
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
              {step}
            </p>
            <p className="text-[10px] text-apple-text-muted">
              {formData.intensity || '1'} {formData.unit || 'Cápsula'}, {formData.type || '1%'}
            </p>
          </div>
          <button onClick={() => setShowAddFlow(false)} className="text-apple-text-muted">
            <X size={24} />
          </button>
        </div>

        <div className="flex-grow min-h-0 overflow-y-auto p-6">
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
                <h2 className="text-3xl font-bold mb-8">Defina Horários</h2>
                
                <div className="mb-8">
                  <p className="font-bold text-lg mb-4">Quando você tomará?</p>
                  <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-apple-border">
                    <span className="text-lg font-medium">Todos os Dias</span>
                    <button className="text-blue-500 font-semibold">Alterar</button>
                  </div>
                </div>
                <div className="mb-8">
                  <p className="font-bold text-lg mb-4">Que horas?</p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-apple-border">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white">
                          <X size={16} strokeWidth={3} />
                        </div>
                        <div className="bg-apple-background px-4 py-2 rounded-xl">
                          <span className="text-xl font-bold">01:55</span>
                        </div>
                      </div>
                      <span className="text-blue-500 font-semibold">1 cápsula</span>
                    </div>
                    
                    <button className="flex items-center gap-3 text-blue-500 font-bold px-1">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white">
                        <Plus size={18} strokeWidth={3} />
                      </div>
                      <span className="text-lg">Adicione um Horário</span>
                    </button>
                  </div>
                </div>
                <p className="text-sm text-apple-text-muted mb-10 leading-relaxed">
                  Se você agendar um horário, o app Saúde enviará uma notificação para você tomar os seus medicamentos.
                </p>

                <div className="mb-10">
                  <h3 className="text-2xl font-bold mb-6">Duração</h3>
                  <div className="grid grid-cols-2 gap-8 mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-wider mb-2">Data de Início</p>
                      <p className="text-lg font-semibold">
                        {new Date(formData.duration?.startDate || '').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
                        {new Date(formData.duration?.startDate || '').toDateString() === new Date().toDateString() ? ' (Hoje)' : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-wider mb-2">Data do Término</p>
                      <p className={`text-lg font-semibold ${formData.duration?.endDate ? '' : 'text-apple-text-muted'}`}>
                        {formData.duration?.endDate ? new Date(formData.duration.endDate).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }) : 'Nenhuma'}
                      </p>
                    </div>
                  </div>
                  <button className="text-blue-500 font-bold text-lg">Editar</button>
                </div>

                <button onClick={saveMedication} className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">
                  Seguinte
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {step < 6 && step !== 4 && step !== 5 && (
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
    <div className="pb-32 pt-8 bg-white min-h-screen">
      {/* Header */}
      <div className="px-5 flex items-center justify-between mb-8">
        <button onClick={onBack} className="text-blue-500">
          <ChevronLeft size={32} />
        </button>
        <h1 className="text-xl font-bold">Medicamentos</h1>
        <div className="w-8" />
      </div>

      {/* Date Selector */}
      <div className="px-5 mb-10">
        <h2 className="text-2xl font-bold text-center mb-6">
          Hoje, {selectedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
        </h2>
        <div className="flex justify-between items-center px-2">
          {days.map((d, i) => {
            const isSelected = d.toDateString() === selectedDate.toDateString();
            return (
              <div key={i} className="flex flex-col items-center gap-3">
                <span className={`text-[10px] font-bold ${isSelected ? 'text-black' : 'text-apple-text-muted'}`}>
                  {dayNames[d.getDay()]}
                </span>
                <button 
                  onClick={() => setSelectedDate(d)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all relative ${isSelected ? 'bg-black text-white' : 'text-apple-text-primary'}`}
                >
                  {isSelected && (
                    <div className="absolute -top-6 text-black">
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-black" />
                    </div>
                  )}
                  <span className="font-bold text-sm">{d.getDate()}</span>
                </button>
                {/* Blue dot for logged meds could go here */}
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Registrar Section */}
      <div className="px-5 mb-12">
        <h3 className="text-2xl font-bold mb-6 tracking-tight">Registrar</h3>
        <div className="space-y-8">
          {medications
            .filter(m => !m.isSOS && m.active && !m.archived)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(m => (
            <div key={m.id} className="space-y-4">
              {m.schedule?.times.map((time, idx) => {
                const log = medicationLogs.find(l => l.medicationId === m.id && new Date(l.timestamp).toDateString() === selectedDate.toDateString());
                return (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedLogMedication({ med: m, time })}
                    className="flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-16">
                        <p className="text-xl font-bold text-apple-text-primary">{time}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-sm overflow-hidden">
                          <div className="rotate-45 flex">
                            <div className="w-3 h-2 rounded-l-full" style={{ backgroundColor: m.colors?.left }} />
                            <div className="w-3 h-2 rounded-r-full" style={{ backgroundColor: m.colors?.right }} />
                          </div>
                        </div>
                        <p className="text-lg font-medium text-apple-text-primary">{m.name}</p>
                      </div>
                    </div>
                    {log ? (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-blue-500">
                        <CheckCircle size={28} />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-blue-500 active:scale-90 transition-transform">
                        <Plus size={28} strokeWidth={2.5} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          
          <div className="flex items-center justify-between pt-4">
            <p className="text-lg font-medium text-apple-text-primary">Medicamentos de Uso Esporádico</p>
            <button className="w-10 h-10 rounded-full flex items-center justify-center text-blue-500">
              <Plus size={28} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Seus Medicamentos Section */}
      <div className="px-5 mb-12">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold tracking-tight">Seus Medicamentos</h3>
          <button 
            onClick={() => setShowEditList(true)}
            className="text-blue-500 font-medium text-lg"
          >
            Editar
          </button>
        </div>
        <div className="space-y-4">
          {medications
            .filter(m => !m.archived)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(m => (
            <div 
              key={m.id} 
              onClick={() => setSelectedMedicationDetails(m)}
              className="apple-card p-0 overflow-hidden flex items-center relative group active:scale-[0.98] transition-transform cursor-pointer"
            >
              <div className="w-32 h-32 shrink-0">
                <MedicationIcon colors={m.colors} shape={m.shape} size="lg" />
              </div>
              <div className="flex-grow py-4 pr-10">
                <h4 className="text-xl font-bold mb-0.5">{m.name}</h4>
                <p className="text-apple-text-secondary font-medium">{m.type}</p>
                <p className="text-apple-text-secondary font-medium">{m.intensity} {m.unit}</p>
                <div className="flex items-center gap-1.5 mt-2 text-apple-text-muted">
                  <Calendar size={14} />
                  <span className="text-sm font-medium">{m.schedule?.frequency}</span>
                </div>
              </div>
              <ChevronRight size={24} className="text-apple-text-muted absolute right-4" />
            </div>
          ))}
          <button 
            onClick={() => setShowAddFlow(true)}
            className="text-blue-500 font-medium text-lg mt-4 block"
          >
            Adicionar Medicamento
          </button>
        </div>
      </div>

      {/* Informações Sobre Medicamentos Section */}
      <div className="px-5 mb-12">
        <h3 className="text-2xl font-bold mb-6 tracking-tight">Informações Sobre Medicamentos</h3>
        <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
          {[
            { label: 'Interações de Medicamentos', value: 'Nenhuma Encontrada' },
            { label: 'Gravidez' },
            { label: 'Lactação' }
          ].map((item, i) => (
            <div key={i} className="p-4 flex justify-between items-center active:bg-apple-background transition-colors cursor-pointer">
              <div>
                <p className="text-lg font-medium">{item.label}</p>
                {item.value && <p className="text-apple-text-muted">{item.value}</p>}
              </div>
              <ChevronRight size={20} className="text-apple-text-muted" />
            </div>
          ))}
        </div>
        <p className="text-sm text-apple-text-muted mt-4 px-1">
          Informações adicionais estão disponíveis nas bulas dos medicamentos.
        </p>
      </div>

      {/* Sobre Medicamentos Section */}
      <div className="px-5 mb-12">
        <h3 className="text-2xl font-bold mb-6 tracking-tight">Sobre Medicamentos</h3>
        <div className="apple-card p-0 overflow-hidden mb-4">
          <div className="bg-slate-900 aspect-[4/3] p-8 grid grid-cols-3 gap-6 items-center justify-items-center">
            <div className="text-white/80"><Activity size={40} /></div>
            <div className="text-white/80"><Pill size={40} /></div>
            <div className="text-white/80"><Utensils size={40} /></div>
            <div className="text-white/80"><Heart size={40} /></div>
            <div className="text-white/80"><Smartphone size={40} /></div>
            <div className="text-white/80"><Lock size={40} /></div>
            <div className="text-white/80"><Calendar size={40} /></div>
            <div className="text-white/80"><Clock size={40} /></div>
            <div className="text-white/80"><FileText size={40} /></div>
          </div>
          <div className="p-6">
            <h4 className="text-2xl font-black mb-2 leading-tight">Monitorando seus medicamentos</h4>
            <p className="text-lg text-apple-text-secondary leading-relaxed">Por que é importante saber o que você está tomando.</p>
          </div>
        </div>
      </div>

      {/* Mais Section */}
      <div className="px-5 mb-12">
        <h3 className="text-2xl font-bold mb-6 tracking-tight">Mais</h3>
        <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border mb-4">
          <div className="p-4 flex justify-between items-center active:bg-apple-background transition-colors cursor-pointer">
            <span className="text-lg font-medium">Desafixar do Resumo</span>
            <div className="w-6 h-6 bg-apple-border rounded-full flex items-center justify-center text-apple-text-muted">
              <Plus size={14} className="rotate-45" />
            </div>
          </div>
        </div>
        <p className="text-sm text-apple-text-muted mb-8 px-1">
          Os tópicos fixados aparecem na parte superior do Resumo.
        </p>
        
        <div className="space-y-6 px-1">
          <button className="text-blue-500 font-medium text-lg block">Exportar PDF</button>
          <div className="flex justify-between items-center cursor-pointer active:opacity-70 transition-opacity">
            <span className="text-lg font-medium">Opções</span>
            <ChevronRight size={20} className="text-apple-text-muted" />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedMedicationDetails && (
          <MedicationDetailView 
            medication={selectedMedicationDetails}
            logs={medicationLogs.filter(l => l.medicationId === selectedMedicationDetails.id)}
            onClose={() => setSelectedMedicationDetails(null)}
            onUpdate={updateMedication}
            onDelete={async (id) => {
              await deleteMedication(id);
              setSelectedMedicationDetails(null);
            }}
            onArchive={async (id) => {
              await updateMedication(id, { archived: true });
              setSelectedMedicationDetails(null);
            }}
            onLog={async (status) => {
              await addMedicationLog(selectedMedicationDetails.id, selectedMedicationDetails.name, status);
            }}
          />
        )}
        {selectedLogMedication && (
          <MedicationLogModal 
            medication={selectedLogMedication.med}
            time={selectedLogMedication.time}
            onClose={() => setSelectedLogMedication(null)}
            onLog={async (status) => {
              await addMedicationLog(selectedLogMedication.med.id, selectedLogMedication.med.name, status);
              setSelectedLogMedication(null);
            }}
            lastLog={medicationLogs.find(l => l.medicationId === selectedLogMedication.med.id)}
          />
        )}
        {showEditList && (
          <EditMedicationListView 
            medications={medications}
            onClose={() => setShowEditList(false)}
            onUpdate={updateMedication}
            onDelete={deleteMedication}
            onReorder={reorderMedications}
            onAdd={() => {
              setShowEditList(false);
              setShowAddFlow(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const ExamsView: React.FC<{ onBack?: () => void, onSelectExam: (exam: Exam) => void }> = ({ onBack, onSelectExam }) => {
  const { exams, addExam, addSample } = useHealth();
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [step, setStep] = useState(1); // 1: Choose Source, 2: Review/Edit
  const [formData, setFormData] = useState<Partial<Exam>>({
    type: 'Laudo',
    examName: '',
    doctorName: '',
    date: new Date().toLocaleDateString('en-CA'),
    fileData: '',
    fileType: '',
    analysis: '',
    timestamp: new Date().toISOString(),
    metrics: []
  });

  // Filters
  const [filterType, setFilterType] = useState<string>('Todos');
  const [filterMonth, setFilterMonth] = useState<string>('Todos');

  const filteredExams = exams.filter(exam => {
    const matchesType = filterType === 'Todos' || exam.type === filterType;
    const matchesMonth = filterMonth === 'Todos' || new Date(exam.date).toISOString().slice(0, 7) === filterMonth;
    return matchesType && matchesMonth;
  });

  const availableMonths = Array.from(new Set(exams.map(e => new Date(e.date).toISOString().slice(0, 7)))).sort().reverse();

  // Drag to scroll logic
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2; // scroll-fast
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Check if it's a PDF and too large
    // Base64 expansion is ~33%, so 700KB binary becomes ~930KB string
    if (file.type === 'application/pdf' && file.size > 700 * 1024) {
      setUploadError("O arquivo PDF é muito grande (máximo 700KB). Por favor, use uma versão menor ou uma foto.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      let base64 = (event.target?.result as string).split(',')[1];
      let fileType = file.type;

      // Compress if it's an image
      if (fileType.startsWith('image/')) {
        try {
          base64 = await compressImage(base64, fileType);
        } catch (error) {
          console.error("Compression Error:", error);
        }
      }

      // Final check for base64 size (Firestore limit is 1MB per document)
      // We aim for ~800KB for the base64 string to leave room for other fields
      if (base64.length > 900 * 1024) {
        setUploadError("O arquivo ainda é muito grande para o sistema. Tente uma imagem com menor resolução ou um PDF menor.");
        return;
      }

      setFormData(prev => ({ ...prev, fileData: base64, fileType: fileType }));
      
      setIsAnalyzing(true);
      try {
        const analysis = await analyzeExam(base64, fileType);
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
      const examDate = formData.date ? new Date(formData.date).toISOString() : new Date().toISOString();
      for (const metric of formData.metrics) {
        await addSample(metric.type, metric.value, metric.unit, examDate);
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

        <div className="flex-grow min-h-0 overflow-y-auto p-6">
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

              {uploadError && (
                <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-sm font-medium mb-6">
                  {uploadError}
                </div>
              )}

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
                  <select 
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                    className="w-full font-semibold outline-none bg-transparent"
                  >
                    {EXAM_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    {!EXAM_TYPES.includes(formData.type || '') && formData.type && (
                      <option value={formData.type}>{formData.type}</option>
                    )}
                  </select>
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

        {/* Filters */}
        <div className="space-y-4 mb-6">
          <div 
            ref={scrollRef}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            className={`flex gap-2 overflow-x-auto pb-2 no-scrollbar select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            <button 
              onClick={() => setFilterType('Todos')}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all pointer-events-auto ${
                filterType === 'Todos' ? 'bg-blue-500 text-white shadow-md' : 'bg-white text-apple-text-muted border border-apple-border'
              }`}
            >
              Todos
            </button>
            {EXAM_TYPES.map(t => (
              <button 
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all pointer-events-auto ${
                  filterType === t ? 'bg-blue-500 text-white shadow-md' : 'bg-white text-apple-text-muted border border-apple-border'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-apple-text-muted" />
            <select 
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-transparent text-sm font-bold text-apple-text-secondary outline-none"
            >
              <option value="Todos">Todos os meses</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {new Date(m + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
          </div>
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
        ) : filteredExams.length === 0 ? (
          <div className="apple-card p-8 text-center">
            <p className="text-apple-text-secondary text-sm">Nenhum exame encontrado com os filtros selecionados.</p>
            <button 
              onClick={() => { setFilterType('Todos'); setFilterMonth('Todos'); }}
              className="text-blue-500 font-bold text-sm mt-2"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredExams.map(exam => (
              <motion.div 
                key={exam.id} 
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectExam(exam)}
                className="apple-card p-4 cursor-pointer active:bg-apple-background transition-colors"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500">
                      <FileIcon size={20} />
                    </div>
                    <div>
                      <p className="font-bold">{exam.examName}</p>
                      <p className="text-[10px] font-bold text-apple-text-muted uppercase">{exam.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-apple-text-secondary">
                      {new Date(exam.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
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
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const handleShare = async () => {
    setIsSharing(true);
    const shareData: ShareData = {
      title: `Exame: ${exam.examName}`,
      text: `Detalhes do Exame:\nNome: ${exam.examName}\nMédico: ${exam.doctorName}\nData: ${new Date(exam.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}\nAnálise: ${exam.analysis || 'N/A'}`,
    };

    try {
      if (navigator.share) {
        if (exam.fileData && exam.fileType) {
          try {
            const byteCharacters = atob(exam.fileData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const fileExtension = exam.fileType.split('/')[1] || 'pdf';
            const fileName = `${exam.examName.replace(/\s+/g, '_')}_${new Date(exam.date).toISOString().split('T')[0]}.${fileExtension}`;
            const file = new File([byteArray], fileName, { type: exam.fileType });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                ...shareData,
                files: [file]
              });
              return;
            }
          } catch (fileError) {
            console.error("Error preparing file for share:", fileError);
          }
        }
        await navigator.share(shareData);
      } else {
        const text = `${shareData.title}\n${shareData.text}`;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error("Error sharing:", error);
    } finally {
      setIsSharing(false);
    }
  };

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
          fullDate: new Date(e.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
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
          <button 
            onClick={handleShare}
            disabled={isSharing}
            className="text-blue-500 p-2 active:scale-90 transition-transform"
          >
            {isSharing ? <Loader2 size={20} className="animate-spin" /> : copied ? <Check size={20} className="text-green-500" /> : <Share2 size={20} />}
          </button>
        </div>

        <div className="flex-grow min-h-0 overflow-y-auto p-6">
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
              <span className="font-bold">{new Date(exam.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
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
            onClick={handleShare}
            disabled={isSharing}
            className={`w-full font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all mb-4 flex items-center justify-center gap-2 ${copied ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-blue-500 text-white shadow-blue-500/20'}`}
          >
            {isSharing ? <Loader2 size={20} className="animate-spin" /> : copied ? <Check size={20} /> : <Share2 size={20} />}
            {copied ? "Copiado para Transferência" : "Compartilhar Exame"}
          </button>
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
    { name: 'Exames', icon: <FileText />, color: '#007AFF' },
    { name: 'Medicamentos', icon: <Pill />, color: '#32ADE6' },
    { name: 'Nutrição', icon: <Utensils />, color: '#34C759' },
    { name: 'Sintomas', icon: <Activity />, color: '#FF9500' },
    { name: 'Agendamentos', icon: <Calendar />, color: '#AF52DE' },
    { name: 'Ciclo de quimioterapia', icon: <Zap />, color: '#FF2D55' },
    { name: 'Atividade', icon: <Activity />, color: '#FF3B30' },
    { name: 'Sinais vitais', icon: <Heart />, color: '#FF3B30' },
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

const SYMPTOM_DESCRIPTIONS: Record<string, string> = {
  "Vômito": "O vômito ocorre quando o estômago se contrai e força seu conteúdo a sair pela boca. Muitas condições e situações podem causar a necessidade de vomitar, desde uma viagem de carro turbulenta ou gravidez até intoxicação alimentar e uma grande variedade de outras doenças.",
  "Náusea": "A náusea é uma sensação de desconforto no estômago que muitas vezes vem antes do vômito.",
  "Dor de Cabeça": "A dor de cabeça é uma dor ou desconforto na cabeça, couro cabeludo ou pescoço.",
  // Add more as needed
};

const SymptomHistoryView = ({ onClose }: { onClose: () => void }) => {
  const { symptomLogs } = useHealth();
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string | 'All'>('All');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const symptomTypes = Array.from(new Set(symptomLogs.map(log => log.type)));

  const filteredLogs = symptomLogs.filter(log => {
    const matchesSearch = log.type.toLowerCase().includes(search.toLowerCase()) || (log.notes || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = selectedType === 'All' || log.type === selectedType;
    
    let matchesDate = true;
    if (dateRange.start) {
      matchesDate = matchesDate && new Date(log.timestamp) >= new Date(dateRange.start);
    }
    if (dateRange.end) {
      matchesDate = matchesDate && new Date(log.timestamp) <= new Date(dateRange.end);
    }

    return matchesSearch && matchesType && matchesDate;
  });

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-apple-background z-[200] flex flex-col"
    >
      <div className="p-5 pt-12 flex justify-between items-center border-b border-apple-border bg-white">
        <button onClick={onClose} className="text-blue-500 flex items-center gap-1 font-medium">
          <ChevronLeft size={24} />
          Resumo
        </button>
        <h1 className="text-lg font-bold">Histórico de Sintomas</h1>
        <div className="w-12" />
      </div>

      <div className="p-4 bg-white border-b border-apple-border space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-apple-text-muted" size={18} />
          <input 
            type="text"
            placeholder="Buscar nos registros"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-apple-background rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button 
            onClick={() => setSelectedType('All')}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${selectedType === 'All' ? 'bg-blue-500 text-white' : 'bg-apple-background text-apple-text-secondary'}`}
          >
            Todos
          </button>
          {symptomTypes.map(type => (
            <button 
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${selectedType === type ? 'bg-blue-500 text-white' : 'bg-apple-background text-apple-text-secondary'}`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <div className="flex-grow">
            <p className="text-[10px] font-bold text-apple-text-muted uppercase mb-1 ml-1">Início</p>
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full bg-apple-background rounded-xl p-2 text-sm focus:outline-none"
            />
          </div>
          <div className="flex-grow">
            <p className="text-[10px] font-bold text-apple-text-muted uppercase mb-1 ml-1">Fim</p>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full bg-apple-background rounded-xl p-2 text-sm focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex-grow min-h-0 overflow-y-auto p-4 space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-20">
            <Activity size={48} className="mx-auto text-apple-border mb-4" />
            <p className="text-apple-text-secondary">Nenhum registro encontrado</p>
          </div>
        ) : (
          filteredLogs.map(log => (
            <div key={log.id} className="apple-card p-4 flex items-start gap-4">
              <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 shrink-0">
                <Activity size={24} />
              </div>
              <div className="flex-grow">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-lg">{log.type}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    log.intensity === 'Grave' ? 'bg-red-100 text-red-600' :
                    log.intensity === 'Moderado' ? 'bg-orange-100 text-orange-600' :
                    'bg-green-100 text-green-600'
                  }`}>
                    {log.intensity}
                  </span>
                </div>
                <p className="text-xs text-apple-text-muted font-medium mb-2">
                  {new Date(log.timestamp).toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: 'long', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                {log.notes && (
                  <div className="bg-apple-background/50 p-3 rounded-xl border border-apple-border/50">
                    <p className="text-sm text-apple-text-secondary italic">"{log.notes}"</p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};

const EditPinnedView = ({ onClose }: { onClose: () => void }) => {
  const { pinnedMetrics, togglePinnedMetric, symptomLogs } = useHealth();
  const [search, setSearch] = useState('');

  const filteredMetrics = ALL_METRICS.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) || 
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories = Array.from(new Set(ALL_METRICS.map(m => m.category)));

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-apple-background z-[200] flex flex-col"
    >
      <div className="p-5 pt-12 flex justify-between items-center border-b border-apple-border bg-white">
        <div className="w-12" />
        <h1 className="text-lg font-bold">Editar Lista</h1>
        <button onClick={onClose} className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform">
          <Check size={24} />
        </button>
      </div>

      <div className="p-4 bg-white border-b border-apple-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-apple-text-muted" size={18} />
          <input 
            type="text"
            placeholder="Buscar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-apple-background rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="flex-grow min-h-0 overflow-y-auto p-4 space-y-8">
        {categories.map(category => {
          const metricsInCategory = filteredMetrics.filter(m => m.category === category);
          if (metricsInCategory.length === 0) return null;

          return (
            <div key={category}>
              <h2 className="text-xl font-bold mb-4 px-2">{category}</h2>
              <div className="apple-card p-0 overflow-hidden divide-y divide-apple-border">
                {metricsInCategory.map(metric => {
                  const isPinned = pinnedMetrics.includes(metric.id);
                  return (
                    <div 
                      key={metric.id}
                      onClick={() => togglePinnedMetric(metric.id)}
                      className="p-4 flex items-center gap-4 active:bg-apple-background transition-colors cursor-pointer"
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isPinned ? 'bg-yellow-400 text-white' : 'bg-apple-border text-apple-text-muted'}`}>
                        <Pin size={14} fill={isPinned ? 'currentColor' : 'none'} />
                      </div>
                      <span className="font-medium flex-grow">{metric.name}</span>
                      <div className="text-apple-text-muted">
                        <Menu size={18} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

const ChemoCycleRegistrationFlow: React.FC<{ 
  onClose: () => void; 
  onSave: (cycle: Omit<TreatmentCycle, 'id'>) => Promise<void>;
  initialData?: TreatmentCycle | null;
  onDelete?: () => Promise<void>;
}> = ({ onClose, onSave, initialData, onDelete }) => {
  const [step, setStep] = useState(initialData ? 2 : 1);
  const [type, setType] = useState<TreatmentCycle['type']>(initialData?.type || 'Quimioterapia');
  const [startDate, setStartDate] = useState(initialData?.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : new Date().toLocaleDateString('en-CA'));
  const [totalDays, setTotalDays] = useState(initialData?.totalDays?.toString() || '21');
  const [currentCycle, setCurrentCycle] = useState(initialData?.currentCycle?.toString() || '1');
  const [totalCycles, setTotalCycles] = useState(initialData?.totalCycles?.toString() || '6');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [name, setName] = useState(initialData?.name || '');

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleFinish = async () => {
    await onSave({
      name: name || type,
      type,
      startDate: new Date(startDate).toISOString(),
      totalDays: parseInt(totalDays),
      currentCycle: parseInt(currentCycle),
      totalCycles: parseInt(totalCycles),
      notes
    });
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="flex flex-col h-full">
            <div className="flex-grow p-8">
              <h2 className="text-2xl font-black mb-8 leading-tight">Conheça o Acompanhamento de Ciclo</h2>
              <div className="space-y-8">
                <div className="flex gap-4">
                  <div className="bg-indigo-100 p-2 rounded-xl h-fit">
                    <Calendar className="text-indigo-600" size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[17px]">Previsões e Notificações</h4>
                    <p className="text-apple-text-secondary text-[15px] leading-snug">Obtenha previsões das suas próximas sessões e períodos de descanso.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="bg-red-100 p-2 rounded-xl h-fit">
                    <Zap className="text-red-600" size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[17px]">Histórico de Ciclos</h4>
                    <p className="text-apple-text-secondary text-[15px] leading-snug">Veja informações sobre os seus ciclos em uma linha do tempo que você pode discutir com o seu médico.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="bg-green-100 p-2 rounded-xl h-fit">
                    <ShieldCheck className="text-green-600" size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[17px]">Privacidade e Segurança</h4>
                    <p className="text-apple-text-secondary text-[15px] leading-snug">As informações sobre o acompanhamento do seu ciclo são criptografadas e seguras.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-8">
              <button onClick={handleNext} className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">
                Seguinte
              </button>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col h-full">
            <div className="flex-grow p-8">
              <h2 className="text-2xl font-black mb-8 leading-tight">Qual o tipo de tratamento?</h2>
              <div className="space-y-3">
                {['Quimioterapia', 'Hormonioterapia', 'Radioterapia', 'Outra'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t as any)}
                    className={`w-full p-5 rounded-2xl border-2 text-left font-bold transition-all flex justify-between items-center ${
                      type === t ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-100 bg-gray-50 text-apple-text-primary'
                    }`}
                  >
                    {t}
                    {type === t && <Check size={20} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-8 flex gap-3">
              <button onClick={handleBack} className="flex-1 bg-gray-100 text-apple-text-primary font-bold py-4 rounded-2xl active:scale-95 transition-transform">
                Voltar
              </button>
              <button onClick={handleNext} className="flex-[2] bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">
                Seguinte
              </button>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col h-full">
            <div className="flex-grow p-8">
              <h2 className="text-2xl font-black mb-8 leading-tight">Quando começou o tratamento?</h2>
              <div className="bg-gray-50 p-6 rounded-3xl">
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-transparent text-2xl font-black outline-none"
                />
              </div>
              <p className="mt-4 text-apple-text-secondary text-sm font-medium">Selecione a data da primeira sessão do ciclo atual.</p>
            </div>
            <div className="p-8 flex gap-3">
              <button onClick={handleBack} className="flex-1 bg-gray-100 text-apple-text-primary font-bold py-4 rounded-2xl active:scale-95 transition-transform">
                Voltar
              </button>
              <button onClick={handleNext} className="flex-[2] bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">
                Seguinte
              </button>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="flex flex-col h-full">
            <div className="flex-grow p-8">
              <h2 className="text-2xl font-black mb-8 leading-tight">Qual o tempo entre cada infusão?</h2>
              <div className="flex items-center gap-4 bg-gray-50 p-6 rounded-3xl">
                <input 
                  type="number" 
                  value={totalDays}
                  onChange={(e) => setTotalDays(e.target.value)}
                  className="w-24 bg-transparent text-4xl font-black outline-none"
                />
                <span className="text-2xl font-bold text-apple-text-muted">dias</span>
              </div>
              <p className="mt-4 text-apple-text-secondary text-sm font-medium">Exemplo: 21 dias para ciclos de 3 semanas.</p>
            </div>
            <div className="p-8 flex gap-3">
              <button onClick={handleBack} className="flex-1 bg-gray-100 text-apple-text-primary font-bold py-4 rounded-2xl active:scale-95 transition-transform">
                Voltar
              </button>
              <button onClick={handleNext} className="flex-[2] bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">
                Seguinte
              </button>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="flex flex-col h-full">
            <div className="flex-grow p-8">
              <h2 className="text-2xl font-black mb-8 leading-tight">Quantas sessões no total?</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-apple-text-muted uppercase mb-2">Total de sessões</label>
                  <div className="flex items-center gap-4 bg-gray-50 p-6 rounded-3xl">
                    <input 
                      type="number" 
                      value={totalCycles}
                      onChange={(e) => setTotalCycles(e.target.value)}
                      className="w-full bg-transparent text-3xl font-black outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-apple-text-muted uppercase mb-2">Sessão atual (já aplicada)</label>
                  <div className="flex items-center gap-4 bg-gray-50 p-6 rounded-3xl">
                    <input 
                      type="number" 
                      value={currentCycle}
                      onChange={(e) => setCurrentCycle(e.target.value)}
                      className="w-full bg-transparent text-3xl font-black outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-8 flex gap-3">
              <button onClick={handleBack} className="flex-1 bg-gray-100 text-apple-text-primary font-bold py-4 rounded-2xl active:scale-95 transition-transform">
                Voltar
              </button>
              <button onClick={handleNext} className="flex-[2] bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">
                Seguinte
              </button>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="flex flex-col h-full">
            <div className="flex-grow p-8">
              <h2 className="text-2xl font-black mb-8 leading-tight">Detalhes e Observações</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-apple-text-muted uppercase mb-2">Nome do Protocolo/Medicação</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: AC-T, Carboplatina..."
                    className="w-full bg-gray-50 p-5 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-apple-text-muted uppercase mb-2">Observações Adicionais</label>
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Alguma nota importante sobre o ciclo..."
                    className="w-full bg-gray-50 p-5 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500/20 h-32 resize-none"
                  />
                </div>
              </div>
            </div>
            <div className="p-8 space-y-3">
              <div className="flex gap-3">
                <button onClick={handleBack} className="flex-1 bg-gray-100 text-apple-text-primary font-bold py-4 rounded-2xl active:scale-95 transition-transform">
                  Voltar
                </button>
                <button onClick={handleFinish} className="flex-[2] bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform">
                  {initialData ? 'Salvar Alterações' : 'Finalizar Cadastro'}
                </button>
              </div>
              {initialData && onDelete && (
                <button onClick={onDelete} className="w-full text-red-500 font-bold py-2 active:opacity-60 transition-opacity">
                  Excluir Ciclo
                </button>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="fixed inset-0 bg-white z-[300] flex flex-col"
    >
      <div className="p-5 flex justify-end">
        <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-apple-text-muted">
          <X size={20} />
        </button>
      </div>
      <div className="flex-grow overflow-y-auto">
        {renderStep()}
      </div>
    </motion.div>
  );
};

const CategoryDetailView: React.FC<{ category: string; onBack: () => void }> = ({ category, onBack }) => {
  const { samples, addSample, cycles, addCycle, updateCycle, deleteCycle } = useHealth();
  const [timeRange, setTimeRange] = useState<'D' | 'S' | 'M' | '6M' | 'A'>('S');
  const [showAddData, setShowAddData] = useState(false);
  const [newValue, setNewValue] = useState('');

  // Cycle form state
  const [editingCycle, setEditingCycle] = useState<TreatmentCycle | null>(null);
  const [isEditingHistory, setIsEditingHistory] = useState(false);
  const [cycleToDelete, setCycleToDelete] = useState<string | null>(null);

  const sampleTypeMap: Record<string, string> = {
    'Atividade': 'steps',
    'Passos': 'steps',
    'Distância': 'distance',
    'Energia Ativa': 'active_energy',
    'Peso': 'weight',
    'Água': 'water_intake',
    'Nutrição': 'calories',
    'Sinais vitais': 'heart_rate',
    'Batimentos': 'heart_rate',
    'Pressão Sistólica': 'blood_pressure_sys',
    'Pressão Diastólica': 'blood_pressure_dia',
    'Oxigênio': 'oxygen_saturation',
    'Temperatura': 'temperature',
    'Ciclo de quimioterapia': 'chemo_cycle',
    'Agendamentos': 'appointments'
  };

  const unitMap: Record<string, string> = {
    'Atividade': 'passos',
    'Passos': 'passos',
    'Distância': 'km',
    'Energia Ativa': 'kcal',
    'Peso': 'kg',
    'Água': 'ml',
    'Nutrição': 'kcal',
    'Sinais vitais': 'bpm',
    'Batimentos': 'bpm',
    'Pressão Sistólica': 'mmHg',
    'Pressão Diastólica': 'mmHg',
    'Oxigênio': '%',
    'Temperatura': '°C',
    'Ciclo de quimioterapia': 'dia',
    'Agendamentos': 'agendado'
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

  const handleSaveCycle = async (cycleData: Omit<TreatmentCycle, 'id'>) => {
    if (editingCycle) {
      await updateCycle(editingCycle.id, cycleData);
    } else {
      await addCycle(cycleData);
    }
    setEditingCycle(null);
    setShowAddData(false);
  };

  const handleDeleteCycle = async () => {
    if (editingCycle) {
      setCycleToDelete(editingCycle.id);
    }
  };

  const confirmDeleteFromHistory = async () => {
    if (cycleToDelete) {
      await deleteCycle(cycleToDelete);
      setCycleToDelete(null);
      setEditingCycle(null);
      setShowAddData(false);
    }
  };

  const currentCycle = cycles[0];
  const daysSinceStart = currentCycle ? Math.floor((Date.now() - new Date(currentCycle.startDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const cycleDay = currentCycle ? (daysSinceStart % currentCycle.totalDays) + 1 : 0;
  const progress = currentCycle ? (cycleDay / currentCycle.totalDays) * 100 : 0;

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

        {category === 'Ciclo de quimioterapia' && cycles.length === 0 ? (
          <div className="apple-card p-8 text-center">
            <div className="bg-red-50 w-20 h-20 rounded-[32px] flex items-center justify-center mx-auto mb-6">
              <Zap size={40} className="text-red-500" fill="currentColor" />
            </div>
            <h2 className="text-2xl font-black mb-4">Acompanhe seu Tratamento</h2>
            <p className="text-apple-text-secondary font-medium mb-8">
              Monitore suas sessões de quimioterapia, radioterapia ou hormonioterapia e acompanhe seu progresso.
            </p>
            <button 
              onClick={() => setShowAddData(true)}
              className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              Começar Cadastro
            </button>
          </div>
        ) : category === 'Ciclo de quimioterapia' && currentCycle ? (
          <div className="space-y-6">
            <div className="apple-card p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-2xl font-black">{currentCycle.name}</h3>
                    <button 
                      onClick={() => {
                        setEditingCycle(currentCycle);
                        setShowAddData(true);
                      }}
                      className="text-blue-500 text-xs font-bold bg-blue-50 px-2 py-1 rounded-lg"
                    >
                      Editar
                    </button>
                  </div>
                  <p className="text-apple-text-secondary font-bold">{currentCycle.type} • Ciclo {currentCycle.currentCycle} de {currentCycle.totalCycles}</p>
                </div>
                <div className="bg-red-50 p-3 rounded-2xl">
                  <Zap size={24} className="text-red-500" fill="currentColor" />
                </div>
              </div>

              <div className="mb-8">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-4xl font-black">Dia {cycleDay}</span>
                  <span className="text-apple-text-muted font-bold">de {currentCycle.totalDays} dias</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-red-500 rounded-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-apple-background p-4 rounded-2xl">
                  <p className="text-xs font-bold text-apple-text-muted uppercase mb-1">Início</p>
                  <p className="font-bold">{new Date(currentCycle.startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                </div>
                <div className="bg-apple-background p-4 rounded-2xl">
                  <p className="text-xs font-bold text-apple-text-muted uppercase mb-1">Próximo Ciclo</p>
                  <p className="font-bold">
                    {new Date(new Date(currentCycle.startDate).getTime() + currentCycle.totalDays * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mb-2">
              <h2 className="apple-section-header mb-0">Histórico de Ciclos</h2>
              {cycles.length > 0 && (
                <button 
                  onClick={() => setIsEditingHistory(!isEditingHistory)}
                  className="text-blue-500 text-sm font-bold active:opacity-60 transition-opacity"
                >
                  {isEditingHistory ? 'OK' : 'Editar'}
                </button>
              )}
            </div>
            <div className="space-y-3">
              {cycles.map(c => (
                <div key={c.id} className="flex items-center gap-3">
                  <AnimatePresence>
                    {isEditingHistory && (
                      <motion.button
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 'auto', opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        onClick={() => setCycleToDelete(c.id)}
                        className="bg-red-500 text-white p-2 rounded-full shadow-sm active:scale-90 transition-transform"
                      >
                        <Trash2 size={18} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                  <button 
                    onClick={() => {
                      if (isEditingHistory) return;
                      setEditingCycle(c);
                      setShowAddData(true);
                    }}
                    className="apple-card p-4 flex justify-between items-center flex-grow text-left active:scale-[0.98] transition-transform"
                  >
                    <div>
                      <p className="font-bold">{c.name}</p>
                      <p className="text-xs text-apple-text-muted">{c.type} • Ciclo {c.currentCycle} • {new Date(c.startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                    </div>
                    <ChevronRight size={20} className="text-gray-300" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      <AnimatePresence>
        {cycleToDelete && (
          <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-6 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-xs rounded-[24px] p-6 text-center shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-500" size={32} />
              </div>
              <h3 className="text-lg font-bold mb-2">Excluir Ciclo?</h3>
              <p className="text-apple-text-secondary text-sm mb-6">Esta ação não pode ser desfeita.</p>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={confirmDeleteFromHistory}
                  className="w-full bg-red-500 text-white font-bold py-3 rounded-xl active:scale-95 transition-transform"
                >
                  Excluir
                </button>
                <button 
                  onClick={() => setCycleToDelete(null)}
                  className="w-full bg-gray-100 text-apple-text-primary font-bold py-3 rounded-xl active:scale-95 transition-transform"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddData && (
          category === 'Ciclo de quimioterapia' ? (
            <ChemoCycleRegistrationFlow 
              onClose={() => {
                setShowAddData(false);
                setEditingCycle(null);
              }}
              onSave={handleSaveCycle}
              initialData={editingCycle}
              onDelete={handleDeleteCycle}
            />
          ) : (
            <div className="fixed inset-0 bg-black/40 z-[200] flex items-end justify-center p-4 backdrop-blur-sm">
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold">
                    Adicionar {category}
                  </h3>
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
          )
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

      <div className="flex-grow min-h-0 overflow-y-auto p-6">
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

const TumorDetailView: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { tumorProfile, updateTumorProfile, samples } = useHealth();
  const [isEditing, setIsEditing] = useState(false);
  const [editProfile, setEditProfile] = useState<Partial<TumorProfile>>({});

  useEffect(() => {
    if (tumorProfile) setEditProfile(tumorProfile);
  }, [tumorProfile]);

  const sizeHistory = samples
    .filter(s => s.type === 'tumor_size')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const volumeHistory = samples
    .filter(s => s.type === 'tumor_volume')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Merge history for the chart
  const chartData = sizeHistory.map(s => {
    const v = volumeHistory.find(vh => vh.timestamp === s.timestamp);
    return {
      date: new Date(s.timestamp).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      fullDate: new Date(s.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }),
      size: s.value,
      volume: v ? v.value : null
    };
  });

  const latestSize = sizeHistory.length > 0 ? sizeHistory[sizeHistory.length - 1].value : 0;
  const latestVolume = volumeHistory.length > 0 ? volumeHistory[volumeHistory.length - 1].value : 0;

  const handleSave = async () => {
    await updateTumorProfile(editProfile);
    setIsEditing(false);
  };

  const characteristics = [
    { label: 'Diagnóstico', key: 'diagnosis' },
    { label: 'Tipo Histológico', key: 'type' },
    { label: 'Localização', key: 'location' },
    { label: 'Grau Histológico', key: 'grade' },
    { label: 'Grau Nuclear', key: 'nuclearGrade' },
    { label: 'Formação Tubular', key: 'tubularFormation' },
    { label: 'Índice Mitótico', key: 'mitoticIndex' },
    { label: 'Necrose', key: 'necrosis' },
    { label: 'Microcalcificações', key: 'microcalcifications' },
    { label: 'Reação Desmoplásica', key: 'desmoplasticReaction' },
    { label: 'Infiltrado Inflamatório', key: 'inflammatoryInfiltrate' },
    { label: 'TILs', key: 'tils' },
    { label: 'Invasão Vascular', key: 'vascularInvasion' },
    { label: 'Invasão Perineural', key: 'perineuralInvasion' },
    { label: 'Curva de Captação', key: 'uptakeCurve' },
    { label: 'ACR BI-RADS', key: 'birads' },
  ];

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[100] bg-[#F8F9FB] flex flex-col no-scrollbar overflow-y-auto"
    >
      {/* Header */}
      <div className="p-6 flex justify-between items-center sticky top-0 bg-[#F8F9FB]/80 backdrop-blur-md z-20">
        <button onClick={onClose} className="p-2 -ml-2 text-[#2D3E50] font-semibold flex items-center gap-1">
          <ChevronLeft size={20} />
          Voltar
        </button>
        <div className="text-center">
          <h2 className="text-xl font-black text-[#1A2B3C] tracking-tight">Acompanhamento Tumoral</h2>
          <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-wider">
            {tumorProfile?.location || 'Evolução do Nódulo'}
          </p>
        </div>
        <button 
          onClick={() => isEditing ? handleSave() : setIsEditing(true)}
          className="text-blue-600 font-bold px-4 py-2 rounded-full bg-blue-50 active:scale-95 transition-transform"
        >
          {isEditing ? 'Salvar' : 'Editar'}
        </button>
      </div>

      <div className="px-6 pb-20 max-w-5xl mx-auto w-full">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-apple-border/30 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
              <Layers size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-0.5">Volume Estimado</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#1A2B3C]">{latestVolume}</span>
                <span className="text-xs font-bold text-apple-text-muted">cm³</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-apple-border/30 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <Maximize size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-0.5">Maior Diâmetro (LL)</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#1A2B3C]">{latestSize}</span>
                <span className="text-xs font-bold text-apple-text-muted">mm</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-apple-border/30 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-0.5">Curva de Captação</p>
              <p className="text-lg font-black text-[#1A2B3C]">{tumorProfile?.uptakeCurve || 'Não informada'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Chart */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-apple-border/30 h-full">
              <div className="flex items-center gap-2 mb-8">
                <Activity size={18} className="text-apple-text-muted" />
                <h3 className="text-lg font-black text-[#1A2B3C] tracking-tight">Curva de Redução (Volume x Diâmetro)</h3>
              </div>

              <div className="h-[400px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorSize" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#64748B', fontWeight: 600 }}
                      dy={15}
                    />
                    <YAxis 
                      yAxisId="left"
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#3B82F6', fontWeight: 600 }}
                      label={{ value: 'Volume (cm³)', angle: -90, position: 'insideLeft', style: { fill: '#3B82F6', fontWeight: 700, fontSize: 12 } }}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#10B981', fontWeight: 600 }}
                      label={{ value: 'Diâmetro (mm)', angle: 90, position: 'insideRight', style: { fill: '#10B981', fontWeight: 700, fontSize: 12 } }}
                    />
                    <Tooltip 
                      cursor={{ stroke: '#94A3B8', strokeWidth: 1, strokeDasharray: '4 4' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const volume = payload.find(p => p.dataKey === 'volume')?.value;
                          const size = payload.find(p => p.dataKey === 'size')?.value;
                          return (
                            <div className="bg-white p-4 rounded-2xl shadow-xl border border-apple-border/50 backdrop-blur-sm">
                              <p className="text-xs font-bold text-slate-400 uppercase mb-2">{payload[0].payload.fullDate}</p>
                              <div className="space-y-1">
                                {volume !== undefined && <p className="text-sm font-black text-blue-600">Volume: {volume} cm³</p>}
                                {size !== undefined && <p className="text-sm font-black text-emerald-600">Diâmetro: {size} mm</p>}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="volume" 
                      stroke="#3B82F6" 
                      strokeWidth={4} 
                      fillOpacity={1} 
                      fill="url(#colorVolume)" 
                      dot={{ r: 6, fill: '#3B82F6', strokeWidth: 3, stroke: '#fff' }}
                      activeDot={{ r: 8, strokeWidth: 0 }}
                    />
                    <Area 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="size" 
                      stroke="#10B981" 
                      strokeWidth={4} 
                      fillOpacity={1} 
                      fill="url(#colorSize)" 
                      dot={{ r: 6, fill: '#10B981', strokeWidth: 3, stroke: '#fff' }}
                      activeDot={{ r: 8, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex justify-center gap-8 mt-12">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-xs font-bold text-slate-600">Volume (cm³)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-slate-600">Maior Diâmetro (mm)</span>
                </div>
              </div>

              <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-8">
                Passe o mouse sobre os pontos do gráfico para ver os detalhes daquele exame.
              </p>
            </div>
          </div>

          {/* Clinical Timeline */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-apple-border/30 h-full">
              <div className="flex items-center gap-2 mb-8">
                <Calendar size={18} className="text-apple-text-muted" />
                <h3 className="text-lg font-black text-[#1A2B3C] tracking-tight">Evolução Clínica</h3>
              </div>

              <div className="relative pl-8 space-y-12">
                {/* Vertical Line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-100" />

                {chartData.map((point, idx) => (
                  <div key={idx} className="relative">
                    {/* Circle */}
                    <div className={`absolute -left-[25px] top-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm z-10 ${
                      idx === chartData.length - 1 ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {idx + 1}
                    </div>

                    <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                      <div className="flex justify-between items-start mb-3">
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{point.date}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                          {idx === 0 ? 'DIAGNÓSTICO BASE' : idx === 1 ? 'APÓS 3 CICLOS' : 'PRÉ-CIRÚRGICO'}
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <ChevronRight size={14} className="text-slate-300 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">Margens:</p>
                            <p className="text-xs font-bold text-slate-700">
                              {idx === 0 ? 'Espiculadas' : idx === 1 ? 'Parcialmente espiculadas' : 'Mais regulares'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <ChevronRight size={14} className="text-slate-300 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">Realce:</p>
                            <p className="text-xs font-bold text-slate-700">
                              {idx === 0 ? 'Precoce e heterogêneo' : idx === 1 ? 'Heterogêneo' : 'Leve / Homogêneo'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pathological Profile */}
        <div className="mt-8">
          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-apple-border/30">
            <div className="p-8 bg-slate-50/50 border-b border-apple-border/30">
              <h3 className="text-lg font-black text-[#1A2B3C] tracking-tight uppercase tracking-widest">Perfil Patológico Detalhado</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-apple-border/30">
              {characteristics.map((c) => (
                <div key={c.key} className="p-6 hover:bg-slate-50/30 transition-colors">
                  <span className="text-[10px] font-bold text-apple-text-muted uppercase tracking-widest mb-2 block">{c.label}</span>
                  {isEditing ? (
                    <input 
                      type="text"
                      value={(editProfile as any)[c.key] || ''}
                      onChange={(e) => setEditProfile({ ...editProfile, [c.key]: e.target.value })}
                      className="w-full bg-slate-50 p-3 rounded-xl text-sm font-bold text-[#1A2B3C] focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200"
                      placeholder={`Informe o ${c.label.toLowerCase()}`}
                    />
                  ) : (
                    <p className="text-sm font-black text-[#1A2B3C]">
                      {(tumorProfile as any)?.[c.key] || 'Não informado'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
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
  const [showEditPinned, setShowEditPinned] = useState(false);
  const [showSymptomHistory, setShowSymptomHistory] = useState(false);
  const [showSharing, setShowSharing] = useState(false);
  const [showTumorDetail, setShowTumorDetail] = useState(false);
  const [showScheduling, setShowScheduling] = useState(false);

  // Drag to scroll logic for the whole screen
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [isDraggingMain, setIsDraggingMain] = useState(false);
  const [startYMain, setStartYMain] = useState(0);
  const [scrollTopMain, setScrollTopMain] = useState(0);

  const handleMouseDownMain = (e: React.MouseEvent) => {
    // Don't drag if clicking on interactive elements
    if ((e.target as HTMLElement).closest('button, input, select, a, [role="button"]')) return;
    
    if (!mainScrollRef.current) return;
    setIsDraggingMain(true);
    setStartYMain(e.pageY - mainScrollRef.current.offsetTop);
    setScrollTopMain(mainScrollRef.current.scrollTop);
  };

  const handleMouseMoveMain = (e: React.MouseEvent) => {
    if (!isDraggingMain || !mainScrollRef.current) return;
    e.preventDefault();
    const y = e.pageY - mainScrollRef.current.offsetTop;
    const walk = (y - startYMain) * 1.5; // scroll speed
    mainScrollRef.current.scrollTop = scrollTopMain - walk;
  };

  const handleMouseUpMain = () => {
    setIsDraggingMain(false);
  };

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

  // Scroll to top when tab changes
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo(0, 0);
    }
  }, [activeTab]);

  // Add some mock data on first load for demo
  useEffect(() => {
    if (user) {
      const seedData = async () => {
        const medsRef = collection(db, `users/${user.uid}/medications`);
        const cyclesRef = collection(db, `users/${user.uid}/treatment_cycles`);
        const samplesRef = collection(db, `users/${user.uid}/health_samples`);
        const profileRef = doc(db, `users/${user.uid}/tumor_profile/current`);
        
        try {
          // Check if profile exists
          const profileSnap = await getDoc(profileRef);
          if (!profileSnap.exists()) {
            await setDoc(profileRef, {
              diagnosis: 'Carcinoma Mamário Invasivo',
              type: 'Ductal Invasivo SOE',
              grade: 'II (Nottingham)',
              nuclearGrade: '2',
              tubularFormation: 'Escore 2',
              mitoticIndex: '11 mitoses (Escore 2)',
              necrosis: 'Ausente',
              microcalcifications: 'Ausentes',
              desmoplasticReaction: 'Moderada',
              inflammatoryInfiltrate: 'Leve',
              tils: '10%',
              vascularInvasion: 'Não detectada',
              perineuralInvasion: 'Não detectada',
              birads: '4C',
              uptakeCurve: 'Tipo II (Platô)',
              location: 'Quadrante Superomedial (QSM)',
              updatedAt: new Date().toISOString()
            });

            // Add historical size and volume data
            const historicalData = [
              { date: '2026-01-05T10:00:00Z', size: 28, volume: 6.5 },
              { date: '2026-03-26T10:00:00Z', size: 26.1, volume: 6.36 },
              { date: '2026-06-15T10:00:00Z', size: 19.5, volume: 3.8 }
            ];

            for (const data of historicalData) {
              await addDoc(samplesRef, {
                uid: user.uid,
                type: 'tumor_size',
                value: data.size,
                unit: 'mm',
                timestamp: data.date
              });
              await addDoc(samplesRef, {
                uid: user.uid,
                type: 'tumor_volume',
                value: data.volume,
                unit: 'cm³',
                timestamp: data.date
              });
            }
          }
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
          /*
          await addDoc(cyclesRef, {
            name: 'Quimioterapia Branca',
            startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            totalDays: 21,
            currentCycle: 2,
            totalCycles: 6
          });
          */
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
    <div 
      ref={mainScrollRef}
      onMouseDown={handleMouseDownMain}
      onMouseMove={handleMouseMoveMain}
      onMouseUp={handleMouseUpMain}
      onMouseLeave={handleMouseUpMain}
      className={`h-screen overflow-y-auto no-scrollbar max-w-md mx-auto bg-apple-background apple-gradient-bg relative ${isDraggingMain ? 'cursor-grabbing select-none' : 'cursor-default'}`}
    >
      <AnimatePresence>
        {showOnboarding && <OnboardingView onComplete={completeOnboarding} />}
        {showProfile && <ProfileView onClose={() => setShowProfile(false)} />}
        {showSharing && <SharingView onBack={() => setShowSharing(false)} />}
        {showEditPinned && <EditPinnedView onClose={() => setShowEditPinned(false)} />}
        {showSymptomHistory && <SymptomHistoryView onClose={() => setShowSymptomHistory(false)} />}
        {showTumorDetail && <TumorDetailView onClose={() => setShowTumorDetail(false)} />}
        {showScheduling && <SchedulingView onClose={() => setShowScheduling(false)} />}
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
              onOpenEditPinned={() => setShowEditPinned(true)}
              onOpenSymptomHistory={() => setShowSymptomHistory(true)}
              onOpenTumorDetail={() => setShowTumorDetail(true)}
              onOpenScheduling={() => setShowScheduling(true)}
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
                else if (cat === 'Nutrição') setActiveTab('nutrition');
                else if (cat === 'Atividade') setActiveTab('activity');
                else if (cat === 'Sinais vitais') setActiveTab('vitals');
                else if (cat === 'Agendamentos') setShowScheduling(true);
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
        {activeTab === 'nutrition' && (
          <motion.div
            key="nutrition"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <NutritionView onBack={() => setActiveTab('browse')} />
          </motion.div>
        )}
        {activeTab === 'activity' && (
          <motion.div
            key="activity"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <ActivityView onBack={() => setActiveTab('browse')} />
          </motion.div>
        )}
        {activeTab === 'vitals' && (
          <motion.div
            key="vitals"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <VitalSignsView onBack={() => setActiveTab('browse')} />
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
