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
        const uniqueFilename = uniqueSuffix + path.extname(file.originalname);
        // Armazena o nome original no request para uso posterior
        req.originalFilename = file.originalname; 
        cb(null, uniqueFilename);
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
    const imagem = req.file ? {
        filename: req.file.filename, // Nome único do arquivo
        originalname: req.originalFilename // Nome original do arquivo
    } : null;

    try {
        switch (tipo) {
            case 'cadastro':
                const [rows] = await pool.query(
                    "INSERT INTO tbl_cadastro (nome, login, senha, imagem_nome_unico, imagem_nome_original) VALUES (?, ?, ?, ?, ?)",
                    [nome, login, senha, imagem?.filename, imagem?.originalname]
                );
                
                if (rows.affectedRows > 0) {
                    res.json({ 
                        success: true,
                        message: 'Usuário cadastrado com sucesso!',
                        imagemUrl: imagem ? `/uploads/${imagem.filename}` : null,
                        imagemOriginal: imagem?.originalname
                    });
                } else {
                    throw new Error('Não foi possível cadastrar o usuário!');
                }
                break;

            case 'login':
                const [users] = await pool.query(
                    "SELECT * FROM tbl_cadastro WHERE login = ? AND senha = ?",
                    [login, senha]
                );
                
                if (users.length === 1) {
                    const user = users[0];
                    res.json({
                        success: true,
                        message: 'Login bem-sucedido',
                        user: {
                            id: user.id,
                            nome: user.nome,
                            login: user.login,
                            imagemUrl: user.imagem_nome_unico ? `/uploads/${user.imagem_nome_unico}` : null,
                            imagemOriginal: user.imagem_nome_original
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
                    "SELECT id, nome, login, imagem_nome_original FROM tbl_cadastro WHERE nome LIKE ? OR login LIKE ?",
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
                const updateFields = [];
                const updateValues = [];
                
                if (nome) {
                    updateFields.push('nome = ?');
                    updateValues.push(nome);
                }
                
                if (login) {
                    updateFields.push('login = ?');
                    updateValues.push(login);
                }
                
                if (senha) {
                    updateFields.push('senha = ?');
                    updateValues.push(senha);
                }
                
                if (req.file) {
                    updateFields.push('imagem_nome_unico = ?', 'imagem_nome_original = ?');
                    updateValues.push(req.file.filename, req.originalFilename);
                }
                
                if (updateFields.length === 0) {
                    throw new Error('Nenhum campo fornecido para atualização');
                }
                
                updateValues.push(id);
                
                const [updateResult] = await pool.query(
                    `UPDATE tbl_cadastro SET ${updateFields.join(', ')} WHERE id = ?`,
                    updateValues
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