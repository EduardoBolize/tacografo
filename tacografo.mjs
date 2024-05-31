import express from 'express';
import axios from 'axios';
import { DateTime } from 'luxon';

const app = express();
const PORT = 3000;

// Configurações da API
const API_URL = "https://api.vhsys.com/v2/clientes/";
const ACCESS_TOKEN = "vBGG7t5Q6rZYX8WFAMZjHsNVL6zmjp";
const SECRET_TOKEN = "vdRRoVTeYDzBal1Mr2N0ajt6BK9ZGK";

// Função para consultar os dados da API
async function fetchClients(dataCadastro, dataModificacao) {
  try {
    const params = {
      data_cadastro: dataCadastro,
    };
    if (dataModificacao) {
      params.data_modificacao = dataModificacao;
    }

    const response = await axios.get(API_URL, {
      headers: {
        'access-token': ACCESS_TOKEN,
        'secret-access-token': SECRET_TOKEN,
        'cache-control': 'no-cache',
        'content-type': 'application/json'
      },
      params
    });

    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data;
    } else {
      throw new Error('Dados recebidos não estão em um array.');
    }
  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    return [];
  }
}

// Função para formatar e ordenar os dados
function formatAndSortData(data) {
  try {
    const clients = data.map(client => {
      const dataCadastro = DateTime.fromFormat(client.data_cad_cliente, "yyyy-MM-dd");
      const dataModificacao = client.data_mod_cliente 
        ? DateTime.fromFormat(client.data_mod_cliente, "yyyy-MM-dd HH:mm:ss") 
        : null;

      const ultimaVerificacao = dataModificacao || dataCadastro;
      const proximaVerificacao = ultimaVerificacao.plus({ years: 2 });

      return {
        nome: client.razao_cliente,
        email: client.email_cliente || '',
        telefone: client.fone_cliente || '',
        cnpj: client.cnpj_cliente || 'N/A',
        proximaVerificacao,
        diasParaVencer: proximaVerificacao.diffNow('days').days,
        dataCadastro,
        dataModificacao
      };
    });

    clients.sort((a, b) => a.diasParaVencer - b.diasParaVencer);

    return clients;
  } catch (error) {
    throw new Error("Erro ao formatar e ordenar os dados: " + error.message);
  }
}

// Rota para exibir os dados
app.get('/', async (req, res) => {
  const defaultDate = DateTime.now().minus({ years: 2 }).toFormat("yyyy-MM-dd");
  const dataCadastro = req.query.data_cadastro || defaultDate;
  const dataModificacao = req.query.data_modificacao || null;

  if (!DateTime.fromFormat(dataCadastro, "yyyy-MM-dd").isValid || 
      (dataModificacao && !DateTime.fromFormat(dataModificacao, "yyyy-MM-dd HH:mm:ss").isValid)) {
    return res.status(400).send("Por favor, forneça datas válidas nos formatos YYYY-MM-DD e YYYY-MM-DD HH:MM:SS.");
  }

  try {
    const data = await fetchClients(dataCadastro, dataModificacao);
    const clients = formatAndSortData(data);

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Clientes</title>
          <style>
              table {
                  width: 100%;
                  border-collapse: collapse;
              }
              th, td {
                  padding: 8px 12px;
                  border: 1px solid #ccc;
              }
              th {
                  background-color: #f4f4f4;
              }
          </style>
      </head>
      <body>
          <h1>Clientes</h1>
          <table>
              <thead>
                  <tr>
                      <th>Nome</th>
                      <th>Email</th>
                      <th>Telefone</th>
                      <th>CNPJ</th>
                      <th>Dias para Vencer</th>
                  </tr>
              </thead>
              <tbody>
                  ${clients.map(client => `
                      <tr>
                          <td>${client.nome}</td>
                          <td>${client.email}</td>
                          <td>${client.telefone}</td>
                          <td>${client.cnpj}</td>
                          <td>${Math.round(client.diasParaVencer)}</td>
                      </tr>
                  `).join('')}
              </tbody>
          </table>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Erro ao processar e exibir os clientes:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
