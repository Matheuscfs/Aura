import { User } from 'firebase/auth';

export interface HealthSample {
  id: string;
  type: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface Medication {
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
  archived?: boolean;
  order?: number;
}

export interface MedicationLog {
  id: string;
  medicationId: string;
  medicationName: string;
  status: 'Taken' | 'Skipped';
  timestamp: string;
}

export interface SymptomLog {
  id: string;
  type: string;
  intensity: 'Não Presente' | 'Presente' | 'Suave' | 'Moderado' | 'Grave';
  timestamp: string;
  endDate?: string;
  notes?: string;
}

export interface TreatmentCycle {
  id: string;
  name: string;
  type: 'Quimioterapia' | 'Hormonioterapia' | 'Radioterapia' | 'Outra';
  startDate: string;
  totalDays: number;
  currentCycle: number;
  totalCycles: number;
  notes?: string;
}

export interface HealthData {
  firstName: string;
  lastName: string;
  birthDate: string;
  sex: string;
  bloodType: string;
  skinType: string;
  isWheelchairUser: boolean;
}

export interface EmergencyContact {
  relationship: string;
  name: string;
  phone: string;
}

export interface MedicalID {
  showOnLockScreen: boolean;
  pregnancy: string;
  allergies: string;
  medicalConditions: string;
  height: number;
  weight: number;
  notes: string;
  emergencyContacts: EmergencyContact[];
  updatedAt: string;
}

export interface ScheduledExam {
  id: string;
  type: string;
  name: string;
  date: string;
  time: string;
  location: string;
  notes: string;
  completed: boolean;
  timestamp: string;
}

export interface Exam {
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

export interface TumorProfile {
  id: string;
  diagnosis: string;
  type: string;
  grade: string;
  nuclearGrade: string;
  tubularFormation: string;
  mitoticIndex: string;
  necrosis: string;
  microcalcifications: string;
  desmoplasticReaction: string;
  inflammatoryInfiltrate: string;
  tils: string;
  vascularInvasion: string;
  perineuralInvasion: string;
  birads: string;
  uptakeCurve: string;
  location: string;
  updatedAt: string;
}

export interface NutritionLog {
  id: string;
  mealType: 'Café da Manhã' | 'Almoço' | 'Jantar' | 'Lanche';
  content: string;
  calories?: number;
  timestamp: string;
  notes?: string;
}

export interface ActivityGoals {
  steps: number;
  distance: number;
  active_energy: number;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
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

export interface HealthContextType {
  user: User | null;
  samples: HealthSample[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  symptomLogs: SymptomLog[];
  cycles: TreatmentCycle[];
  exams: Exam[];
  scheduledExams: ScheduledExam[];
  nutritionLogs: NutritionLog[];
  tumorProfile: TumorProfile | null;
  activityGoals: ActivityGoals;
  loading: boolean;
  addSample: (type: string, value: number, unit: string, timestamp?: string) => Promise<void>;
  addMedication: (med: Omit<Medication, 'id'>) => Promise<void>;
  updateMedication: (id: string, med: Partial<Medication>) => Promise<void>;
  deleteMedication: (id: string) => Promise<void>;
  reorderMedications: (meds: Medication[]) => Promise<void>;
  addMedicationLog: (medId: string, name: string, status: 'Taken' | 'Skipped', timestamp?: string) => Promise<void>;
  addSymptomLog: (type: string, intensity: SymptomLog['intensity'], timestamp?: string, endDate?: string, notes?: string) => Promise<void>;
  addExam: (exam: Omit<Exam, 'id'>) => Promise<void>;
  deleteExam: (id: string) => Promise<void>;
  addScheduledExam: (exam: Omit<ScheduledExam, 'id'>) => Promise<void>;
  updateScheduledExam: (id: string, exam: Partial<ScheduledExam>) => Promise<void>;
  deleteScheduledExam: (id: string) => Promise<void>;
  addNutritionLog: (log: Omit<NutritionLog, 'id'>) => Promise<void>;
  deleteNutritionLog: (id: string) => Promise<void>;
  updateTumorProfile: (profile: Partial<TumorProfile>) => Promise<void>;
  updateActivityGoals: (goals: Partial<ActivityGoals>) => Promise<void>;
  pinnedMetrics: string[];
  togglePinnedMetric: (metric: string) => Promise<void>;
  healthData: HealthData | null;
  updateHealthData: (data: Partial<HealthData>) => Promise<void>;
  medicalID: MedicalID | null;
  updateMedicalID: (data: Partial<MedicalID>) => Promise<void>;
  addCycle: (cycle: Omit<TreatmentCycle, 'id'>) => Promise<void>;
  updateCycle: (id: string, cycle: Partial<TreatmentCycle>) => Promise<void>;
  deleteCycle: (id: string) => Promise<void>;
  showToast: (message: string) => void;
}
