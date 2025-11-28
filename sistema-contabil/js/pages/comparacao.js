// import { supabase } from '../config/supabaseClient.js';

// const selectA = document.getElementById('select-periodo-a');
// const selectB = document.getElementById('select-periodo-b');
// const btnComparar = document.getElementById('btn-comparar');
// const btnVoltar = document.getElementById('btn-voltar');
// const tbody = document.getElementById('corpo-comparacao');

// // --- INICIO ---
// carregarFechamentos();

// if(btnVoltar) {
//     btnVoltar.addEventListener('click', () => {
//         // Volta para o balanço normal
//         document.querySelector('a[href="#balanco-patrimonial"]')?.click();
//     });
// }

// if(btnComparar) {
//     btnComparar.addEventListener('click', gerarComparacao);
// }

// // 1. Carrega Datas Disponíveis
// async function carregarFechamentos() {
//     const empresaId = localStorage.getItem('empresaAtivaId');
//     if(!empresaId) return;

//     const { data } = await supabase
//         .from('fechamentos')
//         .select('data_fechamento')
//         .eq('empresa_id', empresaId)
//         .order('data_fechamento', { ascending: false });

//     if(data) {
//         const datasUnicas = [...new Set(data.map(d => d.data_fechamento))];
        
//         selectA.innerHTML = '<option value="">Selecione...</option>';
//         selectB.innerHTML = '<option value="">Selecione...</option>';

//         datasUnicas.forEach(d => {
//             const label = d.split('-').reverse().join('/');
//             const opt = `<option value="${d}">${label}</option>`;
//             selectA.innerHTML += opt;
//             selectB.innerHTML += opt;
//         });
//     }
// }

// // 2. Gera Tabela
// async function gerarComparacao() {
//     const dataA = selectA.value;
//     const dataB = selectB.value;
//     const empresaId = localStorage.getItem('empresaAtivaId');

//     if(!dataA || !dataB) return alert("Selecione dois períodos.");

//     tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Carregando...</td></tr>';

//     // Busca nomes das contas + saldos das duas datas
//     // Precisamos do plano de contas para saber o nome e classificação
//     const [resContas, resA, resB] = await Promise.all([
//         supabase.from('plano_de_contas').select('*').eq('empresa_id', empresaId),
//         supabase.from('fechamentos').select('*').eq('empresa_id', empresaId).eq('data_fechamento', dataA),
//         supabase.from('fechamentos').select('*').eq('empresa_id', empresaId).eq('data_fechamento', dataB)
//     ]);

//     const contasMap = {};
//     resContas.data.forEach(c => contasMap[c.id] = c);

//     // Mapa unificado de saldos
//     const dados = {}; // contaId -> { saldoA: 0, saldoB: 0 }

//     resA.data.forEach(item => {
//         if(!dados[item.conta_id]) dados[item.conta_id] = { saldoA: 0, saldoB: 0 };
//         dados[item.conta_id].saldoA = item.saldo;
//     });

//     resB.data.forEach(item => {
//         if(!dados[item.conta_id]) dados[item.conta_id] = { saldoA: 0, saldoB: 0 };
//         dados[item.conta_id].saldoB = item.saldo;
//     });

//     // Calcula Totais para AV
//     // Para AV, a base é o Total do Ativo (Grupo 1)
//     let totalAtivoA = 0;
//     let totalAtivoB = 0;

//     Object.keys(dados).forEach(id => {
//         const conta = contasMap[id];
//         if(conta && conta.grupo === 1) {
//             totalAtivoA += dados[id].saldoA;
//             totalAtivoB += dados[id].saldoB;
//         }
//     });

//     tbody.innerHTML = '';

//     // Ordena por código
//     const idsOrdenados = Object.keys(dados).sort((a,b) => {
//         const cA = contasMap[a]?.codigo || '';
//         const cB = contasMap[b]?.codigo || '';
//         return cA.localeCompare(cB);
//     });

//     idsOrdenados.forEach(id => {
//         const conta = contasMap[id];
//         if(!conta) return; // Conta deletada?

//         const valA = dados[id].saldoA;
//         const valB = dados[id].saldoB;

//         // Base da AV depende se é Ativo ou Passivo
//         const baseA = conta.grupo === 1 ? totalAtivoA : totalAtivoA; // Na contabilidade Ativo = Passivo+PL
//         const baseB = conta.grupo === 1 ? totalAtivoB : totalAtivoB;

//         const avA = baseA ? (valA / baseA) * 100 : 0;
//         const avB = baseB ? (valB / baseB) * 100 : 0;

//         // AH: (A / B) - 1
//         let ahTexto = '-';
//         let colorAh = 'black';
        
//         if(valB !== 0) {
//             const ah = ((valA / valB) - 1) * 100;
//             ahTexto = ah.toFixed(1) + '%';
//             if(ah > 0) { ahTexto = '+'+ahTexto; colorAh = 'green'; }
//             if(ah < 0) colorAh = 'red';
//         } else if (valA !== 0) {
//             ahTexto = 'Novo'; colorAh = 'blue';
//         }

//         const tr = document.createElement('tr');
//         tr.innerHTML = `
//             <td><b>${conta.codigo}</b> - ${conta.nome}</td>
//             <td>${valA.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
//             <td style="font-size:0.9em; color:gray">${avA.toFixed(1)}%</td>
//             <td>${valB.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
//             <td style="font-size:0.9em; color:gray">${avB.toFixed(1)}%</td>
//             <td style="font-weight:bold; color:${colorAh}">${ahTexto}</td>
//         `;
//         tbody.appendChild(tr);
//     });
// }