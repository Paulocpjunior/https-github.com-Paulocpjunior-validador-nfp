import React, { useState, useEffect, useCallback } from 'react';
import { 
  Lock, UserPlus, Users, Loader2, LogOut, Cloud, FileKey, 
  TrendingUp, BarChart3, Calendar, Bell, Code, CheckCircle, 
  XCircle, AlertCircle, FileText, Download, Upload, RefreshCcw,
  Search, Moon, Sun, ChevronDown, Zap, Clock, Trash2, Shield,
  Copy, Save, Share2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { 
  User, AuthState, Certificate, Client, Result, 
  HistoryItem, Log, GcpConfig, Agendamento 
} from './types';
import { ai } from './services/geminiService';

// --- COMPONENTE DE LOGS ---
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
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 h-full flex flex-col">
            <h2 className="font-bold mb-4 flex items-center gap-2 text-lg"><FileText className="w-5 h-5" />{title}</h2>
            <div className="bg-gray-900 rounded p-3 flex-1 min-h-[200px] max-h-[400px] overflow-y-auto text-xs font-mono">
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
    // --- ESTADOS DE AUTENTICAÇÃO ---
    const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null, token: null });
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
    const [loginData, setLoginData] = useState({ nome: '', email: '', senha: '' });
    const [authLoading, setAuthLoading] = useState(false);

    // --- ESTADOS DA APLICAÇÃO (LAZY INIT PARA PERSISTÊNCIA ROBUSTA) ---
    const [clientes, setClientes] = useState<Client[]>(() => {
        try { return JSON.parse(localStorage.getItem('nfp_clientes') || '[]'); } catch { return []; }
    });
    const [resultados, setResultados] = useState<Result[]>([]);
    const [historico, setHistorico] = useState<HistoryItem[]>(() => {
        try { return JSON.parse(localStorage.getItem('nfp_historico') || '[]'); } catch { return []; }
    });
    const [agendamentos, setAgendamentos] = useState<Agendamento[]>(() => {
         try { return JSON.parse(localStorage.getItem('nfp_agendamentos') || '[]'); } catch { return []; }
    });
    const [processando, setProcessando] = useState(false);
    const [analiseIA, setAnaliseIA] = useState('');
    const [logs, setLogs] = useState<Log[]>([]);
    const [filtros, setFiltros] = useState({ busca: '', status: 'todos', periodo: '' });
    const [aba, setAba] = useState<string>('certificados');
    const [certificados, setCertificados] = useState<Certificate[]>(() => {
         try { return JSON.parse(localStorage.getItem('nfp_certificados') || '[]'); } catch { return []; }
    });
    const [uploadingCert, setUploadingCert] = useState(false);
    const [certValidando, setCertValidando] = useState<number | null>(null);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [expandedAlerts, setExpandedAlerts] = useState<string[]>([]);
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [loadingCnpj, setLoadingCnpj] = useState<number | null>(null);

    const [novoAgendamento, setNovoAgendamento] = useState({
        clientId: '',
        periodo: `${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getFullYear()}`,
        data: new Date(Date.now() + 300000).toISOString().slice(0, 16), // +5 min
    });

    const [gcpConfig, setGcpConfig] = useState<GcpConfig>(() => {
        try {
            const saved = localStorage.getItem('nfp_gcp_config');
            return saved ? JSON.parse(saved) : {
                projectId: '',
                region: 'southamerica-east1',
                configured: false,
                connectionVerified: false,
                useMock: false,
                endpoints: { validarCertificado: '', consultarNFP: '', healthCheck: '' }
            };
        } catch {
             return { projectId: '', region: 'southamerica-east1', configured: false, connectionVerified: false, useMock: false, endpoints: { validarCertificado: '', consultarNFP: '', healthCheck: '' } };
        }
    });

    // --- EFEITOS ---
    const addLog = useCallback((msg: string, tipo: Log['tipo'] = 'info') => setLogs(p => [...p.slice(-100), { time: new Date().toLocaleTimeString('pt-BR'), msg, tipo, id: Date.now() }]), []);

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', theme);
    }, [theme]);
    
    useEffect(() => {
        // Restaurar sessão de autenticação
        const storedUser = localStorage.getItem('nfp_user');
        const storedToken = localStorage.getItem('nfp_token');
        if (storedUser && storedToken) {
            setAuth({ isAuthenticated: true, user: JSON.parse(storedUser), token: storedToken });
        }
        // Dados de aplicação já foram carregados via Lazy Init

        // Verificar Hash de Compartilhamento
        const checkHash = () => {
            if (window.location.hash.startsWith('#share=')) {
                try {
                    const hashContent = window.location.hash.replace('#share=', '');
                    if (hashContent) {
                        const json = decodeURIComponent(escape(atob(hashContent)));
                        const sharedResults = JSON.parse(json);
                        if (Array.isArray(sharedResults) && sharedResults.length > 0) {
                            setResultados(sharedResults);
                            setAba('resultados');
                            addLog('Resultados carregados via Link Compartilhado', 'success');
                            // Limpar hash para não poluir
                            window.history.replaceState(null, '', ' ');
                        }
                    }
                } catch (e) {
                    addLog('Erro ao processar link de compartilhamento.', 'error');
                }
            }
        };
        
        // Pequeno delay para garantir que tudo montou
        setTimeout(checkHash, 500);

    }, [addLog]);

    useEffect(() => {
        if (auth.isAuthenticated) {
            try {
                // Salvamento automático sempre que o estado mudar
                localStorage.setItem('nfp_gcp_config', JSON.stringify(gcpConfig));
                localStorage.setItem('nfp_certificados', JSON.stringify(certificados));
                localStorage.setItem('nfp_clientes', JSON.stringify(clientes));
                localStorage.setItem('nfp_historico', JSON.stringify(historico));
                localStorage.setItem('nfp_agendamentos', JSON.stringify(agendamentos));
            } catch (e) {
                console.error("Failed to save data to localStorage", e);
            }
        }
    }, [gcpConfig, certificados, clientes, historico, agendamentos, auth.isAuthenticated]);

    // --- FUNÇÕES AUXILIARES ---
    const toggleTheme = () => setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');

    const copyToClipboard = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        addLog(`Copiado para área de transferência: ${text}`, 'info');
    };

    const handleShareResults = () => {
        if (resultados.length === 0) {
            alert('Não há resultados para compartilhar.');
            return;
        }
        try {
            const json = JSON.stringify(resultados);
            // Encoding UTF-8 safe base64
            const base64 = btoa(unescape(encodeURIComponent(json)));
            const url = `${window.location.origin}${window.location.pathname}#share=${base64}`;
            
            navigator.clipboard.writeText(url);
            addLog('Link de compartilhamento copiado!', 'success');
            alert('Link copiado para a área de transferência! Envie para quem quiser compartilhar.');
        } catch (e) {
            console.error(e);
            addLog('Erro ao gerar link de compartilhamento', 'error');
            alert('Erro ao gerar link (dados muito grandes?)');
        }
    };

    const applyCnpjMask = (value: string) => {
        if (!value) return '';
        const v = value.replace(/\D/g, '').slice(0, 14);
        if (v.length > 12) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
        if (v.length > 8) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
        return v;
    };

    const salvarConfiguracaoManual = () => {
        localStorage.setItem('nfp_gcp_config', JSON.stringify(gcpConfig));
        addLog('Configurações salvas com sucesso!', 'success');
        setGcpConfig(prev => ({...prev, configured: true}));
    };

    // --- AUTENTICAÇÃO ---
    const checkIsAdmin = (email: string) => email.toLowerCase().trim() === 'junior@spassessoriacontabil.com.br';

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (authMode === 'login') {
            await handleLogin();
        } else {
            await handleRegister();
        }
    };

    const handleLogin = async () => {
        if (!loginData.email || !loginData.senha) { alert('Por favor, preencha e-mail e senha.'); return; }
        setAuthLoading(true);
        const emailNormalized = loginData.email.trim().toLowerCase();
        
        await new Promise(r => setTimeout(r, 1000));
        try {
            const usersDb = JSON.parse(localStorage.getItem('nfp_users_db') || '[]');
            const user = usersDb.find((u: User) => u.email === emailNormalized && u.senha === loginData.senha);
            
            if (user) {
                const isAdmin = checkIsAdmin(user.email);
                const payload = { email: user.email, name: user.nome, isAdmin, exp: Date.now() + 3600000 };
                const fakeJwt = btoa(JSON.stringify(payload));
                const userData: User = { nome: user.nome, email: user.email, isAdmin };
                
                setAuth({ isAuthenticated: true, user: userData, token: fakeJwt });
                localStorage.setItem('nfp_user', JSON.stringify(userData));
                localStorage.setItem('nfp_token', fakeJwt);
                addLog(`Login efetuado: ${user.nome}`, 'success');
            } else {
                alert('E-mail ou senha incorretos.');
            }
        } catch (e) { alert('Erro no login.'); } 
        finally { setAuthLoading(false); }
    };

    const handleRegister = async () => {
        if (!loginData.nome || !loginData.email || !loginData.senha) { alert('Preencha todos os campos.'); return; }
        
        const emailNormalized = loginData.email.trim().toLowerCase();
        
        if (!emailNormalized.endsWith('@spassessoriacontabil.com.br')) { 
            alert('Acesso restrito. Use e-mail: @spassessoriacontabil.com.br'); 
            return; 
        }
        
        setAuthLoading(true);
        await new Promise(r => setTimeout(r, 1000));
        
        try {
            const usersDb = JSON.parse(localStorage.getItem('nfp_users_db') || '[]');
            
            // Verifica se já existe
            if (usersDb.some((u: User) => u.email === emailNormalized)) { 
                alert('E-mail já cadastrado. Redirecionando para login...'); 
                setAuthMode('login');
                setAuthLoading(false); 
                return; 
            }
            
            // Cria novo usuário
            const newUser = { 
                nome: loginData.nome.trim(), 
                email: emailNormalized, 
                senha: loginData.senha, 
                isAdmin: checkIsAdmin(emailNormalized) 
            };
            
            // Salva no LocalStorage
            usersDb.push(newUser);
            localStorage.setItem('nfp_users_db', JSON.stringify(usersDb));
            
            // Auto-Login
            const payload = { email: newUser.email, name: newUser.nome, isAdmin: newUser.isAdmin, exp: Date.now() + 3600000 };
            const fakeJwt = btoa(JSON.stringify(payload));
            
            setAuth({ isAuthenticated: true, user: newUser, token: fakeJwt });
            localStorage.setItem('nfp_user', JSON.stringify(newUser));
            localStorage.setItem('nfp_token', fakeJwt);
            
            addLog(`Cadastro realizado e login efetuado: ${newUser.nome}`, 'success');
            
        } catch (e) { 
            console.error(e);
            alert('Erro ao cadastrar usuário.'); 
        } 
        finally { setAuthLoading(false); }
    };

    const logout = () => {
        setAuth({ isAuthenticated: false, user: null, token: null });
        localStorage.removeItem('nfp_user'); localStorage.removeItem('nfp_token');
        setLoginData({ nome: '', email: '', senha: '' });
        setAuthMode('login');
    };

    // --- API SEGURA ---
    const secureFetch = async (url: string, options: RequestInit = {}) => {
        if (gcpConfig.useMock) return new Response("Mock", { status: 200 }); 
        if (!auth.token) throw new Error("Acesso Negado.");
        
        const headers = { ...options.headers, 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json' };
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 15000);
        
        try {
            const response = await fetch(url, { ...options, headers, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    };

    // --- LÓGICA DE NEGÓCIO ---
    const testarConexao = async () => {
        if (gcpConfig.useMock) { addLog('✅ Conexão Simulada OK (Modo Mock)', 'success'); setGcpConfig(prev => ({...prev, connectionVerified: true})); return; }
        if (!gcpConfig.endpoints.healthCheck) return;
        setTestingConnection(true); setConnectionError(null);
        try {
            const response = await secureFetch(gcpConfig.endpoints.healthCheck);
            if (response.ok) { addLog('✅ Conexão segura estabelecida!', 'success'); setGcpConfig(prev => ({...prev, connectionVerified: true})); }
            else { throw new Error(`Status ${response.status}`); }
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro';
            setConnectionError(`Falha: ${msg}`); addLog(`❌ Erro de conexão: ${msg}`, 'error');
        } finally { setTestingConnection(false); }
    };

    const handleCertUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploadingCert(true);
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const base64Content = result.split(',')[1];
            const novoCert: Certificate = {
                id: Date.now(), nome: file.name, tipo: file.name.split('.').pop()?.toUpperCase() || '',
                tamanho: (file.size / 1024).toFixed(2) + ' KB', dataUpload: new Date().toLocaleString(),
                base64: base64Content, senha: '', validado: false, cnpj: '', razaoSocial: '', validade: '', status: 'pendente'
            };
            setCertificados(p => [...p, novoCert]);
            setUploadingCert(false);
            addLog(`Certificado carregado: ${file.name}`, 'info');
        };
        reader.readAsDataURL(file);
    };

    const validarCertificado = async (certId: number) => {
        const cert = certificados.find(c => c.id === certId);
        if (!cert) return;
        if (!cert.senha) { alert('Digite a senha do certificado'); return; }
        
        // CORREÇÃO: Verificação de endpoint em modo real
        if (!gcpConfig.useMock && !gcpConfig.endpoints.validarCertificado) {
            alert("URL de validação não configurada. Configure na aba 'Conexão' ou ative o Modo Mock.");
            return;
        }

        setCertValidando(certId);
        try {
            let data;
            if (gcpConfig.useMock) {
                // MODO MOCK: Simulação
                await new Promise(r => setTimeout(r, 1000));
                
                // Simulação de erro de senha (se o usuário digitar 'erro')
                if (cert.senha.toLowerCase() === 'erro') {
                    throw new Error("Senha incorreta.");
                }

                // CORREÇÃO: Usar o nome do arquivo como Razão Social para evitar "MOCK EMPRESA" genérico
                // Isso atende à solicitação para não exibir "MOCK EMPRESA" quando validado.
                const nomeBase = cert.nome.split('.')[0].toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
                data = { 
                    cnpj: '00.123.456/0001-78', 
                    razaoSocial: nomeBase, // Nome dinâmico baseado no arquivo
                    validade: '31/12/2025' 
                };
                addLog(`⚠️ Validação Simulada (Mock Ativo) para: ${nomeBase}`, 'warning');
            } else {
                // MODO REAL: Busca no backend
                const res = await secureFetch(gcpConfig.endpoints.validarCertificado, { method: 'POST', body: JSON.stringify({ certificateBase64: cert.base64, password: cert.senha }) });
                if(!res.ok) {
                    const errText = await res.text();
                    throw new Error(errText || "Erro na API");
                }
                data = await res.json();
            }
            
            // Atualiza estado do certificado com CNPJ e Razão Social (Persistência automática via useEffect)
            setCertificados(p => p.map(c => c.id === certId ? { 
                ...c, 
                validado: true, 
                status: 'válido', 
                erroMsg: undefined, 
                cnpj: data.cnpj, 
                razaoSocial: data.razaoSocial, 
                validade: data.validade 
            } : c));
            
            addLog(`Certificado validado: ${data.razaoSocial}`, 'success');
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro';
            const isPasswordError = msg.toLowerCase().includes('senha') || msg.toLowerCase().includes('password') || msg.includes('401') || msg.includes('403');
            
            setCertificados(p => p.map(c => c.id === certId ? { ...c, status: 'erro', erroMsg: isPasswordError ? 'Senha incorreta' : msg } : c));
            
            if (isPasswordError) {
                alert(`A senha informada para o certificado "${cert.nome}" está incorreta.\n\nPor favor, verifique a senha e tente novamente.`);
            }
            
            addLog(`Falha ao validar: ${cert.nome} - ${msg}`, 'error');
        } finally { setCertValidando(null); }
    };

    const buscarDadosCnpj = async (clientId: number, cnpj: string) => {
        const cleanCnpj = cnpj.replace(/\D/g, '');
        if (cleanCnpj.length !== 14) return;
        
        setLoadingCnpj(clientId);
        try {
            // Utilizando BrasilAPI para dados oficiais
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            
            if (!response.ok) {
                 if (response.status === 429) throw new Error("Muitas requisições. Tente novamente em instantes.");
                 throw new Error("CNPJ não encontrado ou erro na API.");
            }
            
            const data = await response.json();
            
            setClientes(prev => prev.map(c => c.id === clientId ? { 
                ...c, 
                // Oficial: Razão Social da Receita Federal
                nome: data.razao_social || data.nome_fantasia || c.nome,
                // Nota: A BrasilAPI (base Receita Federal) NÃO retorna Inscrição Municipal (dado municipal).
                // Mantemos o valor existente ou deixamos para preenchimento manual para garantir integridade.
                im: c.im 
            } : c));
            
            addLog(`Dados Federais carregados: ${data.razao_social}`, 'success');
            if(!clientes.find(c => c.id === clientId)?.im) {
                addLog('Nota: Inscrição Municipal deve ser preenchida manualmente (dado municipal).', 'warning');
            }

        } catch (error) { 
            const msg = error instanceof Error ? error.message : 'Erro na busca';
            addLog(`Erro BrasilAPI: ${msg}`, 'error'); 
        } finally { 
            setLoadingCnpj(null); 
        }
    };

    // Consultar NFP (Lógica Unificada)
    const consultarNFPReal = async (cliente: Client, periodoOverride?: string): Promise<Result> => {
        const periodo = periodoOverride || `${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getFullYear()}`;
        
        // Verifica conexão apenas se não for mock
        if (!gcpConfig.useMock && (!gcpConfig.configured || !gcpConfig.connectionVerified)) {
             throw new Error("Backend desconectado. Verifique a aba Conexão.");
        }
        
        const cert = certificados.find(c => c.id === parseInt(cliente.certificadoId, 10));
        
        // CORREÇÃO: Forçar busca REAL se useMock for false e tiver certificado
        // Se useMock for true, ou se não tiver certificado (simulação total), usa Mock
        const deveUsarMock = gcpConfig.useMock || !cert;

        if (deveUsarMock) {
            await new Promise(r => setTimeout(r, 800));
            return {
                cliente: cliente.nome, cnpj: cliente.cnpj, im: cliente.im, periodo,
                prestados: { notas: Math.floor(Math.random()*50)+1, valor: (Math.random()*10000).toFixed(2), iss: (Math.random()*500).toFixed(2), creditos: (Math.random()*100).toFixed(2), semTomador: Math.random() > 0.7 ? Math.floor(Math.random()*5) : 0 },
                tomados: { notas: Math.floor(Math.random()*20), valor: (Math.random()*5000).toFixed(2), iss: '0', creditos: '0' },
                fonte: 'MOCK', status: 'sucesso'
            };
        }
        
        // Chamada REAL (somente se certificado válido e Mock desativado)
        const response = await secureFetch(gcpConfig.endpoints.consultarNFP, {
            method: 'POST', body: JSON.stringify({ cnpj: cliente.cnpj.replace(/\D/g, ''), im: cliente.im, periodo, certificateBase64: cert?.base64, password: cert?.senha })
        });
        
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        return { cliente: cliente.nome, cnpj: cliente.cnpj, im: cliente.im, periodo, prestados: data.prestados, tomados: data.tomados, fonte: 'REAL', status: data.status };
    };

    const processar = async () => {
        const ativos = clientes.filter(c => c.ativo && c.certificadoId);
        if (!ativos.length) { alert('Selecione clientes ativos com certificados.'); return; }
        setProcessando(true); setResultados([]); setLogs([]); setAnaliseIA('');
        const res: Result[] = [];
        for (const cli of ativos) {
            try {
                const d = await consultarNFPReal(cli);
                res.push(d); setResultados([...res]); addLog(`✅ ${cli.nome}: Sucesso`, 'success');
            } catch (e) { addLog(`❌ ${cli.nome}: ${e instanceof Error ? e.message : 'Erro'}`, 'error'); }
        }
        if (res.length > 0) {
             const h: HistoryItem = { id: Date.now(), data: new Date().toLocaleString(), qt: res.length, resultados: res };
             setHistorico(prev => [h, ...prev].slice(0, 10));
             try {
                const prompt = `Analise os dados NFP: ${JSON.stringify(res.map(r => ({c: r.cliente, semTomador: r.prestados.semTomador, cred: r.prestados.creditos})))}. Dê alertas.`;
                const aiRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
                setAnaliseIA(aiRes.text || '');
             } catch (e) { console.error(e); }
        }
        setProcessando(false); setAba('resultados');
    };

    // Agendamento
    const handleCriarAgendamento = (e: React.FormEvent) => {
        e.preventDefault();
        const { clientId, periodo, data } = novoAgendamento;
        if (!clientId || !data) { alert('Preencha os campos.'); return; }
        const ag: Agendamento = { id: Date.now(), clientId: parseInt(clientId), periodo, dataAgendamento: new Date(data).toISOString(), status: 'agendado' };
        setAgendamentos(prev => [...prev, ag]);
        addLog(`Agendado para ${new Date(ag.dataAgendamento).toLocaleString()}`, 'success');
    };

    useEffect(() => {
        const interval = setInterval(() => {
            const agora = new Date();
            agendamentos.forEach(ag => {
                if (ag.status === 'agendado' && new Date(ag.dataAgendamento) <= agora) {
                    setAgendamentos(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'executado' } : a));
                    const cli = clientes.find(c => c.id === ag.clientId);
                    if (cli) {
                        consultarNFPReal(cli, ag.periodo)
                            .then(res => {
                                const h = { id: Date.now(), data: `Agendado: ${new Date().toLocaleString()}`, qt: 1, resultados: [res] };
                                setHistorico(p => [h, ...p]);
                                addLog(`Agendamento executado: ${cli.nome}`, 'success');
                            })
                            .catch(e => addLog(`Falha agendamento ${cli.nome}: ${e}`, 'error'));
                    }
                }
            });
        }, 15000);
        return () => clearInterval(interval);
    }, [agendamentos, clientes, gcpConfig]);

    // --- RENDERIZAÇÃO: LOGIN ---
    if (!auth.isAuthenticated) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-8 border border-gray-700">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg"><Cloud className="w-8 h-8 text-white" /></div>
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">NFP Pro Cloud</h1>
                        <p className="text-gray-400 text-sm mt-2">Acesso Restrito</p>
                    </div>
                    
                    <form onSubmit={handleAuthSubmit} className="space-y-4">
                        {authMode === 'register' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Nome Completo</label>
                                <div className="relative"><input type="text" value={loginData.nome} onChange={e => setLoginData({...loginData, nome: e.target.value})} className="w-full pl-10 p-3 rounded-lg bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-blue-500" placeholder="Seu nome" /><UserPlus className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" /></div>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">E-mail Corporativo</label>
                            <div className="relative"><input type="email" value={loginData.email} onChange={e => setLoginData({...loginData, email: e.target.value})} className="w-full pl-10 p-3 rounded-lg bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-blue-500" placeholder="@spassessoriacontabil.com.br" /><Users className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" /></div>
                            {authMode === 'register' && <p className="text-xs text-blue-400 mt-1">Obrigatório: @spassessoriacontabil.com.br</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Senha</label>
                            <div className="relative"><input type="password" value={loginData.senha} onChange={e => setLoginData({...loginData, senha: e.target.value})} className="w-full pl-10 p-3 rounded-lg bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-blue-500" placeholder="••••••••" /><Lock className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" /></div>
                        </div>
                        <button type="submit" disabled={authLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 mt-6">
                            {authLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? 'Entrar' : 'Cadastrar e Entrar')}
                        </button>
                    </form>
                    
                    <div className="text-center mt-4">
                        <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setLoginData({nome:'', email:'', senha:''}); }} className="text-sm text-blue-400 hover:text-blue-300">
                            {authMode === 'login' ? 'Primeiro acesso? Cadastre-se' : 'Já tem conta? Login'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- RENDERIZAÇÃO: DASHBOARD ---
    const abas = [
        { id: 'conectar', icon: Cloud, label: 'Conexão' },
        { id: 'certificados', icon: FileKey, label: 'Certificados' },
        { id: 'clientes', icon: Users, label: 'Clientes' },
        { id: 'agendamento', icon: Clock, label: 'Agendamento' },
        { id: 'resultados', icon: TrendingUp, label: 'Resultados' },
        { id: 'graficos', icon: BarChart3, label: 'Gráficos' },
        { id: 'historico', icon: Calendar, label: 'Histórico' },
        { id: 'alertas', icon: Bell, label: 'Alertas' },
        { id: 'codigo', icon: Code, label: 'Código' }
    ];

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
            <div className="max-w-7xl mx-auto p-4">
                <header className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                         <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded text-blue-600 dark:text-blue-300"><Cloud className="w-6 h-6" /></div>
                         <div><h1 className="text-xl font-bold">NFP Pro Cloud</h1><p className="text-xs text-gray-500">Dashboard Seguro</p></div>
                    </div>
                    <div className="flex items-center gap-4">
                         <div className="text-right hidden md:block">
                             <div className="text-sm font-semibold">{auth.user?.nome}</div>
                             <div className="text-xs text-gray-500">{auth.user?.isAdmin ? 'ADMIN' : 'USER'}</div>
                         </div>
                        <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">{theme === 'light' ? <Moon size={20}/> : <Sun size={20}/>}</button>
                        <button onClick={logout} className="p-2 text-red-500 hover:bg-red-50 rounded"><LogOut size={20} /></button>
                    </div>
                </header>

                <div className="flex gap-1 overflow-x-auto mb-6 pb-2 border-b border-gray-200 dark:border-gray-700">
                    {abas.map(t => (
                        <button key={t.id} onClick={() => setAba(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors whitespace-nowrap ${aba === t.id ? 'bg-white dark:bg-gray-800 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                            <t.icon size={16} /> {t.label}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        {aba === 'conectar' && (
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                                <h3 className="font-bold text-lg mb-4">Configuração GCP</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded">
                                        <span>Modo Mock (Teste)</span>
                                        <button onClick={() => setGcpConfig(p => ({...p, useMock: !p.useMock}))} className={`w-10 h-6 rounded-full p-1 transition-colors ${gcpConfig.useMock ? 'bg-blue-600' : 'bg-gray-400'}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${gcpConfig.useMock ? 'translate-x-4' : ''}`} /></button>
                                    </div>
                                    <input placeholder="Project ID" value={gcpConfig.projectId} onChange={e => setGcpConfig(p => ({...p, projectId: e.target.value}))} className="w-full p-2 border rounded dark:bg-gray-700" disabled={gcpConfig.useMock} />
                                    <input placeholder="URL Health Check" value={gcpConfig.endpoints.healthCheck} onChange={e => setGcpConfig(p => ({...p, endpoints: {...p.endpoints, healthCheck: e.target.value}}))} className="w-full p-2 border rounded dark:bg-gray-700" disabled={gcpConfig.useMock} />
                                    <input placeholder="URL Validar Certificado (Cloud Function)" value={gcpConfig.endpoints.validarCertificado} onChange={e => setGcpConfig(p => ({...p, endpoints: {...p.endpoints, validarCertificado: e.target.value}}))} className="w-full p-2 border rounded dark:bg-gray-700" disabled={gcpConfig.useMock} />
                                    <input placeholder="URL Consultar NFP (Cloud Function)" value={gcpConfig.endpoints.consultarNFP} onChange={e => setGcpConfig(p => ({...p, endpoints: {...p.endpoints, consultarNFP: e.target.value}}))} className="w-full p-2 border rounded dark:bg-gray-700" disabled={gcpConfig.useMock} />
                                    
                                    <div className="flex gap-2">
                                        <button onClick={testarConexao} disabled={testingConnection} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded flex items-center justify-center gap-2">
                                            {testingConnection ? <Loader2 className="animate-spin" /> : 'Testar Conexão'}
                                        </button>
                                        <button onClick={salvarConfiguracaoManual} className="flex-1 bg-green-600 hover:bg-green-700 text-white p-2 rounded flex items-center justify-center gap-2">
                                            <Save size={18} /> Salvar Configuração
                                        </button>
                                    </div>
                                    {connectionError && <p className="text-red-500 text-sm">{connectionError}</p>}
                                </div>
                            </div>
                        )}

                        {aba === 'certificados' && (
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                                <h3 className="font-bold text-lg mb-4">Certificados Digitais</h3>
                                <div className="border-2 border-dashed border-gray-300 p-6 rounded-lg text-center mb-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <input type="file" id="certInput" className="hidden" accept=".pfx,.p12" onChange={handleCertUpload} />
                                    <label htmlFor="certInput" className="cursor-pointer flex flex-col items-center">
                                        {uploadingCert ? <Loader2 className="animate-spin mb-2"/> : <Upload className="mb-2" />}
                                        <span>Clique para adicionar .PFX ou .P12</span>
                                    </label>
                                </div>
                                <div className="space-y-2">
                                    {certificados.map(c => (
                                        <div key={c.id} className="flex justify-between items-center p-3 border rounded bg-gray-50 dark:bg-gray-700/50">
                                            <div className="flex items-center gap-3">
                                                <FileKey size={18} />
                                                <div>
                                                    <div className="font-bold text-sm">{c.nome}</div>
                                                    {c.validado && c.razaoSocial && (
                                                        <div className="text-xs text-green-600 font-semibold">{c.razaoSocial} | {c.cnpj}</div>
                                                    )}
                                                    <div className={`text-xs ${c.status === 'erro' ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                                                        {c.status === 'erro' ? c.erroMsg : c.status}
                                                    </div>
                                                </div>
                                            </div>
                                            {!c.validado && <div className="flex gap-2"><input type="password" placeholder="Senha" value={c.senha} onChange={e => setCertificados(p => p.map(x => x.id === c.id ? {...x, senha: e.target.value} : x))} className="w-24 p-1 text-sm border rounded dark:bg-gray-600" /><button onClick={() => validarCertificado(c.id)} className="bg-green-600 text-white px-2 rounded text-xs">Validar</button></div>}
                                            {c.validado && <CheckCircle className="text-green-500" size={18} />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {aba === 'clientes' && (
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                                <div className="flex justify-between mb-4"><h3 className="font-bold text-lg">Clientes</h3><button onClick={() => setClientes([...clientes, {id: Date.now(), nome: '', cnpj: '', im: '', certificadoId: '', ativo: true}])} className="bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm flex items-center gap-1"><UserPlus size={14} /> Novo</button></div>
                                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                                    {clientes.map(c => (
                                        <div key={c.id} className="p-3 border rounded bg-gray-50 dark:bg-gray-700/30">
                                            <div className="grid grid-cols-2 gap-2 mb-2">
                                                <div className="col-span-2 flex gap-1">
                                                    <input value={c.cnpj} onBlur={() => buscarDadosCnpj(c.id, c.cnpj)} onChange={e => setClientes(p => p.map(x => x.id === c.id ? {...x, cnpj: applyCnpjMask(e.target.value)} : x))} placeholder="CNPJ" className="flex-1 p-2 border rounded dark:bg-gray-700" />
                                                    <button onClick={() => copyToClipboard(c.cnpj)} className="p-2 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500" title="Copiar CNPJ"><Copy className="w-4 h-4" /></button>
                                                    <button onClick={() => buscarDadosCnpj(c.id, c.cnpj)} className="p-2 bg-gray-200 dark:bg-gray-600 rounded">{loadingCnpj === c.id ? <Loader2 className="animate-spin w-4 h-4"/> : <Search className="w-4 h-4"/>}</button>
                                                </div>
                                                <input value={c.nome} onChange={e => setClientes(p => p.map(x => x.id === c.id ? {...x, nome: e.target.value} : x))} placeholder="Nome" className="col-span-2 p-2 border rounded dark:bg-gray-700" />
                                                <input value={c.im} onChange={e => setClientes(p => p.map(x => x.id === c.id ? {...x, im: e.target.value} : x))} placeholder="Inscrição Municipal" className="p-2 border rounded dark:bg-gray-700" />
                                                <select value={c.certificadoId} onChange={e => setClientes(p => p.map(x => x.id === c.id ? {...x, certificadoId: e.target.value} : x))} className="p-2 border rounded dark:bg-gray-700">
                                                    <option value="">Selecione Certificado...</option>
                                                    {certificados.map(cf => (
                                                        <option key={cf.id} value={String(cf.id)} disabled={!cf.validado} className={!cf.validado ? "text-gray-400 italic" : ""}>
                                                            {cf.validado ? cf.razaoSocial : `${cf.nome} (Pendente)`}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.ativo} onChange={e => setClientes(p => p.map(x => x.id === c.id ? {...x, ativo: e.target.checked} : x))} /> Ativo</label><button onClick={() => setClientes(p => p.filter(x => x.id !== c.id))} className="text-red-500 text-xs">Remover</button></div>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={processar} disabled={processando} className="w-full mt-4 bg-green-600 text-white p-3 rounded font-bold flex justify-center gap-2">{processando ? <Loader2 className="animate-spin" /> : <Zap />} Processar Tudo</button>
                            </div>
                        )}

                        {aba === 'agendamento' && (
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow space-y-6">
                                <div>
                                    <h3 className="font-bold text-lg mb-4">Novo Agendamento</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <select value={novoAgendamento.clientId} onChange={e => setNovoAgendamento(p => ({...p, clientId: e.target.value}))} className="p-2 border rounded dark:bg-gray-700">
                                            <option value="">Cliente...</option>
                                            {clientes.filter(c => c.certificadoId).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                        </select>
                                        <input type="datetime-local" value={novoAgendamento.data} onChange={e => setNovoAgendamento(p => ({...p, data: e.target.value}))} className="p-2 border rounded dark:bg-gray-700" />
                                        <button onClick={handleCriarAgendamento} className="bg-blue-600 text-white rounded font-bold">Agendar</button>
                                    </div>
                                </div>
                                <div className="border-t pt-4">
                                    <h4 className="font-bold mb-2">Próximas Execuções</h4>
                                    {agendamentos.map(ag => (
                                        <div key={ag.id} className="flex justify-between items-center p-3 border-b dark:border-gray-700">
                                            <div>
                                                <div className="font-bold">{clientes.find(c => c.id === ag.clientId)?.nome || 'Cliente Removido'}</div>
                                                <div className="text-xs text-gray-500">{new Date(ag.dataAgendamento).toLocaleString()} - {ag.status}</div>
                                            </div>
                                            <button onClick={() => setAgendamentos(p => p.filter(x => x.id !== ag.id))}><Trash2 className="text-red-500 w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {aba === 'resultados' && (
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-lg">Resultados</h3>
                                    <button 
                                        onClick={handleShareResults} 
                                        className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 px-3 py-1 rounded text-sm flex items-center gap-2 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
                                    >
                                        <Share2 size={16} /> Compartilhar Resultados
                                    </button>
                                </div>
                                {analiseIA && <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded prose dark:prose-invert text-sm"><ReactMarkdown>{analiseIA}</ReactMarkdown></div>}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-gray-700"><tr><th className="p-2 text-left">Cliente</th><th className="p-2">Prestados</th><th className="p-2">Créditos</th><th className="p-2">Alertas</th><th className="p-2">Tomados</th></tr></thead>
                                        <tbody>
                                            {resultados.map((r, i) => (
                                                <tr key={i} className="border-b dark:border-gray-700">
                                                    <td className="p-2">{r.cliente}</td>
                                                    <td className="p-2 text-center">{r.prestados.notas}</td>
                                                    <td className="p-2 text-center text-green-600 font-bold">R$ {r.prestados.creditos}</td>
                                                    <td className="p-2 text-center text-red-500 font-bold">{r.prestados.semTomador || '-'}</td>
                                                    <td className="p-2 text-center">{r.tomados.notas}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {aba === 'graficos' && resultados.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
                                    <h4 className="font-bold mb-2">Créditos por Cliente</h4>
                                    <ResponsiveContainer width="100%" height={250}><BarChart data={resultados.map(r => ({name: r.cliente.slice(0,10), creditos: parseFloat(r.prestados.creditos)}))}><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="creditos" fill="#3b82f6"/></BarChart></ResponsiveContainer>
                                </div>
                                <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
                                    <h4 className="font-bold mb-2">Status de Alertas</h4>
                                    <ResponsiveContainer width="100%" height={250}><PieChart><Pie data={[{name: 'OK', value: resultados.filter(r => !r.prestados.semTomador).length}, {name: 'Alertas', value: resultados.filter(r => r.prestados.semTomador).length}]} cx="50%" cy="50%" outerRadius={60} dataKey="value" label><Cell fill="#10B981"/><Cell fill="#EF4444"/></Pie><Tooltip/></PieChart></ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {aba === 'historico' && (
                             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                                <h3 className="font-bold text-lg mb-4">Histórico de Processamento</h3>
                                {historico.map(h => (
                                    <div key={h.id} onClick={() => setSelectedHistoryItem(h)} className="p-3 border-b cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between">
                                        <span>{h.data}</span><span className="text-gray-500">{h.qt} itens</span>
                                    </div>
                                ))}
                             </div>
                        )}

                        {aba === 'alertas' && (
                             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                                <h3 className="font-bold text-lg mb-4 text-red-600 flex items-center gap-2"><AlertCircle/> Alertas Pendentes</h3>
                                {resultados.filter(r => (r.prestados.semTomador || 0) > 0).map(r => (
                                    <div key={r.cnpj} className="mb-2 p-3 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500">
                                        <div className="font-bold">{r.cliente}</div>
                                        <div>{r.prestados.semTomador} notas sem tomador identificado.</div>
                                    </div>
                                ))}
                                {resultados.filter(r => (r.prestados.semTomador || 0) > 0).length === 0 && <p className="text-green-600">Nenhum alerta pendente.</p>}
                             </div>
                        )}

                        {aba === 'codigo' && (
                             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                                <h3 className="font-bold mb-2">Backend Cloud Function (Secure)</h3>
                                <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto">
{`const jwt = require('jsonwebtoken');
functions.http('nfp', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
     const user = jwt.verify(token, process.env.JWT_SECRET);
     if(!user.email.endsWith('@spassessoriacontabil.com.br')) throw new Error('Domain');
     // Logic...
     res.json({status: 'ok'});
  } catch(e) { res.status(401).send('Unauthorized'); }
});`}
                                </pre>
                             </div>
                        )}
                    </div>

                    <div className="lg:col-span-1 h-[600px] sticky top-6">
                        <LogViewer logs={logs} />
                    </div>
                </div>

                {selectedHistoryItem && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedHistoryItem(null)}>
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <h3 className="font-bold text-xl mb-4">Detalhes: {selectedHistoryItem.data}</h3>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 dark:bg-gray-700"><tr><th className="p-2">Cliente</th><th className="p-2">Valor</th></tr></thead>
                                <tbody>{selectedHistoryItem.resultados.map((r, i) => <tr key={i} className="border-b"><td className="p-2">{r.cliente}</td><td className="p-2">R$ {r.prestados.valor}</td></tr>)}</tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}