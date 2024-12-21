import express from 'express';
import axios from 'axios';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const CACHE_FILE = path.resolve(__dirname, 'clientes_cache.json');
const PAGE_SIZE = 250;

const API_URL = "https://api.vhsys.com/v2/clientes/";
const ACCESS_TOKEN = "vBGG7t5Q6rZYX8WFAMZjHsNVL6zmjp";
const SECRET_TOKEN = "vdRRoVTeYDzBal1Mr2N0ajt6BK9ZGK";

// Função para carregar o cache do arquivo
async function loadCache() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

// Função para salvar o cache no arquivo
async function saveCache(cache) {
    try {
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (error) {
        console.error('Erro ao salvar o cache:', error);
    }
}

// Função para buscar todos os clientes com paginação
async function fetchAllClients() {
    let allClients = {};
    let offset = 0;

    try {
        while (true) {
            const response = await axios.get(API_URL, {
                headers: {
                    'access-token': ACCESS_TOKEN,
                    'secret-access-token': SECRET_TOKEN,
                    'cache-control': 'no-cache',
                    'content-type': 'application/json',
                },
                params: {
                    offset,
                    limit: PAGE_SIZE,
                },
            });

            const clients = response.data?.data || [];
            if (clients.length === 0) break;

            for (const client of clients) {
                allClients[client.id_cliente] = client;
            }

            offset += PAGE_SIZE;
        }

        return allClients;
    } catch (error) {
        console.error('Erro ao buscar clientes:', error);
        return allClients;
    }
}

// Função para obter o total de clientes na API
async function getTotalClients() {
    try {
        const response = await axios.get(API_URL, {
            headers: {
                'access-token': ACCESS_TOKEN,
                'secret-access-token': SECRET_TOKEN,
                'cache-control': 'no-cache',
                'content-type': 'application/json',
            },
        });

        return response.data?.paging?.total || 0;
    } catch (error) {
        console.error('Erro ao obter total de clientes:', error);
        return 0;
    }
}

// Atualiza o cache verificando por novos clientes
async function updateCache() {
    const existingCache = await loadCache();
    const totalClients = await getTotalClients();

    if (Object.keys(existingCache).length < totalClients) {
        console.log('Atualizando o cache com novos clientes...');
        const newClients = await fetchAllClients();
        const updatedCache = { ...existingCache, ...newClients };
        await saveCache(updatedCache);
        return updatedCache;
    }

    console.log('O cache já está atualizado.');
    return existingCache;
}

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Rota para a página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/clientes-flag-page', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'clientes_flag.html'));
});

// Rota para obter clientes com flag
app.get('/clientes-flag', async (req, res) => {
    try {
        const cache = await loadCache();
        const clientesFlag = Object.values(cache).filter(client => client.flag);
        res.json(clientesFlag);
    } catch (error) {
        console.error('Erro ao carregar clientes com flag:', error);
        res.status(500).json({ error: 'Erro ao carregar clientes com flag' });
    }
});

// Rota para obter clientes vencidos
app.get('/clientes-vencidos', async (req, res) => {
    const cache = await updateCache();

    const vencidos = Object.values(cache)
        .filter(client => !client.flag)
        .map(client => {
            const dataBase = client.data_mod_cliente || client.data_cad_cliente;
            const vencimento = new Date(dataBase);
            vencimento.setFullYear(vencimento.getFullYear() + 2);

            const diasParaVencer = Math.floor((vencimento - new Date()) / (1000 * 60 * 60 * 24));

            return {
                id_cliente: client.id_cliente,
                razao_cliente: client.razao_cliente,
                data_cad_cliente: client.data_cad_cliente,
                data_mod_cliente: client.data_mod_cliente,
                vencimento: vencimento.toISOString().split('T')[0],
                dias_para_vencer: diasParaVencer,
                status: diasParaVencer < 0 ? 'Vencido' : 'Próximo',
            };
        })
        .sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));

    res.json(vencidos);
});

// Rota para adicionar a flag a um cliente
app.post('/clientes-vencidos/:id/adicionar-flag', async (req, res) => {
    const { id } = req.params;
    const cache = await loadCache();

    if (!cache[id]) {
        return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });
    }

    // Adicionar flag ao cliente
    cache[id].flag = true;

    await saveCache(cache);
    res.json({ success: true, message: 'Flag adicionada ao cliente com sucesso.' });
});

// Rota para atualizar data_mod_cliente
app.post('/clientes-vencidos/:id/atualizar', async (req, res) => {
    const { id } = req.params;
    const { atualizar } = req.body;
    const cache = await loadCache();

    if (!cache[id]) {
        return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });
    }

    if (atualizar) {
        try {
            const response = await axios.put(`${API_URL}${id}`, { data_mod_cliente: new Date() }, {
                headers: {
                    'access-token': ACCESS_TOKEN,
                    'secret-access-token': SECRET_TOKEN,
                    'cache-control': 'no-cache',
                    'content-type': 'application/json',
                },
            });

            cache[id].data_mod_cliente = response.data.data_mod_cliente;
        } catch (error) {
            console.error('Erro ao atualizar cliente na API:', error);
            return res.status(500).json({ success: false, message: 'Erro ao atualizar cliente na API.' });
        }
    }

    await saveCache(cache);
    res.json({ success: true, message: 'Cliente atualizado com sucesso.' });
});

// Rota para remover a flag de um cliente
app.post('/clientes-flag/:id/remover', async (req, res) => {
    const { id } = req.params;
    const cache = await loadCache();

    if (!cache[id]) {
        return res.status(404).json({ success: false, message: 'Cliente não encontrado.' });
    }

    // Remover a flag do cliente
    delete cache[id].flag;

    await saveCache(cache);
    res.json({ success: true, message: 'Flag removida do cliente com sucesso.' });
});

// Rota para verificar e atualizar o cache
app.get('/verificar-atualizacoes', async (req, res) => {
    try {
        const existingCache = await loadCache();
        const totalClientsAPI = await getTotalClients();

        if (Object.keys(existingCache).length < totalClientsAPI) {
            console.log('Novos clientes encontrados, atualizando o cache...');
            const newClients = await fetchAllClients();
            const updatedCache = { ...existingCache, ...newClients };
            await saveCache(updatedCache);
            return res.json({ updated: true, message: 'Cache atualizado com novos clientes.' });
        }

        res.json({ updated: false, message: 'Nenhuma atualização encontrada.' });
    } catch (error) {
        console.error('Erro ao verificar atualizações no cache:', error);
        res.status(500).json({ error: 'Erro ao verificar atualizações no cache.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
