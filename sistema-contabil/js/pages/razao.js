import { supabase } from '../config/supabaseClient.js';

// --- CONTROLE DE UI ---
const contaSelect = document.getElementById('razao-conta-select');
const btnGerar = document.getElementById('btn-gerar-razao');
const razaoContainer = document.getElementById('razao-container');

// --- CARREGAR LISTA DE CONTAS NO SELECT ---
async function carregarSelectContas() {
    const empresaId = localStorage.getItem('empresaAtivaId');
    
    if (!empresaId) {
        if(contaSelect) contaSelect.innerHTML = '<option>Selecione uma empresa primeiro</option>';
        if(btnGerar) btnGerar.disabled = true;
        return;
    }

    if(!contaSelect) return;

    contaSelect.innerHTML = '<option value="">Carregando...</option>';

    const { data: contas, error } = await supabase
        .from('plano_de_contas')
        .select('id, codigo, nome, natureza')
        .eq('empresa_id', empresaId)
        .order('codigo');
    
    if (error) {
        console.error(error);
        contaSelect.innerHTML = '<option>Erro ao carregar</option>';
        return;
    }

    contaSelect.innerHTML = '<option value="">-- Selecione uma conta --</option>';
    
    contas.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.dataset.natureza = c.natureza; // Guarda a natureza (1 ou -1) no HTML
        option.dataset.nome = `${c.codigo} - ${c.nome}`;
        option.textContent = `${c.codigo} - ${c.nome}`;
        contaSelect.appendChild(option);
    });
}

// --- GERAR O RAZÃO ---
if(btnGerar) {
    btnGerar.addEventListener('click', async () => {
        const empresaId = localStorage.getItem('empresaAtivaId');
        const contaId = contaSelect.value;

        if (!contaId) {
            alert('Por favor, selecione uma conta.');
            return;
        }

        // Pega dados da conta selecionada (que guardamos no dataset do option)
        const optionSelecionada = contaSelect.options[contaSelect.selectedIndex];
        const nomeConta = optionSelecionada.dataset.nome;
        const naturezaConta = parseInt(optionSelecionada.dataset.natureza);

        // Limpa tabelas visualmente enquanto carrega
        document.getElementById('razao-titulo-conta').textContent = `Carregando: ${nomeConta}...`;
        document.getElementById('razao-corpo-debito').innerHTML = '';
        document.getElementById('razao-corpo-credito').innerHTML = '';
        razaoContainer.style.display = 'block';

        // Busca lançamentos dessa conta na tabela NOVA (lancamentos)
        // Nota: Se você mudou para 'livro_diario', altere aqui. 
        // Mas pelo contexto, voltamos para 'lancamentos'.
        const { data: lancamentos, error } = await supabase
            .from('lancamentos')
            .select('data, historico, valor, tipo')
            .eq('empresa_id', empresaId)
            .eq('conta_id', contaId)
            .order('data', { ascending: true });

        if (error) {
            alert('Erro ao buscar os lançamentos.');
            console.error(error);
            return;
        }

        // Preenche as tabelas
        const corpoDebito = document.getElementById('razao-corpo-debito');
        const corpoCredito = document.getElementById('razao-corpo-credito');
        
        let totalDebito = 0;
        let totalCredito = 0;

        lancamentos.forEach(l => {
            const tr = document.createElement('tr');
            
            // Formata Data
            let dataShow = l.data;
            if(l.data.length > 10) dataShow = l.data.substring(0,10);
            const [ano, mes, dia] = dataShow.split('-');
            const dataPt = `${dia}/${mes}/${ano}`;

            const valorFmt = l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            
            tr.innerHTML = `<td>${dataPt}</td><td>${l.historico}</td><td>${valorFmt}</td>`;

            if (l.tipo === 'D') {
                corpoDebito.appendChild(tr);
                totalDebito += l.valor;
            } else {
                corpoCredito.appendChild(tr);
                totalCredito += l.valor;
            }
        });

        // Calcula Saldos
        // Se Natureza = 1 (Devedora/Ativo/Despesa): Saldo = Débito - Crédito
        // Se Natureza = -1 (Credora/Passivo/Receita): Saldo = Crédito - Débito
        // MAS, para exibir "Saldo Devedor" ou "Credor", fazemos assim:
        
        let saldoValor = totalDebito - totalCredito;
        let tipoSaldo = saldoValor >= 0 ? 'Devedor (D)' : 'Credor (C)';
        
        // Se for conta de natureza Credora (Passivo), o saldo "natural" seria C.
        // Mas matematicamente: D - C. Se der negativo, é Credor.
        
        document.getElementById('razao-titulo-conta').textContent = nomeConta;
        document.getElementById('razao-total-debito').textContent = `Total Débitos: ${totalDebito.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        document.getElementById('razao-total-credito').textContent = `Total Créditos: ${totalCredito.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        document.getElementById('razao-saldo-final').textContent = `Saldo Final: ${Math.abs(saldoValor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ${tipoSaldo}`;
    });
}

// Inicializa
carregarSelectContas();