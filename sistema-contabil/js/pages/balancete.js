import { supabase } from '../config/supabaseClient.js';

// --- CONTROLE DE UI ---
const btnGerar = document.getElementById('btn-gerar-balancete');
const btnImprimir = document.getElementById('btn-imprimir');
const dataInicioInput = document.getElementById('data-inicio');
const dataFimInput = document.getElementById('data-fim');

// Define datas padrão (Início do mês até hoje)
const hoje = new Date();
const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
dataInicioInput.valueAsDate = primeiroDia;
dataFimInput.valueAsDate = hoje;

if (btnGerar) {
    btnGerar.addEventListener('click', gerarBalancete);
}

if (btnImprimir) {
    btnImprimir.addEventListener('click', () => window.print());
}

// --- FUNÇÃO PRINCIPAL ---
async function gerarBalancete() {
    const empresaId = localStorage.getItem('empresaAtivaId');
    const corpoTabela = document.getElementById('corpo-tabela-balancete');
    const rodapeTabela = document.getElementById('rodape-tabela-balancete');
    const dataInicio = dataInicioInput.value;
    const dataFim = dataFimInput.value;

    if (!empresaId) return alert("Selecione uma empresa.");
    if (!dataInicio || !dataFim) return alert("Preencha as datas.");

    corpoTabela.innerHTML = '<tr><td colspan="5" style="text-align:center">Calculando...</td></tr>';
    rodapeTabela.innerHTML = '';
    btnImprimir.style.display = 'none';

    try {
        // 1. Busca Plano de Contas e Lançamentos em paralelo (mais rápido)
        const [resContas, resLancamentos] = await Promise.all([
            supabase.from('plano_de_contas').select('*').eq('empresa_id', empresaId).order('codigo'),
            supabase.from('lancamentos').select('*').eq('empresa_id', empresaId).lte('data', dataFim) // Pega tudo até a data fim
        ]);

        if (resContas.error) throw resContas.error;
        if (resLancamentos.error) throw resLancamentos.error;

        const contas = resContas.data;
        const lancamentos = resLancamentos.data;

        // 2. Processa os Saldos
        // Mapa: ID da Conta -> Objeto com totais
        const mapaSaldos = {};

        // Inicializa o mapa com todas as contas zeradas
        contas.forEach(c => {
            mapaSaldos[c.id] = {
                codigo: c.codigo,
                nome: c.nome,
                natureza: c.natureza, // 1 (Devedora) ou -1 (Credora)
                anterior: 0,
                debito: 0,
                credito: 0,
                final: 0
            };
        });

        // Itera sobre os lançamentos para somar
        lancamentos.forEach(l => {
            const conta = mapaSaldos[l.conta_id];
            if (!conta) return; // Se a conta foi excluída mas tem lançamento, ignoramos (ou tratamos erro)

            const valor = Number(l.valor);

            // Verifica se é Saldo Anterior (Data < DataInicio) ou Movimento (Data >= DataInicio)
            if (l.data < dataInicio) {
                // No saldo anterior, precisamos aplicar a regra da natureza
                // Se for Débito, soma. Se for Crédito, subtrai (para contas Devedoras).
                // Simplificando: Vamos somar bruto D e C e calcular o saldo líquido depois
                if (l.tipo === 'D') conta.anterior += valor;
                else conta.anterior -= valor;
            } else {
                // Movimento do período
                if (l.tipo === 'D') conta.debito += valor;
                else conta.credito += valor;
            }
        });

        // 3. Renderiza a Tabela
        corpoTabela.innerHTML = '';
        
        let totalAnterior = 0;
        let totalDebito = 0;
        let totalCredito = 0;
        let totalFinal = 0;

        // Filtra contas que têm movimento ou saldo
        const contasAtivas = Object.values(mapaSaldos).filter(c => 
            c.anterior !== 0 || c.debito !== 0 || c.credito !== 0
        );

        if (contasAtivas.length === 0) {
            corpoTabela.innerHTML = '<tr><td colspan="5" style="text-align:center">Sem movimentação no período.</td></tr>';
            return;
        }

        contasAtivas.sort((a, b) => a.codigo.localeCompare(b.codigo));

        contasAtivas.forEach(c => {
            // Ajuste do Saldo Anterior baseado na Natureza
            // Se natureza é 1 (Ativo), Saldo + significa Devedor. 
            // Se natureza é -1 (Passivo), Saldo + significa Credor (porque invertemos a lógica na visualização geralmente)
            
            // Cálculo do Saldo Final: Anterior + (Débito - Crédito)
            // Mas precisamos normalizar pela natureza para saber se ficou positivo (ok) ou invertido
            
            // Lógica universal: 
            // Saldo Real = (Soma Debitos Totais - Soma Creditos Totais) * Natureza
            
            // Recalculando corretinho:
            const saldoAnteriorReal = c.anterior * c.natureza; 
            const saldoFinalReal = (c.anterior + c.debito - c.credito) * c.natureza;

            // Acumula Totais (apenas colunas de movimento D e C para conferência)
            totalDebito += c.debito;
            totalCredito += c.credito;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${c.codigo}</b> - ${c.nome}</td>
                <td class="col-numero">${formatarMoeda(saldoAnteriorReal)}</td>
                <td class="col-numero" style="color:blue">${formatarMoeda(c.debito)}</td>
                <td class="col-numero" style="color:red">${formatarMoeda(c.credito)}</td>
                <td class="col-numero"><b>${formatarMoeda(saldoFinalReal)}</b></td>
            `;
            corpoTabela.appendChild(tr);
        });

        // Rodapé com totais
        rodapeTabela.innerHTML = `
            <tr style="background-color: #f8f9fa; font-weight: bold;">
                <td>TOTAIS DO PERÍODO</td>
                <td>-</td>
                <td style="color:blue">${formatarMoeda(totalDebito)}</td>
                <td style="color:red">${formatarMoeda(totalCredito)}</td>
                <td>-</td>
            </tr>
        `;

        btnImprimir.style.display = 'inline-block';

        // Validação de Partidas Dobradas
        if (totalDebito.toFixed(2) !== totalCredito.toFixed(2)) {
            alert(`ATENÇÃO: O Balancete não fechou!\nDébitos: ${totalDebito}\nCréditos: ${totalCredito}\nDiferença: ${(totalDebito - totalCredito).toFixed(2)}`);
        }

    } catch (err) {
        console.error(err);
        alert("Erro ao gerar balancete: " + err.message);
    }
}

function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}