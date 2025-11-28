import { supabase } from '../config/supabaseClient.js';

// Mapa para guardar nomes das contas
let mapaContas = {}; 

// --- UI CONTROL ---
const formContainer = document.getElementById('form-container-novo-lancamento');
const btnNovo = document.getElementById('btn-novo-lancamento');
const btnCancelar = document.getElementById('btn-cancelar');

// Inicializa
carregarSelects();
carregarDiario();

if(btnNovo) {
    btnNovo.onclick = () => {
        if(formContainer) formContainer.style.display = 'block';
        
        const hoje = new Date();
        const inputData = document.getElementById('data-lancamento');
        if(inputData) {
            const ano = hoje.getFullYear();
            const mes = String(hoje.getMonth() + 1).padStart(2, '0');
            const dia = String(hoje.getDate()).padStart(2, '0');
            inputData.value = `${ano}-${mes}-${dia}`;
        }

        const select = document.getElementById('conta-debito');
        if (select && select.options.length <= 1) carregarSelects();
    };
}

if(btnCancelar) {
    btnCancelar.onclick = () => {
        if(formContainer) formContainer.style.display = 'none';
        document.getElementById('form-novo-lancamento')?.reset();
    };
}

// Máscara de moeda
const inputValor = document.getElementById('valor');
if(inputValor) {
    inputValor.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, "");
        value = (Number(value) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
        e.target.value = value;
    });
}

// --- 1. CARREGAR CONTAS NOS SELECTS ---
async function carregarSelects() {
    const empresaId = localStorage.getItem('empresaAtivaId');
    if (!empresaId) return;

    const selectDebito = document.getElementById('conta-debito');
    const selectCredito = document.getElementById('conta-credito');

    if(!selectDebito || !selectCredito) return;

    selectDebito.innerHTML = '<option value="">Carregando...</option>';
    selectCredito.innerHTML = '<option value="">Carregando...</option>';

    const { data, error } = await supabase
        .from('plano_de_contas')
        .select('id, codigo, nome, tipo')
        .eq('empresa_id', empresaId)
        .order('codigo');

    if (error) {
        console.error("Erro ao carregar contas:", error);
        return;
    }

    selectDebito.innerHTML = '<option value="">Selecione...</option>';
    selectCredito.innerHTML = '<option value="">Selecione...</option>';
    mapaContas = {};

    const contas = data.filter(c => c.tipo === 'A' || !c.tipo);

    contas.forEach(conta => {
        mapaContas[conta.id] = `${conta.codigo} - ${conta.nome}`;
        
        const opt = document.createElement('option');
        opt.value = conta.id; 
        opt.textContent = `${conta.codigo} - ${conta.nome}`;
        
        selectDebito.appendChild(opt);
        selectCredito.appendChild(opt.cloneNode(true));
    });
}

// --- 2. SALVAR LANÇAMENTO ---
const formLancamento = document.getElementById('form-novo-lancamento');
if(formLancamento) {
    formLancamento.onsubmit = async (e) => {
        e.preventDefault();

        const empresaId = localStorage.getItem('empresaAtivaId');
        if (!empresaId) return alert("Selecione uma empresa!");

        const dataLancamento = document.getElementById('data-lancamento').value;
        const contaDebitoId = document.getElementById('conta-debito').value; // Agora é string (UUID)
        const contaCreditoId = document.getElementById('conta-credito').value; // Agora é string (UUID)
        const historico = document.getElementById('historico').value;
        const valorTexto = document.getElementById('valor').value;

        // Validações
        if (!contaDebitoId || !contaCreditoId) return alert("Selecione as contas de Débito e Crédito.");
        if (contaDebitoId === contaCreditoId) return alert("As contas de Débito e Crédito não podem ser iguais.");
        
        const valorFloat = parseFloat(valorTexto.replace(/\./g, '').replace(',', '.'));
        if (!valorFloat || isNaN(valorFloat)) return alert("Valor inválido.");

        // NÃO FAZEMOS MAIS PARSEINT NOS IDs DAS CONTAS
        
        const partidaId = Date.now(); 

        const registros = [
            {
                partida_id: partidaId,
                empresa_id: empresaId,
                data: dataLancamento,
                historico: historico,
                valor: valorFloat,
                tipo: 'D',
                conta_id: contaDebitoId // Envia o código UUID direto
            },
            {
                partida_id: partidaId,
                empresa_id: empresaId,
                data: dataLancamento,
                historico: historico,
                valor: valorFloat,
                tipo: 'C',
                conta_id: contaCreditoId // Envia o código UUID direto
            }
        ];

        console.log("Enviando para o banco:", registros);

        const { error } = await supabase.from('lancamentos').insert(registros);

        if (error) {
            console.error("Erro Supabase:", error);
            alert("Erro ao salvar: " + error.message);
        } else {
            alert("Lançamento salvo com sucesso!");
            formContainer.style.display = 'none';
            document.getElementById('form-novo-lancamento').reset();
            carregarDiario();
        }
    };
}

// --- 3. LISTAR LANÇAMENTOS ---
async function carregarDiario() {
    const tbody = document.getElementById('corpo-tabela-diario');
    const empresaId = localStorage.getItem('empresaAtivaId');

    if (!empresaId || !tbody) return;

    if (Object.keys(mapaContas).length === 0) await carregarSelects();

    tbody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';

    const { data, error } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('partida_id', { ascending: false });

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar.</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Nenhum lançamento encontrado.</td></tr>';
        return;
    }

    const partidas = {};
    data.forEach(reg => {
        if (!partidas[reg.partida_id]) {
            partidas[reg.partida_id] = { 
                data: reg.data, 
                historico: reg.historico, 
                valor: reg.valor,
                debito: null,
                credito: null
            };
        }
        if (reg.tipo === 'D') partidas[reg.partida_id].debito = reg.conta_id;
        if (reg.tipo === 'C') partidas[reg.partida_id].credito = reg.conta_id;
    });

    Object.values(partidas).forEach(p => {
        const tr = document.createElement('tr');
        
        let dataShow = p.data;
        if (dataShow && dataShow.includes('T')) dataShow = dataShow.split('T')[0];
        if (dataShow && dataShow.includes('-')) {
            const [ano, mes, dia] = dataShow.split('-');
            dataShow = `${dia}/${mes}/${ano}`;
        }
        
        const valorShow = p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        const nomeDebito = mapaContas[p.debito] || `ID...${p.debito.slice(0,8)}`;
        const nomeCredito = mapaContas[p.credito] || `ID...${p.credito.slice(0,8)}`;

        tr.innerHTML = `
            <td>${dataShow}</td>
            <td>${p.historico}</td>
            <td>${nomeDebito}</td>
            <td>${nomeCredito}</td>
            <td>${valorShow}</td>
        `;
        tbody.appendChild(tr);
    });
}