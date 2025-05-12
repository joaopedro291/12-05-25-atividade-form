import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Configuração do diretório atual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 80;

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Apenas imagens são permitidas (jpeg, jpg, png, gif)'));
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Criar diretório de uploads se não existir
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: 'senac@02',
    database: 'atvdform'
});

app.post('/api/mysql', upload.single('imagem'), async (req, res) => {
    const { nome, login, senha, tipo, id } = req.body;
    const imagem = req.file ? req.file.filename : null;

    try {
        switch (tipo) {
            case 'cadastro':
                const [rows] = await pool.query(
                    "INSERT INTO tbl_cadastro (nome, login, senha, imagem) VALUES (?, ?, ?, ?)",
                    [nome, login, senha, imagem] // Senha em texto puro
                );
                
                if (rows.affectedRows > 0) {
                    res.json({ 
                        success: true,
                        message: 'Usuário cadastrado com sucesso!',
                        imagemUrl: imagem ? `/uploads/${imagem}` : null
                    });
                } else {
                    throw new Error('Não foi possível cadastrar o usuário!');
                }
                break;

            case 'login':
                const [users] = await pool.query(
                    "SELECT * FROM tbl_cadastro WHERE login = ? AND senha = ?", // Comparação direta
                    [login, senha]
                );
                
                if (users.length === 1) {
                    res.json({
                        success: true,
                        message: 'Login bem-sucedido',
                        user: {
                            id: users[0].id,
                            nome: users[0].nome,
                            login: users[0].login,
                            imagem: users[0].imagem ? `/uploads/${users[0].imagem}` : null
                        }
                    });
                } else {
                    res.status(401).json({
                        success: false,
                        message: 'Credenciais inválidas'
                    });
                }
                break;

            case 'leitura':
                const [searchResults] = await pool.query(
                    "SELECT id, nome, login FROM tbl_cadastro WHERE nome LIKE ? OR login LIKE ?",
                    [`%${nome}%`, `%${login}%`]
                );
                
                if (searchResults.length > 0) {
                    res.json({ 
                        success: true,
                        message: 'Busca realizada com sucesso!',
                        results: searchResults
                    });
                } else {
                    throw new Error('Nenhum resultado encontrado!');
                }
                break;

            case 'atualizar':
                const [updateResult] = await pool.query(
                    "UPDATE tbl_cadastro SET nome = ?, login = ?, senha = ? WHERE id = ?",
                    [nome, login, senha, id]
                );
                
                if (updateResult.affectedRows > 0) {
                    res.json({ 
                        success: true,
                        message: 'Registro atualizado com sucesso!'
                    });
                } else {
                    throw new Error('Nenhum registro foi atualizado!');
                }
                break;

            default:
                throw new Error('Tipo de operação não reconhecido');
        }
    } catch (err) {
        // Se ocorrer erro e uma imagem foi enviada, remove o arquivo
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
        
        res.status(500).json({ 
            success: false,
            message: err.message || 'Erro no servidor'
        });
    }
});

// Servir arquivos estáticos da pasta uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});