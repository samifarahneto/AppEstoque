const express = require("express");
const mysql = require("mysql");
const cors = require("cors");

const app = express();
const port = 3000;

// Configuração do banco de dados MySQL
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Neto010185!",
  database: "appestoque",
});

// Conecta ao banco de dados MySQL
db.connect((err) => {
  if (err) {
    console.error("Erro ao conectar ao banco de dados:", err);
    return;
  }
  console.log("Conectado ao banco de dados MySQL.");
});

app.use(express.json({ limit: "10mb" })); // Aumenta o limite de tamanho da requisição para suportar base64
app.use(cors());

// Endpoint para salvar o produto no banco de dados
app.post("/addproduct", (req, res) => {
  try {
    const { nome, descricao, valor_venda, quantidade, preco_custo, image } =
      req.body;

    if (!image) {
      console.error("Erro: Imagem não foi recebida.");
      return res.status(400).json({ error: "Erro: Imagem não foi recebida." });
    }

    // Decodifica a imagem de base64 para binário
    const imagemBuffer = Buffer.from(image, "base64");

    const sql = `INSERT INTO produtos (nome, descricao, valor_venda, quantidade, preco_custo, imagem) VALUES (?, ?, ?, ?, ?, ?)`;

    db.query(
      sql,
      [
        nome,
        descricao,
        parseFloat(valor_venda),
        parseInt(quantidade),
        parseFloat(preco_custo),
        imagemBuffer,
      ],
      (err, result) => {
        if (err) {
          console.error("Erro ao inserir produto no banco de dados:", err);
          return res
            .status(500)
            .json({ error: `Erro ao inserir produto: ${err.message}` });
        }
        res.status(201).json({ message: "Produto salvo com sucesso!" });
      }
    );
  } catch (error) {
    console.error("Erro inesperado ao processar a requisição:", error);
    res.status(500).json({ error: `Erro inesperado: ${error.message}` });
  }
});

// Endpoint para buscar todos os produtos
app.get("/products", (req, res) => {
  const sql = `SELECT id, nome, descricao, valor_venda, quantidade, preco_custo, imagem FROM produtos`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erro ao buscar produtos:", err);
      return res
        .status(500)
        .json({ error: `Erro ao buscar produtos: ${err.message}` });
    }
    // Converte cada imagem BLOB para base64 para exibição correta no frontend
    const produtos = results.map((produto) => ({
      ...produto,
      imagem: produto.imagem ? produto.imagem.toString("base64") : null,
    }));
    res.setHeader("Content-Type", "application/json");
    res.json(produtos);
  });
});

// Endpoint para atualizar múltiplos produtos
app.post("/updateproducts", (req, res) => {
  const { products } = req.body;

  if (!products || products.length === 0) {
    return res.status(400).json({ error: "Nenhum produto para atualizar." });
  }

  const updatePromises = products.map((product) => {
    const {
      id,
      nome,
      descricao,
      quantidade,
      valor_venda,
      preco_custo,
      imagem,
    } = product;
    const imagemBuffer = imagem ? Buffer.from(imagem, "base64") : null;

    const sql = `UPDATE produtos SET nome = ?, descricao = ?, quantidade = ?, valor_venda = ?, preco_custo = ?, imagem = ? WHERE id = ?`;

    return new Promise((resolve, reject) => {
      db.query(
        sql,
        [
          nome,
          descricao,
          quantidade,
          valor_venda,
          preco_custo,
          imagemBuffer,
          id,
        ],
        (err, result) => {
          if (err) {
            console.error("Erro ao atualizar produto:", err);
            return reject(`Erro ao atualizar produto: ${err.message}`);
          }
          resolve();
        }
      );
    });
  });

  Promise.all(updatePromises)
    .then(() => res.json({ message: "Produtos atualizados com sucesso!" }))
    .catch((error) =>
      res.status(500).json({ error: `Erro ao atualizar produtos: ${error}` })
    );
});

// Endpoint para deletar um produto
app.delete("/deleteproduct/:id", (req, res) => {
  const { id } = req.params;

  const sql = `DELETE FROM produtos WHERE id = ?`;
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Erro ao deletar produto:", err);
      return res.status(500).json({ error: "Erro ao deletar produto." });
    }
    res.status(200).json({ message: "Produto deletado com sucesso!" });
  });
});

// Endpoint para atualizar o estoque após finalizar a compra e salvar a venda
app.post("/updateStock", (req, res) => {
  const { items } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Nenhum item para atualizar." });
  }

  const updatePromises = items.map((item) => {
    return new Promise((resolve, reject) => {
      const sqlUpdate = `UPDATE produtos SET quantidade = quantidade - ? WHERE id = ?`;
      db.query(sqlUpdate, [item.count, item.id], (err) => {
        if (err) {
          console.error(`Erro ao atualizar o produto ${item.nome}:`, err);
          return reject(`Erro ao atualizar o produto ${item.nome}`);
        }

        const sqlInsertVenda = `INSERT INTO vendas (produto_id, quantidade, valor_venda, data_hora) VALUES (?, ?, ?, NOW())`;
        db.query(
          sqlInsertVenda,
          [item.id, item.count, item.valor_venda],
          (err) => {
            if (err) {
              console.error(
                `Erro ao registrar venda para o produto ${item.nome}:`,
                err
              );
              return reject(
                `Erro ao registrar venda para o produto ${item.nome}`
              );
            }
            resolve();
          }
        );
      });
    });
  });

  Promise.all(updatePromises)
    .then(() => {
      res.status(200).json({
        message: "Estoque atualizado e vendas registradas com sucesso.",
      });
    })
    .catch((error) => {
      res.status(500).json({
        error: `Erros ao atualizar produtos e registrar vendas: ${error}`,
      });
    });
});

// Endpoint para buscar as vendas agrupadas por data para o relatório
app.get("/salesReport", (req, res) => {
  const sql = `
    SELECT 
      v.id, 
      DATE(v.data_hora) AS data, 
      p.nome AS produto, 
      p.descricao AS descricao, 
      v.quantidade, 
      (v.quantidade * v.valor_venda) AS valor_total,
      p.id AS produto_id
    FROM vendas v
    JOIN produtos p ON p.id = v.produto_id
    ORDER BY v.data_hora DESC`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erro ao buscar relatório de vendas:", err);
      return res
        .status(500)
        .json({ error: "Erro ao buscar relatório de vendas." });
    }

    const groupedSales = results.reduce((acc, sale) => {
      const date = sale.data.toLocaleDateString("pt-BR");
      if (!acc[date]) {
        acc[date] = { items: [], total: 0 };
      }
      acc[date].items.push(sale);
      acc[date].total += sale.valor_total;
      return acc;
    }, {});

    res.setHeader("Content-Type", "application/json");
    res.status(200).json(groupedSales);
  });
});

// Endpoint para buscar o relatório de estoque
app.get("/inventoryReport", (req, res) => {
  const sql = `SELECT nome, descricao, quantidade FROM produtos ORDER BY nome ASC`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erro ao buscar relatório de estoque:", err);
      return res
        .status(500)
        .json({ error: "Erro ao buscar relatório de estoque." });
    }

    res.setHeader("Content-Type", "application/json");
    res.status(200).json(results);
  });
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
