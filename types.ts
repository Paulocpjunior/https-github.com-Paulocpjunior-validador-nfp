export interface Message {
  role: 'user' | 'model';
  text: string;
}

export interface User {
  nome: string;
  email: string;
  senha?: string;
  isAdmin?: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

export interface Certificate {
  id: number;
  nome: string;
  tipo: string;
  tamanho: string;
  dataUpload: string;
  base64: string;
  senha: string;
  validado: boolean;
  cnpj: string;
  razaoSocial: string;
  validade: string;
  status: 'pendente' | 'válido' | 'inválido' | 'erro';
  erroMsg?: string;
}

export interface Client {
    id: number;
    nome: string;
    cnpj: string;
    im: string;
    certificadoId: string;
    ativo: boolean;
}

export interface ServiceData {
    notas: number;
    valor: string;
    iss: string;
    creditos: string;
    semTomador?: number;
}

export interface Result {
    cliente: string;
    cnpj: string;
    im: string;
    periodo: string;
    prestados: ServiceData;
    tomados: ServiceData;
    fonte: 'REAL' | 'MOCK';
    status: 'sucesso' | 'erro';
}

export interface HistoryItem {
    id: number;
    data: string;
    qt: number;
    resultados: Result[];
}

export interface Log {
    id: number;
    time: string;
    msg: string;
    tipo: 'info' | 'success' | 'warning' | 'error';
}

export interface Agendamento {
    id: number;
    clientId: number;
    periodo: string; // MM/YYYY
    dataAgendamento: string; // ISO string
    status: 'agendado' | 'executado' | 'erro';
    executadoEm?: string;
    log?: string;
}

export interface ComparisonItem {
    cliente: string;
    atual: number;
    anterior: number;
    var: string;
}

export interface GcpConfig {
  projectId: string;
  region: 'southamerica-east1' | 'us-central1' | 'us-east1';
  configured: boolean;
  connectionVerified: boolean;
  useMock: boolean;
  endpoints: {
    validarCertificado: string;
    consultarNFP: string;
    healthCheck: string;
  };
}