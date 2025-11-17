

import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { FileText, Download, Users, AlertCircle, TrendingUp, CheckCircle, XCircle, Loader2, LogOut, Search, BarChart3, Calendar, Bell, ArrowUp, ArrowDown, Shield, Code, Upload, FileKey, Zap, Cloud, Eye, EyeOff, Sun, Moon, ChevronDown, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- DEFINIÇÕES DE TIPO ---
interface GcpConfig {
  projectId: string;
  region: 'southamerica-east1' | 'us-central1' | 'us-east1';
  deployed: boolean;
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
    fonte: 'SIMULADO' | 'GOOGLE_CLOUD';
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

interface DeployLog {
    time: string;
    msg: string;
}

type Aba = 'deploy' | 'certificados' | 'clientes' | 'resultados' | 'graficos' | 'comparacao' | 'historico' | 'alertas' | 'codigo';

// --- COMPONENTE PRINCIPAL DO APP ---
export default function App() {
    // --- GERENCIAMENTO DE ESTADO ---
    const [user, setUser] = useState<{ nome: string } | null>(null);
    const [login, setLogin] = useState({ email: '', senha: '' });
    const [clientes, setClientes] = useState<Client[]>([]);
    const [resultados, setResultados] = useState<Result[]>([]);
    const [historico, setHistorico] = useState<HistoryItem[]>([]);
    const [processando, setProcessando] = useState(false);
    const [analiseIA, setAnaliseIA] = useState('');
    const [logs, setLogs] = useState<Log[]>([]);
    const [comparacao, setComparacao] = useState<ComparisonItem[]>([]);
    const [filtros, setFiltros] = useState({ busca: '', status: 'todos' });
    const [aba, setAba] = useState<Aba>('deploy');
    const [certificados, setCertificados] = useState<Certificate[]>([]);
    const [uploadingCert, setUploadingCert] = useState(false);
    const [certValidando, setCertValidando] = useState<number | null>(null);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [activeChartIndex, setActiveChartIndex] = useState<number | null>(null);
    const [expandedAlerts, setExpandedAlerts] = useState<string[]>([]);
    const [reportModal, setReportModal] = useState({ isOpen: false, content: '' });


    const [gcpConfig, setGcpConfig] = useState<GcpConfig>({
        projectId: '',
        region: 'southamerica-east1',
        deployed: false,
        endpoints: {
            validarCertificado: '',
            consultarNFP: '',
            healthCheck: ''
        }
    });
    const [deployStatus, setDeployStatus] = useState<'pending' | 'deploying' | 'deployed'>('pending');
    const [deployLogs, setDeployLogs] = useState<DeployLog[]>([]);

    const COLORS = ['#10B981', '#F59E0B', '#EF4444'];
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
              if(parsed.deployed) setDeployStatus('deployed');
            }
            const hist = localStorage.getItem('nfp_historico');
            if (hist) setHistorico(JSON.parse(hist));
            const certs = localStorage.getItem('nfp_certificados');
            if (certs) setCertificados(JSON.parse(certs));
            const savedClientes = localStorage.getItem('nfp_clientes');
            if (savedClientes) setClientes(JSON.parse(savedClientes));
        } catch (e) {
          console.error("Failed to load data from localStorage", e);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('nfp_gcp_config', JSON.stringify(gcpConfig));
            localStorage.setItem('nfp_certificados', JSON.stringify(certificados));
            localStorage.setItem('nfp_clientes', JSON.stringify(clientes));
        } catch (e) {
            console.error("Failed to save data to localStorage", e);
        }
    }, [gcpConfig, certificados, clientes]);

    // --- FUNÇÕES AUXILIARES ---
    const addLog = (msg: string, tipo: Log['tipo'] = 'info') => setLogs(p => [...p.slice(-100), { time: new Date().toLocaleTimeString('pt-BR'), msg, tipo, id: Date.now() }]);
    const addDeployLog = (msg: string) => setDeployLogs(p => [...p.slice(-100), { time: new Date().toLocaleTimeString('pt-BR'), msg }]);
    const toggleTheme = () => setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    const togglePasswordVisibility = (certId: number) => {
        setVisiblePasswords(prev => ({ ...prev, [certId]: !prev[certId] }));
    };

    // --- FUNÇÕES PRINCIPAIS ---
    const fazerLogin = () => {
        if (login.email === 'admin@contabilidade.com' && login.senha === 'admin123') {
            setUser({ nome: 'Admin' });
            addLog('✅ Login realizado', 'success');
        } else {
            alert('❌ Credenciais inválidas. Use: admin@contabilidade.com / admin123');
        }
    };

    const deployToGoogleCloud = async () => {
        if (!gcpConfig.projectId) {
            alert('⚠️ Digite o ID do seu projeto Google Cloud!');
            return;
        }
        setDeployStatus('deploying');
        setDeployLogs([]);
        addDeployLog('🚀 Iniciando deploy no Google Cloud...');
        await new Promise(r => setTimeout(r, 1000));
        addDeployLog('📦 Empacotando funções...');
        await new Promise(r => setTimeout(r, 1500));
        addDeployLog('☁️ Conectando ao Google Cloud Functions...');
        await new Promise(r => setTimeout(r, 1000));
        addDeployLog('🔧 Deployando funções (simulação)...');
        await new Promise(r => setTimeout(r, 3000));
        addDeployLog('✅ Funções deployadas!');
        const baseUrl = `https://${gcpConfig.region}-${gcpConfig.projectId}.cloudfunctions.net`;
        setGcpConfig(prev => ({
            ...prev,
            deployed: true,
            endpoints: {
                validarCertificado: `${baseUrl}/validarCertificado`,
                consultarNFP: `${baseUrl}/consultarNFP`,
                healthCheck: `${baseUrl}/healthCheck`
            }
        }));
        addDeployLog('🎉 Deploy concluído com sucesso!');
        setDeployStatus('deployed');
        addLog('✅ Backend deployado no Google Cloud (simulação)', 'success');
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
        setCertValidando(certId);
        addLog(`🔐 Validando certificado ${cert.nome}...`, 'info');
        try {
            if (!gcpConfig.endpoints.validarCertificado) {
                // Simulação de validação se não houver endpoint configurado
                addLog('⚠️ Endpoint de validação não configurado. Usando simulação local.', 'warning');
                await new Promise(r => setTimeout(r, 2000));
                const cnpjSim = Math.random().toString().slice(2, 16);
                const dataVal = new Date();
                dataVal.setFullYear(dataVal.getFullYear() + 1);
                setCertificados(p => p.map(c => c.id === certId ? {
                    ...c,
                    validado: true,
                    cnpj: cnpjSim.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'),
                    razaoSocial: `Empresa ${cert.nome.split('.')[0]} Ltda`,
                    validade: dataVal.toLocaleDateString('pt-BR'),
                    status: 'válido'
                } : c));
                addLog(`✅ Certificado ${cert.nome} validado (simulação)`, 'success');
            } else {
                // Validação real com Google Cloud Function
                addLog(`☁️ Enviando para validação no Google Cloud...`, 'info');
                const response = await fetch(gcpConfig.endpoints.validarCertificado, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        certificateBase64: cert.base64,
                        password: cert.senha
                    })
                });

                if (!response.ok) {
                    const errorData = await response.text();
                    throw new Error(`Erro do servidor: ${response.status} - ${errorData || 'Sem detalhes'}`);
                }

                const data = await response.json();

                // Assumindo que a API retorna { cnpj, razaoSocial, validade }
                setCertificados(p => p.map(c => c.id === certId ? {
                    ...c,
                    validado: true,
                    cnpj: data.cnpj,
                    razaoSocial: data.razaoSocial,
                    validade: new Date(data.validade).toLocaleDateString('pt-BR'),
                    status: 'válido'
                } : c));
                addLog(`✅ Certificado ${cert.nome} validado via Google Cloud!`, 'success');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            setCertificados(p => p.map(c => c.id === certId ? { ...c, status: 'inválido' } : c));
            addLog(`❌ Falha na validação: ${errorMessage}`, 'error');
            alert(`❌ Falha na validação: ${errorMessage}`);
        } finally {
            setCertValidando(null);
        }
    };
    
    const consultarNFPReal = async (cliente: Client): Promise<Result> => {
        const periodo = `${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getFullYear()}`;
    
        if (!gcpConfig.endpoints.consultarNFP) {
            addLog(`🔄 Consultando NFP para ${cliente.nome} (simulação)...`, 'info');
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
        
            const generateServiceData = (isPrestado: boolean): ServiceData => {
                const notas = Math.floor(Math.random() * 50) + 10;
                const valor = Math.random() * 100000 + 10000;
                const data: ServiceData = {
                    notas,
                    valor: valor.toFixed(2),
                    iss: (valor * 0.05).toFixed(2),
                    creditos: (valor * 0.05 * 0.3).toFixed(2),
                };
                if (isPrestado) {
                    data.semTomador = Math.floor(Math.random() * 10);
                }
                return data;
            };
        
            return {
                cliente: cliente.nome,
                cnpj: cliente.cnpj,
                im: cliente.im,
                periodo,
                prestados: generateServiceData(true),
                tomados: generateServiceData(false),
                fonte: 'SIMULADO',
                status: 'sucesso'
            };
        } else {
            addLog(`☁️ Consultando NFP para ${cliente.nome} via Google Cloud...`, 'info');
            
            const cert = certificados.find(c => c.id === parseInt(cliente.certificadoId, 10));
            if (!cert) {
                throw new Error(`Certificado não encontrado para ${cliente.nome}`);
            }
    
            const response = await fetch(gcpConfig.endpoints.consultarNFP, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cnpj: cliente.cnpj.replace(/\D/g, ''),
                    im: cliente.im,
                    periodo,
                    certificateBase64: cert.base64,
                    password: cert.senha,
                })
            });
    
            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Erro do servidor: ${response.status} - ${errorData || 'Sem detalhes'}`);
            }
    
            const data = await response.json(); // API deve retornar { prestados: ServiceData, tomados: ServiceData, status: 'sucesso' | 'erro' }
    
            return {
                cliente: cliente.nome,
                cnpj: cliente.cnpj,
                im: cliente.im,
                periodo,
                prestados: data.prestados,
                tomados: data.tomados,
                fonte: 'GOOGLE_CLOUD',
                status: data.status,
            };
        }
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
        setProcessando(true);
        setResultados([]);
        setLogs([]);
        setAnaliseIA('');
        addLog(`🚀 Processando ${ativos.length} cliente(s)...`, 'info');
        addLog(`☁️ Backend: ${gcpConfig.endpoints.consultarNFP ? 'Google Cloud' : 'Simulação Local'}`, 'info');
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
    
    // --- LÓGICA DE RENDERIZAÇÃO ---
    const filtrados = resultados.filter(r => {
        const b = r.cliente.toLowerCase().includes(filtros.busca.toLowerCase());
        const s = filtros.status === 'todos' || (filtros.status === 'alertas' ? (r.prestados.semTomador || 0) > 0 : (r.prestados.semTomador || 0) === 0);
        return b && s;
    });

    const Icon = ({ tipo }: { tipo: Log['tipo'] }) => {
        switch (tipo) {
            case 'success': return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
            case 'error': return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
            case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
            default: return <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />;
        }
    };
    
    const abas: { id: Aba; icon: React.ElementType; label: string; badge?: () => string | number | null }[] = [
        { id: 'deploy', icon: Cloud, label: '1. Deploy', badge: () => gcpConfig.deployed ? '✓' : '' },
        { id: 'certificados', icon: FileKey, label: '2. Certificados', badge: () => certificados.filter(c => c.validado).length || null },
        { id: 'clientes', icon: Users, label: '3. Clientes', badge: () => clientes.filter(c => c.ativo).length || null },
        { id: 'resultados', icon: TrendingUp, label: 'Resultados', badge: () => resultados.length || null },
        { id: 'graficos', icon: BarChart3, label: 'Gráficos' },
        { id: 'comparacao', icon: TrendingUp, label: 'Comparação' },
        { id: 'historico', icon: Calendar, label: 'Histórico', badge: () => historico.length || null },
        { id: 'alertas', icon: Bell, label: 'Alertas', badge: () => resultados.filter(r => (r.prestados.semTomador || 0) > 0).length || null },
        { id: 'codigo', icon: Code, label: 'Código' }
    ];

    if (!user) return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center p-6 dark">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
                <div className="text-center mb-6">
                    <Cloud className="w-16 h-16 mx-auto text-blue-600 mb-4" />
                    <h1 className="text-3xl font-bold text-gray-800">NFP Pro Cloud</h1>
                    <p className="text-gray-500 text-sm mt-2">Plataforma de Automação Fiscal</p>
                </div>
                <div className="space-y-4">
                    <input type="email" placeholder="Email" value={login.email} onChange={e => setLogin({ ...login, email: e.target.value })} className="w-full p-3 border rounded-lg text-gray-800" onKeyPress={e => e.key === 'Enter' && fazerLogin()} />
                    <input type="password" placeholder="Senha" value={login.senha} onChange={e => setLogin({ ...login, senha: e.target.value })} className="w-full p-3 border rounded-lg text-gray-800" onKeyPress={e => e.key === 'Enter' && fazerLogin()} />
                    <button onClick={fazerLogin} className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Entrar</button>
                </div>
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                    <strong>Demo:</strong> admin@contabilidade.com / admin123
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
                        <div>
                             <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                                <Cloud className="w-7 h-7" />
                                NFP Pro Cloud
                            </h1>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-1 font-semibold">
                                Desenvolvido BY - SP Assessoria Contabil
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                             <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                {theme === 'light' ? <Moon className="w-5 h-5 text-gray-600" /> : <Sun className="w-5 h-5 text-yellow-400" />}
                            </button>
                            <button onClick={() => setUser(null)} className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1.5 text-sm font-semibold transition-colors">
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
                                    {/* FIX: Use a ternary operator with a type check to safely compare badgeContent, which can be a string or a number. */}
                                    {badgeContent && (typeof badgeContent === 'string' ? true : badgeContent > 0) && <span className={`px-1.5 py-0.5 rounded-full text-xs font-mono ${t.id === 'alertas' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'}`}>{badgeContent}</span>}
                                </button>
                            );
                        })}
                    </div>
                </header>

                <main>
                    {/* ABA DEPLOY */}
                    {aba === 'deploy' && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fade-in">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-800 dark:text-gray-200"><Cloud className="w-5 h-5" />Deploy no Google Cloud Functions</h3>
                             <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                                <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">☁️ Por que Google Cloud?</h4>
                                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                                    <li><strong>Gratuito</strong> - Tier free generoso para começar</li>
                                    <li><strong>Integrado</strong> - Mesmo ecossistema do Google AI Studio</li>
                                    <li><strong>Escalável</strong> - Infraestrutura serverless que cresce com você</li>
                                    <li><strong>Seguro</strong> - Padrões de segurança do Google</li>
                                </ul>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Project ID do Google Cloud *</label>
                                    <input type="text" value={gcpConfig.projectId} onChange={e => setGcpConfig({ ...gcpConfig, projectId: e.target.value })} placeholder="meu-projeto-nfp" className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                                </div>
                                <button onClick={deployToGoogleCloud} disabled={deployStatus === 'deploying' || !gcpConfig.projectId} className={`w-full p-4 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed ${gcpConfig.deployed ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                    {deployStatus === 'deploying' ? <><Loader2 className="w-5 h-5 animate-spin" />Deployando...</> : gcpConfig.deployed ? <><CheckCircle className="w-5 h-5" />Redeploy</> : <><Zap className="w-5 h-5" />Deploy Automático</>}
                                </button>
                            </div>
                            {deployLogs.length > 0 && (
                                <div className="mt-6 bg-gray-900 rounded-lg p-4 max-h-60 overflow-y-auto font-mono text-xs">
                                    <p className="text-green-400 mb-2">Deploy Log (Simulação):</p>
                                    {deployLogs.map((log, i) => <p key={i} className="text-gray-300">{log.time} {log.msg}</p>)}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* ABA CERTIFICADOS */}
                    {aba === 'certificados' && (
                        <div className="space-y-6 animate-fade-in">
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
                                     <h3 className="font-bold text-lg mb-4">Certificados Carregados ({certificados.length})</h3>
                                     <div className="space-y-4">
                                        {certificados.map(cert => (
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
                                                        <button onClick={() => validarCertificado(cert.id)} disabled={certValidando === cert.id || !cert.senha} className="w-full py-2 rounded-lg font-semibold flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 transition-colors">
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
                                        ))}
                                     </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ABA CLIENTES */}
                    {aba === 'clientes' && (() => {
                        const clientsWithAlerts = resultados.filter(r => (r.prestados.semTomador || 0) > 0).length;
                        const totalAlerts = resultados.reduce((sum, r) => sum + (r.prestados.semTomador || 0), 0);
                        return (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h2 className="font-bold text-lg flex items-center gap-2"><Users className="w-5 h-5" />Gestão de Clientes</h2>
                                        <button onClick={() => setClientes([...clientes, { id: Date.now(), nome: '', cnpj: '', im: '', certificadoId: '', ativo: true }])} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">+ Adicionar Cliente</button>
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

                                            if (alertCount !== null) {
                                                if (alertCount === 0) {
                                                    alertColor = 'bg-green-500';
                                                    alertTooltip = 'Status: OK (0 alertas)';
                                                } else if (alertCount <= 5) {
                                                    alertColor = 'bg-yellow-500';
                                                    alertTooltip = `Status: Atenção (${alertCount} alerta${alertCount > 1 ? 's' : ''})`;
                                                } else {
                                                    alertColor = 'bg-red-500';
                                                    alertTooltip = `Status: Crítico (${alertCount} alerta${alertCount > 1 ? 's' : ''})`;
                                                }
                                            }

                                            return (
                                                <div key={c.id} className="border dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-700/50">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`w-3 h-3 rounded-full ${alertColor} transition-colors flex-shrink-0`} title={alertTooltip}></span>
                                                            <label className="flex items-center gap-2 text-sm font-medium">
                                                                <input type="checkbox" checked={c.ativo} onChange={e => setClientes(clientes.map(x => x.id === c.id ? { ...x, ativo: e.target.checked } : x))} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600" />
                                                                Ativo para processamento
                                                            </label>
                                                        </div>
                                                        <button onClick={() => setClientes(clientes.filter(x => x.id !== c.id))} className="text-red-600 dark:text-red-500 hover:text-red-800 dark:hover:text-red-400 text-sm font-semibold">Remover</button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <input placeholder="Nome da Empresa *" value={c.nome} onChange={e => setClientes(clientes.map(x => x.id === c.id ? { ...x, nome: e.target.value } : x))} className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" disabled={!c.ativo} />
                                                        <input placeholder="CNPJ *" value={c.cnpj} onChange={e => setClientes(clientes.map(x => x.id === c.id ? { ...x, cnpj: e.target.value } : x))} className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" disabled={!c.ativo} />
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
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                                    <h2 className="font-bold mb-4 flex items-center gap-2 text-lg"><FileText className="w-5 h-5" />Logs de Processamento</h2>
                                    <div className="bg-gray-900 rounded p-3 h-[calc(100%-40px)] overflow-y-auto text-xs font-mono">
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
                                            <BarChart data={resultados.map(r => ({ name: r.cliente.substring(0, 15), creditos: parseFloat(r.prestados.creditos) }))} onMouseMove={(state) => { if (state.isTooltipActive) { setActiveChartIndex(state.activeTooltipIndex ?? null); } else { setActiveChartIndex(null); } }} onMouseLeave={() => setActiveChartIndex(null)}>
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
                                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 grid grid-cols-2 gap-x-4">
                                                <span>Notas Prestadas: <strong>{h.resultados.reduce((s, r) => s + (r.prestados?.notas || 0), 0).toLocaleString('pt-BR')}</strong></span>
                                                <span>Créditos Gerados: <strong>R$ {h.resultados.reduce((s, r) => s + parseFloat(r.prestados?.creditos || '0'), 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong></span>
                                                <span>Notas Tomadas: <strong>{h.resultados.reduce((s, r) => s + (r.tomados?.notas || 0), 0).toLocaleString('pt-BR')}</strong></span>
                                                <span>Valor Tomado: <strong>R$ {h.resultados.reduce((s, r) => s + parseFloat(r.tomados?.valor || '0'), 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong></span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ABA ALERTAS */}
                    {aba === 'alertas' && (() => {
                        const clientsWithAlerts = resultados.filter(r => (r.prestados.semTomador || 0) > 0);
                        return (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fade-in">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-lg flex items-center gap-2"><Bell className="w-5 h-5" />Alertas Fiscais</h3>
                                    {clientsWithAlerts.length > 0 && (
                                        <button onClick={generateAlertReport} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 font-semibold transition-colors text-sm">
                                            <FileText className="w-4 h-4" />Gerar Relatório Resumido
                                        </button>
                                    )}
                                </div>
                                {clientsWithAlerts.length === 0 ? (
                                    <div className="text-center py-12">
                                        <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                                        <h4 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Tudo em Ordem!</h4>
                                        <p className="text-gray-500 dark:text-gray-400 mt-2">Nenhum alerta fiscal foi identificado no último processamento.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {clientsWithAlerts.map(r => (
                                            <div key={r.cnpj} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                                                <button onClick={() => toggleAlertExpansion(r.cnpj)} className="w-full flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
                                                    <div>
                                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{r.cliente}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{r.cnpj}</p>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 rounded-full text-xs font-bold">{r.prestados.semTomador} {r.prestados.semTomador === 1 ? 'Alerta' : 'Alertas'}</span>
                                                        <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${expandedAlerts.includes(r.cnpj) ? 'rotate-180' : ''}`} />
                                                    </div>
                                                </button>
                                                {expandedAlerts.includes(r.cnpj) && (
                                                    <div className="p-4 bg-white dark:bg-gray-800 border-t dark:border-gray-700 animate-fade-in">
                                                        <h5 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">Notas com Pendências:</h5>
                                                        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                                            {Array.from({ length: r.prestados.semTomador || 0 }).map((_, i) => {
                                                                const nfNumber = parseInt(r.cnpj.slice(0, 6).replace(/\D/g, '')) + i + 1;
                                                                return (
                                                                <li key={i} className="flex justify-between items-center py-2 border-b dark:border-gray-700 last:border-b-0">
                                                                    <div>
                                                                        <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">NF #{nfNumber}</span>
                                                                        <p className="text-red-500 text-xs mt-1 font-medium">Motivo: Sem CPF/CNPJ do tomador.</p>
                                                                    </div>
                                                                    <a 
                                                                        href={`https://nfe.prefeitura.sp.gov.br/contribuinte/notasedicao.aspx?nf=${nfNumber}`}
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                                                                    >
                                                                        Corrigir no Portal
                                                                        <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                </li>
                                                                )
                                                            })}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })()}

                    {/* MODAL HISTÓRICO */}
                    {selectedHistoryItem && (
                         <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setSelectedHistoryItem(null)}>
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                                <h3 className="font-bold text-lg mb-4">Detalhes da Consulta de {selectedHistoryItem.data} (Período: {selectedHistoryItem.resultados[0]?.periodo})</h3>
                                 <div className="overflow-x-auto">
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
                                            {selectedHistoryItem.resultados.map((r, i) => (
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
                                <button onClick={() => setSelectedHistoryItem(null)} className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Fechar</button>
                            </div>
                        </div>
                    )}

                    {/* MODAL RELATÓRIO DE ALERTAS */}
                    {reportModal.isOpen && (
                        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setReportModal({ ...reportModal, isOpen: false })}>
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                                <h3 className="font-bold text-lg mb-4">Relatório de Alertas</h3>
                                <div className="flex-grow overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded p-4 prose dark:prose-invert prose-sm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportModal.content}</ReactMarkdown>
                                </div>
                                <div className="mt-6 flex justify-end gap-4">
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(reportModal.content);
                                            addLog('📋 Relatório copiado para a área de transferência!', 'success');
                                        }} 
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
                                    >
                                        Copiar Texto
                                    </button>
                                    <button onClick={() => setReportModal({ ...reportModal, isOpen: false })} className="px-4 py-2 bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 font-semibold transition-colors">
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </main>
            </div>
        </div>
    );
}
