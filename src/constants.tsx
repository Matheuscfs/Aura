import React from 'react';
import { Activity, Heart, Wind, Scale, Droplets, FileText, Flame } from 'lucide-react';

export const EXAM_TYPES = ['Receita', 'Guia Médica', 'Atestado', 'Documento', 'Laudo'];

export const ALL_METRICS = [
  { id: 'steps', name: 'Passos', category: 'Atividade', icon: <Activity size={18} />, color: '#FF2D55' },
  { id: 'distance', name: 'Distância', category: 'Atividade', icon: <Activity size={18} />, color: '#FF2D55' },
  { id: 'active_energy', name: 'Energia Ativa', category: 'Atividade', icon: <Flame size={18} />, color: '#FF2D55' },
  { id: 'heart_rate', name: 'Batimentos', category: 'Sinais vitais', icon: <Heart size={18} />, color: '#FF3B30' },
  { id: 'blood_pressure_sys', name: 'Pressão Sistólica', category: 'Sinais vitais', icon: <Activity size={18} />, color: '#FF3B30' },
  { id: 'blood_pressure_dia', name: 'Pressão Diastólica', category: 'Sinais vitais', icon: <Activity size={18} />, color: '#FF3B30' },
  { id: 'oxygen_saturation', name: 'Oxigênio', category: 'Sinais vitais', icon: <Wind size={18} />, color: '#007AFF' },
  { id: 'temperature', name: 'Temperatura', category: 'Sinais vitais', icon: <Activity size={18} />, color: '#FF9500' },
  { id: 'weight', name: 'Peso', category: 'Nutrição', icon: <Scale size={18} />, color: '#34C759' },
  { id: 'water_intake', name: 'Água', category: 'Nutrição', icon: <Droplets size={18} />, color: '#007AFF' },
  { id: 'tumor_size', name: 'Evolução do Tumor', category: 'Exames', icon: <Activity size={18} />, color: '#5E5CE6' },
  { id: 'Plaquetas', name: 'Plaquetas', category: 'Exames', icon: <FileText size={18} />, color: '#007AFF' },
  { id: 'Leucócitos', name: 'Leucócitos', category: 'Exames', icon: <FileText size={18} />, color: '#34C759' },
  { id: 'Hemoglobina', name: 'Hemoglobina', category: 'Exames', icon: <FileText size={18} />, color: '#FF3B30' },
  { id: 'Vômito', name: 'Vômito', category: 'Sintomas', icon: <Activity size={18} />, color: '#FF9500' },
  { id: 'Náusea', name: 'Náusea', category: 'Sintomas', icon: <Activity size={18} />, color: '#FF9500' },
  { id: 'Fadiga', name: 'Fadiga', category: 'Sintomas', icon: <Activity size={18} />, color: '#FF9500' },
  { id: 'Dor de Cabeça', name: 'Dor de Cabeça', category: 'Sintomas', icon: <Activity size={18} />, color: '#FF9500' },
  { id: 'Diarreia', name: 'Diarreia', category: 'Sintomas', icon: <Activity size={18} />, color: '#FF9500' },
  { id: 'Constipação', name: 'Constipação', category: 'Sintomas', icon: <Activity size={18} />, color: '#FF9500' },
  { id: 'Falta de Apetite', name: 'Falta de Apetite', category: 'Sintomas', icon: <Activity size={18} />, color: '#FF9500' },
  { id: 'Alterações de Sono', name: 'Alterações de Sono', category: 'Sintomas', icon: <Activity size={18} />, color: '#FF9500' },
];

export const SYMPTOMS_LIST = [
  "Acne", "Alterações de Apetite", "Alterações de Humor", "Alterações de Sono",
  "Aperto ou Dor no Peito", "Azia", "Batimentos Rápidos ou Palpitantes", "Calafrios",
  "Cólicas Abdominais", "Congestão", "Desmaio", "Diarreia", "Dor Corporal e Muscular",
  "Dor de Cabeça", "Dor de Garganta", "Dor na Região Lombar", "Dor no Seio",
  "Dor Pélvica", "Nariz Escorrendo", "Náusea", "Ondas de Calor", "Palpitações",
  "Pele Seca", "Perda de Cabelo", "Perda de Memória", "Perda do Olfato",
  "Perda do Paladar", "Prisão de Ventre", "Secura Vaginal", "Suor Noturno",
  "Tosse", "Vômito"
];
