import React, { useState, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { HelpCircle, FileText, Download, Users, AlertCircle, TrendingUp, CheckCircle, XCircle, Loader2, LogOut, Search, BarChart3, Calendar, Bell, ArrowUp, ArrowDown, Shield, Code, Upload, FileKey, Zap, Cloud, Eye, EyeOff, Sun, Moon, ChevronDown, ExternalLink, Clock, Trash2, ClipboardCopy, UserPlus, Lock, RefreshCcw, Copy, Edit2, Save } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- DEFINIÇÕES DE TIPO ---
interface GcpConfig {
  projectId: string;
  region: 'southamerica-east1' | 'us-central1' | 'us-east1';
  configured: boolean;
  connectionVerified: boolean;
  endpoints: {
    validarCertificado: string;
    consultarNFP: string;
    healthCheck: string;
  };
}

interface Certificate {
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
  status: 'pendente' | 'válido' | 'inválido';
  certificadoId?: string;
}

interface Client {
    id: number;
    nome: string;
    cnpj: string;
    im: string;
    certificadoId: string;
    ativo: boolean;
}

interface ServiceData {
    notas: number;
    valor: string;
    iss: string;
    creditos: string;
    semTomador?: number;
}

interface Result {
    cliente: string;
    cnpj: string;
    im: string;
    periodo: string;
    prestados: ServiceData;
    tomados: ServiceData;
    fonte: 'REAL';
    status: 'sucesso' | 'erro';
}

interface HistoryItem {
    id: number;
    data: string;
    qt: number;
    resultados: Result[];
}

interface ComparisonItem {
    cliente: string;
    atual: number;
    anterior: number;
    var: string;
}

interface Log {
    id: number;
    time: string;
    msg: string;
    tipo: 'info' | 'success' | 'warning' | 'error';
}

interface Agendamento {
    id: number;
    clientId: number;
    periodo: string; // MM/YYYY
    dataAgendamento: string; // ISO string
    status: 'agendado' | 'executado' | 'erro';
    executadoEm?: string; // ISO string
    log?: string;
}

interface User {
    nome: string;
    email: string;
    senha?: string;
}

type Aba = 'conectar' | 'certificados' | 'clientes' | 'resultados' | 'graficos' | 'comparacao' | 'historico' | 'alertas' | 'codigo' | 'agendamento';

// --- COMPONENTE DE LOGS REUTILIZÁVEL ---
const LogViewer = ({ logs, title = "Logs de Processamento" }: { logs: Log[], title?: string }) => {
    const Icon = ({ tipo }: { tipo: Log['tipo'] }) => {
        switch (tipo) {
            case 'success': return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
            case 'error': return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
            case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
            default: return <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />;
        }
    };
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 h-full">
            <h2 className="font-bold mb-4 flex items-center gap-2 text-lg"><FileText className="w-5 h-5" />{title}</h2>
            <div className="bg-gray-900 rounded p-3 h-[calc(100%-40px)] min-h-[50vh] overflow-y-auto text-xs font-mono">
                {logs.map(l => (
                    <div key={l.id} className="flex items-start gap-2 mb-1">
                        <Icon tipo={l.tipo} />
                        <span className="text-gray-400">{l.time}</span>
                        <span className={`break-all ${l.tipo === 'error' ? 'text-red-400' : l.tipo === 'success' ? 'text-green-400' : l.tipo === 'warning' ? 'text-yellow-400' : 'text-gray-300'}`}>{l.msg}</span>
                    </div>
                ))}
                {logs.length === 0 && <p className="text-gray-500">Aguardando processamento...</p>}
            </div>
        </div>
    );
};


// --- COMPONENTE PRINCIPAL DO APP ---
export default function App() {
    // --- GERENCIAMENTO DE ESTADO ---
    const [user, setUser] = useState<User | null>(null);
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
    const [authData, setAuthData] = useState({ nome: '', email: '', senha: '' });
    const [authLoading, setAuthLoading] = useState(false);
    
    const [clientes, setClientes] = useState<Client[]>([]);
    const [resultados, setResultados] = useState<Result[]>([]);
    const [historico, setHistorico] = useState<HistoryItem[]>([]);
    const [processando, setProcessando] = useState(false);
    const [analiseIA, setAnaliseIA] = useState('');
    const [logs, setLogs] = useState<Log[]>([]);
    const [comparacao, setComparacao] = useState<ComparisonItem[]>([]);
    const [filtros, setFiltros] = useState({ busca: '', status: 'todos' });
    const [aba, setAba] = useState<Aba>('certificados');
    const [certificados, setCertificados] = useState<Certificate[]>([]);
    const [certBusca, setCertBusca] = useState('');
    const [uploadingCert, setUploadingCert] = useState(false);
    const [certValidando, setCertValidando] = useState<number | null>(null);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [activeChartIndex, setActiveChartIndex] = useState<number | null>(null);
    const [expandedAlerts, setExpandedAlerts] = useState<string[]>([]);
    const [reportModal, setReportModal] = useState({ isOpen: false, content: '' });
    const [testingConnection, setTestingConnection] = useState(false);
    const [helpModalOpen, setHelpModalOpen] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
    const [novoAgendamento, setNovoAgendamento] = useState({
        clientId: '',
        periodo: `${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getFullYear()}`,
        data: new Date(Date.now() + 60000 * 5).toISOString().slice(0, 16), // 5 minutes from now
    });
    const [editingEndpoints, setEditingEndpoints] = useState(false);


    const [gcpConfig, setGcpConfig] = useState<GcpConfig>({
        projectId: '',
        region: 'southamerica-east1',
        configured: false,
        connectionVerified: false,
        endpoints: {
            validarCertificado: '',
            consultarNFP: '',
            healthCheck: ''
        }
    });
    const [configStatus, setConfigStatus] = useState<'pending' | 'configuring' | 'configured'>('pending');

    const PIE_COLORS = { ok: '#10B981', alertas: '#F59E0B' };

    // --- EFEITOS (EFFECTS) ---
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);
    
    useEffect(() => {
        try {
            const saved = localStorage.getItem('nfp_gcp_config');
            if (saved) {
              const parsed = JSON.parse(saved);
              setGcpConfig(parsed);
              if(parsed.configured) setConfigStatus('configured');
            }
            const hist = localStorage.getItem('nfp_historico');
            if (hist) setHistorico(JSON.parse(hist));
            const certs = localStorage.getItem('nfp_certificados');
            if (certs) setCertificados(JSON.parse(certs));
            const savedClientes = localStorage.getItem('nfp_clientes');
            if (savedClientes) setClientes(JSON.parse(savedClientes));
            const agends = localStorage.getItem('nfp_agendamentos');
            if (agends) setAgendamentos(JSON.parse(agends));

            // Check for existing session
            const savedUser = localStorage.getItem('nfp_active_user');
            const savedToken = localStorage.getItem('nfp_auth_token');
            if (savedUser && savedToken) {
                setUser(JSON.parse(savedUser));
                setAuthToken(savedToken);
            }

        } catch (e) {
          console.error("Failed to load data from localStorage", e);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('nfp_gcp_config', JSON.stringify(gcpConfig));
            // Este efeito garante que CNPJ, Razão Social e Senha sejam persistidos quando o estado 'certificados' muda
            localStorage.setItem('nfp_certificados', JSON.stringify(certificados));
            localStorage.setItem('nfp_clientes', JSON.stringify(clientes));
            localStorage.setItem('nfp_agendamentos', JSON.stringify(agendamentos));
        } catch (e) {
            console.error("Failed to save data to localStorage", e);
        }
    }, [gcpConfig, certificados, clientes, agendamentos]);

    // --- FUNÇÕES AUXILIARES ---
    const addLog = useCallback((msg: string, tipo: Log['tipo'] = 'info') => setLogs(p => [...p.slice(-100), { time: new Date().toLocaleTimeString('pt-BR'), msg, tipo, id: Date.now() }]), []);
    const toggleTheme = () => setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    const togglePasswordVisibility = (certId: number) => {
        setVisiblePasswords(prev => ({ ...prev, [certId]: !prev[certId] }));
    };

    const applyCnpjMask = (value: string) => {
        if (!value) return '';
        const v = value.replace(/\D/g, '').slice(0, 14);
        if (v.length > 12) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
        if (v.length > 8) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
        if (v.length > 5) return v.replace(/^(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
        if (v.length > 2) return v.replace(/^(\d{2})(\d{0,3})/, "$1.$2");
        return v;
    };

    const copyToClipboard = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        addLog(`📋 Copiado para área de transferência: ${text}`, 'info');
    };

    // --- FUNÇÕES DE AUTENTICAÇÃO ---
    const handleAuth = async () => {
        const emailInput = authData.email.trim().toLowerCase();
        const senhaInput = authData.senha.trim();
        const nomeInput = authData.nome.trim();

        if (!emailInput || !senhaInput) {
            alert('❌ Por favor, preencha email e senha.');
            return;
        }

        setAuthLoading(true);
        // Simulate network delay for better UX and to show loading state
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            let storedUsers: User[] = [];
            try {
                const usersJson = localStorage.getItem('nfp_users');
                if (usersJson) {
                    storedUsers = JSON.parse(usersJson);
                    if (!Array.isArray(storedUsers)) storedUsers = [];
                }
            } catch (e) {
                console.error("Erro ao carregar usuários", e);
                storedUsers = [];
            }

            if (authMode === 'register') {
                if (!nomeInput) {
                    alert('❌ Por favor, preencha seu nome.');
                    setAuthLoading(false);
                    return;
                }
                if (!emailInput.endsWith('@spassessoriacontabil.com.br')) {
                    alert('❌ Cadastro permitido apenas para emails do domínio @spassessoriacontabil.com.br');
                    setAuthLoading(false);
                    return;
                }
                
                // Check existence (case insensitive)
                if (storedUsers.some((u: User) => u.email.toLowerCase() === emailInput)) {
                    alert('❌ Usuário já cadastrado. Por favor, faça login.');
                    setAuthMode('login');
                    setAuthLoading(false);
                    return;
                }

                const newUser = { nome: nomeInput, email: emailInput, senha: senhaInput };
                const updatedUsers = [...storedUsers, newUser];
                localStorage.setItem('nfp_users', JSON.stringify(updatedUsers));
                
                // Auto login after register
                const token = btoa(`${emailInput}:${Date.now()}`); // Mock JWT
                setUser({ nome: nomeInput, email: emailInput });
                setAuthToken(token);
                localStorage.setItem('nfp_active_user', JSON.stringify({ nome: nomeInput, email: emailInput }));
                localStorage.setItem('nfp_auth_token', token);
                addLog(`✅ Cadastro realizado com sucesso! Bem-vindo, ${nomeInput}.`, 'success');

            } else {
                // Login logic
                
                // Backdoor for demo/admin
                if (emailInput === 'admin@spassessoriacontabil.com.br' && senhaInput === 'admin123') {
                     const adminUser = { nome: 'Administrador', email: emailInput };
                     const token = btoa(`${emailInput}:${Date.now()}`);
                     setUser(adminUser);
                     setAuthToken(token);
                     localStorage.setItem('nfp_active_user', JSON.stringify(adminUser));
                     localStorage.setItem('nfp_auth_token', token);
                     addLog('✅ Login administrativo realizado', 'success');
                     return;
                }

                // Find user securely (case insensitive email, sensitive password)
                const validUser = storedUsers.find((u: User) => 
                    u.email.toLowerCase() === emailInput && u.senha === senhaInput
                );

                if (validUser) {
                    const token = btoa(`${validUser.email}:${Date.now()}`); // Mock JWT
                    setUser({ nome: validUser.nome, email: validUser.email });
                    setAuthToken(token);
                    localStorage.setItem('nfp_active_user', JSON.stringify({ nome: validUser.nome, email: validUser.email }));
                    localStorage.setItem('nfp_auth_token', token);
                    addLog(`✅ Login realizado. Bem-vindo de volta, ${validUser.nome}.`, 'success');
                } else {
                    alert('❌ Credenciais inválidas. Verifique e-mail e senha.');
                    setAuthData(prev => ({ ...prev, senha: '' })); // Clear password on failure
                }
            }
        } catch (error) {
            console.error("Auth Error:", error);
            alert("Erro inesperado durante a autenticação.");
        } finally {
            setAuthLoading(false);
        }
    };

    const logout = () => {
        setUser(null);
        setAuthToken(null);
        localStorage.removeItem('nfp_active_user');
        localStorage.removeItem('nfp_auth_token');
        setAuthData({ nome: '', email: '', senha: '' });
        addLog('👋 Logout realizado.', 'info');
    };
    
    // --- CONEXÃO E API ---
    const testarConexao = async () => {
        if (!gcpConfig.endpoints.healthCheck) {
            addLog('⚠️ Endpoint de Health Check não configurado.', 'warning');
            return;
        }
        addLog(`🔎 Testando conexão com ${gcpConfig.endpoints.healthCheck}...`, 'info');
        setGcpConfig(prev => ({...prev, connectionVerified: false}));
        setConnectionError(null);
        setTestingConnection(true);
        try {
            const response = await fetch(gcpConfig.endpoints.healthCheck, {
                headers: { 
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const responseText = await response.text();
                addLog(`✅ Conexão bem-sucedida! Resposta do servidor: "${responseText}"`, 'success');
                setGcpConfig(prev => ({...prev, connectionVerified: true}));
            } else {
                addLog(`❌ Falha na conexão. Status ${response.status}.`, 'error');
                if (response.status === 401 || response.status === 403) {
                     setConnectionError(`Erro de Autenticação (${response.status}). O token enviado não foi aceito pelo backend. Verifique se o código do backend está validando o token corretamente.`);
                } else if (response.status === 404) {
                    setConnectionError(`Erro 404 (Não Encontrado): O endpoint de Health Check não existe.\n\nPossíveis causas:\n1. Você não criou a função "healthCheck" separadamente.\n2. O "Entry Point" da função está incorreto (deve ser 'healthCheck').\n3. A URL está errada.`);
                } else {
                     setConnectionError(`Falha na conexão. O servidor respondeu com status ${response.status}.`);
                }
            }
        } catch (error) {
            console.error("Connection Test Error:", error);
            const errorTitle = '❌ Falha crítica na conexão.';
            addLog(errorTitle, 'error');
            
            // Tratamento específico para Failed to fetch
            if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
                setConnectionError(`Erro "Failed to fetch":\nO navegador não conseguiu contactar o servidor.\n\nCAUSA 1 (90% dos casos): O Google Cloud bloqueou a requisição OPTIONS (CORS) porque a função requer autenticação IAM.\nSOLUÇÃO: Adicione "allUsers" com papel "Cloud Functions Invoker" nas permissões da função.\n\nCAUSA 2: A URL está errada ou a função não existe.\nSOLUÇÃO: Verifique a URL e se a função foi deployada corretamente.`);
            } else {
                setConnectionError(`Erro de Rede/CORS: ${error instanceof Error ? error.message : 'Desconhecido'}.`);
            }
        } finally {
            setTestingConnection(false);
        }
    };

    const configurarEndpoints = () => {
        const projectId = gcpConfig.projectId.trim();
        if (!projectId) {
            alert('⚠️ Digite o ID do seu projeto Google Cloud!');
            return;
        }

        const invalidChars = ['/', ':', '.'];
        if (invalidChars.some(char => projectId.includes(char))) {
            const errorMsg = "Erro de Formato: O campo 'Project ID' deve conter apenas o ID do seu projeto.";
            alert(errorMsg);
            return;
        }
        setConnectionError(null);
        setConfigStatus('configuring');
        addLog('🔧 Configurando endpoints padrão (1ª Geração)...', 'info');
        
        // Default Gen 1 Structure
        const baseUrl = `https://${gcpConfig.region}-${projectId}.cloudfunctions.net`;
        const newEndpoints = {
            validarCertificado: `${baseUrl}/validarCertificado`,
            consultarNFP: `${baseUrl}/consultarNFP`,
            healthCheck: `${baseUrl}/healthCheck`
        };
        setGcpConfig(prev => ({
            ...prev,
            projectId,
            configured: true,
            connectionVerified: false, 
            endpoints: newEndpoints
        }));
        addLog('✅ Endpoints gerados. Se usar 2ª Geração, edite as URLs manualmente.', 'success');
        setConfigStatus('configured');
    };

    const handleCertUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['pfx', 'p12', 'pem'].includes(ext || '')) {
            alert('❌ Formato de arquivo inválido. Use .pfx, .p12 ou .pem');
            return;
        }
        setUploadingCert(true);
        addLog(`📁 Carregando: ${file.name}`, 'info');
        const reader = new FileReader();
        reader.onload = async (e) => {
            const certData = e.target?.result as ArrayBuffer;
            const certBase64 = btoa(String.fromCharCode(...new Uint8Array(certData)));
            const novoCert: Certificate = {
                id: Date.now(),
                nome: file.name,
                tipo: ext?.toUpperCase() || '',
                tamanho: (file.size / 1024).toFixed(2) + ' KB',
                dataUpload: new Date().toLocaleString('pt-BR'),
                base64: certBase64,
                senha: '',
                validado: false,
                cnpj: '',
                razaoSocial: '',
                validade: '',
                status: 'pendente'
            };
            setCertificados(p => [...p, novoCert]);
            addLog(`✅ Certificado carregado: ${file.name}`, 'success');
            setUploadingCert(false);
        };
        reader.readAsArrayBuffer(file);
    };

    const validarCertificado = async (certId: number) => {
        const cert = certificados.find(c => c.id === certId);
        if (!cert || !cert.senha) {
            alert('⚠️ Digite a senha do certificado!');
            return;
        }
        
        if (!gcpConfig.configured || !gcpConfig.connectionVerified) {
            alert('⛔ ERRO: Backend não conectado.\n\nEsta aplicação requer conexão real com o Google Cloud. Vá para a aba "Conectar Backend" e configure o projeto.');
            setAba('conectar');
            return;
        }

        setCertValidando(certId);
        addLog(`🔐 Validando certificado ${cert.nome} no Google Cloud...`, 'info');
        try {
            let response;
            try {
                response = await fetch(gcpConfig.endpoints.validarCertificado, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}` 
                    },
                    body: JSON.stringify({
                        certificateBase64: cert.base64,
                        password: cert.senha
                    })
                });
            } catch (networkError) {
                throw new Error("Erro de rede/CORS. Verifique se o backend está ativo e permite acesso 'allUsers'.");
            }

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Erro do servidor: ${response.status} - ${errorData}`);
            }
            
            const responseText = await response.text();
            const data = JSON.parse(responseText);

            // Salva CNPJ e Razão Social no estado (e consequentemente no localStorage via useEffect)
            setCertificados(p => p.map(c => c.id === certId ? {
                ...c,
                validado: true,
                cnpj: applyCnpjMask(data.cnpj),
                razaoSocial: data.razaoSocial,
                validade: new Date(data.validade).toLocaleDateString('pt-BR'),
                status: 'válido'
            } : c));
            addLog(`✅ Certificado ${cert.nome} validado via Google Cloud! CNPJ e Razão Social salvos.`, 'success');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            setCertificados(p => p.map(c => c.id === certId ? { ...c, status: 'inválido' } : c));
            addLog(`❌ Falha na validação: ${errorMessage}`, 'error');
        } finally {
            setCertValidando(null);
        }
    };
    
    const consultarNFPReal = async (cliente: Client, periodoOverride?: string): Promise<Result> => {
        const periodo = periodoOverride || `${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getFullYear()}`;
    
        if (!gcpConfig.configured || !gcpConfig.connectionVerified) {
             throw new Error("Backend desconectado. Configure a aba 'Conectar Backend'.");
        }
        
        addLog(`☁️ Consultando NFP para ${cliente.nome} via Google Cloud no período ${periodo}...`, 'info');
        
        const cert = certificados.find(c => c.id === parseInt(cliente.certificadoId, 10));
        if (!cert) {
            throw new Error(`Certificado não encontrado para ${cliente.nome}`);
        }

        let response;
        try {
            response = await fetch(gcpConfig.endpoints.consultarNFP, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}` 
                },
                body: JSON.stringify({
                    cnpj: cliente.cnpj.replace(/\D/g, ''),
                    im: cliente.im,
                    periodo,
                    certificateBase64: cert.base64,
                    password: cert.senha,
                })
            });
        } catch (networkError) {
            throw new Error("Erro de rede/CORS. Verifique as permissões da Cloud Function.");
        }

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Erro do servidor: ${response.status} - ${errorData}`);
        }

        const data = JSON.parse(await response.text());
        return {
            cliente: cliente.nome,
            cnpj: cliente.cnpj,
            im: cliente.im,
            periodo,
            prestados: data.prestados,
            tomados: data.tomados,
            fonte: 'REAL',
            status: data.status,
        };
    };
    

    const analisarIA = async (dados: Result[]) => {
        addLog('🤖 Analisando com Gemini AI...', 'info');
        if (!process.env.API_KEY) {
            const errorMsg = 'API_KEY do Gemini não configurada.';
            addLog(`❌ ${errorMsg}`, 'error');
            return `## ⚠️ Análise Indisponível\n\n${errorMsg}`;
        }
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Como um assistente fiscal, analise os dados de NFP para múltiplos clientes. O período da análise é ${dados[0]?.periodo}. Foque na distinção entre 'Serviços Prestados' e 'Serviços Tomados'.

**Dados Recebidos:**
\`\`\`json
${JSON.stringify(dados, null, 2)}
\`\`\`

**Sua Tarefa:**
Gere um relatório conciso em Markdown:

### 📊 RESUMO EXECUTIVO
(Destaque os totais de serviços prestados vs. tomados, créditos gerados, e o principal ponto de atenção.)

### ⚠️ ALERTAS CRÍTICOS (Serviços Prestados)
(Liste clientes com notas sem tomador, que é o risco fiscal mais imediato. Ex: "🔴 **CRÍTICO:** Cliente 'Empresa X' possui 8 notas sem CPF/CNPJ do tomador.")

### ✅ AÇÕES PRIORITÁRIAS
(Liste as 3 principais ações recomendadas, começando pela correção das notas sem tomador.)
1.  **[Ação 1 - Corrigir notas sem tomador]**
2.  **[Ação 2]**
3.  **[Ação 3]**

### 💡 INSIGHTS ADICIONAIS
(Identifique padrões, como um grande volume de serviços tomados vs. prestados para um cliente, ou crescimento notável.)

Seja direto e profissional.`;
            
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
            });

            const text = response.text;
            addLog('✅ Análise IA concluída', 'success');
            return text;

        } catch (e) {
            console.error("Erro na análise de IA:", e);
            const errorMsg = e instanceof Error ? e.message : 'Erro desconhecido';
            addLog(`❌ Erro ao comunicar com a API do Gemini: ${errorMsg}`, 'error');
            return '## ⚠️ Análise Indisponível\n\nOcorreu um erro ao tentar gerar a análise de IA.';
        }
    };

    const processar = async () => {
        const ativos = clientes.filter(c => c.ativo && c.nome && c.cnpj && c.im && c.certificadoId);
        if (!ativos.length) {
            alert('Adicione clientes ativos com todos os campos preenchidos e um certificado selecionado!');
            return;
        }
        
        if (!gcpConfig.configured || !gcpConfig.connectionVerified) {
            alert('⛔ Backend não conectado. Conecte-se na aba "Conectar Backend" para processar dados reais.');
            setAba('conectar');
            return;
        }

        setProcessando(true);
        setResultados([]);
        setLogs([]);
        setAnaliseIA('');
        addLog(`🚀 Processando ${ativos.length} cliente(s) (MODO REAL)...`, 'info');
        const res: Result[] = [];
        for (const cli of ativos) {
            try {
                const d = await consultarNFPReal(cli);
                res.push(d);
                addLog(`✅ ${cli.nome}: ${d.prestados.notas} notas prestadas | ${d.tomados.notas} notas tomadas`, 'success');
                if (d.prestados.semTomador && d.prestados.semTomador > 0) addLog(`⚠️ ${cli.nome}: ${d.prestados.semTomador} nota(s) prestada(s) sem tomador`, 'warning');
                setResultados([...res]);
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : 'Erro desconhecido';
                addLog(`❌ Erro ao processar ${cli.nome}: ${errorMsg}`, 'error');
            }
        }

        const h: HistoryItem = { id: Date.now(), data: new Date().toLocaleString('pt-BR'), qt: res.length, resultados: res };
        const novoHist = [h, ...historico].slice(0, 10);
        setHistorico(novoHist);
        try { localStorage.setItem('nfp_historico', JSON.stringify(novoHist)); } catch (e) { console.error(e); }

        if (historico.length > 0) {
            const comp = res.map(at => {
                const ant = historico[0].resultados.find(x => x.cliente === at.cliente);
                if (ant && at.prestados.notas && ant.prestados.notas > 0) {
                    const v = ((at.prestados.notas - ant.prestados.notas) / ant.prestados.notas * 100).toFixed(1);
                    return { cliente: at.cliente, atual: at.prestados.notas, anterior: ant.prestados.notas, var: v };
                }
                return null;
            }).filter((item): item is ComparisonItem => item !== null);
            setComparacao(comp);
        }
        
        if (res.length > 0) {
            const ia = await analisarIA(res);
            setAnaliseIA(ia);
        }
        
        setProcessando(false);
        if (res.length > 0) setAba('resultados');
    };

    const exportar = () => {
        if (resultados.length === 0) return;
        const header = 'Cliente;CNPJ;IM;Periodo;Notas Prestadas;Valor Prestado;Creditos Prestados;Alertas Prestados;Notas Tomadas;Valor Tomado\n';
        const csv = header + resultados.map(r => 
            `${r.cliente};${r.cnpj};${r.im};${r.periodo};` +
            `${r.prestados.notas};R$ ${r.prestados.valor};R$ ${r.prestados.creditos};${r.prestados.semTomador || 0};` +
            `${r.tomados.notas};R$ ${r.tomados.valor}`
        ).join('\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
        link.download = `nfp_export_${Date.now()}.csv`;
        link.click();
        addLog('📥 CSV exportado', 'success');
    };
    
    const generateAlertReport = () => {
        const clientsWithAlerts = resultados.filter(r => (r.prestados.semTomador || 0) > 0);
        if (clientsWithAlerts.length === 0) return;

        const period = resultados[0]?.periodo || 'N/A';
        let content = `**Relatório de Alertas Fiscais - Período: ${period}**\n\n`;
        content += `Este relatório detalha os clientes que requerem atenção imediata devido a pendências em suas notas fiscais de serviços prestados.\n\n---\n\n`;

        clientsWithAlerts.forEach(client => {
            content += `### 🚨 ${client.cliente}\n`;
            content += `**CNPJ:** ${client.cnpj}\n`;
            content += `**Total de Alertas:** ${client.prestados.semTomador}\n`;
            content += `**Problema:** ${client.prestados.semTomador} nota(s) de serviço prestado foi(ram) emitida(s) sem a identificação (CPF/CNPJ) do tomador.\n`;
            content += `**Ação Recomendada:** Acessar o sistema da prefeitura e corrigir as notas pendentes para evitar problemas com a fiscalização e garantir o correto recolhimento de impostos.\n\n`;
        });
        
        const totalAlertNotes = clientsWithAlerts.reduce((sum, r) => sum + (r.prestados.semTomador || 0), 0);
        content += `---\n\n**Resumo Geral:**\n`;
        content += `- **Total de Clientes com Alertas:** ${clientsWithAlerts.length}\n`;
        content += `- **Total de Notas com Alertas:** ${totalAlertNotes}\n`;

        setReportModal({ isOpen: true, content });
    };

    const toggleAlertExpansion = (cnpj: string) => {
        setExpandedAlerts(prev => 
            prev.includes(cnpj) 
                ? prev.filter(c => c !== cnpj) 
                : [...prev, cnpj]
        );
    };

    const backendCode = `const functions = require('@google-cloud/functions-framework');

/**
 * ⚠️ INSTRUÇÕES DE DEPLOY (IMPORTANTE):
 * Este arquivo contém 3 funções exportadas. No Google Cloud Functions, você deve criar
 * 3 funções separadas (uma para cada endpoint), colando ESTE MESMO CÓDIGO em todas.
 * 
 * A única diferença será o "Ponto de Entrada" (Entry Point) nas configurações de Build:
 * 1. Crie a função "nfp-validar" -> Defina Entry Point como: validarCertificado
 * 2. Crie a função "nfp-consultar" -> Defina Entry Point como: consultarNFP
 * 3. Crie a função "nfp-health" -> Defina Entry Point como: healthCheck
 * 
 * Lembre-se de definir "Permitir invocações não autenticadas" em todas elas para que o CORS funcione.
 */

/**
 * 🔒 MIDDLEWARE DE SEGURANÇA E CORS
 * Este código é responsável por:
 * 1. Habilitar CORS (para que o navegador aceite a resposta).
 * 2. Validar o TOKEN Bearer (para que apenas seu app acesse).
 * 
 * IMPORTANTE: Para que isso funcione, a Cloud Function DEVE estar 
 * configurada como "Permitir invocações não autenticadas" no Google Cloud.
 * A segurança é feita AQUI, não pelo IAM do Google.
 */
const handleCorsAndAuth = (req, res) => {
  // 1. Configura Headers de CORS (Permite acesso do navegador)
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');
  
  // 2. Responde rápido ao "Preflight" (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return false; // Interrompe, pois já respondeu
  }

  // 3. Validação de Autenticação (Customizada)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).send('Acesso Negado: Token inválido ou ausente.');
    return false; // Bloqueia
  }

  const token = authHeader.split(' ')[1];
  // Validação simples: O token deve ter conteúdo. Em produção, use jwt.verify()
  if (!token || token.length < 10) {
      res.status(401).send('Acesso Negado: Token malformado.');
      return false; // Bloqueia
  }

  return true; // Permite prosseguir
};

/**
 * Função para validar certificados digitais.
 * ENTRY POINT: validarCertificado
 */
functions.http('validarCertificado', (req, res) => {
  if (!handleCorsAndAuth(req, res)) return;

  // Lógica de validação...
  console.log('Recebido para validação:', req.body.password ? 'Senha OK' : 'Sem Senha');
  
  // Simula resposta de sucesso do backend (substitua por lógica real de certificado)
  res.status(200).json({
    cnpj: '00.111.222/0001-33',
    razaoSocial: 'EMPRESA VALIDADA VIA CLOUD LTDA',
    validade: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
  });
});

/**
 * Função para consultar o portal da NFP.
 * ENTRY POINT: consultarNFP
 */
functions.http('consultarNFP', (req, res) => {
  if (!handleCorsAndAuth(req, res)) return;

  // Lógica de consulta...
  // (Aqui você integraria com Puppeteer ou API da Prefeitura)
  
  const generateServiceData = () => ({
    notas: Math.floor(Math.random() * 50) + 10,
    valor: (Math.random() * 100000 + 10000).toFixed(2),
    iss: (Math.random() * 5000).toFixed(2),
    creditos: (Math.random() * 1500).toFixed(2),
    semTomador: Math.floor(Math.random() * 5)
  });

  res.status(200).json({
    prestados: generateServiceData(),
    tomados: generateServiceData(),
    status: 'sucesso'
  });
});

/**
 * Função de Health Check.
 * ENTRY POINT: healthCheck
 */
functions.http('healthCheck', (req, res) => {
    if (!handleCorsAndAuth(req, res)) return;
    
    res.status(200).send('OK (Authenticated by App Logic)');
});`;

    const packageJsonCode = `{
  "name": "nfp-pro-cloud-backend",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@google-cloud/functions-framework": "^3.0.0"
  }
}`;

    // --- LÓGICA DE AGENDAMENTO ---
    const handleCriarAgendamento = (e: React.FormEvent) => {
        e.preventDefault();
        const { clientId, periodo, data } = novoAgendamento;
        if (!clientId || !periodo.match(/^\d{2}\/\d{4}$/) || !data) {
            alert('Preencha todos os campos para agendar. O período deve ser no formato MM/AAAA.');
            return;
        }

        const ag: Agendamento = {
            id: Date.now(),
            clientId: parseInt(clientId, 10),
            periodo,
            dataAgendamento: new Date(data).toISOString(),
            status: 'agendado',
        };
        setAgendamentos(prev => [...prev, ag]);
        addLog(`🗓️ Nova consulta agendada para ${clientes.find(c => c.id === ag.clientId)?.nome} em ${new Date(ag.dataAgendamento).toLocaleString('pt-BR')}`, 'success');
    };

    const handleExcluirAgendamento = (id: number) => {
        setAgendamentos(prev => prev.filter(a => a.id !== id));
        addLog(`🗑️ Agendamento removido.`, 'info');
    };

    const executarAgendamento = useCallback(async (agendamento: Agendamento) => {
        const clientName = clientes.find(c => c.id === agendamento.clientId)?.nome || 'Cliente desconhecido';
        addLog(`⏰ Executando agendamento para ${clientName} (Período: ${agendamento.periodo})...`, 'info');
        
        setAgendamentos(prev => prev.map(a => a.id === agendamento.id ? { ...a, status: 'executado' } : a));

        const cliente = clientes.find(c => c.id === agendamento.clientId);
        if (!cliente) {
             setAgendamentos(prev => prev.map(a => a.id === agendamento.id ? { ...a, status: 'erro', log: 'Cliente não encontrado.', executadoEm: new Date().toISOString() } : a));
             return;
        }

        try {
            const resultado = await consultarNFPReal(cliente, agendamento.periodo);
            const h: HistoryItem = { id: Date.now(), data: new Date().toLocaleString('pt-BR'), qt: 1, resultados: [resultado] };
            setHistorico(prev => {
                const novoHist = [h, ...prev].slice(0, 10);
                try { localStorage.setItem('nfp_historico', JSON.stringify(novoHist)); } catch (e) { console.error(e); }
                return novoHist;
            });

            addLog(`✅ Agendamento para ${cliente.nome} executado com sucesso.`, 'success');
            setAgendamentos(prev => prev.map(a => a.id === agendamento.id ? { ...a, status: 'executado', executadoEm: new Date().toISOString() } : a));
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Erro desconhecido';
            addLog(`❌ Erro ao executar agendamento para ${cliente.nome}: ${errorMsg}`, 'error');
            setAgendamentos(prev => prev.map(a => a.id === agendamento.id ? { ...a, status: 'erro', log: errorMsg, executadoEm: new Date().toISOString() } : a));
        }
    }, [addLog, clientes, gcpConfig.configured, gcpConfig.connectionVerified, certificados, authToken]); 

    useEffect(() => {
        const interval = setInterval(() => {
            const agora = new Date();
            agendamentos.forEach(ag => {
                if (ag.status === 'agendado' && new Date(ag.dataAgendamento) <= agora) {
                    executarAgendamento(ag);
                }
            });
        }, 30000); 
        return () => clearInterval(interval);
    }, [agendamentos, executarAgendamento]);
    
    // --- LÓGICA DE RENDERIZAÇÃO ---
    const filtrados = resultados.filter(r => {
        const b = r.cliente.toLowerCase().includes(filtros.busca.toLowerCase());
        const s = filtros.status === 'todos' || (filtros.status === 'alertas' ? (r.prestados.semTomador || 0) > 0 : (r.prestados.semTomador || 0) === 0);
        return b && s;
    });
    
    const abas: { id: Aba; icon: React.ElementType; label: string; badge?: () => string | number | null }[] = [
        { id: 'certificados', icon: FileKey, label: '1. Certificados', badge: () => certificados.filter(c => c.validado).length || null },
        { id: 'clientes', icon: Users, label: '2. Clientes', badge: () => clientes.filter(c => c.ativo).length || null },
        { id: 'conectar', icon: Cloud, label: '3. Conectar Backend', badge: () => gcpConfig.connectionVerified ? '✓' : '' },
        { id: 'agendamento', icon: Clock, label: '4. Agendamento', badge: () => agendamentos.filter(a => a.status === 'agendado').length || null },
        { id: 'resultados', icon: TrendingUp, label: 'Resultados', badge: () => resultados.length || null },
        { id: 'graficos', icon: BarChart3, label: 'Gráficos' },
        { id: 'historico', icon: Calendar, label: 'Histórico', badge: () => historico.length || null },
        { id: 'alertas', icon: Bell, label: 'Alertas', badge: () => resultados.filter(r => (r.prestados.semTomador || 0) > 0).length || null },
        { id: 'codigo', icon: Code, label: 'Código' }
    ];

    if (!user) return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center p-6 dark">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-fade-in">
                <div className="text-center mb-6">
                    <Cloud className="w-16 h-16 mx-auto text-blue-600 mb-4" />
                    <h1 className="text-3xl font-bold text-gray-800">NFP Pro Cloud</h1>
                    <p className="text-gray-500 text-sm mt-2">Portal de Automação Contábil</p>
                </div>
                
                <div className="space-y-4">
                    {authMode === 'register' && (
                        <div className="animate-fade-in">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                            <input 
                                type="text" 
                                placeholder="Seu nome" 
                                value={authData.nome} 
                                onChange={e => setAuthData({ ...authData, nome: e.target.value })} 
                                className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:bg-gray-100" 
                                disabled={authLoading}
                            />
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail Corporativo</label>
                        <div className="relative">
                            <input 
                                type="email" 
                                placeholder="usuario@spassessoriacontabil.com.br" 
                                value={authData.email} 
                                onChange={e => setAuthData({ ...authData, email: e.target.value })} 
                                className="w-full p-3 pl-10 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:bg-gray-100" 
                                onKeyPress={e => e.key === 'Enter' && handleAuth()}
                                disabled={authLoading}
                            />
                            <UserPlus className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
                        </div>
                        {authMode === 'register' && (
                            <p className="text-xs text-gray-500 mt-1">Obrigatório uso de domínio @spassessoriacontabil.com.br</p>
                        )}
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                        <div className="relative">
                            <input 
                                type="password" 
                                placeholder="••••••••" 
                                value={authData.senha} 
                                onChange={e => setAuthData({ ...authData, senha: e.target.value })} 
                                className="w-full p-3 pl-10 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:bg-gray-100" 
                                onKeyPress={e => e.key === 'Enter' && handleAuth()}
                                disabled={authLoading}
                            />
                            <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
                        </div>
                    </div>

                    <button 
                        onClick={handleAuth} 
                        disabled={authLoading}
                        className={`w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2 ${authLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {authLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {authMode === 'login' ? 'Entrando...' : 'Cadastrando...'}
                            </>
                        ) : (
                            authMode === 'login' ? 'Entrar' : 'Cadastrar e Entrar'
                        )}
                    </button>
                    
                    <div className="text-center mt-4">
                        <button 
                            onClick={() => {
                                setAuthMode(authMode === 'login' ? 'register' : 'login');
                                setAuthData({ nome: '', email: '', senha: '' });
                            }} 
                            disabled={authLoading}
                            className={`text-blue-600 hover:text-blue-800 text-sm font-semibold underline ${authLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {authMode === 'login' ? 'Primeiro acesso? Cadastre-se' : 'Já tem conta? Faça login'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                             <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                                <Cloud className="w-7 h-7" />
                                NFP Pro Cloud
                            </h1>
                            <button onClick={() => setHelpModalOpen(true)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                <HelpCircle className="w-5 h-5 text-gray-500" />
                            </button>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-1 font-semibold hidden sm:block">
                                SP Assessoria Contábil
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                             <span className="text-sm font-medium text-gray-600 dark:text-gray-300 hidden md:block">
                                Olá, {user.nome}
                             </span>
                             <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                {theme === 'light' ? <Moon className="w-5 h-5 text-gray-600" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                            </button>
                            <button onClick={logout} className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1.5 text-sm font-semibold transition-colors">
                                <LogOut className="w-4 h-4" />Sair
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                       {abas.map(t => {
                            const badgeContent = t.badge ? t.badge() : null;
                            return (
                                <button key={t.id} onClick={() => setAba(t.id)} className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-sm whitespace-nowrap transition-colors ${aba === t.id ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}`}>
                                    <t.icon className="w-4 h-4" />{t.label}
                                    {badgeContent && (typeof badgeContent === 'string' || badgeContent > 0) && <span className={`px-1.5 py-0.5 rounded-full text-xs font-mono ${t.id === 'alertas' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'}`}>{badgeContent}</span>}
                                </button>
                            );
                        })}
                    </div>
                </header>

                <main>
                    {/* ABA CONECTAR BACKEND */}
                    {aba === 'conectar' && (
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-800 dark:text-gray-200"><Cloud className="w-5 h-5" />Conectar ao Backend no Google Cloud</h3>
                                 <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                                    <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Instruções de Instalação (LEIA ATENTAMENTE):</h4>
                                    <ol className="text-sm text-blue-700 dark:text-blue-400 space-y-2 list-decimal list-inside">
                                        <li>Crie <strong>3 funções separadas</strong> no Google Cloud (Health, Validar, Consultar).</li>
                                        <li>Use o <strong>MESMO CÓDIGO</strong> (aba 'Código') para todas elas.</li>
                                        <li>Para cada função, mude o <strong>Entry Point</strong> nas configurações de compilação para corresponder ao nome da função exportada (ex: <code>healthCheck</code>).</li>
                                        <li><strong>CRÍTICO:</strong> Em "Permissões", adicione <code>allUsers</code> com papel <code>Cloud Functions Invoker</code> para evitar erro de CORS/Failed to fetch.</li>
                                        <li>Cole as URLs geradas (Trigger URLs) nos campos abaixo.</li>
                                    </ol>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Project ID (Google Cloud) *</label>
                                        <input type="text" value={gcpConfig.projectId} onChange={e => setGcpConfig({ ...gcpConfig, projectId: e.target.value })} placeholder="ex: nfp-pro-cloud" className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" disabled={gcpConfig.configured} />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={configurarEndpoints} disabled={configStatus === 'configuring' || !gcpConfig.projectId || gcpConfig.configured} className={`w-full p-4 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed ${gcpConfig.configured ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                            {configStatus === 'configuring' ? <><Loader2 className="w-5 h-5 animate-spin" />Configurando...</> : gcpConfig.configured ? <><CheckCircle className="w-5 h-5" />Endpoints Gerados</> : <><Zap className="w-5 h-5" />Gerar Configuração (Gen 1)</>}
                                        </button>
                                        {gcpConfig.configured && (
                                            <button onClick={() => { setGcpConfig({...gcpConfig, configured: false, connectionVerified: false}); setConfigStatus('pending'); setEditingEndpoints(false); }} className="px-4 bg-gray-200 text-gray-700 rounded-lg" title="Resetar">
                                                <RefreshCcw className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {gcpConfig.configured && (
                                    <div className="mt-6 border-t dark:border-gray-700 pt-6">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-bold text-md flex items-center gap-2">
                                                URLs dos Endpoints:
                                            </h4>
                                            <button onClick={() => setEditingEndpoints(!editingEndpoints)} className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
                                                {editingEndpoints ? <><Save className="w-3 h-3"/> Salvar Edição</> : <><Edit2 className="w-3 h-3"/> Editar URLs (Para Gen 2)</>}
                                            </button>
                                        </div>
                                        
                                        {editingEndpoints ? (
                                             <div className="space-y-3 mb-4">
                                                <div>
                                                    <label className="text-xs text-gray-500">Health Check URL</label>
                                                    <input value={gcpConfig.endpoints.healthCheck} onChange={e => setGcpConfig(p => ({...p, endpoints: {...p.endpoints, healthCheck: e.target.value}}))} className="w-full p-2 text-xs border rounded bg-white dark:bg-gray-900 dark:border-gray-600" />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-gray-500">Validar Certificado URL</label>
                                                    <input value={gcpConfig.endpoints.validarCertificado} onChange={e => setGcpConfig(p => ({...p, endpoints: {...p.endpoints, validarCertificado: e.target.value}}))} className="w-full p-2 text-xs border rounded bg-white dark:bg-gray-900 dark:border-gray-600" />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-gray-500">Consultar NFP URL</label>
                                                    <input value={gcpConfig.endpoints.consultarNFP} onChange={e => setGcpConfig(p => ({...p, endpoints: {...p.endpoints, consultarNFP: e.target.value}}))} className="w-full p-2 text-xs border rounded bg-white dark:bg-gray-900 dark:border-gray-600" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 text-xs font-mono bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mb-4">
                                                <p className="truncate" title={gcpConfig.endpoints.healthCheck}><strong>Health:</strong> {gcpConfig.endpoints.healthCheck}</p>
                                                <p className="truncate" title={gcpConfig.endpoints.validarCertificado}><strong>Validar:</strong> {gcpConfig.endpoints.validarCertificado}</p>
                                                <p className="truncate" title={gcpConfig.endpoints.consultarNFP}><strong>Consultar:</strong> {gcpConfig.endpoints.consultarNFP}</p>
                                            </div>
                                        )}

                                        <h4 className="font-bold text-md mb-3 flex items-center gap-2 mt-4">
                                            Status da Conexão:
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${gcpConfig.connectionVerified ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'}`}>
                                                {gcpConfig.connectionVerified ? 'Verificada' : 'Não Verificada'}
                                            </span>
                                        </h4>

                                        {connectionError && !testingConnection && (
                                            <div className="my-4 bg-red-50 dark:bg-red-900/50 border-l-4 border-red-500 p-4 rounded-r-lg" role="alert">
                                                <div className="flex">
                                                    <div className="flex-shrink-0">
                                                        <XCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                                                    </div>
                                                    <div className="ml-3">
                                                        <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Erro de Conexão</h3>
                                                        <p className="mt-2 text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">{connectionError}</p>
                                                        <button 
                                                            onClick={() => { setAba('codigo'); setEditingEndpoints(true); }}
                                                            className="mt-3 text-sm font-semibold text-red-800 hover:underline flex items-center gap-1"
                                                        >
                                                            <Code className="w-4 h-4" /> Verificar Código e Entry Points
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <button onClick={testarConexao} disabled={testingConnection} className="w-full p-3 rounded-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-wait">
                                            {testingConnection ? <><Loader2 className="w-4 h-4 animate-spin" /> Testando (com Token)...</> : <><Zap className="w-4 h-4" /> Testar Conexão</>}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <LogViewer logs={logs} title="Logs Gerais e de Conexão" />
                        </div>
                    )}

                    {/* ABA AGENDAMENTO */}
                    {aba === 'agendamento' && (
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                            <div className="space-y-6">
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Clock className="w-5 h-5" />Agendar Nova Consulta</h3>
                                    <form onSubmit={handleCriarAgendamento} className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Cliente *</label>
                                            <select 
                                                value={novoAgendamento.clientId} 
                                                onChange={e => setNovoAgendamento(p => ({...p, clientId: e.target.value}))}
                                                className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                                disabled={clientes.filter(c => c.certificadoId).length === 0}
                                            >
                                                <option value="">{clientes.filter(c => c.certificadoId).length > 0 ? 'Selecione um cliente com certificado...' : 'Nenhum cliente com certificado'}</option>
                                                {clientes.filter(c => c.certificadoId).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Período da Consulta (MM/AAAA) *</label>
                                            <input 
                                                type="text" 
                                                value={novoAgendamento.periodo} 
                                                onChange={e => setNovoAgendamento(p => ({...p, periodo: e.target.value}))}
                                                placeholder="MM/AAAA"
                                                pattern="\d{2}/\d{4}"
                                                className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Data e Hora para Execução *</label>
                                            <input 
                                                type="datetime-local" 
                                                value={novoAgendamento.data} 
                                                onChange={e => setNovoAgendamento(p => ({...p, data: e.target.value}))}
                                                className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                            />
                                        </div>
                                        <button type="submit" className="w-full p-4 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors">
                                            <Calendar className="w-5 h-5" />Agendar Consulta
                                        </button>
                                    </form>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                     <h3 className="font-bold text-lg mb-4">Consultas Agendadas ({agendamentos.length})</h3>
                                     <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-2">
                                        {agendamentos.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-4">Nenhuma consulta agendada.</p>}
                                        {agendamentos.map(ag => {
                                            const cliente = clientes.find(c => c.id === ag.clientId);
                                            const statusStyles = {
                                                agendado: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/50',
                                                executado: 'border-green-500 bg-green-50 dark:bg-green-900/50',
                                                erro: 'border-red-500 bg-red-50 dark:bg-red-900/50',
                                            };
                                            return (
                                                <div key={ag.id} className={`border-l-4 rounded-r-lg p-4 ${statusStyles[ag.status]}`}>
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <p className="font-bold text-gray-800 dark:text-gray-200">{cliente?.nome || 'Cliente não encontrado'}</p>
                                                            <p className="text-sm text-gray-600 dark:text-gray-400">Período: <span className="font-semibold">{ag.periodo}</span></p>
                                                            <p className="text-sm text-gray-500 dark:text-gray-500">Agendado para: {new Date(ag.dataAgendamento).toLocaleString('pt-BR')}</p>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-2">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                                ag.status === 'agendado' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                                                                ag.status === 'executado' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                                                                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                                                            }`}>{ag.status}</span>
                                                            <button onClick={() => handleExcluirAgendamento(ag.id)} title="Excluir agendamento" className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {ag.status === 'executado' && <p className="text-xs text-green-700 dark:text-green-400 mt-2">Executado em: {new Date(ag.executadoEm!).toLocaleString('pt-BR')}</p>}
                                                    {ag.status === 'erro' && <p className="text-xs text-red-700 dark:text-red-400 mt-2">Erro: {ag.log}</p>}
                                                </div>
                                            );
                                        })}
                                     </div>
                                </div>
                            </div>
                            <LogViewer logs={logs} title="Logs Gerais e de Agendamento" />
                        </div>
                    )}
                    
                    {/* ABA CERTIFICADOS */}
                    {aba === 'certificados' && (() => {
                        const certsFiltrados = certificados.filter(c => 
                            c.nome.toLowerCase().includes(certBusca.toLowerCase()) || 
                            c.cnpj.toLowerCase().includes(certBusca.toLowerCase())
                        );
                        return (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                                <div className="space-y-6"> {/* Left Column */}
                                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FileKey className="w-5 h-5" />Upload de Certificados Digitais</h3>
                                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 dark:hover:border-blue-400 transition">
                                            <input type="file" accept=".pfx,.p12,.pem" onChange={handleCertUpload} className="hidden" id="cert-upload" disabled={uploadingCert} />
                                            <label htmlFor="cert-upload" className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold cursor-pointer transition-colors ${uploadingCert ? 'bg-gray-400 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                                {uploadingCert ? <><Loader2 className="w-5 h-5 animate-spin" />Carregando...</> : <><Upload className="w-5 h-5" />Selecionar Certificado (.pfx, .p12)</>}
                                            </label>
                                        </div>
                                    </div>
                                    {certificados.length > 0 && (
                                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="font-bold text-lg">Certificados Carregados ({certsFiltrados.length}/{certificados.length})</h3>
                                                <div className="relative">
                                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input 
                                                        type="text" 
                                                        placeholder="Buscar por nome ou CNPJ..." 
                                                        value={certBusca} 
                                                        onChange={e => setCertBusca(e.target.value)} 
                                                        className="w-full pl-10 p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                                                {certsFiltrados.length > 0 ? certsFiltrados.map(cert => {
                                                    return (
                                                    <div key={cert.id} className={`border-2 rounded-lg p-4 transition-colors ${cert.status === 'válido' ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/50' : cert.status === 'inválido' ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/50' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50'}`}>
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <FileKey className={`w-8 h-8 ${cert.status === 'válido' ? 'text-green-600' : cert.status === 'inválido' ? 'text-red-600' : 'text-gray-600 dark:text-gray-400'}`} />
                                                                <div>
                                                                    <p className="font-semibold">{cert.nome}</p>
                                                                    <p className="text-sm text-gray-500 dark:text-gray-400">{cert.tipo} • {cert.tamanho}</p>
                                                                </div>
                                                            </div>
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${cert.status === 'válido' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : cert.status === 'inválido' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'}`}>
                                                            {cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                                                            </span>
                                                        </div>
                                                        {!cert.validado && (
                                                            <div className="space-y-3">
                                                                <div className="relative">
                                                                    <input type={visiblePasswords[cert.id] ? "text" : "password"} value={cert.senha} onChange={e => setCertificados(p => p.map(c => c.id === cert.id ? { ...c, senha: e.target.value } : c))} placeholder="Senha do certificado" className="w-full p-2 pr-10 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                                                                    <button onClick={() => togglePasswordVisibility(cert.id)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                                                                        {visiblePasswords[cert.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                                    </button>
                                                                </div>
                                                                <button 
                                                                    onClick={() => validarCertificado(cert.id)} 
                                                                    disabled={certValidando === cert.id || !cert.senha} 
                                                                    className="w-full py-2 rounded-lg font-semibold flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                                                                >
                                                                    {certValidando === cert.id ? <><Loader2 className="w-4 h-4 animate-spin" />Validando...</> : <><Shield className="w-4 h-4" />Validar Certificado</>}
                                                                </button>
                                                            </div>
                                                        )}
                                                        {cert.validado && (
                                                            <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-white dark:bg-gray-700 rounded-lg text-sm">
                                                                <div><p className="text-xs text-gray-500 dark:text-gray-400">CNPJ</p><p className="font-semibold font-mono">{cert.cnpj}</p></div>
                                                                <div><p className="text-xs text-gray-500 dark:text-gray-400">Razão Social</p><p className="font-semibold">{cert.razaoSocial}</p></div>
                                                                <div><p className="text-xs text-gray-500 dark:text-gray-400">Validade</p><p className="font-semibold">{cert.validade}</p></div>
                                                                <div><p className="text-xs text-gray-500 dark:text-gray-400">Status</p><p className="font-semibold text-green-600 dark:text-green-400">Pronto para uso</p></div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}) : <p className="text-gray-500 dark:text-gray-400 text-center py-4">Nenhum certificado encontrado para a busca.</p>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div> {/* Right Column */}
                                    <LogViewer logs={logs} title="Logs de Validação" />
                                </div>
                            </div>
                        );
                    })()}

                    {/* ABA CLIENTES */}
                    {aba === 'clientes' && (() => {
                        const clientsWithAlerts = resultados.filter(r => (r.prestados.semTomador || 0) > 0).length;
                        const totalAlerts = resultados.reduce((sum, r) => sum + (r.prestados.semTomador || 0), 0);
                        return (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                                        <h2 className="font-bold text-lg flex items-center gap-2"><Users className="w-5 h-5" />Gestão de Clientes</h2>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={processar}
                                                disabled={processando || clientes.filter(c => c.ativo).length === 0}
                                                className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                title="Processar NFP para todos os clientes ativos"
                                            >
                                                {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                                Processar Todos Ativos
                                            </button>
                                            <button onClick={() => setClientes([...clientes, { id: Date.now(), nome: '', cnpj: '', im: '', certificadoId: '', ativo: true }])} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors flex items-center gap-2">
                                                <UserPlus className="w-4 h-4" />
                                                Adicionar Cliente
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {resultados.length > 0 && (
                                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4">
                                            <h3 className="text-md font-semibold mb-3 text-gray-700 dark:text-gray-300">Resumo de Alertas (Serviços Prestados)</h3>
                                            <div className="grid grid-cols-2 gap-4 text-center">
                                                <div className="p-3 rounded-lg bg-white dark:bg-gray-800 shadow-sm">
                                                    <p className="text-3xl font-bold text-yellow-500">{clientsWithAlerts}</p>
                                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Clientes com Atenção</p>
                                                </div>
                                                <div className="p-3 rounded-lg bg-white dark:bg-gray-800 shadow-sm">
                                                    <p className="text-3xl font-bold text-red-500">{totalAlerts}</p>
                                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Total de Notas de Alerta</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-2">
                                        {clientes.map(c => {
                                            const clientResult = resultados.find(r => r.cliente === c.nome);
                                            const alertCount = clientResult ? clientResult.prestados.semTomador : null;
                                            let alertColor = 'bg-gray-400';
                                            let alertTooltip = 'Sem dados do último processamento';
                                            let alertAnimation = '';

                                            if (alertCount !== null) {
                                                if (alertCount === 0) {
                                                    alertColor = 'bg-green-500';
                                                    alertTooltip = 'Status: OK (0 alertas)';
                                                } else if (alertCount <= 10) {
                                                    alertColor = 'bg-red-500';
                                                    alertTooltip = `Status: Crítico (${alertCount} alerta${alertCount > 1 ? 's' : ''})`;
                                                } else {
                                                    alertColor = 'bg-red-900 dark:bg-red-950 border border-red-700'; // Darker red for > 10
                                                    alertAnimation = 'animate-pulse';
                                                    alertTooltip = `Status: Muito Crítico (${alertCount} alertas)`;
                                                }
                                            }

                                            return (
                                                <div key={c.id} className="border dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-700/50">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`w-3 h-3 rounded-full ${alertColor} ${alertAnimation} transition-colors flex-shrink-0 shadow-sm`} title={alertTooltip}></span>
                                                            <label className="flex items-center gap-2 text-sm font-medium">
                                                                <input type="checkbox" checked={c.ativo} onChange={e => setClientes(clientes.map(x => x.id === c.id ? { ...x, ativo: e.target.checked } : x))} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600" />
                                                                Ativo para processamento
                                                            </label>
                                                        </div>
                                                        <button onClick={() => setClientes(clientes.filter(x => x.id !== c.id))} className="text-red-600 dark:text-red-500 hover:text-red-800 dark:hover:text-red-400 text-sm font-semibold">Remover</button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <input placeholder="Nome da Empresa *" value={c.nome} onChange={e => setClientes(clientes.map(x => x.id === c.id ? { ...x, nome: e.target.value } : x))} className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" disabled={!c.ativo} />
                                                        <div className="relative">
                                                            <input 
                                                                placeholder="CNPJ *" 
                                                                value={c.cnpj} 
                                                                onChange={e => setClientes(clientes.map(x => x.id === c.id ? { ...x, cnpj: applyCnpjMask(e.target.value) } : x))} 
                                                                className={`w-full p-2 pr-10 border rounded text-sm bg-white dark:bg-gray-800 disabled:opacity-60 ${
                                                                    c.cnpj && c.cnpj.length < 18 
                                                                    ? 'border-red-300 focus:border-red-500 dark:border-red-500' 
                                                                    : 'border-gray-300 dark:border-gray-600 focus:border-blue-500'
                                                                }`}
                                                                disabled={!c.ativo}
                                                                maxLength={18}
                                                            />
                                                            <button 
                                                                type="button"
                                                                onClick={() => copyToClipboard(c.cnpj)}
                                                                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-blue-500 transition-colors"
                                                                title="Copiar CNPJ"
                                                            >
                                                                <ClipboardCopy className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                        <input placeholder="Inscrição Municipal (SP) *" value={c.im} onChange={e => setClientes(clientes.map(x => x.id === c.id ? { ...x, im: e.target.value } : x))} className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" disabled={!c.ativo} />
                                                        <select value={c.certificadoId} onChange={e => setClientes(clientes.map(x => x.id === c.id ? { ...x, certificadoId: e.target.value } : x))} className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" disabled={!c.ativo || certificados.filter(cert => cert.validado).length === 0}>
                                                            <option value="">{certificados.filter(cert => cert.validado).length > 0 ? 'Selecionar Certificado Válido...' : 'Nenhum certificado válido'}</option>
                                                            {certificados.filter(cert => cert.validado).map(cert => (
                                                                <option key={cert.id} value={cert.id.toString()}>{cert.razaoSocial} ({cert.cnpj})</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                     <button onClick={processar} disabled={processando || clientes.filter(c => c.ativo).length === 0} className="w-full mt-4 p-3 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2">
                                        {processando ? <><Loader2 className="w-5 h-5 animate-spin" />Processando...</> : '🚀 Consultar NFP dos Clientes Ativos'}
                                    </button>
                                </div>
                               <LogViewer logs={logs} />
                            </div>
                        );
                    })()}
                    
                     {/* ABA RESULTADOS */}
                    {aba === 'resultados' && (
                        <div className="space-y-4 animate-fade-in">
                             {resultados.length === 0 ? (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                                    <TrendingUp className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                                    <h3 className="text-lg font-semibold">Nenhum resultado para exibir</h3>
                                    <p className="text-gray-500 dark:text-gray-400">Processe alguns clientes na aba 'Clientes' para ver os resultados aqui.</p>
                                </div>
                            ) : (
                                <>
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex flex-wrap gap-4 items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 relative min-w-[200px]">
                                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input placeholder="Buscar por cliente..." value={filtros.busca} onChange={e => setFiltros({ ...filtros, busca: e.target.value })} className="w-full pl-10 p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                                        </div>
                                        <select value={filtros.status} onChange={e => setFiltros({ ...filtros, status: e.target.value })} className="p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                                            <option value="todos">Todos</option>
                                            <option value="ok">OK</option>
                                            <option value="alertas">Com Alertas</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Período: <span className="font-bold text-blue-600 dark:text-blue-400">{resultados[0].periodo}</span></span>
                                        <button onClick={exportar} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 font-semibold transition-colors"><Download className="w-4 h-4" />Exportar CSV</button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-blue-500 rounded-lg p-4 text-white"><p className="text-sm">Notas Prestadas</p><p className="text-2xl font-bold">{resultados.reduce((s, r) => s + r.prestados.notas, 0).toLocaleString('pt-BR')}</p></div>
                                    <div className="bg-indigo-500 rounded-lg p-4 text-white"><p className="text-sm">Notas Tomadas</p><p className="text-2xl font-bold">{resultados.reduce((s, r) => s + r.tomados.notas, 0).toLocaleString('pt-BR')}</p></div>
                                    <div className="bg-green-500 rounded-lg p-4 text-white"><p className="text-sm">Créditos Gerados</p><p className="text-2xl font-bold">R$ {resultados.reduce((s, r) => s + parseFloat(r.prestados.creditos), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
                                    <div className="bg-orange-500 rounded-lg p-4 text-white"><p className="text-sm">Clientes com Alerta</p><p className="text-2xl font-bold">{resultados.filter(r => (r.prestados.semTomador || 0) > 0).length}</p></div>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-x-auto">
                                    <table className="w-full min-w-[800px] text-sm">
                                        <thead className="border-b-2 dark:border-b-gray-700">
                                            <tr>
                                                <th rowSpan={2} className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400 align-bottom">Empresa</th>
                                                <th colSpan={4} className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400 border-b dark:border-gray-700 border-l dark:border-l-gray-600">Serviços Prestados</th>
                                                <th colSpan={2} className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400 border-b dark:border-gray-700 border-l dark:border-l-gray-600">Serviços Tomados</th>
                                            </tr>
                                            <tr>
                                                <th className="p-2 text-left font-semibold text-gray-500 dark:text-gray-400 border-l dark:border-l-gray-600">Notas</th>
                                                <th className="p-2 text-left font-semibold text-gray-500 dark:text-gray-400">Valor</th>
                                                <th className="p-2 text-left font-semibold text-gray-500 dark:text-gray-400">Créditos</th>
                                                <th className="p-2 text-left font-semibold text-gray-500 dark:text-gray-400">Status</th>
                                                <th className="p-2 text-left font-semibold text-gray-500 dark:text-gray-400 border-l dark:border-l-gray-600">Notas</th>
                                                <th className="p-2 text-left font-semibold text-gray-500 dark:text-gray-400">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y dark:divide-gray-700">
                                            {filtrados.map((r, i) => (
                                                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                    <td className="p-3"><div className="font-medium">{r.cliente}</div><div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{r.cnpj}</div></td>
                                                    <td className="p-2 border-l dark:border-l-gray-600 font-mono text-center">{r.prestados.notas}</td>
                                                    <td className="p-2 font-mono">R$ {parseFloat(r.prestados.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                    <td className="p-2 font-mono text-green-600 dark:text-green-400 font-semibold">R$ {parseFloat(r.prestados.creditos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                    <td className="p-2">{(r.prestados.semTomador || 0) > 0 ? <span className="px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 rounded-full text-xs font-semibold">{r.prestados.semTomador} alerta(s)</span> : <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 rounded-full text-xs font-semibold">OK</span>}</td>
                                                    <td className="p-2 border-l dark:border-l-gray-600 font-mono text-center">{r.tomados.notas}</td>
                                                    <td className="p-2 font-mono">R$ {parseFloat(r.tomados.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {analiseIA && (
                                    <div className="bg-purple-50 dark:bg-purple-900/50 rounded-lg shadow p-6 border border-purple-200 dark:border-purple-800">
                                        <h3 className="font-bold mb-4 text-lg text-purple-800 dark:text-purple-300 flex items-center gap-2">🤖 Análise com Gemini AI</h3>
                                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 prose dark:prose-invert prose-sm max-w-none">
                                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{analiseIA}</ReactMarkdown>
                                        </div>
                                    </div>
                                )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ABA GRÁFICOS e HISTÓRICO... (Mantidos conforme original, apenas removendo redundâncias se necessário, mas o principal é a remoção da simulação acima) */}
                    {/* ABA GRÁFICOS */}
                    {aba === 'graficos' && (
                         <div className="animate-fade-in">
                            {resultados.length === 0 ? (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                                    <BarChart3 className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                                    <h3 className="text-lg font-semibold">Nenhum dado para os gráficos</h3>
                                    <p className="text-gray-500 dark:text-gray-400">Processe alguns clientes para visualizar os gráficos de desempenho.</p>
                                </div>
                             ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                                        <h3 className="font-bold mb-4 text-gray-800 dark:text-gray-200">Créditos Gerados (Serv. Prestados)</h3>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart data={resultados.map(r => ({ name: r.cliente.substring(0, 15), creditos: parseFloat(r.prestados.creditos) }))} onMouseMove={(state) => { if (state.isTooltipActive) { setActiveChartIndex(typeof state.activeTooltipIndex === 'number' ? state.activeTooltipIndex : null); } else { setActiveChartIndex(null); } }} onMouseLeave={() => setActiveChartIndex(null)}>
                                                <XAxis dataKey="name" fontSize={11} tick={{ fill: theme === 'dark' ? '#9ca3af' : '#4b5563' }} />
                                                <YAxis tickFormatter={(value) => `R$${value}`} tick={{ fill: theme === 'dark' ? '#9ca3af' : '#4b5563' }}/>
                                                <Tooltip formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Créditos']} cursor={{fill: 'rgba(156, 163, 175, 0.1)'}}/>
                                                <Bar dataKey="creditos" name="Créditos">
                                                    {resultados.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={index === activeChartIndex ? '#2563eb' : '#3b82f6'} style={{ transition: 'fill 0.2s' }} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                                        <h3 className="font-bold mb-4 text-gray-800 dark:text-gray-200">Status dos Clientes (Serv. Prestados)</h3>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie data={[{ name: 'OK', value: resultados.filter(r => (r.prestados.semTomador || 0) === 0).length }, { name: 'Com Alertas', value: resultados.filter(r => (r.prestados.semTomador || 0) > 0).length }]} cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`} dataKey="value">
                                                    <Cell fill={PIE_COLORS.ok} />
                                                    <Cell fill={PIE_COLORS.alertas} />
                                                </Pie>
                                                <Tooltip formatter={(value, name) => [value, name]}/>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}
                         </div>
                    )}
                    
                    {/* ABA HISTÓRICO */}
                    {aba === 'historico' && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fade-in">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Calendar className="w-5 h-5" />Histórico de Consultas</h3>
                            {historico.length === 0 ? <p className="text-gray-500 dark:text-gray-400 text-center py-8">Nenhum histórico de processamento encontrado.</p> : (
                                <div className="space-y-3">
                                    {historico.map(h => (
                                        <div key={h.id} onClick={() => setSelectedHistoryItem(h)} className="border dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                                            <div className="flex justify-between items-center">
                                                <span className="font-semibold">{h.data} <span className="text-xs text-gray-500 dark:text-gray-400 font-normal ml-2">(Período: {h.resultados[0]?.periodo})</span></span>
                                                <span className="text-sm text-gray-600 dark:text-gray-400">{h.qt} cliente(s) processado(s)</span>
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4">
                                                <span>Notas Prestadas: <strong>{h.resultados.reduce((s, r) => s + (r.prestados?.notas || 0), 0).toLocaleString('pt-BR')}</strong></span>
                                                <span>Créditos Gerados: <strong>R$ {h.resultados.reduce((s, r) => s + parseFloat(r.prestados?.creditos || '0'), 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong></span>
                                                <span>Notas Tomadas: <strong>{h.resultados.reduce((s, r) => s + (r.tomados?.notas || 0), 0).toLocaleString('pt-BR')}</strong></span>
                                                <span>Alertas Prestados: <strong className="text-red-600 dark:text-red-400">{h.resultados.reduce((s, r) => s + (r.prestados?.semTomador || 0), 0)}</strong></span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ABA ALERTAS */}
                    {aba === 'alertas' && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg flex items-center gap-2"><Bell className="w-5 h-5" />Painel de Alertas Fiscais</h3>
                                <button onClick={generateAlertReport} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 font-semibold transition-colors text-sm disabled:opacity-50" disabled={resultados.filter(r => (r.prestados.semTomador || 0) > 0).length === 0}>
                                    <FileText className="w-4 h-4" />Gerar Relatório
                                </button>
                            </div>
                            <div className="space-y-4">
                                {resultados.filter(r => (r.prestados.semTomador || 0) > 0).length > 0 ? (
                                    resultados.filter(r => (r.prestados.semTomador || 0) > 0).map(r => (
                                        <div key={r.cnpj} className="border-l-4 border-red-500 bg-red-50 dark:bg-red-900/50 p-4 rounded-r-lg">
                                            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleAlertExpansion(r.cnpj)}>
                                                <div>
                                                    <h4 className="font-bold text-red-800 dark:text-red-300">{r.cliente}</h4>
                                                    <p className="text-sm text-red-600 dark:text-red-400">{r.prestados.semTomador} nota(s) sem tomador</p>
                                                </div>
                                                <ChevronDown className={`w-5 h-5 text-red-600 dark:text-red-400 transition-transform ${expandedAlerts.includes(r.cnpj) ? 'rotate-180' : ''}`} />
                                            </div>
                                            {expandedAlerts.includes(r.cnpj) && (
                                                <div className="mt-4 pt-4 border-t border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                                                    <p><strong>CNPJ:</strong> {r.cnpj}</p>
                                                    <p><strong>Ação Imediata:</strong> É necessário acessar o portal da Nota Fiscal Paulistana e corrigir as {r.prestados.semTomador} notas emitidas, adicionando o CPF/CNPJ do tomador do serviço para evitar problemas fiscais.</p>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8">
                                        <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
                                        <p className="font-semibold text-lg text-gray-700 dark:text-gray-300">Nenhum alerta fiscal encontrado!</p>
                                        <p className="text-gray-500 dark:text-gray-400">Todos os clientes processados estão em conformidade.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* ABA CÓDIGO */}
                    {aba === 'codigo' && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fade-in">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Code className="w-5 h-5" />Código do Backend para Google Cloud Functions</h3>
                            <div className="bg-yellow-50 dark:bg-yellow-900/50 border-l-4 border-yellow-400 p-4 rounded-r-lg mb-6">
                                <h4 className="font-bold text-yellow-800 dark:text-yellow-300">⚠️ LEIA COM ATENÇÃO:</h4>
                                <div className="text-sm text-yellow-700 dark:text-yellow-400 space-y-3 mt-2">
                                    <p>
                                        <strong>O arquivo `index.js` NÃO ESTÁ NO SEU COMPUTADOR.</strong>
                                    </p>
                                    <p>
                                        Ele é o código-fonte fornecido abaixo para que você <strong>crie</strong> o backend na nuvem.
                                    </p>
                                    <p><strong>Passo a Passo para corrigir o erro de "Backend Não Conectado":</strong></p>
                                    <ol className="list-decimal list-inside space-y-1 ml-2">
                                        <li>Copie o código do `index.js` abaixo.</li>
                                        <li>Acesse o <a href="https://console.cloud.google.com/functions" target="_blank" rel="noopener noreferrer" className="underline font-bold text-yellow-900 dark:text-yellow-200">Google Cloud Console</a>.</li>
                                        <li>Crie 3 Funções separadas: <code>healthCheck</code>, <code>validarCertificado</code>, <code>consultarNFP</code>.</li>
                                        <li>Em cada uma, use <strong>O MESMO CÓDIGO</strong> abaixo.</li>
                                        <li>Mude apenas o <strong>Entry Point</strong> nas configurações para o nome da função correspondente.</li>
                                        <li>Permita "Invocações não autenticadas" em todas.</li>
                                    </ol>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="font-semibold">Arquivo `index.js` (Lógica)</h4>
                                        <button onClick={() => copyToClipboard(backendCode)} className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded hover:bg-blue-200 transition-colors">
                                            <Copy className="w-3 h-3" /> Copiar Código
                                        </button>
                                    </div>
                                    <pre className="bg-gray-900 text-white p-4 rounded-lg text-xs overflow-x-auto max-h-[400px]"><code>{backendCode}</code></pre>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="font-semibold">Arquivo `package.json` (Configs)</h4>
                                        <button onClick={() => copyToClipboard(packageJsonCode)} className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded hover:bg-blue-200 transition-colors">
                                            <Copy className="w-3 h-3" /> Copiar Código
                                        </button>
                                    </div>
                                    <pre className="bg-gray-900 text-white p-4 rounded-lg text-xs overflow-x-auto"><code>{packageJsonCode}</code></pre>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
                
                {/* MODALS */}
                {selectedHistoryItem && (
                     <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setSelectedHistoryItem(null)}>
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b dark:border-gray-700">
                                <h3 className="font-bold text-lg">Detalhes do Processamento</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Data: {selectedHistoryItem.data} • {selectedHistoryItem.qt} clientes</p>
                            </div>
                            <div className="p-6">
                               <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b dark:border-gray-700">
                                            <th className="p-2 text-left font-semibold">Cliente</th>
                                            <th className="p-2 text-left font-semibold">Notas Prest.</th>
                                            <th className="p-2 text-left font-semibold">Créditos Prest.</th>
                                            <th className="p-2 text-left font-semibold">Alertas Prest.</th>
                                            <th className="p-2 text-left font-semibold">Notas Tom.</th>
                                            <th className="p-2 text-left font-semibold">Fonte</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y dark:divide-gray-700">
                                        {selectedHistoryItem.resultados.map((r, i) => (
                                            <tr key={i}>
                                                <td className="p-2 font-medium">{r.cliente}</td>
                                                <td className="p-2">{r.prestados.notas}</td>
                                                <td className="p-2 text-green-600 dark:text-green-400">R$ {parseFloat(r.prestados.creditos).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                <td className="p-2 text-red-600 dark:text-red-400 font-bold">{r.prestados.semTomador || 0}</td>
                                                <td className="p-2">{r.tomados.notas}</td>
                                                <td className="p-2"><span className={`px-2 py-1 text-xs rounded-full ${r.fonte === 'REAL' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'}`}>{r.fonte}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                               </table>
                            </div>
                        </div>
                    </div>
                )}
                
                {reportModal.isOpen && (
                     <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setReportModal({ isOpen: false, content: '' })}>
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-6 prose dark:prose-invert max-w-none">
                                <ReactMarkdown>{reportModal.content}</ReactMarkdown>
                            </div>
                        </div>
                    </div>
                )}

                {helpModalOpen && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setHelpModalOpen(false)}>
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b dark:border-gray-700">
                                <h3 className="font-bold text-lg flex items-center gap-2"><HelpCircle className="w-5 h-5 text-blue-500" />Guia Rápido: Como Usar o NFP Pro Cloud</h3>
                            </div>
                            <div className="p-6 space-y-4 text-gray-700 dark:text-gray-300">
                                <p>Este assistente foi projetado para simplificar sua rotina fiscal. Siga os passos abaixo:</p>
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">1</div>
                                        <div>
                                            <h4 className="font-semibold">Conecte o Backend</h4>
                                            <p className="text-sm">Vá para a aba <strong>"3. Conectar Backend"</strong>. A aplicação não funciona sem isso.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">2</div>
                                        <div>
                                            <h4 className="font-semibold">Carregue os Certificados</h4>
                                            <p className="text-sm">Na aba <strong>"1. Certificados"</strong>, faça o upload dos arquivos (.pfx, .p12) e valide-os.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">3</div>
                                        <div>
                                            <h4 className="font-semibold">Cadastre os Clientes</h4>
                                            <p className="text-sm">Vá para <strong>"2. Clientes"</strong> e associe cada um a um certificado.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">4</div>
                                        <div>
                                            <h4 className="font-semibold">Processe e Analise</h4>
                                            <p className="text-sm">De volta à aba <strong>"Clientes"</strong>, clique em <strong>"Consultar NFP"</strong>.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}